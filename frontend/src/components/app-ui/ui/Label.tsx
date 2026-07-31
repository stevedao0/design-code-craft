import React from 'react';

type Props = React.LabelHTMLAttributes<HTMLLabelElement> & {
  children?: React.ReactNode;
};

export const Label = React.forwardRef<HTMLLabelElement, Props>(({ className = '', children, ...props }, ref) => {
  return (
    <label
      ref={ref}
      className={`text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}
      {...props}
    >
      {children}
    </label>
  );
});
Label.displayName = 'Label';
