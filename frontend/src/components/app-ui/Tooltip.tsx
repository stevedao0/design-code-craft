import React, { useEffect, useRef, useState } from 'react';

export interface TooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
}

export function Tooltip({
  children,
  content,
  side = 'top',
  delayDuration = 300,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), delayDuration);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span className="relative inline-flex">
      {React.cloneElement(children, {
        ref: triggerRef,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      })}
      {visible && (
        <span
          role="tooltip"
          className={`absolute z-50 px-2 py-1 text-xs rounded shadow-lg whitespace-nowrap pointer-events-none ${sideClasses[side]}`}
          style={{
            background: 'var(--text-primary)',
            color: 'var(--surface)',
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}

export interface TooltipTriggerProps {
  children: React.ReactElement;
  asChild?: boolean;
}

export function TooltipTrigger({ children }: TooltipTriggerProps) {
  return children;
}

export interface TooltipContentProps {
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function TooltipContent({ children, side = 'top' }: TooltipContentProps) {
  return <span className="relative z-50 px-2 py-1 text-xs rounded shadow-lg">{children}</span>;
}

export interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

export function TooltipProvider({ children, delayDuration = 300 }: TooltipProviderProps) {
  return <span>{children}</span>;
}
