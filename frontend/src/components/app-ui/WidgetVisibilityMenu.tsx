import React, { useEffect, useState } from 'react';
import { LayoutPanelTopIcon, CheckIcon } from 'lucide-react';

const KEY = 'reports.widgetVisibility.v1';

export type SectionKey =
  | 'insights'
  | 'performance'
  | 'signed'
  | 'pending'
  | 'expiring'
  | 'revenue'
  | 'gcn';

export const SECTION_LABELS: Record<SectionKey, string> = {
  insights: 'Insight & Mục tiêu',
  performance: 'Hiệu suất nhân viên',
  signed: 'Hợp đồng đã ký',
  pending: 'Hợp đồng chưa ký',
  expiring: 'Sắp hết hạn',
  revenue: 'Doanh thu',
  gcn: 'GCN',
};

const DEFAULT: Record<SectionKey, boolean> = {
  insights: true,
  performance: true,
  signed: true,
  pending: true,
  expiring: true,
  revenue: true,
  gcn: true,
};

function read(): Record<SectionKey, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export function useWidgetVisibility() {
  const [vis, setVis] = useState<Record<SectionKey, boolean>>(DEFAULT);
  useEffect(() => {
    setVis(read());
  }, []);
  const toggle = (k: SectionKey) => {
    setVis((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const reset = () => {
    setVis(DEFAULT);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  };
  return { vis, toggle, reset };
}

export function WidgetVisibilityMenu({
  vis,
  onToggle,
  onReset,
}: {
  vis: Record<SectionKey, boolean>;
  onToggle: (k: SectionKey) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hiddenCount = Object.values(vis).filter((v) => !v).length;
  return (
    <div className="relative" data-hide-on-present="true">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-zinc-700 ring-1 ring-zinc-900/10 bg-white hover:bg-zinc-50 hover:ring-amber-700/30 transition-all">
        <LayoutPanelTopIcon className="h-4 w-4" />
        Bố cục
        {hiddenCount > 0 && (
          <span className="ml-0.5 px-1.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
            {hiddenCount} ẩn
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl bg-white shadow-[0_14px_40px_-12px_rgba(28,22,16,0.25)] ring-1 ring-zinc-900/10 p-2 origin-top-right animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
              Hiện / Ẩn block
            </p>
            {(Object.keys(SECTION_LABELS) as SectionKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onToggle(k)}
                className="w-full inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[13px] text-zinc-700 hover:bg-amber-50 transition-colors">
                <span>{SECTION_LABELS[k]}</span>
                <span
                  className={`h-4 w-4 rounded inline-flex items-center justify-center ring-1 ${
                    vis[k]
                      ? 'bg-amber-600 ring-amber-700 text-white'
                      : 'bg-white ring-zinc-300'
                  }`}>
                  {vis[k] && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
                </span>
              </button>
            ))}
            <div className="border-t border-zinc-100 mt-1 pt-1">
              <button
                type="button"
                onClick={onReset}
                className="w-full px-2.5 py-1.5 rounded-lg text-[12px] text-zinc-500 hover:text-amber-900 hover:bg-amber-50 transition-colors text-left">
                Khôi phục mặc định
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
