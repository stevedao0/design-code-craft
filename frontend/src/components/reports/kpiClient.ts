/**
 * KPI + Reports V2 API client.
 * All calls use existing apiRequest from lib/apiClient with Bearer token auth.
 */
import { apiRequest } from '@/lib/apiClient';
import { TOKEN_KEY } from '@/lib/authClient';
import type {
  AnnualTarget,
  AnnualSummary,
  AnnualKpiOverview,
  ContractListResponse,
  UsersReportResponse,
  RenewalsReportResponse,
  GcnReportResponse,
  OverviewResponse,
  ExportRequest,
} from './types';

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

/**
 * Normalize API values that may arrive as number or numeric string.
 * Returns null when value cannot be parsed (NOT 0) so the UI can show "—".
 */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

// ─── KPI annual target ───────────────────────────────────────────────────

export async function getAnnualTarget(year: number): Promise<AnnualTarget | null> {
  return apiRequest<AnnualTarget | null>(`/kpi/annual-target?year=${year}`, { token: getToken() });
}

export async function putAnnualTarget(body: { year: number; annual_target: number; note?: string }): Promise<AnnualTarget> {
  return apiRequest<AnnualTarget>('/kpi/annual-target', {
    method: 'PUT',
    body,
    token: getToken(),
  });
}

export async function getAnnualSummary(year: number): Promise<AnnualSummary> {
  return apiRequest<AnnualSummary>(`/kpi/annual-summary?year=${year}`, { token: getToken() });
}

export async function getAnnualOverview(year: number): Promise<AnnualKpiOverview> {
  return apiRequest<AnnualKpiOverview>(`/kpi/annual-overview?year=${year}`, { token: getToken() });
}

// ─── Reports V2 ─────────────────────────────────────────────────────────

export async function getOverview(params: {
  year?: number;
  date_from?: string;
  date_to?: string;
  period?: string;
  quarter?: number;
  month?: number;
  field?: string;
  owner_user_id?: number;
  signing_bucket?: string;
}): Promise<OverviewResponse> {
  const q = new URLSearchParams();
  if (params.year != null) q.set('year', String(params.year));
  if (params.date_from) q.set('date_from', params.date_from);
  if (params.date_to) q.set('date_to', params.date_to);
  if (params.period) q.set('period', params.period);
  if (params.quarter != null) q.set('quarter', String(params.quarter));
  if (params.month != null) q.set('month', String(params.month));
  if (params.field) q.set('field', params.field);
  if (params.owner_user_id != null) q.set('owner_user_id', String(params.owner_user_id));
  if (params.signing_bucket) q.set('signing_bucket', params.signing_bucket);
  const suffix = q.toString();
  const raw = await apiRequest<OverviewResponse | null>(`/reports/v2/overview${suffix ? `?${suffix}` : ''}`, { token: getToken() });
  if (raw == null) {
    throw new Error('Khong nhan duoc du lieu tu may chu');
  }
  return normalizeOverview(raw);
}

function normalizeOverview(o: OverviewResponse): OverviewResponse {
  return {
    year: o.year ?? 0,
    revenue_before_vat: o.revenue_before_vat ?? o.actual ?? 0,
    contract_total_after_vat: o.contract_total_after_vat ?? 0,
    actual: o.actual ?? o.revenue_before_vat ?? 0,
    contract_count: o.contract_count ?? 0,
    total_count: o.total_count ?? o.contract_count ?? 0,
    total_actual: o.total_actual ?? o.revenue_before_vat ?? 0,
    positive_value_count: o.positive_value_count ?? 0,
    zero_value_count: o.zero_value_count ?? 0,
    null_value_count: o.null_value_count ?? 0,
    active_count: o.active_count ?? 0,
    expired_count: o.expired_count ?? 0,
    expiring_count: o.expiring_count ?? 0,
    gcn_issued_count: o.gcn_issued_count ?? 0,
    gcn_missing_count: o.gcn_missing_count ?? 0,
    new_count: o.new_count ?? 0,
    new_actual: o.new_actual ?? 0,
    renewal_count: o.renewal_count ?? 0,
    renewal_actual: o.renewal_actual ?? 0,
    frame_count: o.frame_count ?? 0,
    frame_actual: o.frame_actual ?? 0,
    unknown_count: o.unknown_count ?? 0,
    unknown_actual: o.unknown_actual ?? 0,
    assigned_count: o.assigned_count ?? 0,
    assigned_actual: o.assigned_actual ?? 0,
    unassigned_count: o.unassigned_count ?? 0,
    unassigned_actual: o.unassigned_actual ?? 0,
    monthly: o.monthly ?? [],
    monthly_trend: o.monthly_trend ?? o.monthly ?? [],
    quarterly: o.quarterly ?? [],
    quarterly_contribution: o.quarterly_contribution ?? o.quarterly ?? [],
    field_breakdown: o.field_breakdown ?? [],
    signing_breakdown: o.signing_breakdown ?? [],
    data_quality_warnings: o.data_quality_warnings ?? [],
    applied_filters: o.applied_filters ?? { year: null, date_from: null, date_to: null, period: null, quarter: null, month: null, field: null, owner_user_id: null, signing_bucket: null },
  };
}

export async function getContracts(params: {
  year?: number;
  page?: number;
  page_size?: number;
  search?: string;
  field?: string;
  signing_bucket?: string;
  contract_state?: string;
  gcn_state?: string;
  value_filter?: string;
  sort_by?: string;
  sort_order?: string;
  owner_user_id?: number;
  owner_email?: string;
}): Promise<ContractListResponse> {
  const q = new URLSearchParams();
  if (params.year != null) q.set('year', String(params.year));
  if (params.page != null) q.set('page', String(params.page));
  if (params.page_size != null) q.set('page_size', String(params.page_size));
  if (params.search) q.set('search', params.search);
  if (params.field) q.set('field', params.field);
  if (params.signing_bucket) q.set('signing_bucket', params.signing_bucket);
  if (params.contract_state) q.set('contract_state', params.contract_state);
  if (params.gcn_state) q.set('gcn_state', params.gcn_state);
  if (params.value_filter && params.value_filter !== 'all') q.set('value_filter', params.value_filter);
  if (params.sort_by) q.set('sort_by', params.sort_by);
  if (params.sort_order) q.set('sort_order', params.sort_order);
  if (params.owner_user_id != null) q.set('owner_user_id', String(params.owner_user_id));
  if (params.owner_email) q.set('owner_email', params.owner_email);
  const suffix = q.toString();
  const raw = await apiRequest<ContractListResponse | null>(`/reports/v2/contracts${suffix ? `?${suffix}` : ''}`, { token: getToken() });
  if (raw == null) {
    throw new Error('Khong nhan duoc danh sach hop dong');
  }
  return {
    items: raw.items ?? [],
    total: raw.total ?? 0,
    page: raw.page ?? 1,
    page_size: raw.page_size ?? 20,
    total_pages: raw.total_pages ?? 1,
  };
}

export async function getUsersReport(year: number): Promise<UsersReportResponse> {
  const raw = await apiRequest<UsersReportResponse | null>(`/reports/v2/users?year=${year}`, { token: getToken() });
  if (raw == null) {
    throw new Error('Khong nhan duoc du lieu nhan vien');
  }
  return {
    year: raw.year ?? year,
    users: raw.users ?? [],
    unassigned: raw.unassigned ?? { user_id: null, username: null, display_name: 'Chua gan', is_active: null, configured: false, annual_target: null, target_zero: false, actual: 0, contract_count: 0, remaining: null, exceeded: null, progress_percent: null, new_count: null, new_actual: null, renewal_count: null, renewal_actual: null, frame_count: null, frame_actual: null, unknown_count: null, unknown_actual: null },
    branch: raw.branch ?? { assigned_count: 0, assigned_actual: 0, unassigned_count: 0, unassigned_actual: 0, contract_count: 0, actual: 0 },
  };
}

export async function getRenewalsReport(params: {
  year: number;
  page?: number;
  page_size?: number;
  include_historical?: boolean;
}): Promise<RenewalsReportResponse> {
  const q = new URLSearchParams({ year: String(params.year) });
  if (params.page != null) q.set('page', String(params.page));
  if (params.page_size != null) q.set('page_size', String(params.page_size));
  if (params.include_historical) q.set('include_historical', 'true');
  const raw = await apiRequest<RenewalsReportResponse | null>(`/reports/v2/renewals?${q.toString()}`, { token: getToken() });
  if (raw == null) {
    throw new Error('Khong nhan duoc danh sach tai ky');
  }
  return {
    year: raw.year ?? params.year,
    include_historical: raw.include_historical ?? false,
    total_count: raw.total_count ?? 0,
    needs_renewal_count: raw.needs_renewal_count ?? 0,
    expiring_soon_count: raw.expiring_soon_count ?? 0,
    overdue_count: raw.overdue_count ?? 0,
    renewed_count: raw.renewed_count ?? 0,
    unassigned_count: raw.unassigned_count ?? 0,
    linked_count: raw.linked_count ?? 0,
    unlinked_count: raw.unlinked_count ?? 0,
    null_value_count: raw.null_value_count ?? 0,
    zero_value_count: raw.zero_value_count ?? 0,
    total_value: raw.total_value ?? 0,
    items: raw.items ?? [],
  };
}

export async function getGcnReport(params: {
  year: number;
  page?: number;
  page_size?: number;
}): Promise<GcnReportResponse> {
  const q = new URLSearchParams({ year: String(params.year) });
  if (params.page != null) q.set('page', String(params.page));
  if (params.page_size != null) q.set('page_size', String(params.page_size));
  const raw = await apiRequest<GcnReportResponse | null>(`/reports/v2/gcn?${q.toString()}`, { token: getToken() });
  if (raw == null) {
    throw new Error('Khong nhan duoc danh sach GCN');
  }
  return {
    year: raw.year ?? params.year,
    total: raw.total ?? 0,
    total_count: raw.total_count ?? 0,
    issued_count: raw.issued_count ?? 0,
    missing_count: raw.missing_count ?? 0,
    items: raw.items ?? [],
  };
}

// ─── Export ──────────────────────────────────────────────────────────────

export async function exportReport(body: ExportRequest): Promise<Blob> {
  const token = getToken();
  const res = await fetch('/api/reports/v2/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      if (json?.detail) msg = json.detail;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.blob();
}

// ─── Formatters ──────────────────────────────────────────────────────────

export const fmtVND = (n: number | null | undefined): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n || 0);

export const fmtNum = (n: number | null | undefined): string =>
  new Intl.NumberFormat('vi-VN').format(n || 0);

export const fmtDate = (s: string | null | undefined): string => {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('vi-VN');
};

export const fmtDateShort = (s: string | null | undefined): string => {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
};
