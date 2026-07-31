/**
 * KPI Reports — shared types matching Phase 3/4 backend schemas.
 * Maps to: /api/kpi/* and /api/reports/v2/*
 */

// ─── KPI types ────────────────────────────────────────────────────────────────

export interface AnnualTarget {
  year: number;
  annual_target: number;
  note?: string;
  updated_at?: string;
}

export interface BucketBreakdown {
  new_count: number;
  new_actual: number;
  renewal_count: number;
  renewal_actual: number;
  frame_count: number;
  frame_actual: number;
  unknown_count: number;
  unknown_actual: number;
}

export interface MonthlyContribution {
  month: number;
  actual: number;
  count: number;
}

export interface QuarterlyContribution {
  quarter: number;
  actual: number;
  count: number;
}

export interface AnnualSummary {
  user_id: number;
  display_name: string | null;
  year: number;
  configured: boolean;
  annual_target: number | null;
  target_zero: boolean;
  actual: number;
  contract_count: number;
  remaining: number | null;
  exceeded: number | null;
  progress_percent: number | null;
  buckets: BucketBreakdown;
  monthly: MonthlyContribution[];
  quarterly: QuarterlyContribution[];
}

export interface AnnualKpiOverview {
  year: number;
  assigned_actual: number;
  assigned_count: number;
  unassigned_actual: number;
  unassigned_count: number;
  branch_actual: number;
  branch_count: number;
  configured_user_count: number;
  unconfigured_user_count: number;
  sum_user_targets: number;
  buckets: BucketBreakdown;
  users: AnnualKpiUserRow[];
  department_aggregation: boolean;
  department_note: string;
}

export interface AnnualKpiUserRow {
  user_id: number;
  display_name: string | null;
  username: string;
  configured: boolean;
  annual_target: number | null;
  target_zero: boolean;
  actual: number;
  contract_count: number;
  remaining: number | null;
  exceeded: number | null;
  progress_percent: number | null;
  new_count: number | null;
  new_actual: number | null;
  renewal_count: number | null;
  renewal_actual: number | null;
  frame_count: number | null;
  frame_actual: number | null;
  unknown_count: number | null;
  unknown_actual: number | null;
}

// ─── Contract types (Phase 4 /api/reports/v2) ────────────────────────────────

export interface ContractListItem {
  id: number;
  contract_number: string;
  organization_name: string;
  field: string;
  owner_user_id: number | null;
  owner_email: string | null;
  owner_name: string | null;
  signed_date: string | null;
  start_date: string | null;
  end_date: string | null;
  royalty_amount_before_vat: number | null;
  total_payment: number | null;
  signing_bucket: string;
  signing_bucket_label: string;
  renewal_status: string | null;
  reference_contract_id: number | null;
  reference_contract_number: string | null;
  contract_state: string;
  days_to_expiry: number | null;
  gcn_number: string | null;
  gcn_state: string;
  detail_url: string;
}

export interface ContractListResponse {
  items: ContractListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ─── User report types ───────────────────────────────────────────────────────

export interface UserReportItem {
  user_id: number;
  username: string | null;
  display_name: string | null;
  is_active: boolean | null;
  configured: boolean;
  annual_target: number | null;
  target_zero: boolean;
  actual: number;
  contract_count: number;
  positive_value_count?: number;
  zero_value_count?: number;
  null_value_count?: number;
  remaining: number | null;
  exceeded: number | null;
  progress_percent: number | null;
  new_count: number | null;
  new_actual: number | null;
  renewal_count: number | null;
  renewal_actual: number | null;
  frame_count: number | null;
  frame_actual: number | null;
  unknown_count: number | null;
  unknown_actual: number | null;
}

export interface UnassignedItem {
  user_id: null;
  username: null;
  display_name: string;
  is_active: null;
  configured: boolean;
  annual_target: null;
  target_zero: boolean;
  actual: number;
  contract_count: number;
  positive_value_count?: number;
  zero_value_count?: number;
  null_value_count?: number;
  remaining: null;
  exceeded: null;
  progress_percent: null;
  new_count: null;
  new_actual: null;
  renewal_count: null;
  renewal_actual: null;
  frame_count: null;
  frame_actual: null;
  unknown_count: null;
  unknown_actual: null;
}

export interface BranchTotal {
  assigned_count: number;
  assigned_actual: number;
  unassigned_count: number;
  unassigned_actual: number;
  contract_count: number;
  actual: number;
  positive_value_count: number;
  zero_value_count: number;
  null_value_count: number;
}

export interface UsersReportResponse {
  year: number;
  users: UserReportItem[];
  unassigned: UnassignedItem;
  branch: BranchTotal;
}

// ─── Renewal types ───────────────────────────────────────────────────────────

export interface RenewalItem {
  old_contract_id: number;
  old_contract_number: string;
  organization_name: string;
  field: string;
  owner_user_id: number | null;
  owner_email: string | null;
  owner_name: string | null;
  signed_date: string | null;
  end_date: string | null;
  days_remaining: number | null;
  is_overdue: boolean;
  royalty_amount_before_vat: number | null;
  renewal_status: string | null;
  renewal_link_status: string;
  new_contract_id: number | null;
  new_contract_number: string | null;
  new_contract_signed_date: string | null;
  new_contract_actual: number | null;
}

export interface RenewalsReportResponse {
  year: number;
  include_historical: boolean;
  total_count: number;
  needs_renewal_count: number;
  expiring_soon_count: number;
  overdue_count: number;
  renewed_count: number;
  unassigned_count: number;
  linked_count: number;
  unlinked_count: number;
  total_value: number;
  null_value_count: number;
  zero_value_count: number;
  items: RenewalItem[];
}

// ─── GCN types ───────────────────────────────────────────────────────────────

export interface GcnItem {
  id: number;
  certificate_no: string | null;
  certificate_status: string;
  contract_id: number;
  contract_no: string;
  organization_name: string;
  issue_date: string | null;
}

export interface GcnReportResponse {
  year: number;
  total: number;
  total_count: number;
  issued_count: number;
  missing_count: number;
  items: GcnItem[];
}

// ─── Overview types ───────────────────────────────────────────────────────────

export interface MonthlyTrendItem {
  month: number;
  count: number;
  actual: number;
}

export interface QuarterlyContributionItem {
  quarter: number;
  count: number;
  actual: number;
}

export interface FieldBreakdownItem {
  field: string;
  count: number;
  actual: number;
}

export interface SigningBreakdownItem {
  bucket: string;
  label: string;
  count: number;
  actual: number;
}

export interface AppliedFilters {
  year: number | null;
  date_from: string | null;
  date_to: string | null;
  period: string | null;
  quarter: number | null;
  month: number | null;
  field: string | null;
  owner_user_id: number | null;
  signing_bucket: string | null;
}

export interface OverviewResponse {
  year: number;
  revenue_before_vat: number;
  contract_total_after_vat: number;
  actual: number;
  contract_count: number;
  total_count: number;
  total_actual: number;
  positive_value_count: number;
  zero_value_count: number;
  null_value_count: number;
  active_count: number;
  expired_count: number;
  expiring_count: number;
  gcn_issued_count: number;
  gcn_missing_count: number;
  new_count: number;
  new_actual: number;
  renewal_count: number;
  renewal_actual: number;
  frame_count: number;
  frame_actual: number;
  unknown_count: number;
  unknown_actual: number;
  assigned_count: number;
  assigned_actual: number;
  unassigned_count: number;
  unassigned_actual: number;
  monthly: MonthlyTrendItem[];
  monthly_trend: MonthlyTrendItem[];
  quarterly: QuarterlyContributionItem[];
  quarterly_contribution: QuarterlyContributionItem[];
  field_breakdown: FieldBreakdownItem[];
  signing_breakdown: SigningBreakdownItem[];
  data_quality_warnings: string[];
  applied_filters: AppliedFilters;
}

// ─── Export types ─────────────────────────────────────────────────────────────

export type ExportFormat = 'xlsx' | 'docx' | 'pdf';

export interface ExportRequest {
  report_type: string;
  year: number;
  format: ExportFormat;
  filters?: Record<string, string | number | null>;
}
