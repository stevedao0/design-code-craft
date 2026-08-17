"""
KPI Target & Assignment CRUD endpoints — Phase 1.4.

Endpoints:
  GET    /api/kpi-v2/groups                       list KPI groups
  GET    /api/kpi-v2/targets?year=YYYY            list group targets
  PUT    /api/kpi-v2/targets                       upsert target for a group
  DELETE /api/kpi-v2/targets/{group_code}          deactivate target
  GET    /api/kpi-v2/assignments?year=YYYY&user_email=
  POST   /api/kpi-v2/assignments                   assign user → group
  PATCH  /api/kpi-v2/assignments/{id}              toggle active / change group
  DELETE /api/kpi-v2/assignments/{id}
  GET    /api/kpi-v2/snapshot?year=YYYY            unit-wide snapshot (Admin)
  GET    /api/kpi-v2/snapshot?year=YYYY&user_email=X  user-scoped snapshot

Permission policy:
- Any authenticated user can READ.
- WRITE to /targets and /assignments requires role in (admin, manager).
- WRITE to one's own assignment is always allowed (assign / unassign self).
- Targets and assignments are kept in sync (FK constraints); deactivating
  a target does NOT cascade-delete existing assignments.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import (
    decode_access_token,
    get_user_permissions,
    security_scheme,
)
from ..models.user import UserRow
from ..services.domain_registry import (
    canonicalize_domain,
    get_kpi_group_for_domain,
    kpi_groups,
    label_for_kpi_group,
)
from ..services.kpi_snapshot_service import (
    get_unit_year_snapshot,
    get_user_year_snapshot,
)

router = APIRouter(prefix="/api/kpi-v2", tags=["kpi_v2"])

# ---------------------------------------------------------------------------
# Permission policy
#
# READ /snapshot, /targets, /assignments
#   - Any authenticated user with `kpi.view`.
#
# MUTATE targets (PUT, DELETE targets)
#   - Requires `kpi.manage`. Staff can NEVER self-allocate a target.
#
# MUTATE assignments (POST, PATCH, DELETE assignments)
#   - Requires `kpi.manage` for any change to other users.
#   - A user may request assignment for THEMSELVES only when the request
#     does NOT also set a target (target mutation is always admin-gated).
#
# Role-based fallbacks are intentionally avoided. Permission checks use
# the same `get_user_permissions` table as the rest of the app.
# ---------------------------------------------------------------------------


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


def _require_kpi_view(user: UserRow, db: Session) -> None:
    perms = get_user_permissions(db, user)
    if "kpi.view" not in perms:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: yêu cầu quyền kpi.view để đọc KPI.",
        )


def _require_kpi_manage(user: UserRow, db: Session) -> None:
    """Target & cross-user assignment mutations require ``kpi.manage``."""
    perms = get_user_permissions(db, user)
    if "kpi.manage" not in perms:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: yêu cầu quyền kpi.manage để chỉnh target/assignment.",
        )


def _can_view_other_user(user: UserRow, db: Session, target_email: str) -> bool:
    """A user may view another user's KPI only with ``kpi.manage``."""
    if (target_email or "").strip().lower() == (user.username or "").strip().lower():
        return True
    perms = get_user_permissions(db, user)
    return "kpi.manage" in perms


def _resolve_email(db: Session, user_email: str) -> int | None:
    if not user_email:
        return None
    u = db.query(UserRow).filter(UserRow.username == user_email).one_or_none()
    return u.id if u else None


# ─── KPI group catalog ──────────────────────────────────────────────────────

@router.get("/groups")
def list_groups(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    _require_kpi_view(user, db)
    return {
        "groups": [
            {
                "code": g.code,
                "label": label_for_kpi_group(g.code) or g.code,
                "member_domain_codes": list(g.member_domain_codes),
                "sort_order": g.sort_order,
            }
            for g in kpi_groups()
        ],
    }


# ─── Targets CRUD ───────────────────────────────────────────────────────────

@router.get("/targets")
def list_targets(
    year: int = Query(..., ge=2000, le=2100),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    _require_kpi_view(user, db)
    rows = db.execute(
        text("""
            SELECT t.id, t.reporting_year, t.kpi_group_code,
                   t.target_amount_before_tax, t.note, t.is_active,
                   t.created_at, t.updated_at
            FROM kpi_group_targets t
            WHERE t.reporting_year = :yr
            ORDER BY t.kpi_group_code
        """),
        {"yr": year},
    ).fetchall()
    return {
        "year": year,
        "targets": [
            {
                "id": r[0],
                "reporting_year": int(r[1]),
                "kpi_group_code": str(r[2]),
                "field_label": label_for_kpi_group(str(r[2])) or str(r[2]),
                "target_amount_before_tax": int(r[3] or 0),
                "note": r[4],
                "is_active": bool(r[5]),
                "created_at": r[6].isoformat() if r[6] else None,
                "updated_at": r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ],
    }


@router.put("/targets")
def upsert_target(
    body: dict[str, Any],
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    _require_kpi_manage(user, db)

    year = int(body.get("reporting_year") or 0)
    grp = str(body.get("kpi_group_code") or "").strip().upper()
    target = int(body.get("target_amount_before_tax") or 0)
    note = body.get("note")

    if not year:
        raise HTTPException(status_code=400, detail="reporting_year required")
    if grp not in {g.code for g in kpi_groups()}:
        raise HTTPException(
            status_code=400,
            detail=f"kpi_group_code must be one of "
                   f"{sorted(g.code for g in kpi_groups())}",
        )
    if target < 0:
        raise HTTPException(status_code=400, detail="target must be >= 0")

    # Upsert: only one row per (year, group). is_active=True.
    row = db.execute(
        text("""
            SELECT id FROM kpi_group_targets
            WHERE reporting_year = :yr AND kpi_group_code = :gc
        """),
        {"yr": year, "gc": grp},
    ).fetchone()
    if row:
        db.execute(
            text("""
                UPDATE kpi_group_targets
                SET target_amount_before_tax = :amt,
                    note = :note,
                    is_active = TRUE,
                    updated_by_user_id = :uid,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"amt": target, "note": note, "uid": user.id, "id": row[0]},
        )
        out_id = row[0]
    else:
        out = db.execute(
            text("""
                INSERT INTO kpi_group_targets
                    (reporting_year, kpi_group_code, target_amount_before_tax,
                     note, is_active, created_by_user_id, updated_by_user_id)
                VALUES (:yr, :gc, :amt, :note, TRUE, :uid, :uid)
                RETURNING id
            """),
            {"yr": year, "gc": grp, "amt": target, "note": note, "uid": user.id},
        ).fetchone()
        out_id = out[0]
    db.commit()
    return {"id": out_id, "reporting_year": year, "kpi_group_code": grp, "target_amount_before_tax": target, "is_active": True}


@router.delete("/targets/{group_code}")
def deactivate_target(
    group_code: str,
    year: int = Query(..., ge=2000, le=2100),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    _require_kpi_manage(user, db)
    grp = (group_code or "").strip().upper()
    if grp not in {g.code for g in kpi_groups()}:
        raise HTTPException(status_code=400, detail="unknown kpi_group_code")
    db.execute(
        text("""
            UPDATE kpi_group_targets
            SET is_active = FALSE, updated_by_user_id = :uid, updated_at = NOW()
            WHERE reporting_year = :yr AND kpi_group_code = :gc
        """),
        {"uid": user.id, "yr": year, "gc": grp},
    )
    db.commit()
    return {"ok": True}


# ─── Assignments CRUD ──────────────────────────────────────────────────────

@router.get("/assignments")
def list_assignments(
    year: int = Query(..., ge=2000, le=2100),
    user_email: str | None = Query(None, description="filter by user email"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    _require_kpi_view(user, db)

    # Staff can only list their own assignments; admin/manager can list
    # all assignments or filter to any user.
    if user_email and not _can_view_other_user(user, db, user_email):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: chỉ kpi.manage mới được đọc assignment của user khác.",
        )
    if not user_email:
        user_email = user.username

    params: dict[str, Any] = {"yr": year}
    where = "WHERE a.reporting_year = :yr"
    uid = _resolve_email(db, user_email)
    if uid is None:
        return {"year": year, "user_email": user_email, "assignments": []}
    where += " AND a.user_id = :uid"
    params["uid"] = uid

    rows = db.execute(
        text(f"""
            SELECT a.id, a.user_id, u.username, u.display_name,
                   a.kpi_group_code, a.is_active,
                   a.created_at, a.updated_at
            FROM kpi_group_assignments a
            JOIN users u ON u.id = a.user_id
            {where}
            ORDER BY u.username, a.kpi_group_code
        """),
        params,
    ).fetchall()
    return {
        "year": year,
        "user_email": user_email,
        "assignments": [
            {
                "id": r[0],
                "user_id": r[1],
                "user_email": r[2],
                "user_display_name": r[3],
                "kpi_group_code": str(r[4]),
                "field_label": label_for_kpi_group(str(r[4])) or str(r[4]),
                "is_active": bool(r[5]),
                "created_at": r[6].isoformat() if r[6] else None,
                "updated_at": r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ],
    }


@router.post("/assignments")
def create_assignment(
    body: dict[str, Any],
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    target_user_email = str(body.get("user_email") or "").strip()
    year = int(body.get("reporting_year") or 0)
    grp = str(body.get("kpi_group_code") or "").strip().upper()
    is_active = bool(body.get("is_active", True))

    if not target_user_email or not year or not grp:
        raise HTTPException(status_code=400, detail="user_email, reporting_year, kpi_group_code required")
    if grp not in {g.code for g in kpi_groups()}:
        raise HTTPException(status_code=400, detail="unknown kpi_group_code")

    target_uid = _resolve_email(db, target_user_email)
    if target_uid is None:
        raise HTTPException(status_code=404, detail=f"user {target_user_email} not found")

    # Assignment rules:
    #   - Self-assign is allowed (with kpi.view), even without kpi.manage.
    #   - Assigning ANY other user requires kpi.manage.
    is_self = target_uid == user.id
    perms = get_user_permissions(db, user)
    if not is_self and "kpi.manage" not in perms:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: chỉ user có kpi.manage mới được phân công cho user khác.",
        )

    try:
        row = db.execute(
            text("""
                INSERT INTO kpi_group_assignments
                    (reporting_year, kpi_group_code, user_id, is_active, assigned_by_user_id)
                VALUES (:yr, :gc, :uid, :act, :by)
                RETURNING id
            """),
            {"yr": year, "gc": grp, "uid": target_uid, "act": is_active, "by": user.id},
        ).fetchone()
    except Exception as e:
        db.rollback()
        if "kpi_group_assignments_reporting_year_kpi_group_code_user_id_key" in str(e):
            raise HTTPException(
                status_code=409,
                detail=f"User {target_user_email} đã được phân công vào nhóm {grp} năm {year}.",
            )
        raise
    db.commit()
    return {"id": row[0], "user_id": target_uid, "user_email": target_user_email, "kpi_group_code": grp, "is_active": is_active}


@router.patch("/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    body: dict[str, Any],
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    # PATCH is admin-only: changes is_active / kpi_group_code affect
    # what other users see.
    _require_kpi_manage(user, db)

    updates: dict[str, Any] = {}
    if "is_active" in body:
        updates["is_active"] = bool(body["is_active"])
    if "kpi_group_code" in body:
        grp = str(body["kpi_group_code"]).strip().upper()
        if grp not in {g.code for g in kpi_groups()}:
            raise HTTPException(status_code=400, detail="unknown kpi_group_code")
        updates["kpi_group_code"] = grp
    if not updates:
        raise HTTPException(status_code=400, detail="nothing to update")
    updates["updated_at"] = datetime.utcnow()
    sets = ", ".join(f"{k} = :{k}" for k in updates)
    db.execute(
        text(f"UPDATE kpi_group_assignments SET {sets} WHERE id = :aid"),
        {"aid": assignment_id, **updates},
    )
    db.commit()
    return {"id": assignment_id, **updates}


@router.delete("/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Only kpi.manage can delete assignments. (Staff cannot self-delete
    # because reassigning the org's KPI surface is an admin act.)
    _require_kpi_manage(user, db)
    db.execute(text("DELETE FROM kpi_group_assignments WHERE id = :aid"), {"aid": assignment_id})
    db.commit()
    return {"ok": True}


# ─── Snapshot (used by new shared KPI UI) ──────────────────────────────────

@router.get("/snapshot")
def snapshot(
    year: int = Query(..., ge=2000, le=2100),
    user_email: str | None = Query(
        None,
        description="Staff omits this (defaults to themselves). Admin/manager may pass another email.",
    ),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    """
    Shared snapshot endpoint.

    Admin/Manager with ``kpi.manage``:
      - user_email omitted   → unit-wide snapshot (all groups).
      - user_email provided  → user-scoped snapshot for that email.

    Staff (no ``kpi.manage``):
      - user_email omitted → user-scoped snapshot for the caller.
      - user_email = self  → same as omitted.
      - user_email = other → 403.
    """
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    requested = (user_email or "").strip() or (user.username or "")
    requested_email = requested.lower()

    # Authorization
    is_self = requested_email == (user.username or "").strip().lower()
    is_admin_unit = user_email is None and _can_view_other_user(user, db, "")
    if not is_self and not is_admin_unit:
        if not _can_view_other_user(user, db, requested):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: only kpi.manage may view other user's snapshot",
            )

    target_uid = _resolve_email(db, requested)
    if target_uid is None:
        return {
            "year": year,
            "user_email": requested,
            "groups": [],
            "total_target": 0,
            "total_actual": 0,
            "unassigned": True,
        }

    # Admin/Manager unit-scope: pass the special sentinel -1 → unit snapshot.
    perms = get_user_permissions(db, user)
    if "kpi.manage" in perms and user_email is None:
        unit = get_unit_year_snapshot(db, year)
        payload = {
            "year": year,
            "user_email": None,
            "scope": "unit",
            "groups": [
                {
                    "kpi_group_code": g.kpi_group_code,
                    "field_label": g.field_label,
                    "member_domain_codes": list(g.member_domain_codes),
                    "target_amount": g.target_amount,
                    "actual_before_tax": g.actual_before_tax,
                    "contract_count": g.contract_count,
                    "valued_contract_count": g.valued_contract_count,
                    "unresolved_value_count": g.unresolved_value_count,
                    "has_target": g.has_target,
                    "progress_percent": g.progress_percent,
                    "member_breakdown": g.member_breakdown,
                    "is_active": g.has_target,
                }
                for g in unit.groups
            ],
            "total_target": unit.total_target,
            "total_actual": unit.total_actual,
            "total_contract_count": unit.total_contract_count,
            "completion_percent": unit.completion_percent,
            "unassigned": False,
        }
        return payload

    payload = get_user_year_snapshot(db, target_uid, year)
    payload["user_email"] = requested
    payload["scope"] = "user"
    return payload
