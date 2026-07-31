import React from 'react';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
};

export function Textarea({
  label,
  error,
  hint,
  required,
  className = '',
  ...rest
}: TextareaProps) {
  return (
    <div className="ds-field flex flex-col gap-1">
      {label && (
        <label className="ds-label text-[11px] font-medium text-fg-secondary">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      <textarea
        {...rest}
        className={`ds-textarea ds-focus-ring resize-y shadow-sm placeholder:text-fg-subtle disabled:cursor-not-allowed ${error ? 'border-[color:var(--accent-danger)] focus:ring-danger/40' : ''} ${className}`}
      />
      {error && <span className="ds-error text-xs text-danger">{error}</span>}
      {hint && !error && <span className="ds-helper text-xs text-fg-muted">{hint}</span>}
    </div>
  );
}
