"""KVC export schema definitions."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class KvcExportPreviewResponse(BaseModel):
    """Response schema for KVC export preview endpoint."""

    ok: bool = Field(default=True, description="Whether the operation succeeded")
    message: str = Field(default="", description="Status message")
    preview_path: str | None = Field(default=None, description="Path to the preview file")
    domain_code: str | None = Field(default=None, description="Domain code (KHU_VUI_CHOI, KVC)")
    block_placeholders_injected: list[str | None] = Field(
        default_factory=list,
        description="List of block placeholders that were successfully injected"
    )
    unresolved_placeholders: list[str] = Field(
        default_factory=list,
        description="List of placeholders that could not be resolved"
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Warning messages if any"
    )
