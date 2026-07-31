import React from 'react';

export function Chip({
  children,
  tone = 'neutral',
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const toneClassName =
    tone === 'info'
      ? 'bg-[color:var(--accent-info-soft)] text-[color:var(--accent-info)]'
      : tone === 'success'
        ? 'bg-[color:var(--accent-emerald-soft)] text-[color:var(--accent-emerald)]'
        : tone === 'warning'
          ? 'bg-[color:var(--accent-warning-soft)] text-[color:var(--accent-warning)]'
          : tone === 'danger'
            ? 'bg-[color:var(--accent-danger-soft)] text-[color:var(--accent-danger)]'
            : 'bg-[color:var(--surface-muted)] text-[color:var(--text-secondary)]';

  const sizeClassName = size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium ${toneClassName} ${sizeClassName} ${className}`}
    >
      {children}
    </span>
  );
}
