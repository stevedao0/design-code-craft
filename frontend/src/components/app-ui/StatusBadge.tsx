import React from 'react';

/**
 * StatusBadge tones — semantic, never decorative.
 *
 *  - success: deep teal-green (on-track, valid, active)
 *  - warning: warm amber (attention)
 *  - danger:  brick red (error, overdue, expired)
 *  - info:    deep teal-blue (informational)
 *  - neutral: stone (no signal)
 *
 * The previous 'violet' / 'orange' tones have been removed; callers should
 * use 'info' / 'warning' instead. Backward-compatible aliases below.
 */
type Tone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

function resolveTone(tone: Tone | 'violet' | 'orange'): Tone {
  if (tone === 'violet' || tone === 'orange') return tone === 'violet' ? 'info' : 'warning';
  return tone;
}

export function StatusBadge({
  tone = 'neutral',
  children,
  dot,
  compact,
  className,
}: {
  tone?: Tone | 'violet' | 'orange';
  children: React.ReactNode;
  dot?: boolean;
  /** Smaller, tighter badge for compact table rows */
  compact?: boolean;
  className?: string;
}) {
  const resolvedTone = resolveTone(tone);

  const baseClass =
    resolvedTone === 'success'
      ? 'bg-[color:var(--accent-emerald-soft)] text-[color:var(--accent-emerald)] ring-1 ring-[color:var(--accent-emerald)]/25'
      : resolvedTone === 'warning'
        ? 'bg-[color:var(--accent-warning-soft)] text-[color:var(--accent-warning)] ring-1 ring-[color:var(--accent-warning)]/25'
        : resolvedTone === 'danger'
          ? 'bg-[color:var(--accent-danger-soft)] text-[color:var(--accent-danger)] ring-1 ring-[color:var(--accent-danger)]/25'
          : resolvedTone === 'info'
            ? 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary)] ring-1 ring-[color:var(--accent-primary)]/25'
            : 'bg-[color:var(--accent-neutral-soft)] text-[color:var(--text-secondary)] ring-1 ring-subtle';

  const dotClass =
    resolvedTone === 'success'
      ? 'bg-[color:var(--accent-emerald)]'
      : resolvedTone === 'warning'
        ? 'bg-[color:var(--accent-warning)]'
        : resolvedTone === 'danger'
          ? 'bg-[color:var(--accent-danger)]'
          : resolvedTone === 'info'
            ? 'bg-[color:var(--accent-primary)]'
            : 'bg-[color:var(--text-muted)]';

  return (
    <span
      className={`ds-badge flex-nowrap whitespace-nowrap ${compact ? 'ds-badge-compact' : ''} ${baseClass} ${className ?? ''}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />}
      <span>{children}</span>
    </span>
  );
}