/**
 * Bảng màu / typography dùng chung cho mọi file Excel xuất ra từ app.
 *
 * Đây là bản "dịch" các token giao diện VCPMC sang ARGB của Excel, để file
 * xuất ra nhìn đúng ngôn ngữ thiết kế của app (xanh #4A7202, card nền nhạt,
 * badge trạng thái cùng tông).
 */
import type ExcelJS from 'exceljs';

export const WB_FONT = 'Times New Roman';

/** ARGB tokens — khớp với biến CSS trong frontend/src/theme/tokens.css */
export const WB = {
  ink: 'FF1F2A16',          // --text-primary
  inkSoft: 'FF3C4A31',      // --text-secondary
  muted: 'FF6B7A5C',        // --text-muted
  hair: 'FFDCE8C9',         // --border-soft
  rule: 'FFBCD095',         // --border-default
  green: 'FF4A7202',        // --accent-primary
  greenSoft: 'FFEDF5E1',    // accent-primary 8%
  greenTile: 'FFF3F8EA',    // accent-primary 6% (nền StatTile)
  band: 'FFF8FBF4',         // zebra
  total: 'FFE1EFCC',        // dòng cộng
  headText: 'FFFFFFFF',
  warning: 'FFB07D2B',
  warningSoft: 'FFFCF3E2',
  danger: 'FFA33323',
  dangerSoft: 'FFFBEBE8',
  success: 'FF2F7A4B',
  successSoft: 'FFE8F4EC',
  plum: 'FF6D365B',
} as const;

/** Định dạng số dùng chung */
export const WB_FMT = {
  money: '#,##0;(#,##0);"-"',
  int: '#,##0;(#,##0);"-"',
  percent: '0.0%',
  date: 'dd/mm/yyyy',
} as const;

export type WbAlign = 'left' | 'center' | 'right';

export interface WbStyleOpts {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
  fill?: string;
  align?: WbAlign;
  vAlign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  border?: Partial<ExcelJS.Borders> | false;
  numFmt?: string;
  indent?: number;
}

export function wbBox(color: string = WB.hair, weight: 'thin' | 'medium' = 'thin'): Partial<ExcelJS.Borders> {
  const s = { style: weight, color: { argb: color } } as ExcelJS.Border;
  return { top: s, bottom: s, left: s, right: s };
}

export function wbStyle(cell: ExcelJS.Cell, o: WbStyleOpts = {}) {
  cell.font = {
    name: WB_FONT,
    size: o.size ?? 11,
    bold: o.bold,
    italic: o.italic,
    color: { argb: o.color ?? WB.ink },
  };
  if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
  cell.alignment = {
    horizontal: o.align ?? 'left',
    vertical: o.vAlign ?? 'middle',
    wrapText: Boolean(o.wrap),
    indent: o.indent,
  };
  if (o.border !== false) cell.border = o.border ?? wbBox();
  if (o.numFmt) cell.numFmt = o.numFmt;
}

/** Tông màu badge trạng thái — khớp StatTile/badge trên UI */
export type WbTone = 'neutral' | 'brand' | 'warning' | 'danger' | 'success';

export function wbToneColors(tone: WbTone): { color: string; fill: string } {
  switch (tone) {
    case 'brand': return { color: WB.green, fill: WB.greenSoft };
    case 'warning': return { color: WB.warning, fill: WB.warningSoft };
    case 'danger': return { color: WB.danger, fill: WB.dangerSoft };
    case 'success': return { color: WB.success, fill: WB.successSoft };
    default: return { color: WB.inkSoft, fill: WB.band };
  }
}

/** Suy ra tông màu từ nhãn trạng thái hợp đồng (chỉ để tô màu, không đổi dữ liệu) */
export function wbContractStateTone(state: string | null | undefined): WbTone {
  const s = (state || '').toLowerCase();
  if (s.includes('quá hạn') || s.includes('hết hạn') || s.includes('expired')) return 'danger';
  if (s.includes('sắp') || s.includes('expiring')) return 'warning';
  if (s.includes('hiệu lực') || s.includes('active')) return 'success';
  return 'neutral';
}

/** Thiết lập in ấn chuẩn: A4, fit theo chiều ngang, canh giữa */
export function wbPageSetup(opts: Partial<ExcelJS.PageSetup> = {}): Partial<ExcelJS.PageSetup> {
  return {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    ...opts,
  };
}

/** Thanh tiến độ dạng ký tự trong ô — mô phỏng progress bar trên UI */
export function wbBarText(ratio: number, width = 20): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Tên file an toàn (bỏ dấu tiếng Việt) */
export function wbSafeName(s: string, fallback = 'BaoCao'): string {
  return (s || fallback)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .trim().replace(/\s+/g, '-').slice(0, 60) || fallback;
}
