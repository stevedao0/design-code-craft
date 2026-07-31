import React from 'react';

export function Toolbar({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`ds-toolbar ds-toolbar-surface px-4 py-3 shadow-sm flex-col sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      {children}
    </div>
  );
}
