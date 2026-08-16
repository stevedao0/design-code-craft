import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';
import { CalculationSnapshotSummary } from './CalculationSnapshotSummary';
import { ExcelExportButton } from './ExcelExportButton';
import { LocationBreakdown } from './LocationBreakdown';
import type {
  CalculationLocationSnapshot,
  CalculationSnapshot,
  ExcelExportUiState,
} from './calculationTypes';

export function CalculationDetailSheet({
  snapshot,
  onClose,
  onExportExcelRequest,
}: {
  snapshot: CalculationSnapshot | null;
  onClose: () => void;
  onExportExcelRequest?: (snapshot: CalculationSnapshot) => void;
}) {
  const [excelState, setExcelState] = useState<ExcelExportUiState>('ready');
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    setExcelState('ready');
    if (typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [snapshot, onClose]);

  if (!snapshot || typeof document === 'undefined') return null;

  const canExportExcel = snapshot.verificationStatus === 'confirmed' && snapshot.locationCount > 0;

  const requestExcel = () => {
    if (!canExportExcel) {
      setExcelState('unavailable');
      return;
    }
    setExcelState('requested');
    onExportExcelRequest?.(snapshot);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      role="presentation"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <button
        aria-label="Đóng bảng tính"
        className="absolute inset-0 cursor-default bg-stone-950/25"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-describedby="calculation-detail-description"
        aria-label={`Chi tiết ${snapshot.calculationCode}`}
        aria-modal="true"
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f7f5f0] shadow-2xl md:w-[min(960px,calc(100vw-32px))]"
        role="dialog"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 bg-[#fffefb] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#075f5b]">
              Bảng tính chi tiết
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-[#252525]">
              Bảng tính tiền bản quyền âm nhạc
            </h1>
            <p className="mt-1 text-xs text-stone-500" id="calculation-detail-description">
              Bản chụp dữ liệu chỉ đọc do hệ thống xác nhận.
            </p>
          </div>
          <button
            aria-label="Đóng"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-700/30"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-5">
            <CalculationSnapshotSummary snapshot={snapshot} />

            <section className="overflow-hidden rounded-xl border border-stone-200 bg-[#fffefb]">
              <div className="border-b border-stone-200 px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[#252525]">Tổng hợp theo khu vực</h2>
                    <p className="mt-1 text-xs text-stone-500">
                      Mỗi địa điểm sử dụng âm nhạc được giữ tách biệt theo dữ liệu nguồn.
                    </p>
                  </div>
                  <span className="rounded-md bg-stone-100 px-2 py-1 font-mono text-[11px] font-semibold text-stone-700">
                    {snapshot.locationCount} khu vực
                  </span>
                </div>
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-[1100px] w-full border-collapse text-left">
                  <thead className="bg-[#f5f3ee]">
                    <tr className="border-b border-stone-200">
                      <SheetHead className="w-[44px] text-center">STT</SheetHead>
                      <SheetHead>Tên hiển thị trên bảng tính</SheetHead>
                      <SheetHead>Vị trí / khu vực thực tế</SheetHead>
                      <SheetHead>Lĩnh vực áp dụng</SheetHead>
                      <SheetHead className="text-right">Diện tích</SheetHead>
                      <SheetHead>Thời hạn</SheetHead>
                      <SheetHead className="text-right">Hệ số đô thị</SheetHead>
                      <SheetHead className="text-right">Tiền bản quyền trước Thuế GTGT</SheetHead>
                      <SheetHead className="text-right">Thuế GTGT</SheetHead>
                      <SheetHead className="text-right">Tổng thanh toán</SheetHead>
                      <SheetHead className="w-[150px]">Chi tiết</SheetHead>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.locations.map((location, index) => (
                      <LocationDesktopRow index={index} key={location.id} location={location} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-stone-200 md:hidden">
                {snapshot.locations.map((location, index) => (
                  <LocationMobileCard index={index} key={location.id} location={location} />
                ))}
              </div>
            </section>
          </div>
        </main>

        <footer className="shrink-0 border-t border-stone-200 bg-[#fffefb] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <div className="grid gap-2 border-b border-stone-200 pb-3 text-xs sm:grid-cols-3 sm:gap-4">
            <TotalItem label="Tổng tiền bản quyền trước Thuế GTGT" value={snapshot.royaltyBeforeVatDisplay} />
            <TotalItem label="Thuế GTGT" value={snapshot.vatDisplay} />
            <TotalItem emphasis label="TỔNG THANH TOÁN" value={snapshot.totalPaymentDisplay} />
          </div>
          <p className="py-2 text-[11px] italic leading-relaxed text-stone-500">
            Bằng chữ: {snapshot.amountInWords}
          </p>
          <div className="flex flex-col gap-3 border-t border-stone-100 py-3 sm:flex-row sm:items-center sm:justify-end">
            <ExcelExportButton
              disabled={!canExportExcel}
              onRequest={requestExcel}
              state={excelState}
            />
          </div>
        </footer>
      </aside>
    </div>,
    document.body
  );
}

function LocationDesktopRow({
  location,
  index,
}: {
  location: CalculationLocationSnapshot;
  index: number;
}) {
  const displayName = location.displayName?.trim() || location.actualLocationName;
  return (
    <tr className="border-b border-stone-200/80 bg-[#fffefb] align-top">
      <SheetCell className="font-mono text-stone-500 text-center">{index + 1}</SheetCell>
      <SheetCell className="min-w-[170px] font-semibold text-[#252525]">{displayName}</SheetCell>
      <SheetCell className="min-w-[150px] text-stone-700">{location.actualArea || '—'}</SheetCell>
      <SheetCell className="min-w-[135px] text-stone-700">{location.domainLabel}</SheetCell>
      <SheetCell className="text-right font-mono tabular-nums text-stone-700">{location.areaDisplay}</SheetCell>
      <SheetCell className="min-w-[100px] font-mono text-[11px] text-stone-600">{location.termDisplay}</SheetCell>
      <SheetCell className="text-right font-mono tabular-nums text-stone-700">{location.urbanCoefficient}</SheetCell>
      <SheetCell className="text-right font-mono tabular-nums text-stone-700">{location.royaltyBeforeVatDisplay}</SheetCell>
      <SheetCell className="text-right font-mono tabular-nums text-stone-700">{location.vatDisplay}</SheetCell>
      <SheetCell className="text-right font-mono font-semibold tabular-nums text-[#252525]">{location.totalPaymentDisplay}</SheetCell>
      <SheetCell className="align-top">
        <LocationBreakdown location={location} />
      </SheetCell>
    </tr>
  );
}

function LocationMobileCard({
  location,
  index,
}: {
  location: CalculationLocationSnapshot;
  index: number;
}) {
  const displayName = location.displayName?.trim() || location.actualLocationName;
  return (
    <article className="bg-[#fffefb] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold text-[#075f5b]">
            KHU VỰC {String(index + 1).padStart(2, '0')}
          </p>
          <h3 className="mt-1 text-sm font-semibold leading-snug text-[#252525]">{displayName}</h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{location.musicUseAddress}</p>
        </div>
        <span className="shrink-0 rounded-md bg-stone-100 px-2 py-1 font-mono text-[11px] text-stone-700">
          {location.areaDisplay}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-stone-100 py-3 text-xs">
        <MobileField label="Vị trí thực tế" value={location.actualArea || '—'} />
        <MobileField label="Lĩnh vực" value={location.domainLabel} />
        <MobileField label="Thời hạn" value={location.termDisplay} />
        <MobileField label="Đô thị / Hệ số" value={`${location.urbanType} · ${location.urbanCoefficient}`} />
        <MobileField label="Hỗ trợ" value={location.supportDisplay} />
        <MobileField label="Thuế GTGT" value={location.vatDisplay} mono />
      </dl>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">Tổng thanh toán</p>
          <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#252525]">
            {location.totalPaymentDisplay}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <LocationBreakdown location={location} />
      </div>
    </article>
  );
}

function SheetHead({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-stone-600 ${className}`}
    >
      {children}
    </th>
  );
}

function SheetCell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-3 text-xs ${className}`}>{children}</td>;
}

function TotalItem({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className={emphasis ? 'sm:border-l sm:border-stone-200 sm:pl-4' : ''}>
      <p
        className={`text-[10px] font-semibold uppercase tracking-[0.07em] ${
          emphasis ? 'text-[#075f5b]' : 'text-stone-500'
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-mono tabular-nums ${
          emphasis ? 'text-base font-bold text-[#075f5b]' : 'text-sm font-semibold text-[#252525]'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MobileField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-stone-500">{label}</dt>
      <dd
        className={`mt-1 leading-snug text-stone-700 ${mono ? 'font-mono text-[11px] tabular-nums' : 'text-xs'}`}
      >
        {value}
      </dd>
    </div>
  );
}
