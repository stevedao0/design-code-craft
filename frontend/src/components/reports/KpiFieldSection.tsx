/**
 * KPI Field Section — admin overview + employee detail.
 *
 * Admin view: all employees with compact multi-ring preview, filters, +Giao KPI.
 * Employee detail: field KPI cards for one selected user.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SettingsIcon, AlertCircleIcon, RefreshCwIcon, EyeIcon } from 'lucide-react';
import { Button } from '@/components/app-ui/Button';
import { Skeleton } from '@/components/reports/Skeleton';
import {
  getFieldUsers, getFieldKpi, getFieldKpiAll,
  getFieldDomains,
  KpiFieldUserOption, KpiFieldResponse, KpiFieldDomainOption,
} from '@/lib/kpiFieldClient';
import { fmtVND, fmtNum } from './kpiClient';
import { KpiManagementDrawer } from './KpiManagementDrawer';
import { MultiRingKpi } from './MultiRingKpi';
import { KpiCompositionCard } from './KpiCompositionCard';
import { toast } from '@/lib/toast';

interface KpiFieldSectionProps {
  year: number;
  /** Pass a custom title to suppress the duplicate year label from the shared header. */
  titleOverride?: string;
}

type ViewMode = 'overview' | 'detail';

const RING_COLORS_ADMIN = [
  '#c95867', '#6d365b', '#3f8f5b', '#d99425',
  '#4a7fc1', '#8b6db3', '#2da88f', '#b05a3a',
];

function getEmployeeRingColor(index: number): string {
  return RING_COLORS_ADMIN[index % RING_COLORS_ADMIN.length];
}

interface AdminEmployeeRow {
  user_id: number;
  email: string;
  display_name?: string;
  field_count: number;
  active_count: number;
  total_target: number | null;
  total_actual: number | null;
  best_progress_percent: number | null;
  has_inactive: boolean;
}

// ─── Admin overview: employee list with compact ring ────────────────────
function AdminKpiOverview(props: {
  year: number;
  onSelectEmployee: (email: string) => void;
}) {
  const [employees, setEmployees] = useState<AdminEmployeeRow[]>([]);
  const [domains, setDomains] = useState<KpiFieldDomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'unconfigured'>('all');
  const [fieldFilter, setFieldFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [empData, domData] = await Promise.all([
        getFieldKpiAll(props.year),
        getFieldDomains(),
      ]);
      setEmployees(empData.employees as AdminEmployeeRow[]);
      setDomains(domData.domains);
    } catch (e: any) {
      setError(e?.message || 'Lỗi tải danh sách nhân viên');
    } finally {
      setLoading(false);
    }
  }, [props.year, refreshTick]);

  useEffect(() => { load(); }, [load]);

  const statusLabel = (emp: AdminEmployeeRow) => {
    if (emp.field_count === 0) return { label: 'Chưa thiết lập', tone: 'muted' as const };
    if (!emp.has_inactive && emp.active_count > 0) return { label: 'Đang thực hiện', tone: 'success' as const };
    if (emp.has_inactive) return { label: 'Có KPI ngừng áp dụng', tone: 'warning' as const };
    return { label: 'Chưa thiết lập', tone: 'muted' as const };
  };

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (statusFilter === 'active') list = list.filter(e => e.active_count > 0 && !e.has_inactive);
    else if (statusFilter === 'inactive') list = list.filter(e => e.has_inactive);
    else if (statusFilter === 'unconfigured') list = list.filter(e => e.field_count === 0);
    if (fieldFilter !== 'all') list = list.filter(e => true); // field filter would need per-field data
    return list;
  }, [employees, statusFilter, fieldFilter]);

  if (loading) return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 rounded-lg border p-4"
      style={{ borderColor: 'var(--accent-primary)' }}>
      <AlertCircleIcon className="h-5 w-5" style={{ color: 'var(--accent-primary)' }} />
      <div className="text-sm flex-1">{error}</div>
      <Button variant="ghost" size="sm" onClick={() => setRefreshTick(t => t + 1)}>Thử lại</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className="rounded-xl border p-4"
        style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Quản lý KPI theo lĩnh vực — {props.year}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {employees.length} nhân viên được giao KPI
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshTick(t => t + 1)}
              title="Làm mới"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-zinc-50"
              style={{ borderColor: 'var(--border-soft)', color: 'var(--text-secondary)', background: 'var(--surface)' }}
            >
              <RefreshCwIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Trạng thái:</span>
          {([
            ['all', `Tất cả (${employees.length})`],
            ['active', `Đang thực hiện (${employees.filter(e => e.active_count > 0 && !e.has_inactive).length})`],
            ['inactive', `Có ngừng (${employees.filter(e => e.has_inactive).length})`],
            ['unconfigured', `Chưa gán (${employees.filter(e => e.field_count === 0).length})`],
          ] as const).map(([key, label]) => {
            const active = statusFilter === key;
            return (
              <button key={key} type="button" onClick={() => setStatusFilter(key)}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors"
                style={{
                  background: active ? 'var(--accent-primary, #4A7202)' : 'var(--surface)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--accent-primary, #4A7202)' : 'var(--border-default)'}`,
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Employee grid */}
      {filteredEmployees.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
          Không có nhân viên nào phù hợp với bộ lọc.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredEmployees.map((emp) => {
            const st = statusLabel(emp);
            const toneStyle = st.tone === 'success'
              ? { bg: 'color-mix(in srgb, var(--accent-success, #3f8f5b) 12%, white)', color: 'var(--accent-success, #3f8f5b)' }
              : st.tone === 'warning'
                ? { bg: 'color-mix(in srgb, var(--accent-warning, #d99425) 12%, white)', color: 'var(--accent-warning, #d99425)' }
                : { bg: 'var(--surface)', color: 'var(--text-muted)' };
            const ringFields = emp.active_count > 0
              ? [{
                  field_code: emp.email,
                  field_label: 'KPI',
                  target: emp.total_target ?? 0,
                  actual: emp.total_actual ?? 0,
                  progress_percent: emp.best_progress_percent ?? 0,
                  has_target: (emp.total_target ?? 0) > 0,
                  is_active: true,
                }]
              : [];

            return (
              <div key={emp.user_id}
                className="rounded-xl border p-4 transition-colors cursor-pointer hover:shadow-sm"
                style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}
                onClick={() => props.onSelectEmployee(emp.email)}>
                {/* Email + status */}
                <div className="mb-3">
                  <div className="text-[12.5px] font-semibold truncate max-w-full"
                    style={{ color: 'var(--text-primary)' }}
                    title={emp.email}>{emp.email}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: toneStyle.bg, color: toneStyle.color }}>
                      {st.label}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {emp.active_count}/{emp.field_count} lĩnh vực
                    </span>
                  </div>
                </div>

                {/* Compact ring */}
                <div className="flex items-center gap-3">
                  <MultiRingKpi
                    fields={ringFields as any}
                    selectedField={null}
                    onFieldSelect={() => {}}
                    size={72}
                  />
                  <div className="flex-1 min-w-0 text-[11px] space-y-1">
                    {emp.active_count > 0 ? (
                      <>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--text-secondary)' }}>Tiến độ tốt nhất:</span>
                          <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                            {emp.best_progress_percent !== null ? `${emp.best_progress_percent.toFixed(1)}%` : '—'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>Chưa có KPI</div>
                    )}
                  </div>
                </div>

                <button type="button"
                  className="mt-3 w-full rounded-md border py-1.5 text-[11.5px] font-medium transition-colors"
                  style={{
                    borderColor: 'var(--border-soft)',
                    color: 'var(--accent-plum, #6d365b)',
                    background: 'var(--surface)',
                  }}
                  onClick={(e) => { e.stopPropagation(); props.onSelectEmployee(emp.email); }}>
                  <EyeIcon className="inline h-3 w-3 mr-1" />
                  Xem chi tiết
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Employee detail view ────────────────────────────────────────────────
function EmployeeKpiDetail(props: {
  year: number;
  email: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<KpiFieldResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getFieldKpi(props.year, props.email);
      setData(r);
    } catch (e: any) {
      setError(e?.message || 'Lỗi tải KPI');
    } finally {
      setLoading(false);
    }
  }, [props.year, props.email, refreshTick]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 rounded-lg border p-4"
      style={{ borderColor: 'var(--accent-primary)' }}>
      <AlertCircleIcon className="h-5 w-5" style={{ color: 'var(--accent-primary)' }} />
      <div className="text-sm flex-1">{error}</div>
      <Button variant="ghost" size="sm" onClick={load}>Thử lại</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={props.onBack}
          className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-zinc-50"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-secondary)', background: 'var(--surface)' }}>
          ← Quay lại danh sách
        </button>
        <div className="text-[11.5px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}>
          KPI {props.year} — {props.email}
        </div>
        <button type="button" onClick={() => setRefreshTick(t => t + 1)}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-zinc-50"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-secondary)', background: 'var(--surface)' }}>
          <RefreshCwIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Reconciliation info */}
      {data && (data.reconciliation?.non_kpi_field_revenue_year > 0 || data.reconciliation?.non_kpi_field_contract_count > 0) && (
        <div className="rounded-xl border p-4 text-[12px]"
          style={{
            borderColor: 'var(--accent-warning)',
            background: 'color-mix(in srgb, var(--accent-warning, #d99425) 6%, white)',
          }}>
          <div className="font-semibold mb-1" style={{ color: 'var(--accent-warning)' }}>
            Thông tin đối soát KPI
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1">
            <div>Tổng quỹ chi nhánh: <strong>{fmtVND(data.reconciliation.branch_revenue_year)}</strong></div>
            <div>Chi nhánh HĐ: <strong>{data.reconciliation.branch_contract_count}</strong></div>
            <div>Trong phạm vi KPI: <strong>{fmtVND(data.reconciliation.kpi_field_revenue_year)}</strong></div>
            <div>KPI HĐ: <strong>{data.reconciliation.kpi_field_contract_count}</strong></div>
            <div>Ngoài phạm vi KPI: <strong>{fmtVND(data.reconciliation.non_kpi_field_revenue_year)}</strong></div>
            <div>Ngoài phạm vi HĐ: <strong>{data.reconciliation.non_kpi_field_contract_count}</strong></div>
          </div>
          <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {data.reconciliation.reason_breakdown || 'KPI của user tính theo lĩnh vực được giao, không phụ thuộc người phụ trách. Phần chênh là doanh thu các lĩnh vực chưa giao KPI cho user này.'}
          </div>
        </div>
      )}

      {data && data.fields.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
          Chưa thiết lập KPI theo lĩnh vực cho nhân viên này trong năm {props.year}.
        </div>
      )}

      {data && data.fields.length > 0 && (
        <KpiCompositionCard
          year={props.year}
          fields={data.fields}
          totals={data.totals}
          subject={props.email}
        />
      )}

      {data && data.fields.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.fields.map(f => (
            <FieldKpiCard key={`${f.field_code}-${f.kpi_group_code || f.field_code}`} field={f} email={props.email} year={props.year} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field KPI Card (circular ring + metrics) ───────────────────────────
interface FieldKpiCardProps {
  field: import('@/lib/kpiFieldClient').KpiFieldResult;
  email: string;
  year: number;
}

function FieldKpiCard({ field }: FieldKpiCardProps) {
  const pct = field.progress_percent || 0;
  const hasTarget = field.has_target !== false && field.target > 0;
  const remainingLabel = field.exceeded > 0 ? 'Vượt' : 'Còn thiếu';
  const remainingValue = field.exceeded > 0 ? field.exceeded : field.remaining;

  const size = 120;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const visualPct = hasTarget ? Math.min(pct, 100) : 0;
  const dash = (visualPct / 100) * circumference;
  const pctColor = pct >= 100
    ? 'var(--accent-success, #3f8f5b)'
    : pct >= 75
      ? 'var(--accent-primary, #4A7202)'
      : pct >= 40
        ? 'var(--accent-warning, #d99425)'
        : 'var(--accent-plum, #6d365b)';

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
      <div className="flex items-start gap-3">
        {/* Ring */}
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size}>
            <circle cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke="var(--border-default)" strokeWidth={stroke} />
            {visualPct > 0 && (
              <circle cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={pctColor} strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            )}
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="text-[15px] font-bold tabular-nums" style={{ color: pctColor }}>
              {pct.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex-1 min-w-0 space-y-1.5 text-[12px]">
          <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {field.field_label}
          </div>
          {hasTarget ? (
            <>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Mục tiêu:</span>
                <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {fmtVND(field.target)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Thực đạt:</span>
                <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {fmtVND(field.actual)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>{remainingLabel}:</span>
                <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {fmtVND(remainingValue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>Số HĐ:</span>
                <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {field.contract_count}
                </span>
              </div>
            </>
          ) : (
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Chưa thiết lập mục tiêu
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────────────────
export function KpiFieldSection({ year, titleOverride }: KpiFieldSectionProps) {
  const [view, setView] = useState<ViewMode>('overview');
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEmail, setDrawerEmail] = useState<string>('');
  const [refreshTick, setRefreshTick] = useState(0);

  const handleSelectEmployee = useCallback((email: string) => {
    setSelectedEmail(email);
    setView('detail');
  }, []);

  const handleBack = useCallback(() => {
    setView('overview');
    setRefreshTick(t => t + 1);
  }, []);

  const openDrawerFor = useCallback((email: string) => {
    setDrawerEmail(email || selectedEmail);
    setDrawerOpen(true);
  }, [selectedEmail]);

  const title = titleOverride || `KPI theo lĩnh vực năm ${year}`;

  return (
    <div className="space-y-4">
      {view === 'overview' && (
        <>
          <AdminKpiOverview
            year={year}
            onSelectEmployee={handleSelectEmployee}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              className="rounded-md"
              onClick={() => openDrawerFor('')}
            >
              + Giao KPI lĩnh vực
            </Button>
          </div>
        </>
      )}

      {view === 'detail' && selectedEmail && (
        <EmployeeKpiDetail
          year={year}
          email={selectedEmail}
          onBack={handleBack}
        />
      )}

      <KpiManagementDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        initialYear={year}
        initialEmail={drawerEmail}
        onChange={() => {
          setRefreshTick(t => t + 1);
        }}
      />
    </div>
  );
}
