import React from 'react';
import { Button } from '../Button';
import type { DataTableDensity } from './DataTableTypes';

const OPTIONS: Array<{ value: DataTableDensity; label: string }> = [
  { value: 'compact', label: 'Gọn' },
  { value: 'comfortable', label: 'Tiêu chuẩn' },
  { value: 'detailed', label: 'Chi tiết' },
];

export function DataTableDensityToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: DataTableDensity;
  onChange: (value: DataTableDensity) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--surface-muted)] p-1 ring-1 ring-[color:var(--border-subtle)]">
      {OPTIONS.map((option) => {
        const active = option.value === value;

        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            disabled={disabled}
            className={`min-w-[72px] ${active ? 'shadow-xs' : 'border-transparent shadow-none'}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
