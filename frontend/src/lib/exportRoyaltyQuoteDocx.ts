/**
 * Xuất báo giá tiền bản quyền âm nhạc (NĐ 17/2023) ra file .docx.
 * Dùng thư viện `docx` chạy trực tiếp trong trình duyệt.
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, ShadingType, BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';
import { FieldResult, FIELDS, QuoteTotals, BreakdownRow, formatVND } from './royaltyCalc';
import { numberToVietnameseWords } from './numberToVietnameseWords';

const VCPMC = {
  fullName: 'TRUNG TÂM BẢO VỆ QUYỀN TÁC GIẢ ÂM NHẠC VIỆT NAM',
  shortName: 'VCPMC',
  hq: 'Số nhà 23, ngách 2/5, ngõ 397 đường Phạm Văn Đồng, phường Xuân Đỉnh, TP. Hà Nội',
  hqPhone: '(+84 24) 3762 4718 | (+84 24) 3762 4719',
  south: 'Số 91-93 đường số 5, KP 4, phường Bình Trưng, TP. Hồ Chí Minh (Tòa nhà VCPMC Crescendo)',
  southPhone: '(+84 28) 3829 9225 | (+84 28) 3910 2385',
  daNang: '168 Lý Tự Trọng, phường Hải Châu, Đà Nẵng',
  daNangPhone: '(+84 23) 6389 8458',
  email: 'info@vcpmc.org',
  website: 'vcpmc.org',
};

const COLOR = {
  black: '0A0A0F',
  ink: '111827',
  mute: '64748B',
  divider: 'E2E8F0',
  accent: '4F46E5',
  ok: '047857',
  warn: 'B45309',
  rowAlt: 'F8FAFC',
  rowTotal: 'EEF2FF',
  rowGrand: '0F172A',
};

const FONT = 'Inter';
const MONO = 'Consolas';

const b = (color: string, size = 4) => ({
  top: { style: BorderStyle.SINGLE, size, color },
  bottom: { style: BorderStyle.SINGLE, size, color },
  left: { style: BorderStyle.SINGLE, size, color },
  right: { style: BorderStyle.SINGLE, size, color },
}) as const;

function txt(text: string, opts: Partial<{ bold: boolean; size: number; color: string; italic: boolean; font: string; mono: boolean }> = {}) {
  return new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italic,
    size: opts.size ?? 22,
    color: opts.color ?? COLOR.ink,
    font: opts.mono ? MONO : (opts.font ?? FONT),
  });
}

function p(children: TextRun[] | string, opts: Partial<{ align: typeof AlignmentType[keyof typeof AlignmentType]; spacing: number }> = {}) {
  const runs = typeof children === 'string' ? [txt(children)] : children;
  return new Paragraph({
    children: runs,
    alignment: opts.align,
    spacing: { after: opts.spacing ?? 80 },
  });
}

function cell(content: Paragraph[] | string, opts: Partial<{
  shading: string; width: number; bold: boolean;
  align: typeof AlignmentType[keyof typeof AlignmentType];
  mono: boolean; color: string; italic: boolean;
}> = {}) {
  const paras = typeof content === 'string'
    ? [p([txt(content, { bold: opts.bold, font: opts.mono ? MONO : FONT, color: opts.color })], { align: opts.align })]
    : content;
  return new TableCell({
    children: paras,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    borders: b(COLOR.divider, 4),
  });
}

export type ExportData = {
  customer: { name: string; address: string; representative?: string; location?: string; };
  contractMonths: number;
  baseSalary: number;
  urbanLabel: string;
  urbanFactor: number;
  supportPct: number;
  vatPct: number;
  /** Cách áp dụng hệ số đô thị (áp dụng cho toàn bảng tính; chỉ tham khảo khi perField có urbanMode riêng). */
  urbanMode?: string;
  urbanModeLabel?: string;
  perField: {
    instanceId: string;
    fieldId: string;
    vals: Record<string, number>;
    result: FieldResult;
    /** Custom display name for export — if empty falls back to locationName or field name. */
    displayName: string;
    /** Area label — e.g. "Khu vực 1", "Tầng trệt", etc. */
    locationName: string;
    /** Trade name / signboard of this location. */
    tradeName: string;
    /** Business address of this specific location. */
    businessAddress: string;
    /** Free-text note about this location. */
    locationNote: string;
    /** Urban classification — per-instance. */
    urbanId: string;
    urbanLabel: string;
    urbanFactor: number;
    /** Cách áp dụng đô thị cho instance này (AFTER_SUBTOTAL hoặc BEFORE_TIERING). */
    urbanMode?: string;
    urbanModeLabel?: string;
    /** True khi đô thị đã được áp vào diện tích trước khi chia bậc (Option 2 + lĩnh vực m²). */
    applyUrbanBefore?: boolean;
    /** Diện tích gốc (m²) khi lĩnh vực dùng diện tích bậc thang. */
    rawArea?: number;
    /** Diện tích tính phí (m²). Với Option 2 = rawArea × hệ số đô thị; Option 1 = rawArea. */
    effectiveArea?: number;
  }[];
  totals: QuoteTotals;
  quoteNo?: string;
  quoteDate?: string;
  /** Multi-location FAB snapshot — if provided, renders per-location sections instead of perField */
  fabLocations?: FabLocationExportData[];
};

export type FabLocationExportData = {
  name: string;
  tradeName: string;
  addressLine: string;
  ward: string;
  province: string;
  areaM2: number;
  durationMonths: number;
  urbanClass: string;
  urbanCoefficient: number;
  urbanLabel: string;
  baseAnnualRoyaltyByArea: number;
  annualRoyaltyAfterUrban: number;
  royaltyBeforeVat: number;
  areaBreakdown: {
    tierLabel: string;
    tierAreaM2: number;
    areaCoefficient: number;
    formulaText: string;
    amount: number;
  }[];
};

function fieldSection(item: ExportData['perField'][number], baseSalary: number, areaIndex: number): (Paragraph | Table)[] {
  const field = FIELDS.find(f => f.id === item.fieldId)!;
  const { result } = item;
  const out: (Paragraph | Table)[] = [];

  // ── Location / area header ───────────────────────────────────────────────────
  // Fallback: displayName → locationName → field standard name with number
  const areaLine = item.displayName || item.locationName || `${field.no}. ${field.name}`;
  out.push(p([txt(`KHU VỰC/ĐỊA ĐIỂM ${areaIndex}: ${areaLine}`, { bold: true, size: 26, color: COLOR.ink })], { spacing: 100 }));
  out.push(p([
    txt('Lĩnh vực áp dụng: ', { bold: true, size: 22, color: COLOR.accent }),
    txt(`${String(field.no).padStart(2, '0')}. ${field.name}`, { size: 22, bold: true }),
  ], { spacing: 120 }));

  // Metadata as 2-column table: label | value
  const metaRows: TableRow[] = [];
  if (item.tradeName) {
    metaRows.push(new TableRow({ children: [
      cell('Bảng hiệu/Tên cơ sở:', { bold: true, color: '#334155', width: 2200 }),
      cell(item.tradeName, { color: '#1F2937', width: 6000 }),
    ]}));
  }
  if (item.businessAddress) {
    metaRows.push(new TableRow({ children: [
      cell('Địa chỉ kinh doanh:', { bold: true, color: '#334155', width: 2200 }),
      cell(item.businessAddress, { color: '#1F2937', width: 6000 }),
    ]}));
  }
  if (item.locationNote) {
    metaRows.push(new TableRow({ children: [
      cell('Ghi chú khu vực:', { bold: true, color: '#334155', width: 2200 }),
      cell(item.locationNote, { color: '#1F2937', width: 6000 }),
    ]}));
  }
  if (metaRows.length > 0) {
    out.push(new Table({
      width: { size: 8200, type: WidthType.DXA },
      columnWidths: [2200, 6000],
      rows: metaRows,
    }));
    out.push(p([], { spacing: 80 }));
  }

  // Urban classification — per-instance, always shown
  const urbanRows: TableRow[] = [
    new TableRow({ children: [
      cell('Loại đô thị:', { bold: true, color: '#334155', width: 2200 }),
      cell(item.urbanLabel, { color: '#1F2937', width: 6000 }),
    ]}),
    new TableRow({ children: [
      cell('Hệ số đô thị:', { bold: true, color: '#334155', width: 2200 }),
      cell(`${(item.urbanFactor * 100).toFixed(0)}%`, { color: '#1F2937', width: 6000 }),
    ]}),
  ];
  // Cách áp dụng đô thị: luôn hiển thị để người đọc biết bảng tính dùng cách nào.
  if (item.urbanModeLabel) {
    urbanRows.push(new TableRow({ children: [
      cell('Cách áp dụng đô thị:', { bold: true, color: '#334155', width: 2200 }),
      cell(item.urbanModeLabel, { color: '#1F2937', width: 6000, bold: true }),
    ]}));
  }
  // Với Option 2 (applyUrbanBefore=true) và lĩnh vực dùng m²: hiển thị công thức
  // diện tích gốc × hệ số = diện tích tính phí để khách hiểu cách chia bậc.
  if (item.applyUrbanBefore && Number.isFinite(item.rawArea) && Number.isFinite(item.effectiveArea)) {
    // urbanFactor đã được set = 1 khi applyUrbanBefore=true (đô thị đã nhân trong diện tích).
    // Lấy lại hệ số gốc từ rawArea/effectiveArea nếu có thể (để hiển thị công thức).
    const displayedPct = item.rawArea && item.rawArea > 0
      ? Math.round((item.effectiveArea! / item.rawArea) * 100)
      : null;
    const formulaText = displayedPct != null
      ? `${item.rawArea!.toLocaleString('vi-VN')} m² × ${displayedPct}% = ${item.effectiveArea!.toLocaleString('vi-VN')} m²`
      : `${item.rawArea!.toLocaleString('vi-VN')} m² → ${item.effectiveArea!.toLocaleString('vi-VN')} m²`;
    urbanRows.push(new TableRow({ children: [
      cell('Diện tích gốc → tính phí:', { bold: true, color: '#334155', width: 2200 }),
      cell(formulaText, { color: '#1F2937', width: 6000, bold: true }),
    ]}));
  }
  out.push(new Table({
    width: { size: 8200, type: WidthType.DXA },
    columnWidths: [2200, 6000],
    rows: urbanRows,
  }));
  out.push(p([], { spacing: 80 }));
  // ─────────────────────────────────────────────────────────────────────────────

  const inputText = field.inputs.map(inp => {
    const v = item.vals[inp.key];
    if (!v) return null;
    return `${inp.label}: ${v.toLocaleString('vi-VN')} ${inp.suffix || ''}`.trim();
  }).filter(Boolean).join(' · ');
  if (inputText) out.push(p([txt(inputText, { italic: true, color: COLOR.mute, size: 20 })], { spacing: 120 }));

  // Khi có ít nhất 1 row có hideFormula=true (vd Hát với nhau > 30 chỗ đã được tách riêng)
  // ta vẫn dùng 5 cột nhưng thay "MLCS" / "Hệ số" thành "Căn cứ / mức tính" hợp nhất + "Quy mô áp dụng".
  // (DOCX word không có merged cell nên 5 cột vẫn dùng; hệ số trống khi hideFormula.)
  const hideFormula = result.rows.length > 0 && result.rows.every(r => r.hideFormula) && result.rows[0].label !== 'Thành tiền áp dụng';
  // We render với 5 cột nhưng header đã đổi tên: Bậc tính | MLCS | Hệ số | Quy mô áp dụng | Thành tiền
  // Header "MLCS" vẫn hiện nhưng ẩn khi scaleText đã đủ rõ (mục 19 / 21).
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('Nội dung tính phí', { width: 3400, bold: true, shading: 'F1F5F9' }),
      cell('Căn cứ / mức tính', { width: 2200, bold: true, shading: 'F1F5F9', align: AlignmentType.CENTER }),
      cell('Hệ số', { width: 1600, bold: true, shading: 'F1F5F9', align: AlignmentType.CENTER }),
      cell('Quy mô áp dụng', { width: 1700, bold: true, shading: 'F1F5F9', align: AlignmentType.CENTER }),
      cell('Thành tiền', { width: 1560, bold: true, shading: 'F1F5F9', align: AlignmentType.RIGHT }),
    ],
  });

  const dataRows = result.rows.map(r => {
    const isFlatFee = r.mode === 'flat-with-shows' || r.mode === 'flat-seats' || r.mode === 'wedding';
    return new TableRow({
      children: [
        cell(r.label),
        // Mục 5.3 / 5.4 (flat-with-shows, flat-seats, wedding) là phí trọn gói VND —
        // không phụ thuộc MLCS, không nhân hệ số đô thị. Cột "Căn cứ / mức tính" hiển thị
        // chính mức phí (coefText) thay vì MLCS để khách hiểu ngay "trả 2.000.000 đ/năm chứ
        // không phải 2.530.000 × hệ số". Cột "Hệ số" để trống vì không có hệ số nhân.
        cell(isFlatFee ? r.coefText : formatVND(baseSalary, false), {
          mono: true,
          align: AlignmentType.CENTER,
          color: isFlatFee ? COLOR.mute : COLOR.ink,
        }),
        cell(isFlatFee ? '—' : r.coefText, {
          mono: true,
          align: AlignmentType.CENTER,
          color: isFlatFee ? COLOR.mute : COLOR.accent,
        }),
        cell(formatScale(r), { mono: true, align: AlignmentType.CENTER }),
        cell(formatVND(r.amount), { mono: true, align: AlignmentType.RIGHT, bold: true }),
      ],
    });
  });

  // Chèn "Tạm tính theo bậc" (raw tier sum) khi field có áp trần
  const rawSum = result.rows
    .filter(r => r.label !== 'Thành tiền áp dụng')
    .reduce((s, r) => s + r.amount, 0);
  const extraRows: typeof dataRows = [];

  if (result.capMultiplier !== undefined && rawSum > 0) {
    extraRows.push(new TableRow({
      children: [
        cell('Tạm tính theo bậc', { italic: true, color: COLOR.mute }),
        cell('', {}), cell('', {}), cell('', {}),
        cell(formatVND(rawSum), { mono: true, align: AlignmentType.RIGHT, italic: true, color: COLOR.mute }),
      ],
    }));
    extraRows.push(new TableRow({
      children: [
        cell(`Mức trần áp dụng: ${result.capMultiplier}×MLCS${result.capped ? ' (ĐÃ ÁP TRẦN)' : ''}`, { italic: true, color: result.capped ? COLOR.warn : COLOR.mute }),
        cell('', {}), cell('', {}), cell('', {}),
        cell(formatVND(result.capAmount || 0), { mono: true, align: AlignmentType.RIGHT, color: result.capped ? COLOR.warn : COLOR.mute }),
      ],
    }));
  }

  // Dòng cuối: "Thành tiền áp dụng" thay cho "Cộng" mơ hồ.
  const finalLabel = result.capped ? 'Thành tiền sau áp trần' : 'Thành tiền áp dụng';
  const finalRow = new TableRow({
    children: [
      cell(finalLabel, { bold: true, shading: COLOR.rowTotal }),
      cell('', { shading: COLOR.rowTotal }),
      cell('', { shading: COLOR.rowTotal }),
      cell('', { shading: COLOR.rowTotal }),
      cell(formatVND(result.subTotal), { mono: true, align: AlignmentType.RIGHT, bold: true, shading: COLOR.rowTotal }),
    ],
  });

  const allRows: (typeof dataRows)[number][] = [headerRow, ...dataRows, ...extraRows, finalRow];

  out.push(new Table({
    width: { size: 10460, type: WidthType.DXA },
    columnWidths: [3400, 2200, 1600, 1700, 1560],
    rows: allRows,
  }));

  // CÁCH TÍNH THÀNH TIỀN — per instance with area index
  const calcAreaLine = item.displayName || item.locationName || `${field.no}. ${field.name}`;
  out.push(p([txt(`CÁCH TÍNH THÀNH TIỀN – KHU VỰC/ĐỊA ĐIỂM ${areaIndex}: ${calcAreaLine}`, { bold: true, size: 22, color: COLOR.accent })], { spacing: 120 }));
  // Render each breakdown row as: "[label]: [scale] × [coef] × MLCS = [amount]"
  for (const r of result.rows) {
    if (r.hideFormula) {
      out.push(p([txt(`• ${r.label}: ${formatVND(r.amount)}`, { size: 20 })], { spacing: 60 }));
    } else {
      const isFlatFee = r.mode === 'flat-with-shows' || r.mode === 'flat-seats' || r.mode === 'wedding';
      const scaleStr = formatScale(r);
      const coefStr = isFlatFee ? '' : r.coefText;
      const mlcsStr = isFlatFee ? '' : `${formatVND(baseSalary, false)}`;
      const parts = [scaleStr, coefStr, mlcsStr].filter(Boolean).join(' × ');
      out.push(p([
        txt(`• ${r.label}: `, { size: 20 }),
        txt(`${parts} = `, { size: 20, mono: false }),
        txt(`${formatVND(r.amount)}`, { size: 20, bold: true, color: COLOR.ok }),
      ], { spacing: 60 }));
    }
  }
  out.push(p([
    txt('⇒ Thành tiền áp dụng: ', { bold: true, size: 22 }),
    txt(`${formatVND(result.subTotal)}`, { bold: true, size: 22, color: COLOR.ok }),
  ], { spacing: 60 }));

  // Per-instance urban adjustment
  const urbanExempt = result.urbanExempt;
  if (urbanExempt) {
    out.push(p([
      txt('⇒ Sau áp đô thị: ', { bold: true, size: 22 }),
      txt('Không áp dụng (phí trọn gói)', { bold: true, size: 22, color: COLOR.mute }),
    ], { spacing: 120 }));
  } else if (item.applyUrbanBefore) {
    // Option 2: đô thị đã được nhân vào diện tích trước khi chia bậc.
    // Thành tiền đã bao gồm đô thị → không nhân lại.
    out.push(p([
      txt('⇒ Sau áp đô thị: ', { bold: true, size: 22 }),
      txt(`${formatVND(result.subTotal)} (đã áp đô thị trước khi chia bậc)`, { bold: true, size: 22, color: COLOR.ok }),
    ], { spacing: 120 }));
  } else {
    const afterUrban = result.subTotal * item.urbanFactor;
    out.push(p([
      txt('⇒ Sau áp đô thị (', { bold: true, size: 22 }),
      txt(`${item.urbanLabel} ${(item.urbanFactor * 100).toFixed(0)}%`, { bold: true, size: 22, color: COLOR.accent }),
      txt(`): `, { bold: true, size: 22 }),
      txt(`${formatVND(afterUrban)}`, { bold: true, size: 22, color: COLOR.ok }),
    ], { spacing: 120 }));
  }

  return out;
}

// Render FAB location section — multi-location per-location block with breakdown + CÁCH TÍNH THÀNH TIỀN
function fabLocationSection(index: number, loc: FabLocationExportData, baseSalary: number): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(p([txt(`KHU VỰC/ĐỊA ĐIỂM ${index}: ${loc.name || `Địa điểm ${index}`}`, { bold: true, size: 24, color: COLOR.accent })], { spacing: 80 }));
  out.push(p([txt(`Bảng hiệu: ${loc.tradeName || '—'}`, { size: 20 })]));
  out.push(p([txt(`Địa chỉ: ${loc.addressLine || '—'}`, { size: 20 })]));
  if (loc.ward) out.push(p([txt(`Phường/Xã: ${loc.ward}`, { size: 20 })]));
  if (loc.province) out.push(p([txt(`Tỉnh/Thành phố: ${loc.province}`, { size: 20 })]));
  out.push(p([txt(`Loại đô thị: ${loc.urbanLabel} (hệ số ${(loc.urbanCoefficient * 100).toFixed(0)}%)`, { size: 20 })]));
  out.push(p([txt(`Diện tích: ${formatScaleNumber(loc.areaM2)} m²`, { size: 20 })]));
  out.push(p([txt(`Thời hạn: ${loc.durationMonths} tháng`, { size: 20 })], { spacing: 120 }));

  // Per-location breakdown table
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('Bậc tính', { width: 3400, bold: true, shading: 'F1F5F9' }),
      cell('Căn cứ / mức tính', { width: 2200, bold: true, shading: 'F1F5F9', align: AlignmentType.CENTER }),
      cell('Hệ số', { width: 1600, bold: true, shading: 'F1F5F9', align: AlignmentType.CENTER }),
      cell('Quy mô áp dụng', { width: 1700, bold: true, shading: 'F1F5F9', align: AlignmentType.CENTER }),
      cell('Thành tiền', { width: 1560, bold: true, shading: 'F1F5F9', align: AlignmentType.RIGHT }),
    ],
  });
  const dataRows = loc.areaBreakdown.map(r => new TableRow({
    children: [
      cell(r.tierLabel),
      cell(`${formatVND(baseSalary, false)}`, { mono: true, align: AlignmentType.CENTER }),
      cell(r.areaCoefficient.toString().replace('.', ','), { mono: true, align: AlignmentType.CENTER, color: COLOR.accent }),
      cell(`${formatScaleNumber(r.tierAreaM2)} m²`, { mono: true, align: AlignmentType.CENTER }),
      cell(formatVND(r.amount), { mono: true, align: AlignmentType.RIGHT, bold: true }),
    ],
  }));
  out.push(new Table({
    width: { size: 10460, type: WidthType.DXA },
    columnWidths: [3400, 2200, 1600, 1700, 1560],
    rows: [headerRow, ...dataRows],
  }));

  // CÁCH TÍNH THÀNH TIỀN – per-location
  out.push(p([txt(`CÁCH TÍNH THÀNH TIỀN – ĐỊA ĐIỂM ${index}`, { bold: true, size: 22, color: COLOR.accent })], { spacing: 120 }));
  for (const r of loc.areaBreakdown) {
    out.push(p([
      txt(`• ${r.tierLabel}: `, { size: 20 }),
      txt(`${formatVND(baseSalary, false)} × ${r.areaCoefficient.toString().replace('.', ',')} × ${formatScaleNumber(r.tierAreaM2)} m² = `, { size: 20 }),
      txt(`${formatVND(r.amount)}`, { size: 20, bold: true, color: COLOR.ok }),
    ], { spacing: 60 }));
  }
  out.push(p([
    txt('⇒ Thành tiền theo diện tích: ', { bold: true, size: 22 }),
    txt(`${formatVND(loc.baseAnnualRoyaltyByArea)}`, { bold: true, size: 22, color: COLOR.ok }),
  ], { spacing: 60 }));
  out.push(p([
    txt('⇒ Sau áp dụng đô thị (', { bold: true, size: 22 }),
    txt(`${formatVND(loc.baseAnnualRoyaltyByArea)} × ${(loc.urbanCoefficient * 100).toFixed(0)}%`, { bold: true, size: 22, color: COLOR.mute }),
    txt('): ', { bold: true, size: 22 }),
    txt(`${formatVND(loc.annualRoyaltyAfterUrban)}`, { bold: true, size: 22, color: COLOR.ok }),
  ], { spacing: 60 }));
  out.push(p([
    txt('⇒ Theo thời hạn (', { bold: true, size: 22 }),
    txt(`${formatVND(loc.annualRoyaltyAfterUrban)} × ${loc.durationMonths}/12`, { bold: true, size: 22, color: COLOR.mute }),
    txt('): ', { bold: true, size: 22 }),
    txt(`${formatVND(loc.royaltyBeforeVat)}`, { bold: true, size: 22, color: COLOR.ok }),
  ], { spacing: 200 }));
  return out;
}

// Render "Quy mô áp dụng" — thân thiện với khách hàng.
// Ưu tiên scaleText (đã được calculator đính kèm), fallback theo mode + qty.
function formatScale(r: BreakdownRow): string {
  if (r.scaleText) return r.scaleText;
  const q = r.qty;
  switch (r.mode) {
    case 'tier-area':
    case 'tier-per100':
      if (q === 1) return '01 bậc đầu';
      return `${formatScaleNumber(q)} m²`;
    case 'per-room':
      if (q === 1) return '01 phòng';
      return `${formatScaleNumber(q)} phòng`;
    case 'per-pax':
      return `${formatScaleNumber(q)} lượt khách`;
    case 'flat-with-shows':
      return `${formatScaleNumber(q)} lượt/năm`;
    case 'flat-seats':
    case 'wedding':
      return `${formatScaleNumber(q)} chỗ`;
    case 'flat':
    default:
      return formatScaleNumber(q);
  }
}

function formatScaleNumber(v: number): string {
  if (!isFinite(v)) return '0';
  if (Math.abs(v - Math.round(v)) < 0.0001) return Math.round(v).toLocaleString('vi-VN');
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function summaryRow(label: string, amount: number, isGrand = false): TableRow {
  return new TableRow({
    children: [
      cell(label, {
        bold: isGrand, align: AlignmentType.LEFT,
        shading: isGrand ? COLOR.rowGrand : COLOR.rowAlt,
        color: isGrand ? 'FFFFFF' : COLOR.ink,
      }),
      cell(formatVND(amount), {
        mono: true, align: AlignmentType.RIGHT, bold: true,
        shading: isGrand ? COLOR.rowGrand : COLOR.rowAlt,
        color: isGrand ? 'FFFFFF' : COLOR.ok,
      }),
    ],
  });
}

function collectContent(data: ExportData): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(p([txt(VCPMC.fullName, { bold: true, size: 22, color: COLOR.accent })], { align: AlignmentType.CENTER, spacing: 40 }));
  out.push(p([txt(`Trụ sở: ${VCPMC.hq}`, { size: 18, color: COLOR.mute })], { align: AlignmentType.CENTER, spacing: 30 }));
  out.push(p([txt(`Điện thoại: ${VCPMC.hqPhone} · Email: ${VCPMC.email} · Website: ${VCPMC.website}`, { size: 18, color: COLOR.mute })], { align: AlignmentType.CENTER, spacing: 30 }));
  out.push(p([txt(`Chi nhánh phía Nam: ${VCPMC.south} – ĐT: ${VCPMC.southPhone}`, { size: 18, color: COLOR.mute })], { align: AlignmentType.CENTER, spacing: 30 }));
  out.push(p([txt(`VP Đà Nẵng: ${VCPMC.daNang} – ĐT: ${VCPMC.daNangPhone}`, { size: 18, color: COLOR.mute })], { align: AlignmentType.CENTER, spacing: 200 }));

  out.push(p([txt('BẢNG TÍNH TIỀN BẢN QUYỀN ÂM NHẠC', { bold: true, size: 32, color: COLOR.ink })], { align: AlignmentType.CENTER, spacing: 40 }));
  out.push(p([txt('Căn cứ Nghị định 17/2023/NĐ-CP ngày 26/4/2023 — Phụ lục biểu mức tiền bản quyền', { italic: true, color: COLOR.mute, size: 20 })], { align: AlignmentType.CENTER, spacing: 240 }));

  if (data.quoteNo || data.quoteDate) {
    out.push(p([
      txt(`Số bảng tính: ${data.quoteNo || '—'} `, { size: 20 }),
      txt(`Ngày: ${data.quoteDate || new Date().toLocaleDateString('vi-VN')}`, { size: 20 }),
    ], { align: AlignmentType.RIGHT, spacing: 200 }));
  }

  out.push(p([txt('THÔNG TIN KHÁCH HÀNG', { bold: true, size: 22, color: COLOR.accent })], { spacing: 80 }));
  out.push(p([txt('Tên đơn vị: ', { bold: true }), txt(data.customer.name || '………………………')]));
  out.push(p([txt('Địa chỉ: ', { bold: true }), txt(data.customer.address || '………………………')]));
  if (data.customer.representative) out.push(p([txt('Người đại diện: ', { bold: true }), txt(data.customer.representative)]));
  // Multi-area: show per-instance urban note instead of a single global classification
  if (data.perField.length > 1) {
    out.push(p([txt('Phân loại đô thị: ', { bold: true }), txt('Áp dụng riêng theo từng khu vực/địa điểm')]));
  } else if (data.perField.length === 1) {
    out.push(p([txt('Phân loại đô thị: ', { bold: true }), txt(`${data.perField[0].urbanLabel} (${(data.perField[0].urbanFactor * 100).toFixed(0)}% khung giá)`)]));
  }
  // Cách áp dụng đô thị ở mức bảng tính — dùng mode của instance đầu tiên nếu có,
  // fallback về data.urbanMode. Option 2 với lĩnh vực m² sẽ hiển thị "Cách 2".
  const headerUrbanModeLabel =
    data.perField[0]?.urbanModeLabel ?? data.urbanModeLabel ?? null;
  if (headerUrbanModeLabel) {
    out.push(p([txt('Cách áp dụng đô thị: ', { bold: true }), txt(headerUrbanModeLabel)]));
  }
  out.push(p([txt('Thời hạn hợp đồng: ', { bold: true }), txt(`${data.contractMonths} tháng`)]));
  out.push(p([txt('Mức lương cơ sở áp dụng: ', { bold: true }), txt(formatVND(data.baseSalary))], { spacing: 200 }));

  out.push(p([txt('CHI TIẾT TÍNH TIỀN BẢN QUYỀN', { bold: true, size: 22, color: COLOR.accent })], { spacing: 120 }));

  // FAB multi-location: each location gets its own block with breakdown + CÁCH TÍNH THÀNH TIỀN
  if (data.fabLocations && data.fabLocations.length > 0) {
    for (let i = 0; i < data.fabLocations.length; i++) {
      out.push(...fabLocationSection(i + 1, data.fabLocations[i], data.baseSalary));
    }
  } else {
    data.perField.forEach((item, i) => {
      out.push(...fieldSection(item, data.baseSalary, i + 1));
    });
  }

  out.push(p([], { spacing: 240 }));
    out.push(p([txt('TỔNG HỢP TIỀN BẢN QUYỀN', { bold: true, size: 24, color: COLOR.accent })], { spacing: 120 }));

  // FAB multi-location: render per-location summary + grand total
  if (data.fabLocations && data.fabLocations.length > 0) {
    out.push(p([txt('I. TỔNG HỢP THEO KHU VỰC/ĐỊA ĐIỂM', { bold: true, size: 22, color: COLOR.accent })], { spacing: 80 }));
    const perLocationRows: TableRow[] = data.fabLocations.map((loc, i) => summaryRow(
      `Địa điểm ${i + 1}: ${loc.name || `Địa điểm ${i + 1}`}`,
      loc.royaltyBeforeVat,
    ));
    perLocationRows.push(summaryRow('Tổng tiền bản quyền trước thuế GTGT', data.totals.afterUrban, true));
    out.push(new Table({
      width: { size: 10460, type: WidthType.DXA },
      columnWidths: [6960, 3500],
      rows: perLocationRows,
    }));
    out.push(p([], { spacing: 120 }));
    out.push(p([txt('II. THUẾ VÀ TỔNG THANH TOÁN', { bold: true, size: 22, color: COLOR.accent })], { spacing: 80 }));
    out.push(p([
      txt('Cách tính: ', { bold: true }),
      txt(`${formatVND(data.totals.afterUrban)} × ${(data.vatPct * 100).toFixed(0)}% = ${formatVND(data.totals.vat)}`, { mono: false }),
    ]));
    out.push(new Table({
      width: { size: 10460, type: WidthType.DXA },
      columnWidths: [6960, 3500],
      rows: [
        summaryRow(`Thuế GTGT ${(data.vatPct * 100).toFixed(0)}%`, data.totals.vat),
        summaryRow('TỔNG GIÁ TRỊ HỢP ĐỒNG (đã gồm Thuế GTGT)', data.totals.grandTotal, true),
      ],
    }));
  } else if (data.perField.length > 1) {
    // Multi-instance: per-area breakdown with individual urban coefficients
    out.push(p([txt('I. TỔNG HỢP THEO KHU VỰC/ĐỊA ĐIỂM', { bold: true, size: 22, color: COLOR.accent })], { spacing: 80 }));
    const perAreaRows: TableRow[] = data.perField.map((pf, i) => {
      const f = FIELDS.find(fld => fld.id === pf.fieldId)!;
      // Use displayName if available; fallback to locationName; finally field standard name
      const areaLabel = pf.displayName || pf.locationName || `Khu vực ${i + 1}`;
      const fieldLabel = `${String(f.no).padStart(2, '0')}. ${f.name}`;
      const urbanDisplay = `${pf.urbanLabel} ${(pf.urbanFactor * 100).toFixed(0)}%`;
      const urbanExempt = pf.result.urbanExempt;
      const afterUrban = urbanExempt ? pf.result.subTotal : pf.result.subTotal * pf.urbanFactor;
      return summaryRow(
        `${i + 1}. ${areaLabel} – ${fieldLabel} [${urbanDisplay}]`,
        afterUrban
      );
    });
    const totalAfterUrban = perAreaRows.reduce((sum, _row, idx) => {
      const pf = data.perField[idx];
      const urbanExempt = pf.result.urbanExempt;
      return sum + (urbanExempt ? pf.result.subTotal : pf.result.subTotal * pf.urbanFactor);
    }, 0);
    perAreaRows.push(summaryRow('Tổng tiền bản quyền trước thuế GTGT', totalAfterUrban, true));
    out.push(new Table({
      width: { size: 10460, type: WidthType.DXA },
      columnWidths: [6960, 3500],
      rows: perAreaRows,
    }));

    out.push(p([], { spacing: 80 }));
    out.push(p([txt('II. THUẾ VÀ TỔNG THANH TOÁN', { bold: true, size: 22, color: COLOR.accent })], { spacing: 80 }));
    out.push(new Table({
      width: { size: 10460, type: WidthType.DXA },
      columnWidths: [6960, 3500],
      rows: [
        summaryRow(`Thuế GTGT ${(data.vatPct * 100).toFixed(0)}%`, data.totals.vat),
        summaryRow('TỔNG GIÁ TRỊ HỢP ĐỒNG (đã gồm Thuế GTGT)', data.totals.grandTotal, true),
      ],
    }));
  } else {
    // Single-instance: show per-instance urban
    const pf = data.perField[0];
    const urbanExempt = pf.result.urbanExempt;
    const afterUrban = urbanExempt ? pf.result.subTotal : pf.result.subTotal * pf.urbanFactor;
    out.push(new Table({
      width: { size: 10460, type: WidthType.DXA },
      columnWidths: [6960, 3500],
      rows: [
        summaryRow('Cộng tiền bản quyền (sau áp trần)', data.totals.rawSubTotal),
        summaryRow(`Hệ số đô thị (${pf.urbanLabel}: ${(pf.urbanFactor * 100).toFixed(0)}%)`, afterUrban),
        summaryRow(`Hỗ trợ chung trước thuế GTGT: ${(data.supportPct * 100).toFixed(0)}%`, data.totals.afterSupport),
        summaryRow(`Thuế GTGT ${(data.vatPct * 100).toFixed(0)}%`, data.totals.vat),
        summaryRow('TỔNG GIÁ TRỊ HỢP ĐỒNG (đã gồm Thuế GTGT)', data.totals.grandTotal, true),
      ],
    }));
  }

  out.push(p([], { spacing: 120 }));
  out.push(p([
    txt('Bằng chữ: ', { bold: true }),
    txt(`${numberToVietnameseWords(data.totals.grandTotal)}./.`, { italic: true }),
  ]));

  out.push(p([], { spacing: 200 }));
  out.push(p([txt('GHI CHÚ', { bold: true, color: COLOR.accent })], { spacing: 60 }));
  out.push(p([txt('• Bảng tính lập theo Nghị định 17/2023/NĐ-CP ngày 26/4/2023 — Phụ lục biểu mức tiền bản quyền.', { size: 20, color: COLOR.mute })]));
  out.push(p([txt('• Tỷ lệ áp dụng theo phân loại đô thị từng khu vực/địa điểm (NĐ 134/2026/NĐ-CP): HN/TP.HCM 100%; loại I 80%; loại II 50%; loại III 20% (vùng sâu, vùng xa, vùng ĐB khó khăn 10%).', { size: 20, color: COLOR.mute })]));
  out.push(p([txt('• Bảng tính có hiệu lực 30 ngày kể từ ngày phát hành.', { size: 20, color: COLOR.mute })]));
  out.push(p([txt('• Mức lương cơ sở thay đổi theo quy định của Chính phủ tại từng thời điểm.', { size: 20, color: COLOR.mute })]));

  out.push(p([], { spacing: 360 }));
  out.push(new Table({
    width: { size: 10460, type: WidthType.DXA },
    columnWidths: [5230, 5230],
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 5230, type: WidthType.DXA },
          borders: b('FFFFFF', 0),
          children: [
            p([txt('ĐẠI DIỆN KHÁCH HÀNG', { bold: true })], { align: AlignmentType.CENTER }),
            p([txt('(Ký, ghi rõ họ tên, đóng dấu)', { italic: true, color: COLOR.mute, size: 18 })], { align: AlignmentType.CENTER }),
          ],
        }),
        new TableCell({
          width: { size: 5230, type: WidthType.DXA },
          borders: b('FFFFFF', 0),
          children: [
            p([txt('ĐẠI DIỆN VCPMC', { bold: true })], { align: AlignmentType.CENTER }),
            p([txt('(Ký, ghi rõ họ tên, đóng dấu)', { italic: true, color: COLOR.mute, size: 18 })], { align: AlignmentType.CENTER }),
          ],
        }),
      ],
    })],
  }));

  return out;
}

function buildDoc(data: ExportData): Document {
  const childrenAll = collectContent(data);
  return new Document({
    creator: 'VCPMC',
    title: 'Bảng tính tiền bản quyền âm nhạc',
    description: 'Bảng tính theo Nghị định 17/2023/NĐ-CP',
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: childrenAll,
    }],
  });
}

export function buildRoyaltyQuoteDoc(data: ExportData): Document {
  return buildDoc(data);
}

export async function exportRoyaltyQuoteDocx(data: ExportData): Promise<void> {
  const doc = buildDoc(data);
  const blob = await Packer.toBlob(doc);
  const filename = `BangTinhTienBanQuyen-VCPMC-${(data.customer.name || 'KhachHang').replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.docx`;
  saveAs(blob, filename);
}
