import React from 'react';
export function TableSkeleton({
  rows = 8,
  cols = 6



}: {rows?: number;cols?: number;}) {
  return (
    <div className="divide-y divide-zinc-100/80">
      {Array.from({
        length: rows
      }).map((_, r) =>
      <div key={r} className="flex items-center gap-4 px-5 py-4">
          {Array.from({
          length: cols
        }).map((__, c) =>
        <div
          key={c}
          className={`relative overflow-hidden rounded-md bg-zinc-100/80 ${c === 0 ? 'h-3.5 w-32' : c === 1 ? 'h-3.5 flex-1 max-w-xs' : 'h-3.5 w-24'}`}>
          
              <div
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent"
            style={{
              animation: 'shimmer 1.6s infinite'
            }} />
          
            </div>
        )}
        </div>
      )}
    </div>);

}