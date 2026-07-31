import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, InfoIcon } from 'lucide-react';
import type { CalculationLocationSnapshot } from './calculationTypes';

export function LocationBreakdown({ location }: { location: CalculationLocationSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const hasBreakdown =
    Boolean(location.calculationBreakdown?.length) || Boolean(location.calculationNarrative);

  return (
    <div className="mt-2">
      <button
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#075f5b] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-700/30"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        {expanded ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
        Cách tính thành tiền
      </button>
      {expanded ? (
        <div className="mt-2 rounded-[10px] border border-stone-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#075f5b]" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#252525]">Diễn giải cách tính</p>
              {location.calculationNarrative ? (
                <p className="mt-1 text-xs leading-relaxed text-stone-600">
                  {location.calculationNarrative}
                </p>
              ) : null}
              {location.calculationBreakdown?.length ? (
                <dl className="mt-3 divide-y divide-stone-100 border-y border-stone-100">
                  {location.calculationBreakdown.map((line) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2 text-xs"
                      key={line.id}
                    >
                      <dt className="text-stone-600">
                        {line.label}
                        {line.detail ? (
                          <span className="mt-0.5 block text-[11px] text-stone-400">{line.detail}</span>
                        ) : null}
                      </dt>
                      <dd className="font-mono font-medium tabular-nums text-stone-800">
                        {line.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {!hasBreakdown ? (
                <p className="mt-1 text-xs text-stone-500">
                  Hệ thống chưa cung cấp diễn giải cách tính cho khu vực này.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
