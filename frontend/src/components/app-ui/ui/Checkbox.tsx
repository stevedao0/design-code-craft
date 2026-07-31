import React from 'react';
import { Checkbox as FCheckbox } from '../Checkbox';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {};

export const Checkbox = React.forwardRef<HTMLInputElement, Props>(({ className = '', ...props }, ref) => {
  return <FCheckbox ref={ref as any} {...props} />;
});
Checkbox.displayName = 'Checkbox';
