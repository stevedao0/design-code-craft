"""Pydantic schemas for export dry-run functionality."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class ExportDryRunRequest(BaseModel):
    """Request schema for export-docx-text-dry-run endpoint."""

    include_kvc_blocks: bool = Field(
        default=False,
        description="Whether to attempt KVC block insertion (usage + pricing tables)"
    )
    include_karaoke_blocks: bool = Field(
        default=False,
        description="Whether to attempt Karaoke block insertion (room + pricing blocks)"
    )
    pricing_context: dict[str, Any] | None = Field(
        default=None,
        description="Optional pricing context for block insertion. "
                    "If not provided, block insertion will be skipped even if include_*_blocks=true."
    )
    dry_run_label: str | None = Field(
        default=None,
        description="Optional label for this dry-run (for logging/display)"
    )


class ExportDryRunResponse(BaseModel):
    """Response schema for export-docx-text-dry-run endpoint."""

    ok: bool = Field(default=True, description="Whether the operation succeeded")
    contract_id: int = Field(description="Contract ID that was rendered")
    domain: str = Field(description="Domain code (KARAOKE, KVC)")
    domain_label: str = Field(description="Human-readable domain label")
    template_path: str = Field(description="Path to the source template file")
    temp_output_path: str | None = Field(
        default=None, description="Path to temporary rendered file (if any)"
    )
    file_size: int | None = Field(
        default=None, description="Size of rendered file in bytes"
    )
    placeholders_attempted: list[str] = Field(
        default_factory=list, description="List of placeholder names found in template"
    )
    placeholders_in_context: int = Field(
        default=0, description="Number of placeholders with values in context"
    )
    render_enabled: bool = Field(
        default=False, description="Whether render is enabled (always false in dry-run)"
    )
    db_attach_enabled: bool = Field(
        default=False, description="Whether DB attach is enabled (always false in dry-run)"
    )
    file_write_performed: bool = Field(
        default=False, description="Whether a file was written (temp file only)"
    )
    db_write_performed: bool = Field(
        default=False, description="Whether a DB write was performed"
    )
    docx_path_attached: bool = Field(
        default=False, description="Whether docx_path was attached to DB"
    )
    pricing_blocks_inserted: bool = Field(
        default=False,
        description="Whether pricing/usage blocks were inserted (false in text-only dry-run)",
    )
    royalty_table_placeholder_required: bool = Field(
        default=False,
        description="Whether this template is a new-generation template that must carry {{bang_tinh_tien_ban_quyen}}",
    )
    royalty_table_placeholder_found: bool = Field(
        default=False,
        description="Whether {{bang_tinh_tien_ban_quyen}} was found in the template",
    )
    royalty_table_rendered: bool = Field(
        default=False,
        description="Whether the royalty table was rendered into the DOCX (Phase 4, not implemented yet)",
    )
    kvc_blocks_attempted: bool = Field(
        default=False,
        description="Whether KVC block insertion was attempted",
    )
    kvc_usage_block_inserted: bool = Field(
        default=False,
        description="Whether KVC usage block was inserted",
    )
    kvc_pricing_block_inserted: bool = Field(
        default=False,
        description="Whether KVC pricing block was inserted",
    )
    karaoke_blocks_attempted: bool = Field(
        default=False,
        description="Whether Karaoke block insertion was attempted",
    )
    karaoke_room_block_inserted: bool = Field(
        default=False,
        description="Whether Karaoke room block was inserted",
    )
    karaoke_pricing_block_inserted: bool = Field(
        default=False,
        description="Whether Karaoke pricing block was inserted",
    )
    # v1.1 — royalty_table placeholder audit for new Background templates
    royalty_table_placeholder_required: bool = Field(
        default=False,
        description="True when the selected template is one of the templates that MUST declare {{bang_tinh_tien_ban_quyen}}",
    )
    royalty_table_placeholder_found: bool = Field(
        default=False,
        description="True when {{bang_tinh_tien_ban_quyen}} is present in the selected template",
    )
    royalty_table_rendered: bool = Field(
        default=False,
        description="True when the royalty_table block handler was actually rendered (sentinel replaced)",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Any warnings about the render operation",
    )
    block_placeholder_strategy: str | None = Field(
        default=None,
        description="Strategy for block placeholder injection: 'docxtpl_placeholder_to_sentinel_anchor' or None",
    )
    block_placeholders_injected: list[str] = Field(
        default_factory=list,
        description="List of docxtpl placeholder names injected with sentinel anchors",
    )
    sentinel_anchors_used: list[str] = Field(
        default_factory=list,
        description="List of sentinel anchor strings injected into the DOCX for block replacement",
    )
    template_raw_anchor_required: bool = Field(
        default=False,
        description="Whether raw __...__ anchors are required in the template (always false - uses docxtpl placeholders)",
    )
    message: str | None = Field(
        default=None, description="Human-readable message"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "contract_id": 4123,
                "domain": "KARAOKE",
                "domain_label": "Karaoke",
                "template_path": "F:\\APPs\\templates\\Karaoke\\export_template_contract.docx",
                "temp_output_path": "C:\\Users\\...\\appdata\\local\\temp\\docx_render_xxx.docx",
                "file_size": 47330,
                "placeholders_attempted": [
                    "so_hop_dong",
                    "linh_vuc",
                    "TEN_DON_VI",
                    "ma_so_thue",
                    "dia_chi",
                ],
                "placeholders_in_context": 15,
                "render_enabled": False,
                "db_attach_enabled": False,
                "file_write_performed": True,
                "db_write_performed": False,
                "docx_path_attached": False,
                "pricing_blocks_inserted": False,
                "warnings": [],
                "message": "Text placeholders rendered successfully. Pricing blocks not inserted (dry-run only).",
            }
        }
