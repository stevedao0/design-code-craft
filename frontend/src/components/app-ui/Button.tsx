import React from 'react';
type Variant = 'primary' | 'secondary' | 'ghost' | 'glass' | 'glassPrimary' | 'danger';
type Size = 'sm' | 'md' | 'lg';
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-10 px-4 text-sm',
};
const variants: Record<Variant, string> = {
  primary: 'ds-button-primary border-transparent text-white shadow-sm',
  secondary: 'ds-button-secondary shadow-xs',
  ghost: 'ds-button-ghost',
  glass:
    'border-[color:var(--border-subtle)] bg-[color:var(--surface)]/80 text-[color:var(--text-primary)] backdrop-blur-sm',
  glassPrimary:
    'border-transparent bg-gradient-to-b from-[color:var(--accent-copper)] to-[color:var(--accent-primary)] text-white shadow-md',
  danger: 'ds-button-danger shadow-sm',
};
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};
export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`ds-button ds-focus-ring inline-flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {leftIcon && <span className="-ml-0.5 shrink-0">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="-mr-0.5 shrink-0">{rightIcon}</span>}
    </button>
  );
}
