from __future__ import annotations

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    linh_vuc: Mapped[str | None] = mapped_column(String(64), nullable=True)
    password_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime, nullable=False)
    last_seen_at: Mapped[object | None] = mapped_column(DateTime, nullable=True)
    session_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class UserPermissionRow(Base):
    __tablename__ = "user_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    permission: Mapped[str] = mapped_column(String(128), nullable=False)
    allowed: Mapped[int] = mapped_column(Integer, nullable=False)


class DomainRow(Base):
    __tablename__ = "domains"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name_vi: Mapped[str] = mapped_column(String(255), nullable=False)
    workspace_group_code: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class UserDomainAssignmentRow(Base):
    __tablename__ = "user_domain_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    domain_id: Mapped[int] = mapped_column(Integer, ForeignKey("domains.id"), nullable=False)
    can_access: Mapped[bool] = mapped_column(Boolean, nullable=False)
    can_view: Mapped[bool] = mapped_column(Boolean, nullable=False)
    can_create: Mapped[bool] = mapped_column(Boolean, nullable=False)
    can_edit: Mapped[bool] = mapped_column(Boolean, nullable=False)
    can_print_test: Mapped[bool] = mapped_column(Boolean, nullable=False)
    can_print_official: Mapped[bool] = mapped_column(Boolean, nullable=False)
    can_approve: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[object | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[object | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_by: Mapped[int | None] = mapped_column(Integer, nullable=True)


class UserPreferenceRow(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)
    last_workspace_group_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_active_domain_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("domains.id"), nullable=True)

