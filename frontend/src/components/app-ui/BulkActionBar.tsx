import React from 'react';
import { XIcon, CheckSquareIcon } from 'lucide-react';
export type BulkAction = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  disabledReason?: string;
};
export function BulkActionBar({
  count,
  actions,
  onClear




}: {count: number;actions: BulkAction[];onClear: () => void;}) {
  if (count === 0) return null;
  return (
    <div
      className="relative overflow-hidden flex flex-wrap items-center gap-2 px-4 py-2.5 text-white border-b border-white/10"
      style={{
        background:
        'linear-gradient(90deg, #0a0a14 0%, #1e1b4b 50%, #4c1d95 100%)',
        animation: 'bulkIn 200ms cubic-bezier(0.32,0.72,0,1)'
      }}>
      
      {/* glow */}
      <div
        aria-hidden
        className="absolute -top-10 left-1/3 h-32 w-32 rounded-full"
        style={{
          background:
          'radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 65%)',
          filter: 'blur(8px)'
        }} />
      
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/70 to-transparent" />
      

      <div className="relative flex items-center gap-2 mr-2">
        <span className="h-7 w-7 rounded-lg bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur-sm flex items-center justify-center">
          <CheckSquareIcon className="h-3.5 w-3.5 text-amber-200" />
        </span>
        <span className="inline-flex items-center justify-center h-6 min-w-7 px-1.5 rounded-md bg-amber-600/25 ring-1 ring-inset ring-amber-500/30 text-[11px] font-bold text-white tabular-nums">
          {count}
        </span>
        <span className="text-sm font-medium text-zinc-100">
          hợp đồng đã chọn
        </span>
      </div>

      <div className="relative flex flex-wrap items-center gap-1.5 flex-1">
        {actions.map((a, i) =>
        a.disabled ? (
          <div
            key={i}
            title={a.disabledReason || 'Khong co hanh dong'}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium ring-1 ring-inset bg-white/5 text-zinc-500 ring-white/10 cursor-not-allowed">
            {a.icon && <span className="h-3.5 w-3.5 opacity-50">{a.icon}</span>}
            {a.label}
          </div>
        ) : (
        <button
          key={i}
          type="button"
          onClick={a.onClick}
          className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium ring-1 ring-inset transition-all backdrop-blur-sm ${a.tone === 'danger' ? 'bg-rose-500/15 text-rose-200 ring-rose-400/30 hover:bg-rose-500/25' : 'bg-white/[0.08] text-white ring-white/15 hover:bg-white/[0.16] hover:ring-white/25'}`}>

            {a.icon && <span className="h-3.5 w-3.5">{a.icon}</span>}
            {a.label}
          </button>
        )
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        className="relative h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors ring-1 ring-inset ring-transparent hover:ring-white/10">
        
        <XIcon className="h-3.5 w-3.5" />
        Bỏ chọn
      </button>
      <style>{`
        @keyframes bulkIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>);

}