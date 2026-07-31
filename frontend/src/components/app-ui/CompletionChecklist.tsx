import React from 'react';
import { CheckCircle2Icon, CircleIcon } from 'lucide-react';
type CheckItem = {
  label: string;
  completed: boolean;
};
export function CompletionChecklist({ items }: {items: CheckItem[];}) {
  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const progress = Math.round(completedCount / totalCount * 100);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Hoàn thành
        </span>
        <span className="text-xs font-semibold text-amber-800 tabular-nums">
          {completedCount}/{totalCount}
        </span>
      </div>
      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-600 to-amber-600 transition-all duration-300"
          style={{
            width: `${progress}%`
          }} />
        
      </div>
      <ul className="space-y-2">
        {items.map((item, i) =>
        <li key={i} className="flex items-center gap-2">
            {item.completed ?
          <CheckCircle2Icon className="h-4 w-4 text-lime-600 shrink-0" /> :

          <CircleIcon className="h-4 w-4 text-zinc-300 shrink-0" />
          }
            <span
            className={`text-xs ${item.completed ? 'text-zinc-700 font-medium' : 'text-zinc-500'}`}>
            
              {item.label}
            </span>
          </li>
        )}
      </ul>
    </div>);

}