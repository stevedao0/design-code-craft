import React from 'react';
import { Select as FSelect } from '../Select';

type SelectProps = {
  value?: string;
  onValueChange?: (v: string) => void;
  children?: React.ReactNode;
};

function SelectComponent({ value, onValueChange, children }: SelectProps) {
  return (
    <FSelect
      value={value || ''}
      onChange={onValueChange || (() => {})}
      options={[]}
      placeholder="Chọn..."
    >
      {children}
    </FSelect>
  );
}

function SelectTrigger({ children, className = '' }: React.HTMLAttributes<HTMLDivElement> & {}) {
  return (
    <div className={`ds-select ds-focus-ring flex h-9 w-full items-center justify-between rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] px-3 py-2 text-sm ${className}`}>
      {children}
    </div>
  );
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  return <span>{placeholder || 'Chọn...'}</span>;
}

function SelectContent({ children }: { children?: React.ReactNode }) {
  return (
    <div className="ds-dropdown ds-dropdown-portal absolute z-50 mt-1 max-h-96 min-w-[8rem] overflow-hidden rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface)] p-1 shadow-lg">
      {children}
    </div>
  );
}

function SelectItem({ value, children }: { value: string; children?: React.ReactNode }) {
  return (
    <div className="ds-dropdown-item relative flex w-full cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-[color:var(--surface-muted)]">
      {children}
    </div>
  );
}

export const Select = Object.assign(SelectComponent, {
  Trigger: SelectTrigger,
  Value: SelectValue,
  Content: SelectContent,
  Item: SelectItem,
});
