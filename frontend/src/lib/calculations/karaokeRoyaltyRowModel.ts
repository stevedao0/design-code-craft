/**
 * Karaoke royalty ROW MODEL — single source of truth for:
 *  - UI preview table (CreateContractPage / WordLikeRoyaltyTable)
 *  - Contract table exported to DOCX (backend uses the exact same rule:
 *    only tiers with room_count > 0 are emitted — see
 *    backend/app/calculations/karaoke/docx_context.py::_build_tier_table_rows)
 *
 * IMPORTANT: this module NEVER computes money. Every amount comes from the
 * backend calculation result (dry-run / snapshot). It only selects, labels
 * and formats rows.
 */
import type { KaraokeCalculationResult } from '../contractCreateTypes';
import type { RoyaltyFeeLine, RoyaltyTableData } from '../../components/contract/WordLikeRoyaltyTable';
import { numberToVietnameseWords } from '../numberToVietnameseWords';

export type KaraokeRoyaltyRow = RoyaltyFeeLine & {
  key: string;
  roomCount: number;
};

/**
 * Build the visible tier rows. A tier is rendered ONLY when it actually
 * produces rooms AND money — no empty / zero rows, ever.
 */
export function buildKaraokeRoyaltyRows(result: KaraokeCalculationResult): KaraokeRoyaltyRow[] {
  const calc = result.calculation;
  const baseSalary = result.input_echo?.muc_luong_co_so ?? 0;
  const detailRows = calc.detail_rows ?? [];
  const tiers = calc.tiers ?? [];

  return tiers
    .map((tier, index) => {
      const detail = detailRows[index];
      const roomCount = Number(tier.rooms || 0);
      const amount = Number(tier.net_amount || tier.amount || 0);
      return {
        key: `tier-${index}`,
        roomCount,
        label: detail?.label || tier.name || '',
        baseAmount: baseSalary,
        coefficient: tier.coefficient,
        unitLabel: result.input_echo?.karaoke_type === 'BOX' ? 'box/năm' : 'phòng/năm',
        quantity: roomCount,
        amount,
      };
    })
    .filter((row) => row.roomCount > 0 && row.amount > 0);
}

/**
 * Build the full contract-layout table data (rows + summary) from a backend
 * calculation result. Structure mirrors the DOCX contract table.
 */
export function buildKaraokeRoyaltyTableData(
  result: KaraokeCalculationResult,
  options?: { supportYear?: string }
): RoyaltyTableData | null {
  const rows = buildKaraokeRoyaltyRows(result);
  if (rows.length === 0) return null;

  const calc = result.calculation;
  const isBox = result.input_echo?.karaoke_type === 'BOX';
  const totalUnits = rows.reduce((sum, row) => sum + row.roomCount, 0);
  const supportRate = Number(result.input_echo?.ty_le_ho_tro ?? 0);
  const totalAmount = Number(calc.effective_total_amount || calc.total_amount || 0);

  return {
    subjectLabel: isBox ? 'box Karaoke' : 'phòng Karaoke',
    subjectQuantityText: `${totalUnits} ${isBox ? 'box' : 'phòng'}`,
    formulaText:
      '(Số tiền bản quyền chi trả (tính theo năm) = Mức lương cơ sở x Hệ số điều chỉnh)',
    lines: rows,
    summary: {
      subtotalBeforeSupport: Number(calc.subtotal_before_support || 0),
      supportRate: supportRate > 0 && supportRate < 100 ? supportRate : undefined,
      subtotalAfterSupport: Number(
        calc.effective_amount_before_gtgt || calc.amount_before_gtgt || 0
      ),
      vatRate: Number(calc.gtgt_percent ?? result.input_echo?.gtgt_percent ?? 0),
      vatAmount: Math.max(
        0,
        totalAmount - Number(calc.effective_amount_before_gtgt || calc.amount_before_gtgt || 0)
      ),
      totalAmount,
      totalAmountInWords: numberToVietnameseWords(totalAmount),
      supportYear: options?.supportYear,
    },
    baseSalary: result.input_echo?.muc_luong_co_so ?? undefined,
    legalNoteYear: options?.supportYear,
  };
}
