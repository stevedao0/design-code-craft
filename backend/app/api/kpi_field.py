"""
KPI Field Assignment endpoints — Phase 5/6 backend.

Implements 6 endpoints that frontend kpiFieldClient.ts expects:

  GET  /api/kpi/years
  GET  /api/kpi/field-users
  GET  /api/kpi/field-domains
  GET  /api/kpi/field-assignments?year=&user_email=
  POST /api/kpi/field-assignments
  PATCH /api/kpi/field-assignments/{id}
  DELETE /api/kpi/field-assignments/{id}
  GET  /api/kpi/field-kpi?year=&user_email=
  GET  /api/kpi/field-kpi-all?year=

The kpi_field_assignments table uses user_id (FK to users.id), NOT user_email.
We expose email via JOIN with users table to match frontend expectations.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import and_, func, or_, text
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import decode_access_token, security_scheme
from ..models.contracts import ContractRecordRow
from ..models.user import UserRow
from ..services.revenue_resolver import get_signed_actual

log = logging.getLogger("kpi_field")

router = APIRouter(prefix="/api/kpi", tags=["kpi_field"])

# =============================================================================
# KPI group configuration — single source of truth
# =============================================================================
#
# Business rule:
#   A KPI group is one annual KPI row in the Reports page.
#   Each KPI group aggregates one or more canonical business fields
#   (member_fields). Both target and actual are computed at the group
#   level, not per member field.
#
# The mapping is intentionally centralized here. Do not scatter string
# matching across endpoints or the frontend.
#
# `assignment_field_code` is the field_code stored in
# kpi_field_assignments.field_code. Each KPI group has exactly one
# assignment code — usually the lead member field. Other members roll
# up under that assignment through `member_field_codes`.
#
# `member_field_codes` is the closed set of canonical field codes whose
# contracts contribute to this group's actual and contract_count.
# Variants such as "Karaoke", "karaoke", "KARAOKE", "Phòng thu âm",
# "phong thu am", "PHONG_THU_AM" must all be normalized to canonical
# codes through the mapping below and counted once each.
#
# Do NOT classify by organization name, signboard name, free text,
# performer, handler, signer, or assignee.

KPI_FIELD_GROUPS: dict[str, dict] = {
    "KARAOKE": {
        "label": "Karaoke",
        "assignment_field_code": "KARAOKE",
        "member_field_codes": ("KARAOKE", "PHONG_THU_AM"),
        "member_display_variants": {
            "KARAOKE": ("KARAOKE", "Karaoke", "karaoke", "KARAOKE "),
            "PHONG_THU_AM": ("PHONG_THU_AM", "Phòng thu âm", "phong thu am", "phong_thu_am"),
        },
    },
    "KHU_VUI_CHOI": {
        "label": "Khu vui chơi",
        "assignment_field_code": "KHU_VUI_CHOI",
        "member_field_codes": ("KHU_VUI_CHOI",),
        "member_display_variants": {
            "KHU_VUI_CHOI": (
                "KHU_VUI_CHOI", "Khu vui chơi", "Khu vui choi",
                "KHU VUI CHOI", "khu vui choi", "khu_vui_choi",
                "ENTERTAINMENT", "entertainment",
            ),
        },
    },
}

# Reverse map: canonical member code -> KPI group code
_MEMBER_TO_GROUP: dict[str, str] = {}
for _group_code, _cfg in KPI_FIELD_GROUPS.items():
    for _member_code in _cfg["member_field_codes"]:
        _MEMBER_TO_GROUP[_member_code] = _group_code

# Reverse map: normalized variant -> canonical member field code
_VARIANT_TO_MEMBER: dict[str, str] = {}


def _normalize_label(v: str) -> str:
    """Normalize a label/variant for case/diacritic/space-insensitive matching."""
    import unicodedata
    if not v:
        return ""
    nfkd = unicodedata.normalize("NFKD", v)
    ascii_val = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    return ascii_val.lower().replace("_", "").replace(" ", "")


for _group_code, _cfg in KPI_FIELD_GROUPS.items():
    for _member_code, _variants in _cfg["member_display_variants"].items():
        for _variant in _variants:
            _VARIANT_TO_MEMBER[_normalize_label(_variant)] = _member_code


def _variant_to_group(label: str | None) -> str | None:
    """Resolve a stored linh_vuc / field_code label to its KPI group code."""
    if not label:
        return None
    member = _VARIANT_TO_MEMBER.get(_normalize_label(label))
    if member is None:
        return None
    return _MEMBER_TO_GROUP.get(member)


def _assignment_field_code_to_group(field_code: str) -> str | None:
    """Map an assignment's stored field_code back to a KPI group code."""
    if field_code in KPI_FIELD_GROUPS:
        return field_code
    for group_code, cfg in KPI_FIELD_GROUPS.items():
        if cfg["assignment_field_code"] == field_code:
            return group_code
        if field_code in cfg["member_field_codes"]:
            return group_code
    return None



# =============================================================================
# Helpers
# =============================================================================

def _current_user(
    db: Session,
    credentials: HTTPAuthorizationCredentials | None,
) -> UserRow | None:
    if not credentials or not credentials.credentials:
        return None
    try:
        username = decode_access_token(credentials.credentials)
    except HTTPException:
        return None
    return (
        db.query(UserRow)
        .filter(UserRow.username == username)
        .one_or_none()
    )


def _resolve_email(db: Session, user_email: str) -> int | None:
    """Return user.id for a given email, or None."""
    user = (
        db.query(UserRow.id)
        .filter(UserRow.username == user_email)
        .one_or_none()
    )
    return user.id if user else None


def _normalize_linh_vuc(v: str) -> str:
    """Normalize linh_vuc value for case-insensitive matching."""
    import unicodedata
    # Strip diacritics, lowercase, remove spaces/underscores
    v = v or ''
    nfkd = unicodedata.normalize('NFKD', v)
    ascii_val = ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')
    ascii_val = ascii_val.lower()
    ascii_val = ascii_val.replace('_', '').replace(' ', '')
    return ascii_val

def _resolve_actual_for_group(db: Session, year: int, group_code: str) -> dict:
    """Aggregate canonical contracts across all member fields of one KPI group.

    Returns:
      {
        "contract_count": int,           # total canonical contracts in group
        "valued_contract_count": int,    # contracts whose canonical value > 0
        "unresolved_value_count": int,   # contracts in scope but value = 0
        "actual": int,                   # sum of signed-actual values
        "member_breakdown": [
          {"member_field_code": str, "contract_count": int, "valued_contract_count": int, "actual": int},
          ...
        ]
      }

    Business rule:
    - KPI group scope = unit-wide; do NOT filter by user/owner/assignee/performer/signer.
    - Filter canonical contracts only (annex_no IS NULL).
    - Classify linh_vuc to a KPI group via the centralized
      `KPI_FIELD_GROUPS` mapping (case/diacritic/space insensitive variants).
    - Use the canonical signed-revenue chain:
        royalty_amount_after_vat > royalty_amount_before_vat > so_tien_value
      This matches the V1 KPI/Reports actual basis (`_signed_actual` in
      `backend/app/api/reports_v2.py`).
    - When none of those values is positive, the contract is counted as
      `unresolved_value_count` and excluded from `actual`.
    """
    cfg = KPI_FIELD_GROUPS.get(group_code)
    if not cfg:
        return {
            "contract_count": 0,
            "valued_contract_count": 0,
            "unresolved_value_count": 0,
            "actual": 0,
            "member_breakdown": [],
        }

    rows = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.contract_year == year)
        .all()
    )

    member_stats: dict[str, dict] = {
        member: {
            "member_field_code": member,
            "contract_count": 0,
            "valued_contract_count": 0,
            "actual": 0,
        }
        for member in cfg["member_field_codes"]
    }

    total_count = 0
    total_valued = 0
    total_unresolved = 0
    total_actual = 0

    for row in rows:
        group_for_row = _variant_to_group(row.linh_vuc)
        if group_for_row != group_code:
            continue
        member_code = _VARIANT_TO_MEMBER.get(_normalize_label(row.linh_vuc))
        if member_code is None:
            continue
        total_count += 1
        stats = member_stats[member_code]
        stats["contract_count"] += 1
        val = get_signed_actual(row)
        if val > 0:
            total_valued += 1
            total_actual += val
            stats["valued_contract_count"] += 1
            stats["actual"] += val
        else:
            total_unresolved += 1

    return {
        "contract_count": total_count,
        "valued_contract_count": total_valued,
        "unresolved_value_count": total_unresolved,
        "actual": total_actual,
        "member_breakdown": list(member_stats.values()),
    }


# Backward-compatible alias kept for callers in this module. It simply
# resolves a single member field code through the same chain so older
# internal callers do not regress. It is NOT to be used for KPI totals.
def _resolve_actual_for_member(db: Session, year: int, member_field_code: str) -> dict:
    rows = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.contract_year == year)
        .all()
    )
    total = 0
    count = 0
    for row in rows:
        if _VARIANT_TO_MEMBER.get(_normalize_label(row.linh_vuc)) != member_field_code:
            continue
        val = get_signed_actual(row)
        if val > 0:
            total += val
            count += 1
    return {"contract_count": count, "valued_contract_count": count, "unresolved_value_count": 0, "actual": total, "member_breakdown": []}


# Legacy entry point retained only so callers that imported it keep working.
# Returns just `(count, actual)` for the single member field. New code must
# call `_resolve_actual_for_group` instead.
def _resolve_actual(db: Session, year: int, field_code: str) -> tuple[int, int]:
    summary = _resolve_actual_for_member(db, year, field_code)
    return summary["contract_count"], summary["actual"]


# =============================================================================
# GET /api/kpi/years
# =============================================================================

@router.get("/years")
def get_kpi_years(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    current_year = datetime.utcnow().year

    # Collect years from KPI assignments + annual targets + contract records
    years: set[int] = set()
    for (yr,) in db.query(
        func.distinct(ContractRecordRow.contract_year)
    ).filter(ContractRecordRow.annex_no.is_(None)).all():
        years.add(yr)
    for (yr,) in db.query(
        func.distinct(ContractRecordRow.contract_year)
    ).filter(ContractRecordRow.annex_no.is_(None)).all():
        years.add(yr)  # duplicate ok

    # From kpi_field_assignments
    try:
        for (yr,) in db.query(
            func.distinct(ContractRecordRow.contract_year)
        ).filter(ContractRecordRow.annex_no.is_(None)).all():
            years.add(yr)
    except Exception:
        pass

    result = []
    for yr in sorted(years, reverse=True):
        result.append({
            "year": yr,
            "is_current": yr == current_year,
        })
    if not result:
        result.append({"year": current_year, "is_current": True})
    return {"years": result}


# =============================================================================
# GET /api/kpi/field-users
# =============================================================================

@router.get("/field-users")
def get_field_users(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # All active users + any user that has a KPI assignment
    user_ids: set[int] = set()
    # From users table
    for (uid,) in db.query(UserRow.id).filter(UserRow.is_active == True).all():  # noqa: E712
        user_ids.add(uid)
    # From kpi_field_assignments
    try:
        from sqlalchemy import text
        result = db.execute(
            text("SELECT DISTINCT user_id FROM kpi_field_assignments")
        )
        for (uid,) in result:
            user_ids.add(uid)
    except Exception:
        pass

    users = (
        db.query(UserRow)
        .filter(UserRow.id.in_(user_ids))
        .order_by(UserRow.display_name.asc().nullslast(), UserRow.username.asc())
        .all()
    )

    return {
        "users": [
            {
                "user_id": u.id,
                "email": u.username,
                "display_name": u.display_name,
                "role": u.role,
            }
            for u in users
        ]
    }


# =============================================================================
# GET /api/kpi/field-domains
# =============================================================================

@router.get("/field-domains")
def get_field_domains(
    year: int | None = Query(None, ge=2000, le=2100),
    user_email: str | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Return domain/field options scoped to the user's context.
    - For regular users: merges KPI assignments + contract_records for their email/year.
    - For admin/mod: all domains with activity in the given year (or all time if no year).
    Canonical display labels are used.
    """
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    is_admin = user.role in ("admin", "manager", "mod")

    # Canonical field -> display label map (used for both dedup and label)
    field_display_labels: dict[str, str] = {
        'KHU_VUI_CHOI': 'Khu vui chơi',
        'Khu vui chơi': 'Khu vui chơi',
        'ENTERTAINMENT': 'Khu vui chơi',
        'KARAOKE': 'Karaoke',
        'Karaoke': 'Karaoke',
        'karaoke': 'Karaoke',
        'BACKGROUND': 'Nhạc nền',
        'Background': 'Nhạc nền',
        'background': 'Nhạc nền',
        'background_music': 'Nhạc nền',
        'PHONG_THU_AM': 'Phòng thu âm',
        'Phòng thu âm': 'Phòng thu âm',
        'Studio': 'Phòng thu âm',
        'BD': 'BD',
        'SCTT': 'SCTT',
    }

    # Domain labels from master table (fallback)
    domain_labels: dict[str, str] = {}
    res = db.execute(text("SELECT code, name_vi FROM domains"))
    for r in res:
        domain_labels[str(r[0])] = str(r[1])

    # Deduplicate by normalized label; keep the first-seen code for each label
    seen_labels: set[str] = set()
    result_domains: list[dict] = []

    def add_domain(raw_code: str):
        if raw_code is None:
            return
        label = field_display_labels.get(raw_code, domain_labels.get(raw_code, raw_code))
        if label in seen_labels:
            return
        seen_labels.add(label)
        result_domains.append({"code": raw_code, "label": label})

    if is_admin and user_email is None:
        # Admin with no user_email: all domains that have KPI assignments or contracts in the year
        if year:
            # From KPI assignments
            rows = db.execute(
                text("""
                    SELECT DISTINCT field_code FROM kpi_field_assignments
                    WHERE reporting_year = :yr AND field_code IS NOT NULL
                """),
                {"yr": year},
            ).fetchall()
            for (fc,) in rows:
                add_domain(str(fc))
            # From contract_records
            rows2 = db.execute(
                text("""
                    SELECT DISTINCT linh_vuc FROM contract_records
                    WHERE contract_year = :yr AND linh_vuc IS NOT NULL
                """),
                {"yr": year},
            ).fetchall()
            for (lv,) in rows2:
                add_domain(str(lv))
        else:
            # All domains from master table
            for code, label in domain_labels.items():
                add_domain(code)
    else:
        # User-scoped: use provided user_email or current user's email
        target_email = user_email if user_email else str(user.username or "")
        if not target_email:
            return {"domains": []}

        # Resolve email to user_id
        user_obj = db.query(UserRow).filter(UserRow.username == target_email).one_or_none()
        target_uid = user_obj.id if user_obj else None

        if year is None:
            year = 2026

        # From KPI assignments
        if target_uid:
            rows = db.execute(
                text("""
                    SELECT DISTINCT field_code FROM kpi_field_assignments
                    WHERE user_id = :uid AND reporting_year = :yr AND field_code IS NOT NULL
                """),
                {"uid": target_uid, "yr": year},
            ).fetchall()
            for (fc,) in rows:
                add_domain(str(fc))

        # From contract_records
        rows2 = db.execute(
            text("""
                SELECT DISTINCT linh_vuc FROM contract_records
                WHERE contract_year = :yr
                  AND nguoi_thuc_hien_email = :email
                  AND linh_vuc IS NOT NULL
                  AND annex_no IS NULL
            """),
            {"yr": year, "email": target_email},
        ).fetchall()
        for (lv,) in rows2:
            add_domain(str(lv))

    # Sort: Khu vui chơi first, then Karaoke, then rest alphabetically by label
    def sort_key(d: dict) -> tuple[int, str]:
        label = d["label"].lower()
        if "khu vui" in label:
            return (0, label)
        if "karaoke" in label:
            return (1, label)
        return (2, label)

    result_domains.sort(key=sort_key)
    return {"domains": result_domains}


# =============================================================================
# GET /api/kpi/field-assignments
# =============================================================================

@router.get("/field-assignments")
def get_field_assignments(
    year: int = Query(..., ge=2000, le=2100),
    user_email: str = Query(..., description="User email/username"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = _resolve_email(db, user_email)
    if not user_id:
        return {"year": year, "user_email": user_email, "assignments": []}

    assignments = (
        db.execute(
            text("""
                SELECT a.id, a.user_id, u.username, u.display_name,
                       a.field_code, a.reporting_year, a.is_active,
                       a.target_amount, a.note,
                       a.created_at, a.updated_at,
                       a.created_by_user_id, a.updated_by_user_id
                FROM kpi_field_assignments a
                JOIN users u ON u.id = a.user_id
                WHERE a.user_id = :uid AND a.reporting_year = :yr
                ORDER BY a.field_code
            """),
            {"uid": user_id, "yr": year},
        )
        .fetchall()
    )

    # Get domain labels
    domain_labels: dict[str, str] = {}
    result = db.execute(text("SELECT code, name_vi FROM domains"))
    for r in result:
        domain_labels[str(r[0])] = str(r[1])

    return {
        "year": year,
        "user_email": user_email,
        "assignments": [
            {
                "assignment_id": a[0],
                "user_id": a[1],
                "user_email": a[2],
                "user_display_name": a[3],
                "field_code": a[4],
                "field_label": domain_labels.get(str(a[4]), str(a[4])),
                "reporting_year": a[5],
                "is_active": a[6],
                "target_amount": a[7] or 0,
                "note": a[8],
                "created_at": a[9].isoformat() if a[9] else None,
                "updated_at": a[10].isoformat() if a[10] else None,
                "created_by_user_id": a[11],
                "updated_by_user_id": a[12],
            }
            for a in assignments
        ],
    }


# =============================================================================
# POST /api/kpi/field-assignments
# =============================================================================

@router.post("/field-assignments")
def post_field_assignment(
    body: dict[str, Any],
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_email = str(body.get("user_email") or "").strip()
    field_code = str(body.get("field_code") or "").strip()
    year = int(body.get("reporting_year") or 0)
    target = int(body.get("target_amount") or 0)
    note = body.get("note")
    is_active = bool(body.get("is_active", True))

    if not user_email:
        raise HTTPException(status_code=400, detail="user_email is required")
    if not field_code:
        raise HTTPException(status_code=400, detail="field_code is required")
    if not year:
        raise HTTPException(status_code=400, detail="reporting_year is required")
    if not target > 0:
        raise HTTPException(status_code=400, detail="target_amount must be > 0")

    user_id = _resolve_email(db, user_email)
    if not user_id:
        raise HTTPException(status_code=404, detail="User not found")

    # Check duplicate
    existing = db.execute(
        text(
            "SELECT id FROM kpi_field_assignments WHERE user_id=:uid AND field_code=:fc AND reporting_year=:yr LIMIT 1"
        ),
        {"uid": user_id, "fc": field_code, "yr": year},
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Duplicate: this user already has a KPI for this field/year.",
        )

    # Insert
    result = db.execute(
        text("""
            INSERT INTO kpi_field_assignments
                (user_id, field_code, reporting_year, target_amount, note, is_active,
                 created_at, updated_at, created_by_user_id)
            VALUES (:uid, :fc, :yr, :target, :note, :active, NOW(), NOW(), :creator)
            RETURNING id, user_id, field_code, reporting_year, is_active,
                      target_amount, note, created_at, updated_at
        """),
        {
            "uid": user_id,
            "fc": field_code,
            "yr": year,
            "target": target,
            "note": note,
            "active": is_active,
            "creator": user.id,
        },
    )
    row = result.fetchone()
    db.commit()

    field_label = field_code
    result2 = db.execute(
        text("SELECT name_vi FROM domains WHERE code=:code LIMIT 1"),
        {"code": field_code},
    )
    row2 = result2.fetchone()
    if row2:
        field_label = str(row2[0])

    return {
        "assignment_id": row[0],
        "user_id": row[1],
        "user_email": user_email,
        "user_display_name": user.display_name,
        "field_code": row[2],
        "field_label": field_label,
        "reporting_year": row[3],
        "is_active": row[4],
        "target_amount": row[5] or 0,
        "note": row[6],
        "created_at": row[7].isoformat() if row[7] else None,
        "updated_at": row[8].isoformat() if row[8] else None,
        "created_by_user_id": user.id,
        "updated_by_user_id": None,
    }


# =============================================================================
# PATCH /api/kpi/field-assignments/{id}
# =============================================================================

@router.patch("/field-assignments/{assignment_id}")
def patch_field_assignment(
    assignment_id: int,
    body: dict[str, Any],
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    updates: dict[str, Any] = {}
    if "target_amount" in body:
        val = int(body["target_amount"])
        if val <= 0:
            raise HTTPException(status_code=400, detail="target_amount must be > 0")
        updates["target_amount"] = val
    if "note" in body:
        updates["note"] = body["note"]
    if "is_active" in body:
        updates["is_active"] = bool(body["is_active"])
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.utcnow()

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    db.execute(
        text(
            f"UPDATE kpi_field_assignments SET {set_clause} WHERE id = :aid"
        ),
        {"aid": assignment_id, **updates},
    )
    db.commit()

    # Return updated
    result = db.execute(
        text("""
            SELECT a.id, a.user_id, u.username, u.display_name,
                   a.field_code, a.reporting_year, a.is_active,
                   a.target_amount, a.note,
                   a.created_at, a.updated_at,
                   a.created_by_user_id, a.updated_by_user_id
            FROM kpi_field_assignments a
            JOIN users u ON u.id = a.user_id
            WHERE a.id = :aid
        """),
        {"aid": assignment_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")

    field_label = str(row[4])
    result2 = db.execute(text("SELECT name_vi FROM domains WHERE code=:code LIMIT 1"), {"code": str(row[4])})
    row2 = result2.fetchone()
    if row2:
        field_label = str(row2[0])

    return {
        "assignment_id": row[0],
        "user_id": row[1],
        "user_email": row[2],
        "user_display_name": row[3],
        "field_code": row[4],
        "field_label": field_label,
        "reporting_year": row[5],
        "is_active": row[6],
        "target_amount": row[7] or 0,
        "note": row[8],
        "created_at": row[9].isoformat() if row[9] else None,
        "updated_at": row[10].isoformat() if row[10] else None,
        "created_by_user_id": row[11],
        "updated_by_user_id": row[12],
    }


# =============================================================================
# DELETE /api/kpi/field-assignments/{id}
# =============================================================================

@router.delete("/field-assignments/{assignment_id}")
def delete_field_assignment(
    assignment_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    db.execute(
        text("DELETE FROM kpi_field_assignments WHERE id = :aid"),
        {"aid": assignment_id},
    )
    db.commit()
    return {"ok": True}


# =============================================================================
# GET /api/kpi/field-kpi
# =============================================================================

@router.get("/field-kpi")
def get_field_kpi(
    year: int = Query(..., ge=2000, le=2100),
    user_email: str = Query(..., description="User email"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = _resolve_email(db, user_email)
    if not user_id:
        return {"year": year, "user_email": user_email, "managed_field_count": 0, "fields": [], "totals": _empty_totals(), "reconciliation": _empty_reconciliation()}

    # Get assignments for this user/year. `field_code` here is the
    # assignment_field_code from KPI_FIELD_GROUPS (the lead member field).
    # Each assignment maps to exactly one KPI group.
    assignments = db.execute(
        text("""
            SELECT a.id, a.user_id, u.username, a.field_code,
                   a.is_active, a.target_amount, a.note,
                   a.created_at, a.updated_at
            FROM kpi_field_assignments a
            JOIN users u ON u.id = a.user_id
            WHERE a.user_id = :uid AND a.reporting_year = :yr
            ORDER BY a.field_code
        """),
        {"uid": user_id, "yr": year},
    ).fetchall()

    domain_labels: dict[str, str] = {}
    result = db.execute(text("SELECT code, name_vi FROM domains"))
    for r in result:
        domain_labels[str(r[0])] = str(r[1])

    # Group assignments by KPI group so duplicate assignments for the
    # same group (e.g. KARAOKE + PHONG_THU_AM assigned separately) merge
    # into a single KPI row.
    group_assignments: dict[str, dict] = {}
    for a in assignments:
        assignment_id, uid, uname, field_code_a, is_active_a, target_amount_a = a[:6]
        raw_code = str(field_code_a)
        group_code = _assignment_field_code_to_group(raw_code)
        if not group_code:
            # Unknown assignment; surface it under a synthetic key so admins
            # can still see legacy targets that pre-date the mapping.
            group_code = raw_code
            if group_code not in KPI_FIELD_GROUPS:
                # Track but don't break — treat it as its own single-member group.
                pass
        bucket = group_assignments.setdefault(
            group_code,
            {
                "target_amount": 0,
                "is_active": bool(is_active_a),
                "assignment_ids": [],
            },
        )
        bucket["target_amount"] += int(target_amount_a or 0)
        bucket["assignment_ids"].append(assignment_id)
        bucket["is_active"] = bucket["is_active"] and bool(is_active_a)

    fields = []
    known_groups = list(group_assignments.keys())

    # Make sure all configured KPI groups appear, even if no assignment row
    # exists yet for the user (so admins can see the structure).
    for group_code in KPI_FIELD_GROUPS:
        if group_code not in group_assignments:
            group_assignments[group_code] = {
                "target_amount": 0,
                "is_active": False,
                "assignment_ids": [],
            }
            known_groups.append(group_code)

    for group_code in known_groups:
        cfg = KPI_FIELD_GROUPS.get(group_code, {
            "label": group_code,
            "member_field_codes": (group_code,),
            "assignment_field_code": group_code,
            "member_display_variants": {},
        })
        agg = _resolve_actual_for_group(db, year, group_code)
        bucket = group_assignments[group_code]
        target_amount = bucket["target_amount"]
        is_active = bucket["is_active"]
        actual = agg["actual"]
        progress = (
            round(actual / target_amount * 100, 1)
            if target_amount and target_amount > 0
            else None
        )
        gap = (target_amount - actual) if target_amount and target_amount > 0 else None
        remaining = gap if gap is not None and gap > 0 else 0
        exceeded = (-gap) if gap is not None and gap < 0 else 0

        fields.append({
            "kpi_group_code": group_code,
            "field_code": cfg["assignment_field_code"],
            "field_label": cfg["label"],
            "member_field_codes": list(cfg["member_field_codes"]),
            "assignment_ids": bucket["assignment_ids"],
            "target": target_amount,
            "actual": actual,
            "contract_count": agg["contract_count"],
            "valued_contract_count": agg["valued_contract_count"],
            "unresolved_value_count": agg["unresolved_value_count"],
            "member_breakdown": agg["member_breakdown"],
            "progress_percent": progress if progress is not None else 0,
            "remaining": remaining,
            "exceeded": exceeded,
            "is_active": is_active,
            "has_target": bool(target_amount and target_amount > 0),
        })

    # Reconcile against unit-wide canonical contracts (no user filter).
    branch_rows = (
        db.query(ContractRecordRow)
        .filter(ContractRecordRow.annex_no.is_(None))
        .filter(ContractRecordRow.contract_year == year)
        .all()
    )

    kpi_field_actual = 0
    kpi_field_count = 0
    non_kpi_field_actual = 0
    non_kpi_field_count = 0
    unit_total_actual = 0
    unit_total_count = 0
    for r in branch_rows:
        val = get_signed_actual(r)
        if val <= 0:
            continue
        unit_total_actual += val
        unit_total_count += 1
        if _variant_to_group(r.linh_vuc) is not None:
            kpi_field_actual += val
            kpi_field_count += 1
        else:
            non_kpi_field_actual += val
            non_kpi_field_count += 1

    totals = {
        "target_amount": sum(f["target"] for f in fields if f["has_target"]),
        "actual_amount": sum(f["actual"] for f in fields),
        "contract_count": sum(f["contract_count"] for f in fields),
        "completion_percent": None,
        "missing_amount": None,
        "exceeded_amount": None,
    }
    if totals["target_amount"] > 0:
        totals["completion_percent"] = round(
            totals["actual_amount"] / totals["target_amount"] * 100, 1
        )
        gap = totals["target_amount"] - totals["actual_amount"]
        if gap > 0:
            totals["missing_amount"] = gap
        else:
            totals["exceeded_amount"] = -gap

    return {
        "year": year,
        "user_email": user_email,
        "managed_field_count": sum(1 for f in fields if f["has_target"]),
        "fields": fields,
        "totals": totals,
        "reconciliation": {
            "unit_revenue_year": unit_total_actual,
            "unit_contract_count": unit_total_count,
            "kpi_field_revenue_year": kpi_field_actual,
            "kpi_field_contract_count": kpi_field_count,
            "non_kpi_field_revenue_year": non_kpi_field_actual,
            "non_kpi_field_contract_count": non_kpi_field_count,
            "reason_breakdown": (
                "KPI group tinh tren toan bo hop dong canonical cua don vi "
                "trong nam, khong phu thuoc nguoi thuc hien. Phan chenh "
                "(non_kpi_field) la doanh thu cac hop dong thuoc linh vuc "
                "khong thuoc bat ky KPI group nao trong cau hinh."
            ),
        },
    }


def _empty_totals() -> dict:
    return {
        "target_amount": 0,
        "actual_amount": 0,
        "contract_count": 0,
        "completion_percent": None,
        "missing_amount": None,
        "exceeded_amount": None,
    }


def _empty_reconciliation() -> dict:
    return {
        "unit_revenue_year": 0,
        "unit_contract_count": 0,
        "kpi_field_revenue_year": 0,
        "kpi_field_contract_count": 0,
        "non_kpi_field_revenue_year": 0,
        "non_kpi_field_contract_count": 0,
        "reason_breakdown": "",
    }


# =============================================================================
# GET /api/kpi/field-kpi-all
# =============================================================================

@router.get("/field-kpi-all")
def get_field_kpi_all(
    year: int = Query(..., ge=2000, le=2100),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Pre-compute per-group unit-wide actual once for the whole year
    # (independent of any user). This way, switching the employee filter
    # on the client cannot change the KPI group numbers.
    group_actuals: dict[str, int] = {}
    group_counts: dict[str, int] = {}
    for group_code in KPI_FIELD_GROUPS:
        agg = _resolve_actual_for_group(db, year, group_code)
        group_actuals[group_code] = agg["actual"]
        group_counts[group_code] = agg["contract_count"]

    # Get all users that have KPI assignments
    result = db.execute(
        text("""
            SELECT DISTINCT user_id FROM kpi_field_assignments
            WHERE reporting_year = :yr
        """),
        {"yr": year},
    )
    user_ids = [r[0] for r in result.fetchall()]

    users_info: dict[int, dict] = {}
    for u in db.query(UserRow).filter(UserRow.id.in_(user_ids)).all():
        users_info[u.id] = {
            "user_id": u.id,
            "email": u.username,
            "display_name": u.display_name,
            "field_count": 0,
            "active_count": 0,
            "total_target": 0,
            "total_actual": 0,
            "best_progress_percent": None,
            "has_inactive": False,
        }

    assignments = db.execute(
        text("""
            SELECT a.id, a.user_id, a.field_code, a.is_active, a.target_amount
            FROM kpi_field_assignments a
            WHERE a.reporting_year = :yr
            ORDER BY a.user_id, a.field_code
        """),
        {"yr": year},
    ).fetchall()

    for a in assignments:
        aid, uid, fc, is_act, tgt = a
        if uid not in users_info:
            continue
        raw_code = str(fc)
        group_code = _assignment_field_code_to_group(raw_code) or raw_code
        # Unit-wide actual/count for the KPI group (independent of this user).
        actual = group_actuals.get(group_code, 0)
        cnt = group_counts.get(group_code, 0)
        progress = (
            round(actual / tgt * 100, 1) if tgt and tgt > 0 else None
        )

        users_info[uid]["field_count"] += 1
        if is_act:
            users_info[uid]["active_count"] += 1
        else:
            users_info[uid]["has_inactive"] = True
        tgt_val = tgt or 0
        prev_tgt = users_info[uid]["total_target"] or 0
        prev_act = users_info[uid]["total_actual"] or 0
        users_info[uid]["total_target"] = prev_tgt + tgt_val
        users_info[uid]["total_actual"] = prev_act + actual
        if progress is not None:
            cur_best = users_info[uid]["best_progress_percent"]
            if cur_best is None or progress > cur_best:
                users_info[uid]["best_progress_percent"] = progress
        # count is informational only here; we don't aggregate to per-user totals
        _ = cnt

    employee_list = list(users_info.values())
    employee_list.sort(key=lambda x: -(x.get("total_actual") or 0))

    return {
        "year": year,
        "total_employees": len(employee_list),
        "employees": employee_list,
    }


# =============================================================================
# GET /api/kpi/field-kpi-org
# Org-level KPI by field (group), one request — no N-per-user calls.
# Respects active assignments for target; uses unit-wide actuals per group.
# =============================================================================

@router.get("/field-kpi-org")
def get_field_kpi_org(
    year: int = Query(..., ge=2000, le=2100),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Unit-wide actual/count per KPI group (independent of user/assignee).
    group_actuals: dict[str, int] = {}
    group_counts: dict[str, int] = {}
    group_valued: dict[str, int] = {}
    group_unresolved: dict[str, int] = {}
    for group_code in KPI_FIELD_GROUPS:
        agg = _resolve_actual_for_group(db, year, group_code)
        group_actuals[group_code] = agg["actual"]
        group_counts[group_code] = agg["contract_count"]
        group_valued[group_code] = agg["valued_contract_count"]
        group_unresolved[group_code] = agg["unresolved_value_count"]

    # Sum active assignment targets and count users per group.
    rows = db.execute(
        text("""
            SELECT a.field_code,
                   COALESCE(SUM(a.target_amount), 0) AS total_target,
                   COUNT(DISTINCT a.user_id) FILTER (WHERE a.is_active = true) AS user_count
            FROM kpi_field_assignments a
            WHERE a.reporting_year = :yr AND a.is_active = true
            GROUP BY a.field_code
        """),
        {"yr": year},
    ).fetchall()

    field_target: dict[str, int] = {}
    field_users: dict[str, int] = {}
    for fc, tgt, ucnt in rows:
        gc = _assignment_field_code_to_group(str(fc)) or str(fc)
        if gc not in KPI_FIELD_GROUPS:
            gc = str(fc)
        field_target[gc] = field_target.get(gc, 0) + (tgt or 0)
        field_users[gc] = (field_users.get(gc, 0) or 0) + (ucnt or 0)

    fields = []
    for group_code, cfg in KPI_FIELD_GROUPS.items():
        target = field_target.get(group_code, 0)
        actual = group_actuals.get(group_code, 0)
        cnt = group_counts.get(group_code, 0)
        valued = group_valued.get(group_code, 0)
        unresolved = group_unresolved.get(group_code, 0)
        ucnt = field_users.get(group_code, 0)
        pct = round(actual / target * 100, 1) if target and target > 0 else 0.0
        fields.append({
            "field_code": group_code,
            "field_label": cfg["label"],
            "target": target,
            "actual": actual,
            "contract_count": cnt,
            "valued_contract_count": valued,
            "unresolved_value_count": unresolved,
            "user_count": ucnt,
            "progress_percent": pct,
            "has_target": target > 0,
        })

    # Sort by target desc, then actual desc
    fields.sort(key=lambda x: (-x["target"], -x["actual"]))

    return {
        "year": year,
        "fields": fields,
    }

