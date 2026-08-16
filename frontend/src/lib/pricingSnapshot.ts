/**
 * PricingSnapshot — frontend model shared between the Royalty Calculator
 * workspace and the Create Contract preview card.
 *
 * Base salary defaults follow Nghị định 161/2026/NĐ-CP, Điều 3 khoản 2
 * (2.530.000 đồng/tháng, hiệu lực 01/07/2026). The royalty formula/coefficient
 * still comes from Nghị định 17/2023/NĐ-CP.
 */

import { numberToVietnameseWords } from './numberToVietnameseWords';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_BASE_SALARY = 2_530_000;
export const DEFAULT_LEGAL_BASIS = 'Nghị định 161/2026/NĐ-CP';
export const DEFAULT_LEGAL_ARTICLE = 'Điều 3 khoản 2';
export const DEFAULT_EFFECTIVE_FROM = '2026-07-01';
export const DEFAULT_VAT_RATE = 0.08;

export const BASE_SALARY_DISPLAY = '2.530.000 đồng/tháng';

export const BASE_SALARY_LEGAL_NOTE =
  'Mức lương cơ sở 2.530.000 đồng/tháng theo Nghị định 161/2026/NĐ-CP, Điều 3 khoản 2, có hiệu lực từ ngày 01/7/2026.';

// ─────────────────────────────────────────────────────────────────────────────
// FAB Area-based Pricing Constants (multi-location FAB contracts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FAB Area Tier Coefficients — used in the 3-tier FAB formula.
 * NHÓM A: AREA TIER COEFFICIENT
 * These are NOT urban coefficients — they are area-based FAB formula coefficients.
 */
export const FAB_AREA_TIER = {
  TIER1_COEFFICIENT: 0.7,    // Bậc ≤200m²: MLCS × 0.7 × areaM2 / 200
  TIER2_COEFFICIENT: 0.003,  // Bậc 200–500m²: MLCS × 0.003 × m²
  TIER3_COEFFICIENT: 0.001,  // Bậc >500m²: MLCS × 0.001 × m²
  TIER1_THRESHOLD: 200,        // m²
  TIER2_THRESHOLD: 500,       // m²
} as const;

/**
 * FAB Urban Coefficients — per-location urban adjustment factors.
 * NHÓM B: URBAN COEFFICIENT
 */
export const FAB_URBAN_OPTIONS = [
  { id: 'special', label: 'Hà Nội / TP. HCM', coefficient: 1.0 },
  { id: 'I', label: 'Đô thị loại I', coefficient: 0.8 },
  { id: 'II', label: 'Đô thị loại II', coefficient: 0.5 },
] as const;
export type FabUrbanOptionId = (typeof FAB_URBAN_OPTIONS)[number]['id'];

export const FAB_URBAN_MAP: Record<FabUrbanOptionId, number> = {
  special: 1.0,
  I: 0.8,
  II: 0.5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Support rate / mức hỗ trợ thu (Nghị định 134/2026/NĐ-CP)
// ─────────────────────────────────────────────────────────────────────────────
export const SUPPORT_LEGAL_BASIS = 'Nghị định 134/2026/NĐ-CP';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type PricingSnapshotRow = {
  label: string;
  quantity?: number;
  base_salary?: number;
  coefficient?: number;
  unit?: string;
  amount: number;
  note?: string;
};

export type PricingSnapshot = {
  domain: 'karaoke' | 'kvc' | 'background' | string;
  source: 'calculator' | 'backend' | 'manual';
  base_salary: number;
  base_salary_display: string;
  legal_basis: string;
  legal_article: string;
  effective_from: string;
  duration_months: number;
  vat_rate: number;
  rows: PricingSnapshotRow[];
  subtotal: number;
  vat_amount: number;
  total: number;
  /** Số tiền trước khi áp dụng hỗ trợ thu (raw total of tier rows) */
  raw_subtotal?: number;
  amount_in_words?: string;
  note?: string;
  /** Human context (optional): field label, room count summary, etc. */
  context_label?: string;
  /** Generated ISO timestamp for audit/preview only. */
  generated_at?: string;
  /** Mức hỗ trợ thu (%) theo Nghị định 134/2026/NĐ-CP — applied to subtotal before VAT. */
  support_rate_percent?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Karaoke area group coefficients (Nghị định 17/2023, Phụ lục)
// ─────────────────────────────────────────────────────────────────────────────
export type KaraokeAreaGroup = 'DEN_20' | 'FROM_20_TO_30' | 'GT_30';

export const KARAOKE_COEF: Record<KaraokeAreaGroup, [number, number, number]> = {
  DEN_20: [1.5, 1.2, 1.05],
  FROM_20_TO_30: [1.6, 1.28, 1.12],
  GT_30: [1.7, 1.36, 1.19],
};

export const KARAOKE_AREA_LABEL: Record<KaraokeAreaGroup, string> = {
  DEN_20: 'Phòng ≤ 20 m²',
  FROM_20_TO_30: 'Phòng 20 – 30 m²',
  GT_30: 'Phòng > 30 m²',
};

// ─────────────────────────────────────────────────────────────────────────────
// Cách áp dụng hệ số đô thị (urban application mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cách 1 — áp dụng tỷ lệ đô thị sau khi cộng tiền các bậc (mặc định):
 *   input gốc → phân bổ số lượng vào từng bậc → tính tiền từng bậc
 *   → cộng → × tỷ lệ đô thị → VAT
 *
 * Cách 2 — áp dụng tỷ lệ đô thị trên từng dòng bậc:
 *   input gốc → phân bổ số lượng vào từng bậc → tính tiền từng bậc
 *   → × tỷ lệ đô thị từng dòng → cộng → VAT
 *
 * Cả hai cách dùng input gốc để chia bậc và cho cùng tổng tiền vì phép nhân
 * tuyến tính. Tỷ lệ đô thị KHÔNG được nhân vào input gốc.
 */
export type UrbanApplicationMode = 'AFTER_SUBTOTAL' | 'BEFORE_TIERING';

export const DEFAULT_URBAN_APPLICATION_MODE: UrbanApplicationMode = 'AFTER_SUBTOTAL';

export const URBAN_MODE_OPTIONS: ReadonlyArray<{
  id: UrbanApplicationMode;
  short: string;
  label: string;
  hint: string;
}> = [
  {
    id: 'AFTER_SUBTOTAL',
    short: 'Cách 1',
    label: 'Áp dụng tỷ lệ đô thị sau khi cộng tiền bậc',
    hint: 'Chia bậc theo input gốc, cộng tiền các bậc, nhân tỷ lệ đô thị ở cuối.',
  },
  {
    id: 'BEFORE_TIERING',
    short: 'Cách 2',
    label: 'Áp dụng tỷ lệ đô thị trên từng dòng bậc',
    hint: 'Chia bậc theo input gốc, nhân tỷ lệ đô thị trên tiền từng dòng, rồi cộng.',
  },
];

export function urbanModeLabel(mode: UrbanApplicationMode): string {
  const o = URBAN_MODE_OPTIONS.find((x) => x.id === mode);
  return o ? `${o.short} — ${o.label}` : mode;
}

// ─────────────────────────────────────────────────────────────────────────────
// FAB Area Tier Row (for breakdown display)
// ─────────────────────────────────────────────────────────────────────────────

export type FabAreaTierRow = {
  tierName: string;
  tierAreaM2: number;
  areaCoefficient: number;
  formula: string;
  amount: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// FAB Pricing Snapshot Builder
// ─────────────────────────────────────────────────────────────────────────────

export type FabLocationSnapshot = {
  id: string;
  name: string;
  areaM2: number;
  /** Diện tích dùng để chia bậc (= areaM2; giữ để tương thích cũ). */
  effectiveAreaM2: number;
  durationMonths: number;
  urbanClass: FabUrbanOptionId;
  urbanCoefficient: number;
  /** Legacy field — mode nội bộ; export/file khách không nhận. */
  urbanMode: UrbanApplicationMode;
  areaPricingBreakdown: FabAreaTierRow[];
  baseAnnualRoyaltyByArea: number;
  annualRoyaltyAfterUrban: number;
  royaltyBeforeVat: number;
  vatAmount: number;
  totalAfterVat: number;
  /** Tỷ lệ đô thị áp dụng (%) vd 80 cho "Đô thị loại I". */
  urbanRatePercent?: number;
};

export type FabPricingSnapshot = {
  locations: FabLocationSnapshot[];
  totalAreaM2: number;
  totalRoyaltyBeforeVat: number;
  vatRate: number;
  urbanMode: UrbanApplicationMode;
  totalVatAmount: number;
  totalAfterVat: number;
  amountInWords?: string;
};

export type BuildFabAreaPricingOpts = {
  locations: Array<{
    id: string;
    name: string;
    areaM2: number;
    durationMonths: number;
    urbanClass: FabUrbanOptionId;
    vatRate?: number;
  }>;
  vatRate?: number;
  /** Cách áp dụng hệ số đô thị — mặc định Cách 1 (giữ nguyên hành vi cũ). */
  urbanMode?: UrbanApplicationMode;
};


function buildLocationTierBreakdown(areaM2: number): FabAreaTierRow[] {
  const rows: FabAreaTierRow[] = [];
  const mlcs = DEFAULT_BASE_SALARY;
  const a = Math.max(0, areaM2);

  if (a <= 0) return rows;

  const t1M2 = Math.min(a, FAB_AREA_TIER.TIER1_THRESHOLD);
  const t1Amount = Math.round(mlcs * FAB_AREA_TIER.TIER1_COEFFICIENT * t1M2 / FAB_AREA_TIER.TIER1_THRESHOLD);
  rows.push({
    tierName: `Đến ${FAB_AREA_TIER.TIER1_THRESHOLD} m²`,
    tierAreaM2: t1M2,
    areaCoefficient: FAB_AREA_TIER.TIER1_COEFFICIENT,
    formula: 'MLCS×0,7',
    amount: t1Amount,
  });

  if (a > FAB_AREA_TIER.TIER1_THRESHOLD) {
    const t2M2 = Math.min(a - FAB_AREA_TIER.TIER1_THRESHOLD, FAB_AREA_TIER.TIER2_THRESHOLD - FAB_AREA_TIER.TIER1_THRESHOLD);
    const t2Amount = Math.round(mlcs * FAB_AREA_TIER.TIER2_COEFFICIENT * t2M2);
    rows.push({
      tierName: `${FAB_AREA_TIER.TIER1_THRESHOLD}–${FAB_AREA_TIER.TIER2_THRESHOLD} m²`,
      tierAreaM2: t2M2,
      areaCoefficient: FAB_AREA_TIER.TIER2_COEFFICIENT,
      formula: 'MLCS×0,003×m²',
      amount: t2Amount,
    });
  }

  if (a > FAB_AREA_TIER.TIER2_THRESHOLD) {
    const t3M2 = a - FAB_AREA_TIER.TIER2_THRESHOLD;
    const t3Amount = Math.round(mlcs * FAB_AREA_TIER.TIER3_COEFFICIENT * t3M2);
    rows.push({
      tierName: `Trên ${FAB_AREA_TIER.TIER2_THRESHOLD} m²`,
      tierAreaM2: t3M2,
      areaCoefficient: FAB_AREA_TIER.TIER3_COEFFICIENT,
      formula: 'MLCS×0,001×m²',
      amount: t3Amount,
    });
  }

  return rows;
}

export function buildFabAreaPricing(opts: BuildFabAreaPricingOpts): FabPricingSnapshot {
  const vatRate = Number.isFinite(opts.vatRate) ? Number(opts.vatRate) : DEFAULT_VAT_RATE;
  const vatMultiplier = vatRate; // 0.08
  const urbanMode: UrbanApplicationMode = opts.urbanMode ?? DEFAULT_URBAN_APPLICATION_MODE;

  const locationSnapshots: FabLocationSnapshot[] = opts.locations.map((loc) => {
    const urbanCoeff = FAB_URBAN_MAP[loc.urbanClass] ?? 1.0;
    const durationMonths = Math.max(1, Math.floor(loc.durationMonths ?? 12));
    // Chia bậc bằng input gốc (loc.areaM2). Tỷ lệ đô thị áp lên tiền, không áp lên diện tích.
    const breakdown = buildLocationTierBreakdown(loc.areaM2);
    const baseAnnualRoyaltyByArea = breakdown.reduce((s, r) => s + r.amount, 0);
    const annualRoyaltyAfterUrban = Math.round(baseAnnualRoyaltyByArea * urbanCoeff);
    const royaltyBeforeVat = Math.round(annualRoyaltyAfterUrban * durationMonths / 12);
    const vatAmount = Math.round(royaltyBeforeVat * vatMultiplier);
    const totalAfterVat = royaltyBeforeVat + vatAmount;

    return {
      id: loc.id,
      name: loc.name,
      areaM2: loc.areaM2,
      // effectiveAreaM2 hiện bằng areaM2 (chia bậc bằng input gốc).
      effectiveAreaM2: loc.areaM2,
      urbanRatePercent: Math.round(urbanCoeff * 100),
      durationMonths,
      urbanClass: loc.urbanClass,
      urbanCoefficient: urbanCoeff,
      urbanMode,
      areaPricingBreakdown: breakdown,
      baseAnnualRoyaltyByArea,
      annualRoyaltyAfterUrban,
      royaltyBeforeVat,
      vatAmount,
      totalAfterVat,
    };
  });

  const totalRoyaltyBeforeVat = locationSnapshots.reduce((s, l) => s + l.royaltyBeforeVat, 0);
  const totalVatAmount = Math.round(totalRoyaltyBeforeVat * vatMultiplier);
  const totalAfterVat = totalRoyaltyBeforeVat + totalVatAmount;

  return {
    locations: locationSnapshots,
    totalAreaM2: opts.locations.reduce((s, l) => s + l.areaM2, 0),
    totalRoyaltyBeforeVat,
    vatRate,
    urbanMode,
    totalVatAmount,
    totalAfterVat,
    amountInWords: totalAfterVat > 0 ? numberToVietnameseWords(totalAfterVat) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Karaoke pricing snapshot builder
// ─────────────────────────────────────────────────────────────────────────────
export type BuildKaraokeSnapshotOpts = {
  totalRooms: number;
  areaGroup?: KaraokeAreaGroup;
  months?: number;
  vatRate?: number;
  baseSalary?: number;
  contextLabel?: string;
  /** Mức hỗ trợ thu (%) theo Nghị định 134/2026/NĐ-CP — display only, no effect on total. */
  supportRatePercent?: number;
};

export function buildKaraokePricingSnapshot(opts: BuildKaraokeSnapshotOpts): PricingSnapshot {
  const totalRooms = Math.max(0, Math.floor(opts.totalRooms || 0));
  const areaGroup: KaraokeAreaGroup = opts.areaGroup ?? 'FROM_20_TO_30';
  const months = Math.max(1, Math.floor(opts.months ?? 12));
  const vatRate = Number.isFinite(opts.vatRate) ? Number(opts.vatRate) : DEFAULT_VAT_RATE;
  const baseSalary = opts.baseSalary && opts.baseSalary > 0 ? opts.baseSalary : DEFAULT_BASE_SALARY;

  const coefs = KARAOKE_COEF[areaGroup];
  const tiers = [
    { size: Math.min(4, totalRooms), coef: coefs[0], label: '4 phòng đầu' },
    { size: Math.min(Math.max(0, totalRooms - 4), 6), coef: coefs[1], label: '6 phòng tiếp theo' },
    { size: Math.max(0, totalRooms - 10), coef: coefs[2], label: 'Các phòng còn lại' },
  ];

  const durationFactor = months / 12; // per-year → contract term

  const rows: PricingSnapshotRow[] = tiers
    .filter((t) => t.size > 0)
    .map((t) => {
      const amountYear = t.size * baseSalary * t.coef;
      const amount = Math.round(amountYear * durationFactor);
      return {
        label: `${t.label} · ${KARAOKE_AREA_LABEL[areaGroup]}`,
        quantity: t.size,
        base_salary: baseSalary,
        coefficient: t.coef,
        unit: 'phòng/năm',
        amount,
        note:
          months === 12
            ? undefined
            : `Quy đổi cho ${months} tháng (× ${durationFactor.toFixed(2)}).`,
      };
    });

  const rawSubtotal = rows.reduce((s, r) => s + r.amount, 0);

  // Support rate: 100% = thu đủ, 50% = thu 50%, 0% = thu 0.
  // VAT is computed on the post-support subtotal.
  const supportRatePercent = Number.isFinite(opts.supportRatePercent)
    ? Math.max(0, Math.min(100, Number(opts.supportRatePercent)))
    : 100;

  const subtotal = Math.round((rawSubtotal * supportRatePercent) / 100);
  const vat_amount = Math.round(subtotal * vatRate);
  const total = subtotal + vat_amount;

  return {
    domain: 'karaoke',
    source: 'calculator',
    base_salary: baseSalary,
    base_salary_display: BASE_SALARY_DISPLAY,
    legal_basis: DEFAULT_LEGAL_BASIS,
    legal_article: DEFAULT_LEGAL_ARTICLE,
    effective_from: DEFAULT_EFFECTIVE_FROM,
    duration_months: months,
    vat_rate: vatRate,
    rows,
    subtotal,
    vat_amount,
    total,
    raw_subtotal: rawSubtotal,
    amount_in_words: total > 0 ? numberToVietnameseWords(total) : undefined,
    note: BASE_SALARY_LEGAL_NOTE,
    context_label:
      opts.contextLabel ??
      `Karaoke · ${totalRooms} phòng · ${KARAOKE_AREA_LABEL[areaGroup]} · ${months} tháng`,
    generated_at: new Date().toISOString(),
    support_rate_percent: supportRatePercent,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Word-like table styles (Times New Roman 11pt, Word-compatible)
// ─────────────────────────────────────────────────────────────────────────────
const WL = {
  border: '1px solid #000',
  borderCollapse: 'collapse',
  fontFamily: '"Times New Roman", Times, serif',
  fontSize: '11pt',
  lineHeight: '1.25',
  cellPad: '4px 6px',
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
export const formatVND = (n: number) =>
  (Math.round(n) || 0).toLocaleString('vi-VN') + ' đ';

export const formatCoef = (n?: number) =>
  n === undefined ? '' : n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * Map karaoke urban-support / tax-collection percentage to a label that
 * follows Nghị định 134/2026/NĐ-CP wording. At 100% the rate is the full
 * collected tax, not a "support" — so we MUST NOT use "hỗ trợ thu" wording
 * at or above 100%.
 */
export function getSupportRateLabel(percent: number): string {
  const p = Number(percent);
  if (!Number.isFinite(p)) {
    return 'Mức hỗ trợ thu theo Nghị định 134/2026/NĐ-CP';
  }
  if (p >= 100) {
    return 'Mức thu theo Nghị định 134/2026/NĐ-CP';
  }
  if (p >= 80) {
    return 'Mức hỗ trợ thu đô thị loại I theo Nghị định 134/2026/NĐ-CP';
  }
  if (p >= 50) {
    return 'Mức hỗ trợ thu đô thị loại II theo Nghị định 134/2026/NĐ-CP';
  }
  if (p >= 20) {
    return 'Mức hỗ trợ thu đô thị loại III theo Nghị định 134/2026/NĐ-CP';
  }
  if (p >= 10) {
    return 'Mức hỗ trợ thu vùng sâu, vùng xa, vùng đặc biệt khó khăn theo Nghị định 134/2026/NĐ-CP';
  }
  if (p > 0) {
    return 'Mức hỗ trợ thu theo Nghị định 134/2026/NĐ-CP';
  }
  return 'Mức hỗ trợ thu theo Nghị định 134/2026/NĐ-CP';
}

// ─────────────────────────────────────────────────────────────────────────────
// Word-like HTML table (Times New Roman 11pt, Word-compatible)
// ─────────────────────────────────────────────────────────────────────────────
function tierSuffix(i: number): string {
  return i === 0 ? 'đầu' : i === 1 ? 'tiếp theo' : 'còn lại';
}

export function snapshotToWordLikeHTMLTable(s: PricingSnapshot): string {
  const totalRooms = s.rows.reduce((n, r) => n + (r.quantity ?? 0), 0);
  const navy = '#00384D';
  const white = '#ffffff';
  const pale = '#f5f5f5';
  const border = '1px solid #D9D3C7';
  const navyBorder = '1px solid #00384D';
  const cellBase = `border:${border};padding:8px 10px;`;
  const navyCell = `border:${navyBorder};padding:8px 10px;`;

  // Build tier rows — each tier gets 5 columns inside the "Mức tiền bản quyền" section
  const tierRows = s.rows
    .map(
      (r, i) => `
      <tr>
        ${i === 0 ? `<td rowspan="${s.rows.length}" style="${cellBase}text-align:center;vertical-align:middle;background:${pale};font-weight:700;color:${navy};font-size:15px;" bgcolor="${pale}">${totalRooms} phòng</td>` : ''}
        <td style="${cellBase}color:${navy};font-weight:600;">${r.quantity} phòng ${tierSuffix(i)}</td>
        <td style="${cellBase}text-align:right;">${r.base_salary ? formatVND(r.base_salary) : ''}</td>
        <td style="${cellBase}text-align:center;color:#8C877E;">×</td>
        <td style="${cellBase}text-align:right;">${r.coefficient !== undefined ? formatCoef(r.coefficient) : ''}</td>
        <td style="${cellBase}color:#6B665F;">phòng/năm</td>
        <td style="${cellBase}text-align:right;"><strong>${formatVND(r.amount)}</strong></td>
      </tr>`,
    )
    .join('');

  return `
  <table style="border-collapse:collapse;mso-table-layout-alt:fixed;mso-yfti-tbllook:1184;" cellspacing="0" cellpadding="0" width="100%">
    <thead>
      <tr>
        <th style="${navyCell}width:110px;background:${navy};color:${white};padding:8px 10px;font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:700;text-align:center;vertical-align:middle;" bgcolor="${navy}">Số lượng<br/>phòng</th>
        <th colspan="5" style="${navyCell}background:${navy};color:${white};padding:8px 10px;font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:700;text-align:center;vertical-align:middle;" bgcolor="${navy}">Mức tiền bản quyền (chưa gồm thuế GTGT)</th>
        <th style="${navyCell}width:150px;background:${navy};color:${white};padding:8px 10px;font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:700;text-align:right;vertical-align:middle;" bgcolor="${navy}">Thành tiền (đồng)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td colspan="7" style="${cellBase}text-align:center;background:${pale};font-style:italic;color:${navy};font-family:'Times New Roman',Times,serif;font-size:10.5pt;" bgcolor="${pale}">
          Tiền bản quyền (theo năm) = Mức lương cơ sở × Hệ số điều chỉnh
        </td>
      </tr>
      ${tierRows}
      <tr>
        <td colspan="6" style="${cellBase}text-align:right;font-weight:700;">${getSupportRateLabel(s.support_rate_percent ?? 0)}</td>
        <td style="${cellBase}text-align:right;font-weight:700;">${(s.support_rate_percent ?? 0)}%</td>
      </tr>
      <tr>
        <td colspan="6" style="${cellBase}text-align:right;background:${pale};" bgcolor="${pale}"><strong>Cộng</strong></td>
        <td style="${cellBase}text-align:right;background:${pale};" bgcolor="${pale}"><strong>${formatVND(s.subtotal)}</strong></td>
      </tr>
      <tr>
        <td colspan="6" style="${cellBase}text-align:right;">Thuế GTGT ${(s.vat_rate * 100).toFixed(0)}%</td>
        <td style="${cellBase}text-align:right;">${formatVND(s.vat_amount)}</td>
      </tr>
      <tr>
        <td colspan="6" style="${navyCell}text-align:right;background:${navy};color:${white};padding:10px;" bgcolor="${navy}"><strong>TỔNG GIÁ TRỊ HỢP ĐỒNG (${s.duration_months} tháng)</strong></td>
        <td style="${navyCell}text-align:right;background:${navy};color:${white};padding:10px;" bgcolor="${navy}"><strong>${formatVND(s.total)}</strong></td>
      </tr>
      ${s.amount_in_words ? `<tr><td colspan="7" style="${cellBase}font-style:italic;"><strong>Bằng chữ:</strong> ${escapeHtml(s.amount_in_words)}./.</td></tr>` : ''}
      <tr><td colspan="7" style="${cellBase}font-size:11pt;color:#444444;">${escapeHtml(s.note ?? BASE_SALARY_LEGAL_NOTE)}</td></tr>
    </tbody>
  </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy HTML table (kept for backward compat — maps to Word-like now)
// ─────────────────────────────────────────────────────────────────────────────
export function snapshotToHTMLTable(s: PricingSnapshot): string {
  return snapshotToWordLikeHTMLTable(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain text (for fallback copy)
// ─────────────────────────────────────────────────────────────────────────────
export function snapshotToPlainText(s: PricingSnapshot): string {
  const lines: string[] = [];
  lines.push(`BẢNG TIỀN BẢN QUYỀN (${(s.domain || '').toUpperCase()})`);
  if (s.context_label) lines.push(s.context_label);
  lines.push('');
  s.rows.forEach((r, i) => {
    const parts: string[] = [`${i + 1}. ${r.label}`];
    if (r.quantity !== undefined) parts.push(`SL: ${r.quantity}`);
    if (r.base_salary) parts.push(`MLCS: ${formatVND(r.base_salary)}`);
    if (r.coefficient !== undefined) parts.push(`Hệ số: ${formatCoef(r.coefficient)}`);
    parts.push(`Thành tiền: ${formatVND(r.amount)}`);
    lines.push(parts.join(' | '));
    if (r.note) lines.push(`   (${r.note})`);
  });
  lines.push('');
  lines.push(`Cộng: ${formatVND(s.subtotal)}`);
  if ((s.support_rate_percent ?? 0) > 0) {
    lines.push(`${getSupportRateLabel(s.support_rate_percent ?? 0)}: ${s.support_rate_percent}%`);
  }
  lines.push(`Thuế GTGT (${(s.vat_rate * 100).toFixed(0)}%): ${formatVND(s.vat_amount)}`);
  lines.push(`Tổng giá trị hợp đồng ${s.duration_months} tháng: ${formatVND(s.total)}`);
  if (s.amount_in_words) lines.push(`Bằng chữ: ${s.amount_in_words}.`);
  if (s.note) {
    lines.push('');
    lines.push(s.note);
  }
  return lines.join('\n');
}

export function snapshotSummaryText(s: PricingSnapshot): string {
  return [
    `Bảng tiền bản quyền${s.context_label ? ` — ${s.context_label}` : ''}`,
    `Cộng: ${formatVND(s.subtotal)}`,
    (s.support_rate_percent ?? 0) > 0
      ? `${getSupportRateLabel(s.support_rate_percent ?? 0)}: ${s.support_rate_percent}%`
      : '',
    `Thuế GTGT ${(s.vat_rate * 100).toFixed(0)}%: ${formatVND(s.vat_amount)}`,
    `Tổng ${s.duration_months} tháng: ${formatVND(s.total)}`,
    s.amount_in_words ? `Bằng chữ: ${s.amount_in_words}.` : '',
    s.note ? `\n${s.note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Copy both rich HTML table + plain text fallback to the clipboard. */
export async function copyRichAndPlain(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {
    /* fall through to plain-text */
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
