import React from 'react';
import { ClockIcon, ArrowRightIcon } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatCurrency, formatDate } from '../../lib/format';
export function ExpiringList({
  items









}: {items: {id: string;partner: string;contractNo: string;expireDate: string;daysLeft: number;value?: number | null;}[];}) {
  return (
    <ul className="divide-y divide-zinc-100">
      {items.map((it) => {
        const tone =
        it.daysLeft <= 7 ? 'danger' : it.daysLeft <= 30 ? 'warning' : 'orange';
        return (
          <li
            key={it.id}
            className="group relative flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50/70 transition-colors cursor-pointer">
            
            <span
              className={`h-9 w-9 rounded-xl ring-1 flex items-center justify-center shrink-0 ${tone === 'danger' ? 'bg-rose-50 text-rose-600 ring-rose-100' : tone === 'warning' ? 'bg-amber-50 text-amber-600 ring-amber-100' : 'bg-orange-50 text-orange-600 ring-orange-100'}`}>
              
              <ClockIcon className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">
                {it.partner}
              </p>
              <p className="text-[12px] text-zinc-500 truncate font-mono">
                {it.contractNo}
              </p>
            </div>
            <div className="text-right shrink-0">
              <StatusBadge tone={tone} dot>
                {it.daysLeft <= 0 ? 'Hết hạn hôm nay' : `${it.daysLeft} ngày`}
              </StatusBadge>
              <p className="text-[11px] text-zinc-500 mt-1 tabular-nums">
                Hết hạn {formatDate(it.expireDate)}
                {it.value != null && it.value > 0 &&
                <>
                    {' · '}
                    <span className="text-zinc-700 font-medium">
                      {formatCurrency(it.value)}
                    </span>
                  </>
                }
              </p>
            </div>
            <ArrowRightIcon className="h-4 w-4 text-zinc-300 opacity-0 group-hover:opacity-100 group-hover:text-zinc-500 transition-opacity" />
          </li>);

      })}
    </ul>);

}