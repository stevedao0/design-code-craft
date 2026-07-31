import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-2xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function DialogContent({ children, className = '', ...props }: DialogContentProps) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-2xl overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-5 py-4 border-b ${className}`} style={{ borderColor: 'var(--border-default)' }} {...props}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={`text-sm font-semibold ${className}`} style={{ color: 'var(--text-primary)' }} {...props}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`text-xs mt-1 ${className}`} style={{ color: 'var(--text-secondary)' }} {...props}>
      {children}
    </p>
  );
}

export function DialogFooter({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-5 py-3 border-t flex items-center justify-end gap-2 ${className}`} style={{ borderColor: 'var(--border-default)' }} {...props}>
      {children}
    </div>
  );
}

// AlertDialog is just Dialog
export const AlertDialog = Dialog;
export const AlertDialogContent = DialogContent;
export const AlertDialogHeader = DialogHeader;
export const AlertDialogTitle = DialogTitle;
export const AlertDialogDescription = DialogDescription;
export const AlertDialogFooter = DialogFooter;
