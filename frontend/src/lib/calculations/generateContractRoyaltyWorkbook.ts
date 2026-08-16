/**
 * Sinh file .xlsx "Bảng tính tiền bản quyền âm nhạc".
 *
 * Bố cục 2 sheet, tối ưu để in A4 dọc:
 *   1) "Tổng hợp"  — thông tin đơn vị, tham số tính, bảng tổng hợp theo khu vực,
 *                    khối kết toán (Cộng → Thuế GTGT → Tổng cộng) và bằng chữ.
 *   2) "Chi tiết"  — bảng bậc biểu mức của từng khu vực theo NĐ 17/2023/NĐ-CP.
 *
 * NGUYÊN TẮC: không tính lại tiền. Mọi con số lấy nguyên từ model (kết quả tính thật).
 * Các ô "Thành tiền" ghi kèm CÔNG THỨC Excel tham chiếu ô MLCS / Thuế GTGT để file
 * còn "sống" khi người dùng đổi mức lương cơ sở, nhưng giá trị mặc định luôn là số thật.
 */

import ExcelJS from 'exceljs';
import type { ContractRoyaltyModel } from './contractRoyaltyModel';
import { VCPMC, VCPMC_HEAD_CONTACT_LINE, VCPMC_SOUTH_CONTACT_LINE } from './vcpmcIdentity';

const FONT = 'Times New Roman';

const C = {
  ink: 'FF1F2A16',
  muted: 'FF6B7A5C',
  rule: 'FFBCD095',
  hair: 'FFDCE8C9',
  navy: 'FF4A7202',
  navySoft: 'FFEDF5E1',
  band: 'FFF6FAF1',
  head: 'FF4A7202',
  headText: 'FFFFFFFF',
  total: 'FFE1EFCC',
  input: 'FF0000FF',
  danger: 'FFB03A2E',
  gold: 'FFB07D2B',
};

const MONEY = '#,##0;(#,##0);"-"';
const MONEY_D = '#,##0" đồng"';

type Align = 'left' | 'center' | 'right';
type StyleOpts = {
  bold?: boolean; italic?: boolean; size?: number; color?: string; fill?: string;
  align?: Align; vAlign?: 'top' | 'middle' | 'bottom'; wrap?: boolean; indent?: number;
  border?: Partial<ExcelJS.Borders> | false; numFmt?: string;
};

function box(color = C.hair, weight: 'thin' | 'medium' = 'thin'): Partial<ExcelJS.Borders> {
  const s = { style: weight, color: { argb: color } } as ExcelJS.Border;
  return { top: s, bottom: s, left: s, right: s };
}

function style(cell: ExcelJS.Cell, o: StyleOpts = {}) {
  cell.font = {
    name: FONT, size: o.size ?? 11, bold: o.bold, italic: o.italic,
    color: { argb: o.color ?? C.ink },
  };
  if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
  cell.alignment = {
    horizontal: o.align ?? 'left', vertical: o.vAlign ?? 'middle',
    wrapText: Boolean(o.wrap), indent: o.indent,
  };
  if (o.border !== false) cell.border = o.border ?? box();
  if (o.numFmt) cell.numFmt = o.numFmt;
}

function num(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
}
function fmtFactor(n: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(n);
}
function safeName(s: string): string {
  return (s || 'BangTinh')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .trim().replace(/\s+/g, '-').slice(0, 60) || 'BangTinh';
}

export function contractWorkbookFilename(model: ContractRoyaltyModel): string {
  const d = new Date().toISOString().slice(0, 10);
  const who = model.orgName ? safeName(model.orgName) : 'VCPMC';
  return `BangTinhTienBanQuyen-${who}-${d}.xlsx`;
}

const PAGE = (opts: Partial<ExcelJS.PageSetup> = {}): Partial<ExcelJS.PageSetup> => ({
  paperSize: 9,
  orientation: 'portrait',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  horizontalCentered: true,
  margins: { left: 0.5, right: 0.5, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 },
  ...opts,
});

export async function generateContractRoyaltyWorkbook(
  model: ContractRoyaltyModel,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCPMC';
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = model.documentTitle;

  const sum = wb.addWorksheet('Bảng tính', { pageSetup: PAGE(), views: [{ showGridLines: false }] });
  wb.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible', x: 0, y: 0, width: 0, height: 0 }];

  sum.columns = [
    { key: 'a', width: 5.5 }, { key: 'b', width: 27 }, { key: 'c', width: 24 },
    { key: 'd', width: 13 }, { key: 'e', width: 12 }, { key: 'f', width: 20 },
  ];

  sum.headerFooter.oddFooter =
    `&L&"${FONT},Italic"&8${model.legalBasis}`
    + `&C&"${FONT},Italic"&8${VCPMC.shortName} · ${VCPMC.email} · ${VCPMC.website}`
    + `&R&"${FONT},Italic"&8Trang &P/&N`;


  /* ══════════════ SHEET 1 · TỔNG HỢP ══════════════ */
  let r = 1;
  const merge = (ws: ExcelJS.Worksheet, row: number, from = 'A', to = 'F') =>
    ws.mergeCells(`${from}${row}:${to}${row}`);

  // Dải tiêu đề
  merge(sum, r);
  sum.getCell(`A${r}`).value = `${VCPMC.fullName} (${VCPMC.shortName})`;
  style(sum.getCell(`A${r}`), { bold: true, size: 10, align: 'center', color: C.headText, fill: C.head, border: false });
  sum.getRow(r).height = 20; r++;

  merge(sum, r);
  sum.getCell(`A${r}`).value = VCPMC_HEAD_CONTACT_LINE;
  style(sum.getCell(`A${r}`), { size: 8.5, align: 'center', wrap: true, color: C.muted, border: false });
  sum.getRow(r).height = 24; r++;

  merge(sum, r);
  sum.getCell(`A${r}`).value = VCPMC_SOUTH_CONTACT_LINE;
  style(sum.getCell(`A${r}`), { size: 8.5, align: 'center', wrap: true, color: C.muted, border: false });
  sum.getRow(r).height = 22; r++;

  merge(sum, r);
  sum.getCell(`A${r}`).value = model.documentTitle;
  style(sum.getCell(`A${r}`), { bold: true, size: 16, align: 'center', color: C.navy, border: false });
  sum.getRow(r).height = 30; r++;

  merge(sum, r);
  sum.getCell(`A${r}`).value = `Căn cứ: ${model.legalBasis}`;
  style(sum.getCell(`A${r}`), { italic: true, size: 10, align: 'center', color: C.muted, border: false });
  sum.getRow(r).height = 16; r++;
  r++;

  // Thông tin đơn vị
  merge(sum, r);
  sum.getCell(`A${r}`).value = 'A. THÔNG TIN ĐƠN VỊ SỬ DỤNG ÂM NHẠC';
  style(sum.getCell(`A${r}`), { bold: true, size: 11, color: C.navy, fill: C.navySoft, indent: 1, border: box(C.rule) });
  sum.getRow(r).height = 19; r++;

  const info: Array<[string, string]> = [
    ['Đơn vị sử dụng', model.orgName || ''],
    ['Địa chỉ', model.orgAddress || ''],
    ['Người đại diện', model.orgRepresentative || ''],
    ['Thời hạn hợp đồng', `${model.contractMonths} tháng`],
    ['Ngày lập bảng tính', model.quoteDate],
  ];
  for (const [label, value] of info) {
    sum.mergeCells(`A${r}:B${r}`);
    sum.getCell(`A${r}`).value = label;
    style(sum.getCell(`A${r}`), { bold: true, size: 10, color: C.navy, fill: C.band, indent: 1 });
    sum.mergeCells(`C${r}:F${r}`);
    sum.getCell(`C${r}`).value = value;
    style(sum.getCell(`C${r}`), { size: 10, indent: 1, wrap: true });
    sum.getRow(r).height = 16; r++;
  }
  r++;

  // Tham số tính
  merge(sum, r);
  sum.getCell(`A${r}`).value = 'B. THAM SỐ TÍNH';
  style(sum.getCell(`A${r}`), { bold: true, size: 11, color: C.navy, fill: C.navySoft, indent: 1, border: box(C.rule) });
  sum.getRow(r).height = 19; r++;

  sum.mergeCells(`A${r}:B${r}`);
  sum.getCell(`A${r}`).value = 'Mức lương cơ sở (MLCS)';
  style(sum.getCell(`A${r}`), { bold: true, size: 10, color: C.navy, fill: C.band, indent: 1 });
  sum.mergeCells(`C${r}:D${r}`);
  const mlcsCell = sum.getCell(`C${r}`);
  mlcsCell.value = model.baseSalary;
  style(mlcsCell, { bold: true, size: 10, align: 'left', indent: 1, numFmt: MONEY_D, color: C.input });
  mlcsCell.name = 'MLCS';
  sum.getCell(`E${r}`).value = 'Thuế GTGT';
  style(sum.getCell(`E${r}`), { bold: true, size: 10, color: C.navy, fill: C.band, align: 'right' });
  const gtgtCell = sum.getCell(`F${r}`);
  gtgtCell.value = model.vatPct;
  style(gtgtCell, { bold: true, size: 10, align: 'right', numFmt: '0.0%', color: C.input });
  gtgtCell.name = 'THUEGTGT';
  sum.getRow(r).height = 18; r++;

  sum.mergeCells(`A${r}:F${r}`);
  sum.getCell(`A${r}`).value = model.legalNote;
  style(sum.getCell(`A${r}`), { italic: true, size: 9.5, align: 'left', indent: 1, wrap: true, color: C.gold, fill: C.band });
  sum.getRow(r).height = 28; r++;
  r++;

  /* ══════════════ C · CHI TIẾT TỪNG LĨNH VỰC ══════════════ */
  merge(sum, r);
  sum.getCell(`A${r}`).value = 'C. CHI TIẾT TIỀN BẢN QUYỀN THEO TỪNG LĨNH VỰC SỬ DỤNG';
  style(sum.getCell(`A${r}`), { bold: true, size: 11, color: C.navy, fill: C.navySoft, indent: 1, border: box(C.rule) });
  sum.getRow(r).height = 19; r++;

  merge(sum, r);
  sum.getCell(`A${r}`).value =
    'Số tiền bản quyền (tính theo năm) = Mức lương cơ sở × Hệ số điều chỉnh × Số lượng';
  style(sum.getCell(`A${r}`), { italic: true, size: 9.5, align: 'center', color: C.muted, border: false });
  sum.getRow(r).height = 16; r++;

  const blockTotalRows: number[] = [];

  model.blocks.forEach((block, bi) => {
    merge(sum, r);
    sum.getCell(`A${r}`).value =
      `${bi + 1}. ${block.locationName} — ${block.fieldName}  ·  Quy mô: ${block.scaleText}`;
    style(sum.getCell(`A${r}`), {
      bold: true, size: 11, color: C.headText, fill: C.head, indent: 1, border: box(C.head),
    });
    sum.getRow(r).height = 21; r++;

    const heads: Array<[string, string, Align]> = [
      ['A', 'STT', 'center'],
      ['B', 'Diễn giải bậc biểu mức', 'left'],
      ['C', 'Số lượng', 'center'],
      ['D', 'Hệ số/năm', 'center'],
      ['E', 'Mức lương cơ sở', 'center'],
      ['F', 'Thành tiền (đồng)', 'center'],
    ];
    for (const [col, text, al] of heads) {
      sum.getCell(`${col}${r}`).value = text;
      style(sum.getCell(`${col}${r}`), {
        bold: true, size: 10, align: al, wrap: true, color: C.navy, fill: C.navySoft, border: box(C.rule),
      });
    }
    sum.getRow(r).height = 26; r++;

    const firstTier = r;
    const perTier = block.urbanMode === 'PER_TIER' && !block.urbanExempt && block.urbanFactor !== 1;

    block.tiers.forEach((t, ti) => {
      sum.getCell(`A${r}`).value = ti + 1;
      style(sum.getCell(`A${r}`), { size: 10, align: 'center', border: box(C.rule) });

      sum.getCell(`B${r}`).value = t.label;
      style(sum.getCell(`B${r}`), { size: 10, align: 'left', indent: 1, wrap: true, border: box(C.rule) });

      if (t.hideFormula) {
        sum.mergeCells(`C${r}:E${r}`);
        sum.getCell(`C${r}`).value = 'Mức trọn gói theo biểu mức';
        style(sum.getCell(`C${r}`), { italic: true, size: 10, align: 'center', color: C.muted, border: box(C.rule) });
        sum.getCell(`F${r}`).value = perTier ? (t.amountAfterUrban ?? t.amount) : t.amount;
      } else {
        sum.getCell(`C${r}`).value = t.qty;
        style(sum.getCell(`C${r}`), { size: 10, align: 'center', border: box(C.rule) });
        sum.getCell(`D${r}`).value = t.coefText;
        style(sum.getCell(`D${r}`), { size: 10, align: 'center', border: box(C.rule) });
        sum.getCell(`E${r}`).value = { formula: 'MLCS', result: model.baseSalary } as ExcelJS.CellFormulaValue;
        style(sum.getCell(`E${r}`), { size: 10, align: 'right', numFmt: MONEY, border: box(C.rule) });
        sum.getCell(`F${r}`).value = {
          formula: perTier
            ? `ROUND(MLCS*${t.coef}*${t.qty}*${block.urbanFactor},0)`
            : `ROUND(MLCS*${t.coef}*${t.qty},0)`,
          result: perTier ? (t.amountAfterUrban ?? t.amount) : t.amount,
        } as ExcelJS.CellFormulaValue;
      }
      style(sum.getCell(`F${r}`), { size: 10, bold: true, align: 'right', numFmt: MONEY, border: box(C.rule) });
      sum.getRow(r).height = 18; r++;
    });
    const lastTier = r - 1;

    let blockRef = `F${lastTier}`;

    if (block.tiers.length > 1 || block.urbanFactor !== 1 || block.cappedNote) {
      sum.mergeCells(`A${r}:E${r}`);
      sum.getCell(`A${r}`).value = 'Cộng tiền bản quyền theo khung giá';
      style(sum.getCell(`A${r}`), { bold: true, size: 10, align: 'right', indent: 1, fill: C.band, border: box(C.rule) });
      sum.getCell(`F${r}`).value = {
        formula: `SUM(F${firstTier}:F${lastTier})`,
        result: perTier ? block.subTotalAfterUrban : block.subTotalRaw,
      } as ExcelJS.CellFormulaValue;
      style(sum.getCell(`F${r}`), { bold: true, size: 10, align: 'right', numFmt: MONEY, fill: C.band, border: box(C.rule) });
      blockRef = `F${r}`;
      sum.getRow(r).height = 18; r++;
    }

    if (block.cappedNote) {
      sum.mergeCells(`A${r}:F${r}`);
      sum.getCell(`A${r}`).value = block.cappedNote;
      style(sum.getCell(`A${r}`), { italic: true, size: 9.5, align: 'center', color: C.danger, border: box(C.rule) });
      sum.getRow(r).height = 16; r++;
    }

    if (!block.urbanExempt && block.urbanFactor > 0 && block.urbanFactor !== 1) {
      sum.mergeCells(`A${r}:E${r}`);
      sum.getCell(`A${r}`).value = 'Tỷ lệ áp dụng theo phân loại đô thị:';
      style(sum.getCell(`A${r}`), { italic: true, size: 10, align: 'right', indent: 1, fill: C.band, border: box(C.rule) });
      sum.getCell(`F${r}`).value = `${block.urbanLabel || 'Đô thị'} (${Math.round(block.urbanFactor * 100)}%)`;
      style(sum.getCell(`F${r}`), { bold: true, size: 10, align: 'left', indent: 1, fill: C.band, border: box(C.rule) });
      sum.getRow(r).height = 16; r++;
    }

    if (block.urbanFactor !== 1 && !perTier) {
      sum.mergeCells(`A${r}:E${r}`);
      sum.getCell(`A${r}`).value =
        `Áp dụng tỷ lệ đô thị${block.urbanLabel ? ` — ${block.urbanLabel}` : ''}`;
      style(sum.getCell(`A${r}`), { bold: true, size: 10, align: 'right', indent: 1, fill: C.band, border: box(C.rule) });
      sum.getCell(`F${r}`).value = {
        formula: `ROUND(${blockRef}*${block.urbanFactor},0)`, result: block.subTotalAfterUrban,
      } as ExcelJS.CellFormulaValue;
      style(sum.getCell(`F${r}`), { bold: true, size: 10, align: 'right', numFmt: MONEY, fill: C.band, border: box(C.rule) });
      blockRef = `F${r}`;
      sum.getRow(r).height = 18; r++;
    }

    sum.mergeCells(`A${r}:E${r}`);
    sum.getCell(`A${r}`).value = `Tiền bản quyền — ${block.locationName} · ${block.fieldName}`;
    style(sum.getCell(`A${r}`), { bold: true, size: 10, align: 'right', indent: 1, wrap: true, color: C.navy, fill: C.total, border: box(C.rule) });
    sum.getCell(`F${r}`).value = { formula: `=${blockRef}`, result: block.subTotalAfterUrban } as ExcelJS.CellFormulaValue;
    style(sum.getCell(`F${r}`), { bold: true, size: 11, align: 'right', numFmt: MONEY, color: C.navy, fill: C.total, border: box(C.rule) });
    blockTotalRows.push(r);
    sum.getRow(r).height = 20; r++;
    r++;
  });

  /* ══════════════ D · TỔNG HỢP THEO KHU VỰC ══════════════ */
  merge(sum, r);
  sum.getCell(`A${r}`).value = 'D. TỔNG HỢP TIỀN BẢN QUYỀN THEO KHU VỰC';
  style(sum.getCell(`A${r}`), { bold: true, size: 11, color: C.navy, fill: C.navySoft, indent: 1, border: box(C.rule) });
  sum.getRow(r).height = 19; r++;

  const sHeads: Array<[string, string, Align]> = [
    ['A', 'STT', 'center'],
    ['B', 'Khu vực sử dụng', 'left'],
    ['C', 'Lĩnh vực áp dụng', 'left'],
    ['D', 'Quy mô', 'center'],
    ['E', 'Tỷ lệ đô thị', 'center'],
    ['F', 'Tiền bản quyền (đồng)', 'center'],
  ];
  for (const [col, text, al] of sHeads) {
    sum.getCell(`${col}${r}`).value = text;
    style(sum.getCell(`${col}${r}`), {
      bold: true, size: 10, align: al, wrap: true, color: C.headText, fill: C.head, border: box(C.head),
    });
  }
  sum.getRow(r).height = 28; r++;

  const firstRow = r;
  model.blocks.forEach((b, i) => {
    const zebra = i % 2 === 1 ? C.band : undefined;
    sum.getCell(`A${r}`).value = i + 1;
    style(sum.getCell(`A${r}`), { size: 10, align: 'center', fill: zebra, border: box(C.rule) });
    sum.getCell(`B${r}`).value = b.locationName;
    style(sum.getCell(`B${r}`), { size: 10, wrap: true, indent: 1, fill: zebra, border: box(C.rule) });
    sum.getCell(`C${r}`).value = b.fieldName;
    style(sum.getCell(`C${r}`), { size: 10, wrap: true, indent: 1, fill: zebra, border: box(C.rule) });
    sum.getCell(`D${r}`).value = b.scaleText;
    style(sum.getCell(`D${r}`), { size: 10, align: 'center', fill: zebra, border: box(C.rule) });
    sum.getCell(`E${r}`).value = b.urbanExempt
      ? 'Miễn áp dụng'
      : b.urbanLabel
        ? `${b.urbanLabel} (${Math.round(b.urbanFactor * 100)}%)`
        : fmtFactor(b.urbanFactor);
    style(sum.getCell(`E${r}`), { size: 10, align: 'center', fill: zebra, border: box(C.rule) });
    sum.getCell(`F${r}`).value = {
      formula: `=F${blockTotalRows[i]}`, result: b.subTotalAfterUrban,
    } as ExcelJS.CellFormulaValue;
    style(sum.getCell(`F${r}`), { size: 10, bold: true, align: 'right', numFmt: MONEY, fill: zebra, border: box(C.rule) });
    sum.getRow(r).height = 18; r++;
  });

  const lastRow = r - 1;

  const line = (
    label: string, formula: string, result: number,
    o: { emphasis?: boolean; danger?: boolean } = {},
  ) => {
    sum.mergeCells(`A${r}:E${r}`);
    sum.getCell(`A${r}`).value = label;
    style(sum.getCell(`A${r}`), {
      bold: true, size: o.emphasis ? 12 : 10.5, align: 'right', indent: 1, wrap: true,
      color: o.danger ? C.danger : o.emphasis ? C.headText : C.ink,
      fill: o.emphasis ? C.head : C.band,
      border: box(o.emphasis ? C.head : C.rule),
    });
    sum.getCell(`F${r}`).value = { formula, result } as ExcelJS.CellFormulaValue;
    style(sum.getCell(`F${r}`), {
      bold: true, size: o.emphasis ? 12 : 10.5, align: 'right', numFmt: MONEY,
      color: o.danger ? C.danger : o.emphasis ? C.headText : C.ink,
      fill: o.emphasis ? C.head : C.band,
      border: box(o.emphasis ? C.head : C.rule),
    });
    sum.getRow(r).height = o.emphasis ? 24 : 19;
    const ref = `F${r}`;
    r++;
    return ref;
  };

  const royaltyRef = model.blocks.length
    ? line('Cộng tiền bản quyền', `=SUM(F${firstRow}:F${lastRow})`, model.royaltyTotal)
    : line('Cộng tiền bản quyền', '=0', 0);

  let runningExpr = royaltyRef;

  if (model.supportPct > 0) {
    const supRef = line(
      `Mức hỗ trợ năm ${model.supportYear} (${(model.supportPct * 100).toFixed(0)}%)`,
      `=-ROUND(${royaltyRef}*${model.supportPct},0)`,
      -model.supportAmount,
      { danger: true },
    );
    runningExpr = `${runningExpr}+${supRef}`;
  }

  for (const fee of model.customFees) {
    sum.mergeCells(`A${r}:E${r}`);
    sum.getCell(`A${r}`).value = fee.label?.trim() || 'Chi phí khác';
    style(sum.getCell(`A${r}`), { size: 10.5, align: 'right', indent: 1, border: box(C.rule) });
    sum.getCell(`F${r}`).value = Math.round(fee.amount);
    style(sum.getCell(`F${r}`), { size: 10.5, align: 'right', numFmt: MONEY, border: box(C.rule) });
    runningExpr = `${runningExpr}+F${r}`;
    sum.getRow(r).height = 18; r++;
  }

  const congRef = line('Cộng', `=${runningExpr}`, model.subtotal);
  const gtgtRef = line(
    `Tiền thuế GTGT ${(model.vatPct * 100).toFixed(0)}%`,
    `=ROUND(${congRef}*THUEGTGT,0)`,
    model.vatAmount,
  );
  line(
    `TỔNG GIÁ TRỊ HỢP ĐỒNG (${model.contractMonths} tháng sử dụng)`,
    `=${congRef}+${gtgtRef}`,
    model.grandTotal,
    { emphasis: true },
  );

  sum.mergeCells(`A${r}:F${r}`);
  sum.getCell(`A${r}`).value = `Bằng chữ: ${model.amountInWords}./.`;
  style(sum.getCell(`A${r}`), { italic: true, bold: true, size: 11, align: 'center', wrap: true, color: C.navy, border: box(C.rule) });
  sum.getRow(r).height = 22; r++;
  r++;

  sum.mergeCells(`A${r}:F${r}`);
  sum.getCell(`A${r}`).value =
    `Ghi chú: Tiền bản quyền được tính theo Phụ lục biểu mức của Nghị định 17/2023/NĐ-CP, trên mức lương cơ sở ${num(model.baseSalary)} đồng/tháng. `
    + 'Ô "Mức lương cơ sở (MLCS)" và ô "Thuế GTGT" là ô nhập (chữ xanh); thay đổi hai ô này, toàn bộ bảng tự tính lại.';
  style(sum.getCell(`A${r}`), { italic: true, size: 9.5, align: 'left', indent: 1, wrap: true, color: C.muted, border: false });
  sum.getRow(r).height = 40; r += 2;

  sum.pageSetup.printArea = `A1:F${r}`;





  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
