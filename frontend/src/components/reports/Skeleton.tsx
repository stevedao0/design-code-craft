import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-zinc-200 ${className}`}
      aria-hidden
    />
  );
}
