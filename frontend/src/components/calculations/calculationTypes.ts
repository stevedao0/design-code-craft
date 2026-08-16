/**
 * Domain types for the Lịch sử bảng tính (calculation history) workflow.
 *
 * PROTOTYPE FIXES (vs. design reference ZIP):
 *  - Single `status` field split into two orthogonal flags:
 *      * verificationStatus: 'confirmed' | 'review_required'
 *      * excelExportedAt: ISO timestamp or null
 *  - Display names only — never used in formulas.
 *  - Locations kept separate by id; no merging on field/business-type.
 */

export type VerificationStatus = 'confirmed' | 'review_required';

export type ExcelExportUiState =
  | 'ready'
  | 'requested'
  | 'unavailable'
  | 'success';

export type CalculationBreakdownLine = {
  id: string;
  /** Tier / level label, e.g. "4 phòng đầu (≤20m²)", "Đến 15 m²" */
  label: string;
  /** Formatted amount string, e.g. "18.216.000 đ" */
  value: string;
  /** Human-readable scale + coefficient string, e.g. "Quy mô: 4 phòng · Hệ số: 1,6/phòng" */
  detail?: string | null;
  /** Raw quantity (room count, m² count, etc.) */
  qty?: number | null;
  /** Raw coefficient (e.g. 1.6) */
  coef?: number | null;
  /** Human-readable scale text, e.g. "4 phòng" */
  scaleText?: string | null;
};

export type CalculationLocationSnapshot = {
  id: string;
  /** "Tên hiển thị trên bảng tính" — UI label override only. */
  displayName?: string | null;
  /** Real area/location name from the calculator — never overridden. */
  actualLocationName: string;
  /** Bảng hiệu / tên cơ sở. null = not declared. */
  actualArea: string | null;
  /** "Lĩnh vực áp dụng" label. */
  domainLabel: string;
  /** Địa chỉ sử dụng âm nhạc. null = not declared. */
  musicUseAddress: string | null;
  areaDisplay: string;
  /** Human-readable room count for room-based fields (e.g. "12 phòng"), null otherwise. */
  roomsDisplay?: string | null;
  /** Raw room count, null if not a room-based field. */
  roomsCount?: number | null;
  termDisplay: string;
  urbanType: string;
  urbanCoefficient: string;
  supportDisplay: string;
  royaltyBeforeVatDisplay: string;
  vatDisplay: string;
  totalPaymentDisplay: string;
  calculationNarrative?: string | null;
  calculationBreakdown?: readonly CalculationBreakdownLine[];
  /** Raw numeric values, preserved for Excel export — never recomputed. */
  royaltyBeforeVatRaw: number;
  vatRaw: number;
  totalPaymentRaw: number;
  /** Term in months, for Excel export. */
  durationMonths: number;
  /** Raw location area (m²) — only used when backend snapshot supplies it. */
  areaM2?: number;
};

export type CalculationSnapshot = {
  id: string;
  /** Source calculation code (e.g. calculator-generated BG-...). */
  calculationCode: string;
  /** ISO timestamp used for filtering/sorting. */
  createdAtIso: string;
  /** Display-only string e.g. "26/07/2026 10:15". */
  createdAtDisplay: string;
  legalEntityName: string;
  contractReference?: string | null;
  customerAddress?: string | null;
  customerRepresentative?: string | null;
  locationCount: number;
  royaltyBeforeVatDisplay: string;
  vatDisplay: string;
  totalPaymentDisplay: string;
  amountInWords: string;
  createdBy: string;
  /** Verification — separate from Excel export. */
  verificationStatus: VerificationStatus;
  /** Last successful Excel export timestamp (ISO) or null. */
  excelExportedAt?: string | null;
  /** Snapshot source: 'calculator' (local) or 'backend'. */
  source: 'calculator' | 'backend';
  /** Backend-supplied legal/calculate basis; never hard-coded on frontend. */
  legalBasis?: string | null;
  legalArticle?: string | null;
  effectiveFrom?: string | null;
  baseSalaryDisplay?: string | null;
  locations: readonly CalculationLocationSnapshot[];
};

export type CalculationHistoryLoadState = 'loading' | 'ready' | 'error';

export type VerificationPresentation = {
  label: string;
  className: string;
  dotClassName: string;
};

export function getVerificationPresentation(
  status: VerificationStatus
): VerificationPresentation {
  switch (status) {
    case 'confirmed':
      return {
        label: 'Đã xác nhận số liệu',
        className: 'bg-teal-50 text-teal-800 ring-teal-700/15',
        dotClassName: 'bg-teal-600',
      };
    case 'review_required':
    default:
      return {
        label: 'Cần rà soát',
        className: 'bg-amber-50 text-amber-800 ring-amber-700/15',
        dotClassName: 'bg-amber-500',
      };
  }
}

/** Format a Vietnam-time display string for a snapshot's createdAt. */
export function formatSnapshotTimestamp(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}
