import React from 'react';
import { EnterpriseTone, enterpriseCx, enterpriseToneClassMap } from '../foundation';

export function EnterpriseBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: EnterpriseTone;
  className?: string;
}) {
  return <span className={enterpriseCx('vc-enterprise-badge', enterpriseToneClassMap[tone], className)}>{children}</span>;
}

export function EnterpriseChip({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: EnterpriseTone;
  className?: string;
}) {
  return <span className={enterpriseCx('vc-enterprise-chip', enterpriseToneClassMap[tone], className)}>{children}</span>;
}

export function EnterprisePill({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: EnterpriseTone;
  className?: string;
}) {
  return <span className={enterpriseCx('vc-enterprise-pill', enterpriseToneClassMap[tone], className)}>{children}</span>;
}
