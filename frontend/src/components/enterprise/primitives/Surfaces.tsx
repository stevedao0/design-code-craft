import React from 'react';
import { enterpriseCx } from '../foundation';

export function EnterpriseSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={enterpriseCx('vc-enterprise-surface', className)}>{children}</section>;
}

export function EnterprisePanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={enterpriseCx('vc-enterprise-panel', className)}>{children}</section>;
}
