from __future__ import annotations

import os
from urllib.parse import urlparse

from dotenv import load_dotenv
from pathlib import Path
_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_ENV_PATH = _BACKEND_ROOT / ".env"
if _ENV_PATH.exists():
    load_dotenv(_ENV_PATH, override=True)

from fastapi import APIRouter, Request

from ..core.config import settings


router = APIRouter(tags=["health"])

DB_MODE = os.getenv("DB_MODE", "main").strip().lower()


def _get_db_info() -> dict:
    url = os.getenv("DATABASE_URL", "")
    parsed = urlparse(url)
    return {
        "db_mode": DB_MODE,
        "db_port": parsed.port,
        "db_name": parsed.path.lstrip("/"),
        "db_host": parsed.hostname,
    }


@router.get("/api/health")
def health(request: Request) -> dict:
    current_db = getattr(request.app.state, "current_database", "")
    db_info = _get_db_info()
    return {
        "status": "ok",
        "app": settings.app_name,
        "app_instance": settings.app_instance,
        "api": "new-backend",
        "database": current_db,
        "delete_contract_main_db_enabled": settings.delete_contract_main_db_enabled,
        **db_info,
    }
