/**
 * Org-level multi-ring KPI overview.
 *
 * Aggregates per-field KPI (target / actual / contract count) across ALL
 * employees for the selected year, then renders one concentric ring per
 * business field. Presentation only — every number comes from the backend
 * /kpi/field-kpi snapshots.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircleIcon, RefreshCwIcon, TargetIcon, TrendingUpIcon, GaugeIcon, FileSignatureIcon } from 'lucide-react';
import { Button } from '@/components/app-ui/Button';
import { Skeleton } from './Skeleton';
import { fmtVND, fmtNum } from './kpiClient';
import { getOrgFieldKpi } from '@/lib/kpiFieldClient';
import type { OrgFieldRow as OrgFieldRowType } from '@/lib/kpiFieldClient';

const RING_COLORS = [
  '#4A7202', '#76B400', '#2da88f', '#4a7fc1',
  '#8b6db3', '#d99425', '#c95867', '#6d365b',
];

export interface OrgFieldRow {
  field_code: string;
  field_label: string;
  target: number;
  actual: number;
  contract_count: number;
  user_count: number;
  progress_percent: number;
  has_target: boolean;
}

function compact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  return n.toLocaleString('vi-VN');
}

// ─── Concentric rings ───────────────────────────────────────────────────
function RingStack({
  rows, size, activeCode, onHover, onSelect, played,
}: {
  rows: OrgFieldRow[];
  size: number;
  activeCode: string | null;
  onHover: (code: string | null) => void;
  onSelect: (code: string) => void;
  played: boolean;
}) {
  const n = rows.length;
  const stroke = n > 6 ? 11 : n > 4 ? 14 : 18;
  const gap = 5;
  const base = size / 2 - stroke / 2 - 2;
  const active = activeCode ? rows.find(r => r.field_code === activeCode) : null;

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalPct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

  return (
    <div style={{ position: 'relative', width: size, height: size }} className="mx-auto shrink-0">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          {rows.map((row, i) => {
            const color = RING_COLORS[i % RING_COLORS.length];
            return (
              <linearGradient key={row.field_code} id={`ring-grad-${i}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.65} />
                <stop offset="100%" stopColor={color} stopOpacity={1} />
              </linearGradient>
            );
          })}
        </defs>
        {rows.map((row, i) => {
          const r = base - i * (stroke + gap);
          if (r <= stroke) return null;
          const c = 2 * Math.PI * r;
          const pct = row.has_target ? Math.min(row.progress_percent, 100) : 0;
          const color = RING_COLORS[i % RING_COLORS.length];
          const isActive = activeCode === row.field_code;
          const dim = activeCode !== null && !isActive;
          return (
            <g key={row.field_code}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="var(--border-subtle, #ece7de)" strokeWidth={stroke} />
              {pct > 0 && (
                <circle
                  cx={size / 2} cy={size / 2} r={r} fill="none"
                  stroke={`url(#ring-grad-${i})`}
                  strokeWidth={isActive ? stroke + 2 : stroke}
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={played ? c - (pct / 100) * c : c}
                  opacity={dim ? 0.28 : 1}
                  style={{
                    transition: `stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 90}ms, opacity .18s ease, stroke-width .18s ease`,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => onHover(row.field_code)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onSelect(row.field_code)}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        {active ? (
          <>
            <div className="max-w-full truncate text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-secondary, #68635c)' }}>{active.field_label}</div>
            <div className="mt-1 text-[26px] font-extrabold leading-none tabular-nums"
              style={{ color: active.progress_percent >= 100 ? 'var(--accent-primary, #4A7202)' : 'var(--text-primary, #1f1d1a)' }}>
              {active.has_target ? `${active.progress_percent.toFixed(1)}%` : '—'}
            </div>
            <div className="mt-1.5 text-[11px] tabular-nums" style={{ color: 'var(--text-muted, #8a847c)' }}>
              Đạt {compact(active.actual)} / MT {compact(active.target)}
            </div>
            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted, #8a847c)' }}>
              {fmtNum(active.contract_count)} HĐ · {fmtNum(active.user_count)} NV
            </div>
          </>
        ) : (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-secondary, #68635c)' }}>Hoàn thành chung</div>
            <div className="mt-1 text-[30px] font-extrabold leading-none tabular-nums"
              style={{ color: 'var(--accent-primary, #4A7202)' }}>
              {totalTarget > 0 ? `${totalPct.toFixed(1)}%` : '—'}
            </div>
            <div className="mt-1.5 text-[11px] tabular-nums" style={{ color: 'var(--text-muted, #8a847c)' }}>
              {rows.length} lĩnh vực KPI
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main card ──────────────────────────────────────────────────────────
export function OrgFieldRings({ year }: { year: number }) {
  const [rows, setRows] = useState<OrgFieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [played, setPlayed] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOrgFieldKpi(year);
      const list = (res.fields ?? []).map((f: OrgFieldRowType) => ({
        field_code: f.field_code,
        field_label: f.field_label,
        target: f.target,
        actual: f.actual,
        contract_count: f.contract_count,
        user_count: f.user_count,
        has_target: f.has_target,
        progress_percent: f.has_target ? f.progress_percent : 0,
      }));
      setRows(list);
    } catch (e: any) {
      setError(e?.message || 'Khong tai duoc KPI theo linh vuc');
    } finally {
      setLoading(false);
    }
  }, [year, tick]);

  useEffect(() => { load(); }, [load]);

  // Draw the rings once the block scrolls into view (respects reduced motion).
  useEffect(() => {
    if (loading || rows.length === 0) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setPlayed(true); return; }
    setPlayed(false);
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      const t = window.setTimeout(() => setPlayed(true), 60);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setPlayed(true);
        io.disconnect();
      }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [loading, rows]);

  const totals = useMemo(() => {
    const target = rows.reduce((s, r) => s + r.target, 0);
    const actual = rows.reduce((s, r) => s + r.actual, 0);
    const contracts = rows.reduce((s, r) => s + r.contract_count, 0);
    return {
      target, actual, contracts,
      pct: target > 0 ? (actual / target) * 100 : null,
      gap: target - actual,
      done: rows.filter(r => r.has_target && r.progress_percent >= 100).length,
    };
  }, [rows]);

  const active = hovered ?? selected;

  return (
    <section ref={sectionRef} className="rounded-2xl border overflow-hidden"
      style={{ borderColor: 'var(--border-default, #e6e0d7)', background: 'var(--surface, #fff)' }}>
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 sm:px-5"
        style={{
          borderColor: 'var(--border-subtle, #ece7de)',
          background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent-primary, #4A7202) 9%, white), transparent)',
        }}>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold" style={{ color: 'var(--text-primary, #1f1d1a)' }}>
            Ring KPI theo lĩnh vực — {year}
          </h3>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-muted, #8a847c)' }}>
            Mỗi vòng là một lĩnh vực, cộng dồn toàn đơn vị. Di chuột hoặc chạm vào vòng để xem chi tiết.
          </p>
        </div>
        <button type="button" onClick={() => setTick(t => t + 1)} title="Làm mới"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors"
          style={{ borderColor: 'var(--border-soft, #e6e0d7)', color: 'var(--text-secondary, #68635c)', background: 'var(--surface, #fff)' }}>
          <RefreshCwIcon className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)] sm:p-5">
          <Skeleton className="mx-auto h-[260px] w-[260px] rounded-full" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 sm:p-5">
          <AlertCircleIcon className="h-5 w-5 shrink-0" style={{ color: 'var(--accent-danger, #9F1F1F)' }} />
          <span className="flex-1 text-sm">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setTick(t => t + 1)}>Thử lại</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted, #8a847c)' }}>
          Chưa có KPI lĩnh vực nào được giao cho năm {year}.
        </div>
      ) : (
        <>
          {/* Hero KPI band */}
          <div className="grid grid-cols-2 gap-px border-b lg:grid-cols-4"
            style={{ borderColor: 'var(--border-subtle, #ece7de)', background: 'var(--border-subtle, #ece7de)' }}>
            {[
              { label: 'Tổng mục tiêu', value: fmtVND(totals.target), icon: TargetIcon },
              { label: 'Tổng thực đạt', value: fmtVND(totals.actual), accent: true, icon: TrendingUpIcon },
              {
                label: totals.gap > 0 ? 'Còn thiếu' : 'Vượt mục tiêu',
                value: fmtVND(Math.abs(totals.gap)),
                warn: totals.gap > 0,
                icon: GaugeIcon,
              },
              {
                label: 'Hợp đồng ghi nhận',
                value: `${fmtNum(totals.contracts)} HĐ`,
                hint: `${totals.done}/${rows.length} lĩnh vực đạt mục tiêu`,
                icon: FileSignatureIcon,
              },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-start gap-3 px-4 py-3.5" style={{ background: 'var(--surface, #fff)' }}>
                  <span
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                    style={{
                      background: s.warn
                        ? 'color-mix(in srgb, var(--accent-warning, #B45309) 12%, white)'
                        : 'color-mix(in srgb, var(--accent-primary, #4A7202) 10%, white)',
                      color: s.warn ? 'var(--accent-warning, #B45309)' : 'var(--accent-primary, #4A7202)',
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted, #8a847c)' }}>{s.label}</div>
                    <div className="mt-0.5 truncate text-[16px] font-bold tabular-nums"
                      style={{
                        color: s.accent ? 'var(--accent-primary, #4A7202)'
                          : s.warn ? 'var(--accent-warning, #B45309)'
                          : 'var(--text-primary, #1f1d1a)',
                      }}>
                      {s.value}
                    </div>
                    {s.hint && (
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-muted, #8a847c)' }}>{s.hint}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ring + legend */}
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center">
            <RingStack
              rows={rows}
              size={280}
              activeCode={active}
              onHover={setHovered}
              onSelect={(c) => setSelected(prev => (prev === c ? null : c))}
              played={played}
            />

            <ul className="space-y-1.5">
              {rows.map((row, i) => {
                const color = RING_COLORS[i % RING_COLORS.length];
                const isActive = active === row.field_code;
                const pct = row.has_target ? Math.min(row.progress_percent, 100) : 0;
                return (
                  <li key={row.field_code}>
                    <button
                      type="button"
                      onMouseEnter={() => setHovered(row.field_code)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(prev => (prev === row.field_code ? null : row.field_code))}
                      className="w-full rounded-lg border px-3 py-2 text-left transition-all duration-200 hover:-translate-y-px"
                      style={{
                        borderColor: isActive ? color : 'var(--border-subtle, #ece7de)',
                        background: isActive ? `color-mix(in srgb, ${color} 8%, white)` : 'transparent',
                        boxShadow: isActive ? `0 6px 16px -12px ${color}` : 'none',
                      }}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                          <span className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary, #1f1d1a)' }}>
                            {row.field_label}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: 'var(--text-muted, #8a847c)' }}>
                            {fmtNum(row.contract_count)} HĐ
                          </span>
                        </div>
                        <span className="shrink-0 text-[13px] font-bold tabular-nums"
                          style={{ color: row.has_target && row.progress_percent >= 100 ? 'var(--accent-primary, #4A7202)' : 'var(--text-secondary, #68635c)' }}>
                          {row.has_target ? `${row.progress_percent.toFixed(1)}%` : 'Chưa giao'}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-subtle, #ece7de)' }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: played ? `${pct}%` : '0%',
                            background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, white), ${color})`,
                            transition: `width 900ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 90}ms`,
                          }} />
                      </div>
                      <div className="mt-1 truncate text-[11px] tabular-nums" style={{ color: 'var(--text-muted, #8a847c)' }}>
                        Đạt {fmtVND(row.actual)} / Mục tiêu {row.has_target ? fmtVND(row.target) : '—'}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
