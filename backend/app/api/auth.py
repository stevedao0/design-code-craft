from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import create_access_token, verify_user_password
from ..models.user import UserRow
from ..schemas.auth import LoginRequest, LoginResponse
from ..schemas.user import UserSafe


router = APIRouter(prefix="/api/auth", tags=["auth"])


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


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    uname = payload.username.strip().lower()
    if not uname or not payload.password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing username or password")

    user = (
        db.query(UserRow)
        .filter(func.lower(UserRow.username) == uname)
        .first()
    )
    if user is None or not verify_user_password(user=user, password=payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_access_token(subject=str(user.username).lower())
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=_to_user_safe(user),
    )

