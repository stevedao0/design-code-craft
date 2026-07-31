import React from 'react';
import { Chip } from './Chip';

export function DomainChip({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Chip
      tone="info"
      className={`border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] ${className}`}
    >
      {children}
    </Chip>
  );
}
