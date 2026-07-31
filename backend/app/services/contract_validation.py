from __future__ import annotations

import os
import re
from datetime import date
from urllib.parse import urlparse

from dotenv import load_dotenv
from pathlib import Path
_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_ENV_PATH = _BACKEND_ROOT / ".env"
if _ENV_PATH.exists():
    load_dotenv(_ENV_PATH, override=True)

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..core.config import settings
from ..schemas.contracts import DryRunCreateContractRequest

# Known invalid address placeholder/key strings that must NEVER be accepted as real data
_INVALID_ADDRESS_PATTERNS: set[str] = {
    # Field/column name references
    "don_vi_dia_chi",
    "dia_chi",
    "legal_address",
    "legal_full_address",
    "usage_address",
    "usage_full_address",
    "address",
    "business_address",
    # CamelCase variants
    "legalAddress",
    "usageAddress",
    "fullAddress",
}

# Regex patterns for invalid formats
_PLACEHOLDER_PATTERN = re.compile(r"^\{\{[^}]+\}\}$")
_SENTINEL_PATTERN = re.compile(r"^_{2,}_$")
# Minimum realistic address length (e.g., "123 Nguyen Hue" is ~17 chars)
_MIN_ADDRESS_LENGTH = 10


def is_real_address_value(value: str | None) -> bool:
    """Check if a string value looks like a real address, not a placeholder/key.

    Returns False if the value is:
    - None or empty
    - A field/column name reference (e.g., "don_vi_dia_chi")
    - A template placeholder (e.g., "{{don_vi_dia_chi}}")
    - A sentinel value (e.g., "__...__")
    - Too short to be a real address
    - Has no spaces (real addresses typically have street numbers and names)
    """
    if not value:
        return False

    stripped = str(value).strip()
    if not stripped:
        return False

    # Check against known invalid field/key names
    if stripped.lower() in _INVALID_ADDRESS_PATTERNS:
        return False

    # Check for {{...}} placeholder pattern
    if _PLACEHOLDER_PATTERN.match(stripped):
        return False

    # Check for __...__ sentinel pattern
    if _SENTINEL_PATTERN.match(stripped):
        return False

    # Too short to be a real address
    if len(stripped) < _MIN_ADDRESS_LENGTH:
        return False

    # Real addresses typically have spaces (street numbers, names, district names)
    if " " not in stripped:
        return False

    return True


def safe_preview(value: object | None) -> str | int | float | bool | None:
    if value is None:
        return None
    if isinstance(value, (int, float, bool)):
        return value
    text = str(value)
    return text if len(text) <= 120 else f"{text[:117]}..."


DB_MODE = os.getenv("DB_MODE", "main").strip().lower()


BACKGROUND_WORKSPACE_CODE = "background"
PHONG_THU_AM_CANONICAL = "PHONG_THU_AM"
PHONG_THU_AM_ALIASES = {"PHONG_THU_AM", "PHONG_GHI_AM", "PTA"}
CREATE_ALLOWED_DOMAIN_CODES = {"KARAOKE", PHONG_THU_AM_CANONICAL}
LOCKED_DOMAIN_GROUPS = {"media_sctt", "media", "sctt"}
PRODUCTION_ENV_NAMES = {"prod", "production"}
TEST_CONTRACT_PREFIX = "TEST-NEWAPP-"
CLONE_CONTRACT_PREFIX = "CLONE-NEWAPP-"
CLONE_D5_CONTRACT_PREFIX = "CLONE-NEWAPP-D5-"


def to_iso(value: object | None) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return str(value.isoformat())
    return str(value)


def clean_text(value: object | None) -> str:
    return str(value or "").strip()


def parse_iso_date(raw: object | None) -> date | None:
    value = clean_text(raw)
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except Exception:
        return None


def parse_int_or_none(raw: object | None) -> int | None:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return int(raw)
    value = clean_text(raw)
    if not value:
        return None
    try:
        return int(float(value.replace(",", "")))
    except Exception:
        return None


def parse_float_or_none(raw: object | None) -> float | None:
    if raw is None:
        return None
    value = clean_text(raw)
    if not value:
        return None
    try:
        return float(value.replace(",", ""))
    except Exception:
        return None


def safe_preview(value: object | None) -> str | int | float | bool | None:
    if value is None:
        return None
    if isinstance(value, (int, float, bool)):
        return value
    text = str(value)
    return text if len(text) <= 120 else f"{text[:117]}..."


def normalize_domain_code(value: str | None) -> str:
    raw = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    if not raw:
        return ""
    if raw in {"CAFE"}:
        return "COFFEE"
    if raw in {"KARAOKE_SHOW", "KARAOKE/SHOW"}:
        return "KARAOKE"
    if raw in {"KVC", "KHU_VUI_CHOI", "KHU_VUI_CHOI_GIAI_TRI", "CITYGAMES"}:
        return "KHU_VUI_CHOI"
    if raw in PHONG_THU_AM_ALIASES:
        return PHONG_THU_AM_CANONICAL
    return raw


def normalize_assigned_domain_codes(raw_codes: set[str]) -> set[str]:
    normalized: set[str] = set()
    for code in raw_codes:
        value = normalize_domain_code(code)
        if value:
            normalized.add(value)
    return normalized


def assert_db_target(db: Session) -> None:
    """Verify runtime DB connection matches DB_MODE.

    MAIN DB ONLY policy: clone-only guards are disabled.
    This function is now a no-op — all DB write operations go to the main DB.
    Production-env guards (is_production_like_env) remain active.
    """
    # No-op: all endpoints can write to the main DB
    pass


# Alias for backward compatibility (now also no-op)
assert_clone_db_target = assert_db_target


def is_production_like_env() -> bool:
    app_env = str(settings.app_env or "").strip().lower()
    node_env = str(settings.node_env or "").strip().lower()
    return app_env in PRODUCTION_ENV_NAMES or node_env in PRODUCTION_ENV_NAMES


def assert_create_runtime_safe(db: Session) -> None:
    """Assert that contract creation is safe for the current environment.

    MAIN DB ONLY: clone DB check removed.
    Still guards against production-like environments.
    """
    if str(settings.app_instance or "").strip() != "new-app":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Create requires APP_INSTANCE=new-app")
    if is_production_like_env():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Create is refused in production-like environment")
    # Clone DB check removed — all writes go to main DB


def payload_requests_persist_test(payload: DryRunCreateContractRequest) -> bool:
    draft = payload.draft if isinstance(payload.draft, dict) else {}
    internal = draft.get("internal") if isinstance(draft.get("internal"), dict) else {}
    if internal.get("test_mode") is True:
        return True
    client = payload.client_preflight if isinstance(payload.client_preflight, dict) else {}
    client_internal = client.get("internal") if isinstance(client.get("internal"), dict) else {}
    return client_internal.get("test_mode") is True


def payload_confirms_clone_only_create(payload: DryRunCreateContractRequest) -> bool:
    confirmation = payload.client_confirmation if isinstance(payload.client_confirmation, dict) else {}
    return confirmation.get("clone_only_create_confirmed") is True
