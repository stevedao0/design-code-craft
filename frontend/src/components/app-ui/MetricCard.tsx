import React from 'react';
import { ArrowUpRightIcon, ArrowDownRightIcon } from 'lucide-react';

/**
 * MetricCard tones — semantic, no indigo / purple / plum / coral.
 *
 *  - primary:   deep teal-blue (navigation / primary action / chart)
 *  - success:   deep teal-green (positive trend / on-track)
 *  - warning:   warm amber (attention)
 *  - danger:    brick red (real error / overdue)
 *  - neutral:   stone (no signal)
 */
type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * MetricCard visual hierarchy.
 *
 *  - primary:   hero metrics (annual revenue, contracts needing action)
 *  - standard:  supporting KPI cards
 *  - compact:   dense micro-cards in side strips
 */
type Variant = 'primary' | 'standard' | 'compact';

export type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  delta?: {
    value: string;
    tone: 'up' | 'down' | 'flat';
  };
  icon?: React.ReactNode;
  tone?: Tone;
  variant?: Variant;
  sparkline?: number[];
  onClick?: () => void;
  compare?: {
    value: string;
    label?: string;
  };
  /** Accent ring on the card border, e.g. 'rose' | 'emerald' | 'amber' | 'neutral' */
  ring?: 'rose' | 'emerald' | 'amber' | 'neutral';
  /** Muted style for empty/no-data cards — reduces visual emphasis */
  muted?: boolean;
  /** Extra class names (e.g. responsive col-span hints). */
  className?: string;
};

function Sparkline({ data, tone }: { data: number[]; tone: 'up' | 'down' | 'flat' }) {
  if (!data || data.length < 2) return null;
  const w = 96;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`);
  const d = `M${pts.join(' L')}`;
  const area = `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
  const stroke = tone === 'down' ? 'var(--accent-danger)' : tone === 'flat' ? 'var(--accent-neutral)' : 'var(--accent-primary)';
  const fill = tone === 'down' ? 'var(--accent-danger-soft)' : tone === 'flat' ? 'var(--accent-neutral-soft)' : 'var(--accent-primary-soft)';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-90 group-hover:opacity-100 transition-opacity">
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(data.length - 1) * step} cy={h - ((data[data.length - 1] - min) / range) * h} r="2.2" fill={stroke} />
    </svg>
  );
}

function variantClass(variant: Variant): string {
  if (variant === 'primary') return 'metric-card--primary';
  if (variant === 'compact') return 'metric-card--compact';
  return 'metric-card--standard';
}

function toneIconClass(tone: Tone): string {
  if (tone === 'success') return 'metric-card__icon--success';
  if (tone === 'warning') return 'metric-card__icon--warning';
  if (tone === 'danger') return 'metric-card__icon--danger';
  if (tone === 'neutral') return 'metric-card__icon--neutral';
  return ''; // primary
}

function toneSubClass(tone?: 'success' | 'danger' | 'neutral'): string {
  if (tone === 'success') return 'metric-card__sub--up';
  if (tone === 'danger') return 'metric-card__sub--down';
  return '';
}

export function MetricCard({
  label,
  value,
  hint,
  delta,
  icon,
  tone = 'primary',
  variant = 'standard',
  sparkline,
  onClick,
  compare,
  ring,
  muted,
  className,
}: MetricCardProps) {
  const interactive = !!onClick;
  const Tag: any = interactive ? 'button' : 'div';
  const ringClass = ring
    ? ring === 'rose' ? 'ring-2 ring-[color:var(--accent-danger)]/40'
    : ring === 'emerald' ? 'ring-2 ring-[color:var(--accent-emerald)]/40'
    : ring === 'amber' ? 'ring-2 ring-[color:var(--accent-warning)]/40'
    : 'ring-2 ring-[color:var(--accent-neutral)]/40'
    : '';
  const mutedClass = muted ? 'opacity-60' : '';
  const isPlaceholder = value === '—';
  return (
    <Tag
      onClick={onClick}
      type={interactive ? 'button' : undefined}
      className={`content-card ${variantClass(variant)} group relative overflow-hidden min-w-0 ${ringClass} ${mutedClass} ${interactive ? 'cursor-pointer text-left w-full' : ''} ${className ?? ''}`}>
      <div className="relative flex flex-col gap-2 h-full">
        <div className="flex items-start justify-between gap-2">
          <span className="metric-card__label">{label}</span>
          {icon && (
            <span className={`metric-card__icon ${toneIconClass(tone)}`}>
              {icon}
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2 flex-wrap min-w-0">
            <span
              className={`metric-card__value ${isPlaceholder ? 'text-fg-muted' : ''}`}
              title={isPlaceholder ? 'Chưa có dữ liệu kỳ này' : undefined}>
              {value}
            </span>
            {delta && (
              <span
                className={`ds-delta ${
                  delta.tone === 'up'
                    ? 'ds-delta-up'
                    : delta.tone === 'down'
                    ? 'ds-delta-down'
                    : 'ds-delta-flat'
                }`}>
                {delta.tone === 'up' ? (
                  <ArrowUpRightIcon className="h-3 w-3" strokeWidth={2.5} />
                ) : delta.tone === 'down' ? (
                  <ArrowDownRightIcon className="h-3 w-3" strokeWidth={2.5} />
                ) : null}
                {delta.value}
              </span>
            )}
          </div>
          {sparkline && !isPlaceholder && (
            <Sparkline data={sparkline} tone={delta?.tone || 'flat'} />
          )}
        </div>
        {compare && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="ds-compare-dot h-1.5 w-3 rounded-sm" />
            <span className="font-medium">{compare.label ?? 'Kỳ trước'}:</span>
            <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{compare.value}</span>
          </div>
        )}
        {hint && <p className={`metric-card__sub ${toneSubClass(delta?.tone === 'up' ? 'success' : delta?.tone === 'down' ? 'danger' : undefined)}`}>{hint}</p>}
      </div>
    </Tag>
  );
}

export function MetricStrip({ items }: { items: MetricCardProps[]; }) {
  // Two-tier responsive layout: heroes lead with more space, supporting metrics follow.
  // Mobile: 1 col for the first primary, then 2 cols for compact supporting metrics.
  // Desktop: hero spans 2x supporting columns.
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 min-w-0">
      {items.map((m, i) => (
        <MetricCard key={i} {...m} />
      ))}
    </div>
  );
}