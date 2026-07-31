import React from 'react';
import { CheckCircle2Icon, Clock3Icon, FileSpreadsheetIcon, AlertTriangleIcon } from 'lucide-react';
import type { ExcelExportUiState } from './calculationTypes';

export function ExportStatusState({ state }: { state: ExcelExportUiState }) {
  if (state === 'unavailable') {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
        <AlertTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" />
        Xuất Excel sẽ khả dụng sau khi bảng tính có số liệu.
      </div>
    );
  }
  if (state === 'requested') {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-lime-200 bg-lime-50 px-3 py-2 text-xs text-lime-800">
        <Clock3Icon className="h-4 w-4 shrink-0 animate-spin" />
        Đang tạo tệp Excel…
      </div>
    );
  }
  if (state === 'success') {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-lime-200 bg-lime-50 px-3 py-2 text-xs text-lime-800">
        <CheckCircle2Icon className="h-4 w-4 shrink-0" />
        Đã tạo Bảng tính tiền bản quyền .xlsx.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-stone-500">
      <FileSpreadsheetIcon className="h-3.5 w-3.5 shrink-0 text-lime-700" />
      Bản xuất sẽ dùng đúng số liệu đã được hệ thống xác nhận.
    </div>
  );
}
