import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface OverlayPopoverProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
  width?: number;
}

interface Position {
  top: number;
  left: number;
  maxHeight: number;
}

function computePosition(
  anchor: HTMLElement,
  popoverEl: HTMLElement | null,
  align: 'start' | 'end',
  width?: number
): Position | null {
  const rect = anchor.getBoundingClientRect();
  const padding = 12;
  const estWidth = width ?? popoverEl?.offsetWidth ?? 288;

  let left: number;
  if (align === 'end') {
    left = Math.max(
      padding,
      Math.min(rect.right - estWidth, window.innerWidth - estWidth - padding)
    );
  } else {
    left = Math.max(padding, Math.min(rect.left, window.innerWidth - estWidth - padding));
  }

  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  let top: number;
  let maxHeight: number;

  if (spaceBelow >= 200 || spaceBelow > spaceAbove) {
    // Open downward
    top = rect.bottom + 8;
    maxHeight = Math.max(160, window.innerHeight - rect.bottom - 24);
  } else {
    // Open upward
    top = rect.top - 8;
    maxHeight = Math.max(160, rect.top - 24);
  }

  return { top, left, maxHeight };
}

export function OverlayPopover({
  open,
  anchorRef,
  onClose,
  children,
  align = 'end',
  className = '',
  width,
}: OverlayPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const pos = computePosition(anchor, popoverRef.current, align, width);
    setPosition(pos);
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        requestAnimationFrame(() => anchorRef.current?.focus());
      }
    };

    const onResize = () => updatePosition();
    const onScroll = () => updatePosition();

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !position || !mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={[
        'fixed z-[110] overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-[0_12px_28px_rgba(28,25,23,0.16)]',
        'motion-safe:animate-[overlayPopoverIn_140ms_cubic-bezier(0.22,1,0.36,1)]',
        className,
      ].join(' ')}
      ref={popoverRef}
      style={{
        left: position.left,
        top: position.top,
        maxHeight: position.maxHeight,
        width: width ?? undefined,
      }}
      role="presentation"
    >
      {children}
      <style>{`
        @keyframes overlayPopoverIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body
  );
}
