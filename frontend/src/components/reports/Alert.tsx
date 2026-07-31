import React from 'react';

export function Alert({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${className}`}
      style={{
        background: 'color-mix(in srgb, var(--accent-primary, #6d365b) 8%, white)',
        borderColor: 'color-mix(in srgb, var(--accent-primary, #6d365b) 25%, transparent)',
        color: 'var(--text-primary, #1f1d1a)',
      }}
    >
      {children}
    </div>
  );
}

export function AlertDescription({ children }: { children: React.ReactNode }) {
  return <div className="text-xs opacity-80">{children}</div>;
}
