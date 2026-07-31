import React, { useId, useState } from 'react';

export type RoyaltyTabKey = 'input' | 'table' | 'manual';

export type RoyaltyTotals = {
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  amountInWords?: string;
};

function formatVnd(value: number | undefined | null): string {
  if (!value) return '0';
  return Math.round(Number(value)).toLocaleString('vi-VN').replace(/,/g, '.');
}

const TABS: { key: RoyaltyTabKey; label: string; hint: string }[] = [
  { key: 'input', label: 'Nhập liệu', hint: 'Thông số tính tiền bản quyền' },
  { key: 'table', label: 'Bảng hợp đồng', hint: 'Bảng sẽ chèn vào file Word' },
  { key: 'manual', label: 'Đối chiếu', hint: 'Ghi đè số tiền thủ công' },
];

/**
 * RoyaltySection — gom toàn bộ phần tiền bản quyền vào MỘT khối duy nhất.
 *
 * Ba tab dùng chung một nguồn số liệu (kết quả tính từ backend). Component này
 * chỉ trình bày, không tự tính bất kỳ công thức tiền nào.
 */
export function RoyaltySection({
  totals,
  inputPanel,
  tablePanel,
  manualPanel,
  actions,
  defaultTab = 'input',
}: {
  totals?: RoyaltyTotals;
  inputPanel: React.ReactNode;
  tablePanel: React.ReactNode;
  manualPanel: React.ReactNode;
  actions?: React.ReactNode;
  defaultTab?: RoyaltyTabKey;
}) {
  const [tab, setTab] = useState<RoyaltyTabKey>(defaultTab);
  const baseId = useId();
  const hasTotals = !!totals && totals.total > 0;

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E1EBD4] bg-white">
      {/* Tabs */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[#E1EBD4] bg-[#F7FBF1] px-2 py-2">
        <div
          role="tablist"
          aria-label="Tiền bản quyền"
          className="flex min-w-0 gap-1 overflow-x-auto"
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                id={`${baseId}-tab-${t.key}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={`${baseId}-panel-${t.key}`}
                title={t.hint}
                onClick={() => setTab(t.key)}
                className={[
                  'shrink-0 rounded-[9px] px-3 py-2 text-[12px] font-semibold transition-colors min-h-[36px]',
                  active
                    ? 'bg-lime-700 text-white shadow-sm'
                    : 'text-zinc-600 hover:bg-white hover:text-lime-800',
                ].join(' ')}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>

      {/* Panels */}
      {TABS.map((t) => (
        <div
          key={t.key}
          id={`${baseId}-panel-${t.key}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${t.key}`}
          hidden={tab !== t.key}
          className="p-3 sm:p-4"
        >
          {t.key === 'input' && inputPanel}
          {t.key === 'table' && tablePanel}
          {t.key === 'manual' && manualPanel}
        </div>
      ))}

      {/* Dải tổng duy nhất */}
      {hasTotals && (
        <div className="border-t border-[#E1EBD4] bg-[#4A7202] px-3 py-3 text-white sm:px-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div className="min-w-0">
              <dt className="text-[10.5px] uppercase tracking-[0.08em] text-white/70">Cộng</dt>
              <dd className="truncate text-[13px] font-semibold tabular-nums">
                {formatVnd(totals!.subtotal)} đ
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10.5px] uppercase tracking-[0.08em] text-white/70">
                Thuế GTGT {totals!.vatRate}%
              </dt>
              <dd className="truncate text-[13px] font-semibold tabular-nums">
                {formatVnd(totals!.vatAmount)} đ
              </dd>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-2">
              <dt className="text-[10.5px] uppercase tracking-[0.08em] text-white/70">
                Tổng giá trị 12 tháng
              </dt>
              <dd className="truncate text-[17px] font-bold tabular-nums sm:text-[19px]">
                {formatVnd(totals!.total)} đ
              </dd>
            </div>
          </dl>
          {totals!.amountInWords && (
            <p className="mt-2 border-t border-white/20 pt-2 text-[11.5px] italic text-white/85">
              Bằng chữ: {totals!.amountInWords}/.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default RoyaltySection;