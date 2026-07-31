/**
 * Dashboard mock data — DEPRECATED.
 *
 * All dashboard data now comes from real API endpoints:
 *   /api/reports/summary
 *   /api/contracts
 *
 * This file is kept on disk to avoid import-breaking changes.
 * No static data should be used in the UI.
 */

// Placeholder — all values come from the API
export const VCPMC_STATS = {
  totalBackground: 0,
  active: 0,
  expiringIn30Days: 0,
  expiringIn60Days: 0,
  expired: 0,
  pendingRenewal: 0,
  renewed: 0,
  totalWorks: 0,
  gcnDraft: 0,
  gcnTestPrinted: 0,
  gcnFinalPrinted: 0,
  revenue2026: 0,
  revenue2025: 0
};

export const STATUS_BREAKDOWN: { key: string; name: string; value: number; tone: string }[] = [];
export const REVENUE_BY_YEAR: { year: string; revenue: number }[] = [];
export const RECENT_ACTIVITIES: { id: string; actor: string; action: string; target: string; time: string; kind: string }[] = [];
export const EXPIRING_CONTRACTS: { id: string; partner: string; contractNo: string; expireDate: string; daysLeft: number; value: number }[] = [];
