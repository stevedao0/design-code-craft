import React from 'react';
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
};
export function Input({
  label,
  error,
  hint,
  required,
  className = '',
  ...rest
}: InputProps) {
  return (
    <div className="ds-field flex flex-col gap-1">
      {label && (
        <label className="ds-label text-[11px] font-medium text-fg-secondary">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <input
        {...rest}
        className={`ds-input ds-focus-ring h-9 px-3 text-sm shadow-xs placeholder:text-fg-subtle ${error ? 'border-[color:var(--accent-danger)] focus:ring-danger/40' : ''} ${className}`}
      />
      {error && <span className="ds-error text-xs text-danger">{error}</span>}
      {hint && !error && <span className="ds-helper text-xs text-fg-muted">{hint}</span>}
    </div>
  );
}
