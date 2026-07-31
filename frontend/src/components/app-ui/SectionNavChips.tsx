import React from 'react';
import { AlertTriangleIcon, CheckIcon, CircleAlertIcon, CircleIcon } from 'lucide-react';

export type SectionNavStatus = 'idle' | 'current' | 'complete' | 'warning' | 'error';

export interface SectionNavItem {
  id: string;
  number: string;
  label: string;
  status: SectionNavStatus;
}

export interface SectionNavChipsProps {
  items: SectionNavItem[];
  activeId: string | null;
  onItemClick: (id: string) => void;
  className?: string;
}

function StatusDot({ status, index }: { status: SectionNavStatus; index: number }) {
  if (status === 'complete') {
    return <CheckIcon className="h-3 w-3" />;
  }
  if (status === 'warning') {
    return <AlertTriangleIcon className="h-3 w-3" />;
  }
  if (status === 'error') {
    return <CircleAlertIcon className="h-3 w-3" />;
  }
  if (status === 'current') {
    return <span className="text-[10px] font-bold">{index}</span>;
  }
  return <span className="text-[10px] font-semibold">{index}</span>;
}

function statusDotClass(status: SectionNavStatus, isActive: boolean): string {
  if (isActive) {
    return 'border-white/30 bg-white/20 text-white';
  }
  switch (status) {
    case 'complete':
      return 'border-lime-200 bg-lime-50 text-lime-700';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'current':
      return 'border-lime-200 bg-lime-50 text-lime-700';
    default:
      return 'border-stone-200 bg-stone-50 text-stone-500';
  }
}

export function SectionNavChips({
  items,
  activeId,
  onItemClick,
  className = '',
}: SectionNavChipsProps) {
  return (
    <nav
      aria-label="Quy trình tạo hợp đồng"
      className={`flex gap-1.5 overflow-x-auto rounded-2xl border border-zinc-900/[0.06] bg-white p-2 shadow-[0_1px_2px_rgba(15,15,25,0.04)] lg:hidden ${className}`}
    >
      <ol className="flex gap-1.5 w-full">
        {items.map((item, idx) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id} className="min-w-[140px] flex-1">
              <button
                type="button"
                onClick={() => onItemClick(item.id)}
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left transition-colors',
                  isActive
                    ? 'bg-lime-700 text-white shadow-sm'
                    : 'text-stone-600 hover:bg-stone-50',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    statusDotClass(item.status, isActive),
                  ].join(' ')}
                >
                  <StatusDot status={isActive ? 'current' : item.status} index={idx + 1} />
                </span>
                <span className="text-[10px] font-semibold leading-tight line-clamp-2">
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SectionNavRail({
  items,
  activeId,
  onItemClick,
  className = '',
}: SectionNavChipsProps) {
  return (
    <nav
      aria-label="Quy trình tạo hợp đồng"
      className={`hidden lg:block w-[240px] shrink-0 ${className}`}
    >
      <div className="sticky top-6 rounded-2xl border border-zinc-900/[0.06] bg-white p-3 shadow-[0_1px_2px_rgba(15,15,25,0.04)]">
        <p className="mb-3 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          Quy trình
        </p>
        <ol className="space-y-1.5">
          {items.map((item, idx) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onItemClick(item.id)}
                  aria-current={isActive ? 'step' : undefined}
                  className={[
                    'flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2.5 text-left transition-colors',
                    isActive
                      ? 'border-lime-700 bg-lime-700 text-white shadow-sm'
                      : 'border-transparent hover:bg-stone-50 text-stone-700',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                      statusDotClass(item.status, isActive),
                    ].join(' ')}
                  >
                    <StatusDot status={isActive ? 'current' : item.status} index={idx + 1} />
                  </span>
                  <span className="text-[11px] font-semibold leading-snug pt-0.5">
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
