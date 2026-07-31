"""Pydantic schemas for export preview functionality."""
from __future__ import annotations

from typing import Any

from pydantic import AliasChoices, BaseModel, Field


class ExportPreviewRequest(BaseModel):
    """Request schema for export-docx-preview endpoint."""

    include_blocks: bool = Field(
        default=True,
        description="Whether to attempt block insertion (usage/pricing tables)"
    )
    pricing_context: dict[str, Any] | None = Field(
        default=None,
        description="Optional pricing context for block insertion"
    )
    synthetic_preview: bool = Field(
        default=False,
        description="Whether this is a synthetic/sample preview (no real contract)"
    )
    dry_run_label: str | None = Field(
        default=None,
        description="Optional label for this preview (for logging/display)"
    )
    urban_support_percent: float = Field(
        default=100.0,
        ge=0,
        le=100,
        description="Urban support percentage (0-100) for Karaoke pricing calculation. Default 100%."
    )
    # Full pricing snapshot from frontend (from applied pricing calculator)
    # If provided, this takes precedence over DB values for template 1 export
    # Accept both camelCase (pricingSnapshot from frontend) and snake_case
    pricing_snapshot: dict[str, Any] | None = Field(
        default=None,
        description="Applied pricing snapshot from frontend, request-only/render-only.",
        validation_alias=AliasChoices("pricingSnapshot", "pricing_snapshot"),
    )
    # Music usage areas from frontend
    usage_areas: list[dict[str, Any]] | None = Field(
        default=None,
        description="Music usage areas from frontend. Optional for Template 1.",
    )
    # Total rooms count
    total_rooms: int | None = Field(
        default=None,
        ge=0,
        description="Total number of rooms. Optional, can be derived from usage_areas or snapshot.",
    )
    # Contract term in months
    duration_months: int | None = Field(
        default=None,
        ge=1,
        le=24,
        description="Contract term in months. Optional, defaults to 12.",
    )


class ExportPreviewResponse(BaseModel):
    """Response schema for export-docx-preview endpoint."""

    ok: bool = Field(default=True, description="Whether the operation succeeded")
    preview_path: str | None = Field(description="Path to the preview file")
    file_size: int | None = Field(description="File size in bytes")
    domain: str | None = Field(description="Domain code (KARAOKE, KVC)")
    domain_label: str | None = Field(description="Human-readable domain label")
    template_path: str | None = Field(description="Path to the source template file")
    placeholders_attempted: list[str] = Field(
        default_factory=list, description="Placeholders found in template"
    )
    placeholders_in_context: int = Field(description="Number of placeholders in render context")
    file_write_performed: bool = Field(
        default=True, description="Whether a file was written"
    )
    db_write_performed: bool = Field(
        default=False, description="Whether DB was written (always false)"
    )
    docx_path_attached: bool = Field(
        default=False, description="Whether docx_path was attached to contract (always false)"
    )
    official_export: bool = Field(
        default=False, description="Whether this is an official export (always false)"
    )
    pricing_blocks_inserted: bool = Field(
        default=False, description="Whether pricing blocks were inserted"
    )
    kvc_blocks_attempted: bool = Field(
        default=False, description="Whether KVC block insertion was attempted"
    )
    kvc_usage_block_inserted: bool = Field(
        default=False, description="Whether KVC usage block was inserted"
    )
    kvc_pricing_block_inserted: bool = Field(
        default=False, description="Whether KVC pricing block was inserted"
    )
    karaoke_blocks_attempted: bool = Field(
        default=False, description="Whether Karaoke block insertion was attempted"
    )
    karaoke_room_block_inserted: bool = Field(
        default=False, description="Whether Karaoke room block was inserted"
    )
    karaoke_pricing_block_inserted: bool = Field(
        default=False, description="Whether Karaoke pricing block was inserted"
    )
    block_placeholder_strategy: str | None = Field(
        default="docxtpl_placeholder_to_sentinel_anchor",
        description="Strategy for block placeholder injection",
    )
    block_placeholders_injected: list[str] = Field(
        default_factory=list,
        description="List of docxtpl placeholder names injected with sentinel anchors",
    )
    sentinel_anchors_used: list[str] = Field(
        default_factory=list,
        description="List of sentinel anchor strings injected into the DOCX",
    )
    template_raw_anchor_required: bool = Field(
        default=False,
        description="Whether raw __...__ anchors are required in template (always false)",
    )
    synthetic_preview: bool = Field(
        default=False,
        description="Whether this is a synthetic/sample preview",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Any warnings about the render operation",
    )
    message: str | None = Field(
        default=None, description="Human-readable message"
    )
