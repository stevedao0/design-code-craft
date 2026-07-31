import React from 'react';
import { AlertTriangleIcon } from 'lucide-react';

export function DataTableErrorState({
  title = 'Không thể hiển thị bảng',
  description = 'Đã có lỗi xảy ra khi chuẩn bị dữ liệu hiển thị.',
  action,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--accent-neutral-soft)] text-[color:var(--accent-danger)] ring-1 ring-[color:var(--border-subtle)]">
        <AlertTriangleIcon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-fg-primary">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
