/**
 * SimpleRoyaltyInput - Simplified royalty payment input
 * 
 * User only enters: royalty_amount_before_vat
 * App auto-calculates: vat_rate (8%), vat_amount, total, amount_in_words
 * 
 * Design: Clean, administrative form style
 */

import React, { useState, useEffect } from 'react';
import { VcpmcMoneyTable } from '../app-ui/data-table/VcpmcMoneyTable';
import type {
  DataTableColumn,
  DataTableSummaryRow,
} from '../app-ui/data-table';

export type SimpleRoyaltyData = {
  /** Tiền bản quyền trước thuế */
  royaltyAmountBeforeVat: number;
  /** Thuế GTGT (%) - default 8 */
  vatRate: number;
  /** Tiền thuế GTGT - calculated */
  vatAmount: number;
  /** Tổng tiền sau thuế - calculated */
  totalAmountAfterVat: number;
  /** Số tiền bằng chữ */
  amountInWords: string;
};

export type SimpleRoyaltyInputProps = {
  /** Initial data */
  initialData?: Partial<SimpleRoyaltyData>;
  /** Callback when data changes */
  onChange: (data: SimpleRoyaltyData) => void;
  /** VAT rate options */
  vatRateOptions?: { value: number; label: string }[];
  /** Default VAT rate */
  defaultVatRate?: number;
};

const DEFAULT_VAT_RATE = 8;

/**
 * Convert number to Vietnamese words for currency
 */
export function numberToVietnameseWords(num: number): string {
  if (num === 0) return 'Không đồng';

  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  
  function readThreeDigits(n: number): string {
    if (n === 0) return '';
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    let result = '';
    
    if (hundred > 0) {
      result += (hundred === 1 ? 'một' : digits[hundred]) + ' trăm ';
    }
    
    if (remainder > 0) {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      
      if (tens > 1) {
        result += digits[tens] + ' mươi ';
        if (ones > 0) {
          result += (ones === 1 ? 'mốt' : digits[ones]);
        }
      } else if (tens === 1) {
        result += 'mười ';
        if (ones > 0) {
          result += (ones === 5 ? 'lăm' : digits[ones]);
        }
      } else {
        result += digits[ones];
      }
    }
    
    return result;
  }
  
  const str = num.toString();
  const len = str.length;
  let result = '';
  let unitIndex = 0;
  
  // Process from right to left, 3 digits at a time
  for (let i = len - 3; i >= 0; i -= 3) {
    const chunk = parseInt(str.slice(Math.max(0, i), i + 3), 10);
    if (chunk > 0) {
      result = readThreeDigits(chunk) + ' ' + units[unitIndex] + ' ' + result;
    }
    unitIndex++;
  }
  
  // Handle the first chunk (may be 1-3 digits)
  const firstChunk = parseInt(str.slice(0, Math.min(3, len)), 10);
  if (unitIndex === 0 || firstChunk > 0) {
    result = readThreeDigits(firstChunk) + (unitIndex > 0 ? ' ' + units[unitIndex] : '') + ' ' + result;
  }
  
  return result.trim().charAt(0).toUpperCase() + result.trim().slice(1);
}

/**
 * Format number as Vietnamese currency
 */
function formatVnd(value: number): string {
  return value.toLocaleString('vi-VN').replace(/,/g, '.');
}

export function SimpleRoyaltyInput({
  initialData,
  onChange,
  vatRateOptions = [
    { value: 0, label: '0%' },
    { value: 5, label: '5%' },
    { value: 8, label: '8%' },
    { value: 10, label: '10%' },
  ],
  defaultVatRate = DEFAULT_VAT_RATE,
}: SimpleRoyaltyInputProps) {
  const [royaltyAmount, setRoyaltyAmount] = useState<number>(
    initialData?.royaltyAmountBeforeVat || 0
  );
  const [vatRate, setVatRate] = useState<number>(
    initialData?.vatRate || defaultVatRate
  );
  const [manualVatRate, setManualVatRate] = useState<string>(
    String(initialData?.vatRate || defaultVatRate)
  );

  // Calculate derived values
  const vatAmount = Math.round(royaltyAmount * vatRate / 100);
  const totalAmount = royaltyAmount + vatAmount;
  const amountInWords = numberToVietnameseWords(totalAmount);

  // Sync with parent when initialData changes (e.g. after "Chốt 3 số tiền")
  useEffect(() => {
    const incomingAmount = initialData?.royaltyAmountBeforeVat ?? 0;
    const incomingVatRate = initialData?.vatRate ?? defaultVatRate;
    if (incomingAmount !== royaltyAmount) {
      setRoyaltyAmount(incomingAmount);
    }
    if (incomingVatRate !== vatRate) {
      setVatRate(incomingVatRate);
      setManualVatRate(String(incomingVatRate));
    }
  }, [initialData?.royaltyAmountBeforeVat, initialData?.vatRate]);

  // Notify parent of changes
  useEffect(() => {
    onChange({
      royaltyAmountBeforeVat: royaltyAmount,
      vatRate,
      vatAmount,
      totalAmountAfterVat: totalAmount,
      amountInWords,
    });
  }, [royaltyAmount, vatRate, vatAmount, totalAmount, amountInWords]);

  const handleAmountChange = (value: string) => {
    const num = parseInt(value.replace(/[^\d]/g, ''), 10) || 0;
    setRoyaltyAmount(num);
  };

  const handleVatRateChange = (value: number) => {
    setVatRate(value);
    setManualVatRate(String(value));
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
          Thông tin tiền tham khảo
        </h4>
        <span className="text-xs text-zinc-400 italic">Nội bộ</span>
      </div>
      {/* Royalty Amount Input */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          Tiền bản quyền trước thuế (VND) *
        </label>
        <input
          type="text"
          value={formatVnd(royaltyAmount)}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0"
          className="w-full px-3 py-2 border border-zinc-300 rounded-md text-right font-mono text-lg"
        />
        <p className="text-xs text-zinc-500 mt-1">
          Nhập số tiền bản quyền chưa có thuế GTGT
        </p>
      </div>

      {/* VAT Rate */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Thuế suất GTGT (%)
          </label>
          <select
            value={vatRate}
            onChange={(e) => handleVatRateChange(Number(e.target.value))}
            className="w-full px-3 py-2 border border-zinc-300 rounded-md"
          >
            {vatRateOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Tiền thuế GTGT (VND)
          </label>
          <input
            type="text"
            value={formatVnd(vatAmount)}
            readOnly
            className="w-full px-3 py-2 border border-zinc-200 rounded-md text-right font-mono bg-zinc-50 text-zinc-600"
          />
        </div>
      </div>

      {/* Total Amount */}
      <div className="rounded-xl bg-lime-50 p-5 border border-lime-200">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-lime-600 mb-2">
            Tổng tiền thanh toán
          </p>
          <p className="text-[28px] font-bold text-lime-800 font-mono tabular-nums tracking-tight leading-none">
            {formatVnd(totalAmount)}
            <span className="text-lg font-medium ml-0.5">đ</span>
          </p>
          <p className="text-sm text-lime-700 mt-2 italic">
            (Bằng chữ: {amountInWords} đồng)
          </p>
        </div>
      </div>

      {/* Disclaimer: this is reference info only */}
      <div className="px-3 py-2 rounded bg-lime-50 border border-lime-200/60">
        <p className="text-xs text-lime-700 italic">
          Thông tin trên chỉ mang tính tham khảo nội bộ.
          Bảng tính tiền chi tiết sẽ được bổ sung sau khi export Word.
        </p>
      </div>
    </div>
  );
}

/**
 * Read-only summary of royalty data
 */
export function SimpleRoyaltySummary({
  data,
}: {
  data: SimpleRoyaltyData;
}) {
  type SummaryRow = {
    id: string;
    label: string;
    value: string;
    isTotal: boolean;
  };
  const rows: SummaryRow[] = [
    { id: 'rb', label: 'Tiền bản quyền trước thuế:', value: `${formatVnd(data.royaltyAmountBeforeVat)} đ`, isTotal: false },
    { id: 'vat', label: `Thuế GTGT (${data.vatRate}%):`, value: `${formatVnd(data.vatAmount)} đ`, isTotal: false },
    { id: 'total', label: 'Tổng cộng:', value: `${formatVnd(data.totalAmountAfterVat)} đ`, isTotal: true },
  ];

  const columns: DataTableColumn<SummaryRow>[] = [
    {
      key: 'label',
      header: '',
      align: 'left',
      wrap: 'nowrap',
      cellClassName: 'text-zinc-700',
      headerClassName: 'sr-only',
      render: (row) => row.label,
    },
    {
      key: 'value',
      header: '',
      align: 'right',
      wrap: 'nowrap',
      meta: { kind: 'currency' },
      cellClassName: 'tabular-nums font-medium',
      headerClassName: 'sr-only',
      render: (row) => row.value,
    },
  ];

  const summaryRows: DataTableSummaryRow[] = [
    {
      id: 'total',
      cells: [
        { id: 'total-label', content: 'Tổng cộng:', align: 'right', tone: 'grand-total' },
        { id: 'total-value', content: `${formatVnd(data.totalAmountAfterVat)} đ`, align: 'right', tone: 'grand-total' },
      ],
    },
  ];

  const bodyRows = rows.filter((r) => !r.isTotal);

  return (
    <div className="rounded-xl bg-[color:var(--vcpmc-table-row-alt)] p-4 border border-[color:var(--vcpmc-table-border)]">
      <VcpmcMoneyTable
        columns={columns}
        rows={bodyRows}
        density="comfortable"
        summaryRows={summaryRows}
        emptyState={<div className="px-3 py-4 text-center text-sm text-zinc-500">Chưa có dữ liệu.</div>}
      />
      {data.amountInWords && (
        <div className="pt-2 mt-2 border-t border-[color:var(--vcpmc-table-border)] text-center text-zinc-500 italic text-xs">
          ({data.amountInWords} đồng)
        </div>
      )}
    </div>
  );
}
