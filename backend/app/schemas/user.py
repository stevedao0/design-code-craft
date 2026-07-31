from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserSafe(BaseModel):
    id: int
    email: str | None = None
    username: str
    display_name: str
    role: str
    is_active: bool = True


class UserListItem(BaseModel):
    id: int
    username: str
    display_name: str
    email: str | None = None
    role: str
    is_active: bool
    last_seen_at: datetime | None = None
    created_at: datetime | None = None
    domains: list[str] = []


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    display_name: str = Field(..., min_length=2, max_length=255)
    role: str = Field(default="user")
    domain_ids: list[int] = Field(default_factory=list)


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: str | None = None
    domain_ids: list[int] | None = None


class PasswordChangeRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


class LockToggleRequest(BaseModel):
    is_active: bool


class RolePermissionsUpdate(BaseModel):
    permissions: list[str]


class RolePermissionsPayload(BaseModel):
    role: str
    permissions: list[str]
    domain_ids: list[int] = Field(default_factory=list)


class UserRolePermissionsResponse(BaseModel):
    ok: bool
    user_id: int
    updated_role: str
    updated_permissions_count: int
    updated_domains_count: int
    warnings: list[str] = Field(default_factory=list)


class DomainSimple(BaseModel):
    id: int
    code: str
    name_vi: str
    workspace_group_code: str


class PermissionMatrixResponse(BaseModel):
    available_permissions: list[str]
    permission_labels: dict[str, str]
    available_roles: list[str]
    available_domains: list[DomainSimple]
    role_defaults: dict[str, list[str]]


class DomainPermission(BaseModel):
    can_access: bool
    can_view: bool
    can_create: bool
    can_edit: bool
    can_print_test: bool
    can_print_official: bool
    can_approve: bool
    is_active: bool


class DomainSafe(BaseModel):
    id: int
    code: str
    name_vi: str
    workspace_group_code: str
    permissions: DomainPermission


class MeResponse(BaseModel):
    user: UserSafe
    permissions: list[str]
    domains: list[DomainSafe]
    active_domain_id: int | None = None
    active_workspace_group_code: str | None = None

