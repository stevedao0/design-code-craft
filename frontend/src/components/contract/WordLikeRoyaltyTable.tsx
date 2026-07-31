import React from 'react';
import styles from './WordLikeRoyaltyTable.module.css';

// =============================================================================
// Types
// =============================================================================

export type RoyaltyFeeLine = {
  /** Label for the fee line, e.g., "4 phòng đầu" */
  label: string;
  /** Base amount (unit price) in VND */
  baseAmount: number;
  /** Coefficient/multiple, e.g., 1.60 */
  coefficient?: number;
  /** Unit label, e.g., "phòng/năm" */
  unitLabel?: string;
  /** Quantity, e.g., 4 */
  quantity?: number;
  /** Total amount for this line in VND */
  amount: number;
};

export type RoyaltySummary = {
  /** Subtotal before support */
  subtotalBeforeSupport: number;
  /** Support rate as percentage, e.g., 20.0 */
  supportRate?: number;
  /** Support amount in VND */
  supportAmount?: number;
  /** Subtotal after support (before GTGT) */
  subtotalAfterSupport: number;
  /** VAT/GTGT rate as percentage, e.g., 8.0 */
  vatRate: number;
  /** VAT/GTGT amount in VND */
  vatAmount: number;
  /** Total amount after GTGT */
  totalAmount: number;
  /** Total amount in Vietnamese words */
  totalAmountInWords?: string;
  /** Support year for display, e.g., "2026" */
  supportYear?: string;
};

export type RoyaltyTableData = {
  /** Subject label, e.g., "phòng Karaoke" or "đối tượng" */
  subjectLabel: string;
  /** Total subject quantity text, e.g., "26 phòng" */
  subjectQuantityText: string;
  /** Formula description text */
  formulaText?: string;
  /** Individual fee lines */
  lines: RoyaltyFeeLine[];
  /** Summary calculations */
  summary: RoyaltySummary;
  /** Legal note for footer */
  legalNote?: string;
  /** Base salary for legal note generation */
  baseSalary?: number;
  /** Year for legal note */
  legalNoteYear?: string;
};

type WordLikeRoyaltyTableProps = {
  /** Data to render */
  data: RoyaltyTableData;
  /** Optional CSS class name */
  className?: string;
  /** Subject type for styling: 'karaoke' or 'kvc' or 'other' */
  subjectType?: 'karaoke' | 'kvc' | 'other';
};

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Format number as Vietnamese currency (dot separator, no decimals)
 * Correct: 14.976.000
 * Wrong: 14,976,000 or 14976000
 */
export function formatVnd(value: number | undefined | null): string {
  if (value === undefined || value === null) return '0';
  const num = Math.round(Number(value));
  return num.toLocaleString('vi-VN').replace(/,/g, '.');
}

/**
 * Format coefficient for display
 * e.g., 1.60 -> "1.60", 1.28 -> "1.28"
 */
export function formatCoefficient(value: number | undefined): string {
  if (value === undefined) return '-';
  return value.toFixed(2).replace('.', ',');
}

// =============================================================================
// Component
// =============================================================================

export function WordLikeRoyaltyTable({
  data,
  className = '',
  subjectType = 'karaoke',
}: WordLikeRoyaltyTableProps) {
  const {
    lines: rawLines,
    summary,
    subjectLabel,
    subjectQuantityText,
    formulaText,
    legalNote,
    baseSalary,
    legalNoteYear,
  } = data;

  // Safety net: never render empty / zero tier rows (e.g. "6 phòng sau" when
  // the contract only has 4 rooms). Same rule as the DOCX export row model.
  const lines = (rawLines ?? []).filter(
    (line) => line.amount > 0 && (line.quantity === undefined || line.quantity > 0)
  );

  // Check if data is complete enough to render table
  const hasValidLines = lines && lines.length > 0 && lines.some(l => l.amount > 0);
  const hasValidTotal = summary && summary.totalAmount > 0;

  // Generate legal note if not provided but we have baseSalary
  const generatedLegalNote = !legalNote && baseSalary
    ? `Mức lương cơ sở ${formatVnd(baseSalary)}đ có thời hạn bắt đầu từ ngày 1/7/2026 áp dụng khoản 2 Điều 3 Nghị định 161/2026/NĐ-CP ngày 15/5/2026`
    : legalNote;

  if (!hasValidLines && !hasValidTotal) {
    return (
      <div className={`${styles.placeholder} ${className}`}>
        <p className={styles.placeholderText}>Chưa có dữ liệu tính tiền bản quyền.</p>
      </div>
    );
  }

  if (!hasValidLines) {
    return (
      <div className={`${styles.placeholder} ${className}`}>
        <p className={styles.placeholderText}>Thiếu dòng tính phí để hiển thị bảng tiền bản quyền.</p>
      </div>
    );
  }

  // Subject row count for rowspan
  const totalRows = lines.length;
  const showSupportRow = summary.supportRate && summary.supportRate > 0;

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <table className={styles.table}>
        <colgroup>
          <col className={styles.colQuantity} />
          <col className={styles.colPricing} />
          <col className={styles.colAmount} />
        </colgroup>

        <thead>
          {/* Header row */}
          <tr>
            <th className={styles.th}>
              Số lượng<br />
              {subjectLabel}
            </th>
            <th className={styles.th}>
              Mức tiền bản quyền chưa bao gồm thuế GTGT
            </th>
            <th className={styles.th}>
              Thành tiền<br />
              <span className={styles.thSub}>(đồng)</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {/* Formula row - italic, centered */}
          {formulaText && (
            <tr>
              <td colSpan={3} className={styles.formulaRow}>
                {formulaText}
              </td>
            </tr>
          )}

          {/* Detail rows - fee tiers */}
          {lines.map((line, index) => (
            <tr key={index} className={styles.detailRow}>
              {/* Quantity cell - only show on first row */}
              <td className={`${styles.td} ${styles.tdQuantity} ${styles.center} ${index === 0 ? styles.bold : ''}`}>
                {index === 0 ? subjectQuantityText : ''}
              </td>

              {/* Pricing cell - fee details */}
              <td className={`${styles.td} ${styles.tdPricing}`}>
                <div className={styles.feeLine}>
                  <span className={styles.feeLabel}>{line.label}:</span>
                  <span className={styles.feeBase}>{formatVnd(line.baseAmount)} đồng</span>
                  <span className={styles.feeTimes}>x</span>
                  <span className={styles.feeRate}>
                    {formatCoefficient(line.coefficient)} {line.unitLabel || 'phòng/năm'}
                  </span>
                </div>
              </td>

              {/* Amount cell - right aligned */}
              <td className={`${styles.td} ${styles.tdAmount} ${styles.money}`}>
                {formatVnd(line.amount)}
              </td>
            </tr>
          ))}

          {/* Support row - if applicable */}
          {showSupportRow && (
            <tr>
              <td colSpan={2} className={`${styles.td} ${styles.supportRow}`}>
                Mức hỗ trợ cho năm {summary.supportYear || legalNoteYear || '2026'}:
              </td>
              <td className={`${styles.td} ${styles.tdAmount} ${styles.money} ${styles.red}`}>
                {summary.supportRate?.toFixed(1)}%
              </td>
            </tr>
          )}

          {/* Subtotal after support */}
          <tr>
            <td colSpan={2} className={`${styles.td} ${styles.subtotalRow}`}>
              Cộng
            </td>
            <td className={`${styles.td} ${styles.tdAmount} ${styles.money}`}>
              {formatVnd(summary.subtotalAfterSupport)}
            </td>
          </tr>

          {/* GTGT row */}
          <tr>
            <td colSpan={2} className={`${styles.td} ${styles.gtgtRow}`}>
              Tiền Thuế GTGT {summary.vatRate}%
            </td>
            <td className={`${styles.td} ${styles.tdAmount} ${styles.money}`}>
              {formatVnd(summary.vatAmount)}
            </td>
          </tr>

          {/* Grand total row - bold */}
          <tr>
            <td colSpan={2} className={`${styles.td} ${styles.totalRow}`}>
              Tổng giá trị hợp đồng cho 12 tháng sử dụng
            </td>
            <td className={`${styles.td} ${styles.tdAmount} ${styles.money} ${styles.grandTotal}`}>
              {formatVnd(summary.totalAmount)}
            </td>
          </tr>

          {/* Amount in words row */}
          {summary.totalAmountInWords && (
            <tr>
              <td colSpan={3} className={styles.wordsRow}>
                (Bằng chữ: {summary.totalAmountInWords}/.)
              </td>
            </tr>
          )}

          {/* Legal note row */}
          {generatedLegalNote && (
            <tr>
              <td colSpan={3} className={styles.legalNoteRow}>
                {generatedLegalNote}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default WordLikeRoyaltyTable;
