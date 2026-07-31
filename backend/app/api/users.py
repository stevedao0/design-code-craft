from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.orm import Session

from pydantic import BaseModel

from ..core.database import get_db
from ..core.security import (
    PERMISSIONS,
    ROLE_DEFAULT_PERMISSIONS,
    decode_access_token,
    get_bearer_token,
    hash_password,
    security_scheme,
)
from ..models.user import DomainRow, UserDomainAssignmentRow, UserPermissionRow, UserRow
from ..schemas.user import (
    LockToggleRequest,
    PasswordChangeRequest,
    RolePermissionsPayload,
    RolePermissionsUpdate,
    UserCreateRequest,
    UserListItem,
    UserUpdateRequest,
    UserRolePermissionsResponse,
)

router = APIRouter(prefix="/api/users", tags=["users"])


def _get_current_admin_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    db: Session = Depends(get_db),
) -> UserRow:
    token = get_bearer_token(credentials)
    username = decode_access_token(token)
    user = db.query(UserRow).filter(func.lower(UserRow.username) == username).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    role = str(user.role or "").lower()
    if role not in ("admin",):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def _is_email(value: str) -> bool:
    return "@" in value


def _get_user_domains(db: Session, user_id: int) -> list[str]:
    rows = (
        db.query(UserDomainAssignmentRow, DomainRow)
        .join(DomainRow, DomainRow.id == UserDomainAssignmentRow.domain_id)
        .filter(UserDomainAssignmentRow.user_id == user_id)
        .filter(UserDomainAssignmentRow.is_active.is_(True))
        .filter(UserDomainAssignmentRow.can_access.is_(True))
        .filter(DomainRow.is_active.is_(True))
        .filter(DomainRow.is_locked.is_(False))
        .all()
    )
    return [str(d.code or "").lower() for _, d in rows]


@router.get("", response_model=list[UserListItem])
def list_users(
    db: Session = Depends(get_db),
    _: UserRow = Depends(_get_current_admin_user),
) -> list[UserListItem]:
    users = db.query(UserRow).order_by(UserRow.id.asc()).all()
    result = []
    for u in users:
        domains = _get_user_domains(db, int(u.id))
        last_seen = None
        if u.last_seen_at and hasattr(u.last_seen_at, "year"):
            last_seen = u.last_seen_at
        created = None
        if u.created_at and hasattr(u.created_at, "year"):
            created = u.created_at
        username_str = str(u.username or "")
        email = username_str if _is_email(username_str) else None
        result.append(
            UserListItem(
                id=int(u.id),
                username=username_str,
                display_name=username_str,
                email=email,
                role=str(u.role or "user"),
                is_active=True,
                last_seen_at=last_seen,
                created_at=created,
                domains=domains,
            )
        )
    return result


@router.post("", response_model=UserListItem, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    _: UserRow = Depends(_get_current_admin_user),
) -> UserListItem:
    existing = (
        db.query(UserRow)
        .filter(func.lower(UserRow.username) == payload.username.strip().lower())
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{payload.username}' already exists",
        )

    salt_hex, hash_hex = hash_password(payload.password)
    now = datetime.now(timezone.utc)
    new_user = UserRow(
        username=payload.username.strip(),
        display_name=payload.display_name,
        role=payload.role or "user",
        password_salt=salt_hex,
        password_hash=hash_hex,
        created_at=now,
        linh_vuc=None,
    )
    db.add(new_user)
    db.flush()

    if payload.domain_ids:
        for domain_id in payload.domain_ids:
            domain = db.query(DomainRow).filter(DomainRow.id == domain_id).first()
            if domain:
                assignment = UserDomainAssignmentRow(
                    user_id=int(new_user.id),
                    domain_id=domain_id,
                    can_access=True,
                    can_view=True,
                    can_create=True,
                    can_edit=True,
                    can_print_test=True,
                    can_print_official=True,
                    can_approve=False,
                    is_active=True,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                    created_by=0,
                    updated_by=0,
                )
                db.add(assignment)

    db.commit()
    domains = _get_user_domains(db, int(new_user.id))
    username_str = str(new_user.username or "")
    email = username_str if _is_email(username_str) else None
    return UserListItem(
        id=int(new_user.id),
        username=username_str,
        display_name=str(new_user.display_name or username_str),
        email=email,
        role=str(new_user.role or "user"),
        is_active=True,
        last_seen_at=None,
        created_at=now,
        domains=domains,
    )


@router.put("/{user_id}", response_model=UserListItem)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    _: UserRow = Depends(_get_current_admin_user),
) -> UserListItem:
    user = db.query(UserRow).filter(UserRow.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.role is not None:
        user.role = payload.role
    if payload.domain_ids is not None:
        db.query(UserDomainAssignmentRow).filter(
            UserDomainAssignmentRow.user_id == user_id
        ).delete()
        for domain_id in payload.domain_ids:
            domain = db.query(DomainRow).filter(DomainRow.id == domain_id).first()
            if domain:
                assignment = UserDomainAssignmentRow(
                    user_id=user_id,
                    domain_id=domain_id,
                    can_access=True,
                    can_view=True,
                    can_create=True,
                    can_edit=True,
                    can_print_test=True,
                    can_print_official=True,
                    can_approve=False,
                    is_active=True,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                    created_by=0,
                    updated_by=0,
                )
                db.add(assignment)

    db.commit()
    db.refresh(user)
    domains = _get_user_domains(db, user_id)
    username_str = str(user.username or "")
    email = username_str if _is_email(username_str) else None
    return UserListItem(
        id=int(user.id),
        username=username_str,
        display_name=str(user.display_name or username_str),
        email=email,
        role=str(user.role or "user"),
        is_active=True,
        last_seen_at=user.last_seen_at,
        created_at=user.created_at,
        domains=domains,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: UserRow = Depends(_get_current_admin_user),
) -> None:
    if admin_user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể xóa tài khoản đang đăng nhập.")

    user = db.query(UserRow).filter(UserRow.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if str(user.role or "").lower() == "admin":
        admin_count = db.query(UserRow).filter(
            func.lower(UserRow.role) == "admin",
            UserRow.is_active.is_(True),
            UserRow.id != user_id,
        ).count()
        if admin_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể xóa Super Admin cuối cùng.",
            )

    db.query(UserDomainAssignmentRow).filter(
        UserDomainAssignmentRow.user_id == user_id
    ).delete(synchronize_session=False)
    db.delete(user)
    db.commit()


@router.post("/{user_id}/lock", response_model=UserListItem)
def lock_user(
    user_id: int,
    payload: LockToggleRequest,
    db: Session = Depends(get_db),
    _: UserRow = Depends(_get_current_admin_user),
) -> UserListItem:
    user = db.query(UserRow).filter(UserRow.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    domains = _get_user_domains(db, user_id)
    username_str = str(user.username or "")
    email = username_str if _is_email(username_str) else None
    return UserListItem(
        id=int(user.id),
        username=username_str,
        display_name=str(user.display_name or username_str),
        email=email,
        role=str(user.role or "user"),
        is_active=user.is_active,
        last_seen_at=user.last_seen_at,
        created_at=user.created_at,
        domains=domains,
    )


@router.post("/{user_id}/password", response_model=dict)
def change_user_password(
    user_id: int,
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    _: UserRow = Depends(_get_current_admin_user),
) -> dict:
    user = db.query(UserRow).filter(UserRow.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    salt_hex, hash_hex = hash_password(payload.new_password)
    user.password_salt = salt_hex
    user.password_hash = hash_hex
    db.commit()
    return {"message": "Password updated successfully"}


@router.patch("/{user_id}/role-permissions", response_model=UserRolePermissionsResponse)
def update_user_role_permissions(
    user_id: int,
    payload: RolePermissionsPayload,
    db: Session = Depends(get_db),
    admin_user: UserRow = Depends(_get_current_admin_user),
) -> UserRolePermissionsResponse:
    user = db.query(UserRow).filter(UserRow.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    warnings: list[str] = []

    # Prevent admin from removing their own admin role
    if admin_user.id == user_id and payload.role != user.role and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own admin role",
        )

    # Prevent removing the last admin
    if payload.role != "admin" and str(user.role or "").lower() == "admin":
        admin_count = db.query(UserRow).filter(
            func.lower(UserRow.role) == "admin",
            UserRow.is_active.is_(True),
            UserRow.id != user_id,
        ).count()
        if admin_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove admin role: this is the last admin account",
            )

    # Validate role
    valid_roles = ("admin", "mod", "user")
    if payload.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}",
        )

    # Validate permissions against backend PERMISSIONS
    valid_backend_perms = {p for group in PERMISSIONS.values() for p in group}
    for perm in payload.permissions:
        if perm not in valid_backend_perms:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid permission: '{perm}'. Valid permissions: {sorted(valid_backend_perms)}",
            )

    # Validate domain_ids
    for domain_id in payload.domain_ids:
        domain = db.query(DomainRow).filter(DomainRow.id == domain_id).first()
        if not domain:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid domain_id: {domain_id}",
            )

    # Update role
    old_role = str(user.role or "")
    user.role = payload.role

    # Compute which permissions differ from new role defaults
    role_defaults = ROLE_DEFAULT_PERMISSIONS.get(payload.role, set())
    desired_perms = set(payload.permissions)
    add_perms = desired_perms - role_defaults
    remove_perms = role_defaults - desired_perms

    # Remove old user_permission overrides for this user
    db.query(UserPermissionRow).filter(
        UserPermissionRow.username == user.username
    ).delete(synchronize_session=False)

    # Add explicit overrides for permissions that differ from role defaults
    for perm in add_perms:
        db.add(UserPermissionRow(
            username=str(user.username),
            permission=perm,
            allowed=1,
        ))
    for perm in remove_perms:
        db.add(UserPermissionRow(
            username=str(user.username),
            permission=perm,
            allowed=0,
        ))

    # Update domain assignments
    db.query(UserDomainAssignmentRow).filter(
        UserDomainAssignmentRow.user_id == user_id
    ).delete(synchronize_session=False)
    for domain_id in payload.domain_ids:
        db.add(UserDomainAssignmentRow(
            user_id=user_id,
            domain_id=domain_id,
            can_access=True,
            can_view=True,
            can_create=True,
            can_edit=True,
            can_print_test=True,
            can_print_official=True,
            can_approve=False,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            created_by=0,
            updated_by=0,
        ))

    db.commit()

    if old_role != payload.role:
        warnings.append(f"Role changed from '{old_role}' to '{payload.role}'")

    return UserRolePermissionsResponse(
        ok=True,
        user_id=user_id,
        updated_role=payload.role,
        updated_permissions_count=len(payload.permissions),
        updated_domains_count=len(payload.domain_ids),
        warnings=warnings,
    )
