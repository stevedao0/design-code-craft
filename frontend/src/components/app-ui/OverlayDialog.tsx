import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';

export type OverlayDialogSize =
  | 'confirmation'
  | 'sm'
  | 'md'
  | 'form'
  | 'lg'
  | 'xl'
  | 'workspace'
  | '2xl'
  | 'sheet';

export interface OverlayDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: OverlayDialogSize;
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** When true, render edge-to-edge (no padding). */
  bleed?: boolean;
  /** Extra classes for the dialog panel. */
  className?: string;
  /** Prevent body scroll lock (use for non-blocking dialogs like info toasts). */
  noScrollLock?: boolean;
}

const sizeClasses: Record<OverlayDialogSize, string> = {
  confirmation: 'max-w-[480px]',
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  form: 'max-w-[720px]',
  lg: 'max-w-[900px]',
  xl: 'max-w-[1040px]',
  workspace: 'max-w-[1040px]',
  '2xl': 'max-w-[1280px]',
  sheet: 'max-w-[720px] lg:max-w-[860px]',
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('hidden')
  );
}

export function OverlayDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'form',
  closeOnBackdrop = true,
  dismissible = true,
  initialFocusRef,
  bleed = false,
  className = '',
  noScrollLock = false,
}: OverlayDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useEffect(() => {
    if (!open || !mounted) return;

    // Save current focus
    triggerRef.current = document.activeElement as HTMLElement | null;

    // Body scroll lock
    if (!noScrollLock) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      const prevOverflow = document.body.style.overflow;
      const prevPaddingRight = document.body.style.paddingRight;

      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = prevOverflow;
        document.body.style.paddingRight = prevPaddingRight;
      };
    }
  }, [open, mounted, noScrollLock]);

  useEffect(() => {
    if (!open || !mounted) return;

    // Focus management
    const focusInitial = () => {
      const target = initialFocusRef?.current;
      const fallback = dialogRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], [autofocus], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (target ?? fallback ?? dialogRef.current)?.focus();
    };

    const frame = requestAnimationFrame(focusInitial);
    return () => cancelAnimationFrame(frame);
  }, [open, mounted, initialFocusRef]);

  useEffect(() => {
    if (!open || !mounted) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusables = getFocusableElements(dialogRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }

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

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, mounted, dismissible, onClose]);

  // Restore focus on close
  useEffect(() => {
    if (!open && triggerRef.current) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [open]);

  if (!open || !mounted || typeof document === 'undefined') return null;

  const requestClose = () => {
    if (dismissible) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      role="presentation"
    >
      {/* Backdrop */}
      <button
        aria-label="Đóng hộp thoại"
        className="absolute inset-0 cursor-default bg-zinc-950/40 backdrop-blur-[2px] motion-safe:animate-[fadeInOverlay_160ms_ease-out]"
        onClick={() => {
          if (closeOnBackdrop) requestClose();
        }}
        tabIndex={-1}
        type="button"
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          'relative flex w-full flex-col overflow-hidden rounded-2xl',
          'bg-white shadow-[0_24px_60px_-12px_rgba(15,15,25,0.28),0_0_0_1px_rgba(200,153,104,0.15)]',
          'ring-1 ring-[#e3d2b3]/50',
          'motion-safe:animate-[overlayDialogIn_220ms_cubic-bezier(0.32,0.72,0,1)]',
          sizeClasses[size],
          'max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-32px)]',
          className,
        ].join(' ')}
      >
        {/* Top gradient line */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent z-10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c89968]/70 to-transparent z-10"
        />

        {/* Header */}
        <header className="relative z-10 shrink-0 flex items-start gap-3 border-b border-[#e3d2b3]/40 px-5 py-4 bg-white/80 backdrop-blur-sm">
          <div className="min-w-0 flex-1">
            <h2
              tabIndex={-1}
              className="text-sm font-semibold text-[#2d2419] tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-[#c89968]/60 rounded-sm"
            >
              {title}
            </h2>
            {description && (
              <p className="text-xs text-[#6b756f] mt-0.5">{description}</p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={requestClose}
              aria-label="Đóng"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-[#6b756f] hover:bg-[#fcf2e3] hover:text-[#5a4533] transition-colors shrink-0"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </header>

        {/* Body */}
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bleed ? '' : 'px-5 py-4'}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <footer className="sticky bottom-0 shrink-0 flex items-center justify-end gap-2 border-t border-[#e3d2b3]/40 bg-white/95 backdrop-blur-sm px-5 py-3 z-10">
            {footer}
          </footer>
        )}
      </div>

      <style>{`
        @keyframes fadeInOverlay {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes overlayDialogIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body
  );
}
