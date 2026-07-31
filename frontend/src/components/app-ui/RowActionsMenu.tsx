import React, { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontalIcon } from 'lucide-react';

export type RowAction = {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  divider?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

type MenuPos = { top: number; left: number; right?: undefined } | { top: number; right: number; left?: undefined };

function computePosition(triggerRect: DOMRect, menuWidth: number, align: 'left' | 'right'): MenuPos {
  const MARGIN = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let top = triggerRect.bottom + 6;
  let left: number | undefined;
  let right: number | undefined;

  if (align === 'right') {
    right = viewportW - triggerRect.right;
    // Flip to above if not enough space below
    if (top + 400 > viewportH && triggerRect.top > 300) {
      top = triggerRect.top - 6;
    }
    // Clamp right edge
    if (triggerRect.right < menuWidth + MARGIN) {
      right = MARGIN;
    }
  } else {
    left = triggerRect.left;
    // Flip to above if not enough space below
    if (top + 400 > viewportH && triggerRect.top > 300) {
      top = triggerRect.top - 6;
    }
    // Clamp left edge
    if (triggerRect.left + menuWidth > viewportW - MARGIN) {
      left = viewportW - menuWidth - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;
  }

  return { top, left, right };
}

export function RowActionsMenu({
  actions,
  align = 'right',
}: {
  actions: RowAction[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const setMenuNode = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
  }, []);

  const MENU_W = 208; // w-52 = 13rem = ~208px

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    setPos(computePosition(triggerRef.current.getBoundingClientRect(), MENU_W, align));
  }, [align]);

  // Close on outside click — read refs to avoid stale portal menu closure
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const hitContainer = !!containerRef.current && target ? containerRef.current.contains(target) : false;
      const hitMenu = !!menuRef.current && target ? menuRef.current.contains(target) : false;
      if (!hitContainer && !hitMenu) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on scroll / resize
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((o) => !o);
    // Compute position after state update so triggerRef is current
    requestAnimationFrame(() => {
      updatePos();
    });
  };

  const handleAction = (a: RowAction) => {
    a.onClick?.();
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-label="Thao tác"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-8 w-8 inline-flex items-center justify-center rounded-lg text-zinc-500 transition-colors ${
          open
            ? 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200'
            : 'hover:bg-zinc-100 hover:text-zinc-900'
        }`}
      >
        <MoreHorizontalIcon className="h-4 w-4" />
      </button>

      {open && pos && (
        createPortal(
          <div
            ref={setMenuNode}
            role="menu"
            className="fixed z-50 w-52 rounded-xl bg-white ring-1 ring-zinc-900/5 shadow-2xl shadow-zinc-900/15 py-1.5"
            style={{
              top: pos.top,
              ...(pos.left !== undefined ? { left: pos.left } : { right: pos.right }),
              animation: 'menuIn 140ms ease-out',
              transformOrigin: align === 'right' ? 'top right' : 'top left',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((a, i) => (
              <Fragment key={i}>
                {a.divider && <div className="my-1 border-t border-zinc-100" />}
                {a.disabled ? (
                  <div
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 cursor-not-allowed"
                    title={a.disabledReason || 'Khong co hanh dong'}
                  >
                    <span className="h-4 w-4 shrink-0">{a.icon}</span>
                    <span className="flex-1">{a.label}</span>
                    {a.disabledReason && (
                      <span className="text-[10px] text-zinc-300 italic">Disabled</span>
                    )}
                  </div>
                ) : (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => handleAction(a)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                      a.tone === 'danger'
                        ? 'text-rose-600 hover:bg-rose-50'
                        : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {a.icon && (
                      <span
                        className={`h-4 w-4 shrink-0 ${
                          a.tone === 'danger' ? 'text-rose-500' : 'text-zinc-500'
                        }`}
                      >
                        {a.icon}
                      </span>
                    )}
                    <span className="flex-1">{a.label}</span>
                  </button>
                )}
              </Fragment>
            ))}
          </div>,
          document.body
        )
      )}

      <style>{`
        @keyframes menuIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
