from __future__ import annotations

from sqlalchemy import false, func, or_
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from ..models.contracts import ContractRecordRow
from ..models.user import DomainRow, UserDomainAssignmentRow, UserRow
from .contract_validation import (
    BACKGROUND_WORKSPACE_CODE,
    PHONG_THU_AM_ALIASES,
    PHONG_THU_AM_CANONICAL,
    normalize_assigned_domain_codes,
)


FULL_ACCESS_ROLES = {"admin", "mod", "moderator", "superuser"}
FULL_ACCESS_PERMISSIONS = {"admin.system.manage", "admin.data.manage", "admin.ops.view"}


def is_full_access_user(user: UserRow, permissions: list[str]) -> bool:
    role = str(user.role or "").strip().lower()
    if role in FULL_ACCESS_ROLES:
        return True
    return any(permission in FULL_ACCESS_PERMISSIONS for permission in permissions)


# Prefixes that mark a record as safe to delete (non-admin path)
SAFE_DELETE_PREFIXES = (
    "CLONE-NEWAPP-",
    "TEST-NEWAPP-",
    "MAKE-HD-",
    "OLDAPP-DIRECT-",
    "OLDAPP-FLOW-",
    "UI-WORD-FALLBACK-",
    "SMOKE-",
    "UI-TEST-",
    "DELETE-TEST-",
)


def is_safe_prefix_delete(contract_no: str | None) -> bool:
    """Non-admin users can only delete records with safe test/clone prefixes."""
    if not contract_no:
        return False
    upper = str(contract_no).strip().upper()
    return any(upper.startswith(p) for p in SAFE_DELETE_PREFIXES)


def is_admin_delete_any_user(user: UserRow, permissions: list[str]) -> bool:
    """Admin/superuser/mod users who can delete any contract record in clone DB."""
    role = str(user.role or "").strip().lower()
    if role not in FULL_ACCESS_ROLES:
        return False
    return any(p in FULL_ACCESS_PERMISSIONS for p in permissions)


def build_domain_condition(code: str):
    upper_linh_vuc = func.upper(func.trim(func.coalesce(ContractRecordRow.linh_vuc, "")))
    upper_display = func.upper(func.trim(func.coalesce(ContractRecordRow.linh_vuc_hien_thi, "")))
    upper_field = func.upper(func.trim(func.coalesce(ContractRecordRow.field_code, "")))

    if code == PHONG_THU_AM_CANONICAL:
        return or_(
            upper_linh_vuc.in_(tuple(PHONG_THU_AM_ALIASES)),
            upper_display.in_(("PHONG THU AM", "PHONG GHI AM", "PTA")),
            upper_field.in_(tuple(PHONG_THU_AM_ALIASES)),
        )

    return or_(
        upper_linh_vuc == code,
        upper_display == code,
        upper_field == code,
    )


def get_allowed_domain_codes_for_user(*, db: Session, user: UserRow) -> set[str]:
    rows = (
        db.query(DomainRow.code)
        .join(UserDomainAssignmentRow, UserDomainAssignmentRow.domain_id == DomainRow.id)
        .filter(UserDomainAssignmentRow.user_id == int(user.id))
        .filter(UserDomainAssignmentRow.is_active.is_(True))
        .filter(UserDomainAssignmentRow.can_access.is_(True))
        .filter(UserDomainAssignmentRow.can_view.is_(True))
        .filter(DomainRow.is_active.is_(True))
        .filter(DomainRow.is_locked.is_(False))
        .filter(func.lower(DomainRow.workspace_group_code) == BACKGROUND_WORKSPACE_CODE)
        .all()
    )
    return normalize_assigned_domain_codes({str(code or "") for (code,) in rows})


def get_create_allowed_domain_codes_for_user(*, db: Session, user: UserRow) -> set[str]:
    rows = (
        db.query(DomainRow.code)
        .join(UserDomainAssignmentRow, UserDomainAssignmentRow.domain_id == DomainRow.id)
        .filter(UserDomainAssignmentRow.user_id == int(user.id))
        .filter(UserDomainAssignmentRow.is_active.is_(True))
        .filter(UserDomainAssignmentRow.can_access.is_(True))
        .filter(UserDomainAssignmentRow.can_create.is_(True))
        .filter(DomainRow.is_active.is_(True))
        .filter(DomainRow.is_locked.is_(False))
        .filter(func.lower(DomainRow.workspace_group_code) == BACKGROUND_WORKSPACE_CODE)
        .all()
    )
    return normalize_assigned_domain_codes({str(code or "") for (code,) in rows})


def apply_contract_visibility(
    *,
    query: SAQuery,
    user: UserRow | None,
    permissions: list[str],
    db: Session,
) -> SAQuery:
    # Handle None user (anonymous) - treat as full access for read-only reports
    if user is None:
        return query
    
    if is_full_access_user(user, permissions):
        return query

    allowed_codes = get_allowed_domain_codes_for_user(db=db, user=user)
    if not allowed_codes:
        return query.filter(false())

    domain_filters = [build_domain_condition(code) for code in sorted(allowed_codes)]
    return (
        query
        .filter(func.lower(func.coalesce(ContractRecordRow.domain_group, "")) == BACKGROUND_WORKSPACE_CODE)
        .filter(or_(*domain_filters))
    )
