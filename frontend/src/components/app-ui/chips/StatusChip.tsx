import React from 'react';
import { StatusBadge } from '../StatusBadge';

export function StatusChip({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet' | 'orange';
  dot?: boolean;
  className?: string;
}) {
  return (
    <StatusBadge tone={tone} dot={dot} className={className}>
      {children}
    </StatusBadge>
  );
}
