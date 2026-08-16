/**
 * Mô hình dữ liệu cho "Bảng tính tiền bản quyền" theo bố cục hợp đồng
 * (Phụ lục biểu mức — Nghị định 17/2023/NĐ-CP).
 *
 * Đây là lớp trung gian dùng chung cho:
 *   • bản xem trước trên web (ContractRoyaltyPreview)
 *   • bộ sinh file .xlsx (generateContractRoyaltyWorkbook)
 *
 * Toàn bộ số liệu lấy nguyên từ kết quả tính của `royaltyCalc`,
 * không tính lại — chỉ sắp xếp lại theo bố cục bảng 3 cột của hợp đồng.
 */

import type { FieldDef, FieldResult } from '../royaltyCalc';
import { numberToVietnameseWords } from '../numberToVietnameseWords';

export const DEFAULT_LEGAL_BASIS =
  'Căn cứ Phụ lục II ban hành kèm theo Nghị định 17/2023/NĐ-CP, được sửa đổi, bổ sung bởi Nghị định 134/2026/NĐ-CP';

export function defaultLegalNote(baseSalary: number): string {
  const s = new Intl.NumberFormat('vi-VN').format(Math.round(baseSalary || 0));
  return `Mức lương cơ sở ${s}đ có thời hạn bắt đầu từ ngày 01/7/2026 áp dụng khoản 2 Điều 3 Nghị định 161/2026/NĐ-CP ngày 15/5/2026`;
}

export type ContractTierLine = {
  /** Diễn giải bậc, vd "4 phòng đầu", "≤ 15 m²" */
  label: string;
  /** Hệ số điều chỉnh của bậc */
  coef: number;
  /** Chuỗi hệ số do biểu mức quy định, vd "0,85/box" */
  coefText: string;
  /** Số lượng áp dụng cho bậc */
  qty: number;
  /** Thành tiền của bậc (MLCS × hệ số × số lượng) */
  amount: number;
  /** Bậc trọn gói — không hiển thị công thức MLCS × hệ số */
  hideFormula?: boolean;
};

export type ContractBlock = {
  id: string;
  /** Tên lĩnh vực theo N� 17 */
  fieldName: string;
  /** Tên khu vực / địa điểm do người lập đặt */
  locationName: string;
  /** Đơn vị tính của lĩnh vực: "phòng", "m²", "box"… */
  unit: string;
  /** Tiêu đề cột 1, vd "Số lượng phòng Karaoke" */
  quantityHeader: string;
  /** Nội dung ô gộp cột 1, vd "15 phòng" */
  scaleText: string;
  tiers: ContractTierLine[];
  /** Ghi chú áp trần theo biểu mức (nếu có) */
  cappedNote?: string;
  urbanLabel: string;
  urbanFactor: number;
  /** Tỷ lệ đô thị hiển thị % cho khách — lấy từ urbanFactor. */
  urbanRatePercent?: number;
  urbanExempt: boolean;
  /** Tiền cộng theo định mức (chưa nhân tỷ lệ đô thị) */
  baseTierAmount: number;
  /** Tiền sau khi áp tỷ lệ đô thị */
  urbanAdjustedAmount: number;
  /** Alias cũ để tương thích — trùng baseTierAmount. */
  subTotalRaw: number;
  /** Alias cũ để tương thích — trùng urbanAdjustedAmount. */
  subTotalAfterUrban: number;
};

export type ContractCustomFee = { label: string; amount: number };

export type ContractRoyaltyModel = {
  documentTitle: string;
  legalBasis: string;
  legalNote: string;
  orgName: string;
  orgAddress: string;
  orgRepresentative: string;
  quoteDate: string;
  contractMonths: number;
  baseSalary: number;
  /** Tỉ lệ thuế GTGT dạng thập phân (0.08) */
  vatPct: number;
  /** Tỉ lệ hỗ trợ dạng thập phân (0.1) */
  supportPct: number;
  supportYear: number;
  blocks: ContractBlock[];
  customFees: ContractCustomFee[];
  /** Tổng tiền bản quyền sau hệ số đô thị */
  royaltyTotal: number;
  supportAmount: number;
  customFeeTotal: number;
  /** Cộng — căn cứ tính thuế GTGT */
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  amountInWords: string;
};

export type BuildContractModelInput = {
  instances: Array<{
    instanceId: string;
    field: FieldDef;
    result: FieldResult;
    vals: Record<string, number>;
    locationName?: string;
    displayName?: string;
    urbanLabel?: string;
    urbanFactor?: number;
  }>;
  customer?: { name?: string; address?: string; representative?: string };
  customFees?: ContractCustomFee[];
  baseSalary: number;
  vatPct: number;
  supportPct: number;
  contractMonths: number;
  supportYear?: number;
  documentTitle?: string;
  legalBasis?: string;
  legalNote?: string;
  quoteDate?: string;
};

const r0 = (n: number) => Math.round(n || 0);

/** Quy mô tổng của một lĩnh vực — lấy từ input chính, fallback về tổng số lượng các bậc. */
function resolveScaleText(field: FieldDef, vals: Record<string, number>, result: FieldResult): string {
  const primaryKey = field.inputs[0]?.key;
  const primary = primaryKey ? Number(vals[primaryKey]) : NaN;
  if (Number.isFinite(primary) && primary > 0) {
    return `${new Intl.NumberFormat('vi-VN').format(primary)} ${field.unit}`;
  }
  const sum = result.rows.reduce((s, row) => s + (row.qty || 0), 0);
  if (sum > 0) return `${new Intl.NumberFormat('vi-VN').format(sum)} ${field.unit}`;
  return '—';
}

export function buildContractRoyaltyModel(input: BuildContractModelInput): ContractRoyaltyModel {
  const {
    instances, baseSalary, vatPct, supportPct, contractMonths,
    customer, customFees = [],
  } = input;

  const blocks: ContractBlock[] = instances
    .filter((i) => i.result.hasInput && i.result.rows.length > 0)
    .map((i, idx) => {
      const urbanFactor = i.result.urbanExempt ? 1 : (i.urbanFactor ?? 1);
      const baseTierAmount = r0(i.result.subTotal);
      const urbanAdjustedAmount = r0(baseTierAmount * urbanFactor);
      return {
        id: i.instanceId,
        fieldName: i.field.name,
        locationName: (i.displayName || i.locationName || `Khu vực ${idx + 1}`).trim(),
        unit: i.field.unit,
        quantityHeader: `Số lượng ${i.field.unit}`,
        scaleText: resolveScaleText(i.field, i.vals, i.result),
        tiers: i.result.rows.map((row) => ({
          label: row.label,
          coef: row.coef,
          coefText: row.coefText,
          qty: row.qty || 1,
          amount: r0(row.amount),
          hideFormula: row.hideFormula,
        })),
        cappedNote: i.result.capped && i.result.capMultiplier !== undefined
          ? `Áp mức trần theo biểu mức: ${i.result.capMultiplier} × mức lương cơ sở`
          : undefined,
        urbanLabel: i.urbanLabel ?? '',
        urbanFactor,
        urbanRatePercent: Math.round(urbanFactor * 100),
        urbanExempt: Boolean(i.result.urbanExempt),
        baseTierAmount,
        urbanAdjustedAmount,
        subTotalRaw: baseTierAmount,
        subTotalAfterUrban: urbanAdjustedAmount,
      };
    });

  const fees = customFees.filter((f) => (f.amount || 0) > 0);
  const royaltyTotal = blocks.reduce((s, b) => s + b.subTotalAfterUrban, 0);
  const supportAmount = r0(royaltyTotal * supportPct);
  const customFeeTotal = fees.reduce((s, f) => s + r0(f.amount), 0);
  const subtotal = royaltyTotal - supportAmount + customFeeTotal;
  const vatAmount = r0(subtotal * vatPct);
  const grandTotal = subtotal + vatAmount;

  return {
    documentTitle: input.documentTitle?.trim() || 'BẢNG TÍNH TIỀN BẢN QUYỀN ÂM NHẠC',
    legalBasis: input.legalBasis?.trim() || DEFAULT_LEGAL_BASIS,
    legalNote: input.legalNote?.trim() || defaultLegalNote(baseSalary),
    orgName: customer?.name?.trim() || '',
    orgAddress: customer?.address?.trim() || '',
    orgRepresentative: customer?.representative?.trim() || '',
    quoteDate: input.quoteDate || new Date().toLocaleDateString('vi-VN'),
    contractMonths,
    baseSalary,
    vatPct,
    supportPct,
    supportYear: input.supportYear ?? new Date().getFullYear(),
    blocks,
    customFees: fees,
    royaltyTotal,
    supportAmount,
    customFeeTotal,
    subtotal,
    vatAmount,
    grandTotal,
    amountInWords: numberToVietnameseWords(grandTotal),
  };
}