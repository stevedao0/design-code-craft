import React from 'react';
export function FieldGrid({
  cols = 2,
  children,
  className = ''




}: {cols?: 1 | 2 | 3;children: React.ReactNode;className?: string;}) {
  const gridCols =
  cols === 1 ?
  'grid-cols-1' :
  cols === 3 ?
  'grid-cols-1 md:grid-cols-3' :
  'grid-cols-1 md:grid-cols-2';
  return <div className={`grid ${gridCols} gap-4 ${className}`}>{children}</div>;
}