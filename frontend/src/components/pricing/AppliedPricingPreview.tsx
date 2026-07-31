/**
 * AppliedPricingPreview — "Điều 2 — Bảng tiền bản quyền đã áp dụng"
 * preview shown inside CreateContractPage after user applies a snapshot.
 */
import React, { useState } from 'react';
import { EyeIcon, RotateCcwIcon, TrashIcon, FileDownIcon, CheckCircle2Icon } from 'lucide-react';
import { VcpmcMoneyTable } from '../app-ui/data-table/VcpmcMoneyTable';
import type {
  DataTableColumn,
  DataTableSummaryRow,
} from '../app-ui/data-table';
import type { PricingSnapshot, PricingSnapshotRow } from '../../lib/pricingSnapshot';
import {
  formatVND,
  getSupportRateLabel,
} from '../../lib/pricingSnapshot';

const NAVY = '#4A7202';
const LINE = '#E7EDE1';

type Props = {
  snapshot: PricingSnapshot;
  onRecalculate: () => void;
  onRemove: () => void;
  onExportQuote?: () => void;
};

type TierRow = {
  id: string;
  label: string;
  base_salary: number;
  coefficient: number;
  amount: number;
};

export function AppliedPricingPreview({ snapshot, onRecalculate, onRemove, onExportQuote }: Props) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div
      className="rounded-[12px] overflow-hidden"
      style={{ background: '#fff', border: `1px solid ${LINE}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        style={{ background: '#F6FAF1', borderBottom: `1px solid ${LINE}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center h-8 w-8 rounded-full shrink-0"
            style={{ background: NAVY, color: '#fff' }}
            aria-hidden="true"
          >
            <CheckCircle2Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: NAVY }}>
              Điều 2 · Đã áp dụng
            </div>
            <div className="text-[14px] font-semibold truncate" style={{ color: '#1a1a1a' }}>
              Bảng tiền bản quyền đã áp dụng — Tổng {formatVND(snapshot.total)}
            </div>
            {snapshot.context_label && (
              <div className="text-[12px] text-zinc-500 truncate">{snapshot.context_label}</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PillBtn onClick={() => setShowTable((v) => !v)} icon={<EyeIcon className="h-3.5 w-3.5" />}>
            {showTable ? 'Ẩn bảng' : 'Xem bảng'}
          </PillBtn>
          <PillBtn onClick={onRecalculate} icon={<RotateCcwIcon className="h-3.5 w-3.5" />}>Tính lại</PillBtn>
          {onExportQuote && (
            <PillBtn onClick={onExportQuote} icon={<FileDownIcon className="h-3.5 w-3.5" />}>Xuất bảng tính</PillBtn>
          )}
          <PillBtn
            onClick={onRemove}
            icon={<TrashIcon className="h-3.5 w-3.5" />}
            danger
          >
            Gỡ bảng
          </PillBtn>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: LINE }}>
        <Cell k="Cộng" v={formatVND(snapshot.subtotal)} />
        <Cell k={`GTGT ${(snapshot.vat_rate * 100).toFixed(0)}%`} v={formatVND(snapshot.vat_amount)} />
        <Cell k={`Tổng ${snapshot.duration_months} tháng`} v={formatVND(snapshot.total)} strong />
        <Cell k="Nguồn" v={sourceLabel(snapshot.source)} />
      </div>

      {snapshot.amount_in_words && (
        <div className="px-4 py-2.5 text-[12.5px] italic" style={{ color: '#333', borderTop: `1px solid ${LINE}` }}>
          Bằng chữ: {snapshot.amount_in_words}.
        </div>
      )}

      {showTable && (
        <div className="p-4 overflow-x-auto" style={{ borderTop: `1px solid ${LINE}`, background: '#FAF9F6' }}>
          <AppliedPricingTable snapshot={snapshot} />
        </div>
      )}

      <div
        className="px-4 py-2.5 text-[11.5px] leading-relaxed"
        style={{ color: '#6B665F', borderTop: `1px solid ${LINE}`, background: '#FAF9F6' }}
      >
        {snapshot.note}
      </div>
    </div>
  );
}

function AppliedPricingTable({ snapshot }: { snapshot: PricingSnapshot }) {
  const tierRows = buildTierRows(snapshot.rows);
  const summaryRows = buildSummaryRows(snapshot);
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
      columns={tierColumns}
      rows={tierRows}
      density="comfortable"
      summaryRows={summaryRows}
      grandTotal={grandTotal}
      emptyState={<div className="px-3 py-6 text-center text-sm text-zinc-500">Chưa có dữ liệu tiền.</div>}
    />
  );
}

const tierColumns: DataTableColumn<TierRow>[] = [
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
  },
  {
    key: 'amount',
    header: 'Thành tiền',
    align: 'right',
    wrap: 'nowrap',
    meta: { kind: 'currency', tone: 'strong' },
    cellClassName: 'text-[12.5px]',
    headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
  },
];

function buildTierRows(rows: PricingSnapshotRow[]): TierRow[] {
  return rows
    .filter((r) => r.amount > 0)
    .map((r, i) => ({
      id: `tier-${i}`,
      label: r.label,
      base_salary: r.base_salary ?? 0,
      coefficient: r.coefficient ?? 0,
      amount: r.amount,
    }));
}

function buildSummaryRows(snapshot: PricingSnapshot): DataTableSummaryRow[] {
  const supportPercent = snapshot.support_rate_percent ?? 0;
  const rows: DataTableSummaryRow[] = [];

  if (supportPercent > 0 && supportPercent < 100) {
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
  } else if (supportPercent >= 100) {
    rows.push({
      id: 'collect',
      cells: [
        {
          id: 'collect-label',
          content: getSupportRateLabel(supportPercent),
          align: 'right',
          colSpan: 4,
          tone: 'subtle',
        },
        {
          id: 'collect-value',
          content: `${supportPercent}%`,
          align: 'right',
          tone: 'subtle',
        },
      ],
    });
  }

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

function sourceLabel(s: PricingSnapshot['source']) {
  if (s === 'calculator') return 'Từ bộ tính';
  if (s === 'backend') return 'Backend';
  return 'Nhập tay';
}

function Cell({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="px-4 py-2.5" style={{ background: '#fff' }}>
      <div className="text-[10.5px] uppercase tracking-widest font-semibold text-zinc-500">{k}</div>
      <div
        className="text-[14px] tabular-nums mt-0.5"
        style={{ color: NAVY, fontWeight: strong ? 700 : 600 }}
      >
        {v}
      </div>
    </div>
  );
}

function PillBtn({
  children, onClick, icon, danger,
}: { children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] font-semibold transition-colors"
      style={{
        background: '#fff',
        color: danger ? '#B91C1C' : NAVY,
        border: `1px solid ${danger ? '#FCA5A5' : LINE}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? '#FEE2E2' : '#F6FAF1';
      }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
    >
      {icon}
      {children}
    </button>
  );
}
