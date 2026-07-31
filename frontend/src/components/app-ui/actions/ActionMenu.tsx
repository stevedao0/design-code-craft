import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, MoreHorizontalIcon } from 'lucide-react';
import type { RowAction } from './ActionMenuTypes';

function toneClassName(tone: RowAction['tone']) {
  if (tone === 'primary') return 'text-[color:var(--accent-primary)] hover:bg-[color:var(--accent-primary-soft)]';
  if (tone === 'warning') return 'text-[color:var(--accent-warning)] hover:bg-[color:color-mix(in_srgb,var(--accent-warning)_12%,transparent)]';
  if (tone === 'danger') return 'text-[color:var(--accent-danger)] hover:bg-[color:color-mix(in_srgb,var(--accent-danger)_10%,transparent)]';
  return 'text-fg-secondary hover:bg-[color:var(--surface-muted)] hover:text-fg-primary';
}

export function ActionMenu({
  actions,
  label = 'Thao tác',
  align = 'right',
  iconOnly = true,
}: {
  actions: RowAction[];
  label?: string;
  align?: 'left' | 'right';
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const visibleActions = useMemo(() => actions.filter((action) => !action.hidden), [actions]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const next = visibleActions.findIndex((action) => !action.disabled);
    setActiveIndex(next >= 0 ? next : 0);
  }, [open, visibleActions]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  if (visibleActions.length === 0) return null;

  return (
    <div ref={rootRef} className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`ds-row-action-trigger h-9 ${iconOnly ? 'w-9' : 'px-3'} gap-1.5 ${open ? 'border-[color:var(--border-default)] bg-[color:var(--surface-muted)] text-fg-primary' : ''}`}
      >
        <MoreHorizontalIcon className="h-4 w-4" />
        {!iconOnly && <span className="text-sm font-medium">{label}</span>}
        {!iconOnly && <ChevronDownIcon className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div
          role="menu"
          className={`ds-card absolute top-10 z-30 min-w-[13rem] py-1.5 shadow-[var(--shadow-dropdown)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {visibleActions.map((action, index) => (
            <Fragment key={action.key}>
              {action.dividerBefore && <div className="my-1 border-t border-[color:var(--border-subtle)]" />}
              <button
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                title={action.disabledReason ?? action.confirm?.description}
                onClick={() => {
                  if (action.disabled) return;
                  action.onClick?.();
                  setOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setOpen(false);
                    return;
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveIndex((current) => (current + 1) % visibleActions.length);
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveIndex((current) => (current - 1 + visibleActions.length) % visibleActions.length);
                  }
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClassName(action.tone)}`}
              >
                {action.icon && <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{action.icon}</span>}
                <span className="flex-1">{action.label}</span>
                {action.confirm && !action.disabled && (
                  <span className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">Confirm</span>
                )}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
