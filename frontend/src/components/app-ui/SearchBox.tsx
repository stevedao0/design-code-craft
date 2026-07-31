import React from 'react';
import { SearchIcon } from 'lucide-react';

export function SearchBox({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  size = 'md',
  kbd,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  kbd?: string;
  className?: string;
}) {
  const h = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-11' : 'h-9';
  const text = size === 'lg' ? 'text-base' : 'text-sm';
  const rightPadding = kbd ? 'pr-14' : 'pr-3';

  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`ds-input ds-focus-ring w-full ${h} ${text} ${rightPadding} pl-9`}
      />
      {kbd && (
        <kbd className="pointer-events-none absolute right-2 top-1/2 inline-flex h-5 -translate-y-1/2 items-center rounded border border-[color:var(--border-default)] bg-[color:var(--surface-muted)] px-1.5 text-[10px] font-medium text-fg-muted">
          {kbd}
        </kbd>
      )}
    </div>
  );
}
