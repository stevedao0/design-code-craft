import React from 'react';
import { StatusBadge } from '../StatusBadge';

export function MoneyBadge({
  value,
  currency = '₫',
  tone = 'neutral',
  className,
}: {
  value: string | number;
  currency?: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet' | 'orange';
  className?: string;
}) {
  return (
    <StatusBadge tone={tone} className={className}>
      <span className="tabular-nums">{value}</span>
      <span>{currency}</span>
    </StatusBadge>
  );
}
