import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontalIcon } from 'lucide-react';

export type OverflowAction = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  description?: string;
};

type MenuPos = { top: number; left: number; right?: undefined } | { top: number; right: number; left?: undefined };

function computePosition(triggerRect: DOMRect, menuWidth: number, align: 'left' | 'right'): MenuPos {
  const MARGIN = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let top = triggerRect.bottom + 6;

  if (align === 'right') {
    let right = viewportW - triggerRect.right;
    if (top + 400 > viewportH && triggerRect.top > 300) {
      top = triggerRect.top - 6;
    }
    if (triggerRect.right < menuWidth + MARGIN) {
      right = MARGIN;
    }
    return { top, right };
  } else {
    let left = triggerRect.left;
    if (top + 400 > viewportH && triggerRect.top > 300) {
      top = triggerRect.top - 6;
    }
    if (triggerRect.left + menuWidth > viewportW - MARGIN) {
      left = viewportW - menuWidth - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;
    return { top, left };
  }
}

export function ActionOverflowMenu({
  actions,
  label = 'Thao tác khác',
  align = 'right',
}: {
  actions: OverflowAction[];
  label?: string;
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

  const MENU_W = 256; // w-64 = 16rem ≈ 256px

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    setPos(computePosition(triggerRef.current.getBoundingClientRect(), MENU_W, align));
  }, [align]);

  // Close on outside click — read refs to avoid stale portal menu closure
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const hitContainer = !!containerRef.current && target ? containerRef.current.contains(target) : false;
      const hitMenu = !!menuRef.current && target ? menuRef.current.contains(target) : false;
      if (!hitContainer && !hitMenu) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
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
    requestAnimationFrame(() => {
      updatePos();
    });
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
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-9 w-9 inline-flex items-center justify-center rounded-lg ring-1 transition-all ${
          open
            ? 'bg-zinc-900 text-white ring-zinc-900'
            : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300'
        }`}
      >
        <MoreHorizontalIcon className="h-4 w-4" />
      </button>

      {open && pos && (
        createPortal(
          <div
            ref={setMenuNode}
            role="menu"
            className="fixed z-50 w-64 rounded-xl bg-white ring-1 ring-zinc-900/5 shadow-2xl shadow-zinc-900/15 py-1.5"
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
              <button
                key={i}
                role="menuitem"
                type="button"
                disabled={a.disabled}
                onClick={() => {
                  a.onClick();
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  a.active
                    ? 'bg-amber-50 text-amber-900'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {a.icon && (
                  <span
                    className={`mt-0.5 h-7 w-7 rounded-lg inline-flex items-center justify-center shrink-0 ring-1 ${
                      a.active
                        ? 'bg-amber-100 text-amber-700 ring-amber-200'
                        : 'bg-zinc-100 text-zinc-600 ring-zinc-200'
                    }`}
                  >
                    {a.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-tight">
                    {a.label}
                    {a.active && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-amber-700">
                        Đang bật
                      </span>
                    )}
                  </span>
                  {a.description && (
                    <span className="block text-[11px] text-zinc-500 mt-0.5 leading-snug">
                      {a.description}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )
      )}
    </div>
  );
}
