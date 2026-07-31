import React from 'react';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
};
export function DataTable<
  T extends { id: string | number }>(
{
  columns,
  rows,
  loading,
  empty,
  onRowClick,
  stickyHeader = true,
  zebra = true,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  zebra?: boolean;
}) {
  if (loading) return <LoadingState />;
  if (!rows.length) return empty ?? <EmptyState />;
  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[72vh] rounded-t-xl">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.key}
                className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 bg-gradient-to-b from-[#faf6ec] to-[#f5efe2] border-b border-[#e3d2b3]/70 ${
                  stickyHeader ? 'sticky top-0 z-10 shadow-[0_1px_0_0_rgba(200,153,104,0.25)]' : ''
                } ${
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                } ${i === 0 ? 'first:rounded-tl-xl' : ''} ${i === columns.length - 1 ? 'last:rounded-tr-xl' : ''}`}
                style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={`group transition-colors ${
                zebra && idx % 2 === 1 ? 'bg-[#fbf7ec]/40' : 'bg-white'
              } hover:bg-[#fcf2e3]/50 ${onRowClick ? 'cursor-pointer' : ''}`}>
              {columns.map((c, ci) => (
                <td
                  key={c.key}
                  className={`px-5 py-3.5 text-zinc-700 border-b border-[#f1ede4] group-hover:border-[#e3d2b3]/50 transition-colors ${
                    c.align === 'right' ? 'text-right nums' : c.align === 'center' ? 'text-center' : ''
                  } ${ci === 0 ? 'relative' : ''}`}>
                  {ci === 0 && (
                    <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#c89968] opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>);
}
