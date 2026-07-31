from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import (
    PERMISSIONS,
    ROLE_DEFAULT_PERMISSIONS,
    decode_access_token,
    get_bearer_token,
    security_scheme,
)
from ..models.user import DomainRow, UserPermissionRow, UserRow
from ..schemas.user import (
    DomainSimple,
    PermissionMatrixResponse,
    RolePermissionsUpdate,
)

router = APIRouter(prefix="/api/roles", tags=["roles"])


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


PERMISSION_LABELS: dict[str, str] = {
    # Portal
    "portal.access": "Truy cập Portal",
    # Contracts
    "contracts.list": "Xem danh sách hợp đồng",
    "contracts.read": "Xem chi tiết hợp đồng",
    "contracts.create": "Tạo hợp đồng",
    "contracts.update": "Cập nhật hợp đồng",
    "contracts.delete": "Xóa hợp đồng",
    # Annexes
    "annexes.read": "Xem phụ lục",
    "annexes.create": "Tạo phụ lục",
    "annexes.update": "Cập nhật phụ lục",
    "annexes.delete": "Xóa phụ lục",
    # Catalogue
    "catalogue.upload": "Upload danh mục",
    # Works
    "works.read": "Xem tác phẩm",
    "works.import": "Import tác phẩm",
    # Reports
    "reports.view": "Xem báo cáo",
    "reports.export": "Xuất báo cáo",
    # Admin
    "admin.users.manage": "Quản lý người dùng",
    "admin.system.manage": "Quản lý hệ thống",
    "admin.ops.view": "Xem vận hành",
    "admin.data.manage": "Quản lý dữ liệu",
    # Tools
    "youtube.cookies.manage": "Quản lý YouTube cookies",
}


@router.get("/permissions", response_model=PermissionMatrixResponse)
def get_permission_matrix(
    db: Session = Depends(get_db),
    _: UserRow = Depends(_get_current_admin_user),
) -> PermissionMatrixResponse:
    all_perms = sorted({p for group in PERMISSIONS.values() for p in group})
    domains = (
        db.query(DomainRow)
        .filter(DomainRow.is_active.is_(True), DomainRow.is_locked.is_(False))
        .order_by(DomainRow.sort_order.asc())
        .all()
    )
    return PermissionMatrixResponse(
        available_permissions=all_perms,
        permission_labels=PERMISSION_LABELS,
        available_roles=["admin", "mod", "user"],
        available_domains=[
            DomainSimple(
                id=int(d.id),
                code=str(d.code or ""),
                name_vi=str(d.name_vi or ""),
                workspace_group_code=str(d.workspace_group_code or ""),
            )
            for d in domains
        ],
        role_defaults={r: sorted(list(p)) for r, p in ROLE_DEFAULT_PERMISSIONS.items()},
    )


@router.get("", response_model=dict)
def list_roles(
    _: UserRow = Depends(_get_current_admin_user),
) -> dict:
    return {
        role_key: sorted(ROLE_DEFAULT_PERMISSIONS.get(role_key, set()))
        for role_key in ("admin", "mod", "user")
    }


@router.put("/{role}/permissions", response_model=dict)
def update_role_permissions(
    role: str,
    payload: RolePermissionsUpdate,
    db: Session = Depends(get_db),
    _: UserRow = Depends(_get_current_admin_user),
) -> dict:
    if role not in ("admin", "mod", "user"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Must be 'admin', 'mod', or 'user'",
        )

    valid_perms = {p for group in PERMISSIONS.values() for p in group}
    for perm in payload.permissions:
        if perm not in valid_perms:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid permission: {perm}",
            )

    db.query(UserPermissionRow).filter(
        UserPermissionRow.permission.in_(valid_perms)
    ).delete(synchronize_session=False)
    db.commit()

    for perm in payload.permissions:
        for user_row in db.query(UserRow).filter(UserRow.role == role).all():
            existing = (
                db.query(UserPermissionRow)
                .filter(
                    UserPermissionRow.username == user_row.username,
                    UserPermissionRow.permission == perm,
                )
                .first()
            )
            if not existing:
                db.add(
                    UserPermissionRow(
                        username=str(user_row.username),
                        permission=perm,
                        allowed=1,
                    )
                )
    db.commit()

    return {"message": f"Permissions for role '{role}' updated successfully", "permissions": payload.permissions}
