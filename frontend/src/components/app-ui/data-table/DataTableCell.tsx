import React from 'react';
import type {
  DataTableAlign,
  DataTableCellMeta,
  DataTableCellTone,
  DataTableDensity,
  DataTableWrap,
} from './DataTableTypes';

function alignClassName(align: DataTableAlign) {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function wrapClassName(wrap: DataTableWrap) {
  if (wrap === 'nowrap') return 'whitespace-nowrap';
  if (wrap === 'clamp-1') return 'line-clamp-1';
  if (wrap === 'clamp-2') return 'line-clamp-2';
  if (wrap === 'clamp-3') return 'line-clamp-3';
  return 'whitespace-normal break-words';
}

function metaClassName(meta?: DataTableCellMeta): string {
  if (!meta) return '';
  const parts: string[] = [];
  if (meta.kind === 'currency' || meta.kind === 'number' || meta.kind === 'percent') {
    parts.push('tabular-nums', 'font-medium');
    if (meta.kind === 'currency') parts.push('whitespace-nowrap');
  }
  if (meta.tone === 'muted') parts.push('text-[color:var(--vcpmc-money-tint)]');
  if (meta.tone === 'strong') parts.push('font-semibold', 'text-[color:var(--vcpmc-money-fg)]');
  if (meta.tone === 'success') parts.push('text-lime-700');
  if (meta.tone === 'warning') parts.push('text-amber-700');
  if (meta.tone === 'danger') parts.push('text-rose-700');
  return parts.join(' ');
}

function toneClassName(tone?: DataTableCellTone): string {
  if (tone === 'grand-total') {
    return 'bg-[color:var(--vcpmc-grand-total-bg)] text-[color:var(--vcpmc-grand-total-fg)] font-bold tabular-nums';
  }
  if (tone === 'subtle') {
    return 'bg-[color:var(--vcpmc-table-row-alt)]';
  }
  if (tone === 'strong') {
    return 'font-semibold';
  }
  return '';
}

export function DataTableCell({
  as = 'td',
  children,
  align = 'left',
  width,
  minWidth,
  maxWidth,
  wrap = 'normal',
  tooltip = false,
  className = '',
  title,
  sticky = false,
  stickyOffset,
  meta,
  tone,
}: {
  as?: 'td' | 'th';
  children: React.ReactNode;
  align?: DataTableAlign;
  width?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  wrap?: DataTableWrap;
  tooltip?: boolean;
  className?: string;
  title?: string;
  sticky?: boolean;
  stickyOffset?: string | number;
  meta?: DataTableCellMeta;
  tone?: DataTableCellTone;
}) {
  const Tag = as;
  const derivedTitle =
    title ?? (tooltip && typeof children === 'string' ? children : undefined);

  return (
    <Tag
      className={`ds-table-cell px-4 ${alignClassName(align)} ${wrapClassName(wrap)} ${sticky ? 'sticky right-0 z-[1] bg-[color:var(--surface-elevated)]' : ''} ${metaClassName(meta)} ${toneClassName(tone)} ${className}`}
      style={{ width, minWidth, maxWidth, right: sticky ? stickyOffset : undefined }}
      title={derivedTitle}
      scope={as === 'th' ? 'col' : undefined}
    >
      {children}
    </Tag>
  );
}

export function getDensityCellPadding(density: DataTableDensity) {
  if (density === 'compact') return 'py-2';
  if (density === 'detailed') return 'py-4';
  return 'py-3';
}
