import React from 'react';

export type Tab = {
  value: string;
  label: string;
  count?: number;
};

/**
 * Tabs — shared segmented control.
 *
 *  - Selected state uses deep teal-blue (brand), not indigo.
 *  - Horizontal scrolling on narrow viewports, edge affordance for overflow.
 *  - Accessible: role="tablist" / role="tab" + aria-selected.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: Tab[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="ds-tablist-scroll" role="presentation">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 min-w-max"
      >
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.value)}
              className={`relative inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all ${
                active
                  ? 'bg-[color:var(--accent-primary-soft)] text-accent-primary font-semibold ring-1 ring-[color:var(--accent-primary)]/30'
                  : 'text-fg-muted hover:bg-surface-muted hover:text-fg-primary'
              }`}
            >
              {t.label}
              {t.count != null && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                    active
                      ? 'bg-accent-primary text-white'
                      : 'bg-surface text-fg-muted ring-1 ring-subtle'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}