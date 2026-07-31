"""
Karaoke calculation schemas.

Pydantic models for Karaoke calculation API.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class KaraokeCalcTier(BaseModel):
    """Karaoke calculation tier row."""
    name: str
    rooms: int
    coefficient: float
    amount: int
    support_rate: float
    support_amount: int
    net_amount: int


class KaraokeCalcDetailRow(BaseModel):
    """Karaoke calculation detail row."""
    label: str
    room_count: int
    formula: str
    support_rate: float
    support_amount: int
    net_amount: int


class KaraokeCalcDocxContextPreview(BaseModel):
    """Karaoke DOCX context preview."""
    room_display_text: str = ""
    pricing_detail_text: str = ""
    pricing_total_text: str = ""
    karaoke_pricing_render_mode: str = "text"


class KaraokeCalcInputEcho(BaseModel):
    """Echo of input parameters."""
    contract_no: Optional[str] = None
    karaoke_type: str
    area_group: str
    tong_so_phong: Optional[int] = None
    tong_so_box: Optional[int] = None
    muc_luong_co_so: Optional[int] = None
    ty_le_ho_tro: float = 100.0
    ty_le_ho_tro_bac_1: float = 0.0
    ty_le_ho_tro_bac_2: float = 0.0
    ty_le_ho_tro_bac_3: float = 0.0
    gtgt_percent: float = 8.0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    pricing_render_mode: str = "text"


class KaraokeCalcCalculation(BaseModel):
    """Karaoke calculation result."""
    term_months: int
    tiers: List[KaraokeCalcTier]
    subtotal_before_support: int
    support_by_tier: int
    annual_support_amount: int
    amount_before_gtgt: int
    gtgt_percent: float
    gtgt_amount: int
    total_amount: int
    effective_amount_before_gtgt: int
    effective_total_amount: int
    detail_rows: List[KaraokeCalcDetailRow]
    docx_context_preview: KaraokeCalcDocxContextPreview


class KaraokeCalcWarning(BaseModel):
    """Warning from calculation."""
    field: str
    message: str
    severity: str = "warning"


class KaraokeCalcError(BaseModel):
    """Error from calculation."""
    field: str
    message: str


class KaraokeCalculationResponse(BaseModel):
    """Response from Karaoke dry-run calculation."""
    ok: bool
    mode: str
    write_performed: bool = False
    contract_created: bool = False
    docx_generated: bool = False
    xlsx_generated: bool = False
    gcn_created: bool = False
    contract_no_generated: bool = False
    errors: List[KaraokeCalcError] = []
    warnings: List[KaraokeCalcWarning] = []
    input_echo: KaraokeCalcInputEcho
    calculation: KaraokeCalcCalculation


class KaraokeCalcDryRunRequest(BaseModel):
    """Request body for Karaoke dry-run calculation."""
    karaoke_type: str = Field(default="PHONG", description="PHONG or BOX")
    area_group: str = Field(default="DEN_20", description="DEN_20, TREN_20_DEN_30, TREN_30, or BOX")
    tong_so_phong: Optional[int] = Field(default=None, description="Total number of rooms")
    tong_so_box: Optional[int] = Field(default=None, description="Total number of boxes")
    muc_luong_co_so: Optional[int] = Field(default=None, description="Base salary in VND")
    ty_le_ho_tro: float = Field(default=100.0, description="Annual support percent (default 100 = thu đủ)")
    ty_le_ho_tro_bac_1: float = Field(default=0.0, description="Tier 1 support percent")
    ty_le_ho_tro_bac_2: float = Field(default=0.0, description="Tier 2 support percent")
    ty_le_ho_tro_bac_3: float = Field(default=0.0, description="Tier 3 support percent")
    gtgt_percent: float = Field(default=8.0, description="GTGT/VAT percent")
    start_date: Optional[str] = Field(default=None, description="Start date YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="End date YYYY-MM-DD")
    pricing_render_mode: str = Field(default="text", description="text or table")
