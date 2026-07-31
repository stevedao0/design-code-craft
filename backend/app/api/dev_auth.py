from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.database import get_db
from ..core.security import create_access_token
from ..models.user import UserRow
from ..schemas.auth import LoginResponse
from ..schemas.user import UserSafe


router = APIRouter(prefix="/api/dev", tags=["dev"])

CLONE_DB_NAME = "vcpmc_contract_new_clone_20260509"
OLD_DB_NAME = "vcpmc_contract"


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


def _assert_dev_auth_allowed() -> None:
    if settings.app_instance != "new-app":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dev auth is disabled for this app instance")
    if not settings.dev_auth_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dev auth is disabled")

    env_values = {settings.app_env.strip().lower(), settings.node_env.strip().lower()}
    if "production" in env_values or "prod" in env_values:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dev auth is disabled in production")

    parsed = urlparse(settings.database_url)
    db_name = parsed.path.lstrip("/")
    if parsed.port == 5432:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dev auth refuses old DB port")
    if db_name == OLD_DB_NAME:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dev auth refuses old DB name")
    if parsed.port != 5433 or db_name != CLONE_DB_NAME:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dev auth requires clone DB")


@router.post("/auth-token", response_model=LoginResponse)
def create_dev_auth_token(db: Session = Depends(get_db)) -> LoginResponse:
    """Issue a normal bearer token for UI validation in local development only."""
    _assert_dev_auth_allowed()

    user = (
        db.query(UserRow)
        .filter(func.lower(UserRow.role).in_(("admin", "mod")))
        .order_by(UserRow.id.asc())
        .first()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No admin/mod user found")

    token = create_access_token(subject=str(user.username).lower())
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=_to_user_safe(user),
    )
