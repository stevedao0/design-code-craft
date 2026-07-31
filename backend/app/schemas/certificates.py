from __future__ import annotations

from pydantic import BaseModel, Field


class CertificateListItem(BaseModel):
    id: int
    certificate_id: int
    contract_id: int
    certificate_no: str | None = None
    certificate_issue_date: str | None = None
    status: str
    domain_group: str
    field_code: str
    organization_name: str | None = None
    business_registration_no: str | None = None
    address: str | None = None
    business_sign_name: str | None = None
    business_location: str | None = None
    contract_no: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    gcn_scope_col_1_text: str | None = None
    gcn_scope_col_2_text: str | None = None
    gcn_scope_col_3_text: str | None = None
    offset_x_mm: float
    offset_y_mm: float
    printed_at: str | None = None
    printed_by: str | None = None
    print_count: int
    last_printed_at: str | None = None
    last_print_file: str | None = None
    last_print_reason: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    has_qr_image: bool = False
    qr_image_data: str | None = None
    contract_visible: bool = True


class CertificateListSummary(BaseModel):
    total: int
    draft: int               # GCN chưa in (status = draft, print_count = 0)
    numbered: int           # GCN đã có số (certificate_no not null, chưa in chính thức)
    official_printed: int   # GCN đã in chính thức (status = final_printed, print_count > 0)
    final_printed: int      # backward compat — same as official_printed
    missing_number: int
    printed_multiple: int   # print_count > 1


class CertificatesListResponse(BaseModel):
    items: list[CertificateListItem]
    page: int
    page_size: int
    total: int
    total_pages: int
    summary: CertificateListSummary
    write_performed: bool = False
    print_enabled: bool = False
    qr_generation_enabled: bool = False


class PendingCertificateContractItem(BaseModel):
    contract_id: int
    contract_no: str
    organization_name: str | None = None
    business_sign_name: str | None = None
    address: str | None = None
    business_location: str | None = None
    field_code: str | None = None
    domain_group: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    royalty_amount_before_vat: int | None = None
    created_at: str | None = None
    has_certificate: bool = False


class PendingCertificatesListResponse(BaseModel):
    items: list[PendingCertificateContractItem]
    page: int
    page_size: int
    total: int
    total_pages: int
    write_performed: bool = False
    print_enabled: bool = False
    qr_generation_enabled: bool = False


class CertificateDetailResponse(BaseModel):
    certificate: CertificateListItem
    print_logs: list[CertificatePrintLogItem] = Field(default_factory=list)
    write_performed: bool = False
    print_enabled: bool = False
    qr_generation_enabled: bool = False


class CertificatePreviewContext(BaseModel):
    mode: str
    certificate_id: int | None = None
    contract_id: int | None = None
    certificate_no: str | None = None
    certificate_issue_date: str | None = None
    certificate_issue_day: str | None = None
    certificate_issue_month: str | None = None
    certificate_issue_year: str | None = None
    contract_no: str
    organization_name: str
    business_registration_no: str
    address: str
    business_sign_name: str
    business_location: str
    gcn_scope_col_1_text: str
    gcn_scope_col_2_text: str
    gcn_scope_col_3_text: str
    effective_from: str | None = None
    effective_to: str | None = None
    offset_x_mm: float = 0.0
    offset_y_mm: float = 0.0
    qr_image_data: str | None = None
    status: str = "draft"
    warnings: list[str] = Field(default_factory=list)


class CertificateContextDryRunResponse(BaseModel):
    ok: bool = True
    mode: str = "context_dry_run"
    context: CertificatePreviewContext
    locked_layout: dict
    write_performed: bool = False
    print_enabled: bool = False
    qr_generation_enabled: bool = False
    artifacts_generated: bool = False


class CertificateCreateDryRunIssue(BaseModel):
    field: str
    message: str
    severity: str = "error"


class CertificateCreateDryRunContract(BaseModel):
    id: int
    contract_no: str


class CertificateCreateDryRunExistingCertificate(BaseModel):
    exists: bool
    certificate_id: int | None = None
    certificate_no: str | None = None
    status: str | None = None
    match_type: str | None = None


class CertificateCreateDryRunProposal(BaseModel):
    status: str = "draft"
    certificate_no_candidate: str | None = None
    certificate_no_strategy: str
    offset_x_mm: float = 0.0
    offset_y_mm: float = 0.0
    context: CertificatePreviewContext


class CertificateCreateDryRunResponse(BaseModel):
    ok: bool = True
    mode: str = "certificate_create_dry_run"
    can_create: bool
    write_performed: bool = False
    certificate_created: bool = False
    certificate_no_allocated: bool = False
    qr_generation_enabled: bool = False
    print_enabled: bool = False
    artifacts_generated: bool = False
    errors: list[CertificateCreateDryRunIssue] = Field(default_factory=list)
    warnings: list[CertificateCreateDryRunIssue] = Field(default_factory=list)
    contract: CertificateCreateDryRunContract
    existing_certificate: CertificateCreateDryRunExistingCertificate
    proposed: CertificateCreateDryRunProposal


class CreateCertificateDraftRequest(BaseModel):
    client_confirmation: dict = Field(default_factory=dict)
    client_certificate_no: str | None = None


class CertificateDraftCreated(BaseModel):
    certificate_id: int
    contract_id: int
    contract_no: str
    certificate_no: str | None = None
    status: str = "draft"


class CreateCertificateDraftResponse(BaseModel):
    ok: bool = True
    mode: str = "certificate_draft_created"
    message: str = "Draft certificate created successfully"
    write_performed: bool = False
    certificate_created: bool = False
    certificate_no_allocated: bool = False
    qr_generation_enabled: bool = False
    print_enabled: bool = False
    artifacts_generated: bool = False
    errors: list[CertificateCreateDryRunIssue] = Field(default_factory=list)
    warnings: list[CertificateCreateDryRunIssue] = Field(default_factory=list)
    created: CertificateDraftCreated | None = None


# Certificate Number Dry-Run Schemas

class CertificateNumberCandidate(BaseModel):
    value: str
    duplicate_exists: bool = False
    duplicate_count: int = 0
    format_warnings: list[str] = Field(default_factory=list)
    format_type: str = "unknown"


class CertificateNumberDryRunCertificate(BaseModel):
    certificate_id: int
    contract_id: int
    current_certificate_no: str | None = None
    status: str
    domain_group: str | None = None
    field_code: str | None = None


class CertificateNumberStrategy(BaseModel):
    type: str
    message: str


class CertificateNumberDryRunResponse(BaseModel):
    ok: bool = True
    mode: str = "certificate_number_dry_run"
    write_performed: bool = False
    certificate_no_allocated: bool = False
    can_assign: bool = True
    certificate: CertificateNumberDryRunCertificate
    candidate: CertificateNumberCandidate | None = None
    strategy: CertificateNumberStrategy
    warnings: list[dict[str, str]] = Field(default_factory=list)
    errors: list[dict[str, str]] = Field(default_factory=list)


class CertificateNumberDryRunRequest(BaseModel):
    candidate_certificate_no: str | None = None


# Certificate Number Assign Schemas

class CertificateNumberAssignRequest(BaseModel):
    certificate_no: str
    allow_duplicate_certificate_no: bool = False
    client_confirmation: dict = Field(default_factory=dict)


class CertificateNumberAssignUpdated(BaseModel):
    certificate_id: int
    contract_id: int
    certificate_no: str
    status: str


class CertificateNumberAssignResponse(BaseModel):
    ok: bool = True
    mode: str = "certificate_number_assigned"
    message: str = "Certificate number assigned successfully"
    write_performed: bool = False
    certificate_no_allocated: bool = False
    qr_generation_enabled: bool = False
    print_enabled: bool = False
    artifacts_generated: bool = False
    warnings: list[dict[str, str]] = Field(default_factory=list)
    errors: list[dict[str, str]] = Field(default_factory=list)
    updated: CertificateNumberAssignUpdated | None = None


# Certificate Update Schemas

class CertificateUpdateRequest(BaseModel):
    certificate_no: str | None = None
    certificate_issue_date: str | None = None
    status: str | None = None
    organization_name: str | None = None
    business_registration_no: str | None = None
    address: str | None = None
    business_sign_name: str | None = None
    business_location: str | None = None
    contract_no: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    gcn_scope_col_1_text: str | None = None
    gcn_scope_col_2_text: str | None = None
    gcn_scope_col_3_text: str | None = None
    qr_image_data: str | None = None
    offset_x_mm: float | None = None
    offset_y_mm: float | None = None


class CertificateUpdateResponse(BaseModel):
    ok: bool = True
    mode: str = "certificate_updated"
    message: str = "Certificate updated"
    update_enabled: bool = True
    clone_only_enabled: bool = True
    write_performed: bool = False
    certificate_id: int | None = None
    updated_fields: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# Certificate Sync Schemas

class CertificateSyncResponse(BaseModel):
    ok: bool = True
    mode: str = "certificate_synced"
    message: str = "Certificate synced from contract"
    sync_enabled: bool = True
    write_performed: bool = False
    certificate_id: int | None = None
    synced_fields: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


# Certificate Print Schemas

class CertificatePrintRequest(BaseModel):
    # mode removed — only official print is supported (no test print workflow)
    reason: str | None = Field(default=None, description="Lý do in lại (nếu có)")


class CertificatePrintResponse(BaseModel):
    ok: bool = True
    mode: str = "certificate_printed"
    message: str = "Certificate printed"
    print_enabled: bool = True
    write_performed: bool = False
    certificate_id: int | None = None
    print_type: str  # "official" or "reprint"
    status_after: str
    print_count: int
    printed_at: str | None = None
    printed_by: str | None = None
    last_printed_at: str | None = None
    last_print_file: str | None = None
    last_print_reason: str | None = None


class CertificatePrintLogItem(BaseModel):
    id: int
    certificate_id: int
    print_no: int
    print_type: str
    printed_at: str
    printed_by: str | None = None
    file_path: str | None = None
    reason: str | None = None
    created_at: str


# Internal QR Portal Automation Schemas

class InternalQrGenerateResponse(BaseModel):
    ok: bool = True
    mode: str = "internal_qr_generated"
    message: str = "QR generated from internal portal"
    certificate_id: int
    qr_status: str  # SUCCESS | FAILED
    action_taken: str = "NONE"  # CREATED_NEW | EXISTING_ROW | NONE
    qr_file_path: str | None = None
    external_ref: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    has_qr_image: bool = False


class InternalQrStatusResponse(BaseModel):
    ok: bool = True
    mode: str = "internal_qr_status"
    certificate_id: int
    has_qr_image: bool = False
    qr_image_data: str | None = None
    qr_file_path: str | None = None


# =============================================================================
# QR FROM PRINT FORM (no pre-existing certificate required)
# =============================================================================

class InternalQrFromPrintFormRequest(BaseModel):
    portal_username: str
    portal_password: str
    certificate_no: str | None = None
    certificate_issue_date: str | None = None
    organization_name: str | None = None
    business_registration_no: str | None = None
    address: str | None = None
    business_sign_name: str | None = None
    business_location: str | None = None
    contract_no: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    gcn_scope_col_1_text: str | None = None
    gcn_scope_col_2_text: str | None = None
    gcn_scope_col_3_text: str | None = None
    field_code: str | None = None


class InternalQrFromPrintFormResponse(BaseModel):
    ok: bool = True
    mode: str = "internal_qr_from_print_form"
    message: str = ""
    qr_status: str  # SUCCESS | FAILED
    action_taken: str = "NONE"  # CREATED_NEW | EXISTING_ROW | NONE
    qr_image_data: str | None = None
    qr_file_path: str | None = None
    portal_certificate_no: str | None = None
    external_ref: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    has_qr_image: bool = False


# =============================================================================
# API-FIRST QR GENERATE (no DB certificate record required)
# =============================================================================

class InternalQrApiFirstRequest(BaseModel):
    portal_username: str
    portal_password: str
    certificate_no: str | None = None
    contract_no: str | None = None
    issue_date: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    organization_name: str | None = None
    address: str | None = None
    tax_code: str | None = None
    brand_name: str | None = None
    usage_address: str | None = None
    domain: str | None = None
    region: str | None = None
    portal_note: str = ""


class InternalQrApiFirstResponse(BaseModel):
    ok: bool = True
    mode: str = "internal_qr_api_first"
    message: str = ""
    qr_status: str  # SUCCESS | FAILED
    action_taken: str = "NONE"  # CREATED_NEW | EXISTING_ROW | NONE
    qr_image_data: str | None = None
    portal_certificate_no: str | None = None
    error_code: str | None = None
    error_message: str | None = None


# =============================================================================
# OPEN-AND-FILL ENDPOINT (visible browser, user confirms save)
# =============================================================================

class InternalQrOpenAndFillRequest(BaseModel):
    portal_username: str
    portal_password: str
    contract_id: int | None = None
    contract_no: str | None = None
    certificate_no: str | None = None
    issue_date: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    organization_name: str | None = None
    brand_name: str | None = None
    tax_code: str | None = None
    address: str | None = None
    usage_address: str | None = None
    domain: str | None = None
    region: str | None = None
    portal_note: str = ""


class InternalQrOpenAndFillResponse(BaseModel):
    ok: bool
    status: str  # PORTAL_FORM_FILLED | EXISTING_ROW_FOUND | VISIBLE_BROWSER_NOT_AVAILABLE | ...
    message: str = ""
    session_id: str | None = None
    error_code: str | None = None
    error_message: str | None = None


# =============================================================================
# DOWNLOAD-AFTER-USER-SAVE ENDPOINT (after user confirms save on portal)
# =============================================================================

class InternalQrDownloadAfterUserSaveRequest(BaseModel):
    portal_username: str
    portal_password: str
    session_id: str | None = None
    certificate_no: str | None = None
    contract_no: str | None = None


class InternalQrDownloadAfterUserSaveResponse(BaseModel):
    ok: bool
    status: str  # QR_DOWNLOADED | ROW_NOT_FOUND | AMBIGUOUS_MATCH | ...
    message: str = ""
    qr_image_data: str | None = None
    portal_certificate_no: str | None = None
    action_taken: str = "NONE"
    error_code: str | None = None
    error_message: str | None = None


# =============================================================================
# OPEN-PORTAL-REVIEW ENDPOINT
# Opens portal in visible browser, auto-fill form, STOP — user manually saves.
# =============================================================================

class InternalQrOpenPortalReviewRequest(BaseModel):
    portal_username: str
    portal_password: str
    contract_no: str | None = None
    certificate_no: str | None = None
    issue_date: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    organization_name: str | None = None
    brand_name: str | None = None
    tax_code: str | None = None
    address: str | None = None
    usage_address: str | None = None
    domain: str | None = None
    region: str | None = None
    portal_note: str = ""


class InternalQrOpenPortalReviewResponse(BaseModel):
    ok: bool
    status: str  # PORTAL_FORM_FILLED_FOR_REVIEW | LOGIN_FAILED | ...
    message: str = ""
    stage: str = ""
    filled_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None
    error_type: str | None = None
    debug_screenshot: str | None = None
    debug_html: str | None = None


# =============================================================================
# STEP-BY-STEP PORTAL QR ACTIONS (4 endpoints)
# =============================================================================

class PortalActionRequest(BaseModel):
    portal_username: str = ""
    portal_password: str | None = None  # None = use saved credential; "" = empty string
    use_saved_credential: bool = False
    remember_password: bool = False
    certificate_no: str | None = None
    contract_no: str | None = None
    issue_date: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    organization_name: str | None = None
    address: str | None = None
    brand_name: str | None = None
    tax_code: str | None = None
    usage_address: str | None = None
    domain: str | None = None
    region: str | None = None
    portal_note: str = ""


class PortalActionResponse(BaseModel):
    ok: bool
    status: str
    message: str = ""
    stage: str = ""
    error_code: str | None = None
    error_message: str | None = None
    error_type: str | None = None
    debug_screenshot: str | None = None
    debug_html: str | None = None
    filled_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    failed_fields: list[str] = Field(default_factory=list)
    search_found: bool = False
    search_count: int = 0
    qr_image_base64: str | None = None
    keep_browser_open: bool = True
    auto_submit: bool = False
    called_ad_add: bool = False
