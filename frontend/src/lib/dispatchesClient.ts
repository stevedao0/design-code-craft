import { apiRequest, apiBaseUrl } from "./apiClient";
import { getToken } from "./authClient";

// =============================================================================
// Authenticated file download (includes Bearer token)
// =============================================================================

export async function downloadFile(path: string): Promise<void> {
  const token = getToken();
  const url = getDownloadUrl(path);
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const urlObj = new URL(url, window.location.origin);
  const filename = urlObj.pathname.split("/").pop() || "download.docx";
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

// =============================================================================
// Types
// =============================================================================

export type DispatchItem = {
  id: number;
  batch_id: number;
  cong_van_no: string;
  issue_date: string;
  contract_no: string;
  recipient_unit: string;
  recipient_address: string;
  recipient_contact: string;
  recipient_phone: string;
  status: string;
  docx_path: string;
  download_url: string;
  batch_merged_download_url: string;
  batch_envelope_download_url: string;
  batch_envelope_calibration_download_url: string;
  batch_total_items: number;
  batch_envelope_total_items: number;
  batch_envelope_generated_at: string;
  note: string;
  contacted: boolean;
  contact_status: string;
  delivery_status: string;
  tracking_progress: string;
  latest_action: string;
};

export type DispatchDetail = DispatchItem & {
  expiry_date: string;
};

export type ExpiredContractItem = {
  contract_id: number;
  so_hop_dong: string;
  contract_no: string;
  contract_year: number;
  don_vi_ten: string;
  ngay_ky_hop_dong: string;
  ngay_het_hieu_luc_hd: string;
  days_expired: number;
  cong_van_count: number;
  recipient_address?: string;
  ten_bang_hieu?: string;
  latest_dispatch_no?: string;
  latest_dispatch_date?: string;
  latest_dispatch_status?: string;
};

export type PaginatedResponse<T> = {
  ok: boolean;
  rows: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type DispatchLog = {
  id: number;
  action_type: string;
  status_after: string;
  note: string;
  actor: string;
  created_at: string;
};

export type CreateRenewalResponse = {
  ok: boolean;
  rows: {
    id: number;
    batch_id: number;
    cong_van_no: string;
    contract_no: string;
    attempt_no: number;
    recipient_unit: string;
    recipient_address?: string;
    download_url: string;
  }[];
  merged_download_url: string;
  envelope_download_url: string;
  envelope_filename?: string;
  envelope_generated_at?: string;
  total_created: number;
  batch_cong_van_no: string;
  batch_id: number;
  error?: string;
};

export type NewKaraokeProspectRow = {
  stt?: string;
  ten_don_vi: string;
  dia_chi: string;
  so_cong_van?: string;
  ngay_ky_cong_van?: string;
  thang_ky_cong_van?: string;
  nam_ky_cong_van?: string;
  /** Optional per-row envelope recipient override */
  nguoi_nhan_bia_thu?: string;
  /** Optional per-row phone */
  so_dien_thoai?: string;
};

export type NewKaraokeIssue = {
  row_index: number;
  missing_fields: string[];
  message: string;
};

export type CreateNewKaraokeResponse = {
  ok: boolean;
  rows: NewKaraokeCreatedItem[];
  merged_download_url: string;
  envelope_download_url: string;
  envelope_filename?: string;
  envelope_generated_at?: string;
  total_created: number;
  total_files: number;
  batch_cong_van_no: string;
  batch_id: number;
  issues?: NewKaraokeIssue[];
  template_name?: string;
  placeholders?: string[];
  ready_count?: number;
  total_input?: number;
  error?: string;
};

export type NewKaraokeCreatedItem = {
  id: number;
  batch_id: number;
  cong_van_no: string;
  contract_no: string;
  attempt_no: number;
  recipient_unit: string;
  recipient_address: string;
  so_dien_thoai: string;
  nguoi_nhan_bia_thu: string;
  dong_nguoi_nhan_bia_thu: string;
  lan_gui: number;
  trang_thai_lien_he: string;
  trang_thai_hop_dong: string;
  download_url: string;
};

// =============================================================================
// Batch types
// =============================================================================

export type BatchItem = {
  id: number;
  batch_id: number;
  cong_van_no: string;
  issue_date: string;
  contract_no: string;
  recipient_unit: string;
  recipient_address: string;
  so_dien_thoai: string;
  nguoi_nhan_bia_thu: string;
  dong_nguoi_nhan_bia_thu: string;
  attempt_no: number;
  lan_gui: number;
  dispatch_type: string;
  status: string;
  trang_thai_lien_he: string;
  trang_thai_hop_dong: string;
  ngay_lien_he_gan_nhat: string | null;
  ghi_chu_lien_he: string;
  ngay_ky_hop_dong: string | null;
  contract_id: number | null;
  download_url: string;
  envelope_download_url: string;
  created_at: string;
};

export type BatchDetail = {
  id: number;
  cong_van_no: string;
  issue_date: string;
  dispatch_type: string;
  template_name: string;
  total_items: number;
  ready_items: number;
  missing_items: number;
  create_envelope: boolean;
  merge_output: boolean;
  envelope_recipient_mode: string;
  envelope_custom_prefix: string;
  note: string;
  created_by: string;
  created_at: string;
  merged_download_url: string;
  envelope_download_url: string;
  items: BatchItem[];
};

export type BatchListItem = {
  id: number;
  cong_van_no: string;
  issue_date: string;
  dispatch_type: string;
  template_name: string;
  total_items: number;
  ready_items: number;
  missing_items: number;
  create_envelope: boolean;
  merge_output: boolean;
  note: string;
  created_by: string;
  created_at: string;
  merged_download_url: string;
  envelope_download_url: string;
  envelope_generated_at: string;
  envelope_total_items: number;
};

export type UpdateStatusResponse = {
  ok: boolean;
  id: number;
  status: string;
  error?: string;
};

// =============================================================================
// Tracking types
// =============================================================================

export type TrackingUpdateParams = {
  trang_thai_lien_he?: string;
  trang_thai_hop_dong?: string;
  ngay_lien_he_gan_nhat?: string;
  ghi_chu_lien_he?: string;
  contract_id?: number | null;
  so_hop_dong?: string;
  ngay_ky_hop_dong?: string;
};

export type TrackingUpdateResponse = {
  ok: boolean;
  id: number;
  trang_thai_lien_he: string;
  trang_thai_hop_dong: string;
  ngay_lien_he_gan_nhat: string | null;
  ghi_chu_lien_he: string;
  contract_id: number | null;
  contract_no: string;
  ngay_ky_hop_dong: string | null;
  error?: string;
};

export type TrackingItem = {
  id: number;
  batch_id: number;
  cong_van_no: string;
  issue_date: string;
  recipient_unit: string;
  recipient_address: string;
  so_dien_thoai: string;
  dong_nguoi_nhan_bia_thu: string;
  lan_gui: number;
  trang_thai_lien_he: string;
  trang_thai_hop_dong: string;
  ngay_lien_he_gan_nhat: string | null;
  ghi_chu_lien_he: string;
  ngay_ky_hop_dong: string | null;
  contract_id: number | null;
  contract_no: string;
  dispatch_type: string;
  download_url: string;
  envelope_download_url: string;
  batch_cong_van_no: string;
  created_at: string;
};

// Batch edit
export type BatchUpdatePayload = {
  cong_van_no?: string;
  issue_date?: string;
  note?: string;
  envelope_recipient_mode?: string;
  envelope_custom_prefix?: string;
};

export type BatchUpdateResponse = {
  ok: boolean;
  id: number;
  warning?: string;
  changes: string[];
  cong_van_no: string;
  issue_date: string;
  note: string;
  envelope_recipient_mode: string;
  envelope_custom_prefix: string;
  error?: string;
};

// Item edit
export type ItemUpdatePayload = {
  recipient_unit?: string;
  recipient_address?: string;
  recipient_phone?: string;
  recipient_contact?: string;
  trang_thai_lien_he?: string;
  ngay_lien_he_gan_nhat?: string;
  ghi_chu_lien_he?: string;
  trang_thai_hop_dong?: string;
  contract_no?: string;
  so_hop_dong?: string;
  ngay_ky_hop_dong?: string;
};

export type ItemUpdateResponse = {
  ok: boolean;
  id: number;
  warning?: string;
  changes: string[];
  recipient_unit: string;
  recipient_address: string;
  recipient_phone: string;
  recipient_contact: string;
  trang_thai_lien_he: string;
  ngay_lien_he_gan_nhat: string | null;
  ghi_chu_lien_he: string;
  trang_thai_hop_dong: string;
  contract_no: string;
  ngay_ky_hop_dong: string | null;
  error?: string;
};

// Soft delete responses
export type SoftDeleteBatchResponse = {
  ok: boolean;
  id: number;
  deleted_item_count: number;
  message: string;
  error?: string;
};

export type SoftDeleteItemResponse = {
  ok: boolean;
  id: number;
  message: string;
  error?: string;
};

export type RestoreBatchResponse = {
  ok: boolean;
  id: number;
  restored_item_count: number;
  message: string;
  error?: string;
};

export type RestoreItemResponse = {
  ok: boolean;
  id: number;
  message: string;
  error?: string;
};

// =============================================================================
// API Functions
// =============================================================================

export async function getDispatches(params: {
  status?: string;
  year?: number;
  limit?: number;
}): Promise<DispatchItem[]> {
  const token = getToken();
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.year) query.set("year", String(params.year));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  const data = await apiRequest<{ ok: boolean; rows: DispatchItem[] }>(
    `/dispatches${qs ? `?${qs}` : ""}`,
    { token }
  );
  return data.rows || [];
}

export async function getDispatch(id: number): Promise<DispatchDetail> {
  const token = getToken();
  const data = await apiRequest<{ ok: boolean; row: DispatchDetail }>(
    `/dispatches/${id}`,
    { token }
  );
  return data.row;
}

export async function deleteDispatch(id: number): Promise<void> {
  const token = getToken();
  await apiRequest(`/dispatches/${id}`, { method: "DELETE", token });
}

export async function getExpiredContracts(params: {
  filter_mode?: string;
  filter_year?: number;
  filter_quarter?: number;
  filter_month?: number;
  filter_week?: number;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<ExpiredContractItem>> {
  const token = getToken();
  const query = new URLSearchParams();
  if (params.filter_mode) query.set("filter_mode", params.filter_mode);
  if (params.filter_year) query.set("filter_year", String(params.filter_year));
  if (params.filter_quarter) query.set("filter_quarter", String(params.filter_quarter));
  if (params.filter_month) query.set("filter_month", String(params.filter_month));
  if (params.filter_week) query.set("filter_week", String(params.filter_week));
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const qs = query.toString();
  const data = await apiRequest<PaginatedResponse<ExpiredContractItem>>(
    `/dispatches/expired-contracts${qs ? `?${qs}` : ""}`,
    { token }
  );
  return data;
}

export async function getEnvelopeLayoutConfig(): Promise<EnvelopeLayoutConfig> {
  const token = getToken();
  const data = await apiRequest<{ ok: boolean; layout: EnvelopeLayoutConfig }>(
    "/dispatches/envelope-layout-config",
    { token }
  );
  return data.layout;
}

export async function saveEnvelopeLayoutConfig(layout: Partial<EnvelopeLayoutConfig>): Promise<EnvelopeLayoutConfig> {
  const token = getToken();
  const data = await apiRequest<{ ok: boolean; layout: EnvelopeLayoutConfig }>(
    "/dispatches/envelope-layout-config",
    { method: "PUT", token, body: { layout } }
  );
  return data.layout;
}

// =============================================================================
// Printer Profile API
// =============================================================================

export async function listEnvelopeProfiles(): Promise<EnvelopeProfilesResponse> {
  const token = getToken();
  const data = await apiRequest<EnvelopeProfilesResponse>(
    "/dispatches/envelope-profiles",
    { token }
  );
  return data;
}

export async function getEnvelopeProfileConfig(): Promise<EnvelopeProfileConfigResponse> {
  const token = getToken();
  const data = await apiRequest<EnvelopeProfileConfigResponse>(
    "/dispatches/envelope-profile-config",
    { token }
  );
  return data;
}

export async function saveEnvelopeProfileConfig(config: EnvelopeProfileConfig): Promise<EnvelopeProfileConfigResponse> {
  const token = getToken();
  const data = await apiRequest<EnvelopeProfileConfigResponse>(
    "/dispatches/envelope-profile-config",
    { method: "PUT", token, body: config }
  );
  return data;
}

export async function createBrotherTestFiles(): Promise<BrotherTestFilesResponse> {
  const token = getToken();
  const data = await apiRequest<BrotherTestFilesResponse>(
    "/dispatches/envelope-test-brother",
    { method: "POST", token }
  );
  return data;
}

export async function createRenewalBatch(params: {
  contract_ids: number[];
  issue_date?: string;
  start_cong_van_no?: string;
  merge_output?: boolean;
  create_envelope?: boolean;
  note?: string;
}): Promise<CreateRenewalResponse> {
  const token = getToken();
  const data = await apiRequest<CreateRenewalResponse>(
    "/dispatches/create-renewal",
    { method: "POST", token, body: params }
  );
  return data;
}

export async function createNewKaraokeBatch(params: {
  rows: NewKaraokeProspectRow[];
  issue_date?: string;
  start_cong_van_no?: string;
  merge_output?: boolean;
  create_envelope?: boolean;
  note?: string;
  skip_invalid?: boolean;
  envelope_recipient_mode?: EnvelopeRecipientMode;
  envelope_custom_prefix?: string;
}): Promise<CreateNewKaraokeResponse> {
  const token = getToken();
  const data = await apiRequest<CreateNewKaraokeResponse>(
    "/dispatches/create-new-karaoke",
    { method: "POST", token, body: params }
  );
  return data;
}

export async function generateBatchEnvelope(
  batchId: number,
  options: { force_regenerate?: boolean } = {}
): Promise<EnvelopeResponse> {
  const token = getToken();
  const data = await apiRequest<EnvelopeResponse>(
    `/dispatches/batches/${batchId}/envelope`,
    { method: "POST", token, body: { force_regenerate: options.force_regenerate ?? true } }
  );
  return data;
}

export async function generateBatchEnvelopeCalibration(
  batchId: number,
  options: { force_regenerate?: boolean } = {}
): Promise<EnvelopeCalibrationResponse> {
  const token = getToken();
  const data = await apiRequest<EnvelopeCalibrationResponse>(
    `/dispatches/batches/${batchId}/envelope-calibration`,
    { method: "POST", token, body: { force_regenerate: options.force_regenerate ?? true } }
  );
  return data;
}

export async function getDispatchLogs(dispatchId: number): Promise<DispatchLog[]> {
  const token = getToken();
  const data = await apiRequest<{ ok: boolean; rows: DispatchLog[] }>(
    `/dispatches/${dispatchId}/logs`,
    { token }
  );
  return data.rows || [];
}

export async function addDispatchLog(
  dispatchId: number,
  params: { action_type?: string; status_after?: string; note?: string }
): Promise<void> {
  const token = getToken();
  await apiRequest(`/dispatches/${dispatchId}/logs`, {
    method: "POST",
    token,
    body: params,
  });
}

export async function getBatches(params: {
  year?: number;
  dispatch_type?: string;
  cong_van_no?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<BatchListItem>> {
  const token = getToken();
  const query = new URLSearchParams();
  if (params.year) query.set("year", String(params.year));
  if (params.dispatch_type) query.set("dispatch_type", params.dispatch_type);
  if (params.cong_van_no) query.set("cong_van_no", params.cong_van_no);
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const qs = query.toString();
  const data = await apiRequest<PaginatedResponse<BatchListItem>>(
    `/dispatches/batches${qs ? `?${qs}` : ""}`,
    { token }
  );
  return data;
}

export async function getBatchDetail(batchId: number): Promise<BatchDetail> {
  const token = getToken();
  const data = await apiRequest<{ ok: boolean; batch: BatchDetail; items: BatchItem[] }>(
    `/dispatches/batches/${batchId}`,
    { token }
  );
  if (!data?.batch) throw new Error('Batch not found');
  return { ...data.batch, items: Array.isArray(data.items) ? data.items : [] };
}

export async function getTrackingItems(params: {
  year?: number;
  dispatch_type?: string;
  trang_thai_lien_he?: string;
  trang_thai_hop_dong?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<TrackingItem>> {
  const token = getToken();
  const query = new URLSearchParams();
  if (params.year) query.set("year", String(params.year));
  if (params.dispatch_type) query.set("dispatch_type", params.dispatch_type);
  if (params.trang_thai_lien_he) query.set("trang_thai_lien_he", params.trang_thai_lien_he);
  if (params.trang_thai_hop_dong) query.set("trang_thai_hop_dong", params.trang_thai_hop_dong);
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const qs = query.toString();
  const data = await apiRequest<PaginatedResponse<TrackingItem>>(
    `/dispatches/tracking${qs ? `?${qs}` : ""}`,
    { token }
  );
  return data;
}

export async function updateItemTracking(
  itemId: number,
  params: TrackingUpdateParams
): Promise<TrackingUpdateResponse> {
  const token = getToken();
  const data = await apiRequest<TrackingUpdateResponse>(
    `/dispatches/items/${itemId}/tracking`,
    { method: "PATCH", token, body: params }
  );
  return data;
}

// Batch edit
export async function updateBatch(
  batchId: number,
  params: BatchUpdatePayload
): Promise<BatchUpdateResponse> {
  const token = getToken();
  const data = await apiRequest<BatchUpdateResponse>(
    `/dispatches/batches/${batchId}`,
    { method: "PATCH", token, body: params }
  );
  return data;
}

// Batch soft delete
export async function deleteBatch(
  batchId: number,
  reason?: string
): Promise<SoftDeleteBatchResponse> {
  const token = getToken();
  const data = await apiRequest<SoftDeleteBatchResponse>(
    `/dispatches/batches/${batchId}`,
    { method: "DELETE", token }
  );
  return data;
}

// Batch restore
export async function restoreBatch(batchId: number): Promise<RestoreBatchResponse> {
  const token = getToken();
  const data = await apiRequest<RestoreBatchResponse>(
    `/dispatches/batches/${batchId}/restore`,
    { method: "POST", token }
  );
  return data;
}

// Item edit
export async function updateItem(
  itemId: number,
  params: ItemUpdatePayload
): Promise<ItemUpdateResponse> {
  const token = getToken();
  const data = await apiRequest<ItemUpdateResponse>(
    `/dispatches/items/${itemId}`,
    { method: "PATCH", token, body: params }
  );
  return data;
}

// Item soft delete
export async function deleteItem(
  itemId: number,
  reason?: string
): Promise<SoftDeleteItemResponse> {
  const token = getToken();
  const data = await apiRequest<SoftDeleteItemResponse>(
    `/dispatches/items/${itemId}`,
    { method: "DELETE", token, body: { delete_reason: reason || "" } }
  );
  return data;
}

// Item restore
export async function restoreItem(itemId: number): Promise<RestoreItemResponse> {
  const token = getToken();
  const data = await apiRequest<RestoreItemResponse>(
    `/dispatches/items/${itemId}/restore`,
    { method: "POST", token }
  );
  return data;
}

// Bulk soft delete
export type BulkDeletePayload =
  | { ids: number[]; delete_reason?: string }
  | {
      scope: "all_filtered";
      filters: {
        year?: number;
        dispatch_type?: string;
        trang_thai_lien_he?: string;
        trang_thai_hop_dong?: string;
        search?: string;
        include_deleted?: boolean;
      };
      confirm_text: "XOA TOAN BO";
      delete_reason?: string;
    };

export type BulkDeleteResponse = {
  ok: boolean;
  deleted_count: number;
  item_deleted_count?: number;
  deleted_ids: number[];
  not_found_ids: number[];
  message: string;
  error?: string;
};

export async function bulkDeleteBatches(
  payload: BulkDeletePayload
): Promise<BulkDeleteResponse> {
  const token = getToken();
  // Normalize: raw array [1,2] → {ids:[1,2]}, object {ids:[...]} stays as-is
  const body: { ids: number[]; delete_reason?: string } = Array.isArray(payload)
    ? { ids: payload as number[] }
    : { ids: (payload as any).ids, delete_reason: (payload as any).delete_reason };
  const data = await apiRequest<BulkDeleteResponse>(
    "/dispatches/batches/bulk-delete",
    { method: "POST", token, body }
  );
  return data;
}

export async function bulkDeleteItems(
  payload: BulkDeletePayload
): Promise<BulkDeleteResponse> {
  const token = getToken();
  const body: { ids: number[]; delete_reason?: string } = Array.isArray(payload)
    ? { ids: payload as number[] }
    : { ids: (payload as any).ids, delete_reason: (payload as any).delete_reason };
  const data = await apiRequest<BulkDeleteResponse>(
    "/dispatches/items/bulk-delete",
    { method: "POST", token, body }
  );
  return data;
}

export async function updateDispatchStatus(
  itemId: number,
  status: string
): Promise<UpdateStatusResponse> {
  const token = getToken();
  const data = await apiRequest<UpdateStatusResponse>(
    `/dispatches/items/${itemId}/status`,
    { method: "PATCH", token, body: { status } }
  );
  return data;
}

export function getDownloadUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("/api")) return path;
  return `${apiBaseUrl}${path}`;
}

// =============================================================================
// ENVELOPE V2 — Absolute coordinate PDF engine
// =============================================================================

export interface EnvelopeV2Profile {
  id: string;
  name: string;
  paper_width_mm: number;
  paper_height_mm: number;
  orientation: string;
  rotation_deg: number;
  paper_source_note: string;
}

export interface EnvelopeV2ProfilesResponse {
  ok: boolean;
  profiles: EnvelopeV2Profile[];
  default_profile: string;
}

export interface EnvelopeV2CalibrationResponse {
  ok: boolean;
  profile_id: string;
  profile_name: string;
  paper_width_mm: number;
  paper_height_mm: number;
  page_width_mm: number;
  page_height_mm: number;
  rotation_deg: number;
  offset_x_mm: number;
  offset_y_mm: number;
  filename: string;
  download_url: string;
  message: string;
  error?: string;
}

export interface EnvelopeV2ExportResponse {
  ok: boolean;
  profile_id: string;
  profile_name: string;
  recipients_count: number;
  filename: string;
  download_url: string;
  phone_on_envelope: boolean;
  message: string;
  error?: string;
}

export async function getEnvelopeV2Profiles(): Promise<EnvelopeV2ProfilesResponse> {
  const token = getToken();
  const data = await apiRequest<EnvelopeV2ProfilesResponse>(
    "/dispatches/envelope-v2/profiles",
    { method: "GET", token }
  );
  return data;
}

export async function createEnvelopeV2Calibration(params: {
  printer_profile_id: string;
  offset_x_mm?: number;
  offset_y_mm?: number;
  rotation_deg?: number;
}): Promise<EnvelopeV2CalibrationResponse> {
  const token = getToken();
  const data = await apiRequest<EnvelopeV2CalibrationResponse>(
    "/dispatches/envelope-v2/calibration",
    { method: "POST", token, body: params }
  );
  return data;
}

export async function exportEnvelopeV2Pdf(params: {
  printer_profile_id: string;
  rows: Array<{
    recipient_unit: string;
    recipient_address: string;
    recipient_phone?: string;
  }>;
  offset_x_mm?: number;
  offset_y_mm?: number;
}): Promise<EnvelopeV2ExportResponse> {
  const token = getToken();
  const data = await apiRequest<EnvelopeV2ExportResponse>(
    "/dispatches/envelope-v2/export",
    { method: "POST", token, body: params }
  );
  return data;
}
