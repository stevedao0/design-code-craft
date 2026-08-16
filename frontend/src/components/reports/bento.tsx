/**
 * Shared bento primitives for the Reports workspace.
 *
 * Every role (admin / manager / staff) renders through these components so the
 * report shell, spacing, typography, colors and responsive behaviour stay
 * identical. Only the *data scope* differs per role — never the layout.
 *
 * Classes come from `frontend/src/theme/reports.css` (.rp-bento / .rp-tile /
 * .rp-list / .rp-meter). No hardcoded colors: tokens only.
 */
import React from 'react';
import { AlertCircleIcon, InboxIcon, ShieldAlertIcon } from 'lucide-react';
import { Button } from '@/components/app-ui/Button';
import { Skeleton } from '@/components/reports/Skeleton';

export type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
export type Tone = 'default' | 'hero' | 'brass';
export type NumTone = 'default' | 'success' | 'warning' | 'danger';

export function BentoGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rp-bento ${className}`.trim()}>{children}</div>;
}

export function ReportTile({
  span = 12, tone = 'default', flush, label, labelRight, children, className = '',
}: {
  span?: Span;
  tone?: Tone;
  flush?: boolean;
  label?: React.ReactNode;
  labelRight?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const toneClass = tone === 'hero' ? ' rp-tile--hero' : tone === 'brass' ? ' rp-tile--brass' : '';
  return (
    <div className={`rp-tile rp-c${span}${toneClass}${flush ? ' rp-tile--flush' : ''} ${className}`.trim()}>
      {(label || labelRight) && (
        <div className="rp-tile__label">
          <span>{label}</span>
          {labelRight != null && <span>{labelRight}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function TileValue({
  children, tone = 'default', sub,
}: { children: React.ReactNode; tone?: 'primary' | 'brass' | 'default'; sub?: React.ReactNode }) {
  const cls =
    tone === 'brass' ? 'rp-tile__value rp-tile__value--brass'
      : tone === 'default' ? 'rp-tile__value rp-tile__value--plain'
        : 'rp-tile__value';
  return (
    <>
      <div className={cls}>{children}</div>
      {sub ? <div className="rp-tile__sub">{sub}</div> : null}
    </>
  );
}

export function StatList({ rows }: { rows: { label: React.ReactNode; value: React.ReactNode; tone?: NumTone }[] }) {
  return (
    <div className="rp-list">
      {rows.map((r, i) => (
        <div className="rp-list__row" key={i}>
          <span>{r.label}</span>
          <span className={r.tone && r.tone !== 'default' ? `rp-num--${r.tone}` : undefined}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Meter({ percent, brass }: { percent: number; brass?: boolean }) {
  const w = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <div className="rp-meter">
      <div className={`rp-meter__fill${brass ? ' rp-meter__fill--brass' : ''}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Skeleton that keeps the bento rhythm so the layout does not jump. */
export function ReportLoading({ tiles = [4, 5, 3, 12, 8, 4] as Span[] }: { tiles?: Span[] }) {
  return (
    <BentoGrid>
      {tiles.map((span, i) => (
        <div className={`rp-tile rp-c${span}`} key={i}>
          <Skeleton className="h-3 w-28 rounded" />
          <Skeleton className="h-7 w-40 rounded" />
          <Skeleton className="h-2.5 w-full rounded" />
        </div>
      ))}
    </BentoGrid>
  );
}

/** Neutral / warning empty state — never green (green means "good"). */
export function ReportEmpty({
  title, hint, span = 12,
}: { title: React.ReactNode; hint?: React.ReactNode; span?: Span }) {
  return (
    <div
      className={`rp-tile rp-c${span} items-center text-center`}
      style={{
        borderStyle: 'dashed',
        borderColor: 'color-mix(in srgb, var(--accent-warning) 35%, var(--border-default))',
        background: 'color-mix(in srgb, var(--accent-warning) 4%, var(--surface))',
      }}
    >
      <InboxIcon className="h-5 w-5" style={{ color: 'var(--accent-warning)' }} />
      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</div>
      {hint ? <div className="rp-tile__sub">{hint}</div> : null}
    </div>
  );
}

export function ReportError({
  message, onRetry, span = 12,
}: { message: React.ReactNode; onRetry?: () => void; span?: Span }) {
  return (
    <div
      className={`rp-tile rp-c${span}`}
      style={{
        borderColor: 'var(--accent-danger)',
        background: 'var(--accent-danger-soft)',
        flexDirection: 'row',
        alignItems: 'flex-start',
      }}
    >
      <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--accent-danger)' }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Lỗi khi tải dữ liệu</div>
        <div className="rp-tile__sub">{message}</div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="shrink-0 rounded-lg">Thử lại</Button>
      )}
    </div>
  );
}

export function ReportDenied({ message }: { message?: React.ReactNode }) {
  return (
    <BentoGrid>
      <div
        className="rp-tile rp-c12 items-center text-center"
        style={{
          borderColor: 'color-mix(in srgb, var(--accent-warning) 40%, var(--border-default))',
          background: 'color-mix(in srgb, var(--accent-warning) 5%, var(--surface))',
        }}
      >
        <ShieldAlertIcon className="h-5 w-5" style={{ color: 'var(--accent-warning)' }} />
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Bạn không có quyền xem báo cáo
        </div>
        <div className="rp-tile__sub">
          {message ?? 'Cần quyền “reports.view”. Liên hệ quản trị hệ thống để được cấp quyền.'}
        </div>
      </div>
    </BentoGrid>
  );
}

/** Wraps any non-bento block (table, chart, section) inside a bento tile. */
export function TileSection({
  label, labelRight, span = 12, flush, children,
}: {
  label?: React.ReactNode; labelRight?: React.ReactNode; span?: Span; flush?: boolean; children: React.ReactNode;
}) {
  return (
    <ReportTile span={span} label={label} labelRight={labelRight} flush={flush}>
      {children}
    </ReportTile>
  );
}
