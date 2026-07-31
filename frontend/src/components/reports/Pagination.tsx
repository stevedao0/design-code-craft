import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
  pageSize: number;
  rangeFrom: number;
  rangeTo: number;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  pageSize,
  rangeFrom,
  rangeTo,
}: PaginationProps) {
  return (
    <div
      className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t"
      style={{ borderColor: 'var(--border-default, #e6e0d7)', background: 'var(--surface)', color: 'var(--text-secondary)', zIndex: 50, position: 'relative' }}
    >
      <div className="text-xs">
        Hiển thị{' '}
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{rangeFrom}–{rangeTo}</span>
        {' / '}
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{total.toLocaleString('vi-VN')}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg ring-1 ring-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Trang trước"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="px-2 text-xs tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {page}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg ring-1 ring-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Trang sau"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
