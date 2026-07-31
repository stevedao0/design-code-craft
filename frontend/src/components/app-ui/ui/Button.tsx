import React from 'react';
import { Button as FButton } from './Button';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link';
type Size = 'default' | 'sm' | 'lg' | 'icon';

const variantMap: Record<Variant, string> = {
  default: 'primary',
  outline: 'secondary',
  ghost: 'ghost',
  destructive: 'danger',
  secondary: 'secondary',
  link: 'ghost',
};

const sizeMap: Record<Size, string> = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = 'default', size = 'default', className = '', children, ...rest }: Props) {
  return (
    <FButton
      variant={variantMap[variant] as any}
      size={sizeMap[size] as any}
      className={className}
      {...rest}
    >
      {children}
    </FButton>
  );
}
