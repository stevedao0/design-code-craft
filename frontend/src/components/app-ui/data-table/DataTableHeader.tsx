import React from 'react';
import type { DataTableDensity } from './DataTableTypes';

export function DataTableHeader({
  children,
  sticky = false,
  density = 'comfortable',
  className = '',
}: {
  children: React.ReactNode;
  sticky?: boolean;
  density?: DataTableDensity;
  className?: string;
}) {
  return (
    <thead
      className={`ds-table-head ${sticky ? 'sticky top-0 z-[1]' : ''} ${density === 'compact' ? 'text-[11px]' : 'text-[12px]'} ${className}`}
    >
      {children}
    </thead>
  );
}
