import React from 'react';

export function DataTableBody({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <tbody className={className}>{children}</tbody>;
}
