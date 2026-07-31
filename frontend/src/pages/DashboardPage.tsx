import React, { useEffect, useMemo, useState } from 'react';
import {
  FileTextIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  WalletIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  AwardIcon,
  TrendingUpIcon,
  SparklesIcon,
  AlertCircleIcon,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Page, PageHeader, Section, ContentCard } from '../components/app-ui/Page';
import { MetricCard } from '../components/app-ui/MetricCard';
import { EmptyState } from '../components/app-ui/EmptyState';
import { LoadingState } from '../components/app-ui/LoadingState';
import { StatusBadge } from '../components/app-ui/StatusBadge';
import { RouteKey } from '../data/routes';
import { formatCurrency, formatNumber, formatShortVND } from '../lib/format';
import { TOKEN_KEY } from '../lib/authClient';
import { apiRequest } from '../lib/apiClient';

const YEAR_OPTIONS = [
  { value: '2024', label: '2024' },
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
];

// =============================================================================
// Types — mirror backend Pydantic schemas
// =============================================================================

type ExpiringContractItem = {
  id: number;
  contract_no: string;
  partner: string;
  field: string;
  expire_date: string | null;
  days_left: number;
  value: number | null;
};

type OperationalSignalItem = {
  key: string;
  label: string;
  sub: string;
  value: number;
  tone: string;
};

type MonthlyTrendItem = {
  month: number;
  year: number;
  contract_count: number;
  total_revenue: number | null;
};

type ReportsSummary = {
  selected_year: number;
  contracts_total_all_time: number;
  contracts_total_in_year: number;
  contracts_active: number;
  contracts_expiring_30_days: number;
  contracts_expiring_60_days: number;
  contracts_expired: number;
  contracts_pending_renewal: number;
  revenue_year: number | null;
  revenue_previous_year: number | null;
  revenue_growth_percent: number | null;
  user_email: string | null;
  user_revenue_year: number | null;
  user_kpi_contract_count: number | null;
  monthly_trend: MonthlyTrendItem[];
  priority_contracts: ExpiringContractItem[];
  operational_signals: OperationalSignalItem[];
  certificates_issued: number;
  certificates_draft: number;
  certificates_pending_print: number;
  // Legacy compat
  total_contracts: number;
  active_count: number;
  expiring_30d_count: number;
  expiring_60d_count: number;
  expired_count: number;
  pending_renewal_count: number;
  gcn_draft: number;
  gcn_final_printed: number;
  total_works: number;
};

type SignalTone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

function daysTone(daysLeft: number): SignalTone {
  if (daysLeft <= 7) return 'danger';
  if (daysLeft <= 30) return 'warning';
  return 'neutral';
}

function signalToneToMetric(tone: string): SignalTone {
  if (tone === 'success' || tone === 'warning' || tone === 'danger' || tone === 'primary') return tone;
  return 'neutral';
}

export function DashboardPage({
  userEmail,
  onNavigate,
}: {
  userEmail: string;
  onNavigate: (k: RouteKey) => void;
}) {
  const [year, setYear] = useState('2026');
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
          if (!cancelled) {
            setError('Không có phiên đăng nhập.');
            setLoading(false);
          }
          return;
        }
        const data = await apiRequest<ReportsSummary>(`/reports/summary?year=${year}`, { token });
        if (!cancelled) setSummary(data);
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message || 'Không tải được dữ liệu tổng quan.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadTick, year]);

  const triggerRefresh = () => setReloadTick((v) => v + 1);

  const stats = summary
    ? {
        contractsTotalAllTime: summary.contracts_total_all_time ?? summary.total_contracts ?? 0,
        contractsTotalInYear: summary.contracts_total_in_year ?? 0,
        active: summary.contracts_active ?? summary.active_count ?? 0,
        expiring30: summary.contracts_expiring_30_days ?? summary.expiring_30d_count ?? 0,
        expiring60: summary.contracts_expiring_60_days ?? summary.expiring_60d_count ?? 0,
        expired: summary.contracts_expired ?? summary.expired_count ?? 0,
        pendingRenewal: summary.contracts_pending_renewal ?? summary.pending_renewal_count ?? 0,
        gcnFinalPrinted: summary.certificates_issued ?? summary.gcn_final_printed ?? 0,
        branchRevenueYear: summary.revenue_year ?? 0,
        userKpiContractCount: summary.user_kpi_contract_count ?? 0,
        revenueYear: summary.user_revenue_year ?? summary.revenue_year ?? 0,
        revenuePrev: summary.revenue_previous_year ?? 0,
        revenueGrowth: summary.revenue_growth_percent ?? null,
        selectedYear: summary.selected_year ?? parseInt(year),
        monthlyTrend: summary.monthly_trend ?? [],
        priorityContracts: summary.priority_contracts ?? [],
        operationalSignals: summary.operational_signals ?? [],
      }
    : null;

  const revenueCurrent = useMemo(() => stats?.revenueYear ?? 0, [stats?.revenueYear]);
  const revenuePrev = useMemo(() => stats?.revenuePrev ?? 0, [stats?.revenuePrev]);
  const revenueDeltaPct =
    stats?.revenueGrowth != null
      ? stats.revenueGrowth
      : revenuePrev > 0
      ? ((revenueCurrent - revenuePrev) / revenuePrev) * 100
      : null;

  const chartData = useMemo(
    () =>
      (stats?.monthlyTrend ?? []).map((m) => ({
        year: `${m.year}`,
        month: `T${m.month}`,
        revenueBn: m.total_revenue != null ? m.total_revenue / 1_000_000_000 : 0,
        contract_count: m.contract_count,
      })),
    [stats?.monthlyTrend]
  );

  // contracts needing action = expiring_30 + expired + pending_renewal
  const needsAction = useMemo(() => {
    if (!stats) return 0;
    return (stats.expiring30 ?? 0) + (stats.expired ?? 0) + (stats.pendingRenewal ?? 0);
  }, [stats]);

  const expiringItems = useMemo(
    () =>
      (stats?.priorityContracts ?? []).map((c) => ({
        id: String(c.id),
        partner: c.partner,
        contractNo: c.contract_no,
        expireDate: c.expire_date ?? '',
        daysLeft: c.days_left,
        value: c.value,
      })),
    [stats?.priorityContracts]
  );
  const tableQueue = expiringItems.slice(0, 8);

  const signalItems = useMemo(
    () =>
      (stats?.operationalSignals ?? []).map((s) => ({
        key: s.key,
        label: s.label,
        sub: s.sub,
        value: formatNumber(s.value),
        tone: signalToneToMetric(s.tone),
      })),
    [stats?.operationalSignals]
  );

  const quickActions = useMemo(
    () => [
      {
        key: 'contracts.create',
        label: 'Tạo hợp đồng',
        icon: <FileTextIcon className="h-4 w-4" />,
      },
      {
        key: 'contracts.print',
        label: 'In GCN',
        icon: <AwardIcon className="h-4 w-4" />,
      },
      {
        key: 'reports',
        label: 'Mở báo cáo',
        icon: <TrendingUpIcon className="h-4 w-4" />,
      },
    ],
    []
  );

  const headerSubtitle = stats
    ? `Doanh thu theo lĩnh vực KPI được giao năm ${year} đạt ${formatCurrency(stats.revenueYear)} — ${formatNumber(stats.contractsTotalAllTime)} hợp đồng quản lý.`
    : 'Đang tải dữ liệu tổng quan...';

  return (
    <Page>
      {/* ─── Header: title + year selector + refresh ─────────── */}
      <PageHeader
        eyebrow="Mission control"
        title="Trung tâm điều hành"
        description={headerSubtitle}
        primaryAction={
          <button
            type="button"
            className="vcpmc-refresh ds-button ds-button-primary"
            style={{ height: 36, padding: '0 14px', borderRadius: 10 }}
            onClick={triggerRefresh}
            disabled={loading}
            aria-label="Làm mới dữ liệu"
            title="Làm mới"
          >
            <RefreshCwIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="vcpmc-refresh__label">Làm mới</span>
          </button>
        }
        actions={
          <div
            className="vcpmc-yearstrip inline-flex items-center gap-1 p-1 rounded-md"
            style={{
              background: 'var(--surface-muted)',
              boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
            }}
            role="group"
            aria-label="Chọn năm"
          >
            {YEAR_OPTIONS.map((y) => (
              <button
                key={y.value}
                type="button"
                onClick={() => setYear(y.value)}
                aria-pressed={year === y.value}
                className="h-8 px-3 text-xs font-semibold rounded-[6px] transition-colors"
                style={
                  year === y.value
                    ? {
                        background: 'var(--text-primary)',
                        color: 'white',
                      }
                    : {
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                      }
                }
              >
                {y.label}
              </button>
            ))}
          </div>
        }
      />

      {/* ─── Page-level error / loading strip (preserves frame) ── */}
      {error && !loading && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-md"
          style={{
            background: 'var(--accent-danger-soft)',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent-danger) 22%, transparent)',
          }}
        >
          <AlertCircleIcon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-danger)' }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: 'var(--accent-danger)' }}>
              Không tải được dữ liệu tổng quan
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {error}
            </div>
          </div>
          <button
            type="button"
            onClick={triggerRefresh}
            className="text-xs font-semibold underline-offset-2 hover:underline"
            style={{ color: 'var(--accent-danger)' }}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* ─── Section 1: Primary operating posture ─────────────── */}
      <Section ariaLabel="Tư thế vận hành chính" gap="normal">
        <div className="dashboard-metrics">
          <div className="dashboard-metrics__grid gap-3 sm:gap-4 min-w-0">
            <MetricCard
              variant="primary"
              tone="danger"
              className="dashboard-metrics__primary"
              label="Hợp đồng cần xử lý"
              value={loading || !stats ? '—' : formatNumber(needsAction)}
              icon={<AlertTriangleIcon className="h-5 w-5" />}
              hint={
                !stats
                  ? 'Đang tải'
                  : `${formatNumber(stats.expiring30)} hết hạn trong 30 ngày · ${formatNumber(stats.expired)} đã quá hạn · ${formatNumber(stats.pendingRenewal)} chờ tái ký`
              }
              ring={needsAction > 0 ? 'rose' : 'neutral'}
            />
            <MetricCard
              variant="primary"
              tone="success"
              className="dashboard-metrics__secondary"
              label="Đang hiệu lực"
              value={loading || !stats ? '—' : formatNumber(stats.active)}
              icon={<CheckCircle2Icon className="h-5 w-5" />}
              hint={
                !stats
                  ? 'Đang tải'
                  : `${stats.contractsTotalAllTime > 0
                      ? Math.round((stats.active / stats.contractsTotalAllTime) * 100)
                      : 0}% trên tổng số hợp đồng`
              }
            />
            <MetricCard
              variant="primary"
              tone="primary"
              className="dashboard-metrics__secondary"
              label="Doanh thu KPI năm nay"
              value={loading || !stats ? '—' : formatShortVND(stats.revenueYear)}
              icon={<WalletIcon className="h-5 w-5" />}
              delta={
                revenueDeltaPct != null
                  ? {
                      value: `${revenueDeltaPct >= 0 ? '+' : ''}${revenueDeltaPct.toFixed(1)}%`,
                      tone: revenueDeltaPct >= 0 ? 'up' : 'down',
                    }
                  : undefined
              }
              hint={
                !stats
                  ? 'Đang tải'
                  : `Theo lĩnh vực KPI được giao (${formatNumber(stats.userKpiContractCount)} hợp đồng)`
              }
            />
          </div>
        </div>
      </Section>

      {/* ─── Section 2: Trend + contract health ───────────────── */}
      <Section ariaLabel="Xu hướng và tình trạng hợp đồng" gap="normal">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 min-w-0">
          {/* Revenue trend */}
          <ContentCard
            className="lg:col-span-8"
            header={
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] page-header__eyebrow">
                    Xu hướng doanh thu
                  </p>
                  <h2 className="text-[15px] font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                    Doanh thu chi nhánh theo tháng
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Tổng doanh thu chi nhánh năm {year}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[20px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    {stats ? formatShortVND(stats.branchRevenueYear) : '—'}
                  </div>
                  {revenueDeltaPct != null && (
                    <span
                      className={`inline-flex items-center text-[11px] font-semibold mt-0.5 px-1.5 py-0.5 rounded ${
                        revenueDeltaPct >= 0 ? 'metric-card__sub--up' : 'metric-card__sub--down'
                      }`}
                      style={
                        revenueDeltaPct >= 0
                          ? { background: 'var(--accent-emerald-soft)' }
                          : { background: 'var(--accent-danger-soft)' }
                      }
                    >
                      {revenueDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(revenueDeltaPct).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            }
            padded={false}
          >
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              {loading && !stats ? (
                <LoadingState label="Đang tải biểu đồ..." />
              ) : chartData.length === 0 ? (
                <EmptyState title="Chưa có dữ liệu doanh thu" description="Chọn năm khác hoặc đợi hệ thống tổng hợp." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke="var(--border-subtle)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tickFormatter={(v) => `${Number(v).toFixed(1)} tỷ`}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--accent-primary-soft)' }}
                      formatter={(v: any) => [`${Number(v).toFixed(2)} tỷ ₫`, 'Doanh thu']}
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid var(--border-default)',
                        background: 'var(--surface-elevated)',
                        boxShadow: 'var(--shadow-md)',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Bar dataKey="revenueBn" radius={[6, 6, 0, 0]} fill="var(--accent-primary)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ContentCard>

          {/* Contract health */}
          <ContentCard
            className="lg:col-span-4"
            header={
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] page-header__eyebrow">
                  Sức khỏe hợp đồng
                </p>
                <h2 className="text-[15px] font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  Phân bổ trạng thái
                </h2>
              </div>
            }
          >
            {!stats ? (
              <LoadingState />
            ) : (
              <HealthBars
                total={stats.active + stats.expiring60 + stats.expired + stats.pendingRenewal}
                segments={[
                  { name: 'Đang hiệu lực', value: stats.active, tone: 'success' },
                  { name: 'Sắp hết 60 ngày', value: stats.expiring60, tone: 'warning' },
                  { name: 'Hết hạn', value: stats.expired, tone: 'danger' },
                  { name: 'Chờ tái ký', value: stats.pendingRenewal, tone: 'neutral' },
                ]}
              />
            )}
          </ContentCard>
        </div>
      </Section>

      {/* ─── Section 3: Attention queue + operational signals ─── */}
      <Section ariaLabel="Hàng chờ xử lý và tín hiệu vận hành" gap="normal">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 min-w-0">
          {/* Priority contracts table */}
          <ContentCard
            className="lg:col-span-8"
            header={
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] page-header__eyebrow">
                    Hợp đồng ưu tiên
                  </p>
                  <h2 className="text-[15px] font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                    Cần xử lý trước
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {tableQueue.length} hợp đồng sắp hết hạn — bấm để mở chi tiết
                  </p>
                </div>
                <button
                  type="button"
                  className="ds-button ds-button-secondary"
                  style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                  onClick={() => onNavigate('contracts.list')}
                >
                  Xem tất cả <ArrowRightIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            }
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="vc-datatable is-compact w-full">
                <thead>
                  <tr>
                    <th>Mã HĐ</th>
                    <th>Đối tác</th>
                    <th>Hết hạn</th>
                    <th className="text-right">Còn lại</th>
                    <th className="text-right">Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {tableQueue.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState
                          title="Không có hợp đồng ưu tiên"
                          description="Mọi hợp đồng hiện đang trong tầm kiểm soát."
                          icon={<CheckCircle2Icon className="h-5 w-5" />}
                        />
                      </td>
                    </tr>
                  ) : (
                    tableQueue.map((c) => {
                      const tone = daysTone(c.daysLeft);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => onNavigate('contracts.list')}
                          className="cursor-pointer"
                        >
                          <td className="font-mono font-semibold">{c.contractNo}</td>
                          <td>
                            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {c.partner}
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{c.expireDate || '—'}</td>
                          <td className="text-right">
                            <StatusBadge tone={tone as any} compact dot>
                              {c.daysLeft < 0
                                ? `Quá ${Math.abs(c.daysLeft)} ngày`
                                : `${c.daysLeft} ngày`}
                            </StatusBadge>
                          </td>
                          <td className="text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {c.value != null ? formatCurrency(c.value) : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </ContentCard>

          {/* Operational signals + quick actions */}
          <ContentCard
            className="lg:col-span-4"
            header={
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] page-header__eyebrow">
                  Tín hiệu vận hành
                </p>
                <h2 className="text-[15px] font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  Cần xử lý trong tuần
                </h2>
              </div>
            }
          >
            {signalItems.length === 0 ? (
              <EmptyState title="Không có tín hiệu" description="Tuần này đang ổn định." icon={<SparklesIcon className="h-5 w-5" />} />
            ) : (
              <ul className="flex flex-col">
                {signalItems.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-center justify-between gap-3 py-2.5"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {s.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {s.sub}
                      </div>
                    </div>
                    <div
                      className="text-[18px] font-semibold tabular-nums"
                      style={{
                        color:
                          s.tone === 'danger'
                            ? 'var(--accent-danger)'
                            : s.tone === 'warning'
                            ? 'var(--accent-warning)'
                            : s.tone === 'success'
                            ? 'var(--accent-emerald)'
                            : 'var(--accent-primary)',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {s.value}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div
              className="mt-3 pt-3"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <p
                className="text-[10.5px] font-bold uppercase tracking-[0.18em] mb-2"
                style={{ color: 'var(--accent-primary)' }}
              >
                Thao tác nhanh
              </p>
              <div className="flex flex-col gap-1.5">
                {quickActions.map((qa) => (
                  <button
                    key={qa.key}
                    type="button"
                    className="flex items-center gap-2 h-9 px-3 rounded-md text-[13px] font-medium transition-colors text-left"
                    style={{
                      background: 'var(--surface-muted)',
                      color: 'var(--text-primary)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-primary-soft)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-muted)')}
                    onClick={() => onNavigate(qa.key as RouteKey)}
                  >
                    {qa.icon}
                    <span>{qa.label}</span>
                    <ArrowRightIcon className="h-3.5 w-3.5 ml-auto" style={{ color: 'var(--text-muted)' }} />
                  </button>
                ))}
              </div>
            </div>
          </ContentCard>
        </div>
      </Section>

      {/* ─── Footer: source attribution ──────────────────────── */}
      <footer
        className="flex flex-wrap items-center justify-between gap-2 pt-1"
        style={{
          fontSize: 11.5,
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <span>VCPMC Mission Control · data live từ /api/reports/summary</span>
        <span>Người dùng: {userEmail}</span>
      </footer>
    </Page>
  );
}

/**
 * HealthBars — small tokenized segmented progress bar with semantic tones.
 */
function HealthBars({
  total,
  segments,
}: {
  total: number;
  segments: { name: string; value: number; tone: 'success' | 'warning' | 'danger' | 'neutral' }[];
}) {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="health-bar" role="img" aria-label="Phân bổ trạng thái hợp đồng">
        {segments.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <span
              key={s.name}
              className={`health-bar__seg health-bar__seg--${s.tone}`}
              style={{ width: `${pct}%` }}
              title={`${s.name}: ${formatNumber(s.value)}`}
            />
          );
        })}
      </div>
      <ul className="flex flex-col">
        {segments.map((s) => (
          <li
            key={s.name}
            className="flex items-center gap-2 py-1.5"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 health-bar__seg--${s.tone}`}
              aria-hidden
            />
            <span className="text-[13px] flex-1" style={{ color: 'var(--text-primary)' }}>
              {s.name}
            </span>
            <span
              className="text-[13px] font-semibold tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatNumber(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}