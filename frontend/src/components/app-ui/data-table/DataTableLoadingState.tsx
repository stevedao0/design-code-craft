import React from 'react';
import { Loader2Icon } from 'lucide-react';

export function DataTableLoadingState({
  label = 'Đang tải dữ liệu bảng...',
}: {
  label?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-fg-muted">
      <Loader2Icon className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
