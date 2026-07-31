from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import (
    decode_access_token,
    get_bearer_token,
    get_user_permissions,
    security_scheme,
)
from ..models.user import DomainRow, UserDomainAssignmentRow, UserPreferenceRow, UserRow
from ..schemas.user import DomainPermission, DomainSafe, MeResponse, UserSafe


router = APIRouter(tags=["me"])


def _is_email(value: str) -> bool:
    return "@" in value


def _display_name_from_username(username: str) -> str:
    base = (username or "").strip()
    if _is_email(base):
        local = base.split("@", 1)[0]
        return local or base
    return base


def _to_user_safe(user: UserRow) -> UserSafe:
    username = str(user.username or "")
    email = username if _is_email(username) else None
    return UserSafe(
        id=int(user.id),
        email=email,
        username=username,
        display_name=_display_name_from_username(username),
        role=str(user.role or ""),
        is_active=True,
    )


@router.get("/api/me", response_model=MeResponse)
def me(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> MeResponse:
    token = get_bearer_token(credentials)
    username = decode_access_token(token)

    user = (
        db.query(UserRow)
        .filter(func.lower(UserRow.username) == username)
        .first()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    permissions = get_user_permissions(db, user)

    rows = (
        db.query(UserDomainAssignmentRow, DomainRow)
        .join(DomainRow, DomainRow.id == UserDomainAssignmentRow.domain_id)
        .filter(UserDomainAssignmentRow.user_id == int(user.id))
        .filter(UserDomainAssignmentRow.is_active.is_(True))
        .filter(UserDomainAssignmentRow.can_access.is_(True))
        .filter(DomainRow.is_active.is_(True))
        .filter(DomainRow.is_locked.is_(False))
        .order_by(DomainRow.sort_order.asc(), DomainRow.id.asc())
        .all()
    )

    domains: list[DomainSafe] = []
    for assignment, domain in rows:
        domains.append(
            DomainSafe(
                id=int(domain.id),
                code=str(domain.code or "").upper(),
                name_vi=str(domain.name_vi or ""),
                workspace_group_code=str(domain.workspace_group_code or ""),
                permissions=DomainPermission(
                    can_access=bool(assignment.can_access),
                    can_view=bool(assignment.can_view),
                    can_create=bool(assignment.can_create),
                    can_edit=bool(assignment.can_edit),
                    can_print_test=bool(assignment.can_print_test),
                    can_print_official=bool(assignment.can_print_official),
                    can_approve=bool(assignment.can_approve),
                    is_active=bool(assignment.is_active),
                ),
            )
        )

    pref = db.query(UserPreferenceRow).filter(UserPreferenceRow.user_id == int(user.id)).first()
    active_domain_id = int(pref.last_active_domain_id) if pref and pref.last_active_domain_id else None
    if active_domain_id is not None and active_domain_id not in {d.id for d in domains}:
        active_domain_id = domains[0].id if domains else None

    return MeResponse(
        user=_to_user_safe(user),
        permissions=permissions,
        domains=domains,
        active_domain_id=active_domain_id,
        active_workspace_group_code=(pref.last_workspace_group_code if pref else None),
    )

