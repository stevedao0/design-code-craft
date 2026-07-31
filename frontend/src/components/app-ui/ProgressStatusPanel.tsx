import React from 'react';
type Tone =
'success' |
'warning' |
'danger' |
'neutral' |
'info' |
'violet' |
'orange';
const fillMap: Record<Tone, string> = {
  success: 'bg-gradient-to-r from-lime-400 to-lime-500',
  warning: 'bg-gradient-to-r from-amber-400 to-amber-500',
  danger: 'bg-gradient-to-r from-rose-400 to-rose-500',
  info: 'bg-gradient-to-r from-amber-500 to-amber-600',
  violet: 'bg-gradient-to-r from-amber-500 to-amber-600',
  orange: 'bg-gradient-to-r from-orange-400 to-orange-500',
  neutral: 'bg-gradient-to-r from-zinc-400 to-zinc-500'
};
const dotMap: Record<Tone, string> = {
  success: 'bg-lime-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-amber-600',
  violet: 'bg-amber-600',
  orange: 'bg-orange-500',
  neutral: 'bg-zinc-400'
};
export function ProgressStatusPanel({
  items,
  mode = 'percent',
  helper












}: {items: {name: string;value: number;tone: Tone;}[]; /**
   * - 'percent': bar width = value/sum (default; fits mutually-exclusive buckets)
   * - 'relative': bar width = value/max (fits overlapping or skewed buckets)
   */mode?: 'percent' | 'relative';helper?: string;}) {const total = items.reduce((s, x) => s + x.value, 0) || 1;const max = items.reduce((m, x) => Math.max(m, x.value), 0) || 1;return (
    <div className="flex flex-col gap-4">
      {mode === 'percent' &&
      <div className="flex h-2 rounded-full overflow-hidden bg-zinc-100 ring-1 ring-zinc-900/5">
          {items.map((it) => {
          const pct = it.value / total * 100;
          return (
            <div
              key={it.name}
              className={`${fillMap[it.tone]} transition-all`}
              style={{
                width: `${pct}%`
              }}
              title={`${it.name}: ${it.value}`} />);


        })}
        </div>
      }

      <ul className="flex flex-col gap-3">
        {items.map((it) => {
          const pctOfTotal = it.value / total * 100;
          const widthPct =
          mode === 'relative' ? it.value / max * 100 : pctOfTotal;
          return (
            <li key={it.name}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="inline-flex items-center gap-2 text-zinc-700">
                  <span className={`h-2 w-2 rounded-full ${dotMap[it.tone]}`} />
                  {it.name}
                </span>
                <span className="text-zinc-500 text-xs tabular-nums">
                  <span className="font-semibold text-zinc-900">
                    {it.value.toLocaleString('vi-VN')}
                  </span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className={`h-full ${fillMap[it.tone]} transition-all duration-500`}
                  style={{
                    width: `${widthPct}%`
                  }} />
                
              </div>
            </li>);

        })}
      </ul>

      {helper &&
      <p className="text-[11px] text-zinc-500 leading-relaxed pt-1 border-t border-zinc-100">
          {helper}
        </p>
      }
    </div>);

}