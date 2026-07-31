import React from 'react';
import { FileTextIcon } from 'lucide-react';
import { formatNumber } from '../../lib/format';
type StatTone = 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet';
const dotMap: Record<StatTone, string> = {
  indigo: 'bg-amber-600',
  emerald: 'bg-lime-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  cyan: 'bg-amber-600',
  violet: 'bg-amber-600'
};
export function SummaryHero({
  label,
  title,
  description,
  stats









}: {label: string;title: string;description?: string;stats: {label: string;value: number | string;tone: StatTone;}[];}) {
  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-zinc-900/[0.06] shadow-[0_1px_2px_rgba(15,15,25,0.04),0_2px_6px_rgba(15,15,25,0.03)]">
      {/* Light premium gradient base */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-white via-amber-50/30 to-amber-50/40" />
      
      {/* Soft radial glow */}
      <div
        aria-hidden
        className="absolute -top-20 -right-20 h-72 w-72 rounded-full"
        style={{
          background:
          'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0) 65%)',
          filter: 'blur(8px)'
        }} />
      
      {/* Subtle document lines pattern (right side) */}
      <svg
        aria-hidden
        viewBox="0 0 800 200"
        preserveAspectRatio="xMaxYMid slice"
        className="absolute inset-y-0 right-0 h-full w-auto opacity-[0.05] text-zinc-900 pointer-events-none"
        fill="none">
        
        <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <line x1="540" y1="40" x2="780" y2="40" />
          <line x1="540" y1="58" x2="740" y2="58" />
          <line x1="540" y1="76" x2="760" y2="76" />
          <line x1="540" y1="94" x2="720" y2="94" />
          <line x1="540" y1="112" x2="755" y2="112" />
          <line x1="540" y1="130" x2="700" y2="130" />
          <line x1="540" y1="148" x2="745" y2="148" />
          <line x1="540" y1="166" x2="715" y2="166" />
        </g>
      </svg>
      {/* Top accent line */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-600/40 to-transparent" />
      

      <div className="relative px-5 sm:px-6 py-5 flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
        {/* Title block */}
        <div className="flex items-start gap-3 lg:max-w-xs shrink-0">
          <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-600/25">
            <FileTextIcon className="h-5 w-5 text-white" />
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
            
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
              {label}
            </p>
            <h2 className="mt-0.5 text-[15px] font-semibold text-zinc-900 tracking-tight leading-snug">
              {title}
            </h2>
            {description &&
            <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">
                {description}
              </p>
            }
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3 lg:border-l lg:border-zinc-200/70 lg:pl-8">
          {stats.map((s) =>
          <div key={s.label} className="flex flex-col">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500">
                <span
                className={`h-1.5 w-1.5 rounded-full ${dotMap[s.tone]}`} />
              
                {s.label}
              </span>
              <span className="mt-0.5 text-xl font-semibold text-zinc-900 tracking-tight tabular-nums">
                {typeof s.value === 'number' ? formatNumber(s.value) : s.value}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>);

}