"""Deployment management API — Quick Tunnel control (admin-only)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import (
    decode_access_token,
    get_bearer_token,
    security_scheme,
)
from ..models.user import UserRow
from ..services.quick_tunnel_manager import TunnelInfo, TunnelStatus, tunnel_manager

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deployment/quick-tunnel", tags=["deployment"])


# ---------------------------------------------------------------------------
# Auth dependency — same pattern as other admin routers (users.py, roles.py)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TunnelStatusResponse(BaseModel):
    status: str
    url: str | None
    pid: int | None
    started_at: str | None
    last_error: str | None
    cloudflared_available: bool


class TunnelStartResponse(BaseModel):
    status: str
    url: str | None
    pid: int | None
    started_at: str | None
    last_error: str | None
    cloudflared_available: bool


class TunnelStopResponse(BaseModel):
    status: str
    url: str | None
    pid: int | None
    started_at: str | None
    last_error: str | None
    cloudflared_available: bool


class ErrorResponse(BaseModel):
    detail: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_response(info: TunnelInfo) -> TunnelStatusResponse:
    return TunnelStatusResponse(
        status=info.status.value,
        url=info.url,
        pid=info.pid,
        started_at=info.started_at,
        last_error=info.last_error,
        cloudflared_available=info.cloudflared_available,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/status",
    response_model=TunnelStatusResponse,
    summary="Get tunnel status",
    description="Returns the current state of the Cloudflare Quick Tunnel. "
                "Requires admin role.",
)
def get_status(
    _: UserRow = Depends(_get_current_admin_user),
) -> TunnelStatusResponse:
    """Return the current tunnel status."""
    info = tunnel_manager.get_status()
    return _to_response(info)


@router.post(
    "/start",
    response_model=TunnelStartResponse,
    summary="Start tunnel",
    description="Starts a Cloudflare Quick Tunnel to expose the local backend "
                "at a temporary public URL. Requires admin role.",
    responses={
        400: {"model": ErrorResponse, "description": "cloudflared not available"},
        504: {"model": ErrorResponse, "description": "Timeout waiting for tunnel URL"},
    },
)
def start_tunnel(
    _: UserRow = Depends(_get_current_admin_user),
) -> TunnelStartResponse:
    """Start the tunnel. Returns immediately if already running."""
    info = tunnel_manager.get_status()

    if info.status == TunnelStatus.RUNNING:
        _logger.info("Tunnel already running at %s", info.url)
        return TunnelStartResponse(
            status=info.status.value,
            url=info.url,
            pid=info.pid,
            started_at=info.started_at,
            last_error=info.last_error,
            cloudflared_available=info.cloudflared_available,
        )

    try:
        info = tunnel_manager.start()
    except TimeoutError:
        _logger.error("Timeout waiting for tunnel URL")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timeout waiting for tunnel URL (60s). "
                   "Check cloudflared logs for details.",
        )
    except RuntimeError as ex:
        _logger.error("Cannot start tunnel: %s", ex)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ex),
        )

    if info.status == TunnelStatus.ERROR:
        _logger.error("Tunnel error: %s", info.last_error)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=info.last_error or "Tunnel failed to start",
        )

    _logger.info("Tunnel started: %s", info.url)
    return TunnelStartResponse(
        status=info.status.value,
        url=info.url,
        pid=info.pid,
        started_at=info.started_at,
        last_error=info.last_error,
        cloudflared_available=info.cloudflared_available,
    )


@router.post(
    "/stop",
    response_model=TunnelStopResponse,
    summary="Stop tunnel",
    description="Stops the running Cloudflare Quick Tunnel. Requires admin role.",
)
def stop_tunnel(
    _: UserRow = Depends(_get_current_admin_user),
) -> TunnelStopResponse:
    """Stop the tunnel. Idempotent — always returns stopped status."""
    info = tunnel_manager.stop()
    _logger.info("Tunnel stopped by admin")
    return TunnelStopResponse(
        status=info.status.value,
        url=info.url,
        pid=info.pid,
        started_at=info.started_at,
        last_error=info.last_error,
        cloudflared_available=info.cloudflared_available,
    )
