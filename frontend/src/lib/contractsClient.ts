import { apiRequest } from "./apiClient";
import type {
  ContractRecordsCandidate,
  CreateContractDraft,
  KaraokeCalculationInput,
  KaraokeCalculationResult,
} from "./contractCreateTypes";

// =============================================================================
// KVC VCPMC TARIFF TYPES (frontend uses backend as source of truth)
// =============================================================================

export type KvcLocationInput = {
  id: string;
  name: string;
  area_m2: number;
};

export type KvcVcpmcTariffInput = {
  locations: KvcLocationInput[];
  gtgt_percent: number;
  support_percent?: number;
  support_amount?: number;
  support_note?: string;
  usage_display_mode?: 'auto' | 'text' | 'table';
};

export type KvcCalculationResult = {
  ok: boolean;
  mode: string;
  write_performed: boolean;
  contract_created: boolean;
  docx_generated: boolean;
  xlsx_generated: boolean;
  gcn_created: boolean;
  nd17_calculated: boolean;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string; severity: string }[];
  input_echo: {
    location_count: number;
    gtgt_percent: number;
    support_percent: number;
    support_amount: number;
    support_note: string;
    usage_display_mode: string;
  };
  calculation: {
    location_results: {
      location_id: string;
      location_name: string;
      area_m2: number;
      base_included_area_m2: number;
      excess_area_m2: number;
      raw_increment_blocks: number;
      increment_blocks: number;
      base_fee: number;
      increment_fee_per_block: number;
      increment_amount: number;
      location_subtotal: number;
    }[];
    detail_rows: {
      location_id: string;
      location_name: string;
      area_m2: number;
      base_fee: number;
      increment_blocks: number;
      increment_amount: number;
      location_subtotal: number;
    }[];
    subtotal_before_support: number;
    support_percent: number;
    support_amount: number;
    amount_after_support: number;
    gtgt_percent: number;
    gtgt_amount: number;
    total_amount: number;
    total_amount_words: string;
  };
  docx_context_preview: {
    locations_table_text: string;
    pricing_detail_text: string;
    pricing_total_text: string;
    pricing_mode: string;
  };
  docx_context_preview_v2?: KvcDocxContextPreviewV2 | null;
};

export type KvcUsageLocationBlock = {
  mode: string;
  text: string;
  rows: string[][];
  headers: string[];
};

export type KvcVcpmcPricingBlock = {
  mode: string;
  headers: string[];
  rows: string[][];
};

export type KvcBackgroundPricingBlock = {
  pricing_mode: string;
  rows: string[][];
  summary_rows: string[][];
};

export type KvcDocxContextPreviewV2 = {
  pricing_mode: string;
  usage_display_mode: string;
  background_usage_locations_block: KvcUsageLocationBlock;
  kvc_vcpmc_pricing_block: KvcVcpmcPricingBlock;
  background_pricing_block: KvcBackgroundPricingBlock;
  pricing_total_text: string;
  amount_in_words: string;
};

export type MusicUsageAreaItem = {
  area_name: string;
  scale_description: string;
  music_usage_type: string;
  /** Optional display label for bảng tính/Word export. Falls back to area_name when empty. */
  pricing_label?: string | null;
};

export type ApiContractItem = {
  id: number | string;
  contract_no: string;
  customer_name: string;
  domain: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  contract_year?: number | null;
  field_code?: string | null;
  region_code?: string | null;
  ten_bang_hieu?: string | null;
  dia_chi_su_dung?: string | null;
  /** Legal full address */
  don_vi_dia_chi?: string | null;
  so_tien_value?: number | null;
  renewal_status?: string | null;
  is_renewable?: boolean | null;
  loai_hinh_karaoke?: string | null;
  tong_so_phong?: number | null;
  tong_so_box?: number | null;
  // Phase 2 simplified royalty fields (canonical source)
  royalty_amount_before_vat?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  royalty_amount_after_vat?: number | null;
  royalty_amount_in_words?: string | null;
  // Phase 2: Music usage areas
  music_usage_areas?: MusicUsageAreaItem[] | null;
  // Phase 3: GCN status integrated into contract list
  gcn_status?: string | null;   // final_printed | test_printed | draft | no_gcn | null
  gcn_certificate_no?: string | null;
  gcn_certificate_id?: number | null;
};

export type ContractsListResponse = {
  items: ApiContractItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type ApiContractDetail = {
  id: number;
  contract_no: string;
  contract_year?: number | null;
  customer: {
    name: string;
    signage?: string | null;
    address?: string | null;
    legal_address?: string | null;
    usage_address?: string | null;
    phone?: string | null;
    email?: string | null;
    representative?: string | null;
    position?: string | null;
    mst?: string | null;
  };
  domain: {
    display: string;
    field_code?: string | null;
    domain_group?: string | null;
  };
  dates: {
    signed_date?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  };
  financial: {
    amount?: number | null;
    total_amount?: number | null;
    currency?: string;
    amount_before_gtgt?: number | null;
    gtgt_percent?: number | null;
    gtgt_amount?: number | null;
  };
  karaoke: {
    type?: string | null;
    room_count?: number | null;
    box_count?: number | null;
  };
  status: string;
  raw: Record<string, unknown>;
  music_usage_areas?: MusicUsageAreaItem[];
  // Phase 2 simplified royalty fields (canonical source)
  royalty_amount_before_vat?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  royalty_amount_after_vat?: number | null;
  royalty_amount_in_words?: string | null;
};

export type CreateContractResponse = {
  ok: boolean;
  mode: string;
  message: string;
  write_enabled: boolean;
  rollback_only: boolean;
  clone_only_enabled: boolean;
  write_performed: boolean;
  rollback_performed: boolean;
  artifacts_generated: boolean;
  idempotency_key?: string | null;
  idempotent_replay?: boolean;
  created?: {
    id?: number | null;
    contract_no?: string | null;
    contract_year?: number | null;
    customer_name?: string | null;
    table?: string | null;
    db_name?: string | null;
  } | null;
  created_preview?: Record<string, unknown> | null;
  errors?: string[];
};

export type ContractsQuery = {
  page?: number;
  page_size?: number;
  q?: string;
  domain?: string;
  status?: string;
  year?: string;
};

// =============================================================================
// CONTRACT LIST KPI SUMMARY API — replaces static constants with live API calls
// =============================================================================

export type ContractsSummaryStats = {
  totalContracts: number;
  active: number;
  expiringIn30Days: number;
  expired: number;
  pendingRenewal: number;
  contracts2026: number;
  contracts2025: number;
  revenue2026: number;
  revenue2025: number;
  gcnDraft: number;
  gcnFinalPrinted: number;
  totalWorks: number;
};

/**
 * Fetch real-time summary stats for the contracts list KPI cards.
 * GET /api/reports/summary
 *
 * Returns KPIs, revenue by year — all computed live from DB.
 * Replaces static KPI constants with live API calls.
 */
export function getContractsSummary(token: string): Promise<ContractsSummaryStats> {
  return apiRequest<any>("/reports/summary", { token }).then((raw) => ({
    totalContracts: raw.contracts_total_all_time ?? 0,
    active: raw.contracts_active ?? 0,
    expiringIn30Days: raw.contracts_expiring_30_days ?? 0,
    expired: raw.contracts_expired ?? 0,
    pendingRenewal: raw.contracts_pending_renewal ?? 0,
    gcnDraft: raw.gcn_draft ?? 0,
    gcnFinalPrinted: raw.gcn_final_printed ?? 0,
    totalWorks: raw.total_works ?? 0,
    contracts2026:
      (raw.revenue_by_year ?? [])
        .find((y: any) => y.year === new Date().getFullYear())
        ?.contract_count ?? 0,
    contracts2025:
      (raw.revenue_by_year ?? [])
        .find((y: any) => y.year === new Date().getFullYear() - 1)
        ?.contract_count ?? 0,
    revenue2026:
      (raw.revenue_by_year ?? [])
        .find((y: any) => y.year === new Date().getFullYear())
        ?.total_revenue ?? 0,
    revenue2025:
      (raw.revenue_by_year ?? [])
        .find((y: any) => y.year === new Date().getFullYear() - 1)
        ?.total_revenue ?? 0,
  }));
}

export function getContracts(token: string, query: ContractsQuery): Promise<ContractsListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.page_size) params.set("page_size", String(query.page_size));
  if (query.q) params.set("q", query.q);
  if (query.domain) params.set("domain", query.domain);
  if (query.status) params.set("status", query.status);
  if (query.year) params.set("year", query.year);
  const suffix = params.toString();
  return apiRequest<ContractsListResponse>(`/contracts${suffix ? `?${suffix}` : ""}`, { token });
}

export function getContractDetail(token: string, id: number): Promise<ApiContractDetail> {
  return apiRequest<ApiContractDetail>(`/contracts/${id}`, { token });
}

export function createContractCloneOnly(
  token: string,
  payload: {
    draft: CreateContractDraft;
    client_preflight: ContractRecordsCandidate;
    client_confirmation: {
      clone_only_create_confirmed: true;
      idempotency_key: string;
    };
  }
): Promise<CreateContractResponse> {
  return apiRequest<CreateContractResponse>("/contracts", {
    method: "POST",
    token,
    body: payload
  });
}

export type SimpleCreateContractResponse = {
  ok: boolean;
  mode: string;
  message: string;
  contract_id: number | null;
  contract_no: string | null;
  contract_year: number | null;
  customer_name: string | null;
  db_name: string | null;
  write_performed: boolean;
  errors: any[];
};

export function simpleCreateContract(
  token: string,
  payload: {
    draft: CreateContractDraft;
    client_preflight: ContractRecordsCandidate;
  }
): Promise<SimpleCreateContractResponse> {
  return apiRequest<SimpleCreateContractResponse>("/contracts/simple-create", {
    method: "POST",
    token,
    body: payload
  });
}

// =============================================================================
// OFFICIAL CREATE + DOWNLOAD DOCX (PHASE FIX-CREATE-DOWNLOAD-01)
// =============================================================================

export type CreateAndExportDocxResponse = {
  ok: boolean;
  mode: string;
  error_code?: string;
  message: string;
  contract_id: number | null;
  contract_no: string | null;
  docx_path: string | null;
  docx_export_skipped: boolean;
  docx_skip_reason: string | null;
  /** Suggested download filename (no path, just .docx) */
  docx_filename?: string | null;
  existing_contract_id?: number | null;
  suggested_next?: string | null;
};

export type CreateErrorResponse = {
  ok: false;
  mode: string;
  error_code?: string;
  message: string;
  contract_id: null;
  contract_no: string | null;
  docx_path: null;
  docx_export_skipped: boolean;
  docx_skip_reason: string | null;
  existing_contract_id?: number | null;
  suggested_next?: string | null;
};

export type CheckContractNoResponse = {
  ok: boolean;
  available: boolean;
  contract_no: string;
  existing_contract_id: number | null;
  message: string;
  suggested_next: string | null;
};

export function createAndExportDocx(
  token: string,
  payload: {
    draft: CreateContractDraft;
    client_preflight: ContractRecordsCandidate;
  }
): Promise<CreateAndExportDocxResponse> {
  return fetchWithCreateErrorHandling("/contracts/create-and-export-docx", {
    method: "POST",
    token,
    body: payload
  });
}

export function checkContractNoAvailability(params: {
  contract_no?: string;
  short_no?: string;
  year?: number;
  region_code?: string;
  permission_code?: string;
}): Promise<CheckContractNoResponse> {
  const searchParams = new URLSearchParams();
  if (params.contract_no) searchParams.set('contract_no', params.contract_no);
  if (params.short_no) searchParams.set('short_no', params.short_no);
  if (params.year) searchParams.set('year', String(params.year));
  if (params.region_code) searchParams.set('region_code', params.region_code);
  if (params.permission_code) searchParams.set('permission_code', params.permission_code);

  return apiRequest<CheckContractNoResponse>(`/contracts/check-contract-no?${searchParams.toString()}`);
}

async function fetchWithCreateErrorHandling<T extends object>(
  path: string,
  options: { method?: string; token?: string; body?: unknown }
): Promise<T> {
  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body == null ? undefined : JSON.stringify(options.body)
  });

  const data = await res.json().catch(() => ({}));

  // --- 401: detect early, signal clearly to caller ---
  if (res.status === 401) {
    const wrapped: any = {
      ok: false,
      mode: 'unauthorized',
      error_code: 'UNAUTHORIZED',
      message: 'Phiên đăng nhập đã hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại.',
      contract_id: null,
      contract_no: null,
      docx_path: null,
      docx_export_skipped: true,
      docx_skip_reason: 'HTTP 401 Unauthorized',
      _status: 401,
      _isUnauthorized: true,
    };
    return wrapped as T;
  }

  // Always return data, including error responses
  // Caller should check data.ok to determine success
  if (data && typeof data === 'object' && 'ok' in data) {
    (data as any)._status = res.status;
    (data as any)._isNetworkError = false;
    return data as T;
  }

  // For non-standard responses, wrap in error format
  if (!res.ok) {
    const wrapped: any = {
      ok: false,
      mode: 'error',
      message: data?.message || `HTTP ${res.status}`,
      contract_id: null,
      contract_no: null,
      docx_path: null,
      docx_export_skipped: true,
      docx_skip_reason: `HTTP ${res.status}`,
      _status: res.status,
      _isNetworkError: false,
    };
    return wrapped as T;
  }

  return data as T;
}

export async function downloadDocxFile(
  token: string,
  contractId: number,
  templateCode?: string
): Promise<{ blob: Blob; filename: string }> {
  // Build URL with optional template_code query param (Phase BACKGROUND-TEMPLATE-REFACTOR)
  let url = `/api/contracts/${contractId}/download-docx`;
  if (templateCode) {
    url += `?template_code=${encodeURIComponent(templateCode)}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Download failed");
  }

  // Try server-supplied filename first via Content-Disposition
  const filename = extractFilenameFromResponse(response) ?? `contract_${contractId}.docx`;
  const blob = await response.blob();
  return { blob, filename };
}


/**
 * Extract filename from a Content-Disposition response header if available.
 * Handles both `filename=foo.docx` and `filename*=UTF-8''...` forms.
 */
export function extractFilenameFromResponse(response: Response): string | null {
  const disp = response.headers.get("Content-Disposition") || "";
  if (!disp) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disp);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const match = /filename=("?)([^";]+)\1/i.exec(disp);
  if (match) return match[2];
  return null;
}

/**
 * Download an already-generated DOCX file by its path.
 * This avoids GET /download-docx which regenerates without pricing_snapshot.
 */
export async function downloadGeneratedDocxFile(
  token: string,
  contractId: number,
  docxPath: string
): Promise<Blob> {
  const response = await fetch("/api/contracts/download-generated-docx", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contract_id: contractId,
      docx_path: docxPath,
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Download generated DOCX failed");
  }
  return response.blob();
}

export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type KaraokeMakeHdPreviewResponse = {
  ok: boolean;
  contract_id: number | null;
  contract_no: string | null;
  word_path: string | null;
  preview_path: string | null;
  file_size: number | null;
  db_name: string | null;
  render_context_keys: string[];
  missing_placeholders: string[];
  unresolved_placeholders: string[];
  db_write_performed: boolean;
  docx_path_attached: boolean;
  official_export: boolean;
  gcn_created: boolean;
  warnings: string[];
};

export function makeHdPreviewKaraokeOldAppDirect(
  token: string,
  payload: {
    draft: CreateContractDraft;
    client_preflight: ContractRecordsCandidate;
  }
): Promise<KaraokeMakeHdPreviewResponse> {
  return apiRequest<KaraokeMakeHdPreviewResponse>("/contracts/karaoke/make-hd", {
    method: "POST",
    token,
    body: payload,
  });
}

// =============================================================================
// KARAOKE CALCULATION API
// =============================================================================

/**
 * Call karaoke calculation dry-run API.
 * POST /api/background/karaoke/calculate-dry-run
 *
 * This is a READ-ONLY endpoint - no DB write, no contract creation.
 */
export function calculateKaraokeDryRun(
  token: string,
  input: KaraokeCalculationInput
): Promise<KaraokeCalculationResult> {
  return apiRequest<KaraokeCalculationResult>("/background/karaoke/calculate-dry-run", {
    method: "POST",
    token,
    body: {
      contract_no: input.contractNo,
      karaoke_type: input.karaokeType,
      area_group: input.areaGroup,
      tong_so_phong: input.totalRooms,
      tong_so_box: input.totalBoxes,
      muc_luong_co_so: input.baseSalary,
      ty_le_ho_tro: input.annualSupportPercent,
      ty_le_ho_tro_bac_1: input.tier1SupportPercent,
      ty_le_ho_tro_bac_2: input.tier2SupportPercent,
      ty_le_ho_tro_bac_3: input.tier3SupportPercent,
      gtgt_percent: input.gtgtPercent,
      start_date: input.startDate,
      end_date: input.endDate,
      room_sections: input.roomSections || [],
      pricing_render_mode: input.pricingRenderMode,
    }
  });
}

// =============================================================================
// KVC VCPMC TARIFF CALCULATION API (PHASE KVC-02b)
// =============================================================================

/**
 * Call KVC VCPMC tariff calculation dry-run API.
 * POST /api/background/kvc/vcpmc-tariff/calculate-dry-run
 *
 * This is a READ-ONLY endpoint - no DB write, no contract creation.
 * Backend is source of truth for KVC money calculations.
 */
export function calculateKvcVcpmcTariff(
  token: string,
  input: KvcVcpmcTariffInput
): Promise<KvcCalculationResult> {
  return apiRequest<KvcCalculationResult>("/background/kvc/vcpmc-tariff/calculate-dry-run", {
    method: "POST",
    token,
    body: input,
  });
}

// =============================================================================
// KVC ND17 CALCULATION API (PHASE KVC-05)
// =============================================================================

export type KvcNd17LocationInput = {
  id: string;
  name: string;
  area_m2: number;
};

export type KvcNd17Input = {
  locations: KvcNd17LocationInput[];
  base_salary?: number;
  urban_class?: string;
  urban_rate?: number;
  gtgt_percent?: number;
  support_percent?: number;
  support_amount?: number;
  support_note?: string;
  include_premise_services?: boolean;
  premise_services_note?: string;
  usage_display_mode?: 'auto' | 'text' | 'table';
};

export type KvcNd17Result = {
  ok: boolean;
  mode: string;
  write_performed: boolean;
  contract_created: boolean;
  docx_generated: boolean;
  xlsx_generated: boolean;
  gcn_created: boolean;
  nd17_calculated: boolean;
  vcpmc_tariff_calculated: boolean;
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string; severity: string }[];
  input_echo: {
    location_count: number;
    base_salary: number;
    urban_class?: string;
    urban_rate: number;
    gtgt_percent: number;
    support_percent: number;
    support_amount: number;
    support_note: string;
    include_premise_services: boolean;
    premise_services_note: string;
    usage_display_mode: string;
  };
  calculation?: {
    location_results: {
      location_id: string;
      location_name: string;
      area_m2: number;
      coefficient: number;
      coefficient_formula: string;
      base_salary: number;
      raw_amount: number;
      cap_amount: number;
      cap_applied: boolean;
      capped_amount: number;
      urban_rate: number;
      urban_adjusted_amount: number;
    }[];
    detail_rows: {
      location_id: string;
      location_name: string;
      area_m2: number;
      coefficient: number;
      coefficient_formula: string;
      raw_amount: number;
      cap_applied: boolean;
      capped_amount: number;
      urban_rate: number;
      urban_adjusted_amount: number;
    }[];
    cap_was_applied: boolean;
    subtotal_after_urban: number;
    support_percent: number;
    support_amount: number;
    amount_after_support: number;
    gtgt_percent: number;
    gtgt_amount: number;
    total_amount: number;
    total_amount_words: string;
  } | null;
  docx_context_preview_v2?: {
    pricing_mode: string;
    legal_basis: string;
    usage_display_mode: string;
    background_usage_locations_block: KvcUsageLocationBlock;
    nd17_coefficient_block: {
      mode: string;
      headers: string[];
      rows: string[][];
    };
    background_pricing_block: KvcBackgroundPricingBlock;
    pricing_total_text: string;
    amount_in_words: string;
  } | null;
};

/**
 * Call KVC ND17 calculation dry-run API.
 * POST /api/background/kvc/nd17/calculate-dry-run
 *
 * This is a READ-ONLY endpoint - no DB write, no contract creation.
 * Legal Basis: Nghị định 17/2023/NĐ-CP, Phụ lục II, Mục 8
 */
export function calculateKvcNd17(
  token: string,
  input: KvcNd17Input
): Promise<KvcNd17Result> {
  return apiRequest<KvcNd17Result>("/background/kvc/nd17/calculate-dry-run", {
    method: "POST",
    token,
    body: input,
  });
}

// =============================================================================
// EXPORT DOCX PREVIEW API (PHASE EXPORT-05)
// =============================================================================

export type ExportPreviewResult = {
  ok: boolean;
  preview_path: string | null;
  file_size: number | null;
  domain: string | null;
  domain_label: string | null;
  template_path: string | null;
  placeholders_attempted: string[];
  placeholders_in_context: number;
  file_write_performed: boolean;
  db_write_performed: boolean;
  docx_path_attached: boolean;
  official_export: boolean;
  pricing_blocks_inserted: boolean;
  kvc_blocks_attempted: boolean;
  kvc_usage_block_inserted: boolean;
  kvc_pricing_block_inserted: boolean;
  karaoke_blocks_attempted: boolean;
  karaoke_room_block_inserted: boolean;
  karaoke_pricing_block_inserted: boolean;
  block_placeholder_strategy: string | null;
  block_placeholders_injected: string[];
  sentinel_anchors_used: string[];
  template_raw_anchor_required: boolean;
  synthetic_preview: boolean;
  warnings: string[];
  message: string | null;
};

export type ExportPreviewRequest = {
  include_blocks?: boolean;
  pricing_context?: Record<string, unknown>;
  synthetic_preview?: boolean;
  dry_run_label?: string;
  urban_support_percent?: number;
  /** Full pricing snapshot from frontend applied pricing. Takes precedence over DB values. */
  pricing_snapshot?: Record<string, unknown>;
};

/**
 * Call export DOCX preview API for a contract.
 * POST /api/contracts/{contract_id}/export-docx-preview
 *
 * This generates a preview DOCX file for manual inspection:
 * - Writes preview to F:\APPs\storage\preview\
 * - Does NOT write to DB
 * - Does NOT attach docx_path
 * - Does NOT create official export
 *
 * Only KVC and Karaoke domains are supported.
 */
export function exportDocxPreview(
  token: string,
  contractId: number,
  request?: ExportPreviewRequest
): Promise<ExportPreviewResult> {
  return apiRequest<ExportPreviewResult>(`/contracts/${contractId}/export-docx-preview`, {
    method: "POST",
    token,
    body: request,
  });
}

/**
 * Call synthetic KVC preview API.
 * POST /api/contracts/export/preview/kvc-synthetic
 *
 * This generates a preview using sample CityGames data:
 * - 855m2 => 7,400,000
 * - 701m2 => 6,200,000
 * - 920m2 => 7,800,000
 * - subtotal = 21,400,000
 * - GTGT 8% = 1,712,000
 * - total = 23,112,000
 *
 * Does NOT:
 * - Create a contract row
 * - Write to DB
 * - Create official export
 *
 * The preview is marked as synthetic/sample.
 */
export function exportKvcSyntheticPreview(
  token: string,
  request?: ExportPreviewRequest
): Promise<ExportPreviewResult> {
  return apiRequest<ExportPreviewResult>("/contracts/export/preview/kvc-synthetic", {
    method: "POST",
    token,
    body: request,
  });
}

/**
 * Call synthetic Karaoke ND17 preview API.
 * POST /api/contracts/export/preview/karaoke-synthetic
 *
 * This generates a preview using sample Karaoke ND17 data:
 * - 4 phòng đầu: 2,340,000 x 1.6 = 14,976,000
 * - 6 phòng sau: 2,340,000 x 1.28 = 17,971,200
 * - 16 phòng sau: 2,340,000 x 1.12 = 41,932,800
 * - Subtotal: 74,880,000
 * - GTGT 8%: 5,990,400
 * - Total: 80,870,400
 *
 * Does NOT:
 * - Create a contract row
 * - Write to DB
 * - Create official export
 *
 * The preview is marked as synthetic/sample.
 */
export function exportKaraokeSyntheticPreview(
  token: string,
  request?: ExportPreviewRequest
): Promise<ExportPreviewResult> {
  return apiRequest<ExportPreviewResult>("/contracts/export/preview/karaoke-synthetic", {
    method: "POST",
    token,
    body: request,
  });
}

// =============================================================================
// CONTRACT TEMPLATE SEARCH & PREFILL APIs (Phase TEMPLATE-CREATE-01)
// =============================================================================

export type TemplateSearchItem = {
  id: number;
  contract_no: string;
  customer_name: string | null;
  legal_name: string | null;
  tax_code: string | null;
  legal_full_address: string | null;
  usage_full_address: string | null;
  domain: string | null;
  linh_vuc: string | null;
  domain_group: string | null;
  field_code: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_status: string | null;
};

export type TemplateSearchResponse = {
  items: TemplateSearchItem[];
  total: number;
  query: string | null;
};

export type PrefillSourceResponse = {
  ok: boolean;
  contract_id: number;
  contract_no: string;
  // Customer info
  legal_name: string | null;
  brand_name: string | null;
  representative_name: string | null;
  representative_title: string | null;
  tax_code: string | null;
  cccd: string | null;
  phone: string | null;
  email: string | null;
  // Legal address
  legal_address_line: string | null;
  legal_ward: string | null;
  legal_province: string | null;
  legal_full_address: string | null;
  // Usage address
  usage_same_as_legal: boolean;
  usage_address_line: string | null;
  usage_ward: string | null;
  usage_province: string | null;
  usage_full_address: string | null;
  // Domain info
  domain_code: string | null;
  domain_display_name: string | null;
  domain_group: string | null;
  field_code: string | null;
  // Music usage areas
  music_usage_areas: Array<{ area_name: string; scale_description: string; music_usage_type: string; pricing_label?: string | null }>;
  // Karaoke info
  karaoke_type: string | null;
  area_group: string | null;
  total_rooms: number | null;
  total_boxes: number | null;
  room_sections: Array<{ key: string; roomCount: number; roomNames: string }>;
  // Royalty info
  royalty_amount_before_vat: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  royalty_amount_after_vat: number | null;
  royalty_amount_in_words: string | null;
  // Notes
  contract_terms_note: string | null;
  internal_note: string | null;
};

/**
 * Search contracts to use as template for creating new contract.
 * GET /api/contracts/template-search?q=...
 */
export function searchContractsForTemplate(
  token: string,
  params: { q?: string; page?: number; page_size?: number }
): Promise<TemplateSearchResponse> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.page_size) searchParams.set('page_size', String(params.page_size));

  return apiRequest<TemplateSearchResponse>(
    `/contracts/template-search?${searchParams.toString()}`,
    { token }
  );
}

/**
 * Get sanitized contract data to populate a new contract form.
 * GET /api/contracts/{id}/prefill-source
 *
 * The source contract is NOT modified.
 */
export function getContractPrefillSource(
  token: string,
  contractId: number
): Promise<PrefillSourceResponse> {
  return apiRequest<PrefillSourceResponse>(
    `/contracts/${contractId}/prefill-source`,
    { token }
  );
}

// =============================================================================
// CONTRACT UPDATE API (PHASE CONTRACTS-ACTIONS-EDIT-01)
// =============================================================================

export type UpdateContractResponse = {
  ok: boolean;
  mode: string;
  message: string;
  update_enabled: boolean;
  clone_only_enabled: boolean;
  write_performed: boolean;
  contract_id: number | null;
  contract_no: string | null;
  updated_fields: string[];
  errors: string[];
  warnings: string[];
};

export type UpdateContractPayload = {
  // Contract info (fully editable)
  contract_no?: string | null;
  ngay_lap_hop_dong?: string | null;
  contract_year?: number | null;
  region_code?: string | null;
  field_code?: string | null;
  linh_vuc?: string | null;
  // Partner info
  don_vi_ten?: string | null;
  ten_bang_hieu?: string | null;
  don_vi_dia_chi?: string | null;
  dia_chi_su_dung?: string | null;
  don_vi_dien_thoai?: string | null;
  don_vi_email?: string | null;
  don_vi_nguoi_dai_dien?: string | null;
  don_vi_chuc_vu?: string | null;
  don_vi_mst?: string | null;
  // Full address fields (post-2025 merger)
  legal_address_line?: string | null;
  legal_ward?: string | null;
  legal_province?: string | null;
  legal_full_address?: string | null;
  usage_address_line?: string | null;
  usage_ward?: string | null;
  usage_province?: string | null;
  usage_full_address?: string | null;
  // Term
  ngay_bat_dau?: string | null;
  ngay_ket_thuc?: string | null;
  // Phase 2 simplified royalty fields
  royalty_amount_before_vat?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  royalty_amount_after_vat?: number | null;
  renewal_status?: string | null;
  loai_hinh_karaoke?: string | null;
  contract_note?: string | null;
  music_usage_areas?: Array<{
    area_name: string;
    scale_description: string;
    music_usage_type: string;
    pricing_label?: string | null;
  }>;
};

export function updateContract(
  token: string,
  contractId: number,
  payload: UpdateContractPayload
): Promise<UpdateContractResponse> {
  return apiRequest<UpdateContractResponse>("/contracts/" + contractId, {
    method: "PATCH",
    token,
    body: payload,
  });
}

// =============================================================================
// CERTIFICATE CONTEXT DRY-RUN API
// =============================================================================

export type CertificateContextResult = {
  ok: boolean;
  mode: string;
  context: {
    mode: string;
    certificate_id: number | null;
    contract_id: number | null;
    certificate_no: string | null;
    certificate_issue_date: string | null;
    certificate_issue_day: string | null;
    certificate_issue_month: string | null;
    certificate_issue_year: string | null;
    contract_no: string;
    organization_name: string;
    business_registration_no: string;
    address: string;
    business_sign_name: string;
    business_location: string;
    gcn_scope_col_1_text: string;
    gcn_scope_col_2_text: string;
    gcn_scope_col_3_text: string;
    effective_from: string | null;
    effective_to: string | null;
    offset_x_mm: number;
    offset_y_mm: number;
    qr_image_data: string | null;
    status: string;
    warnings: string[];
    fieldOffsets?: Record<string, { dx: number; dy: number }>;
    scopeColAlign?: { col1: 'left' | 'center' | 'right'; col2: 'left' | 'center' | 'right'; col3: 'left' | 'center' | 'right' };
  };
  locked_layout: Record<string, unknown>;
  write_performed: boolean;
  print_enabled: boolean;
  qr_generation_enabled: boolean;
  artifacts_generated: boolean;
};

export function getCertificateContextDryRun(
  token: string,
  contractId: number
): Promise<CertificateContextResult> {
  return apiRequest<CertificateContextResult>(
    `/contracts/${contractId}/certificate-context-dry-run`,
    { token }
  );
}

// =============================================================================
// CERTIFICATE DRAFT CREATE API (PHASE GCN-CREATE-DRAFT-01)
// =============================================================================

export type CertificateDraftCreateResult = {
  ok: boolean;
  mode: string;
  message: string;
  write_performed: boolean;
  certificate_created: boolean;
  certificate_no_allocated: boolean;
  qr_generation_enabled: boolean;
  print_enabled: boolean;
  artifacts_generated: boolean;
  errors: { field: string; message: string; severity: string }[];
  warnings: { field: string; message: string; severity: string }[];
  created: {
    certificate_id: number;
    contract_id: number;
    contract_no: string;
    certificate_no: string | null;
    status: string;
  } | null;
};

export function createCertificateDraft(
  token: string,
  contractId: number,
  payload?: {
    client_confirmation?: { clone_only_certificate_draft_confirmed?: boolean };
    client_certificate_no?: string | null;
  }
): Promise<CertificateDraftCreateResult> {
  return apiRequest<CertificateDraftCreateResult>(
    `/contracts/${contractId}/certificates/draft`,
    {
      method: "POST",
      token,
      body: payload || {},
    }
  );
}

// =============================================================================
// CONTRACT SAFE CLONE-ONLY DELETE API (PHASE GCN-CREATE-DRAFT-01)
// =============================================================================

export type DeleteContractCloneOnlyResult = {
  ok: boolean;
  mode: string;
  message: string;
  write_performed: boolean;
  contract_id: number | null;
  contract_no: string | null;
  deleted_contract_records: number;
  deleted_certificate_records: number;
  deleted_related_rows: number;
  old_db_touched: boolean;
  blocked_final_certificates: number;
  admin_delete_any_enabled: boolean;
  permission_used: string | null;
  warnings: string[];
  errors: { field: string; message: string }[];
};

export function deleteContractCloneOnly(
  token: string,
  contractId: number
): Promise<DeleteContractCloneOnlyResult> {
  return apiRequest<DeleteContractCloneOnlyResult>(
    "/contracts/" + contractId,
    {
      method: "DELETE",
      token,
    }
  );
}

