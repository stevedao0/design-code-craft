/**
 * Sinh file .xlsx "Báo cáo danh sách hợp đồng đã ký" cho trang Báo cáo.
 *
 * File Excel dùng đúng ngôn ngữ thiết kế của app (xem workbookTheme.ts):
 * letterhead VCPMC, dải thẻ KPI, thanh tiến độ, badge trạng thái theo tông màu UI.
 *
 * NGUYÊN TẮC: không tính lại tiền — mọi con số lấy nguyên từ dữ liệu backend,
 * phần cộng dồn dùng công thức Excel (SUM) để file còn "sống" khi lọc/sửa.
 */
import ExcelJS from 'exceljs';
import { VCPMC, VCPMC_HEAD_CONTACT_LINE, VCPMC_SOUTH_CONTACT_LINE } from '@/lib/calculations/vcpmcIdentity';
import type { ContractListItem } from '@/components/reports/types';
import {
  WB, WB_FONT, WB_FMT, wbBarText, wbBox, wbContractStateTone, wbPageSetup,
  wbSafeName, wbStyle, wbToneColors,
} from './workbookTheme';
import type { WbAlign, WbStyleOpts } from './workbookTheme';

const MONEY = WB_FMT.money;
const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];

function fmtDate(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('vi-VN');
}

export interface ContractReportFieldRow {
  label: string;
  target: number | null;
  actual: number | null;
  contractCount: number | null;
}

export interface ContractReportPayload {
  /** Tiêu đề chính, ví dụ "Báo cáo danh sách hợp đồng đã ký" */
  title: string;
  /** Mô tả kỳ báo cáo đã chọn, ví dụ "Tháng 7/2026 (01/07/2026 – 31/07/2026)" */
  periodLabel: string;
  /** Mô tả phạm vi dữ liệu, ví dụ "Toàn đơn vị" */
  scopeLabel: string;
  /** Người thực hiện / chủ sở hữu dữ liệu (nếu có) */
  ownerLabel?: string;
  year: number;
  items: ContractListItem[];
  /** Phân rã KPI theo lĩnh vực (lấy nguyên từ backend, không tính lại) */
  fields?: ContractReportFieldRow[];
  includeValues?: boolean;
}

export function contractListWorkbookFilename(payload: ContractReportPayload): string {
  const d = new Date().toISOString().slice(0, 10);
  return `BaoCao-HopDong-${wbSafeName(payload.periodLabel)}-${d}.xlsx`;
}

// ── Khối dựng hình dùng chung ────────────────────────────────────────────

function letterhead(ws: ExcelJS.Worksheet, lastCol: string, title: string, payload: ContractReportPayload): number {
  let r = 1;
  const span = (row: number) => `A${row}:${lastCol}${row}`;

  ws.mergeCells(span(r));
  wbStyle(ws.getCell(`A${r}`), { bold: true, size: 12, color: WB.green, align: 'center', border: false });
  ws.getCell(`A${r}`).value = VCPMC.fullName;
  r++;

  for (const line of [VCPMC_HEAD_CONTACT_LINE, VCPMC_SOUTH_CONTACT_LINE]) {
    ws.mergeCells(span(r));
    wbStyle(ws.getCell(`A${r}`), { italic: true, size: 8.5, color: WB.muted, align: 'center', border: false, wrap: true });
    ws.getCell(`A${r}`).value = line;
    ws.getRow(r).height = 22;
    r++;
  }

  // Đường kẻ thương hiệu (thay cho hairline dưới PageHeader trên UI)
  ws.mergeCells(span(r));
  const rule = ws.getCell(`A${r}`);
  wbStyle(rule, { border: false, fill: WB.green });
  ws.getRow(r).height = 3;
  r += 2;

  ws.mergeCells(span(r));
  wbStyle(ws.getCell(`A${r}`), { bold: true, size: 15, color: WB.green, align: 'center', border: false });
  ws.getCell(`A${r}`).value = title.toUpperCase();
  ws.getRow(r).height = 24;
  r++;

  ws.mergeCells(span(r));
  wbStyle(ws.getCell(`A${r}`), { italic: true, size: 10, color: WB.muted, align: 'center', border: false });
  ws.getCell(`A${r}`).value = `Kỳ báo cáo: ${payload.periodLabel} · ${payload.scopeLabel}`
    + (payload.ownerLabel ? ` · Người thực hiện: ${payload.ownerLabel}` : '');
  r++;

  ws.mergeCells(span(r));
  wbStyle(ws.getCell(`A${r}`), { italic: true, size: 9, color: WB.muted, align: 'center', border: false });
  ws.getCell(`A${r}`).value = `Ngày xuất: ${new Date().toLocaleString('vi-VN')}`;
  r += 2;
  return r;
}

/** Dải thẻ số lớn — mô phỏng StatTile trên giao diện. */
function statTiles(
  ws: ExcelJS.Worksheet,
  row: number,
  tiles: Array<{ label: string; value: number | string; sub?: string; numFmt?: string; brand?: boolean }>,
  colsPerTile: number,
): number {
  ws.getRow(row).height = 16;
  ws.getRow(row + 1).height = 24;
  ws.getRow(row + 2).height = 14;

  tiles.forEach((t, i) => {
    const c1 = i * colsPerTile + 1;
    const c2 = c1 + colsPerTile - 1;
    const fill = t.brand ? WB.greenTile : WB.band;
    const border = wbBox(t.brand ? WB.rule : WB.hair);

    ws.mergeCells(row, c1, row, c2);
    const label = ws.getCell(row, c1);
    label.value = t.label.toUpperCase();
    wbStyle(label, { size: 8.5, bold: true, color: WB.muted, fill, align: 'left', border, indent: 1 });

    ws.mergeCells(row + 1, c1, row + 1, c2);
    const value = ws.getCell(row + 1, c1);
    value.value = t.value as ExcelJS.CellValue;
    wbStyle(value, {
      size: 14, bold: true, color: t.brand ? WB.green : WB.ink, fill,
      align: 'left', border, numFmt: t.numFmt, indent: 1,
    });

    ws.mergeCells(row + 2, c1, row + 2, c2);
    const sub = ws.getCell(row + 2, c1);
    sub.value = t.sub ?? '';
    wbStyle(sub, { size: 8.5, italic: true, color: WB.muted, fill, align: 'left', border, indent: 1 });

    // chừa 1 cột trống làm khe giữa các thẻ
    for (let c = c1; c <= c2; c++) {
      ws.getCell(row, c).border = ws.getCell(row, c1).border;
    }
  });
  return row + 4;
}

function sectionTitle(ws: ExcelJS.Worksheet, row: number, lastCol: string, text: string, hint?: string): number {
  ws.mergeCells(`A${row}:${lastCol}${row}`);
  wbStyle(ws.getCell(`A${row}`), { bold: true, size: 11, color: WB.green, border: false });
  ws.getCell(`A${row}`).value = text.toUpperCase();
  row++;
  if (hint) {
    ws.mergeCells(`A${row}:${lastCol}${row}`);
    wbStyle(ws.getCell(`A${row}`), { italic: true, size: 8.5, color: WB.muted, border: false });
    ws.getCell(`A${row}`).value = hint;
    row++;
  }
  return row;
}

function tableHeader(
  ws: ExcelJS.Worksheet,
  row: number,
  cols: Array<{ header: string; align: WbAlign }>,
): number {
  cols.forEach((c, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = c.header;
    wbStyle(cell, {
      bold: true, size: 10, color: WB.headText, fill: WB.green,
      align: c.align, wrap: true, border: wbBox(WB.rule),
    });
  });
  ws.getRow(row).height = 26;
  return row + 1;
}

// ── Generator ────────────────────────────────────────────────────────────

export async function generateContractListWorkbook(payload: ContractReportPayload): Promise<Blob> {
  const showMoney = payload.includeValues !== false;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCPMC';
  wb.created = new Date();
  wb.title = payload.title;

  const footer =
    `&L&"${WB_FONT},Italic"&8${VCPMC.shortName} · Báo cáo hợp đồng ${payload.year}`
    + `&C&"${WB_FONT},Italic"&8${VCPMC.email} · ${VCPMC.website}`
    + `&R&"${WB_FONT},Italic"&8Trang &P/&N`;

  const items = payload.items;
  const valued = items.filter(i => (i.total_payment ?? i.royalty_amount_before_vat) != null);
  const pending = items.filter(i => (i.total_payment ?? i.royalty_amount_before_vat) == null);
  const totalRevenue = items.reduce((s, i) => s + (i.royalty_amount_before_vat ?? 0), 0);
  const totalContractValue = valued.reduce((s, i) => s + (i.total_payment ?? 0), 0);

  // ══ Sheet 1: Tổng hợp ═══════════════════════════════════════════════
  const sum = wb.addWorksheet('Tổng hợp', {
    pageSetup: wbPageSetup({ orientation: 'portrait' }),
    views: [{ showGridLines: false }],
  });
  sum.columns = [
    { width: 4 }, { width: 26 }, { width: 11 }, { width: 17 },
    { width: 17 }, { width: 10 }, { width: 24 },
  ];
  sum.headerFooter = { oddFooter: footer, evenFooter: footer };

  let r = letterhead(sum, 'G', payload.title, payload);

  // Dải thẻ KPI (2 hàng × 2 thẻ để vừa khổ dọc)
  r = statTiles(sum, r, [
    { label: 'Tổng hợp đồng', value: items.length, numFmt: WB_FMT.int, brand: true,
      sub: `${valued.length} có giá trị · ${pending.length} chưa nhập tiền` },
    ...(showMoney ? [{
      label: 'Doanh thu chưa Thuế GTGT (VNĐ)', value: totalRevenue, numFmt: MONEY, brand: true,
      sub: 'Cộng từ dữ liệu hệ thống, không tính lại',
    }] : []),
  ], showMoney ? 3 : 7);

  if (showMoney) {
    r = statTiles(sum, r, [
      { label: 'Tổng giá trị HĐ sau Thuế GTGT (VNĐ)', value: totalContractValue, numFmt: MONEY,
        sub: `Chỉ tính ${valued.length} hợp đồng đã có giá trị` },
      { label: 'Hợp đồng chưa có doanh thu', value: pending.length, numFmt: WB_FMT.int,
        sub: 'Bản soạn sẵn — xem sheet riêng' },
    ], 3);
  }

  // Phân rã theo lĩnh vực + thanh tiến độ
  if (payload.fields && payload.fields.length > 0) {
    r = sectionTitle(sum, r, 'G', 'Phân rã theo lĩnh vực',
      'Tiến độ = Thực đạt / Mục tiêu (chỉ hiện khi lĩnh vực đã được giao KPI)');

    const fCols: Array<{ header: string; align: WbAlign }> = [
      { header: 'STT', align: 'center' },
      { header: 'Lĩnh vực', align: 'left' },
      { header: 'Số HĐ', align: 'right' },
      { header: 'Mục tiêu (VNĐ)', align: 'right' },
      { header: 'Thực đạt (VNĐ)', align: 'right' },
      { header: 'Tiến độ', align: 'right' },
      { header: 'Biểu đồ tiến độ', align: 'left' },
    ];
    const headRow = r;
    r = tableHeader(sum, r, fCols);
    const first = r;

    payload.fields.forEach((f, idx) => {
      const zebra = idx % 2 === 1 ? WB.band : undefined;
      const target = f.target ?? 0;
      const actual = f.actual ?? 0;
      const ratio = target > 0 ? actual / target : 0;

      const cells: Array<[number, ExcelJS.CellValue, WbStyleOpts]> = [
        [1, idx + 1, { align: 'center' }],
        [2, f.label, {}],
        [3, f.contractCount ?? 0, { align: 'right', numFmt: WB_FMT.int }],
        [4, showMoney ? target : '', { align: 'right', numFmt: MONEY }],
        [5, showMoney ? actual : '', { align: 'right', numFmt: MONEY }],
        [6, showMoney ? { formula: `IF(D${r}=0,"",E${r}/D${r})` } : '', { align: 'right', numFmt: WB_FMT.percent }],
        [7, showMoney && target > 0 ? wbBarText(ratio) : '', { align: 'left', color: WB.green }],
      ];
      cells.forEach(([col, value, o]) => {
        const cell = sum.getCell(r, col);
        cell.value = value;
        wbStyle(cell, { size: 10, fill: zebra, ...o });
      });
      r++;
    });

    const last = r - 1;
    for (let i = 1; i <= fCols.length; i++) {
      wbStyle(sum.getCell(r, i), {
        bold: true, size: 10.5, fill: WB.total,
        align: fCols[i - 1].align, border: wbBox(WB.rule),
      });
    }
    sum.mergeCells(r, 1, r, 2);
    sum.getCell(r, 1).value = 'CỘNG';
    sum.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sum.getCell(`C${r}`).value = { formula: `SUM(C${first}:C${last})` };
    sum.getCell(`C${r}`).numFmt = WB_FMT.int;
    if (showMoney) {
      sum.getCell(`D${r}`).value = { formula: `SUM(D${first}:D${last})` };
      sum.getCell(`D${r}`).numFmt = MONEY;
      sum.getCell(`E${r}`).value = { formula: `SUM(E${first}:E${last})` };
      sum.getCell(`E${r}`).numFmt = MONEY;
      sum.getCell(`F${r}`).value = { formula: `IF(D${r}=0,"",E${r}/D${r})` };
      sum.getCell(`F${r}`).numFmt = WB_FMT.percent;
    }

    // Data bar cho cột Thực đạt — tương ứng thanh % trên UI
    if (showMoney && last >= first) {
      sum.addConditionalFormatting({
        ref: `E${first}:E${last}`,
        rules: [{
          type: 'dataBar', priority: 1, minLength: 0, maxLength: 100,
          gradient: false, color: { argb: WB.green }, showValue: true,
          border: false, negativeBarColorSameAsPositive: true,
          negativeBarBorderColorSameAsPositive: true,
          axisPosition: 'none', direction: 'leftToRight',
          cfvo: [{ type: 'min' }, { type: 'max' }],
        } as unknown as Parameters<ExcelJS.Worksheet["addConditionalFormatting"]>[0]["rules"][number]],
      });
    }
    r += 2;
  }

  // Doanh thu theo tháng — bảng + thanh trực quan (thay biểu đồ)
  if (showMoney) {
    const byMonth = MONTH_LABELS.map((label, i) => {
      const rows = items.filter(it => it.signed_date && new Date(it.signed_date).getMonth() === i);
      return {
        label,
        count: rows.length,
        actual: rows.reduce((s, it) => s + (it.royalty_amount_before_vat ?? 0), 0),
      };
    });
    const peak = Math.max(1, ...byMonth.map(m => m.actual));

    r = sectionTitle(sum, r, 'G', `Doanh thu chưa Thuế GTGT theo tháng · ${payload.year}`);
    const mCols: Array<{ header: string; align: WbAlign }> = [
      { header: 'Tháng', align: 'center' },
      { header: 'Số HĐ', align: 'right' },
      { header: 'Doanh thu (VNĐ)', align: 'right' },
      { header: 'Tỷ trọng', align: 'right' },
      { header: 'Biểu đồ', align: 'left' },
    ];
    // gộp về 5 cột đầu
    mCols.forEach((c, i) => {
      const cell = sum.getCell(r, i + 1);
      cell.value = c.header;
      wbStyle(cell, { bold: true, size: 10, color: WB.headText, fill: WB.green, align: c.align, border: wbBox(WB.rule) });
    });
    sum.mergeCells(r, 5, r, 7);
    const mHead = r;
    r++;
    const mFirst = r;
    byMonth.forEach((m, idx) => {
      const zebra = idx % 2 === 1 ? WB.band : undefined;
      sum.getCell(r, 1).value = m.label;
      wbStyle(sum.getCell(r, 1), { size: 10, align: 'center', fill: zebra });
      sum.getCell(r, 2).value = m.count;
      wbStyle(sum.getCell(r, 2), { size: 10, align: 'right', numFmt: WB_FMT.int, fill: zebra });
      sum.getCell(r, 3).value = m.actual;
      wbStyle(sum.getCell(r, 3), { size: 10, align: 'right', numFmt: MONEY, fill: zebra });
      sum.getCell(r, 4).value = { formula: `IF($C$${mFirst + 12}=0,"",C${r}/$C$${mFirst + 12})` };
      wbStyle(sum.getCell(r, 4), { size: 10, align: 'right', numFmt: WB_FMT.percent, fill: zebra });
      sum.mergeCells(r, 5, r, 7);
      sum.getCell(r, 5).value = wbBarText(m.actual / peak, 24);
      wbStyle(sum.getCell(r, 5), { size: 10, align: 'left', color: WB.green, fill: zebra });
      r++;
    });
    const mLast = r - 1;
    for (let i = 1; i <= 4; i++) {
      wbStyle(sum.getCell(r, i), { bold: true, size: 10, fill: WB.total, align: i === 1 ? 'left' : 'right', border: wbBox(WB.rule) });
    }
    sum.getCell(r, 1).value = 'CỘNG';
    sum.getCell(r, 2).value = { formula: `SUM(B${mFirst}:B${mLast})` };
    sum.getCell(r, 2).numFmt = WB_FMT.int;
    sum.getCell(r, 3).value = { formula: `SUM(C${mFirst}:C${mLast})` };
    sum.getCell(r, 3).numFmt = MONEY;
    sum.mergeCells(r, 5, r, 7);
    wbStyle(sum.getCell(r, 5), { fill: WB.total, border: wbBox(WB.rule) });
    void mHead;
    r += 2;
  }

  sum.mergeCells(`A${r}:G${r}`);
  wbStyle(sum.getCell(`A${r}`), { italic: true, size: 9, color: WB.muted, border: false, wrap: true });
  sum.getCell(`A${r}`).value =
    'Ghi chú: số liệu lấy trực tiếp từ hệ thống quản lý hợp đồng VCPMC, không tính lại tại file này. '
    + 'Hợp đồng chưa có doanh thu (bản soạn sẵn/chưa chốt giá trị) được tách sang sheet riêng và không tính vào tổng doanh thu.';
  sum.getRow(r).height = 30;
  sum.pageSetup.printArea = `A1:G${r}`;

  // ══ Sheet 2: Danh sách hợp đồng ═════════════════════════════════════
  const list = wb.addWorksheet('Danh sách hợp đồng', { pageSetup: wbPageSetup(), views: [{ showGridLines: false }] });
  list.headerFooter = { oddFooter: footer, evenFooter: footer };
  const cols: Array<{ header: string; width: number; align: WbAlign }> = [
    { header: 'STT', width: 6, align: 'center' },
    { header: 'Số HĐ', width: 24, align: 'left' },
    { header: 'Đơn vị', width: 34, align: 'left' },
    { header: 'Lĩnh vực', width: 16, align: 'left' },
    { header: 'Người thực hiện', width: 24, align: 'left' },
    { header: 'Ngày ký', width: 12, align: 'center' },
    { header: 'Ngày bắt đầu', width: 12, align: 'center' },
    { header: 'Ngày kết thúc', width: 12, align: 'center' },
    ...(showMoney ? [
      { header: 'Doanh thu chưa Thuế GTGT (VNĐ)', width: 18, align: 'right' as WbAlign },
      { header: 'Tổng giá trị HĐ (VNĐ)', width: 18, align: 'right' as WbAlign },
    ] : []),
    { header: 'Loại ký', width: 13, align: 'left' },
    { header: 'Trạng thái', width: 15, align: 'left' },
    { header: 'GCN', width: 18, align: 'left' },
  ];
  list.columns = cols.map(c => ({ width: c.width }));
  const lastColLetter = String.fromCharCode(64 + cols.length);
  const stateIdx = cols.findIndex(c => c.header === 'Trạng thái');

  let lr = letterhead(list, lastColLetter, payload.title, payload);
  const headerRow = lr;
  lr = tableHeader(list, lr, cols);

  const firstData = lr;
  items.forEach((it, idx) => {
    const zebra = idx % 2 === 1 ? WB.band : undefined;
    const beforeVat = it.royalty_amount_before_vat;
    const total = it.total_payment ?? it.royalty_amount_before_vat;
    const values: Array<string | number | null> = [
      idx + 1,
      it.contract_number,
      it.organization_name,
      it.field,
      it.owner_name ?? it.owner_email ?? '',
      fmtDate(it.signed_date),
      fmtDate(it.start_date),
      fmtDate(it.end_date),
      ...(showMoney ? [beforeVat ?? null, total ?? null] : []),
      it.signing_bucket_label || it.signing_bucket,
      it.contract_state,
      it.gcn_number ?? '',
    ];
    values.forEach((v, i) => {
      const cell = list.getCell(lr, i + 1);
      const isMoney = showMoney && (i === 8 || i === 9);
      cell.value = v == null && isMoney ? null : (v as ExcelJS.CellValue);
      const isState = i === stateIdx;
      const tone = isState ? wbToneColors(wbContractStateTone(it.contract_state)) : null;
      wbStyle(cell, {
        size: 9.5,
        fill: tone ? tone.fill : zebra,
        align: cols[i].align,
        wrap: i === 2,
        bold: isState,
        numFmt: isMoney ? MONEY : undefined,
        color: tone ? tone.color : (v == null && isMoney ? WB.warning : undefined),
      });
    });
    lr++;
  });
  const lastData = lr - 1;

  if (items.length > 0) {
    cols.forEach((c, i) => {
      wbStyle(list.getCell(lr, i + 1), { bold: true, size: 10, fill: WB.total, align: c.align, border: wbBox(WB.rule) });
    });
    list.mergeCells(lr, 1, lr, 3);
    list.getCell(lr, 1).value = `CỘNG · ${items.length} hợp đồng`;
    list.getCell(lr, 1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    if (showMoney) {
      const c9 = list.getCell(lr, 9);
      c9.value = { formula: `SUM(I${firstData}:I${lastData})` };
      c9.numFmt = MONEY;
      const c10 = list.getCell(lr, 10);
      c10.value = { formula: `SUM(J${firstData}:J${lastData})` };
      c10.numFmt = MONEY;
    }
  }

  list.views = [{ state: 'frozen', xSplit: 2, ySplit: headerRow, showGridLines: false }];
  list.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: Math.max(headerRow, lastData), column: cols.length } };
  list.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  list.pageSetup.printArea = `A1:${lastColLetter}${lr}`;

  // ══ Sheet 3: Phân loại & tái ký ═════════════════════════════════════
  const cls = wb.addWorksheet('Phân loại & tái ký', {
    pageSetup: wbPageSetup({ orientation: 'portrait' }),
    views: [{ showGridLines: false }],
  });
  cls.columns = [{ width: 4 }, { width: 30 }, { width: 12 }, { width: 20 }, { width: 12 }, { width: 28 }];
  cls.headerFooter = { oddFooter: footer, evenFooter: footer };
  let cr = letterhead(cls, 'F', 'Phân loại ký & tình trạng tái ký', payload);

  const buckets = new Map<string, { count: number; actual: number }>();
  items.forEach(it => {
    const key = it.signing_bucket_label || it.signing_bucket || 'Chưa xác định';
    const cur = buckets.get(key) ?? { count: 0, actual: 0 };
    cur.count += 1;
    cur.actual += it.royalty_amount_before_vat ?? 0;
    buckets.set(key, cur);
  });

  cr = sectionTitle(cls, cr, 'F', 'Phân loại theo hình thức ký');
  const bCols: Array<{ header: string; align: WbAlign }> = [
    { header: 'STT', align: 'center' },
    { header: 'Hình thức ký', align: 'left' },
    { header: 'Số HĐ', align: 'right' },
    { header: 'Doanh thu chưa Thuế GTGT', align: 'right' },
    { header: 'Tỷ trọng', align: 'right' },
    { header: 'Biểu đồ', align: 'left' },
  ];
  cr = tableHeader(cls, cr, bCols);
  const bFirst = cr;
  const bucketRows = Array.from(buckets.entries());
  const bucketPeak = Math.max(1, ...bucketRows.map(([, v]) => v.count));
  bucketRows.forEach(([label, v], idx) => {
    const zebra = idx % 2 === 1 ? WB.band : undefined;
    const row: Array<[number, ExcelJS.CellValue, WbStyleOpts]> = [
      [1, idx + 1, { align: 'center' }],
      [2, label, {}],
      [3, v.count, { align: 'right', numFmt: WB_FMT.int }],
      [4, showMoney ? v.actual : '', { align: 'right', numFmt: MONEY }],
      [5, { formula: `IF(${items.length}=0,"",C${cr}/${items.length})` }, { align: 'right', numFmt: WB_FMT.percent }],
      [6, wbBarText(v.count / bucketPeak, 18), { align: 'left', color: WB.plum }],
    ];
    row.forEach(([col, value, o]) => {
      const cell = cls.getCell(cr, col);
      cell.value = value;
      wbStyle(cell, { size: 10, fill: zebra, ...o });
    });
    cr++;
  });
  const bLast = cr - 1;
  for (let i = 1; i <= bCols.length; i++) {
    wbStyle(cls.getCell(cr, i), { bold: true, size: 10, fill: WB.total, align: bCols[i - 1].align, border: wbBox(WB.rule) });
  }
  cls.mergeCells(cr, 1, cr, 2);
  cls.getCell(cr, 1).value = 'CỘNG';
  cls.getCell(cr, 1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  if (bLast >= bFirst) {
    cls.getCell(`C${cr}`).value = { formula: `SUM(C${bFirst}:C${bLast})` };
    cls.getCell(`C${cr}`).numFmt = WB_FMT.int;
    if (showMoney) {
      cls.getCell(`D${cr}`).value = { formula: `SUM(D${bFirst}:D${bLast})` };
      cls.getCell(`D${cr}`).numFmt = MONEY;
    }
  }
  cr += 2;

  // Hợp đồng sắp hết hạn / đã hết hạn trong danh sách
  const expiring = items
    .filter(it => it.days_to_expiry != null)
    .sort((a, b) => (a.days_to_expiry ?? 0) - (b.days_to_expiry ?? 0))
    .slice(0, 100);

  cr = sectionTitle(cls, cr, 'F', 'Theo dõi tái ký & hết hạn',
    'Sắp xếp theo số ngày còn lại; âm nghĩa là đã quá hạn.');
  const eCols: Array<{ header: string; align: WbAlign }> = [
    { header: 'STT', align: 'center' },
    { header: 'Đơn vị', align: 'left' },
    { header: 'Số HĐ', align: 'left' },
    { header: 'Ngày kết thúc', align: 'center' },
    { header: 'Còn lại (ngày)', align: 'right' },
    { header: 'Tình trạng', align: 'left' },
  ];
  cr = tableHeader(cls, cr, eCols);
  if (expiring.length === 0) {
    cls.mergeCells(`A${cr}:F${cr}`);
    wbStyle(cls.getCell(`A${cr}`), { italic: true, size: 10, color: WB.muted, align: 'center' });
    cls.getCell(`A${cr}`).value = 'Không có hợp đồng nào có thông tin ngày hết hạn trong kỳ báo cáo.';
    cr++;
  } else {
    expiring.forEach((it, idx) => {
      const zebra = idx % 2 === 1 ? WB.band : undefined;
      const days = it.days_to_expiry ?? 0;
      const tone = days < 0 ? 'danger' : days <= 30 ? 'warning' : 'success';
      const toneColors = wbToneColors(tone);
      const label = days < 0 ? 'Đã quá hạn' : days <= 30 ? 'Sắp hết hạn' : 'Còn hiệu lực';
      const row: Array<[number, ExcelJS.CellValue, WbStyleOpts]> = [
        [1, idx + 1, { align: 'center' }],
        [2, it.organization_name, { wrap: true }],
        [3, it.contract_number, {}],
        [4, fmtDate(it.end_date), { align: 'center' }],
        [5, days, { align: 'right', numFmt: '#,##0' }],
        [6, label, { align: 'left', bold: true, color: toneColors.color, fill: toneColors.fill }],
      ];
      row.forEach(([col, value, o]) => {
        const cell = cls.getCell(cr, col);
        cell.value = value;
        wbStyle(cell, { size: 9.5, fill: zebra, ...o });
      });
      cr++;
    });
  }
  cls.pageSetup.printArea = `A1:F${cr}`;

  // ══ Sheet 4: Chưa có doanh thu ══════════════════════════════════════
  const draft = wb.addWorksheet('Chưa có doanh thu', { pageSetup: wbPageSetup(), views: [{ showGridLines: false }] });
  draft.headerFooter = { oddFooter: footer, evenFooter: footer };
  const dCols: Array<{ header: string; width: number; align: WbAlign }> = [
    { header: 'STT', width: 6, align: 'center' },
    { header: 'Số HĐ', width: 24, align: 'left' },
    { header: 'Đơn vị', width: 36, align: 'left' },
    { header: 'Lĩnh vực', width: 16, align: 'left' },
    { header: 'Người thực hiện', width: 24, align: 'left' },
    { header: 'Ngày ký', width: 12, align: 'center' },
    { header: 'Trạng thái', width: 15, align: 'left' },
    { header: 'Lý do chưa có doanh thu', width: 32, align: 'left' },
  ];
  draft.columns = dCols.map(c => ({ width: c.width }));
  let dr = letterhead(draft, 'H', 'Hợp đồng chưa có doanh thu (bản soạn sẵn)', payload);
  const dHead = dr;
  dr = tableHeader(draft, dr, dCols);

  if (pending.length === 0) {
    draft.mergeCells(`A${dr}:H${dr}`);
    wbStyle(draft.getCell(`A${dr}`), { italic: true, size: 10, color: WB.muted, align: 'center' });
    draft.getCell(`A${dr}`).value = 'Không có hợp đồng nào thiếu dữ liệu doanh thu trong kỳ báo cáo.';
    dr++;
  } else {
    pending.forEach((it, idx) => {
      const zebra = idx % 2 === 1 ? WB.band : undefined;
      const values = [
        idx + 1,
        it.contract_number,
        it.organization_name,
        it.field,
        it.owner_name ?? it.owner_email ?? '',
        fmtDate(it.signed_date),
        it.contract_state,
        'Chưa chốt giá trị / hợp đồng soạn sẵn',
      ];
      values.forEach((v, i) => {
        const cell = draft.getCell(dr, i + 1);
        cell.value = v as ExcelJS.CellValue;
        wbStyle(cell, { size: 9.5, fill: zebra, align: dCols[i].align, wrap: i === 2 });
      });
      dr++;
    });
  }
  draft.views = [{ state: 'frozen', ySplit: dHead, showGridLines: false }];
  draft.pageSetup.printTitlesRow = `${dHead}:${dHead}`;
  draft.pageSetup.printArea = `A1:H${dr}`;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
