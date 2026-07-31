"""
KVC Calculation Schemas.

Pydantic models for KVC VCPMC tariff calculation API.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class KvcLocationInput(BaseModel):
    """Location input for KVC calculation."""
    id: str = Field(description="Location identifier")
    name: str = Field(default="", description="Location display name")
    area_m2: float = Field(
        description="Area in square meters",
    )


class KvcLocationResult(BaseModel):
    """Location calculation result."""
    location_id: str
    location_name: str
    area_m2: float
    base_included_area_m2: int
    excess_area_m2: float
    raw_increment_blocks: float
    increment_blocks: int
    base_fee: int
    increment_fee_per_block: int
    increment_amount: int
    location_subtotal: int


class KvcDetailRow(BaseModel):
    """Detail row for display table."""
    location_id: str
    location_name: str
    area_m2: float
    base_fee: int
    increment_blocks: int
    increment_amount: int
    location_subtotal: int


class KvcInputEcho(BaseModel):
    """Echo of input parameters."""
    location_count: int
    gtgt_percent: float
    support_percent: float
    support_amount: int
    support_note: str = ""


class KvcCalculationResult(BaseModel):
    """KVC calculation result."""
    location_results: List[KvcLocationResult]
    detail_rows: List[KvcDetailRow]
    subtotal_before_support: int
    support_percent: float
    support_amount: int
    amount_after_support: int
    gtgt_percent: float
    gtgt_amount: int
    total_amount: int
    total_amount_words: str


class KvcDocxContextPreview(BaseModel):
    """DOCX context preview for renderer."""
    locations_table_text: str = ""
    pricing_detail_text: str = ""
    pricing_total_text: str = ""
    pricing_mode: str = "VCPMC_TARIFF"


class KvcUsageLocationBlock(BaseModel):
    """Usage locations block for DOCX context."""
    mode: str = "text"
    text: str = ""
    rows: List[List[str]] = []
    headers: List[str] = []


class KvcPricingTableRow(BaseModel):
    """Single row in KVC VCPMC pricing table."""
    cells: List[str]


class KvcVcpmcPricingBlock(BaseModel):
    """KVC VCPMC pricing block for DOCX context."""
    mode: str = "table"
    headers: List[str] = []
    rows: List[List[str]] = []


class KvcBackgroundPricingRow(BaseModel):
    """Single row in background pricing block."""
    cells: List[str]


class KvcSummaryRow(BaseModel):
    """Summary row in background pricing block."""
    cells: List[str]


class KvcBackgroundPricingBlock(BaseModel):
    """Background pricing block for DOCX context."""
    pricing_mode: str = "VCPMC_TARIFF"
    rows: List[List[str]] = []
    summary_rows: List[List[str]] = []


class KvcDocxContextPreviewV2(BaseModel):
    """
    Extended DOCX context preview for renderer (PHASE KVC-03).

    This replaces the simple text-based preview with structured data.
    """
    pricing_mode: str = "VCPMC_TARIFF"
    usage_display_mode: str = "auto"
    background_usage_locations_block: KvcUsageLocationBlock = Field(default_factory=KvcUsageLocationBlock)
    kvc_vcpmc_pricing_block: KvcVcpmcPricingBlock = Field(default_factory=KvcVcpmcPricingBlock)
    background_pricing_block: KvcBackgroundPricingBlock = Field(default_factory=KvcBackgroundPricingBlock)
    pricing_total_text: str = ""
    amount_in_words: str = ""


class KvcWarning(BaseModel):
    """Warning from calculation."""
    field: str
    message: str
    severity: str = "warning"


class KvcError(BaseModel):
    """Error from calculation."""
    field: str
    message: str


class KvcVcpmcTariffDryRunResponse(BaseModel):
    """Response from KVC VCPMC tariff dry-run calculation."""
    ok: bool
    mode: str
    write_performed: bool = False
    contract_created: bool = False
    docx_generated: bool = False
    xlsx_generated: bool = False
    gcn_created: bool = False
    nd17_calculated: bool = False
    errors: List[KvcError] = []
    warnings: List[KvcWarning] = []
    input_echo: KvcInputEcho
    calculation: KvcCalculationResult
    docx_context_preview: KvcDocxContextPreview
    docx_context_preview_v2: Optional[KvcDocxContextPreviewV2] = None


class KvcVcpmcTariffDryRunRequest(BaseModel):
    """Request body for KVC VCPMC tariff dry-run calculation."""
    locations: List[KvcLocationInput] = Field(
        description="List of locations with area"
    )
    gtgt_percent: float = Field(
        default=8.0,
        ge=0,
        le=100,
        description="GTGT/VAT percent"
    )
    support_percent: float = Field(
        default=0.0,
        ge=0,
        le=100,
        description="Support percentage (optional)"
    )
    support_amount: int = Field(
        default=0,
        ge=0,
        description="Support amount in VND (optional)"
    )
    support_note: str = Field(
        default="",
        description="Note about support"
    )
    usage_display_mode: Optional[str] = Field(
        default="auto",
        description="Usage locations display mode: auto, text, or table"
    )


# =============================================================================
# KVC ND17 Calculation Schemas (PHASE KVC-05)
# =============================================================================

class KvcNd17LocationInput(BaseModel):
    """Location input for KVC ND17 calculation."""
    id: str = Field(description="Location identifier")
    name: str = Field(default="", description="Location display name")
    area_m2: float = Field(
        description="Area in square meters",
        gt=0,
    )


class KvcNd17LocationResult(BaseModel):
    """Location ND17 calculation result."""
    location_id: str
    location_name: str
    area_m2: float
    coefficient: float
    coefficient_formula: str
    base_salary: float
    raw_amount: int
    cap_amount: int
    cap_applied: bool
    capped_amount: int
    urban_rate: float
    urban_adjusted_amount: int


class KvcNd17DetailRow(BaseModel):
    """Detail row for ND17 display table."""
    location_id: str
    location_name: str
    area_m2: float
    coefficient: float
    coefficient_formula: str
    raw_amount: int
    cap_applied: bool
    capped_amount: int
    urban_rate: float
    urban_adjusted_amount: int


class KvcNd17InputEcho(BaseModel):
    """Echo of ND17 input parameters."""
    location_count: int
    base_salary: float
    urban_class: Optional[str] = None
    urban_rate: float
    gtgt_percent: float
    support_percent: float
    support_amount: int
    support_note: str = ""
    include_premise_services: bool = False
    premise_services_note: str = ""
    usage_display_mode: str = "auto"


class KvcNd17CalculationResult(BaseModel):
    """ND17 calculation result."""
    location_results: List[KvcNd17LocationResult]
    detail_rows: List[KvcNd17DetailRow]
    cap_was_applied: bool
    subtotal_after_urban: int
    support_percent: float
    support_amount: int
    amount_after_support: int
    gtgt_percent: float
    gtgt_amount: int
    total_amount: int
    total_amount_words: str


class KvcNd17CoefficientBlock(BaseModel):
    """ND17 coefficient block for DOCX context."""
    mode: str = "table"
    headers: List[str] = []
    rows: List[List[str]] = []


class KvcNd17PricingMode(str):
    """ND17 pricing mode identifier."""
    ND17 = "ND17"


class KvcNd17DocxContextPreviewV2(BaseModel):
    """Extended DOCX context preview for ND17."""
    pricing_mode: str = "ND17"
    legal_basis: str = "Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8"
    usage_display_mode: str = "auto"
    background_usage_locations_block: KvcUsageLocationBlock = Field(default_factory=KvcUsageLocationBlock)
    nd17_coefficient_block: KvcNd17CoefficientBlock = Field(default_factory=KvcNd17CoefficientBlock)
    background_pricing_block: KvcBackgroundPricingBlock = Field(default_factory=KvcBackgroundPricingBlock)
    pricing_total_text: str = ""
    amount_in_words: str = ""


class KvcNd17DryRunResponse(BaseModel):
    """Response from KVC ND17 dry-run calculation."""
    ok: bool
    mode: str
    write_performed: bool = False
    contract_created: bool = False
    docx_generated: bool = False
    xlsx_generated: bool = False
    gcn_created: bool = False
    nd17_calculated: bool = False
    vcpmc_tariff_calculated: bool = False
    errors: List[KvcError] = []
    warnings: List[KvcWarning] = []
    input_echo: KvcNd17InputEcho
    calculation: Optional[KvcNd17CalculationResult] = None
    docx_context_preview_v2: Optional[KvcNd17DocxContextPreviewV2] = None


class KvcNd17DryRunRequest(BaseModel):
    """Request body for KVC ND17 dry-run calculation."""
    locations: List[KvcNd17LocationInput] = Field(
        description="List of locations with area"
    )
    base_salary: float = Field(
        default=2_530_000,
        gt=0,
        description="Mức lương cơ sở (VND) — Nghị định 161/2026/NĐ-CP, Điều 3 khoản 2"
    )
    urban_class: Optional[str] = Field(
        default=None,
        description="Urban classification: HN_HCM, LOAI_I, LOAI_II, LOAI_III, LOAI_IV, LOAI_V"
    )
    urban_rate: Optional[float] = Field(
        default=None,
        ge=0,
        le=1,
        description="Override urban rate (0.0-1.0)"
    )
    gtgt_percent: float = Field(
        default=8.0,
        ge=0,
        le=100,
        description="GTGT/VAT percent"
    )
    support_percent: float = Field(
        default=0.0,
        ge=0,
        le=100,
        description="Support percentage (optional)"
    )
    support_amount: int = Field(
        default=0,
        ge=0,
        description="Support amount in VND (optional)"
    )
    support_note: str = Field(
        default="",
        description="Note about support"
    )
    include_premise_services: bool = Field(
        default=False,
        description="Include premise services note"
    )
    premise_services_note: str = Field(
        default="",
        description="Note about which items apply"
    )
    usage_display_mode: Optional[str] = Field(
        default="auto",
        description="Usage locations display mode: auto, text, or table"
    )
