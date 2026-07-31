/**
 * KaraokeQuotePreview — printable proposal preview content (frontend-only).
 * Renders the quote markup only (no fixed overlay); the parent decides
 * whether to place it in a modal, popover, or inline panel.
 *
 * Phase D: web preview table uses VcpmcMoneyTable. The legacy
 * snapshotToHTMLTable is kept ONLY for the Copy (clipboard rich+plain)
 * button — printed/PDF output goes through buildKaraokeQuotePrintHtml.
 */
import React from 'react';
import { XIcon, PrinterIcon, CopyIcon } from 'lucide-react';
import { VcpmcMoneyTable } from '../app-ui/data-table/VcpmcMoneyTable';
import type {
  DataTableColumn,
  DataTableSummaryRow,
} from '../app-ui/data-table';
import type { PricingSnapshot, PricingSnapshotRow } from '../../lib/pricingSnapshot';
import {
  copyRichAndPlain,
  snapshotToHTMLTable,
  snapshotToPlainText,
  formatVND,
  getSupportRateLabel,
} from '../../lib/pricingSnapshot';
import { buildKaraokeQuotePrintHtml, printKaraokeQuoteHtml } from './karaokeQuotePrintHtml';

const NAVY = '#4A7202';
const LINE = '#E7EDE1';
const SERIF: React.CSSProperties = { fontFamily: '"Cormorant Garamond", Georgia, serif' };

type Props = {
  snapshot: PricingSnapshot;
  customerName?: string;
  signboard?: string;
  /** Render a close X in the header (used for inline popover/panel) */
  showCloseButton?: boolean;
  onClose?: () => void;
  /** Compact mode: smaller paddings, slightly tighter typography */
  compact?: boolean;
};

export function KaraokeQuotePreview({
  snapshot,
  customerName,
  signboard,
  showCloseButton = false,
  onClose,
  compact = false,
}: Props) {
  const today = new Date().toLocaleDateString('vi-VN');

  const handlePrint = () => {
    // Use the standalone A4 print template — NOT the in-app preview DOM.
    // This guarantees a clean, fixed-column PDF regardless of any
    // app theme, overlay, or zoom state.
    const html = buildKaraokeQuotePrintHtml({
      snapshot,
      context: { customerName, signboard },
    });
    printKaraokeQuoteHtml(html);
  };

  const handleCopy = async () => {
    // Clipboard rich-text still uses the legacy HTML emitter so users
    // pasting into Word/Gmail retain the original Word-like styling.
    await copyRichAndPlain(snapshotToHTMLTable(snapshot), snapshotToPlainText(snapshot));
  };

  return (
    <div
      className="w-full overflow-hidden flex flex-col rounded-[14px]"
      style={{ background: '#fff', border: `1px solid ${LINE}` }}
    >
      <header
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ background: '#F6FAF1', borderBottom: `1px solid ${LINE}` }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: NAVY }}>
            Bảng tính tiền bản quyền
          </div>
          <h3 className="text-[16px] font-bold" style={{ ...SERIF, color: NAVY }}>
            Tiền bản quyền âm nhạc
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] font-semibold"
            style={{ background: '#fff', color: NAVY, border: `1px solid ${LINE}` }}
          >
            <CopyIcon className="h-3.5 w-3.5" /> Copy
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] font-semibold text-white"
            style={{ background: NAVY }}
          >
            <PrinterIcon className="h-3.5 w-3.5" /> In / PDF
          </button>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="h-8 w-8 inline-flex items-center justify-center rounded-[8px]"
              style={{ background: '#fff', color: '#6B665F', border: `1px solid ${LINE}` }}
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div
        className={`overflow-y-auto ${compact ? 'p-4' : 'p-6'}`}
        style={{ background: '#fff', maxHeight: '70vh' }}
      >
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: NAVY }}>
            VCPMC · Trung tâm Bảo vệ Quyền tác giả Âm nhạc Việt Nam
          </div>
          <h2 className="text-[22px] font-bold" style={SERIF}>Tiền bản quyền âm nhạc</h2>
          <div className="text-[12px] text-zinc-500">
            Ngày {today} · Bảng tính tham khảo
          </div>
        </div>

        {(customerName || signboard) && (
          <div className="text-[13px] mb-2">
            <b>Khách hàng:</b> {customerName || '—'} {signboard ? `· ${signboard}` : ''}
          </div>
        )}
        <div className="text-[13px] mb-1">
          <b>Lĩnh vực:</b> {snapshot.domain} {snapshot.context_label ? `— ${snapshot.context_label}` : ''}
        </div>
        <div className="text-[13px] mb-3">
          <b>Thời hạn:</b> {snapshot.duration_months} tháng · <b>Tổng:</b> {formatVND(snapshot.total)}
        </div>

        <KaraokeQuoteTable snapshot={snapshot} />

        <p className="mt-4 text-[11.5px] text-zinc-500 leading-relaxed">{snapshot.note}</p>
      </div>
    </div>
  );
}

type QuoteTierRow = {
  id: string;
  label: string;
  base_salary: number;
  coefficient: number;
  amount: number;
};

function KaraokeQuoteTable({ snapshot }: { snapshot: PricingSnapshot }) {
  const tierRows: QuoteTierRow[] = buildQuoteTierRows(snapshot.rows);
  const summaryRows = buildQuoteSummaryRows(snapshot);
  const grandTotal: DataTableSummaryRow = {
    id: 'grand-total',
    cells: [
      {
        id: 'gt-label',
        content: `TỔNG GIÁ TRỊ HỢP ĐỒNG (${snapshot.duration_months} tháng)`,
        align: 'right',
        colSpan: 4,
        tone: 'grand-total',
      },
      {
        id: 'gt-value',
        content: formatVND(snapshot.total),
        align: 'right',
        tone: 'grand-total',
      },
    ],
  };

  return (
    <VcpmcMoneyTable
      columns={quoteColumns}
      rows={tierRows}
      density="comfortable"
      summaryRows={summaryRows}
      grandTotal={grandTotal}
      emptyState={<div className="px-3 py-6 text-center text-sm text-zinc-500">Chưa có dữ liệu tiền.</div>}
    />
  );
}

const quoteColumns: DataTableColumn<QuoteTierRow>[] = [
  {
    key: 'label',
    header: 'Hạng mục',
    align: 'left',
    wrap: 'normal',
    cellClassName: 'text-[12.5px] text-slate-800',
    headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)]',
  },
  {
    key: 'base_salary',
    header: 'MLCS',
    align: 'right',
    wrap: 'nowrap',
    meta: { kind: 'currency' },
    cellClassName: 'text-[12.5px]',
    headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
    render: (row) => formatVND(row.base_salary),
  },
  {
    key: 'x',
    header: '×',
    align: 'center',
    wrap: 'nowrap',
    cellClassName: 'text-[12.5px] text-zinc-500',
    headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-center',
    render: () => '×',
  },
  {
    key: 'coefficient',
    header: 'Hệ số',
    align: 'right',
    wrap: 'nowrap',
    meta: { kind: 'number', tone: 'muted' },
    cellClassName: 'text-[12.5px]',
    headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
    render: (row) => row.coefficient.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 3 }),
  },
  {
    key: 'amount',
    header: 'Thành tiền',
    align: 'right',
    wrap: 'nowrap',
    meta: { kind: 'currency', tone: 'strong' },
    cellClassName: 'text-[12.5px]',
    headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
    render: (row) => formatVND(row.amount),
  },
];

function buildQuoteTierRows(rows: PricingSnapshotRow[]): QuoteTierRow[] {
  return rows
    .filter((r) => r.amount > 0)
    .map((r, i) => ({
      id: `qtier-${i}`,
      label: r.label,
      base_salary: r.base_salary ?? 0,
      coefficient: r.coefficient ?? 0,
      amount: r.amount,
    }));
}

function buildQuoteSummaryRows(snapshot: PricingSnapshot): DataTableSummaryRow[] {
  const supportPercent = snapshot.support_rate_percent ?? 0;
  const rows: DataTableSummaryRow[] = [];

  rows.push({
    id: 'support',
    cells: [
      {
        id: 'support-label',
        content: getSupportRateLabel(supportPercent),
        align: 'right',
        colSpan: 4,
        tone: 'subtle',
      },
      {
        id: 'support-value',
        content: `${supportPercent}%`,
        align: 'right',
        tone: 'subtle',
      },
    ],
  });

  rows.push({
    id: 'subtotal',
    cells: [
      { id: 'subtotal-label', content: 'Cộng', align: 'right', colSpan: 4, tone: 'strong' },
      { id: 'subtotal-value', content: formatVND(snapshot.subtotal), align: 'right', tone: 'strong' },
    ],
  });

  rows.push({
    id: 'vat',
    cells: [
      {
        id: 'vat-label',
        content: `Thuế GTGT ${(snapshot.vat_rate * 100).toFixed(0)}%`,
        align: 'right',
        colSpan: 4,
      },
      {
        id: 'vat-value',
        content: formatVND(snapshot.vat_amount),
        align: 'right',
        meta: { kind: 'currency' },
      },
    ],
  });

  return rows;
}