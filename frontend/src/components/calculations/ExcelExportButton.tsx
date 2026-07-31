import React from 'react';
import { FileSpreadsheetIcon } from 'lucide-react';
import type { ExcelExportUiState } from './calculationTypes';

export function ExcelExportButton({
  state,
  disabled = false,
  onRequest,
}: {
  state: ExcelExportUiState;
  disabled?: boolean;
  onRequest: () => void;
}) {
  const label =
    state === 'requested'
      ? 'Đang tạo tệp Excel…'
      : state === 'success'
      ? 'Đã tạo Bảng tính tiền bản quyền .xlsx'
      : state === 'unavailable'
      ? 'Chưa có dữ liệu'
      : 'Xuất Excel';
  const ariaLabel = label;

  const isDisabled = disabled || state === 'requested' || state === 'unavailable';

  return (
    <button
      aria-label={ariaLabel}
      className="flex w-full h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[12.5px] font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        background: state === 'success' ? '#4A7202' : '#2F6B1F',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
      }}
      disabled={isDisabled}
      onClick={onRequest}
      type="button"
    >
      <FileSpreadsheetIcon className="h-4 w-4" />
      {label}
    </button>
  );
}
