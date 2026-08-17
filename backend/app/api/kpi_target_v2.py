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
from ..core.security import decode_access_token, security_scheme
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


# ─── helpers ────────────────────────────────────────────────────────────────

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


def _is_admin_or_manager(user: UserRow) -> bool:
    return (user.role or "").lower() in ("admin", "manager", "mod")


def _require_write(user: UserRow) -> None:
    if not _is_admin_or_manager(user):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: yêu cầu quyền admin hoặc manager để chỉnh target/assignment.",
        )


def _resolve_email(db: Session, user_email: str) -> int | None:
    if not user_email:
        return None
    u = db.query(UserRow).filter(UserRow.username == user_email).one_or_none()
    return u.id if u else None


# ─── KPI group catalog ──────────────────────────────────────────────────────

@router.get("/groups")
def list_groups(credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme)):
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
    _require_write(user)

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
    _require_write(user)
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
    params: dict[str, Any] = {"yr": year}
    where = "WHERE a.reporting_year = :yr"
    if user_email:
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

    # Self-assign is allowed; assigning others requires admin/manager.
    if target_uid != user.id and not _is_admin_or_manager(user):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: chỉ admin/manager mới được phân công cho user khác.",
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
    _require_write(user)

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
    _require_write(user)
    db.execute(text("DELETE FROM kpi_group_assignments WHERE id = :aid"), {"aid": assignment_id})
    db.commit()
    return {"ok": True}


# ─── Snapshot (used by new shared KPI UI) ──────────────────────────────────

@router.get("/snapshot")
def snapshot(
    year: int = Query(..., ge=2000, le=2100),
    user_email: str | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(db, credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    requested = (user_email or "").strip() or (user.username or "")
    is_self = requested.lower() == (user.username or "").lower()
    if not is_self and not _is_admin_or_manager(user):
        raise HTTPException(status_code=403, detail="Forbidden: only admin/manager can view other user's snapshot")

    target_uid = _resolve_email(db, requested)
    if target_uid is None and user_email:
        return {"year": year, "user_email": requested, "groups": [], "total_target": 0, "total_actual": 0, "unassigned": True}
    if target_uid is None:
        target_uid = user.id

    payload = get_user_year_snapshot(db, target_uid, year)
    payload["user_email"] = requested
    return payload
