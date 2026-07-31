"""Background template resolver based on template_code.

This module provides template resolution based on user-selected template code,
NOT based on business domain. All Background domains share the same 2 templates.

Template Codes:
- TEMPLATE_1: export_template_contract_1.docx (default)
- TEMPLATE_2: export_template_contract_2.docx
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("uvicorn.error")

# Template root directory
TEMPLATE_ROOT = Path(r"F:\APPs\templates\Background")

# Template code to filename mapping
TEMPLATE_CODE_MAP = {
    "TEMPLATE_1": "export_template_contract_1.docx",
    "TEMPLATE_2": "export_template_contract_2.docx",
}

# Default template
DEFAULT_TEMPLATE_CODE = "TEMPLATE_1"
DEFAULT_TEMPLATE_FILENAME = TEMPLATE_CODE_MAP[DEFAULT_TEMPLATE_CODE]


def resolve_template_code(template_code: str | None) -> str:
    """Resolve template code to canonical code.

    Args:
        template_code: Raw template code (may be None or invalid)

    Returns:
        Canonical template code (TEMPLATE_1 or TEMPLATE_2)
    """
    if not template_code:
        return DEFAULT_TEMPLATE_CODE

    normalized = str(template_code).strip().upper()
    if normalized in TEMPLATE_CODE_MAP:
        return normalized

    return DEFAULT_TEMPLATE_CODE


def get_template_filename(template_code: str) -> str:
    """Get template filename from template code.

    Args:
        template_code: Template code (TEMPLATE_1 or TEMPLATE_2)

    Returns:
        Template filename (e.g., "export_template_contract_1.docx")
    """
    resolved = resolve_template_code(template_code)
    return TEMPLATE_CODE_MAP[resolved]


def get_template_path(template_code: str | None = None) -> Path:
    """Get full path to template file.

    Args:
        template_code: Template code (TEMPLATE_1 or TEMPLATE_2). Uses default if None.

    Returns:
        Full path to template file.

    Raises:
        FileNotFoundError: If template file does not exist.
    """
    filename = get_template_filename(template_code)
    path = TEMPLATE_ROOT / filename

    if not path.exists():
        raise FileNotFoundError(
            f"Template file not found: {path}. "
            f"Available templates: {list(TEMPLATE_CODE_MAP.values())}"
        )

    return path


def get_template_path_safe(template_code: str | None) -> tuple[Path | None, str | None]:
    """Get template path safely without raising exception.

    Args:
        template_code: Template code (TEMPLATE_1 or TEMPLATE_2)

    Returns:
        Tuple of (path, error_message). path is None if not found.
    """
    try:
        path = get_template_path(template_code)
        return path, None
    except FileNotFoundError as e:
        return None, str(e)


def list_available_templates() -> list[dict]:
    """List all available templates.

    Returns:
        List of template info dicts with code, filename, and exists status.
    """
    templates = []
    for code, filename in TEMPLATE_CODE_MAP.items():
        path = TEMPLATE_ROOT / filename
        templates.append({
            "code": code,
            "filename": filename,
            "path": str(path),
            "exists": path.exists(),
        })
    return templates


def get_template_display_name(template_code: str) -> str:
    """Get user-friendly display name for template.

    Args:
        template_code: Template code (TEMPLATE_1 or TEMPLATE_2)

    Returns:
        Display name (e.g., "Mẫu 1" or "Mẫu 2")
    """
    display_names = {
        "TEMPLATE_1": "Mẫu 1",
        "TEMPLATE_2": "Mẫu 2",
    }
    resolved = resolve_template_code(template_code)
    return display_names.get(resolved, "Mẫu 1")
