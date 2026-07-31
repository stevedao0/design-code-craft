import React from 'react';

export function DataTableToolbar({
  leading,
  trailing,
  className = '',
}: {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  if (!leading && !trailing) return null;

  return (
    <div className={`ds-toolbar flex flex-col gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{leading}</div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{trailing}</div>
    </div>
  );
}
