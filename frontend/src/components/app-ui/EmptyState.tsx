import React from 'react';
import { InboxIcon } from 'lucide-react';

/**
 * EmptyState — shared empty-state primitive.
 * Used inside tables, panels and dashboard sections.
 */
export function EmptyState({
  title = 'Chưa có dữ liệu',
  description,
  action,
  icon,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div
        className="h-12 w-12 rounded-xl flex items-center justify-center mb-3"
        style={{
          background: 'var(--surface-muted)',
          color: 'var(--text-muted)',
          boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
        }}
      >
        {icon ?? <InboxIcon className="h-5 w-5" />}
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
      {description && (
        <p className="text-xs mt-1 max-w-sm" style={{ color: 'var(--text-muted)' }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}