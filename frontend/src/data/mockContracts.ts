/**
 * Dashboard contract helpers.
 *
 * NOTE: In the current architecture, contract data comes from the API.
 * This file is kept on disk but its exports are no longer used.
 * No static data should be added here.
 */
import type { ContractRecord } from './contractRecords';

export type DashboardContractRow = {
  id: string;
  contractNo: string;
  partner: string;
  field: string;
  signedDate: string;
  value: number | null;
  status: 'active' | 'expiring' | 'expired';
  brand: string | null;
};

/**
 * Build dashboard rows from a list of contract records.
 * Use this with data from /api/reports/summary or /api/contracts.
 */
export function buildDashboardRows(contracts: ContractRecord[]): DashboardContractRow[] {
  return [];
}

/**
 * @deprecated No longer used. Real data comes from the API.
 */
export const RECENT_CONTRACTS: DashboardContractRow[] = [];
