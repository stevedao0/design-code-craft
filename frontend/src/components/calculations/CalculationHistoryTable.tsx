import React from 'react';
import { ChevronRightIcon, FileTextIcon } from 'lucide-react';
import type { CalculationSnapshot } from './calculationTypes';
import { getVerificationPresentation } from './calculationTypes';

export function CalculationHistoryTable({
  snapshots,
  onOpenSnapshot,
}: {
  snapshots: readonly CalculationSnapshot[];
  onOpenSnapshot: (snapshot: CalculationSnapshot) => void;
}) {
  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <FileTextIcon className="mb-3 h-6 w-6 text-stone-400" />
        <p className="text-sm font-semibold text-stone-700">Chưa tìm thấy bảng tính</p>
        <p className="mt-1 max-w-xs text-xs text-stone-500">
          Không có bảng tính nào khớp với điều kiện tra cứu hiện tại.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[1100px] w-full table-fixed border-collapse text-left">
          <thead className="bg-[#f5f3ee]">
            <tr className="border-y border-stone-200">
              <HistoryHead className="w-[112px]">Ngày lập</HistoryHead>
              <HistoryHead className="w-[152px]">Mã bảng tính</HistoryHead>
              <HistoryHead className="w-[240px]">Đơn vị / pháp nhân</HistoryHead>
              <HistoryHead className="w-[88px] text-center">Số khu vực</HistoryHead>
              <HistoryHead className="w-[160px] text-right">Tiền bản quyền trước Thuế GTGT</HistoryHead>
              <HistoryHead className="w-[118px] text-right">Thuế GTGT</HistoryHead>
              <HistoryHead className="w-[142px] text-right">Tổng thanh toán</HistoryHead>
              <HistoryHead className="w-[140px]">Người lập</HistoryHead>
              <HistoryHead className="w-[170px]">Trạng thái</HistoryHead>
              <HistoryHead className="w-[110px] text-right">Thao tác</HistoryHead>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => {
              const pres = getVerificationPresentation(snapshot.verificationStatus);
              return (
                <tr
                  className="group cursor-pointer border-b border-stone-200/80 bg-[#fffefb] transition-colors hover:bg-[#f7f6f1] focus-within:bg-[#f7f6f1]"
                  key={snapshot.id}
                  onClick={() => onOpenSnapshot(snapshot)}
                >
                  <HistoryCell className="font-mono text-[12px] text-stone-600">
                    {snapshot.createdAtDisplay}
                  </HistoryCell>
                  <HistoryCell>
                    <span className="font-mono text-[12px] font-semibold text-[#075f5b]">
                      {snapshot.calculationCode}
                    </span>
                  </HistoryCell>
                  <HistoryCell>
                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[#252525]">
                      {snapshot.legalEntityName}
                    </p>
                  </HistoryCell>
                  <HistoryCell className="text-center font-mono text-[13px] font-semibold text-stone-800">
                    {snapshot.locationCount}
                  </HistoryCell>
                  <HistoryCell className="text-right font-mono text-[12px] tabular-nums text-stone-700">
                    {snapshot.royaltyBeforeVatDisplay}
                  </HistoryCell>
                  <HistoryCell className="text-right font-mono text-[12px] tabular-nums text-stone-700">
                    {snapshot.vatDisplay}
                  </HistoryCell>
                  <HistoryCell className="text-right font-mono text-[12px] font-semibold tabular-nums text-[#252525]">
                    {snapshot.totalPaymentDisplay}
                  </HistoryCell>
                  <HistoryCell className="text-[12px] text-stone-700">{snapshot.createdBy}</HistoryCell>
                  <HistoryCell>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${pres.className}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${pres.dotClassName}`} />
                      {pres.label}
                    </span>
                  </HistoryCell>
                  <HistoryCell className="text-right">
                    <button
                      aria-label={`Mở ${snapshot.calculationCode}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#075f5b] transition-colors hover:bg-lime-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-700/30"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenSnapshot(snapshot);
                      }}
                      type="button"
                    >
                      Xem <ChevronRightIcon className="h-3.5 w-3.5" />
                    </button>
                  </HistoryCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-stone-200 md:hidden">
        {snapshots.map((snapshot) => {
          const pres = getVerificationPresentation(snapshot.verificationStatus);
          return (
            <button
              className="block w-full bg-[#fffefb] px-4 py-4 text-left transition-colors hover:bg-[#f7f6f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-700/35"
              key={snapshot.id}
              onClick={() => onOpenSnapshot(snapshot)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-semibold text-[#075f5b]">{snapshot.calculationCode}</p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-[#252525]">{snapshot.legalEntityName}</p>
                </div>
                <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-stone-400" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                <span className="font-mono">{snapshot.createdAtDisplay}</span>
                <span aria-hidden className="text-stone-300">•</span>
                <span>{snapshot.locationCount} khu vực</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ring-1 ring-inset ${pres.className}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${pres.dotClassName}`} />
                  {pres.label}
                </span>
                <span className="text-right font-mono text-sm font-semibold tabular-nums text-[#252525]">
                  {snapshot.totalPaymentDisplay}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function HistoryHead({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.075em] text-stone-600 ${className}`}
    >
      {children}
    </th>
  );
}

function HistoryCell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-3 align-top ${className}`}>{children}</td>;
}
