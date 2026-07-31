import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastTone = 'success' | 'info' | 'error' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  description?: string;
  tone: ToastTone;
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string, description?: string) => void;
    error: (message: string, description?: string) => void;
    info: (message: string, description?: string) => void;
    warning: (message: string, description?: string) => void;
    message: (message: string, options?: { description?: string }) => void;
  };
}

const ToastContext = createContext<ToastContextValue>({
  toast: {
    success: () => {},
    error: () => {},
    info: () => {},
    warning: () => {},
    message: () => {},
  },
});

export function useToast() {
  return useContext(ToastContext);
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  const icons = {
    success: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    error: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    info: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    warning: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L14.9 13.5H1.1L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6v3M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  };
  return icons[tone];
}

const toneStyles: Record<ToastTone, { containerClass: string; iconClass: string }> = {
  success: {
    containerClass: 'bg-lime-50 border-lime-200 text-lime-900',
    iconClass: 'text-lime-600',
  },
  error: {
    containerClass: 'bg-red-50 border-red-200 text-red-900',
    iconClass: 'text-red-600',
  },
  info: {
    containerClass: 'bg-lime-50 border-lime-200 text-lime-900',
    iconClass: 'text-lime-600',
  },
  warning: {
    containerClass: 'bg-amber-50 border-amber-200 text-amber-900',
    iconClass: 'text-amber-600',
  },
};

function Toast({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const style = toneStyles[item.tone];

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(item.id), 200);
    }, item.duration ?? 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item.id, item.duration, onRemove]);

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => onRemove(item.id), 200);
  };

  return (
    <div
      className={[
        'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all duration-200',
        style.containerClass,
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
      ].join(' ')}
      style={{
        maxWidth: '400px',
        animation: visible ? 'toastIn 180ms ease-out' : undefined,
      }}
    >
      <span className={style.iconClass}>
        <ToastIcon tone={item.tone} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.message}</p>
        {item.description && (
          <p className="text-xs mt-0.5 opacity-80">{item.description}</p>
        )}
      </div>
      <button
        onClick={handleClose}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        type="button"
        aria-label="Close"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export interface ToasterProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  richColors?: boolean;
}

export function Toaster({ position = 'top-right', richColors }: ToasterProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idCounterRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addToast = useCallback((message: string, tone: ToastTone, description?: string) => {
    const id = `toast-${++idCounterRef.current}`;
    setToasts((prev) => [...prev, { id, message, description, tone }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  const toastContext: ToastContextValue = {
    toast: {
      success: (message, description) => addToast(message, 'success', description),
      error: (message, description) => addToast(message, 'error', description),
      info: (message, description) => addToast(message, 'info', description),
      warning: (message, description) => addToast(message, 'warning', description),
      message: (message, options) => addToast(message, 'info', options?.description),
    },
  };

  if (!mounted) return null;

  return (
    <ToastContext.Provider value={toastContext}>
      <div
        aria-live="polite"
        aria-label="Notifications"
        className={`fixed z-[200] flex flex-col gap-2 pointer-events-none ${positionClasses[position]}`}
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast item={toast} onRemove={removeToast} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

