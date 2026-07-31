import React from 'react';
import { fmtVND, fmtNum } from './kpiClient';
import type { AnnualSummary } from './types';
import { Skeleton } from './Skeleton';

interface KpiRingProps {
  summary: AnnualSummary | null;
  userName?: string;
  loading?: boolean;
}

function daysRemainingInYear(year: number): number {
  const now = new Date();
  const endOfYear = new Date(year, 11, 31);
  const diff = endOfYear.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getStatus(
  configured: boolean,
  actual: number,
  annualTarget: number | null
): { label: string; color: string } {
  if (!configured) return { label: 'Chưa thiết lập', color: 'var(--text-muted, #8a847c)' };
  if (annualTarget == null || annualTarget === 0) return { label: 'Chưa thiết lập', color: 'var(--text-muted, #8a847c)' };
  const pct = (actual / annualTarget) * 100;
  if (pct >= 100) return { label: 'Đã vượt mục tiêu', color: 'var(--accent-primary, #4A7202)' };
  return { label: 'Đang thực hiện', color: 'var(--accent-plum, #6d365b)' };
}

export function KpiRing({ summary, userName, loading }: KpiRingProps) {
  if (loading || !summary) {
    return (
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
        <Skeleton className="h-[200px] w-[200px] rounded-full" />
        <div className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-2">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  const { configured, actual, annual_target, remaining, exceeded, progress_percent } = summary;
  const rawPct = progress_percent ?? 0;
  const size = 200;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const displayPct = Math.min(100, Math.max(0, rawPct));
  const dash = (displayPct / 100) * circumference;
  const status = getStatus(configured, actual, annual_target);
  const daysLeft = daysRemainingInYear(summary.year);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
      {/* Circular ring */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border-default, #e6e0d7)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={status.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary, #1f1d1a)' }}>
            {rawPct.toFixed(1)}%
          </span>
          <span className="text-xs" style={{ color: status.color }}>
            {status.label}
          </span>
          {userName && (
            <span className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {userName}
            </span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-2">
        <Stat label="Mục tiêu năm" value={fmtVND(annual_target ?? 0)} />
        <Stat label="Thực đạt" value={fmtVND(actual)} />
        <Stat label="Còn thiếu" value={fmtVND(remaining ?? 0)} />
        <Stat label="Vượt" value={fmtVND(exceeded ?? 0)} />
        <Stat label="Còn lại đến 31/12" value={`${fmtNum(daysLeft)} ngày`} />
        <Stat label="Năm" value={String(summary.year)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border-default, #e6e0d7)' }}>
      <div className="text-xs" style={{ color: 'var(--text-muted, #8a847c)' }}>{label}</div>
      <div className="mt-1 font-semibold tabular-nums" style={{ color: 'var(--text-primary, #1f1d1a)' }}>{value}</div>
    </div>
  );
}
