from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from ..models.user import UserPermissionRow, UserRow


security_scheme = HTTPBearer(auto_error=False)

PERMISSIONS: dict[str, list[str]] = {
    "Portal": ["portal.access"],
    "Contracts": ["contracts.list", "contracts.read", "contracts.create", "contracts.update", "contracts.delete"],
    "Annexes": ["annexes.read", "annexes.create", "annexes.update", "annexes.delete"],
    "Catalogue": ["catalogue.upload"],
    "Works": ["works.read", "works.import"],
    "Reports": [
        "reports.view",
        "reports.export",
        "reports.view_branch",
        "reports.view_own",
        "reports.view_contract_value",
    ],
    "KPI": [
        "kpi.view",
        "kpi.manage",
    ],
    "Admin": ["admin.users.manage", "admin.system.manage", "admin.ops.view", "admin.data.manage"],
    "Tools": ["youtube.cookies.manage"],
}

# Whether a permission satisfies the requirements to read a single contract's
# detail page. `contracts.read` is the canonical "open detail" permission.
# `contracts.list` (rows in a table) is NOT enough — it is the list-only role.
# `contracts.update` and `contracts.delete` imply read access because the UI
# needs to load the record before editing/deleting.
PERMISSION_IMPLIES_CONTRACT_DETAIL_READ = {
    "contracts.read",
    "contracts.update",
    "contracts.delete",
}

ROLE_DEFAULT_PERMISSIONS: dict[str, set[str]] = {
    "admin": {p for group in PERMISSIONS.values() for p in group},
    "mod": {
        "portal.access",
        "contracts.list",
        "contracts.read",
        "contracts.create",
        "contracts.update",
        "contracts.delete",
        "annexes.read",
        "annexes.create",
        "annexes.update",
        "annexes.delete",
        "catalogue.upload",
        "works.read",
        "works.import",
        "reports.view",
        "reports.export",
        "reports.view_branch",
        "reports.view_contract_value",
        "kpi.view",
        "kpi.manage",
        "admin.users.manage",
        "admin.data.manage",
        "youtube.cookies.manage",
    },
    "user": {
        "portal.access",
        "contracts.list",
        "contracts.read",
        "annexes.read",
        "catalogue.upload",
        "works.read",
        "works.import",
        "reports.view",
        "reports.view_own",
        "kpi.view",
        "admin.users.manage",
        "youtube.cookies.manage",
    },
}


def verify_user_password(*, user: UserRow, password: str, iterations: int = 200_000) -> bool:
    salt_hex = str(user.password_salt or "")
    expected_hash_hex = str(user.password_hash or "")
    if not salt_hex or not expected_hash_hex:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iterations)
    return hmac.compare_digest(dk.hex(), expected_hash_hex)


def hash_password(password: str, iterations: int = 200_000) -> tuple[str, str]:
    salt = os.urandom(16)
    salt_hex = salt.hex()
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return salt_hex, dk.hex()


def create_access_token(*, subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    username = str(payload.get("sub") or "").strip().lower()
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return username


def get_user_permissions(db: Session, user: UserRow) -> list[str]:
    perms = set(ROLE_DEFAULT_PERMISSIONS.get(str(user.role or "").lower(), set()))
    overrides = (
        db.query(UserPermissionRow)
        .filter(UserPermissionRow.username == user.username)
        .all()
    )
    for override in overrides:
        if bool(override.allowed):
            perms.add(override.permission)
        else:
            perms.discard(override.permission)
    return sorted(perms)


def has_contract_list(permissions: list[str]) -> bool:
    """User can list contracts in a table.

    Accepts the explicit `contracts.list` permission OR the legacy
    `contracts.read` permission so older accounts continue to work.
    """
    if "contracts.list" in permissions:
        return True
    return "contracts.read" in permissions


def has_contract_detail_read(permissions: list[str]) -> bool:
    """User can open a single contract's detail page or panel.

    `contracts.read` is the canonical permission. `contracts.update` and
    `contracts.delete` imply it because the UI loads the record first.
    `contracts.list` alone is NOT enough — that is the list-only role.
    """
    return any(p in PERMISSION_IMPLIES_CONTRACT_DETAIL_READ for p in permissions)


def get_bearer_token(credentials: HTTPAuthorizationCredentials | None) -> str:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return credentials.credentials

