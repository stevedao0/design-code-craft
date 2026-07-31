import React, { useEffect } from 'react';
import { XIcon } from 'lucide-react';

export type DrilldownItem = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative' | 'warn';
  bar?: number; // 0..100 — for visual proportion
};

export type DrilldownDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  primary?: { label: string; value: string; hint?: string };
  items?: DrilldownItem[];
  children?: React.ReactNode;
};

/**
 * Slide-in panel bên phải. Click overlay hoặc nút X để đóng.
 * Dùng để xem chi tiết khi click vào KPI ở Reports.
 */
export function DrilldownDrawer({
  open,
  onClose,
  title,
  subtitle,
  primary,
  items,
  children,
}: DrilldownDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[80] transition-opacity duration-300 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}>
      <div
        className="absolute inset-0 bg-zinc-950/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`absolute right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-[ -16px_0_40px_-12px_rgba(28,22,16,0.25)] ring-1 ring-zinc-900/5 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}>
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-100 bg-gradient-to-b from-amber-50/40 to-transparent">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 truncate">{title}</h2>
            {subtitle && (
              <p className="text-[12px] text-zinc-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            aria-label="Đóng">
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {primary && (
            <div className="rounded-xl bg-gradient-to-br from-amber-50 via-white to-amber-50/40 ring-1 ring-amber-700/15 p-4">
              <p className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">
                {primary.label}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-900 tracking-tight">
                {primary.value}
              </p>
              {primary.hint && (
                <p className="mt-1 text-[12px] text-zinc-500">{primary.hint}</p>
              )}
            </div>
          )}

          {items && items.length > 0 && (
            <div className="space-y-2.5">
              {items.map((it, i) => (
                <div key={i} className="rounded-lg ring-1 ring-zinc-100 hover:ring-amber-700/20 transition-all p-3 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-zinc-700 truncate">
                      {it.label}
                    </span>
                    <span
                      className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${
                        it.tone === 'positive'
                          ? 'text-lime-700'
                          : it.tone === 'negative'
                            ? 'text-rose-700'
                            : it.tone === 'warn'
                              ? 'text-amber-700'
                              : 'text-zinc-900'
                      }`}>
                      {it.value}
                    </span>
                  </div>
                  {typeof it.bar === 'number' && (
                    <div className="mt-2 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-700 transition-[width] duration-500"
                        style={{ width: `${Math.max(0, Math.min(100, it.bar))}%` }}
                      />
                    </div>
                  )}
                  {it.hint && (
                    <p className="mt-1.5 text-[11px] text-zinc-500">{it.hint}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {children}
        </div>
      </aside>
    </div>
  );
}
