import React, { useState } from 'react';
import { fmtVND } from './kpiClient';

interface BarChartProps {
  data: { label: string; value: number }[];
  color?: string;
  unit?: 'million' | 'billion';
}

function formatVndShort(v: number, unit: 'million' | 'billion'): string {
  if (!v) return '0';
  if (unit === 'billion') {
    const billions = v / 1e9;
    if (billions >= 1) return `${billions.toFixed(billions >= 100 ? 0 : 1)} tỷ`;
    const millions = v / 1e6;
    return `${millions.toFixed(0)} tr`;
  }
  const millions = v / 1e6;
  if (millions >= 1) return `${millions.toFixed(millions >= 100 ? 0 : 1)} tr`;
  return new Intl.NumberFormat('vi-VN').format(v);
}

export function BarChart({
  data,
  color = 'var(--accent-primary, #4A7202)',
  unit = 'billion',
}: BarChartProps) {
  const max = Math.max(1, ...data.map(d => d.value));
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="relative w-full" style={{ height: '240px' }}>
      <div className="absolute inset-0 flex items-end gap-1 sm:gap-2 px-1">
        {data.map((d, i) => {
          const h = max === 0 ? 0 : (d.value / max) * 100;
          const isHovered = hovered === i;
          const empty = d.value === 0;
          return (
            <div
              key={d.label}
              className="group relative flex flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ height: '100%' }}
            >
              {/* Value label */}
              <div
                className="mb-0.5 text-[9px] tabular-nums leading-tight text-center"
                style={{
                  color: empty ? 'var(--text-muted, #8a847c)' : 'var(--text-primary, #1f1d1a)',
                  fontSize: '9px',
                  minHeight: '12px',
                }}
                title={empty ? 'Chưa phát sinh' : `${d.label}: ${fmtVND(d.value)}`}
              >
                {empty ? '—' : formatVndShort(d.value, unit)}
              </div>
              {/* Tooltip */}
              <div
                className="pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-medium opacity-0 shadow-sm transition-opacity group-hover:opacity-100 z-10"
                style={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                  opacity: isHovered ? 1 : 0,
                }}
              >
                {d.label}: {empty ? 'Chưa phát sinh' : fmtVND(d.value)}
              </div>
              {/* Bar */}
              <div className="relative w-full" style={{ height: 'calc(100% - 16px)' }}>
                <div
                  className="absolute bottom-0 w-full rounded-t-sm transition-all duration-200"
                  style={{
                    height: empty ? '2px' : `${Math.max(h, 4)}%`,
                    background: empty
                      ? 'var(--border-default, #e6e0d7)'
                      : isHovered ? 'var(--accent-plum, #6d365b)' : color,
                    minHeight: '2px',
                    opacity: empty ? 0.6 : 1,
                  }}
                />
              </div>
              {/* Label */}
              <div
                className="mt-1 text-[9px]"
                style={{ color: 'var(--text-muted, #8a847c)' }}
              >
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}