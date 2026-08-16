/**
 * Compact year selector — replaces horizontal year bar.
 *
 * Layout: ‹ [YEAR ▼] ›
 *
 * - Prev/Next arrow buttons move through available years (DESC sorted).
 *   Disabled when no previous/next year exists.
 * - Dropdown shows all available years from the backend API.
 * - Current calendar year is marked with "Hiện tại".
 * - Single source of truth: onChange updates parent state.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from 'lucide-react';
import { getYears, KpiFieldYearOption } from '@/lib/kpiFieldClient';

interface YearSelectorProps {
  year: number;
  onChange: (year: number) => void;
  className?: string;
}

export function YearSelector({ year, onChange, className = '' }: YearSelectorProps) {
  const [options, setOptions] = useState<KpiFieldYearOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await getYears();
        if (mounted) {
          setOptions(r.years);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const sorted = useMemo(() => options.slice().sort((a, b) => b.year - a.year), [options]);
  const idx = useMemo(() => sorted.findIndex(o => o.year === year), [sorted, year]);
  const hasPrev = idx >= 0 && idx < sorted.length - 1; // smaller index = newer year; prev = older = higher idx
  const hasNext = idx > 0;

  const goPrev = () => {
    if (hasPrev) onChange(sorted[idx + 1].year);
  };
  const goNext = () => {
    if (hasNext) onChange(sorted[idx - 1].year);
  };

  const currentLabel = sorted.find(o => o.year === year);

  return (
    <div className={`inline-flex items-center gap-1 rounded-lg border p-0.5 ${className}`}
      style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}
    >
      <button
        type="button"
        onClick={goPrev}
        disabled={!hasPrev}
        aria-label="Năm trước"
        className="rounded-md px-1.5 py-1 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center justify-center rounded-md px-3 py-1 text-[13px] font-semibold tabular-nums transition-colors"
          style={{
            background: '#c95867',
            color: '#ffffff',
            minWidth: 72,
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{loading ? '…' : year}</span>
          <ChevronDownIcon className="ml-1 h-3.5 w-3.5" />
        </button>
        {currentLabel?.is_current && (
          <span
            className="rounded-full px-1.5 py-px text-[9.5px] font-medium"
            style={{
              background: 'color-mix(in srgb, var(--accent-success) 14%, white)',
              color: 'var(--accent-success)',
            }}
          >
            Hiện tại
          </span>
        )}
        {open && sorted.length > 0 && (
          <div
            className="absolute left-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border shadow-xl"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface)', minWidth: 160 }}
            role="listbox"
          >
            {sorted.map(o => (
              <button
                key={o.year}
                type="button"
                onClick={() => {
                  onChange(o.year);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary,#4A7202)_8%,white)]"
                style={{
                  color: 'var(--text-primary)',
                  background: o.year === year ? 'color-mix(in srgb, var(--accent-primary, #4A7202) 12%, white)' : undefined,
                }}
              >
                <span className="tabular-nums font-medium">{o.year}</span>
                {o.is_current && (
                  <span
                    className="rounded-full px-1.5 py-px text-[9px] font-medium"
                    style={{
                      background: 'color-mix(in srgb, var(--accent-success) 14%, white)',
                      color: 'var(--accent-success)',
                    }}
                  >
                    Hiện tại
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={goNext}
        disabled={!hasNext}
        aria-label="Năm sau"
        className="rounded-md px-1.5 py-1 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
