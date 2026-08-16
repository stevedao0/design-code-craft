/**
 * Reports workspace — Phase 6 role-adaptive redesign.
 *
 * Two role families:
 *  - ADMIN/MANAGER (has reports.view_branch or kpi.manage):
 *      1. Tổng quan chi nhánh
 *      2. Quản lý KPI
 *      3. Phân công & khối lượng
 *      4. Tái ký & hết hạn
 *  - EMPLOYEE/STAFF (own-data only):
 *      1. Tổng quan của tôi
 *      2. Công việc hợp đồng
 *      3. Tái ký & hết hạn
 *
 * Shared: year selector, refresh, export, page shell.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCwIcon, PrinterIcon, ChevronDownIcon, AlertCircleIcon,
  FileSpreadsheetIcon, FileTextIcon, FileIcon,
} from 'lucide-react';
import { Button } from '@/components/app-ui/Button';
import { PopoverMenu } from '@/components/app-ui/PopoverMenu';
import { Tabs } from '@/components/app-ui/Tabs';
import { Page, PageHeader } from '@/components/app-ui/Page';
import { Skeleton } from '@/components/reports/Skeleton';
import { Pagination } from '@/components/reports/Pagination';
import { BarChart } from '@/components/reports/BarChart';
import {
  getOverview, getUsersReport, getRenewalsReport,
  exportReport,
  fmtVND, fmtNum, fmtDate,
} from '@/components/reports/kpiClient';
import { getFieldKpi } from '@/lib/kpiFieldClient';
import type { KpiFieldResponse } from '@/lib/kpiFieldClient';
import { KpiCompositionCard } from '@/components/reports/KpiCompositionCard';
import { OrgFieldRings } from '@/components/reports/OrgFieldRings';
import type { OverviewResponse, UsersReportResponse, RenewalsReportResponse } from '@/components/reports/types';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { YearSelector } from '@/components/reports/YearSelector';
import { KpiFieldSection } from '@/components/reports/KpiFieldSection';
import { ContractTable } from '@/components/reports/ContractTable';
import { ContractExportDialog } from '@/components/reports/ContractExportDialog';
import { KpiManagementDrawer } from '@/components/reports/KpiManagementDrawer';

// ─── Role detection ────────────────────────────────────────────────────────
function useReportsPermissions() {
  const { hasPermission } = useAuth();
  return useMemo(() => {
    const canView = hasPermission('reports.view');
    // KPI target/actual/remaining/exceeded are required KPI summary numbers.
    // Anyone allowed to open the Reports page must see them.
    // Per-contract money visibility is a separate, finer-grained opt-in
    // (`reports.view_contract_value`) so individual drilldowns can stay restricted
    // without hiding the whole KPI summary.
    const canViewMoney = canView || hasPermission('reports.view_contract_value');
    const canViewContractMoney = hasPermission('reports.view_contract_value');
    return {
      canExport: hasPermission('reports.export'),
      canView,
      canViewMoney,
      canViewContractMoney,
      canManageKpi: hasPermission('kpi.manage'),
      canViewBranch: hasPermission('reports.view_branch'),
    };
  }, [hasPermission]);
}

function useIsAdminOrManager() {
  const { canManageKpi, canViewBranch } = useReportsPermissions();
  return canManageKpi || canViewBranch;
}

// ─── Types ────────────────────────────────────────────────────────────────
type AdminTabKey = 'branch-overview' | 'kpi-manage' | 'assignments' | 'renewals';
type StaffTabKey = 'my-overview' | 'my-contracts' | 'renewals';

const ADMIN_TAB_LABELS: Record<AdminTabKey, string> = {
  'branch-overview': 'Tổng quan chi nhánh',
  'kpi-manage': 'Quản lý KPI',
  'assignments': 'Phân công & khối lượng',
  'renewals': 'Tái ký & hết hạn',
};

const STAFF_TAB_LABELS: Record<StaffTabKey, string> = {
  'my-overview': 'Tổng quan',
  'my-contracts': 'Hợp đồng',
  'renewals': 'Tái ký & hết hạn',
};

const MONTHS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

// ─── Period toggle ──────────────────────────────────────────────────────
function PeriodToggle({
  value, onChange,
}: { value: 'month' | 'quarter'; onChange: (v: 'month' | 'quarter') => void }) {
  return (
    <div
      className="inline-flex items-center rounded-md p-0.5 text-[11.5px]"
      style={{ background: 'var(--surface-muted, #f1ece4)' }}
    >
      {(['month', 'quarter'] as const).map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className="rounded px-2 py-1 font-medium transition-colors"
          style={{
            background: value === opt ? 'var(--surface)' : 'transparent',
            color: value === opt ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: value === opt ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}
        >
          {opt === 'month' ? 'Tháng' : 'Quý'}
        </button>
      ))}
    </div>
  );
}

// ─── Summary stat ───────────────────────────────────────────────────────
function SummaryStat({
  label, value, accent, tone, compact,
}: { label: string; value: string; accent?: boolean; tone?: 'warning' | 'danger'; compact?: boolean }) {
  const valueColor =
    tone === 'danger'
      ? 'var(--accent-danger)'
      : tone === 'warning'
        ? 'var(--accent-warning)'
        : accent
          ? 'var(--accent-primary, #4A7202)'
          : 'var(--text-primary)';
  return (
    <div className="rounded-xl border px-3.5 py-2.5"
      style={{
        borderColor: 'var(--border-default)',
        background: accent ? 'color-mix(in srgb, var(--accent-primary, #4A7202) 5%, white)' : 'var(--surface)',
      }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums" style={{ color: valueColor }}>
        {value}
      </div>
    </div>
  );
}

// ─── Export menu ────────────────────────────────────────────────────────
function ExportMenu({
  year, disabled, scope, ownerEmail, canViewMoney,
}: { year: number; disabled: boolean; scope: string; ownerEmail?: string; canViewMoney?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [contractExportOpen, setContractExportOpen] = useState(false);

  const handle = async (fmt: 'xlsx' | 'docx' | 'pdf' | 'print') => {
    if (fmt === 'print') { window.print(); return; }
    setBusy(fmt);
    try {
      const blob = await exportReport({ report_type: scope, year, format: fmt });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `bao_cao_${scope}_${year}.${fmt}`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải ${fmt.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e?.message || 'Lỗi xuất báo cáo');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
    <PopoverMenu
      align="end"
      sideOffset={8}
      triggerClassName=""
      panelClassName="min-w-[200px] overflow-hidden rounded-md border shadow-lg"
      trigger={
        <Button
          variant="primary" size="sm"
          disabled={disabled || !!busy}
          className="rounded-md"
          rightIcon={<ChevronDownIcon className="h-3.5 w-3.5" />}
        >
          {busy ? `Đang xuất ${busy.toUpperCase()}…` : 'Xuất báo cáo'}
        </Button>
      }
    >
      {(close) => (
        <div style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
          <ExpItem
            icon={<FileSpreadsheetIcon className="h-3.5 w-3.5" />}
            label="Danh sách hợp đồng (Excel)…"
            onClick={() => { close(); setContractExportOpen(true); }}
          />
          <div className="border-t" style={{ borderColor: 'var(--border-soft)' }} />
          <ExpItem icon={<FileSpreadsheetIcon className="h-3.5 w-3.5" />} label="Xuất Excel" onClick={() => { close(); handle('xlsx'); }} />
          <ExpItem icon={<FileTextIcon className="h-3.5 w-3.5" />} label="Xuất Word" onClick={() => { close(); handle('docx'); }} />
          <ExpItem icon={<FileIcon className="h-3.5 w-3.5" />} label="Xuất PDF" onClick={() => { close(); handle('pdf'); }} />
          <div className="border-t" style={{ borderColor: 'var(--border-soft)' }} />
          <ExpItem icon={<PrinterIcon className="h-3.5 w-3.5" />} label="In báo cáo" onClick={() => { close(); handle('print'); }} />
        </div>
      )}
    </PopoverMenu>
    <ContractExportDialog
      open={contractExportOpen}
      onOpenChange={setContractExportOpen}
      year={year}
      ownerEmail={ownerEmail}
      canViewMoney={canViewMoney}
      scopeLabel={ownerEmail ? 'Theo người thực hiện' : 'Toàn đơn vị'}
    />
    </>
  );
}

function ExpItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-zinc-50"
      style={{ color: 'var(--text-primary)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
      {label}
    </button>
  );
}

// ─── Staff: Tổng quan của tôi ─────────────────────────────────────────
function StaffOverviewTab({
  year, canViewMoney, userEmail,
}: { year: number; canViewMoney: boolean; userEmail: string }) {
  const [fieldKpi, setFieldKpi] = useState<KpiFieldResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFieldKpi(year, userEmail);
      setFieldKpi(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [year, userEmail, refreshTick]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => setRefreshTick(t => t + 1);

  if (loading) return (
    <div className="space-y-4">
      <div className="rounded-xl border p-6" style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-start gap-3 rounded-lg border px-4 py-3"
      style={{ borderColor: 'var(--accent-danger)', background: 'var(--accent-danger-soft)' }}>
      <AlertCircleIcon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-danger)' }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Lỗi khi tải dữ liệu</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{error}</div>
      </div>
      <Button variant="secondary" size="sm" onClick={handleRefresh} className="shrink-0 rounded-lg">Thử lại</Button>
    </div>
  );

  const fields = fieldKpi?.fields ?? [];
  const hasKpi = fields.length > 0;

  return (
    <div className="space-y-5">
      {hasKpi ? (
        <KpiCompositionCard
          year={year}
          fields={fields}
          totals={fieldKpi?.totals ?? null}
          canViewMoney={canViewMoney}
          subject={userEmail}
        />
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center"
          style={{ borderColor: 'var(--border-default)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
          <div className="text-sm">Chưa được giao KPI theo lĩnh vực trong năm {year}.</div>
          <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Liên hệ quản trị để được phân công KPI lĩnh vực.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin: Tổng quan chi nhánh ───────────────────────────────────────
function BranchOverviewTab({
  year, canViewMoney, refreshTick,
}: { year: number; canViewMoney: boolean; refreshTick: number }) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'quarter'>('month');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getOverview({ year });
      setOverview(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );

  if (error) return (
    <div className="flex items-start gap-3 rounded-lg border px-4 py-3"
      style={{ borderColor: 'var(--accent-danger)', background: 'var(--accent-danger-soft)' }}>
      <AlertCircleIcon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-danger)' }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Lỗi khi tải dữ liệu</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{error}</div>
      </div>
      <Button variant="secondary" size="sm" onClick={load} className="shrink-0 rounded-lg">Thử lại</Button>
    </div>
  );

  if (!overview) return null;

  const totalCount = overview.total_count;
  const revenueCount = overview.positive_value_count;
  const noRevenueCount = Math.max(0, totalCount - revenueCount);
  const primary = [
    { label: 'Tổng hợp đồng', value: fmtNum(totalCount), sub: `${fmtNum(revenueCount)} có doanh thu · ${fmtNum(noRevenueCount)} chưa nhập tiền` },
    { label: 'Tổng giá trị hợp đồng', value: canViewMoney ? fmtVND(overview.total_actual) : '—', sub: canViewMoney ? `Chỉ tính ${fmtNum(revenueCount)} HĐ có doanh thu > 0` : null },
  ];

  const monthlyData = MONTHS.map((label, i) => {
    const m = overview.monthly_trend?.find(x => x.month === i + 1);
    return { label, value: m?.actual ?? 0 };
  });
  const quarterlyData = [1,2,3,4].map(q => {
    const qd = overview.quarterly_contribution?.find(x => x.quarter === q);
    return { label: `Q${q}`, value: qd?.actual ?? 0 };
  });
  const periodData = period === 'month' ? monthlyData : quarterlyData;
  const buckets = [
    { label: 'Ký mới', count: overview.new_count },
    { label: 'Tái ký', count: overview.renewal_count },
    { label: 'Hợp đồng khung', count: overview.frame_count },
    ...(overview.unknown_count > 0 ? [{ label: 'Chưa xác định', count: overview.unknown_count }] : []),
  ].filter(r => r.count > 0);

  const assignedPct = totalCount > 0 ? (overview.assigned_count / totalCount) * 100 : 0;
  const dataQualityPct = totalCount > 0 ? (revenueCount / totalCount) * 100 : 0;

  return (
    <div className="rp-bento">
      {/* Hàng 1 — hai ô nhấn */}
      <div className="rp-tile rp-tile--hero rp-c4">
        <div className="rp-tile__label"><span>{primary[0].label}</span><span>{year}</span></div>
        <div className="rp-tile__value">{primary[0].value}</div>
        <div className="rp-tile__sub">{primary[0].sub}</div>
        <div className="rp-meter"><div className="rp-meter__fill" style={{ width: `${dataQualityPct}%` }} /></div>
      </div>
      <div className="rp-tile rp-tile--brass rp-c5">
        <div className="rp-tile__label"><span>{primary[1].label}</span><span>Chưa GTGT</span></div>
        <div className="rp-tile__value rp-tile__value--brass">{primary[1].value}</div>
        {primary[1].sub && <div className="rp-tile__sub">{primary[1].sub}</div>}
      </div>
      <div className="rp-tile rp-c3">
        <div className="rp-tile__label"><span>Tình trạng hiệu lực</span></div>
        <div className="rp-list">
          <div className="rp-list__row"><span>Đang hiệu lực</span><span className="rp-num--success">{fmtNum(overview.active_count)}</span></div>
          <div className="rp-list__row"><span>Sắp hết hạn</span><span className="rp-num--warning">{fmtNum(overview.expiring_count)}</span></div>
          <div className="rp-list__row"><span>Hết hạn</span><span className="rp-num--danger">{fmtNum(overview.expired_count)}</span></div>
          <div className="rp-list__row"><span>GCN đã cấp</span><span className="rp-num--success">{fmtNum(overview.gcn_issued_count)}</span></div>
        </div>
      </div>

      {/* Hàng 2 — vòng KPI lĩnh vực chiếm trọn */}
      <div className="rp-c12" style={{ gridColumn: 'span 12', minWidth: 0 }}>
        <OrgFieldRings year={year} />
      </div>

      {/* Hàng 3 — biểu đồ + các ô số liệu đậm đặc */}
      <div className="rp-tile rp-c8 rp-tile--flush">
        <div className="rp-tile__label">
          <span>{period === 'month' ? 'Doanh thu chưa GTGT theo tháng' : 'Doanh thu chưa GTGT theo quý'} · {year}</span>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        <BarChart data={periodData}
          color={period === 'month' ? 'var(--accent-primary)' : 'var(--accent-brass)'} />
      </div>

      <div className="rp-tile rp-c4">
        <div className="rp-tile__label"><span>Chất lượng dữ liệu giá trị</span></div>
        <div className="rp-list">
          <div className="rp-list__row"><span>Có giá trị</span><span className="rp-num--success">{fmtNum(overview.positive_value_count)}</span></div>
          <div className="rp-list__row"><span>Bằng 0</span><span>{fmtNum(overview.zero_value_count)}</span></div>
          <div className="rp-list__row"><span>Chưa có dữ liệu</span><span className="rp-num--warning">{fmtNum(overview.null_value_count)}</span></div>
        </div>
        <div className="rp-tile__label" style={{ marginTop: 4 }}><span>Phân bổ người thực hiện</span></div>
        <div className="rp-list">
          <div className="rp-list__row"><span>Đã gán</span><span>{fmtNum(overview.assigned_count)}</span></div>
          <div className="rp-list__row"><span>Chưa gán</span><span className="rp-num--warning">{fmtNum(overview.unassigned_count)}</span></div>
        </div>
        <div className="rp-meter"><div className="rp-meter__fill" style={{ width: `${assignedPct}%` }} /></div>
      </div>

      {/* Hàng 4 — phân loại ký */}
      {buckets.length > 0 && (
        <div className="rp-tile rp-c12">
          <div className="rp-tile__label"><span>Phân loại ký · {fmtNum(totalCount)} hợp đồng</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {buckets.map((rw, i) => {
              const pct = totalCount > 0 ? (rw.count / totalCount) * 100 : 0;
              return (
                <div key={rw.label} className="min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span style={{ color: 'var(--text-primary)' }}>{rw.label}</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {fmtNum(rw.count)} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="rp-meter">
                    <div className={`rp-meter__fill${i % 2 ? ' rp-meter__fill--brass' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hàng 5 — bảng hợp đồng */}
      <div className="rp-tile rp-c12">
        <div className="rp-tile__label"><span>Danh sách hợp đồng ký năm {year}</span></div>
        <ContractTable year={year} canViewMoney={canViewMoney} />
      </div>
    </div>
  );
}


// ─── Admin: Phân công & khối lượng ─────────────────────────────────────
function AssignmentsTab({ year, canViewMoney }: { year: number; canViewMoney: boolean }) {
  const [data, setData] = useState<UsersReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getUsersReport(year);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(u =>
      (u.username || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  if (loading) return (
    <div className="space-y-3">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 rounded-xl border p-4"
      style={{ borderColor: 'var(--accent-danger)' }}>
      <AlertCircleIcon className="h-5 w-5" style={{ color: 'var(--accent-danger)' }} />
      <div className="text-sm flex-1">{error}</div>
      <Button variant="ghost" size="sm" onClick={load}>Thử lại</Button>
    </div>
  );

  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat label="Tổng hợp đồng" value={fmtNum(data.branch.contract_count)} />
          <SummaryStat label="Giá trị" value={canViewMoney ? fmtVND(data.branch.actual) : '—'} accent />
          <SummaryStat label="Đã gán nhân viên" value={fmtNum(data.branch.assigned_count)} />
          <SummaryStat label="Chưa gán nhân viên" value={fmtNum(data.branch.unassigned_count)} />
        </div>
      </div>

      {data.unassigned && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Hợp đồng chưa gán nhân viên
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryStat label="Số hợp đồng" value={fmtNum(data.unassigned.contract_count)} compact />
            <SummaryStat label="Giá trị" value={canViewMoney ? fmtVND(data.unassigned.actual) : '—'} accent compact />
            <SummaryStat label="Có giá trị" value={fmtNum(data.unassigned.positive_value_count ?? 0)} compact />
            <SummaryStat label="Bằng 0" value={fmtNum(data.unassigned.zero_value_count ?? 0)} compact />
            <SummaryStat label="Chưa có dữ liệu" value={fmtNum(data.unassigned.null_value_count ?? 0)} compact />
          </div>
        </div>
      )}

      {/* Employee table */}
      {data.users.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b"
            style={{ borderColor: 'var(--border-default)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Phân công & khối lượng
            </div>
            <input
              type="search" placeholder="Tìm email hoặc tên…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="rounded-md border px-2 py-1 text-[12px] w-56"
              style={{ borderColor: 'var(--border-default)', background: 'var(--surface)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: 'var(--surface-muted, #f1ece4)' }}>
                <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                  <th className="sticky top-0 px-4 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Email</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Tên hiển thị</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium text-right" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Số HĐ</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium text-right" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Ký mới</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium text-right" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Tái ký</th>
                  {canViewMoney && (
                    <th className="sticky top-0 px-3 py-2.5 font-medium text-right" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Giá trị</th>
                  )}
                  <th className="sticky top-0 px-3 py-2.5 font-medium text-center" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Trạng thái KPI</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.user_id} className="border-t" style={{ borderColor: 'var(--border-default)' }}>
                    <td className="px-4 py-2.5 font-medium max-w-[260px] truncate" style={{ color: 'var(--text-primary)' }} title={u.username ?? ''}>
                      {u.username ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-[180px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {u.display_name && u.display_name !== u.username ? u.display_name : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fmtNum(u.contract_count)}
                      {(u.null_value_count ?? 0) > 0 && (
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          +{u.null_value_count} chưa có dữ liệu
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(u.new_count ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(u.renewal_count ?? 0)}</td>
                    {canViewMoney && (
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--accent-primary)' }}>
                        {fmtVND(u.actual)}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center">
                      {u.configured ? (
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: 'color-mix(in srgb, var(--accent-success) 14%, white)', color: 'var(--accent-success)' }}>
                          Đã thiết lập
                        </span>
                      ) : (
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: 'color-mix(in srgb, var(--accent-primary, #4A7202) 10%, white)', color: 'var(--accent-primary, #4A7202)' }}>
                            Chưa thiết lập
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={canViewMoney ? 7 : 6} className="px-4 py-8 text-center text-xs"
                      style={{ color: 'var(--text-muted)' }}>
                      Không có nhân viên phù hợp với từ khoá tìm kiếm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared: Tái ký & hết hạn ────────────────────────────────────────────
const RENEWAL_PAGE_SIZE = 20;

function classifyRenewal(item: { is_overdue: boolean; renewal_link_status: string; days_remaining: number | null }) {
  if (item.renewal_link_status === 'linked') return { key: 'renewed', label: 'Đã tái ký', tone: 'success' };
  if (item.is_overdue) return { key: 'overdue', label: 'Đã quá hạn', tone: 'danger' };
  if ((item.days_remaining ?? 0) <= 30) return { key: 'expiring', label: 'Sắp hết hạn', tone: 'warning' };
  return { key: 'need-renewal', label: 'Cần tái ký', tone: 'info' };
}

function RenewalsTab({ year }: { year: number }) {
  const [data, setData] = useState<RenewalsReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [classFilter, setClassFilter] = useState<'all' | 'need-renewal' | 'expiring' | 'overdue' | 'renewed' | 'unassigned'>('all');
  const [includeHistorical, setIncludeHistorical] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getRenewalsReport({
        year,
        page,
        page_size: RENEWAL_PAGE_SIZE,
        include_historical: includeHistorical,
      });
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [year, page, includeHistorical]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [year, includeHistorical]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (classFilter === 'all') return data.items;
    if (classFilter === 'unassigned') return data.items.filter(it => !it.owner_user_id);
    return data.items.filter(it => classifyRenewal(it).key === classFilter);
  }, [data, classFilter]);

  // Use server-side summary counts; fallback to client-side only for unassigned
  const stats = useMemo(() => ({
    need: data?.needs_renewal_count ?? 0,
    expiring: data?.expiring_soon_count ?? 0,
    overdue: data?.overdue_count ?? 0,
    renewed: data?.renewed_count ?? 0,
    unassigned: data?.unassigned_count ?? 0,
    unknown: 0,
  }), [data]);

  if (loading) return (
    <div className="space-y-3">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 rounded-xl border p-4" style={{ borderColor: 'var(--accent-danger)' }}>
      <AlertCircleIcon className="h-5 w-5" style={{ color: 'var(--accent-danger)' }} />
      <div className="text-sm flex-1">{error}</div>
      <Button variant="ghost" size="sm" onClick={load}>Thử lại</Button>
    </div>
  );

  if (!data) return null;

  const totalPages = Math.max(1, Math.ceil((data.total_count || 0) / RENEWAL_PAGE_SIZE));
  const rangeFrom = data.total_count ? Math.min((page - 1) * RENEWAL_PAGE_SIZE + 1, data.total_count) : 0;
  const rangeTo = Math.min(page * RENEWAL_PAGE_SIZE, data.total_count || 0);

  return (
    <div className="space-y-5">
      {/* Summary stats — server-side counts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button type="button" onClick={() => setClassFilter('all')}
          className={`rounded-xl border p-3.5 text-left transition-colors ${classFilter === 'all' ? 'ring-2 ring-offset-1' : ''}`}
          style={{ borderColor: classFilter === 'all' ? 'var(--accent-primary)' : 'var(--border-default)', background: 'var(--surface)' }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Tổng cần xử lý</div>
          <div className="mt-1 text-base font-semibold tabular-nums" style={{ color: 'var(--accent-primary)' }}>{fmtNum(data.needs_renewal_count + data.expiring_soon_count + data.overdue_count)}</div>
        </button>
        <button type="button" onClick={() => setClassFilter('expiring')}
          className={`rounded-xl border p-3.5 text-left transition-colors ${classFilter === 'expiring' ? 'ring-2 ring-offset-1' : ''}`}
          style={{ borderColor: classFilter === 'expiring' ? 'var(--accent-warning)' : 'var(--border-default)', background: 'var(--surface)' }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Sắp hết hạn (≤30 ngày)</div>
          <div className="mt-1 text-base font-semibold tabular-nums" style={{ color: stats.expiring ? 'var(--accent-warning)' : 'var(--text-primary)' }}>{fmtNum(stats.expiring)}</div>
        </button>
        <button type="button" onClick={() => setClassFilter('overdue')}
          className={`rounded-xl border p-3.5 text-left transition-colors ${classFilter === 'overdue' ? 'ring-2 ring-offset-1' : ''}`}
          style={{ borderColor: classFilter === 'overdue' ? 'var(--accent-primary)' : 'var(--border-default)', background: 'var(--surface)' }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Đã quá hạn</div>
          <div className="mt-1 text-base font-semibold tabular-nums" style={{ color: 'var(--accent-primary)' }}>{fmtNum(stats.overdue)}</div>
        </button>
        <button type="button" onClick={() => setClassFilter('renewed')}
          className={`rounded-xl border p-3.5 text-left transition-colors ${classFilter === 'renewed' ? 'ring-2 ring-offset-1' : ''}`}
          style={{ borderColor: classFilter === 'renewed' ? 'var(--accent-success)' : 'var(--border-default)', background: 'var(--surface)' }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Đã tái ký</div>
          <div className="mt-1 text-base font-semibold tabular-nums" style={{ color: 'var(--accent-success)' }}>{fmtNum(stats.renewed)}</div>
        </button>
      </div>

      {/* Historical toggle + Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={includeHistorical}
            onChange={e => setIncludeHistorical(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#4A7202]"
          />
          Bao gồm tồn đọng trước kỳ
        </label>
        <div className="flex-1" />
        {([
          ['all', `Tất cả (${data.total_count})`],
          ['need-renewal', `Cần tái ký (${stats.need})`],
          ['expiring', `Sắp hết hạn (${stats.expiring})`],
          ['overdue', `Đã quá hạn (${stats.overdue})`],
          ['renewed', `Đã tái ký (${stats.renewed})`],
          ['unassigned', `Chưa gán (${stats.unassigned})`],
        ] as const).map(([key, label]) => {
          const active = classFilter === key;
          return (
            <button key={key} type="button" onClick={() => setClassFilter(key)}
              className="rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors"
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

      {/* Table */}
      {filteredItems.length > 0 ? (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: 'var(--surface-muted, #f1ece4)' }}>
                <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Đơn vị</th>
                  <th className="sticky top-0 whitespace-nowrap px-4 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Số HĐ cũ</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Lĩnh vực</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Người thực hiện</th>
                  <th className="sticky top-0 whitespace-nowrap px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Ngày hết hạn</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Phân loại</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>HĐ tái ký</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  const cls = classifyRenewal(item);
                  const toneStyle = cls.tone === 'success'
                    ? { background: 'color-mix(in srgb, var(--accent-success) 14%, white)', color: 'var(--accent-success)' }
                    : cls.tone === 'danger'
                      ? { background: 'color-mix(in srgb, var(--accent-primary, #4A7202) 12%, white)', color: 'var(--accent-primary, #4A7202)' }
                      : cls.tone === 'warning'
                        ? { background: 'color-mix(in srgb, var(--accent-warning) 14%, white)', color: 'var(--accent-warning)' }
                        : { background: 'color-mix(in srgb, var(--accent-brass) 12%, white)', color: 'var(--accent-brass)' };
                  return (
                    <tr key={item.old_contract_id} className="border-t" style={{ borderColor: 'var(--border-default)' }}>
                      <td className="px-3 py-2.5 max-w-[200px] truncate font-medium" style={{ color: 'var(--text-primary)' }}
                        title={item.organization_name}>{item.organization_name}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {item.old_contract_number}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-primary)' }}>{item.field}</td>
                      <td className="px-3 py-2.5">
                        {item.owner_email ? (
                          <span className="block max-w-[200px] truncate text-[11px]" title={item.owner_email}
                            style={{ color: 'var(--text-secondary)' }}>{item.owner_email}</span>
                        ) : (
                          <span className="text-[10px] font-medium" style={{ color: 'var(--accent-primary)' }}>Chưa gán</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums"
                        style={{ color: item.is_overdue ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                        {fmtDate(item.end_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={toneStyle}>
                          {cls.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {item.new_contract_number ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page} totalPages={totalPages} total={data.total_count}
            pageSize={RENEWAL_PAGE_SIZE}
            rangeFrom={rangeFrom} rangeTo={rangeTo}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <div className="rounded-xl border p-6 text-center text-sm"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
          {classFilter === 'all'
            ? `Không có hợp đồng hết hạn nào trong năm ${year}${includeHistorical ? ' (bao gồm tồn đọng)' : ''}.`
            : 'Không có hợp đồng nào khớp với bộ lọc đã chọn.'}
        </div>
      )}
    </div>
  );
}

// ─── Admin: Quản lý KPI workspace ────────────────────────────────────
function KpiManageTab({ year }: { year: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <KpiFieldSection year={year} />
      <KpiManagementDrawer
        open={open}
        onOpenChange={setOpen}
        initialYear={year}
        initialEmail=""
        /* eslint-disable-next-line @typescript-eslint/no-empty-function */
        onChange={() => {}}
      />
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────
export function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const { currentUser } = useAuth();
  const { canExport, canViewMoney, canManageKpi, canViewBranch } = useReportsPermissions();
  const isAdminOrManager = canManageKpi || canViewBranch;

  const [year, setYear] = useState<number>(currentYear);
  const [refreshTick, setRefreshTick] = useState(0);

  const handleRefresh = useCallback(() => setRefreshTick(t => t + 1), []);

  // Admin tabs
  const [adminTab, setAdminTab] = useState<AdminTabKey>('branch-overview');
  const adminTabs = useMemo(() => ([
    { value: 'branch-overview', label: ADMIN_TAB_LABELS['branch-overview'] },
    { value: 'kpi-manage', label: ADMIN_TAB_LABELS['kpi-manage'] },
    { value: 'assignments', label: ADMIN_TAB_LABELS['assignments'] },
    { value: 'renewals', label: ADMIN_TAB_LABELS['renewals'] },
  ]), []);

  // Staff tabs
  const [staffTab, setStaffTab] = useState<StaffTabKey>('my-overview');
  const staffTabs = useMemo(() => ([
    { value: 'my-overview', label: STAFF_TAB_LABELS['my-overview'] },
    { value: 'my-contracts', label: STAFF_TAB_LABELS['my-contracts'] },
    { value: 'renewals', label: STAFF_TAB_LABELS['renewals'] },
  ]), []);

  const currentUserEmail = currentUser?.email ?? '';
  const userEmail = currentUserEmail;
  const pageTitle = 'Báo cáo';
  const scope = isAdminOrManager
    ? (adminTab === 'renewals' ? 'renewals' : adminTab === 'assignments' ? 'users' : 'overview')
    : (staffTab === 'renewals' ? 'renewals' : staffTab === 'my-contracts' ? 'users' : 'overview');

  return (
    <Page>
    <div className="flex min-h-0 flex-1 flex-col w-full">
      <PageHeader
        eyebrow="VCPMC · Báo cáo"
        title={`${pageTitle} năm ${year}`}
        description="KPI, doanh thu và tình trạng hợp đồng trong kỳ báo cáo"
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              title="Làm mới dữ liệu"
              aria-label="Làm mới dữ liệu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-zinc-50"
              style={{ borderColor: 'var(--border-soft)', color: 'var(--text-secondary)', background: 'var(--surface)' }}>
              <RefreshCwIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title="In"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors hover:bg-zinc-50"
              style={{ borderColor: 'var(--border-soft)', color: 'var(--text-secondary)', background: 'var(--surface)' }}>
              <PrinterIcon className="h-3.5 w-3.5" />In
            </button>
            {canExport && (
              <ExportMenu
                year={year}
                disabled={false}
                scope={scope}
                canViewMoney={canViewMoney}
                ownerEmail={isAdminOrManager ? undefined : currentUserEmail}
              />
            )}
          </>
        }
      />

        {/* Year control */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}>Kỳ báo cáo</span>
          <YearSelector year={year} onChange={setYear} />
        </div>

      {/* Tabs */}
      <div>
        <Tabs
          value={isAdminOrManager ? adminTab : staffTab}
          onChange={v => {
            if (isAdminOrManager) setAdminTab(v as AdminTabKey);
            else setStaffTab(v as StaffTabKey);
          }}
          tabs={isAdminOrManager ? adminTabs : staffTabs}
        />
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="py-1">
          {/* ADMIN tabs */}
          {isAdminOrManager && (
            <>
              {adminTab === 'branch-overview' && (
                <BranchOverviewTab key={`${refreshTick}-bo`} year={year} canViewMoney={canViewMoney} refreshTick={refreshTick} />
              )}
              {adminTab === 'kpi-manage' && (
                <KpiManageTab key={`${refreshTick}-km`} year={year} />
              )}
              {adminTab === 'assignments' && (
                <AssignmentsTab key={`${refreshTick}-as`} year={year} canViewMoney={canViewMoney} />
              )}
              {adminTab === 'renewals' && (
                <RenewalsTab key={`${refreshTick}-rn`} year={year} />
              )}
            </>
          )}

          {/* STAFF tabs */}
          {!isAdminOrManager && (
            <>
              {staffTab === 'my-overview' && (
                <StaffOverviewTab key={`${refreshTick}-so`} year={year} canViewMoney={canViewMoney} userEmail={userEmail} />
              )}
              {staffTab === 'my-contracts' && (
                <div className="space-y-4">
                  <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                      Hợp đồng
                    </div>
                    <div className="mt-0.5 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                      Hợp đồng do {userEmail} ký trong năm {year}
                    </div>
                  </div>
                  <ContractTable year={year} canViewMoney={canViewMoney} ownerEmail={userEmail} />
                </div>
              )}
              {staffTab === 'renewals' && (
                <RenewalsTab key={`${refreshTick}-sr`} year={year} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </Page>
  );
}
