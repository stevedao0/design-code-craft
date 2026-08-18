from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# SHARED TYPES
# =============================================================================

class MusicUsageArea(BaseModel):
    """Music usage area row - reusable for all Background domains.

    Extended for FAB multi-location contracts:
    - urban_class, urban_coefficient: per-location urban adjustment
    - location_name, trade_name, address_line, ward, province: per-location address
    - area_m2, duration_months: per-location FAB area/pricing
    - royalty_subtotal: calculated royalty for this specific location
    - pricing_label: optional display label for bảng tính/Word export.
      Field này CHỈ ảnh hưởng hiển thị/in ấn, KHÔNG ảnh hưởng công thức tính tiền.
      Renderer fallback về area_name khi pricing_label rỗng/null.

      Schema chấp nhận cả snake_case (pricing_label) lẫn camelCase (pricingLabel)
      khi parse input từ frontend. Khi dump ra, luôn dùng snake_case để lưu DB.
    """
    model_config = ConfigDict(populate_by_name=True)

    area_name: str = ""
    scale_description: str = ""
    music_usage_type: str = ""
    pricing_label: str | None = Field(default=None, validation_alias="pricingLabel")
    # FAB multi-location fields
    urban_class: str = ""
    urban_coefficient: float = 1.0
    location_name: str = ""
    trade_name: str = ""
    address_line: str = ""
    ward: str = ""
    province: str = ""
    area_m2: float = 0
    duration_months: int = 12
    royalty_subtotal: float = 0


# =============================================================================
# LIST RESPONSE
# =============================================================================

class ContractListItem(BaseModel):
    id: int | str
    contract_no: str
    customer_name: str
    domain: str
    status: str
    start_date: str | None = None
    end_date: str | None = None
    created_at: str | None = None

    # Extra fields for current frontend list layout (read-only).
    contract_year: int | None = None
    field_code: str | None = None
    region_code: str | None = None
    ten_bang_hieu: str | None = None
    dia_chi_su_dung: str | None = None
    so_tien_value: int | None = None
    renewal_status: str | None = None
    is_renewable: bool | None = None
    loai_hinh_karaoke: str | None = None
    tong_so_phong: int | None = None
    tong_so_box: int | None = None

    # Phase 2 simplified royalty fields (canonical source)
    royalty_amount_before_vat: int | float | None = None
    vat_rate: float | None = None
    vat_amount: int | float | None = None
    royalty_amount_after_vat: int | float | None = None

    # Phase 3: GCN status integrated into contract list
    # Joins certificate_records for the same contract (domain_group=BACKGROUND_WORKSPACE_CODE).
    # Shows certificate status and number directly in the contract row.
    gcn_status: str | None = None  # final_printed | test_printed | draft | no_gcn | null
    gcn_certificate_no: str | None = None
    gcn_certificate_id: int | None = None

    # Music usage areas (Khu vực sử dụng âm nhạc)
    music_usage_areas: list[MusicUsageArea] | None = None


class ContractsListResponse(BaseModel):
    items: list[ContractListItem]
    page: int
    page_size: int
    total: int
    total_pages: int


class ContractCustomer(BaseModel):
    name: str
    signage: str | None = None
    address: str | None = None
    legal_address: str | None = None
    usage_address: str | None = None
    # Partner contact fields
    phone: str | None = None
    email: str | None = None
    representative: str | None = None
    position: str | None = None
    mst: str | None = None


class ContractDomain(BaseModel):
    display: str
    field_code: str | None = None
    domain_group: str | None = None


class ContractDates(BaseModel):
    signed_date: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class ContractFinancial(BaseModel):
    amount: int | None = None
    total_amount: int | None = None
    currency: str = "VND"
    amount_before_gtgt: int | None = None
    gtgt_percent: float | None = None
    gtgt_amount: int | None = None


class ContractKaraoke(BaseModel):
    type: str | None = None
    room_count: int | None = None
    box_count: int | None = None


class ContractDetailResponse(BaseModel):
    id: int
    contract_no: str
    contract_year: int | None = None
    customer: ContractCustomer
    domain: ContractDomain
    dates: ContractDates
    financial: ContractFinancial
    karaoke: ContractKaraoke
    status: str
    raw: dict[str, Any]
    music_usage_areas: list[MusicUsageArea] = []
    # Phase 2 simplified royalty fields (canonical)
    royalty_amount_before_vat: int | None = None
    vat_rate: float | None = None
    vat_amount: int | None = None
    royalty_amount_after_vat: int | None = None
    royalty_amount_in_words: str | None = None


class DryRunCreateContractRequest(BaseModel):
    draft: dict[str, Any] | None = None
    client_preflight: dict[str, Any] | None = None
    client_confirmation: dict[str, Any] | None = None


class DryRunIssue(BaseModel):
    field: str
    message: str
    severity: str = "error"


class DryRunDbMappingItem(BaseModel):
    table: str
    column: str
    value_preview: str | int | float | bool | None = None
    status: str


class DryRunDuplicateMatch(BaseModel):
    source: str
    id: int
    contract_no: str
    contract_year: int | None = None
    customer_name: str | None = None


class DryRunDuplicateChecks(BaseModel):
    contract_no_exists: bool
    matches: list[DryRunDuplicateMatch]


class DryRunPermission(BaseModel):
    allowed: bool
    reason: str


class DryRunCreateContractResponse(BaseModel):
    ok: bool
    mode: str = "dry_run"
    can_create: bool
    errors: list[DryRunIssue]
    warnings: list[DryRunIssue]
    normalized: dict[str, Any]
    db_mapping: list[DryRunDbMappingItem]
    duplicate_checks: DryRunDuplicateChecks
    permission: DryRunPermission
    write_performed: bool = False


class CreateContractWriteGuardResponse(BaseModel):
    ok: bool
    mode: str
    message: str
    write_enabled: bool
    rollback_only: bool = True
    clone_only_enabled: bool = False
    write_performed: bool = False
    rollback_performed: bool = False
    artifacts_generated: bool = False
    idempotency_key: str | None = None
    idempotent_replay: bool = False
    created_preview: dict[str, Any] | None = None
    created: dict[str, Any] | None = None
    dry_run: DryRunCreateContractResponse


class SimpleCreateContractRequest(BaseModel):
    """Simple create: takes whatever is in the form and writes to DB. No dry-run, no strict validation."""
    draft: dict[str, Any] | None = None
    client_preflight: dict[str, Any] | None = None
    # NOTE: `pricing_snapshot` was previously declared here for "Karaoke Template 1"
    # but the live create-and-export path does NOT consume it (frontend only sends
    # {draft, client_preflight}). Word export reads the 3 saved money columns
    # directly from DB. Keep this out of the schema to prevent silent acceptance
    # of an unused field.


class SimpleCreateContractResponse(BaseModel):
    ok: bool
    mode: str = "simple_create"
    message: str
    contract_id: int | None = None
    contract_no: str | None = None
    contract_year: int | None = None
    customer_name: str | None = None
    db_name: str | None = None
    write_performed: bool = False
    errors: list[Any] = []


class CreateAndExportDocxResponse(BaseModel):
    """Official create contract + export DOCX response."""
    ok: bool
    mode: str = "create_and_export"
    error_code: str | None = None
    message: str
    contract_id: int | None = None
    contract_no: str | None = None
    docx_path: str | None = None
    docx_export_skipped: bool = False
    docx_skip_reason: str | None = None
    docx_filename: str | None = None  # Suggested filename for the download
    existing_contract_id: int | None = None
    suggested_next: str | None = None


class CheckContractNoRequest(BaseModel):
    """Request to check contract number availability."""
    contract_no: str | None = None
    short_no: str | None = None
    year: int | None = None
    region_code: str | None = None
    permission_code: str | None = None


class CheckContractNoResponse(BaseModel):
    """Response for contract number availability check."""
    ok: bool
    available: bool
    contract_no: str
    existing_contract_id: int | None = None
    message: str
    suggested_next: str | None = None


class KaraokeMakeHdPreviewRequest(BaseModel):
    draft: dict[str, Any] | None = None
    client_preflight: dict[str, Any] | None = None


class KaraokeMakeHdPreviewResponse(BaseModel):
    ok: bool
    contract_id: int | None = None
    contract_no: str | None = None
    word_path: str | None = None
    preview_path: str | None = None
    file_size: int | None = None
    db_name: str | None = None
    render_context_keys: list[str] = []
    missing_placeholders: list[str] = []
    unresolved_placeholders: list[str] = []
    db_write_performed: bool = False
    docx_path_attached: bool = False
    official_export: bool = False
    gcn_created: bool = False
    warnings: list[str] = []


# =============================================================================
# CONTRACT UPDATE SCHEMAS (PHASE CONTRACTS-ACTIONS-EDIT-01)
# =============================================================================

class UpdateContractRequest(BaseModel):
    """Clone-only update request for a contract record.

    Only a subset of editable fields are accepted.
    Background/Karaoke only. No docx_path attach, no GCN, no old DB.
    """
    # Contract number (fully editable)
    contract_no: str | None = None

    # Contract metadata
    ngay_lap_hop_dong: str | None = None
    contract_year: int | None = None
    region_code: str | None = None
    field_code: str | None = None
    linh_vuc: str | None = None

    # Partner info (safe to edit)
    don_vi_ten: str | None = None
    ten_bang_hieu: str | None = None
    don_vi_dia_chi: str | None = None
    dia_chi_su_dung: str | None = None
    # Post-2025 merger address fields
    legal_address_line: str | None = None
    legal_ward: str | None = None
    legal_province: str | None = None
    legal_full_address: str | None = None
    usage_same_as_legal: bool | None = None
    usage_address_line: str | None = None
    usage_ward: str | None = None
    usage_province: str | None = None
    usage_full_address: str | None = None
    don_vi_dien_thoai: str | None = None
    don_vi_email: str | None = None
    don_vi_nguoi_dai_dien: str | None = None
    don_vi_chuc_vu: str | None = None
    don_vi_mst: str | None = None

    # Assignee info
    nguoi_thuc_hien_email: str | None = None

    # Term info (safe to edit)
    ngay_bat_dau: str | None = None
    ngay_ket_thuc: str | None = None

    # Finance (safe to edit - recalculated by backend)
    so_tien_chua_gtgt_value: int | None = None
    thue_percent: float | None = None
    renewal_status: str | None = None

    # Karaoke info (safe to edit)
    loai_hinh_karaoke: str | None = None
    tong_so_phong: int | None = None
    tong_so_box: int | None = None

    # Music usage areas (Phase 2)
    music_usage_areas: list[MusicUsageArea] | None = None

    # Simplified royalty fields (Phase 2)
    royalty_amount_before_vat: int | None = None
    vat_rate: float | None = None
    vat_amount: int | None = None
    royalty_amount_after_vat: int | None = None
    royalty_amount_in_words: str | None = None

    # Internal note
    contract_note: str | None = None
    contract_terms_note: str | None = None
    # Contract type
    reference_contract_id: int | None = None
    reference_contract_no: str | None = None
    # Source template fields (Phase TEMPLATE-CREATE-01)
    source_template_contract_id: int | None = None
    source_template_contract_no: str | None = None

    class Config:
        extra = "forbid"


class UpdateContractResponse(BaseModel):
    """Response for clone-only contract update."""
    ok: bool
    mode: str
    message: str
    update_enabled: bool
    clone_only_enabled: bool
    write_performed: bool
    contract_id: int | None = None
    contract_no: str | None = None
    updated_fields: list[str] = []
    errors: list[str] = []
    warnings: list[str] = []


class DeleteContractResponse(BaseModel):
    """Response for contract deletion.

    Authorization is based purely on the authenticated user's role/permission
    against the active database. There is no clone-only or DB-mode guard.
    """
    ok: bool
    mode: str
    message: str
    write_performed: bool
    contract_id: int | None = None
    contract_no: str | None = None
    deleted_contract_records: int = 0
    deleted_certificate_records: int = 0
    deleted_related_rows: int = 0
    old_db_touched: bool = False
    blocked_final_certificates: int = 0
    permission_used: str | None = None
    warnings: list[str] = []
    errors: list[str] = []


# =============================================================================
# CONTRACT TEMPLATE SEARCH & PREFILL SCHEMAS (Phase TEMPLATE-CREATE-01)
# =============================================================================

class TemplateSearchItem(BaseModel):
    """A contract returned in template search results."""
    id: int
    contract_no: str
    customer_name: str | None = None
    legal_name: str | None = None
    tax_code: str | None = None
    legal_full_address: str | None = None
    usage_full_address: str | None = None
    domain: str | None = None
    linh_vuc: str | None = None
    domain_group: str | None = None
    field_code: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    renewal_status: str | None = None


class TemplateSearchResponse(BaseModel):
    """Response for template search API."""
    items: list[TemplateSearchItem]
    total: int
    query: str | None = None


class PrefillSourceResponse(BaseModel):
    """Response for prefill source API - sanitized contract data for form prefill."""
    ok: bool
    contract_id: int
    contract_no: str

    # Customer info
    legal_name: str | None = None
    brand_name: str | None = None
    representative_name: str | None = None
    representative_title: str | None = None
    tax_code: str | None = None
    cccd: str | None = None
    phone: str | None = None
    email: str | None = None

    # Legal address
    legal_address_line: str | None = None
    legal_ward: str | None = None
    legal_province: str | None = None
    legal_full_address: str | None = None

    # Usage address
    usage_same_as_legal: bool = True
    usage_address_line: str | None = None
    usage_ward: str | None = None
    usage_province: str | None = None
    usage_full_address: str | None = None

    # Domain info
    domain_code: str | None = None
    domain_display_name: str | None = None
    domain_group: str | None = None
    field_code: str | None = None

    # Music usage areas
    music_usage_areas: list[dict] = []

    # Karaoke info
    karaoke_type: str | None = None
    area_group: str | None = None
    total_rooms: int | None = None
    total_boxes: int | None = None
    room_sections: list[dict] = []

    # Royalty info
    royalty_amount_before_vat: int | None = None
    vat_rate: float | None = None
    vat_amount: int | None = None
    royalty_amount_after_vat: int | None = None
    royalty_amount_in_words: str | None = None

    # Notes
    contract_terms_note: str | None = None
    internal_note: str | None = None


# =============================================================================
# ADMIN DELETE ON MAIN DB SCHEMA
# =============================================================================

class AdminDeleteContractRequest(BaseModel):
    """Admin request to delete contract on main DB. Only for admin users."""
    confirm: bool = False


class AdminDeleteContractResponse(BaseModel):
    """Response for admin contract deletion on main DB."""
    ok: bool
    mode: str
    message: str
    write_performed: bool = False
    contract_id: int | None = None
    contract_no: str | None = None
    deleted_contract_records: int = 0
    deleted_certificate_records: int = 0
    deleted_related_rows: int = 0
    admin_enabled: bool = False
    permission_used: str | None = None
    warnings: list[str] = []
    errors: list[str] = []
