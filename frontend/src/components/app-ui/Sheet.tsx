import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: 'left' | 'right' | 'top' | 'bottom';
}

export function Sheet({ open, onOpenChange, children, side = 'right' }: SheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open || !mounted) return null;

  const sideClasses = {
    right: 'right-0 top-0 h-full',
    left: 'left-0 top-0 h-full',
    top: 'top-0 left-0 w-full',
    bottom: 'bottom-0 left-0 w-full',
  };

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={`absolute ${sideClasses[side]} bg-white shadow-2xl overflow-hidden flex flex-col`}
        style={{
          maxWidth: side === 'left' || side === 'right' ? '100vw' : '100vw',
          maxHeight: side === 'top' || side === 'bottom' ? '100vh' : '100vh',
          width: side === 'left' || side === 'right' ? 'var(--sheet-width, 400px)' : '100%',
          animation: 'sheetSlideIn 200ms ease-out',
        }}
      >
        {children}
        <style>{`
          @keyframes sheetSlideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}

export interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function SheetContent({ children, className = '', ...props }: SheetContentProps) {
  return (
    <div className={`flex-1 overflow-hidden flex flex-col ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SheetHeader({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-4 py-3 border-b shrink-0 ${className}`} style={{ borderColor: 'var(--border-default)' }} {...props}>
      {children}
    </div>
  );
}

export function SheetTitle({ children, className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={`text-sm font-semibold ${className}`} style={{ color: 'var(--text-primary)' }} {...props}>
      {children}
    </h2>
  );
}
