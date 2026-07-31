from __future__ import annotations

from pydantic import BaseModel, Field

from .user import UserSafe


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSafe

