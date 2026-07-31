/**
 * exportAddressLabels — Xuất nhãn địa chỉ dán bìa thư ra file .docx.
 * Mỗi địa chỉ = một ô trong bảng A4, cắt dán lên bìa thư.
 * Dùng thư viện `docx` chạy trong trình duyệt.
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';

export interface AddressEntry {
  name: string;
  address: string;
  phone?: string;
}

export interface AddressLabelOptions {
  columnsPerPage: 2 | 3;
  showKinhGui: boolean;
  showPhone: boolean;
  fontSize?: number;
  fontFamily?: string;
}

const normalizeHeaderToken = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const HEADER_TOKENS = new Set([
  'ten_don_vi',
  'ten don vi',
  'tendonvi',
  'ten',
  'dia_chi',
  'dia chi',
  'diachi',
  'so_dien_thoai',
  'so dien thoai',
  'sodienthoai',
  'dien_thoai',
  'dienthoai',
  'sdt',
  'phone',
  'tel',
]);

const isLikelyHeaderRow = (cols: string[]) =>
  cols.some((col) => HEADER_TOKENS.has(normalizeHeaderToken(col)));

/** Parse raw text (tab/comma/semicolon separated, or pasted Excel rows) into AddressEntry[] */
export function parseAddressData(raw: string): AddressEntry[] {
  if (!raw.trim()) return [];

  const decoded = raw
    .replace(/&#9;/g, '\t')
    .replace(/&Tab;/gi, '\t')
    .replace(/&nbsp;/g, ' ');

  const lines = decoded.trim().split('\n').filter((l) => l.trim());
  const results: AddressEntry[] = [];
  let first = true;

  for (const line of lines) {
    const normalized = line.replace(/\s*\|\s*/g, '\t').replace(/\s*;\s*/g, '\t');
    const cols = normalized.split('\t').map((c) => c.trim()).filter(Boolean);

    if (cols.length === 0) continue;

    if (first) {
      first = false;
      if (isLikelyHeaderRow(cols)) {
        continue;
      }
    }

    const hasHeader = /^(ten|don|diachi|dia|phone|sdt|tel|name|address|company)/i.test(cols[0]);
    if (hasHeader && cols.length < 2) continue;

    const offset = hasHeader ? 1 : 0;

    results.push({
      name: cols[offset] || '',
      address: cols[offset + 1] || '',
      phone: cols[offset + 2] || '',
    });
  }

  return results;
}

function thinBorder(color = '999999') {
  return {
    top: { style: BorderStyle.SINGLE, size: 4, color },
    bottom: { style: BorderStyle.SINGLE, size: 4, color },
    left: { style: BorderStyle.SINGLE, size: 4, color },
    right: { style: BorderStyle.SINGLE, size: 4, color },
  };
}

function noBorder() {
  return {
    top: { style: BorderStyle.NIL },
    bottom: { style: BorderStyle.NIL },
    left: { style: BorderStyle.NIL },
    right: { style: BorderStyle.NIL },
  };
}

// kept in case caller wants no-border cells in future; not used by buildRows
export { noBorder };

function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

function para(text: string, opts: Partial<{
  bold: boolean; size: number; font: string; align: typeof AlignmentType[keyof typeof AlignmentType];
}> = {}) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts.bold ?? false,
        size: opts.size ?? 20,
        font: opts.font ?? 'Times New Roman',
      }),
    ],
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { line: 240, before: 40, after: 40 },
  });
}

function buildCell(paragraphs: Paragraph[], colWidth: number): TableCell {
  return new TableCell({
    children: paragraphs,
    width: { size: colWidth, type: WidthType.DXA },
    verticalAlign: 'top',
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: thinBorder(),
  });
}

function buildAddressParagraphs(entry: AddressEntry, opts: AddressLabelOptions): Paragraph[] {
  const baseFontSize = opts.fontSize ?? 10.5;
  const { showKinhGui, showPhone, fontFamily } = opts;
  const lines: Paragraph[] = [];

  if (showKinhGui) {
    lines.push(para('Kính gửi:', { bold: true, size: ptToHalfPoints(baseFontSize), font: fontFamily }));
  }

  lines.push(para(entry.name, { bold: true, size: ptToHalfPoints(baseFontSize + 0.5), font: fontFamily }));
  lines.push(para(entry.address, { bold: false, size: ptToHalfPoints(baseFontSize), font: fontFamily }));

  if (showPhone && entry.phone) {
    lines.push(para(`ĐT: ${entry.phone}`, { bold: false, size: ptToHalfPoints(baseFontSize), font: fontFamily }));
  }

  return lines;
}

function buildRows(entries: AddressEntry[], cols: number, colWidth: number, opts: AddressLabelOptions): TableRow[] {
  const rows: TableRow[] = [];
  const cellsPerRow = cols;

  for (let i = 0; i < entries.length; i += cellsPerRow) {
    const rowEntries = entries.slice(i, i + cellsPerRow);
    const cells: TableCell[] = [];

    for (let j = 0; j < cellsPerRow; j++) {
      if (j < rowEntries.length) {
        const entry = rowEntries[j];
        const paragraphs = buildAddressParagraphs(entry, opts);
        cells.push(buildCell(paragraphs, colWidth));
      } else {
        cells.push(
          new TableCell({
            children: [para('')],
            width: { size: colWidth, type: WidthType.DXA },
            verticalAlign: 'top',
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            borders: thinBorder(),
          })
        );
      }
    }

    rows.push(new TableRow({ children: cells }));
  }

  return rows;
}

export function buildAddressLabelsDocx(
  entries: AddressEntry[],
  opts: AddressLabelOptions
): Document {
  const cols = opts.columnsPerPage;
  const pageWidthDxa = 11906;
  const marginDxa = 850;
  const usableWidth = pageWidthDxa - marginDxa * 2;
  const colWidth = Math.floor(usableWidth / cols);

  const tableRows = buildRows(entries, cols, colWidth, opts);

  const doc = new Document({
    creator: 'VCPMC App',
    title: 'Nhãn địa chỉ dán bìa thư',
    styles: {
      default: {
        document: {
          run: {
            font: opts.fontFamily ?? 'Times New Roman',
            size: ptToHalfPoints(opts.fontSize ?? 10.5),
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children: [
          new Table({
            width: { size: pageWidthDxa - marginDxa * 2, type: WidthType.DXA },
            columnWidths: Array(cols).fill(colWidth),
            rows: tableRows,
          }),
        ],
      },
    ],
  });

  return doc;
}

export async function exportAddressLabelsDocx(
  entries: AddressEntry[],
  opts: AddressLabelOptions
): Promise<void> {
  const doc = buildAddressLabelsDocx(entries, opts);
  const blob = await Packer.toBlob(doc);
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  saveAs(blob, `o_dia_chi_dan_bia_thu_${ts}.docx`);
}
