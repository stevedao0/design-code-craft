import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  DownloadIcon,
  FileSpreadsheetIcon,
  ChevronDownIcon,
} from 'lucide-react';

export type ExportItem = {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
};

type MenuPos = { top: number; left: number; right?: undefined } | { top: number; right: number; left?: undefined };

function computePosition(triggerRect: DOMRect, menuWidth: number): MenuPos {
  const MARGIN = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  const right = viewportW - triggerRect.right;
  let top = triggerRect.bottom + 6;

  if (top + 400 > viewportH && triggerRect.top > 300) {
    top = triggerRect.top - 6;
  }
  if (triggerRect.right < menuWidth + MARGIN) {
    return { top, left: MARGIN };
  }

  return { top, right };
}

export function ExportMenu({
  label = 'Xuất báo cáo',
  items,
}: {
  label?: string;
  items: ExportItem[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const setMenuNode = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
  }, []);

  const MENU_W = 288; // w-72 = 18rem ≈ 288px

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    setPos(computePosition(triggerRef.current.getBoundingClientRect(), MENU_W));
  }, []);

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
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-9 px-3.5 inline-flex items-center gap-2 rounded-lg text-sm font-medium transition-all ring-1 shadow-sm shadow-zinc-900/[0.03] ${
          open
            ? 'bg-zinc-900 text-white ring-zinc-900'
            : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300'
        }`}
      >
        <DownloadIcon className="h-4 w-4" />
        {label}
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && pos && (
        createPortal(
          <div
            ref={setMenuNode}
            role="menu"
            className="fixed z-50 w-72 rounded-xl bg-white ring-1 ring-zinc-900/5 shadow-2xl shadow-zinc-900/15 py-1.5"
            style={{
              top: pos.top,
              ...(pos.left !== undefined ? { left: pos.left } : { right: pos.right }),
              animation: 'menuIn 140ms ease-out',
              transformOrigin: 'top right',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((it, i) => (
              <button
                key={i}
                role="menuitem"
                type="button"
                onClick={() => {
                  it.onClick?.();
                  setOpen(false);
                }}
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors"
              >
                <span className="mt-0.5 h-7 w-7 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100 inline-flex items-center justify-center shrink-0">
                  {it.icon ?? <FileSpreadsheetIcon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-900">
                    {it.label}
                  </span>
                  {it.description && (
                    <span className="block text-[11px] text-zinc-500 mt-0.5 leading-snug">
                      {it.description}
                    </span>
                  )}
                </span>
              </button>
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
