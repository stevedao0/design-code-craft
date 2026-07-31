import React from 'react';
import { Loader2Icon } from 'lucide-react';

/**
 * LoadingState — shared loading primitive.
 * Used inside tables, panels and dashboard sections.
 */
export function LoadingState({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-12 text-sm"
      style={{ color: 'var(--text-muted)' }}
      role="status"
      aria-live="polite"
    >
      <Loader2Icon className="h-4 w-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
      <span>{label}</span>
    </div>
  );
}