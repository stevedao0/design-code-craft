import React from 'react';
import { CalendarDaysIcon, Building2Icon, HashIcon, BadgeCheckIcon, AlertTriangleIcon } from 'lucide-react';
import type { CalculationSnapshot } from './calculationTypes';
import { getVerificationPresentation } from './calculationTypes';

export function CalculationSnapshotSummary({ snapshot }: { snapshot: CalculationSnapshot }) {
  const pres = getVerificationPresentation(snapshot.verificationStatus);
  const isConfirmed = snapshot.verificationStatus === 'confirmed';
  return (
    <section className="rounded-xl border border-stone-200 bg-[#fffefb] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            Hồ sơ tính tiền bản quyền
          </p>
          <h2 className="mt-1 text-base font-semibold leading-snug text-[#252525]">
            {snapshot.legalEntityName}
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-600">
            <span className="inline-flex items-center gap-1.5">
              <HashIcon className="h-3.5 w-3.5 text-stone-400" />
              <span className="font-mono text-stone-800">{snapshot.calculationCode}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDaysIcon className="h-3.5 w-3.5 text-stone-400" />
              {snapshot.createdAtDisplay}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2Icon className="h-3.5 w-3.5 text-stone-400" />
              {snapshot.customerAddress || '—'}
            </span>
          </div>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${pres.className}`}
          aria-label={pres.label}
        >
          {isConfirmed ? (
            <BadgeCheckIcon className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangleIcon className="h-3.5 w-3.5" />
          )}
          {isConfirmed ? 'Số liệu đã được hệ thống xác nhận' : 'Cần rà soát trước khi xuất'}
        </span>
      </div>
    </section>
  );
}
