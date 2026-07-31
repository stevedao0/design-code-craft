from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import (
    decode_access_token,
    get_bearer_token,
    security_scheme,
)
from ..models.user import UserRow

router = APIRouter(prefix="/api/audit", tags=["audit"])


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


def _build_audit_entry(
    actor_id: int,
    actor_name: str,
    actor_email: str | None,
    action_type: str,
    action: str,
    target: str | None,
    description: str,
) -> dict:
    return {
        "id": f"audit_{actor_id}_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "actor": actor_name,
        "actor_email": actor_email,
        "type": action_type,
        "action": action,
        "target": target,
        "description": description,
    }


_log_buffer: list[dict] = []
_LOG_BUFFER_SIZE = 200


def _append_log(entry: dict) -> None:
    _log_buffer.append(entry)
    if len(_log_buffer) > _LOG_BUFFER_SIZE:
        _log_buffer.pop(0)


def record_audit(
    actor_id: int,
    actor_name: str,
    actor_email: str | None,
    action_type: str,
    action: str,
    target: str | None = None,
    description: str | None = None,
) -> None:
    entry = _build_audit_entry(
        actor_id=actor_id,
        actor_name=actor_name,
        actor_email=actor_email,
        action_type=action_type,
        action=action,
        target=target,
        description=description or action,
    )
    _append_log(entry)


@router.get("", response_model=list[dict])
def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    action_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: UserRow = Depends(_get_current_admin_user),
) -> list[dict]:
    logs = list(reversed(_log_buffer))
    if action_type:
        logs = [l for l in logs if l.get("type") == action_type]
    return logs[:limit]
