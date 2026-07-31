type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  description?: string;
  duration?: number;
}

const listeners: Array<(message: string, tone: ToastTone, options?: ToastOptions) => void> = [];

export function toast(message: string, options?: ToastOptions): void;
export function toast(message: string, tone: ToastTone, options?: ToastOptions): void;
export function toast(message: string, toneOrOptions?: ToastTone | ToastOptions, maybeOptions?: ToastOptions): void {
  let tone: ToastTone = 'info';
  let options: ToastOptions | undefined;

  if (typeof toneOrOptions === 'string') {
    tone = toneOrOptions;
    options = maybeOptions;
  } else if (toneOrOptions) {
    options = toneOrOptions;
  }

  listeners.forEach((listener) => listener(message, tone, options));
}

toast.success = (message: string, description?: string) => {
  listeners.forEach((listener) => listener(message, 'success', { description }));
};

toast.error = (message: string, description?: string) => {
  listeners.forEach((listener) => listener(message, 'error', { description }));
};

toast.info = (message: string, description?: string) => {
  listeners.forEach((listener) => listener(message, 'info', { description }));
};

toast.warning = (message: string, description?: string) => {
  listeners.forEach((listener) => listener(message, 'warning', { description }));
};

toast.message = (message: string, options?: ToastOptions) => {
  listeners.forEach((listener) => listener(message, 'info', options));
};
