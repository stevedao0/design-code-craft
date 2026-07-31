import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircleIcon,
  CalendarDaysIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { CalculationDetailSheet } from './CalculationDetailSheet';
import { CalculationHistoryTable } from './CalculationHistoryTable';
import { TableSkeleton } from '../app-ui/TableSkeleton';
import {
  CalculationHistoryLoadState,
  CalculationSnapshot,
  VerificationStatus,
} from './calculationTypes';
import {
  loadSnapshots,
  markExcelExported,
} from '../../lib/calculations/calculationHistoryStore';
import {
  generateRoyaltyCalculationWorkbook,
  workbookFilename,
} from '../../lib/calculations/generateRoyaltyCalculationWorkbook';

const STATUS_OPTIONS: { value: VerificationStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'confirmed', label: 'Đã xác nhận số liệu' },
  { value: 'review_required', label: 'Cần rà soát' },
];

export function CalculationHistoryPage({
  onOpenCalculator,
  onPickSnapshot,
}: {
  onOpenCalculator?: () => void;
  onPickSnapshot?: (snap: CalculationSnapshot) => void;
}) {
  const [snapshots, setSnapshots] = useState<CalculationSnapshot[]>([]);
  const [loadState, setLoadState] = useState<CalculationHistoryLoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | ''>('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<CalculationSnapshot | null>(null);

  const refresh = () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const data = loadSnapshots();
      setSnapshots(data);
      setLoadState('ready');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể tải lịch sử bảng tính lúc này.'
      );
      setLoadState('error');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Filter using ISO timestamps (not Vietnamese display strings).
  const filteredSnapshots = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi-VN');
    return snapshots.filter((snapshot) => {
      const matchesQuery =
        !q ||
        snapshot.legalEntityName.toLocaleLowerCase('vi-VN').includes(q) ||
        snapshot.calculationCode.toLocaleLowerCase('vi-VN').includes(q) ||
        (snapshot.customerAddress || '').toLocaleLowerCase('vi-VN').includes(q);
      const matchesStatus = !statusFilter || snapshot.verificationStatus === statusFilter;
      const matchesDomain =
        !domainFilter || snapshot.locations.some((l) => l.domainLabel === domainFilter);
      const matchesTime = !timeFilter || snapshot.createdAtIso.startsWith(timeFilter);
      return matchesQuery && matchesStatus && matchesDomain && matchesTime;
    });
  }, [snapshots, query, statusFilter, domainFilter, timeFilter]);

  const domainOptions = useMemo(() => {
    const labels = new Set<string>();
    snapshots.forEach((s) => s.locations.forEach((l) => labels.add(l.domainLabel)));
    return Array.from(labels).sort((a, b) => a.localeCompare(b, 'vi')).map((v) => ({ value: v, label: v }));
  }, [snapshots]);

  // Group by YYYY-MM for time filter so the user can drill into recent snapshots.
  const timeOptions = useMemo(() => {
    const months = new Set(snapshots.map((s) => s.createdAtIso.slice(0, 7)));
    return Array.from(months)
      .sort()
      .reverse()
      .map((ym) => {
        const [y, m] = ym.split('-');
        const monthNames = [
          'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
          'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
        ];
        return {
          value: ym,
          label: `${monthNames[Number(m) - 1] || m}/${y}`,
        };
      });
  }, [snapshots]);

  const hasActiveFilters = Boolean(query || timeFilter || domainFilter || statusFilter);
  const clearFilters = () => {
    setQuery('');
    setTimeFilter('');
    setDomainFilter('');
    setStatusFilter('');
  };

  const handleExportExcelRequest = async (snapshot: CalculationSnapshot) => {
    try {
      const blob = await generateRoyaltyCalculationWorkbook(snapshot);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = workbookFilename(snapshot);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      markExcelExported(snapshot.id);
      refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể tạo tệp Excel lúc này.'
      );
    }
  };

  const handleExportWord = (snapshot: CalculationSnapshot) => {
    // Recompose export payload from snapshot and run the existing Word flow.
    if (onPickSnapshot) onPickSnapshot(snapshot);
  };

  return (
    <div
      className="min-h-full"
      style={{
        background: '#f6f4ef',
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#075f5b]">
              Hợp đồng / Bảng tính
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#252525]">
              Lịch sử bảng tính
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-stone-500">
              Tra cứu, rà soát và xuất lại bảng tính tiền bản quyền đã được hệ thống xác nhận.
            </p>
          </div>
          {onOpenCalculator ? (
            <button
              type="button"
              onClick={onOpenCalculator}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-stone-300 bg-white px-3.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-700/30"
            >
              Mở bảng tính mới
            </button>
          ) : null}
        </header>

        <section className="overflow-hidden rounded-xl border border-stone-200 bg-[#fffefb] shadow-[0_1px_2px_rgba(45,42,35,0.05)]">
          <div className="border-b border-stone-200 bg-[#faf9f5] px-4 py-3.5 sm:px-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_150px_170px_190px]">
                <div className="sm:col-span-2 xl:col-span-1">
                  <input
                    type="search"
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tên đơn vị, mã bảng tính, địa chỉ..."
                    className="h-9 w-full rounded-[10px] border border-stone-300 bg-white px-3 text-sm outline-none focus:border-lime-700/40 focus:ring-2 focus:ring-lime-700/15"
                    value={query}
                    aria-label="Tìm kiếm lịch sử bảng tính"
                  />
                </div>
                <select
                  aria-label="Lọc theo thời gian"
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value)}
                  className="h-9 rounded-[10px] border border-stone-300 bg-white px-2 text-sm outline-none focus:border-lime-700/40 focus:ring-2 focus:ring-lime-700/15"
                >
                  <option value="">Tất cả thời gian</option>
                  {timeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Lọc theo lĩnh vực"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                  className="h-9 rounded-[10px] border border-stone-300 bg-white px-2 text-sm outline-none focus:border-lime-700/40 focus:ring-2 focus:ring-lime-700/15"
                >
                  <option value="">Tất cả lĩnh vực</option>
                  {domainOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Lọc theo trạng thái"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as VerificationStatus | '')}
                  className="h-9 rounded-[10px] border border-stone-300 bg-white px-2 text-sm outline-none focus:border-lime-700/40 focus:ring-2 focus:ring-lime-700/15"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 xl:shrink-0">
                {hasActiveFilters ? (
                  <button
                    className="h-8 rounded-lg px-2.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-700/30"
                    onClick={clearFilters}
                    type="button"
                  >
                    Xóa lọc
                  </button>
                ) : null}
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs text-stone-600">
                  <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                  <span className="font-mono font-semibold text-stone-800">
                    {filteredSnapshots.length}
                  </span>
                  kết quả
                </span>
              </div>
            </div>
          </div>

          <div aria-live="polite">
            {loadState === 'loading' ? <TableSkeleton cols={11} rows={7} /> : null}
            {loadState === 'error' ? (
              <div className="p-5 sm:p-7">
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
                  <AlertCircleIcon className="h-5 w-5 text-rose-600" />
                  <p className="text-sm font-semibold text-rose-800">
                    Không tải được dữ liệu bảng tính
                  </p>
                  <p className="max-w-md text-xs text-rose-700">
                    {errorMessage || 'Không thể tải lịch sử bảng tính lúc này.'}
                  </p>
                  <button
                    type="button"
                    onClick={refresh}
                    className="mt-2 inline-flex h-9 items-center gap-2 rounded-[10px] bg-white px-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-100"
                  >
                    <RefreshCwIcon className="h-4 w-4" />
                    Thử tải lại
                  </button>
                </div>
              </div>
            ) : null}
            {loadState === 'ready' ? (
              <CalculationHistoryTable
                onOpenSnapshot={(s) => setSelectedSnapshot(s)}
                snapshots={filteredSnapshots}
              />
            ) : null}
          </div>
        </section>

        {loadState === 'ready' && snapshots.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-[#faf9f5] px-4 py-3 text-xs text-stone-500">
            <span className="inline-flex items-center gap-2">
              <CalendarDaysIcon className="h-4 w-4 text-stone-400" />
              Dữ liệu sẽ xuất hiện tại đây khi hệ thống trả về bản chụp bảng tính đã xác nhận.
            </span>
          </div>
        ) : null}

        <CalculationDetailSheet
          onClose={() => setSelectedSnapshot(null)}
          onExportExcelRequest={handleExportExcelRequest}
          onExportWord={handleExportWord}
          snapshot={selectedSnapshot}
        />
      </div>
    </div>
  );
}
