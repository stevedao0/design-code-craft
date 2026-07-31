import React from 'react';

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {};

export function Textarea({ className = '', ...props }: Props) {
  return (
    <textarea
      className={`ds-input ds-focus-ring min-h-[80px] w-full rounded-lg px-3 py-2 text-sm placeholder:text-fg-subtle ${className}`}
      {...props}
    />
  );
}
