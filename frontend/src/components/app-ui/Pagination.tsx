import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Select } from './Select';
import { PAGE_SIZE_OPTIONS } from '../../data/contractOptions';
export function Pagination({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  total,
  rangeFrom,
  rangeTo









}: {page: number;totalPages: number;pageSize: number;onPageChange: (p: number) => void;onPageSizeChange: (s: number) => void;total: number;rangeFrom: number;rangeTo: number;}) {
  const visiblePages = (() => {
    const pages: (number | 'ellipsis')[] = [];
    const max = totalPages;
    const cur = page;
    const push = (n: number | 'ellipsis') => pages.push(n);
    if (max <= 7) {
      for (let i = 1; i <= max; i++) push(i);
    } else {
      push(1);
      if (cur > 3) push('ellipsis');
      const start = Math.max(2, cur - 1);
      const end = Math.min(max - 1, cur + 1);
      for (let i = start; i <= end; i++) push(i);
      if (cur < max - 2) push('ellipsis');
      push(max);
    }
    return pages;
  })();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 py-3 border-t border-zinc-100/80 bg-zinc-50/30">
      <div className="flex items-center gap-3 text-xs text-zinc-600">
        <Select
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={PAGE_SIZE_OPTIONS}
          size="sm"
          className="w-32" />
        
        <span className="hidden sm:inline">
          Hiển thị{' '}
          <span className="font-semibold text-zinc-900 tabular-nums">
            {rangeFrom}–{rangeTo}
          </span>{' '}
          /{' '}
          <span className="font-semibold text-zinc-900 tabular-nums">
            {total.toLocaleString('vi-VN')}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-1 flex-wrap justify-end min-w-0">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg ring-1 ring-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:ring-zinc-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:ring-zinc-200 transition-colors shrink-0"
          aria-label="Trang trước">

          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        {visiblePages.map((p, i) =>
        p === 'ellipsis' ?
        <span
          key={`e-${i}`}
          className="h-8 w-8 inline-flex items-center justify-center text-xs text-zinc-400 shrink-0">

              …
            </span> :

        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          className={`h-8 min-w-8 px-2 inline-flex items-center justify-center text-xs font-medium rounded-lg transition-colors tabular-nums shrink-0 ${p === page ? 'bg-zinc-900 text-white shadow-sm shadow-zinc-900/15' : 'text-zinc-700 hover:bg-zinc-100'}`}>

              {p}
            </button>

        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg ring-1 ring-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:ring-zinc-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:ring-zinc-200 transition-colors shrink-0"
          aria-label="Trang sau">

          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="text-xs text-zinc-600 tabular-nums">
        Trang <span className="font-semibold text-zinc-900">{page}</span> /{' '}
        <span className="font-semibold text-zinc-900">{totalPages}</span>
      </div>
    </div>);

}