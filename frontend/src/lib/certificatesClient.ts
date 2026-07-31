import { apiRequest } from "./apiClient";

export type ApiCertificateStatus = "draft" | "test_printed" | "final_printed" | string;

export type ApiCertificateRecord = {
  id: number;
  certificate_id: number;
  contract_id: number;
  certificate_no: string | null;
  certificate_issue_date: string | null;
  status: ApiCertificateStatus;
  domain_group: string;
  field_code: string;
  organization_name: string | null;
  business_registration_no: string | null;
  address: string | null;
  business_sign_name: string | null;
  business_location: string | null;
  contract_no: string | null;
  effective_from: string | null;
  effective_to: string | null;
  gcn_scope_col_1_text: string | null;
  gcn_scope_col_2_text: string | null;
  gcn_scope_col_3_text: string | null;
  offset_x_mm: number;
  offset_y_mm: number;
  printed_at: string | null;
  printed_by: string | null;
  print_count: number;
  last_printed_at: string | null;
  last_print_file: string | null;
  last_print_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  has_qr_image: boolean;
  qr_image_data?: string | null;
  contract_visible: boolean;
};

export type CertificatesSummary = {
  total: number;
  draft: number;
  numbered: number;
  official_printed: number;
  final_printed: number;
  missing_number: number;
  printed_multiple: number;
};

export type CertificatesListResponse = {
  items: ApiCertificateRecord[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  summary: CertificatesSummary;
  write_performed: boolean;
  print_enabled: boolean;
  qr_generation_enabled: boolean;
};

export type CertificateDetailResponse = {
  certificate: ApiCertificateRecord;
  print_logs: CertificatePrintLogItem[];
  write_performed: boolean;
  print_enabled: boolean;
  qr_generation_enabled: boolean;
};

export type CertificatePreviewContext = {
  mode: "existing_certificate" | "contract_preview" | string;
  certificate_id?: number | null;
  contract_id?: number | null;
  certificate_no?: string | null;
  certificate_issue_date?: string | null;
  certificate_issue_day?: string | null;
  certificate_issue_month?: string | null;
  certificate_issue_year?: string | null;
  contract_no: string;
  organization_name: string;
  business_registration_no: string;
  address: string;
  business_sign_name: string;
  business_location: string;
  gcn_scope_col_1_text: string;
  gcn_scope_col_2_text: string;
  gcn_scope_col_3_text: string;
  effective_from?: string | null;
  effective_to?: string | null;
  offset_x_mm: number;
  offset_y_mm: number;
  qr_image_data?: string | null;
  status: string;
  warnings: string[];
};

export type CertificateContextDryRunResponse = {
  ok: boolean;
  mode: "context_dry_run" | string;
  context: CertificatePreviewContext;
  locked_layout: Record<string, unknown>;
  write_performed: boolean;
  print_enabled: boolean;
  qr_generation_enabled: boolean;
  artifacts_generated: boolean;
};

export type CertificatesQuery = {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
  year?: string;
  contract_no?: string;
};

export function listCertificates(token: string, query: CertificatesQuery): Promise<CertificatesListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.page_size) params.set("page_size", String(query.page_size));
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.year) params.set("year", query.year);
  if (query.contract_no) params.set("contract_no", query.contract_no);
  const suffix = params.toString();
  return apiRequest<CertificatesListResponse>(`/certificates${suffix ? `?${suffix}` : ""}`, { token });
}

export function getCertificate(token: string, id: number): Promise<CertificateDetailResponse> {
  return apiRequest<CertificateDetailResponse>(`/certificates/${id}`, { token });
}

export function getCertificateContextDryRun(token: string, id: number): Promise<CertificateContextDryRunResponse> {
  return apiRequest<CertificateContextDryRunResponse>(`/certificates/${id}/context-dry-run`, { token });
}

export function getContractCertificateContextDryRun(token: string, id: number): Promise<CertificateContextDryRunResponse> {
  return apiRequest<CertificateContextDryRunResponse>(`/contracts/${id}/certificate-context-dry-run`, { token });
}

export type CertificateUpdatePayload = {
  certificate_no?: string | null;
  certificate_issue_date?: string | null;
  status?: string | null;
  organization_name?: string | null;
  business_registration_no?: string | null;
  address?: string | null;
  business_sign_name?: string | null;
  business_location?: string | null;
  contract_no?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  gcn_scope_col_1_text?: string | null;
  gcn_scope_col_2_text?: string | null;
  gcn_scope_col_3_text?: string | null;
  qr_image_data?: string | null;
  offset_x_mm?: number | null;
  offset_y_mm?: number | null;
};

export type CertificateUpdateResponse = {
  ok: boolean;
  mode: string;
  message: string;
  update_enabled: boolean;
  // @deprecated — clone DB workflow removed; kept for backward compatibility
  clone_only_enabled: boolean;
  write_performed: boolean;
  certificate_id: number | null;
  updated_fields: string[];
  errors: string[];
  warnings: string[];
};

export type CertificateSyncResponse = {
  ok: boolean;
  mode: string;
  message: string;
  sync_enabled: boolean;
  write_performed: boolean;
  certificate_id: number | null;
  synced_fields: string[];
  errors: string[];
};

export type CertificatePrintResponse = {
  ok: boolean;
  mode: string;
  message: string;
  print_enabled: boolean;
  write_performed: boolean;
  certificate_id: number | null;
  print_type: string;
  status_after: string;
  print_count: number;
  printed_at: string | null;
  printed_by: string | null;
  last_printed_at: string | null;
  last_print_file: string | null;
  last_print_reason: string | null;
};

export type CertificatePrintLogItem = {
  id: number;
  certificate_id: number;
  print_no: number;
  print_type: string;
  printed_at: string;
  printed_by: string | null;
  file_path: string | null;
  reason: string | null;
  created_at: string;
};

export type CertificatePrintLogsResponse = {
  ok: boolean;
  certificate_id: number;
  logs: CertificatePrintLogItem[];
};

export function updateCertificate(token: string, id: number, payload: CertificateUpdatePayload): Promise<CertificateUpdateResponse> {
  return apiRequest<CertificateUpdateResponse>(`/certificates/${id}`, {
    token,
    method: 'PATCH',
    body: payload,
  });
}

export function syncCertificate(token: string, id: number): Promise<CertificateSyncResponse> {
  return apiRequest<CertificateSyncResponse>(`/certificates/${id}/sync`, {
    token,
    method: 'POST',
  });
}

export function printCertificate(
  token: string,
  id: number,
  reason?: string,
): Promise<CertificatePrintResponse> {
  return apiRequest<CertificatePrintResponse>(`/certificates/${id}/print`, {
    token,
    method: 'POST',
    body: { reason: reason || undefined },
  });
}

export type AssignNumberPayload = {
  certificate_no: string;
  allow_duplicate_certificate_no?: boolean;
};

export type AssignNumberResponse = {
  ok: boolean;
  mode: string;
  message: string;
  write_performed: boolean;
  certificate_no_allocated: boolean;
  errors: { field: string; message: string; severity: string }[];
  updated: { certificate_id: number; certificate_no: string; status: string } | null;
};

export function assignCertificateNumber(
  token: string,
  id: number,
  payload: AssignNumberPayload,
): Promise<AssignNumberResponse> {
  return apiRequest<AssignNumberResponse>(`/certificates/${id}/number`, {
    token,
    method: 'PUT',
    body: payload,
  });
}

export function getCertificatePrintLogs(
  token: string,
  id: number,
): Promise<CertificatePrintLogsResponse> {
  return apiRequest<CertificatePrintLogsResponse>(`/certificates/${id}/print-logs`, { token });
}

// =============================================================================
// INTERNAL QR PORTAL AUTOMATION
// =============================================================================

export type InternalQrGenerateResponse = {
  ok: boolean;
  mode: string;
  message: string;
  certificate_id: number;
  qr_status: 'SUCCESS' | 'FAILED' | string;
  action_taken: 'CREATED_NEW' | 'EXISTING_ROW' | 'NONE' | string;
  qr_file_path: string | null;
  external_ref: string | null;
  error_code: string | null;
  error_message: string | null;
  has_qr_image: boolean;
};

export type InternalQrStatusResponse = {
  ok: boolean;
  mode: string;
  certificate_id: number;
  has_qr_image: boolean;
  qr_image_data: string | null;
  qr_file_path: string | null;
};

export function generateInternalQr(token: string, certificateId: number): Promise<InternalQrGenerateResponse> {
  return apiRequest<InternalQrGenerateResponse>(`/certificates/${certificateId}/generate-internal-qr`, {
    token,
    method: 'POST',
  });
}

export function getQrStatus(token: string, certificateId: number): Promise<InternalQrStatusResponse> {
  return apiRequest<InternalQrStatusResponse>(`/certificates/${certificateId}/qr-status`, {
    token,
  });
}


// =============================================================================
// QR FROM PRINT FORM (no pre-existing certificate required)
// =============================================================================

export type QrFromFormResponse = {
  ok: boolean;
  mode: string;
  message: string;
  qr_status: string;
  action_taken: 'CREATED_NEW' | 'EXISTING_ROW' | 'NONE' | string;
  qr_image_data: string | null;
  qr_file_path: string | null;
  portal_certificate_no: string | null;
  external_ref: string | null;
  error_code: string | null;
  error_message: string | null;
  has_qr_image: boolean;
};

export type QrFromFormParams = {
  portal_username: string;
  portal_password: string;
  certificate_no?: string | null;
  certificate_issue_date?: string | null;
  organization_name?: string | null;
  business_registration_no?: string | null;
  address?: string | null;
  business_sign_name?: string | null;
  business_location?: string | null;
  contract_no?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  gcn_scope_col_1_text?: string | null;
  gcn_scope_col_2_text?: string | null;
  gcn_scope_col_3_text?: string | null;
  field_code?: string | null;
};

/**
 * Generate QR code from print form data using the internal portal.
 * POST /api/certificates/internal-qr/from-print-form
 *
 * This endpoint:
 * - Does NOT require a pre-existing certificate record
 * - Accepts portal credentials from the UI
 * - Accepts all certificate form fields
 * - Searches for existing rows to avoid duplicates
 * - Returns QR image data and portal certificate number
 */
export function generateQrFromForm(
  token: string,
  params: QrFromFormParams
): Promise<QrFromFormResponse> {
  return apiRequest<QrFromFormResponse>(
    "/certificates/internal-qr/from-print-form",
    {
      method: "POST",
      token,
      body: params,
    }
  );
}


// =============================================================================
// API-FIRST QR GENERATION (credentials + form data, no DB cert required)
// =============================================================================

export type InternalQrApiFirstParams = {
  portal_username: string;
  portal_password: string;
  certificate_no?: string | null;
  contract_no?: string | null;
  issue_date?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  organization_name?: string | null;
  address?: string | null;
  tax_code?: string | null;
  brand_name?: string | null;
  usage_address?: string | null;
  domain?: string | null;
  region?: string | null;
  portal_note?: string;
};

export type InternalQrApiFirstResponse = {
  ok: boolean;
  mode: string;
  message: string;
  qr_status: 'SUCCESS' | 'FAILED' | string;
  action_taken: 'CREATED_NEW' | 'EXISTING_ROW' | 'NONE' | string;
  qr_image_data: string | null;
  portal_certificate_no: string | null;
  error_code: string | null;
  error_message: string | null;
};

/**
 * Generate QR via API-first approach (no Playwright, no pre-existing DB cert).
 * Credentials passed in request body — NOT stored.
 * POST /api/certificates/internal-qr/api-first/generate
 */
export function generateQrApiFirst(
  params: InternalQrApiFirstParams,
): Promise<InternalQrApiFirstResponse> {
  return apiRequest<InternalQrApiFirstResponse>(
    "/certificates/internal-qr/api-first/generate",
    {
      method: "POST",
      // No auth token needed — credentials are in the body
      body: params,
    }
  );
}


// =============================================================================
// OPEN-AND-FILL ENDPOINT (visible browser, user manually confirms save)
// =============================================================================

export type InternalQrOpenAndFillParams = {
  portal_username: string;
  portal_password: string;
  contract_id?: number | null;
  contract_no?: string | null;
  certificate_no?: string | null;
  issue_date?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  organization_name?: string | null;
  brand_name?: string | null;
  tax_code?: string | null;
  address?: string | null;
  usage_address?: string | null;
  domain?: string | null;
  region?: string | null;
  portal_note?: string;
};

export type InternalQrOpenAndFillResponse = {
  ok: boolean;
  status: string;  // PORTAL_FORM_FILLED | EXISTING_ROW_FOUND | ...
  message: string;
  session_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

/**
 * Open portal in visible browser, auto-fill form, and STOP.
 * User must manually click Lưu on the portal.
 * POST /api/certificates/internal-qr/open-and-fill
 */
export function openAndFillPortal(
  params: InternalQrOpenAndFillParams,
): Promise<InternalQrOpenAndFillResponse> {
  return apiRequest<InternalQrOpenAndFillResponse>(
    "/certificates/internal-qr/open-and-fill",
    {
      method: "POST",
      body: params,
    }
  );
}


// =============================================================================
// DOWNLOAD QR AFTER USER SAVE (API-first, no browser)
// =============================================================================

export type InternalQrDownloadAfterUserSaveParams = {
  portal_username: string;
  portal_password: string;
  session_id?: string | null;
  certificate_no?: string | null;
  contract_no?: string | null;
};

export type InternalQrDownloadAfterUserSaveResponse = {
  ok: boolean;
  status: string;  // QR_DOWNLOADED | ROW_NOT_FOUND | AMBIGUOUS_MATCH | ...
  message: string;
  qr_image_data: string | null;
  portal_certificate_no: string | null;
  action_taken: string;
  error_code: string | null;
  error_message: string | null;
};

/**
 * After user manually saves on the portal, download the QR code.
 * Uses API-first approach (no browser).
 * POST /api/certificates/internal-qr/download-after-user-save
 */
export function downloadQrAfterUserSave(
  params: InternalQrDownloadAfterUserSaveParams,
): Promise<InternalQrDownloadAfterUserSaveResponse> {
  return apiRequest<InternalQrDownloadAfterUserSaveResponse>(
    "/certificates/internal-qr/download-after-user-save",
    {
      method: "POST",
      body: params,
    }
  );
}


// =============================================================================
// OPEN PORTAL FOR REVIEW — visible browser, fill form, STOP (no submit)
// Opens portal in visible browser, auto-fill form, and waits for user to save.
// =============================================================================

export type OpenPortalReviewParams = {
  portal_username: string;
  portal_password?: string;
  use_saved_credential?: boolean;
  contract_no?: string | null;
  certificate_no?: string | null;
  issue_date?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  organization_name?: string | null;
  brand_name?: string | null;
  tax_code?: string | null;
  address?: string | null;
  usage_address?: string | null;
  domain?: string | null;
  region?: string | null;
  portal_note?: string;
};

export type OpenPortalReviewResponse = {
  ok: boolean;
  status: string;
  message: string;
  stage: string;
  filled_fields: string[];
  missing_fields: string[];
  error_code: string | null;
  error_message: string | null;
  error_type: string | null;
  debug_screenshot: string | null;
  debug_html: string | null;
};

export type PortalActionResponse = {
  ok: boolean;
  status: string;
  message: string;
  stage: string;
  error_code: string | null;
  error_message: string | null;
  error_type: string | null;
  debug_screenshot: string | null;
  debug_html: string | null;
  filled_fields: string[];
  missing_fields: string[];
  failed_fields: string[];
  search_found: boolean;
  search_count: number;
  qr_image_base64: string | null;
  keep_browser_open: boolean;
  auto_submit: boolean;
  called_ad_add: boolean;
};

/**
 * Check whether Playwright automation is available for the current client.
 * GET /api/certificates/internal-qr/portal/runtime-mode
 *
 * Detects whether the request comes from localhost or a remote client,
 * and whether QR_PORTAL_ALLOW_REMOTE_PLAYWRIGHT is enabled.
 *
 * Returns: { ok, is_local_client, automation_available, reason, portal_url }
 */
export async function getPortalRuntimeMode(): Promise<{
  ok: boolean;
  is_local_client: boolean;
  automation_available: boolean;
  reason: "local" | "remote_client";
  portal_url: string;
}> {
  return apiRequest<{
    ok: boolean;
    is_local_client: boolean;
    automation_available: boolean;
    reason: "local" | "remote_client";
    portal_url: string;
  }>(
    "/certificates/internal-qr/portal/runtime-mode",
    { method: "GET" }
  );
}

/**
 * Step 1: Open portal QR in visible browser, auto-login.
 * POST /api/certificates/internal-qr/portal/open
 * @param useSavedCredential - if true, use saved credentials (decrypted server-side)
 */
export function portalOpen(params: OpenPortalReviewParams, signal?: AbortSignal): Promise<PortalActionResponse> {
  return apiRequest<PortalActionResponse>(
    "/certificates/internal-qr/portal/open",
    { method: "POST", body: params, signal }
  );
}

/**
 * Step 2: Fill the already-open form on the portal.
 * POST /api/certificates/internal-qr/portal/fill-form
 */
export function portalFillForm(params: OpenPortalReviewParams, signal?: AbortSignal): Promise<PortalActionResponse> {
  return apiRequest<PortalActionResponse>(
    "/certificates/internal-qr/portal/fill-form",
    { method: "POST", body: params, signal }
  );
}

/**
 * Step 3: Search for record by certificate number or contract number.
 * POST /api/certificates/internal-qr/portal/search
 */
export function portalSearch(params: OpenPortalReviewParams, signal?: AbortSignal): Promise<PortalActionResponse> {
  return apiRequest<PortalActionResponse>(
    "/certificates/internal-qr/portal/search",
    { method: "POST", body: params, signal }
  );
}

/**
 * Step 4: Download QR image from found record.
 * POST /api/certificates/internal-qr/portal/download-qr
 */
export function portalDownloadQr(params: OpenPortalReviewParams, signal?: AbortSignal): Promise<PortalActionResponse> {
  return apiRequest<PortalActionResponse>(
    "/certificates/internal-qr/portal/download-qr",
    { method: "POST", body: params, signal }
  );
}

/**
 * Opens the internal QR portal in a VISIBLE browser, logs in, clicks "Thêm mới",
 * fills the form with provided data, and STOPS.
 * Does NOT submit, does NOT call /ad/add, does NOT download QR.
 * POST /api/certificates/internal-qr/open-portal-review
 */
export function openPortalReview(
  params: OpenPortalReviewParams,
): Promise<OpenPortalReviewResponse> {
  return apiRequest<OpenPortalReviewResponse>(
    "/certificates/internal-qr/open-portal-review",
    {
      method: "POST",
      body: params,
    }
  );
}


// =============================================================================
// PORTAL CREDENTIAL — per-user saved credentials for QR portal
// =============================================================================

export type CredentialGetResponse = {
  ok: boolean;
  portal_url: string;
  portal_username: string | null;
  has_saved_password: boolean;
  // Convenience: "saved" | "username_only" | "not_saved" | "error"
  credential_status?: string;
};

export type CredentialSaveParams = {
  portal_username: string;
  portal_password?: string;
  remember_password: boolean;
};

export type CredentialSaveResponse = {
  ok: boolean;
  portal_url: string;
  portal_username: string;
  has_saved_password: boolean;
  message: string;
  error_code: string | null;
};

export type CredentialDeleteResponse = {
  ok: boolean;
  portal_url: string;
  message: string;
};

/**
 * Get saved portal credentials for the current authenticated user.
 * Password is NEVER returned — only has_saved_password flag.
 * GET /api/certificates/internal-qr/portal/credential
 */
export function getPortalCredential(token: string): Promise<CredentialGetResponse> {
  return apiRequest<CredentialGetResponse>(
    "/certificates/internal-qr/portal/credential",
    { token }
  );
}

/**
 * Save portal credentials for the current authenticated user.
 * Password is encrypted at rest in the backend — never stored in plaintext.
 * PUT /api/certificates/internal-qr/portal/credential
 */
export function savePortalCredential(
  token: string,
  params: CredentialSaveParams,
): Promise<CredentialSaveResponse> {
  return apiRequest<CredentialSaveResponse>(
    "/certificates/internal-qr/portal/credential",
    { token, method: "PUT", body: params }
  );
}

/**
 * Delete saved portal credentials for the current authenticated user.
 * DELETE /api/certificates/internal-qr/portal/credential
 */
export function deletePortalCredential(token: string): Promise<CredentialDeleteResponse> {
  return apiRequest<CredentialDeleteResponse>(
    "/certificates/internal-qr/portal/credential",
    { token, method: "DELETE" }
  );
}

// =============================================================================
// BOOKMARKLET DRAFT — in-memory draft for QR portal bookmarklet
// =============================================================================

export type BookmarkletDraftData = {
  contract_no: string | null;
  certificate_no: string | null;
  organization_name: string | null;
  effective_from: string | null;
  effective_to: string | null;
  tax_code: string | null;
  brand_name: string | null;
  address: string | null;
  usage_address: string | null;
  region: string | null;
  domain: string | null;
  created_at: string | null;
  expires_in_seconds: number | null;
};

export type BookmarkletDraftCreateParams = {
  client_key: string;
  contract_no?: string | null;
  certificate_no?: string | null;
  organization_name?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  tax_code?: string | null;
  brand_name?: string | null;
  address?: string | null;
  usage_address?: string | null;
  region?: string | null;
  domain?: string | null;
};

export type BookmarkletDraftCreateResponse = {
  ok: boolean;
  message: string;
  draft_id: string;
};

export type BookmarkletDraftGetResponse = {
  ok: boolean;
  found: boolean;
  message: string;
  draft: BookmarkletDraftData | null;
};

/**
 * Save a QR bookmarklet draft (10-minute TTL).
 * POST /api/certificates/internal-qr/bookmarklet-drafts
 */
export function createBookmarkletDraft(
  params: BookmarkletDraftCreateParams,
): Promise<BookmarkletDraftCreateResponse> {
  return apiRequest<BookmarkletDraftCreateResponse>(
    "/certificates/internal-qr/bookmarklet-drafts",
    { method: "POST", body: params }
  );
}

/**
 * Get the latest non-expired draft for a client_key.
 * GET /api/certificates/internal-qr/bookmarklet-drafts/latest?client_key=...
 */
export function getLatestBookmarkletDraft(
  clientKey: string,
): Promise<BookmarkletDraftGetResponse> {
  return apiRequest<BookmarkletDraftGetResponse>(
    `/certificates/internal-qr/bookmarklet-drafts/latest?client_key=${encodeURIComponent(clientKey)}`
  );
}


// =============================================================================
// CHROME EXTENSION — QR Portal Automation (content-script bridge)
// All communication uses window.postMessage → content-app-bridge.js → chrome.runtime
// NEVER call chrome.runtime.sendMessage directly from webpage JavaScript
// =============================================================================

// ── Bridge helpers ─────────────────────────────────────────────────────────────

function _generateRequestId(): string {
  return `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const _EXTENSION_TIMEOUT_MS = 120_000;

async function _sendViaBridge(
  messageType: string,
  payload: unknown,
  timeoutMs: number = _EXTENSION_TIMEOUT_MS,
): Promise<ExtensionResponse> {
  if (typeof window === "undefined" || !window.postMessage) {
    throw new Error("postMessage not available in this context");
  }

  const requestId = _generateRequestId();

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Extension bridge timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", _listener);
    };

    const _listener = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "VCPMC_QR_HELPER") return;
      if (data.type !== "VCPMC_QR_HELPER_RESPONSE") return;
      if (data.requestId !== requestId) return;

      if (settled) return;
      settled = true;
      cleanup();

      // Extension returns { ok: true, ... } on success or { ok: false, error_code, stage, message, ... } on error.
      // Bridge wraps chrome.runtime.lastError with { ok: false, error_code, stage, message, request_type }.
      // Build a structured Error so catch handlers can read error_code / stage / message.
      if (data.ok !== true) {
        const err = new Error(data.message || data.error || "Extension returned error") as Error & {
          error_code?: string; stage?: string; request_type?: string;
        };
        err.error_code = data.error_code || data.status || "EXTENSION_ERROR";
        err.stage = data.stage || "EXTENSION";
        err.request_type = data.request_type || null;
        reject(err);
        return;
      }

      resolve(data as ExtensionResponse);
    };

    window.addEventListener("message", _listener);

    window.postMessage(
      { source: "VCPMC_APP", type: messageType, requestId, payload },
      window.location.origin
    );
  });
}

// ── Public Extension API ─────────────────────────────────────────────────────────

/**
 * Check if VCPMC QR Portal Helper extension is installed and responding.
 *
 * Uses the content-script bridge (window.postMessage → content-app-bridge.js → chrome.runtime):
 * 1. Sends window.postMessage({ source: "VCPMC_APP", type: "VCPMC_QR_HELPER_PING", requestId })
 * 2. content-app-bridge.js forwards to extension background via chrome.runtime.sendMessage
 * 3. Extension responds: { source: "VCPMC_QR_HELPER", type: "VCPMC_QR_HELPER_RESPONSE", requestId, ok, service }
 * 4. We wait 800ms. If response ok and service === "vcpmc-qr-helper" => extensionAvailable=true.
 *
 * This approach avoids hardcoded extension IDs and works from any webpage origin.
 *
 * @param timeoutMs - How long to wait for a response (default: 800ms)
 */
export async function checkExtensionAvailable(timeoutMs = 800): Promise<boolean> {
  if (typeof window === "undefined" || !window.postMessage) {
    return false;
  }

  return new Promise((resolve) => {
    const requestId = _generateRequestId();
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(false);
      }
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("message", listener);
    }

    const listener = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "VCPMC_QR_HELPER") return;
      if (data.type !== "VCPMC_QR_HELPER_RESPONSE") return;
      if (data.requestId !== requestId) return;

      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(data.ok === true && data.service === "vcpmc-qr-helper");
      }
    };

    window.addEventListener("message", listener);

    window.postMessage(
      { source: "VCPMC_APP", type: "VCPMC_QR_HELPER_PING", requestId },
      window.location.origin
    );
  });
}

/** Minimum extension version required by this app */
export const MIN_EXTENSION_VERSION = "2.2";

export type ExtensionStatus =
  | { detected: false; reason: "not_installed" | "not_responding" }
  | { detected: true; version: string; outdated: false }
  | { detected: true; version: string; outdated: true; minVersion: string };

/**
 * Check extension presence AND version.
 * Detects three states:
 *   1. Extension not installed / not responding
 *   2. Extension installed but outdated
 *   3. Extension installed and up-to-date (version >= MIN_EXTENSION_VERSION)
 *
 * Uses the GET_QR_HELPER_STATUS message which returns { version, service }.
 *
 * @param timeoutMs - How long to wait for a response (default: 800ms)
 */
export async function checkExtensionWithVersion(
  timeoutMs = 800,
): Promise<ExtensionStatus> {
  if (typeof window === "undefined" || !window.postMessage) {
    return { detected: false, reason: "not_installed" };
  }

  return new Promise((resolve) => {
    const requestId = _generateRequestId();
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ detected: false, reason: "not_responding" });
      }
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("message", listener);
    }

    function isNewerOrEqual(v: string, min: string): boolean {
      const parse = (s: string) =>
        s.split(".").map((p) => parseInt(p, 10) || 0);
      const vp = parse(v);
      const mp = parse(min);
      for (let i = 0; i < Math.max(vp.length, mp.length); i++) {
        const vi = vp[i] || 0;
        const mi = mp[i] || 0;
        if (vi > mi) return true;
        if (vi < mi) return false;
      }
      return true;
    }

    const listener = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "VCPMC_QR_HELPER") return;
      if (data.type !== "VCPMC_QR_HELPER_RESPONSE") return;
      if (data.requestId !== requestId) return;

      if (!resolved) {
        resolved = true;
        cleanup();
        if (data.ok !== true || data.service !== "vcpmc-qr-helper") {
          resolve({ detected: false, reason: "not_installed" });
          return;
        }
        const version: string = data.version || "0.0";
        const outdated = !isNewerOrEqual(version, MIN_EXTENSION_VERSION);
        resolve({
          detected: true,
          version,
          outdated,
          ...(outdated ? { minVersion: MIN_EXTENSION_VERSION } : {}),
        });
      }
    };

    window.addEventListener("message", listener);

    window.postMessage(
      { source: "VCPMC_APP", type: "VCPMC_QR_HELPER_PING", requestId },
      window.location.origin
    );
  });
}

/** Payload for the extension's QR_PORTAL_OPEN_AND_WATCH message */
export type ExtensionOpenWatchParams = {
  portal_url?: string;
  portal_username: string;
  portal_password: string;
  form_payload: {
    contract_no?: string | null;
    certificate_no?: string | null;
    organization_name?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    tax_code?: string | null;
    brand_name?: string | null;
    address?: string | null;
    usage_address?: string | null;
    region?: string | null;
    domain?: string | null;
    portal_note?: string | null;
  };
};

/** Response shape from the extension */
export type ExtensionResponse = {
  ok: boolean;
  status: string;
  message?: string;
  error_code?: string | null;
  error_message?: string | null;
  stage?: string | null;
  request_type?: string | null;
  filled_fields?: string[];
  missing_fields?: string[];
  failed_fields?: string[];
};

/**
 * Call the VCPMC QR Portal Helper extension to open portal and fill form.
 *
 * Uses content-script bridge (window.postMessage → content-app-bridge.js → chrome.runtime).
 * This is the ONLY valid way for a webpage to communicate with the extension.
 *
 * NEVER call chrome.runtime.sendMessage directly from webpage JavaScript.
 *
 * @param params - Portal credentials and form data
 * @param signal - AbortSignal for cancellation
 */
export async function callExtension(
  params: ExtensionOpenWatchParams,
  signal?: AbortSignal,
): Promise<ExtensionResponse> {
  if (signal?.aborted) {
    throw new Error("Extension call aborted");
  }

  try {
    return await _sendViaBridge("VCPMC_QR_PORTAL_AUTO_ADD_AND_FILL", params);
  } catch (err) {
    if (signal?.aborted) {
      throw new Error("Extension call aborted");
    }
    throw err;
  }
}

/**
 * Get current QR extension status (for polling after open_and_watch).
 * Returns the status object with filled_fields, status, message, etc.
 */
export async function getExtensionStatus(
  signal?: AbortSignal,
): Promise<{
  ok: boolean;
  status: string;
  message: string;
  filled_fields: string[];
  missing_fields: string[];
  failed_fields: string[];
}> {
  if (signal?.aborted) {
    throw new Error("Status poll aborted");
  }

  try {
    return await _sendViaBridge("QR_HELPER_GET_STATUS", {});
  } catch (err) {
    if (signal?.aborted) {
      throw new Error("Status poll aborted");
    }
    throw err;
  }
}

/**
 * STEP 1: Open portal and login only (no fill).
 * Returns PORTAL_LOGGED_IN_WAITING_FOR_FILL status.
 */
export async function openPortalLoginOnly(
  params: {
    portal_username: string;
    portal_password: string;
  },
  signal?: AbortSignal,
): Promise<ExtensionResponse> {
  if (signal?.aborted) {
    throw new Error("Login only call aborted");
  }

  try {
    return await _sendViaBridge("QR_PORTAL_OPEN_LOGIN_ONLY", params);
  } catch (err) {
    if (signal?.aborted) {
      throw new Error("Login only call aborted");
    }
    throw err;
  }
}

/**
 * STEP 2: Open add form and fill (called after login only).
 */
export async function openAddAndFill(
  params: {
    portal_username: string;
    portal_password: string;
    form_payload: Record<string, unknown>;
  },
  signal?: AbortSignal,
): Promise<ExtensionResponse> {
  if (signal?.aborted) {
    throw new Error("Fill call aborted");
  }

  try {
    return await _sendViaBridge("QR_PORTAL_OPEN_ADD_AND_FILL", params);
  } catch (err) {
    if (signal?.aborted) {
      throw new Error("Fill call aborted");
    }
    throw err;
  }
}
