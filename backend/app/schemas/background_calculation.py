"""
Background/Karaoke calculation schemas for dry-run endpoint.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class KaraokeCalculationTier(BaseModel):
    name: str
    rooms: int
    coefficient: float
    amount: int
    support_rate: float
    support_amount: int
    net_amount: int


class KaraokeCalculationDetailRow(BaseModel):
    label: str
    room_count: int
    formula: str
    support_rate: float
    support_amount: int
    net_amount: int


class KaraokeDocxContextPreview(BaseModel):
    room_display_text: str
    pricing_detail_text: str
    pricing_total_text: str
    karaoke_pricing_render_mode: str


class KaraokeCalculationResult(BaseModel):
    term_months: int
    tiers: list[KaraokeCalculationTier]
    subtotal_before_support: int
    support_by_tier: int
    annual_support_amount: int
    amount_before_gtgt: int
    gtgt_percent: float
    gtgt_amount: int
    total_amount: int
    effective_amount_before_gtgt: int
    effective_total_amount: int
    detail_rows: list[KaraokeCalculationDetailRow] = Field(default_factory=list)
    errors: list[dict[str, str]] = Field(default_factory=list)
    warnings: list[dict[str, str]] = Field(default_factory=list)
    docx_context_preview: KaraokeDocxContextPreview


class KaraokeCalculateDryRunRequest(BaseModel):
    """Request for karaoke calculation dry-run."""
    contract_no: str | None = Field(None, description="User input only - not auto-generated")
    karaoke_type: str = Field("PHONG", description="PHONG or BOX")
    area_group: str = Field("DEN_20", description="DEN_20, TREN_20_DEN_30, TREN_30, BOX")
    tong_so_phong: int | None = Field(None, description="Total rooms for PHONG type")
    tong_so_box: int | None = Field(None, description="Total boxes for BOX type")
    muc_luong_co_so: int | None = Field(
        None,
        description="Base salary (VND). Defaults to 2,530,000 if not provided (Nghị định 161/2026/NĐ-CP, Điều 3 khoản 2, effective 01/07/2026). User can override."
    )
    ty_le_ho_tro: float = Field(0, description="Annual support percentage (0-100)")
    ty_le_ho_tro_bac_1: float = Field(0, description="Tier 1 support percentage (0-100)")
    ty_le_ho_tro_bac_2: float = Field(0, description="Tier 2 support percentage (0-100)")
    ty_le_ho_tro_bac_3: float = Field(0, description="Tier 3 support percentage (0-100)")
    gtgt_percent: float = Field(8, description="GTGT tax percentage (0-100)")
    start_date: str | None = Field(None, description="Contract start date (YYYY-MM-DD)")
    end_date: str | None = Field(None, description="Contract end date (YYYY-MM-DD)")
    room_sections: list[dict[str, Any]] = Field(default_factory=list, description="Room sections for display text")
    pricing_render_mode: str = Field("text", description="table or text")


class KaraokeInputEcho(BaseModel):
    """Echo of input parameters."""
    contract_no: str | None = None
    karaoke_type: str
    area_group: str
    tong_so_phong: int | None = None
    tong_so_box: int | None = None
    muc_luong_co_so: int | None = None
    ty_le_ho_tro: float
    ty_le_ho_tro_bac_1: float
    ty_le_ho_tro_bac_2: float
    ty_le_ho_tro_bac_3: float
    gtgt_percent: float
    start_date: str | None = None
    end_date: str | None = None
    pricing_render_mode: str


class KaraokeCalculateDryRunResponse(BaseModel):
    """Response for karaoke calculation dry-run."""
    ok: bool = True
    mode: str = "background_karaoke_calculation_dry_run"
    write_performed: bool = False
    contract_created: bool = False
    docx_generated: bool = False
    xlsx_generated: bool = False
    gcn_created: bool = False
    contract_no_generated: bool = False
    errors: list[dict[str, str]] = Field(default_factory=list)
    warnings: list[dict[str, str]] = Field(default_factory=list)
    input_echo: KaraokeInputEcho
    calculation: KaraokeCalculationResult
