import React from 'react';
import type { DataTableDensity } from './DataTableTypes';

function densityClassName(density: DataTableDensity) {
  if (density === 'compact') return 'ds-table-row-compact';
  if (density === 'detailed') return 'ds-table-row-detailed';
  return 'ds-table-row-comfortable';
}

export function DataTableRow({
  children,
  density = 'comfortable',
  selected = false,
  clickable = false,
  disabled = false,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  density?: DataTableDensity;
  selected?: boolean;
  clickable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={disabled ? undefined : onClick}
      aria-selected={selected || undefined}
      className={`ds-table-row ${densityClassName(density)} ${selected ? 'bg-[color:var(--accent-primary-soft)]' : ''} ${clickable && !disabled ? 'cursor-pointer' : ''} ${disabled ? 'opacity-60' : ''} ${className}`}
    >
      {children}
    </tr>
  );
}
