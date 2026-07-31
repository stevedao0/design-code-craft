import React from 'react';
import { Chip } from './Chip';

export function CountChip({
  value,
  label,
  className = '',
}: {
  value: number | string;
  label?: string;
  className?: string;
}) {
  return <Chip className={`gap-1 tabular-nums ${className}`}>{label ? `${label}: ${value}` : value}</Chip>;
}
