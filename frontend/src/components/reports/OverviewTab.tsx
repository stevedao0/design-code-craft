import React, { useState, useEffect, useCallback } from 'react';
import { KpiRing } from './KpiRing';
import { AnnualTargetForm } from './AnnualTargetForm';
import { BarChart } from './BarChart';
import { ContractTable } from './ContractTable';
import { Skeleton } from './Skeleton';
import { OrgFieldRings } from './OrgFieldRings';
import { AlertCircleIcon } from 'lucide-react';
import { Button } from '@/components/app-ui/Button';
import { getOverview, getAnnualSummary, getAnnualTarget, fmtVND, fmtNum } from './kpiClient';
import type { OverviewResponse, AnnualSummary, AnnualTarget } from './types';

const MONTHS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

interface OverviewTabProps {
  year: number;
  onYearChange: (y: number) => void;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-4 sm:p-5"
      style={{ borderColor: 'var(--border-default, #e6e0d7)', background: 'var(--surface, #fff)' }}
    >
      <h4
        className="mb-3 text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-secondary, #68635c)' }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-default, #e6e0d7)' }}>
      <div className="text-xs" style={{ color: 'var(--text-muted, #8a847c)' }}>{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: 'var(--text-primary, #1f1d1a)' }}>
        {value}
      </div>
    </div>
  );
}

export function OverviewTab({ year, onYearChange }: OverviewTabProps) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [summary, setSummary] = useState<AnnualSummary | null>(null);
  const [target, setTarget] = useState<AnnualTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, sm, tgt] = await Promise.all([
        getOverview({ year }),
        getAnnualSummary(year).catch(() => null),
        getAnnualTarget(year).catch(() => null),
      ]);
      setOverview(ov);
      setSummary(sm);
      setTarget(tgt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const effectiveSummary: AnnualSummary | null = summary ?? (overview ? {
    user_id: 0,
    display_name: null,
    year: overview.year,
    configured: false,
    annual_target: null,
    target_zero: false,
    actual: overview.total_actual,
    contract_count: overview.total_count,
    remaining: null,
    exceeded: null,
    progress_percent: null,
    buckets: {
      new_count: overview.new_count,
      new_actual: overview.total_actual,
      renewal_count: overview.renewal_count,
      renewal_actual: 0,
      frame_count: overview.frame_count,
      frame_actual: 0,
      unknown_count: overview.unknown_count,
      unknown_actual: 0,
    },
    monthly: overview.monthly,
    quarterly: overview.quarterly,
  } : null);

  const handleSaved = () => { load(); };

  const cards = overview ? [
    { label: 'Tổng hợp đồng', value: fmtNum(overview.total_count), accent: true },
    { label: 'Giá trị hợp đồng', value: fmtVND(overview.total_actual), accent: true },
    { label: 'Có giá trị', value: fmtNum(overview.positive_value_count) },
    { label: 'Giá trị bằng 0', value: fmtNum(overview.zero_value_count) },
    { label: 'Chưa có dữ liệu giá trị', value: fmtNum(overview.null_value_count) },
    { label: 'Đang hiệu lực', value: fmtNum(overview.active_count) },
    { label: 'Sắp hết hạn', value: fmtNum(overview.expiring_count) },
    { label: 'GCN đã cấp', value: fmtNum(overview.gcn_issued_count) },
    { label: 'Ký mới', value: fmtNum(overview.new_count) },
    { label: 'Tái ký', value: fmtNum(overview.renewal_count) },
    { label: 'Hợp đồng khung', value: fmtNum(overview.frame_count) },
    ...(overview.unknown_count > 0 ? [{ label: 'Chưa xác định', value: fmtNum(overview.unknown_count) }] : []),
  ] : [];

  const monthlyData = MONTHS.map((label, i) => ({
    label,
    count: overview?.monthly_trend.find(m => m.month === i + 1)?.count ?? 0,
    value: overview?.monthly_trend.find(m => m.month === i + 1)?.actual ?? 0,
  }));

  const quarterlyData = [1, 2, 3, 4].map(q => ({
    label: `Q${q}`,
    count: overview?.quarterly_contribution.find(qc => qc.quarter === q)?.count ?? 0,
    value: overview?.quarterly_contribution.find(qc => qc.quarter === q)?.actual ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* Multi-field KPI rings — org level */}
      <OrgFieldRings year={year} />

      {/* KPI tổng của đơn vị + thiết lập KPI năm */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="KPI năm của đơn vị">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : error ? (
              <div className="flex items-center gap-3">
                <AlertCircleIcon className="h-5 w-5 shrink-0" style={{ color: 'var(--accent-primary, #4A7202)' }} />
                <span className="text-sm flex-1">{error}</span>
                <Button variant="ghost" size="sm" onClick={load}>Thử lại</Button>
              </div>
            ) : (
              <KpiRing summary={effectiveSummary} loading={false} />
            )}
          </Card>
        </div>
        <Card title="Thiết lập KPI">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <AnnualTargetForm
              initial={target}
              year={year}
              onYearChange={onYearChange}
              onSaved={handleSaved}
            />
          )}
        </Card>
      </div>

      {/* KPI metric cards */}
      {!loading && cards.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {cards.map(c => (
            <div
              key={c.label}
              className="rounded-2xl border p-4"
              style={{
                borderColor: 'var(--border-default, #e6e0d7)',
                background: c.accent ? 'color-mix(in srgb, var(--accent-primary, #4A7202) 8%, white)' : 'var(--surface, white)',
              }}
            >
              <div className="text-xs truncate" style={{ color: 'var(--text-muted, #8a847c)' }}>{c.label}</div>
              <div
                className="mt-2 text-xl font-bold tabular-nums truncate"
                style={{ color: c.accent ? 'var(--accent-primary, #4A7202)' : 'var(--text-primary, #1f1d1a)' }}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {overview && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Thực đạt theo tháng">
            <BarChart data={monthlyData} />
          </Card>
          <Card title="Thực đạt theo quý">
            <BarChart data={quarterlyData} color="var(--accent-plum, #6d365b)" />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Phân loại loại ký">
            <div className="space-y-3">
              {[
                { label: 'Ký mới', count: overview.new_count, actual: overview.new_actual },
                { label: 'Tái ký', count: overview.renewal_count, actual: overview.renewal_actual },
                { label: 'Hợp đồng khung', count: overview.frame_count, actual: overview.frame_actual },
                { label: 'Chưa xác định', count: overview.unknown_count, actual: overview.unknown_actual },
              ].filter(r => r.count > 0).map(r => {
                const pct = overview.total_count > 0 ? (r.count / overview.total_count) * 100 : 0;
                return (
                  <div key={r.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{r.label}</span>
                      <span className="font-medium tabular-nums">
                        {fmtNum(r.count)} · {fmtVND(r.actual || 0)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--border-default, #e6e0d7)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: 'var(--accent-plum, #6d365b)' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="Phân bổ người thực hiện">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Đã gán</span>
                <span className="font-medium tabular-nums">{fmtNum(overview.assigned_count)} · {fmtVND(overview.assigned_actual)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Chưa gán</span>
                <span className="font-medium tabular-nums">{fmtNum(overview.unassigned_count)} · {fmtVND(overview.unassigned_actual)}</span>
              </div>
              <div className="mt-3 h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--border-default, #e6e0d7)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${overview.total_count > 0 ? (overview.assigned_count / overview.total_count) * 100 : 0}%`,
                    background: 'var(--accent-success, #3f8f5b)',
                  }}
                />
              </div>
            </div>
          </Card>
          </div>
        </>
      )}

      {/* Contract table */}
          <Card title="Danh sách hợp đồng">
            <ContractTable year={year} />
          </Card>
    </div>
  );
}
