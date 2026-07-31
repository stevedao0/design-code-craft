import React from 'react';

export function PrimaryActionSlot({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex items-center gap-2 ${className}`}>{children}</div>;
}
