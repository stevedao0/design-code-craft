/**
 * KPI Field Assignment API client.
 *
 * Independent per-field KPI management endpoints (Phase 5).
 * Uses standard apiRequest with bearer auth.
 */
import { apiRequest } from './apiClient';
import { TOKEN_KEY } from './authClient';

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export interface KpiFieldYearOption {
  year: number;
  is_current: boolean;
}
export interface KpiFieldUserOption {
  user_id: number;
  email: string;
  display_name: string | null;
  role: string;
}
export interface KpiFieldDomainOption {
  code: string;
  label: string;
}

export interface KpiFieldAssignment {
  assignment_id: number;
  user_id: number;
  user_email: string;
  user_display_name: string | null;
  reporting_year: number;
  field_code: string;
  field_label: string;
  target_amount: number;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
}

export interface KpiFieldResult {
  assignment_ids?: number[];
  kpi_group_code?: string;
  field_code: string;
  field_label: string;
  member_field_codes?: string[];
  member_breakdown?: { member_field_code: string; contract_count: number; valued_contract_count: number; actual: number }[];
  target: number;
  actual: number;
  contract_count: number;
  valued_contract_count?: number;
  unresolved_value_count?: number;
  progress_percent: number;
  remaining: number;
  exceeded: number;
  is_active: boolean;
  has_target: boolean;
}

export interface KpiFieldTotals {
  target_amount: number;
  actual_amount: number;
  contract_count: number;
  completion_percent: number | null;
  missing_amount: number | null;
  exceeded_amount: number | null;
}

export interface KpiFieldReconciliation {
  unit_revenue_year: number;
  unit_contract_count: number;
  kpi_field_revenue_year: number;
  kpi_field_contract_count: number;
  non_kpi_field_revenue_year: number;
  non_kpi_field_contract_count: number;
  reason_breakdown: string;
}

export interface KpiFieldResponse {
  year: number;
  user_email: string;
  managed_field_count: number;
  fields: KpiFieldResult[];
  totals: KpiFieldTotals;
  reconciliation: KpiFieldReconciliation;
}

export interface KpiFieldAssignmentListResponse {
  year: number;
  user_email: string;
  assignments: KpiFieldAssignment[];
}

export async function getYears(): Promise<{ years: KpiFieldYearOption[] }> {
  return apiRequest<{ years: KpiFieldYearOption[] }>('/kpi/years', { token: getToken() });
}

export async function getFieldUsers(): Promise<{ users: KpiFieldUserOption[] }> {
  return apiRequest<{ users: KpiFieldUserOption[] }>('/kpi/field-users', { token: getToken() });
}

export async function getFieldDomains(): Promise<{ domains: KpiFieldDomainOption[] }> {
  return apiRequest<{ domains: KpiFieldDomainOption[] }>('/kpi/field-domains', { token: getToken() });
}

export async function getFieldAssignments(
  year: number,
  user_email: string
): Promise<KpiFieldAssignmentListResponse> {
  return apiRequest<KpiFieldAssignmentListResponse>(
    `/kpi/field-assignments?year=${year}&user_email=${encodeURIComponent(user_email)}`,
    { token: getToken() }
  );
}

export async function createFieldAssignment(body: {
  reporting_year: number;
  user_email: string;
  field_code: string;
  target_amount: number;
  note?: string | null;
  is_active?: boolean;
}): Promise<KpiFieldAssignment> {
  return apiRequest<KpiFieldAssignment>('/kpi/field-assignments', {
    method: 'POST',
    body,
    token: getToken(),
  });
}

export async function updateFieldAssignment(
  assignment_id: number,
  body: { target_amount?: number; note?: string | null; is_active?: boolean }
): Promise<KpiFieldAssignment> {
  return apiRequest<KpiFieldAssignment>(
    `/kpi/field-assignments/${assignment_id}`,
    { method: 'PATCH', body: { assignment_id, ...body }, token: getToken() }
  );
}

export async function deleteFieldAssignment(assignment_id: number): Promise<void> {
  await apiRequest<void>(`/kpi/field-assignments/${assignment_id}`, {
    method: 'DELETE',
    token: getToken(),
  });
}

export async function getFieldKpi(
  year: number,
  user_email: string
): Promise<KpiFieldResponse> {
  return apiRequest<KpiFieldResponse>(
    `/kpi/field-kpi?year=${year}&user_email=${encodeURIComponent(user_email)}`,
    { token: getToken() }
  );
}

export interface KpiFieldEmployeeSummary {
  user_id: number;
  email: string;
  display_name?: string | null;
  field_count: number;
  active_count: number;
  total_target: number | null;
  total_actual: number | null;
  best_progress_percent: number | null;
  has_inactive: boolean;
}

export interface KpiFieldAdminOverviewResponse {
  year: number;
  total_employees: number;
  employees: KpiFieldEmployeeSummary[];
}

export async function getFieldKpiAll(year: number): Promise<KpiFieldAdminOverviewResponse> {
  return apiRequest<KpiFieldAdminOverviewResponse>(
    `/kpi/field-kpi-all?year=${year}`,
    { token: getToken() }
  );
}

export interface OrgFieldRow {
  field_code: string;
  field_label: string;
  target: number;
  actual: number;
  contract_count: number;
  valued_contract_count: number;
  unresolved_value_count: number;
  user_count: number;
  progress_percent: number;
  has_target: boolean;
}

export interface OrgFieldKpiResponse {
  year: number;
  fields: OrgFieldRow[];
}

export async function getOrgFieldKpi(year: number): Promise<OrgFieldKpiResponse> {
  return apiRequest<OrgFieldKpiResponse>(
    `/kpi/field-kpi-org?year=${year}`,
    { token: getToken() }
  );
}

