/**
 * Generate a real `.xlsx` file from a CalculationSnapshot (browser-side only).
 *
 * Three sheets:
 *   1. Tổng hợp — VCPMC institutional heading + metadata + per-location summary + grand totals
 *   2. Chi tiết khu vực — auditable breakdown with actual qty/coef/MLCS per tier
 *   3. Thông tin & căn cứ — audit/reference (not a duplicate broken summary)
 *
 * All numbers come verbatim from the backend-confirmed snapshot. No recalculation.
 */

import ExcelJS from 'exceljs';
import type { CalculationSnapshot, CalculationBreakdownLine } from '../../components/calculations/calculationTypes';

const C = {
  navy:       '00384D',
  navyLight:  '0A4C66',
  white:      'FFFFFF',
  cream:      'F9F7F2',
  paper:      'FFFEFB',
  ink:        '252525',
  text:       '1A1A1A',
  muted:      '64748B',
  divider:    'D9D3C7',
  rowAlt:     'F5F3EE',
  accent:     '075F5B',
  accentLight:'E6F0EF',
  totalBg:    'EEF4F6',
  sectionBg:  '00384D',
};

const FONT = 'Times New Roman';

function bdr(color = C.divider): ExcelJS.Border {
  return {
    top:    { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    left:   { style: 'thin', color: { argb: color } },
    right:  { style: 'thin', color: { argb: color } },
  };
}

function bdrMed(color = C.navy): ExcelJS.Border {
  return {
    top:    { style: 'medium', color: { argb: color } },
    bottom: { style: 'thin',   color: { argb: color } },
    left:   { style: 'thin',   color: { argb: color } },
    right:  { style: 'thin',   color: { argb: color } },
  };
}

type CsOpts = {
  bold?: boolean;
  size?: number;
  color?: string;
  italic?: boolean;
  align?: Partial<ExcelJS.Alignment>;
  fill?: string;
  border?: boolean | ExcelJS.Border;
  wrap?: boolean;
};

function cs(o: CsOpts = {}): Partial<ExcelJS.Style> {
  return {
    font: {
      name: FONT,
      size: o.size ?? 11,
      bold: o.bold,
      italic: o.italic,
      color: { argb: o.color ?? C.text },
    },
    fill: o.fill
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } }
      : undefined,
    alignment: {
      vertical: 'middle',
      wrapText: Boolean(o.wrap),
      horizontal: o.align?.horizontal ?? 'left',
      indent: o.align?.indent,
    },
    border: o.border === false ? undefined : (o.border as ExcelJS.Border | undefined) ?? bdr(),
  };
}

function vnd(n: number): string {
  return Math.round(n || 0).toLocaleString('vi-VN');
}

function notDeclared(v: string | null | undefined): string {
  return (v && v.trim()) ? v.trim() : 'Chưa khai báo';
}

function safeName(s: string): string {
  return (s || 'BangTinh')
    .replace(/[^A-Za-z0-9À-ỹ _-]+/g, '_')
    .replace(/\s+/g, '_').substring(0, 60);
}

export async function generateRoyaltyCalculationWorkbook(snap: CalculationSnapshot): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCPMC';
  wb.lastModifyBy = snap.createdBy ?? 'VCPMC';
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = 'Bảng tính tiền bản quyền âm nhạc';

  buildSummarySheet(wb.addWorksheet('Tổng hợp'), snap);
  buildLocationSheet(wb.addWorksheet('Chi tiết khu vực'), snap);
  buildBasisSheet(wb.addWorksheet('Thông tin & căn cứ'), snap);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function workbookFilename(snap: CalculationSnapshot): string {
  const date = (snap.createdAtIso || new Date().toISOString()).slice(0, 10);
  return `BangTinhTienBanQuyen-VCPMC-${safeName(snap.legalEntityName || 'DonVi')}-${date}.xlsx`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * SHEET 1 — Tổng hợp
 * ───────────────────────────────────────────────────────────────────────── */
function buildSummarySheet(ws: ExcelJS.Worksheet, snap: CalculationSnapshot) {
  // A4 landscape, fit to 1 page wide, no clipped overflow
  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printErrors: false,
    margins: { left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
  };
  // Freeze after the header block (rows 1–9 are the VCPMC heading + metadata)
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 9 }];

  // Narrow columns to avoid clipping on landscape A4
  ws.columns = [
    { width: 3 },  // A  — left margin
    { width: 5 },  // B  — STT
    { width: 22 }, // C  — Khu vực / địa điểm
    { width: 18 }, // D  — Tên hiển thị
    { width: 16 }, // E  — Loại hình sử dụng
    { width: 14 }, // F  — Quy mô thực tế
    { width: 16 }, // G  — Đô thị / hệ số
    { width: 10 }, // H  — Thời hạn
    { width: 18 }, // I  — Tiền bản quyền trước Thuế GTGT
  ];

  let r = 1;

  // ── Row 1: VCPMC heading ─────────────────────────────────────────
  ws.mergeCells(`B${r}:I${r}`);
  ws.getCell(`B${r}`).value = 'TRUNG TÂM BẢO VỆ QUYỀN TÁC GIẢ ÂM NHẠC VIỆT NAM';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 13, color: C.navy,
    align: { horizontal: 'center', vertical: 'middle' },
    border: false,
  }));
  ws.getRow(r).height = 24; r++;

  // ── Row 2: Branch ────────────────────────────────────────────────
  ws.mergeCells(`B${r}:I${r}`);
  ws.getCell(`B${r}`).value = 'CHI NHÁNH PHÍA NAM';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.navyLight,
    align: { horizontal: 'center', vertical: 'middle' },
    border: false,
  }));
  ws.getRow(r).height = 18; r++;

  // ── Row 3: blank ────────────────────────────────────────────────
  r++;

  // ── Row 4: Document title ──────────────────────────────────────
  ws.mergeCells(`B${r}:I${r}`);
  ws.getCell(`B${r}`).value = 'BẢNG TÍNH TIỀN BẢN QUYỀN ÂM NHẠC';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 17, color: C.ink,
    align: { horizontal: 'center', vertical: 'middle' },
    border: false,
  }));
  ws.getRow(r).height = 28; r++;

  // ── Row 5: Legal basis ─────────────────────────────────────────
  ws.mergeCells(`B${r}:I${r}`);
  ws.getCell(`B${r}`).value = snap.legalBasis
    ? `Căn cứ: ${snap.legalBasis}`
    : 'Căn cứ: Phụ lục biểu mức tiền bản quyền — Nghị định 17/2023/NĐ-CP ngày 26/4/2023';
  Object.assign(ws.getCell(`B${r}`), cs({
    italic: true, size: 10, color: C.muted,
    align: { horizontal: 'center', vertical: 'middle' },
    border: false,
  }));
  ws.getRow(r).height = 16; r++;

  // ── Row 6: blank ────────────────────────────────────────────────
  r++;

  // ── Rows 7–11: Metadata block ──────────────────────────────────
  const metaRows: Array<[string, string]> = [
    ['Tên đơn vị / pháp nhân', notDeclared(snap.legalEntityName)],
    ['Địa chỉ pháp lý', notDeclared(snap.customerAddress)],
    ['Người đại diện', notDeclared(snap.customerRepresentative)],
    ['Mã bảng tính', snap.calculationCode || '—'],
    ['Ngày lập bảng tính', snap.createdAtDisplay || '—'],
  ];

  for (const [label, value] of metaRows) {
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`B${r}`).value = label;
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true, size: 10, color: C.navyLight,
      fill: C.cream,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }));
    ws.mergeCells(`D${r}:I${r}`);
    ws.getCell(`D${r}`).value = value;
    Object.assign(ws.getCell(`D${r}`), cs({
      size: 10, color: C.text,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      wrap: true,
    }));
    ws.getRow(r).height = 16; r++;
  }

  // ── Row 12: Section heading ─────────────────────────────────────
  ws.mergeCells(`B${r}:I${r}`);
  ws.getCell(`B${r}`).value = 'I. TỔNG HỢP THEO KHU VỰC / ĐỊA ĐIỂM';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.white,
    fill: C.sectionBg,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  }));
  ws.getRow(r).height = 20; r++;

  // ── Row 13: Column headers ──────────────────────────────────────
  const headers = [
    { label: 'STT',                           align: 'center' as const },
    { label: 'Khu vực / địa điểm',          align: 'left'   as const },
    { label: 'Tên hiển thị trên bảng tính',  align: 'left'   as const },
    { label: 'Loại hình sử dụng',             align: 'left'   as const },
    { label: 'Quy mô thực tế',                align: 'left'   as const },
    { label: 'Đô thị / hệ số',                align: 'center' as const },
    { label: 'Thời hạn',                      align: 'center' as const },
    { label: 'Tiền bản quyền trước Thuế GTGT', align: 'right' as const },
  ];
  for (let ci = 0; ci < headers.length; ci++) {
    const col = String.fromCharCode('B'.charCodeAt(0) + ci);
    ws.getCell(`${col}${r}`).value = headers[ci].label;
    Object.assign(ws.getCell(`${col}${r}`), cs({
      bold: true, size: 9, color: C.white,
      fill: C.navy,
      align: { horizontal: headers[ci].align, vertical: 'middle', indent: 1 },
    }));
  }
  ws.getRow(r).height = 22; r++;

  // ── Per-location rows ───────────────────────────────────────────
  const grandRoyaltyRaw = snap.locations.reduce((s, l) => s + (l.royaltyBeforeVatRaw || 0), 0);
  const grandVatRaw     = snap.locations.reduce((s, l) => s + (l.vatRaw || 0), 0);
  const grandTotalRaw   = snap.locations.reduce((s, l) => s + (l.totalPaymentRaw || 0), 0);

  snap.locations.forEach((loc, i) => {
    const isAlt = i % 2 === 1;
    const fill  = isAlt ? C.rowAlt : undefined;

    // Location separator bar
    ws.mergeCells(`B${r}:I${r}`);
    ws.getCell(`B${r}`).value = `Khu vực ${i + 1}: ${loc.actualLocationName}`;
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true, size: 10, color: C.white,
      fill: C.accent,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }));
    ws.getRow(r).height = 16; r++;

    // Data row
    const rowVals: Array<[string, string, ExcelJS.Alignment['horizontal'], boolean, string?]> = [
      [String(i + 1), '', 'center', false, undefined],
      [loc.actualLocationName, '', 'left', false, undefined],
      [loc.displayName?.trim() || notDeclared(null), '', 'left', true, undefined],
      [loc.domainLabel, '', 'left', false, undefined],
      [loc.areaDisplay || '—', '', 'left', false, undefined],
      [`${loc.urbanType || '—'}  (${loc.urbanCoefficient || '—'})`, '', 'center', false, undefined],
      [loc.termDisplay || '—', '', 'center', false, undefined],
      [`${vnd(loc.royaltyBeforeVatRaw)} đ`, '', 'right', true, '#,##0" đ"'],
    ];
    for (let ci = 0; ci < rowVals.length; ci++) {
      const [val, , align, bold, numFmt] = rowVals[ci];
      const col = String.fromCharCode('B'.charCodeAt(0) + ci);
      const c = ws.getCell(`${col}${r}`);
      c.value = val;
      Object.assign(c, cs({
        bold, size: 10, color: C.text,
        fill,
        align: { horizontal: align, vertical: 'middle', indent: align === 'right' ? 0 : 1 },
        wrap: ci === 1 && val.length > 24,
      }));
      if (numFmt) c.numFmt = numFmt;
    }
    ws.getRow(r).height = 16; r++;
  });

  // ── Totals block ────────────────────────────────────────────────
  r++;
  const totalDefs: Array<[string, number, boolean]> = [
    ['Tiền bản quyền trước Thuế GTGT', grandRoyaltyRaw, false],
    ['Chi phí khác', 0, false],
    ['Tạm tính', grandRoyaltyRaw, false],
    ['Thuế GTGT', grandVatRaw, false],
    ['TỔNG THANH TOÁN', grandTotalRaw, true],
  ];

  for (const [label, value, emphasis] of totalDefs) {
    const isChiPhi = label === 'Chi phí khác' && value === 0;
    ws.mergeCells(`B${r}:H${r}`);
    ws.getCell(`B${r}`).value = label;
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true,
      size: emphasis ? 12 : 10,
      color: emphasis ? C.white : (isChiPhi ? C.muted : C.text),
      fill: emphasis ? C.accent : (isChiPhi ? undefined : C.totalBg),
      align: { horizontal: 'right', vertical: 'middle', indent: 1 },
    }));
    ws.getCell(`I${r}`).value = isChiPhi ? '—' : `${vnd(value)} đ`;
    if (!isChiPhi) ws.getCell(`I${r}`).numFmt = '#,##0" đ"';
    Object.assign(ws.getCell(`I${r}`), cs({
      bold: true,
      size: emphasis ? 13 : 10,
      color: emphasis ? C.white : (isChiPhi ? C.muted : C.text),
      fill: emphasis ? C.accent : (isChiPhi ? undefined : C.totalBg),
      align: { horizontal: 'right', vertical: 'middle' },
    }));
    ws.getRow(r).height = emphasis ? 22 : 18; r++;
  }

  // ── Bằng chữ ─────────────────────────────────────────────────
  ws.mergeCells(`B${r}:I${r}`);
  ws.getCell(`B${r}`).value = `Bằng chữ: ${snap.amountInWords || '—'}`;
  Object.assign(ws.getCell(`B${r}`), cs({
    italic: true, size: 10, color: C.muted,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: false, wrap: true,
  }));
  ws.getRow(r).height = 18; r++;

  // ── Căn cứ và ghi chú ─────────────────────────────────────────
  r++;
  ws.mergeCells(`B${r}:I${r}`);
  ws.getCell(`B${r}`).value = 'II. CĂN CỨ VÀ GHI CHÚ';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.white,
    fill: C.sectionBg,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  }));
  ws.getRow(r).height = 20; r++;

  const noteRows: Array<string> = [
    snap.legalBasis ? `Căn cứ pháp lý: ${snap.legalBasis}` : 'Căn cứ pháp lý: Phụ lục biểu mức tiền bản quyền — Nghị định 17/2023/NĐ-CP ngày 26/4/2023',
    snap.legalArticle ? `Điều khoản: ${snap.legalArticle}` : 'Điều khoản: —',
    snap.baseSalaryDisplay ? `Mức lương cơ sở (MLCS): ${snap.baseSalaryDisplay}` : 'Mức lương cơ sở (MLCS): 2.530.000 đồng/tháng',
    snap.effectiveFrom ? `Có hiệu lực từ: ${snap.effectiveFrom}` : 'Có hiệu lực từ: —',
    `Người lập: ${snap.createdBy || '—'}`,
    `Ngày lập: ${snap.createdAtDisplay || '—'}`,
    `Mã bảng tính: ${snap.calculationCode || '—'}`,
  ];
  for (const text of noteRows) {
    ws.mergeCells(`B${r}:I${r}`);
    ws.getCell(`B${r}`).value = text;
    Object.assign(ws.getCell(`B${r}`), cs({
      size: 9, color: C.muted,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      border: false,
    }));
    ws.getRow(r).height = 14; r++;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * SHEET 2 — Chi tiết khu vực
 * Auditable breakdown: each tier shows qty × coef × MLCS = amount
 * ───────────────────────────────────────────────────────────────────────── */
function buildLocationSheet(ws: ExcelJS.Worksheet, snap: CalculationSnapshot) {
  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printErrors: false,
    margins: { left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
  };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

  ws.columns = [
    { width: 3 },  // A  — margin
    { width: 26 }, // B  — label
    { width: 50 }, // C  — value / content
    { width: 16 }, // D  — extra
    { width: 16 }, // E  — extra
  ];

  // ── Header rows ───────────────────────────────────────────────
  ws.mergeCells('B2:E2');
  ws.getCell('B2').value = `CHI TIẾT KHU VỰC — ${snap.legalEntityName || '—'}  ·  Mã bảng tính: ${snap.calculationCode || '—'}`;
  Object.assign(ws.getCell('B2'), cs({
    bold: true, size: 12, color: C.navy,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: false,
  }));

  ws.mergeCells('B3:E3');
  ws.getCell('B3').value = `Ngày lập: ${snap.createdAtDisplay || '—'}`;
  Object.assign(ws.getCell('B3'), cs({
    italic: true, size: 10, color: C.muted,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: false,
  }));

  let r = 5;

  snap.locations.forEach((loc, idx) => {
    // ── Location heading bar ────────────────────────────────────
    ws.mergeCells(`B${r}:E${r}`);
    ws.getCell(`B${r}`).value = `KHU VỰC ${idx + 1}: ${loc.actualLocationName}`;
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true, size: 12, color: C.white,
      fill: C.accent,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }));
    ws.getRow(r).height = 22; r++;

    // ── Info rows ────────────────────────────────────────────────
    const infoRows: Array<[string, string]> = [
      ['Loại hình sử dụng âm nhạc', loc.domainLabel || '—'],
      ['Bảng hiệu / tên cơ sở', notDeclared(loc.actualArea)],
      ['Địa chỉ sử dụng âm nhạc', notDeclared(loc.musicUseAddress)],
      ['Tên hiển thị trên bảng tính', loc.displayName?.trim() || notDeclared(null)],
      ['Quy mô', loc.areaDisplay || '—'],
      ['Loại đô thị', loc.urbanType || '—'],
      ['Hệ số đô thị', loc.urbanCoefficient || '—'],
      ['Tỷ lệ áp dụng theo phân loại đô thị', loc.urbanCoefficient && loc.urbanCoefficient !== '—' && loc.urbanCoefficient !== 1
        ? `${loc.urbanType} (${Math.round(Number(loc.urbanCoefficient) * 100)}%)`
        : (loc.urbanType || '—')],
      ['Thời hạn', loc.termDisplay || '—'],
      ['Hệ số hỗ trợ', loc.supportDisplay || '—'],
      ['Mức lương cơ sở (MLCS)', snap.baseSalaryDisplay || '—'],
      ['Tiền bản quyền trước Thuế GTGT', loc.royaltyBeforeVatDisplay || '—'],
      ['Thuế GTGT', loc.vatDisplay || '—'],
      ['TỔNG THANH TOÁN', loc.totalPaymentDisplay || '—'],
    ];

    for (const [label, value] of infoRows) {
      const isTotal = label === 'TỔNG THANH TOÁN';
      const isRoyalty = label === 'Tiền bản quyền trước Thuế GTGT';
      const isVat = label === 'Thuế GTGT';
      ws.getCell(`B${r}`).value = label;
      Object.assign(ws.getCell(`B${r}`), cs({
        bold: true, size: 10,
        color: isTotal ? C.white : C.navyLight,
        fill: isTotal ? C.accent : C.cream,
        align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      }));
      ws.mergeCells(`C${r}:E${r}`);
      ws.getCell(`C${r}`).value = value;
      Object.assign(ws.getCell(`C${r}`), cs({
        size: 11,
        color: isTotal ? C.white : C.text,
        fill: isTotal ? C.accent : (isRoyalty || isVat ? C.totalBg : undefined),
        bold: isTotal,
        align: { horizontal: 'left', vertical: 'middle', indent: 1 },
        wrap: true,
      }));
      ws.getRow(r).height = 18; r++;
    }

    // ── Breakdown table ─────────────────────────────────────────
    r++;
    ws.mergeCells(`B${r}:E${r}`);
    ws.getCell(`B${r}`).value = 'Diễn giải cách tính';
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true, size: 11, color: C.white,
      fill: C.navyLight,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }));
    ws.getRow(r).height = 18; r++;

    if (!loc.calculationBreakdown || loc.calculationBreakdown.length === 0) {
      ws.mergeCells(`B${r}:E${r}`);
      ws.getCell(`B${r}`).value = 'Hệ thống chưa cung cấp diễn giải cách tính cho khu vực này.';
      Object.assign(ws.getCell(`B${r}`), cs({
        italic: true, size: 10, color: C.muted,
        align: { horizontal: 'left', vertical: 'middle', indent: 1 },
        border: false,
      }));
      ws.getRow(r).height = 14; r++;
    } else {
      // Extended column headers with Thành tiền
      const bdHeaders = [
        { label: 'STT',                          align: 'center' as const },
        { label: 'Hạng mục / bậc tính',         align: 'left'   as const },
        { label: 'Số lượng / quy mô áp dụng',  align: 'center' as const },
        { label: 'Mức / hệ số',                  align: 'center' as const },
        { label: 'Cách tính đầy đủ',             align: 'left'   as const },
        { label: 'Thành tiền',                   align: 'right'  as const },
      ];
      // Add column F for Thành tiền
      ws.columns = [
        { width: 3 },   // A
        { width: 26 },  // B
        { width: 26 },  // C  — narrower: label + scale
        { width: 14 },  // D  — qty
        { width: 14 },  // E  — coef
        { width: 36 },  // F  — full formula
        { width: 18 },  // G  — Thành tiền
      ];

      for (let ci = 0; ci < bdHeaders.length; ci++) {
        const col = String.fromCharCode('B'.charCodeAt(0) + ci);
        ws.getCell(`${col}${r}`).value = bdHeaders[ci].label;
        Object.assign(ws.getCell(`${col}${r}`), cs({
          bold: true, size: 9, color: C.white,
          fill: C.navy,
          align: { horizontal: bdHeaders[ci].align, vertical: 'middle', indent: 1 },
        }));
      }
      ws.getRow(r).height = 22; r++;

      // Breakdown rows
      const lines = loc.calculationBreakdown as readonly CalculationBreakdownLine[];
      lines.forEach((line, li) => {
        const isAlt = li % 2 === 1;
        const fill = isAlt ? C.rowAlt : undefined;

        ws.getCell(`B${r}`).value = String(li + 1);
        Object.assign(ws.getCell(`B${r}`), cs({
          size: 10, color: C.muted,
          fill,
          align: { horizontal: 'center', vertical: 'middle' },
        }));

        // Tier label (e.g. "4 phòng đầu (≤20m²)" or "Đến 15 m²")
        ws.getCell(`C${r}`).value = line.label || '—';
        Object.assign(ws.getCell(`C${r}`), cs({
          size: 11, color: C.text,
          fill,
          align: { horizontal: 'left', vertical: 'middle', indent: 1 },
          wrap: true,
        }));

        // Scale text (qty): e.g. "4 phòng", "5 m²", "3 bậc đầu"
        const scaleDisplay = line.scaleText || '—';
        ws.getCell(`D${r}`).value = scaleDisplay;
        Object.assign(ws.getCell(`D${r}`), cs({
          size: 10, color: C.text,
          fill,
          align: { horizontal: 'center', vertical: 'middle' },
          wrap: true,
        }));

        // Coefficient: e.g. "1,6/phòng", "0,35/15m²"
        const coefDisplay = line.coef != null
          ? (line.coefText || `${line.coef}`)
          : '—';
        ws.getCell(`E${r}`).value = coefDisplay;
        Object.assign(ws.getCell(`E${r}`), cs({
          size: 10, color: C.text,
          fill,
          align: { horizontal: 'center', vertical: 'middle' },
        }));

        // Full calculation narrative
        const detailText = line.detail || (line.coef != null ? `Hệ số: ${coefDisplay}` : '—');
        ws.getCell(`F${r}`).value = detailText;
        Object.assign(ws.getCell(`F${r}`), cs({
          size: 10, color: C.muted,
          fill,
          align: { horizontal: 'left', vertical: 'middle', indent: 1 },
          wrap: true,
        }));

        // Thành tiền
        ws.getCell(`G${r}`).value = line.value || '—';
        if (line.value && line.value !== '—') {
          // Parse raw amount from the formatted string for proper number
          const rawAmt = (loc.calculationBreakdown as readonly CalculationBreakdownLine[])[li];
          ws.getCell(`G${r}`).numFmt = '#,##0" đ"';
        }
        Object.assign(ws.getCell(`G${r}`), cs({
          bold: true, size: 11, color: C.accent,
          fill,
          align: { horizontal: 'right', vertical: 'middle' },
        }));

        ws.getRow(r).height = 18; r++;
      });

      // Reset column widths for next location
      ws.columns = [
        { width: 3 },
        { width: 26 },
        { width: 50 },
        { width: 16 },
        { width: 16 },
      ];
    }

    r += 2; // spacer between location blocks
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * SHEET 3 — Thông tin & căn cứ
 * Audit/reference only — not a duplicate broken summary
 * ───────────────────────────────────────────────────────────────────────── */
function buildBasisSheet(ws: ExcelJS.Worksheet, snap: CalculationSnapshot) {
  ws.pageSetup = {
    orientation: 'portrait',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printErrors: false,
    margins: { left: 0.7, right: 0.7, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 },
  };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

  // Adequate column widths
  ws.columns = [
    { width: 3 },  // A
    { width: 36 }, // B  — label
    { width: 56 }, // C  — value (wrap text)
  ];

  let r = 2;

  // ── Heading ────────────────────────────────────────────────────
  ws.mergeCells(`B${r}:C${r}`);
  ws.getCell(`B${r}`).value = 'THÔNG TIN & CĂN CỨ';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 14, color: C.navy,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: false,
  }));
  ws.getRow(r).height = 26; r++;

  ws.mergeCells(`B${r}:C${r}`);
  ws.getCell(`B${r}`).value = `Bảng tính: ${snap.calculationCode || '—'}  ·  Đơn vị: ${snap.legalEntityName || '—'}`;
  Object.assign(ws.getCell(`B${r}`), cs({
    italic: true, size: 10, color: C.muted,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: false,
  }));
  ws.getRow(r).height = 16; r++;

  r++; // blank

  // ── I. Thông tin đơn vị ────────────────────────────────────────
  ws.mergeCells(`B${r}:C${r}`);
  ws.getCell(`B${r}`).value = 'I. THÔNG TIN ĐƠN VỊ';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.white,
    fill: C.sectionBg,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  }));
  ws.getRow(r).height = 20; r++;

  const unitRows: Array<[string, string]> = [
    ['Tên đơn vị / pháp nhân', notDeclared(snap.legalEntityName)],
    ['Địa chỉ pháp lý', notDeclared(snap.customerAddress)],
    ['Người đại diện', notDeclared(snap.customerRepresentative)],
    ['Số tham chiếu / hợp đồng', snap.contractReference || '—'],
  ];
  for (const [label, value] of unitRows) {
    ws.getCell(`B${r}`).value = label;
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true, size: 11, color: C.navyLight,
      fill: C.cream,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }));
    ws.getCell(`C${r}`).value = value;
    Object.assign(ws.getCell(`C${r}`), cs({
      size: 11, color: C.text,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      wrap: true,
    }));
    ws.getRow(r).height = 18; r++;
  }

  r++;

  // ── II. Thông tin tính toán ────────────────────────────────────
  ws.mergeCells(`B${r}:C${r}`);
  ws.getCell(`B${r}`).value = 'II. THÔNG TIN TÍNH TOÁN';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.white,
    fill: C.sectionBg,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  }));
  ws.getRow(r).height = 20; r++;

  const calcRows: Array<[string, string]> = [
    ['Ngày lập bảng tính', snap.createdAtDisplay || '—'],
    ['Số khu vực / địa điểm', String(snap.locationCount ?? snap.locations.length)],
    ['Mức lương cơ sở (MLCS)', snap.baseSalaryDisplay || '—'],
    ['Hệ số hỗ trợ', snap.verificationStatus === 'review_required' ? 'Cần rà soát' : '—'],
    ['Thuế GTGT', '8%'],
  ];
  for (const [label, value] of calcRows) {
    ws.getCell(`B${r}`).value = label;
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true, size: 11, color: C.navyLight,
      fill: C.cream,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }));
    ws.getCell(`C${r}`).value = value;
    Object.assign(ws.getCell(`C${r}`), cs({
      size: 11, color: C.text,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      wrap: true,
    }));
    ws.getRow(r).height = 18; r++;
  }

  r++;

  // ── III. Căn cứ pháp lý ────────────────────────────────────────
  ws.mergeCells(`B${r}:C${r}`);
  ws.getCell(`B${r}`).value = 'III. CĂN CỨ PHÁP LÝ';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.white,
    fill: C.sectionBg,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  }));
  ws.getRow(r).height = 20; r++;

  const basisRows: Array<[string, string]> = [
    ['Căn cứ tính toán', snap.legalBasis || 'Phụ lục biểu mức tiền bản quyền — Nghị định 17/2023/NĐ-CP ngày 26/4/2023'],
    ['Điều khoản', snap.legalArticle || '—'],
    ['MLCS (căn cứ Nghị định 17/2023/NĐ-CP)', snap.baseSalaryDisplay || '2.530.000 đồng/tháng'],
    ['Có hiệu lực từ', snap.effectiveFrom || '—'],
  ];
  for (const [label, value] of basisRows) {
    ws.getCell(`B${r}`).value = label;
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true, size: 11, color: C.navyLight,
      fill: C.cream,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }));
    ws.getCell(`C${r}`).value = value;
    Object.assign(ws.getCell(`C${r}`), cs({
      size: 11, color: C.text,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      wrap: true,
    }));
    ws.getRow(r).height = 18; r++;
  }

  r++;

  // ── IV. Trạng thái xác nhận ────────────────────────────────────
  ws.mergeCells(`B${r}:C${r}`);
  ws.getCell(`B${r}`).value = 'IV. TRẠNG THÁI XÁC NHẬN';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.white,
    fill: C.sectionBg,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  }));
  ws.getRow(r).height = 20; r++;

  const isConfirmed = snap.verificationStatus === 'confirmed';
  const statusLabel = isConfirmed
    ? 'Đã xác nhận — Số liệu được hệ thống xác nhận'
    : 'Cần rà soát — Vui lòng kiểm tra trước khi sử dụng';

  ws.getCell(`B${r}`).value = 'Trạng thái';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.navyLight,
    fill: C.cream,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  }));
  ws.getCell(`C${r}`).value = statusLabel;
  Object.assign(ws.getCell(`C${r}`), cs({
    bold: true,
    size: 11,
    color: isConfirmed ? C.accent : '#B45309',
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    wrap: true,
  }));
  ws.getRow(r).height = 18; r++;

  ws.getCell(`B${r}`).value = 'Người lập';
  Object.assign(ws.getCell(`B${r}`), cs({
    bold: true, size: 11, color: C.navyLight,
    fill: C.cream,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  }));
  ws.getCell(`C${r}`).value = snap.createdBy || '—';
  Object.assign(ws.getCell(`C${r}`), cs({
    size: 11, color: C.text,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    wrap: true,
  }));
  ws.getRow(r).height = 18; r++;

  // ── V. Danh sách khu vực audit ────────────────────────────────
  if (snap.locations.length > 0) {
    r++;
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`B${r}`).value = 'V. DANH SÁCH KHU VỰC / ĐỊA ĐIỂM TRONG BẢNG TÍNH';
    Object.assign(ws.getCell(`B${r}`), cs({
      bold: true, size: 11, color: C.white,
      fill: C.sectionBg,
      align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    }));
    ws.getRow(r).height = 20; r++;

    const auditHeaders = [
      { label: 'STT',                          align: 'center' as const },
      { label: 'Tên hiển thị',                  align: 'left'   as const },
      { label: 'Loại hình',                     align: 'left'   as const },
      { label: 'Tiền bản quyền trước Thuế GTGT', align: 'right' as const },
    ];
    for (let ci = 0; ci < auditHeaders.length; ci++) {
      const col = String.fromCharCode('B'.charCodeAt(0) + ci);
      ws.getCell(`${col}${r}`).value = auditHeaders[ci].label;
      Object.assign(ws.getCell(`${col}${r}`), cs({
        bold: true, size: 10, color: C.white,
        fill: C.navyLight,
        align: { horizontal: auditHeaders[ci].align, vertical: 'middle', indent: 1 },
      }));
    }
    ws.getRow(r).height = 18; r++;

    snap.locations.forEach((loc, i) => {
      const isAlt = i % 2 === 1;
      const fill = isAlt ? C.rowAlt : undefined;
      ws.getCell(`B${r}`).value = String(i + 1);
      Object.assign(ws.getCell(`B${r}`), cs({
        size: 10, color: C.muted,
        fill,
        align: { horizontal: 'center', vertical: 'middle' },
      }));
      ws.getCell(`C${r}`).value = loc.displayName?.trim() || loc.actualLocationName;
      Object.assign(ws.getCell(`C${r}`), cs({
        size: 11, color: C.text,
        fill,
        align: { horizontal: 'left', vertical: 'middle', indent: 1 },
        wrap: true,
      }));
      ws.getCell(`D${r}`).value = loc.domainLabel || '—';
      Object.assign(ws.getCell(`D${r}`), cs({
        size: 11, color: C.text,
        fill,
        align: { horizontal: 'left', vertical: 'middle', indent: 1 },
      }));
      ws.getCell(`E${r}`).value = `${vnd(loc.royaltyBeforeVatRaw)} đ`;
      ws.getCell(`E${r}`).numFmt = '#,##0" đ"';
      Object.assign(ws.getCell(`E${r}`).font = {}, cs({
        bold: true, size: 11, color: C.text,
        fill,
        align: { horizontal: 'right', vertical: 'middle' },
      }));
      ws.getRow(r).height = 18; r++;
    });
  }
}
