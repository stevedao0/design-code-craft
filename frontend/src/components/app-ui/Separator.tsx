import React from 'react';

type Props = React.HTMLAttributes<HTMLDivElement> & {};

export function Separator({ className, ...props }: Props) {
  return <hr className={className} {...props} />;
}
