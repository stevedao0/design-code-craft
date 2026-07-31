import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2Icon, InfoIcon, XCircleIcon, XIcon } from 'lucide-react';

export type ToastTone = 'success' | 'info' | 'error' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  duration?: number;
}

interface ToastContextValue {
  addToast: (message: string, tone?: ToastTone, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const toneStyles: Record<
  ToastTone,
  { icon: React.ReactNode; iconClass: string; barClass: string; containerClass: string }
> = {
  success: {
    icon: <CheckCircle2Icon className="h-4 w-4 shrink-0" />,
    iconClass: 'text-lime-600',
    barClass: 'bg-lime-500',
    containerClass: 'border-lime-200 bg-lime-50 text-lime-900',
  },
  info: {
    icon: <InfoIcon className="h-4 w-4 shrink-0" />,
    iconClass: 'text-lime-600',
    barClass: 'bg-lime-500',
    containerClass: 'border-lime-200 bg-lime-50 text-lime-900',
  },
  warning: {
    icon: <InfoIcon className="h-4 w-4 shrink-0" />,
    iconClass: 'text-amber-600',
    barClass: 'bg-amber-500',
    containerClass: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  error: {
    icon: <XCircleIcon className="h-4 w-4 shrink-0" />,
    iconClass: 'text-rose-600',
    barClass: 'bg-rose-500',
    containerClass: 'border-rose-200 bg-rose-50 text-rose-900',
  },
};

const DEFAULT_DURATION = 3200;

function ToastItemComponent({
  item,
  onRemove,
}: {
  item: ToastItem;
  onRemove: (id: string) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const style = toneStyles[item.tone];

  useEffect(() => {
    setMounted(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(item.id), 200);
    }, item.duration ?? DEFAULT_DURATION);
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
      role="status"
      aria-live="polite"
      className={[
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-[0_8px_24px_rgba(28,25,23,0.12)]',
        'text-xs font-medium',
        style.containerClass,
        mounted && visible ? 'motion-safe:animate-[toastIn_180ms_cubic-bezier(0.22,1,0.36,1)]' : '',
        !visible ? 'opacity-0 translate-y-1 transition-all duration-200' : '',
      ].join(' ')}
    >
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 rounded-full self-stretch min-h-[20px] ${style.barClass}`} aria-hidden />
      <span className={style.iconClass}>{style.icon}</span>
      <span className="flex-1 leading-relaxed">{item.message}</span>
      <button
        type="button"
        onClick={handleClose}
        aria-label="Đóng thông báo"
        className="shrink-0 text-current opacity-50 hover:opacity-100 transition-opacity -mr-1 -mt-0.5"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idCounterRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addToast = useCallback(
    (message: string, tone: ToastTone = 'info', duration?: number) => {
      const id = `toast-${++idCounterRef.current}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, message, tone, duration }]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (!mounted) return null;

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-label="Thông báo"
            className="fixed bottom-5 right-4 z-[120] flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:right-6 sm:bottom-6 sm:max-w-sm w-full pointer-events-none"
          >
            {toasts.map((toast) => (
              <div key={toast.id} className="pointer-events-auto">
                <ToastItemComponent item={toast} onRemove={removeToast} />
              </div>
            ))}
          </div>,
          document.body
        )}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
