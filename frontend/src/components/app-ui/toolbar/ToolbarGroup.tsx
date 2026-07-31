import React from 'react';

export function ToolbarGroup({
  children,
  align = 'start',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  return (
    <div
      className={`flex flex-1 flex-wrap items-center gap-2 ${align === 'end' ? 'justify-start sm:justify-end' : 'justify-start'} ${className}`}
    >
      {children}
    </div>
  );
}
