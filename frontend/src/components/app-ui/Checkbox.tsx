import React from 'react';
import { CheckIcon, MinusIcon } from 'lucide-react';
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  ariaLabel,
  className = ''







}: {checked: boolean;indeterminate?: boolean;onChange: (next: boolean) => void;label?: string;ariaLabel?: string;className?: string;}) {
  const showCheck = checked && !indeterminate;
  const isOn = checked || indeterminate;
  return (
    <label
      className={`group inline-flex items-center gap-2 cursor-pointer select-none ${className}`}
      onClick={(e) => e.stopPropagation()}>
      
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel ?? label}
        className="peer sr-only" />
      
      <span
        aria-hidden
        className={`relative h-4 w-4 rounded-[5px] flex items-center justify-center transition-all duration-150 ring-1 ring-inset ${isOn ? 'bg-amber-700 ring-amber-700 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]' : 'bg-white ring-zinc-300 group-hover:ring-zinc-400'} peer-focus-visible:ring-2 peer-focus-visible:ring-amber-600/40 peer-focus-visible:ring-offset-2`}>
        
        {indeterminate ?
        <MinusIcon className="h-3 w-3 text-white" strokeWidth={3.5} /> :
        showCheck ?
        <CheckIcon className="h-3 w-3 text-white" strokeWidth={3.5} /> :
        null}
      </span>
      {label &&
      <span className="text-sm text-zinc-700 group-hover:text-zinc-900 transition-colors">
          {label}
        </span>
      }
    </label>);

}