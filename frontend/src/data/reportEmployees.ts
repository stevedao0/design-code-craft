/**
 * Employee performance + pending-contract helpers for the Reports page.
 *
 * IMPORTANT: All real data comes from the /api/reports/summary endpoint.
 * This file only contains:
 *   - Type definitions (mirroring backend response)
 *   - Helper functions for signed contracts filtering
 *   - Pending category label mappings
 *
 * No hardcoded mock/clone employee data here.
 *
 * NOTE: Shared types imported from reportsTypes.ts to avoid circular imports.
 */
import type { SignedContractItem } from '../lib/reportsTypes';

// =============================================================================
// Pending contract categories
// =============================================================================

export type PendingCategory =
  | 'draft'
  | 'awaiting_partner'
  | 'missing_partner_info'
  | 'missing_finance'
  | 'awaiting_approval'
  | 'no_gcn';

export const PENDING_CATEGORY_LABEL: Record<PendingCategory, string> = {
  draft: 'Bản nháp',
  awaiting_partner: 'Chờ khách phản hồi',
  missing_partner_info: 'Thiếu thông tin đối tác',
  missing_finance: 'Thiếu dữ liệu tài chính',
  awaiting_approval: 'Chờ duyệt',
  no_gcn: 'Chưa tạo GCN',
};

/**
 * Get priority badge from days stuck.
 * NOTE: Real pending contracts should have their own priority stored in DB.
 * This helper is used as fallback when no priority data exists.
 */
export function getPendingPriority(
  daysStuck: number
): { label: string; tone: 'danger' | 'warning' | 'neutral' } {
  if (daysStuck > 14) return { label: 'Cao', tone: 'danger' };
  if (daysStuck >= 7) return { label: 'Theo dõi', tone: 'warning' };
  return { label: 'Bình thường', tone: 'neutral' };
}

// =============================================================================
// Signed contracts filtering (uses real data from API)
// =============================================================================

export type SignedScope = 'week' | 'month' | 'quarter' | 'year';

/**
 * Filter signed contracts by time scope using real signed_date from DB.
 *
 * NOTE: The backend now provides signed_contracts from the summary endpoint.
 * This function is kept for backward compatibility — in production, filtering
 * should be done server-side.
 */
export function filterSignedByScope(
  scope: SignedScope,
  todayIso: string = new Date().toISOString().slice(0, 10)
): SignedContractItem[] {
  // This function is no longer the primary data source.
  // Real data comes from /api/reports/summary via reportsClient.ts.
  // Kept here for reference and potential future server-side filtering.
  return [];
}

// =============================================================================
// Employee performance
//
// NOTE: Employee-level stats (signedThisWeek, signedThisMonth, pending count, etc.)
// are not yet available from the API. The employee performance table will be
// populated with real data once the backend provides per-user aggregation.
//
// Placeholder: this will be replaced with real data from /api/reports/employees
// or /api/users/performance in a future phase.
// =============================================================================

export type EmployeeKey = 'tuan' | 'admin' | 'nv1';

export type EmployeePerformance = {
  key: EmployeeKey;
  name: string;
  email: string;
  signedThisWeek: number;
  signedThisMonth: number;
  signedThisYear: number;
  pending: number;
  expiringAssigned: number;
  revenue: number;
  gcnHandled: number;
  completionRate: number;
};

export type PerformanceTone = 'good' | 'watch' | 'overload';

export function getPerformanceTone(
  p: EmployeePerformance
): PerformanceTone {
  if (p.completionRate >= 80 && p.pending <= 4) return 'good';
  if (p.completionRate < 70 || p.pending >= 6) return 'overload';
  return 'watch';
}

/**
 * NOTE: EMPLOYEE_PERFORMANCE is a placeholder.
 * Real per-user stats will come from the backend in a future phase.
 * Until then, the employee performance table shows a placeholder message.
 */
export const EMPLOYEE_PERFORMANCE: EmployeePerformance[] = [];

// =============================================================================
// Pending rows
//
// NOTE: The backend does not yet have a pending-contracts table.
// Real pending data should be added when the backend implements:
//   1. A contract workflow/status tracking table, OR
//   2. Contracts flagged with missing data indicators
//
// Until then, the pending contracts section will show an empty state
// or data derived from contracts with null values.
// =============================================================================

export type PendingRow = {
  id: string;
  contractRecordId: number;
  category: PendingCategory;
  assignee: string;
  createdAt: string;
  daysStuck: number;
  missingStep: string;
};

/**
 * NOTE: PENDING_ROWS is a placeholder.
 * Real pending contracts come from backend workflow tracking.
 */
export const PENDING_ROWS: PendingRow[] = [];

/**
 * Resolve pending rows with their contract data.
 * Returns enriched rows with contract details.
 */
export type ResolvedPendingRow = PendingRow & {
  contract: {
    id: number;
    don_vi_ten: string;
    ten_bang_hieu: string | null;
    linh_vuc_hien_thi: string;
  } | null;
};

export function resolvePendingRows(
  rows: PendingRow[],
  contractMap: Map<number, { don_vi_ten: string; ten_bang_hieu: string | null; linh_vuc_hien_thi: string }>
): ResolvedPendingRow[] {
  return rows
    .map((p) => {
      const c = contractMap.get(p.contractRecordId);
      return c ? { ...p, contract: c } : null;
    })
    .filter((x): x is ResolvedPendingRow => x !== null);
}
