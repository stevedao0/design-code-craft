/**
 * Central types module for all Reports-related data.
 *
 * This file contains ONLY type definitions — no runtime code, no imports from
 * reportsClient, reportData, reportEmployees, or any page/component.
 *
 * All other modules import types from here to avoid circular import chains.
 *
 * Type-only imports (import type {}) are erased at compile time so they
 * never create runtime dependency edges.
 */

// =============================================================================
// Revenue & field breakdown
// =============================================================================

export type RevenueYearItem = {
  year: number;
  contract_count: number;
  total_revenue: number | null;
  cumulative: boolean;
  isNull?: boolean;
  isCurrent?: boolean;
  revenueBn?: number;
  forecastBn?: number;
  prevRevenueBn?: number;
};

export type FieldCategoryCount = {
  key: string;
  label: string;
  count: number;
};

// =============================================================================
// Contract types
// =============================================================================

export type SignedContractItem = {
  id: number;
  contract_no: string;
  signed_date: string | null;
  partner: string;
  brand: string | null;
  field: string | null;
  value: number | null;
  gcn_status: string;
  gcn_certificate_no: string | null;
  renewal_status: string | null;
  start_date: string | null;
  end_date: string | null;
  // Structured address fields
  legal_ward: string | null;
  legal_province: string | null;
  usage_ward: string | null;
  usage_province: string | null;
  usage_full_address: string | null;
};

export type ExpiringContractItem = {
  id: number;
  contract_no: string;
  partner: string;
  field: string;
  expire_date: string | null;
  days_left: number;
  value: number | null;
  // Structured address fields
  usage_ward: string | null;
  usage_province: string | null;
};

export type CertificateListItem = {
  id: number;
  certificate_no: string | null;
  contract_no: string;
  organization_name: string;
  status: string;
  print_count: number;
  printed_at: string | null;
};

export type GcnStatusCount = {
  status: string;
  label: string;
  count: number;
};

export type PendingContractItem = {
  id: number;
  contract_no: string;
  partner: string;
  brand: string | null;
  field: string | null;
  signed_date: string | null;
  renewal_status: string | null;
  value: number | null;
  nguoi_thuc_hien: string | null;
  days_pending: number;
  category: 'missing_finance' | 'awaiting_partner' | 'draft' | 'no_gcn';
};

export type EmployeeContractItem = {
  contract_id: number;
  contract_no: string;
  legal_name: string | null;
  brand_name: string | null;
  domain: string | null;
  status: string;
  effective_date: string | null;
  expiry_date: string | null;
  total_amount: number | null;
  created_at: string | null;
};

// =============================================================================
// Report summary
// =============================================================================

export type ReportsSummary = {
  total_contracts: number;
  active_count: number;
  expiring_30d_count: number;
  expiring_60d_count: number;
  expired_count: number;
  pending_renewal_count: number;
  new_count: number;
  unknown_status_count: number;
  revenue_by_year: RevenueYearItem[];
  expiring_contracts: ExpiringContractItem[];
  field_breakdown: FieldCategoryCount[];
  signed_contracts: SignedContractItem[];
  certificate_total: number;
  certificate_by_status: GcnStatusCount[];
  certificate_recent: CertificateListItem[];
  total_works: number;
  gcn_draft: number;
  gcn_test_printed: number;
  gcn_final_printed: number;
};

// =============================================================================
// Signed contracts
// =============================================================================

export type SignedContractsResponse = {
  items: SignedContractItem[];
  total: number;
  total_value: number;
  average_value: number;
  applied_scope: string;
  applied_date_from: string;
  applied_date_to: string;
};

// =============================================================================
// Expiring contracts
// =============================================================================

export type ExpiringContractsResponse = {
  items: ExpiringContractItem[];
  total: number;
};

// =============================================================================
// Certificate list
// =============================================================================

export type CertificateListResponse = {
  items: CertificateListItem[];
  total: number;
};

// =============================================================================
// Employee stats
// =============================================================================

export type EmployeeStatsItem = {
  name: string;
  signed_this_week: number;
  signed_this_month: number;
  signed_this_quarter: number;
  signed_this_year: number;
  total_value: number;
  avg_value: number;
  pending_count: number;
  expiring_soon: number;
};

export type EmployeeStatsResponse = {
  employees: EmployeeStatsItem[];
  total_employees: number;
};

export type EmployeeOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  contract_count: number;
};

export type EmployeeOptionsResponse = {
  items: EmployeeOption[];
};

// =============================================================================
// Employee performance
// =============================================================================

export type EmployeePerformanceItem = {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  total_contracts: number;
  signed_contracts: number;
  pending_contracts: number;
  expiring_contracts: number;
  expired_contracts: number;
  total_revenue: number;
  avg_revenue_per_contract: number;
  last_contract_date: string | null;
};

export type EmployeePerformanceSummary = {
  total_employees: number;
  total_contracts: number;
  signed_contracts: number;
  pending_contracts: number;
  expiring_contracts: number;
  expired_contracts: number;
  total_revenue: number;
};

export type EmployeePerformanceResponse = {
  summary: EmployeePerformanceSummary;
  items: EmployeePerformanceItem[];
};

// =============================================================================
// Employee contracts
// =============================================================================

export type EmployeeContractsResponse = {
  items: EmployeeContractItem[];
  total: number;
  page: number;
  page_size: number;
};

// =============================================================================
// Pending contracts
// =============================================================================

export type PendingContractsResponse = {
  items: PendingContractItem[];
  total: number;
};

// =============================================================================
// Report UI helpers
// =============================================================================

export type ReportInsight = {
  id: string;
  tone: 'rose' | 'amber' | 'indigo' | 'violet' | 'emerald';
  title: string;
  description: string;
};

export type SignedScope = 'week' | 'month' | 'quarter' | 'year';

export type ResolvedPendingRow = {
  id: number;
  contract_no: string;
  partner: string;
  brand: string | null;
  field: string | null;
  signed_date: string | null;
  renewal_status: string | null;
  value: number | null;
  nguoi_thuc_hien: string | null;
  days_pending: number;
  category: 'missing_finance' | 'awaiting_partner' | 'draft' | 'no_gcn';
  priority: { label: string; tone: 'danger' | 'warning' | 'neutral' };
};
