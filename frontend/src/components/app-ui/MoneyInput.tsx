import React from 'react';
type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'> &
{
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  value: number;
  onChange: (value: number) => void;
};
export function MoneyInput({
  label,
  error,
  hint,
  required,
  value,
  onChange,
  className = '',
  ...rest
}: MoneyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    onChange(raw === '' ? 0 : parseInt(raw, 10));
  };
  const formatted = value.toLocaleString('vi-VN');
  return (
    <div className="flex flex-col gap-1">
      {label &&
      <label className="text-[11px] font-medium text-zinc-600">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      }
      <div className="relative">
        <input
          {...rest}
          type="text"
          value={formatted}
          onChange={handleChange}
          className={`h-9 pl-3 pr-12 text-sm text-right rounded-lg bg-white text-zinc-900 ring-1 ring-zinc-200 hover:ring-zinc-300 focus:outline-none focus:ring-2 focus:ring-amber-600/40 transition-shadow shadow-sm shadow-zinc-900/[0.03] placeholder:text-zinc-400 tabular-nums font-semibold disabled:bg-zinc-50 disabled:text-zinc-500 disabled:cursor-not-allowed ${error ? 'ring-rose-300 focus:ring-rose-500/40' : ''} ${className}`} />
        
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-medium">
          VND
        </span>
      </div>
      {error && <span className="text-xs text-rose-600">{error}</span>}
      {hint && !error && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>);

}