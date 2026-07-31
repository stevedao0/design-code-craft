import React, { useEffect, useRef } from 'react';
import { XIcon } from 'lucide-react';
type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  maxWidth,
  bleed = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** Backwards-compat alias for `size`. */
  maxWidth?: ModalSize;
  /** When true, children render edge-to-edge (no padding). Useful for hero covers. */
  bleed?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the title when the dialog opens
    const timer = setTimeout(() => {
      titleRef.current?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusables = getFocusableElements(dialogRef.current);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [open, onClose]);
  if (!open) return null;
  const eff = maxWidth ?? size;
  const widthClass =
    eff === 'sm' ? 'max-w-sm'
      : eff === 'lg' ? 'max-w-2xl'
      : eff === 'xl' ? 'max-w-3xl'
      : eff === '2xl' ? 'max-w-4xl'
      : 'max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        style={{ animation: 'fadeIn 180ms ease-out' }}
        onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${widthClass} max-h-[92vh] overflow-y-auto bg-white rounded-2xl ring-1 ring-[#e3d2b3]/50 shadow-[0_24px_60px_-12px_rgba(15,15,25,0.28),0_0_0_1px_rgba(200,153,104,0.15)] overflow-hidden`}
        style={{ animation: 'modalIn 220ms cubic-bezier(0.32,0.72,0,1)' }}>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent z-20" />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c89968]/70 to-transparent z-20" />

        <header className="relative z-10 px-5 py-4 border-b border-[#e3d2b3]/40 flex items-start gap-3 bg-white/80 backdrop-blur-sm">
          <div className="min-w-0 flex-1">
            <h2
              ref={titleRef}
              tabIndex={-1}
              className="text-sm font-semibold text-[#2d2419] tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-[#c89968]/60 rounded-sm"
            >
              {title}
            </h2>
            {description &&
            <p className="text-xs text-[#6b756f] mt-0.5">{description}</p>
            }
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-[#6b756f] hover:bg-[#fcf2e3] hover:text-[#5a4533] transition-colors">

            <XIcon className="h-4 w-4" />
          </button>
        </header>
        <div className={bleed ? '' : 'px-5 py-4'}>{children}</div>
        {footer &&
        <footer className="sticky bottom-0 px-5 py-3 border-t border-[#e3d2b3]/40 bg-white/95 backdrop-blur-sm flex items-center justify-end gap-2 z-10">
            {footer}
          </footer>
        }
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes modalIn {
            from { opacity: 0; transform: translateY(8px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      </div>
    </div>);

}