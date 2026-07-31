import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Select } from '../Select';
import type { DataTablePaginationConfig } from './DataTableTypes';

function buildPageItems(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push('ellipsis');
  for (let current = start; current <= end; current += 1) items.push(current);
  if (end < totalPages - 1) items.push('ellipsis');
  items.push(totalPages);

  return items;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: DataTablePaginationConfig) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rangeFrom = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeTo = Math.min(total, safePage * pageSize);
  const pageItems = buildPageItems(safePage, totalPages);

  return (
    <div className="flex flex-col gap-3 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
        {onPageSizeChange && (
          <Select
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            options={pageSizeOptions.map((option) => ({ value: String(option), label: `${option} / trang` }))}
            size="sm"
            className="w-36"
          />
        )}
        <span>
          Hiển thị <span className="font-semibold text-fg-primary nums">{rangeFrom}–{rangeTo}</span> /{' '}
          <span className="font-semibold text-fg-primary nums">{total.toLocaleString('vi-VN')}</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className="ds-row-action-trigger h-8 w-8 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Trang trước"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        {pageItems.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="inline-flex h-8 w-8 items-center justify-center text-xs text-fg-muted">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-medium nums transition-colors ${item === safePage ? 'bg-[color:var(--text-primary)] text-[color:var(--surface-elevated)] shadow-xs' : 'text-fg-secondary hover:bg-[color:var(--surface-muted)] hover:text-fg-primary'}`}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className="ds-row-action-trigger h-8 w-8 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Trang sau"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="text-xs text-fg-muted nums">
        Trang <span className="font-semibold text-fg-primary">{safePage}</span> / <span className="font-semibold text-fg-primary">{totalPages}</span>
      </div>
    </div>
  );
}
