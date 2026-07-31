import React from 'react';
import { Input as FInput } from '../Input';

type Props = React.InputHTMLAttributes<HTMLInputElement> & {};

export const Input = React.forwardRef<HTMLInputElement, Props>(({ className = '', ...props }, ref) => {
  return <FInput ref={ref as any} className={className} {...props} />;
});
Input.displayName = 'Input';
