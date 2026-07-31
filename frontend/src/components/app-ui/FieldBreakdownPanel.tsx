import React from 'react';
type Item = {
  key: string;
  label: string;
  description: string;
  count: number;
  hasSample: boolean;
};
export function FieldBreakdownPanel({
  items,
  helper



}: {items: Item[];helper?: string;}) {
  const max = items.reduce((m, x) => Math.max(m, x.count), 0) || 1;
  const totalSample = items.reduce((s, x) => s + x.count, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">
          Tổng mẫu hiện tại:{' '}
          <span className="font-semibold text-zinc-900 tabular-nums">
            {totalSample}
          </span>{' '}
          hợp đồng
        </span>
        <span className="text-zinc-400">15 lĩnh vực chuẩn</span>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
        {items.map((it) => {
          const pct = it.count / max * 100;
          return (
            <li key={it.key}>
              <div className="flex items-center justify-between gap-2 text-sm mb-1">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${it.hasSample ? 'bg-amber-600' : 'bg-zinc-300'}`} />
                  
                  <span
                    className={`truncate ${it.hasSample ? 'text-zinc-800 font-medium' : 'text-zinc-500'}`}
                    title={it.description}>
                    
                    {it.label}
                  </span>
                </span>
                <span className="text-xs tabular-nums shrink-0">
                  {it.hasSample ?
                  <span className="font-semibold text-zinc-900">
                      {it.count}
                    </span> :

                  <span className="text-zinc-400 italic text-[11px]">
                      Chưa có
                    </span>
                  }
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${it.hasSample ? 'bg-gradient-to-r from-amber-500 to-amber-600' : 'bg-zinc-200'}`}
                  style={{
                    width: `${it.hasSample ? Math.max(pct, 4) : 0}%`
                  }} />
                
              </div>
            </li>);

        })}
      </ul>

      {helper &&
      <p className="text-[11px] text-zinc-500 leading-relaxed pt-3 border-t border-zinc-100">
          {helper}
        </p>
      }
    </div>);

}