import React from 'react';
import { SparklesIcon } from 'lucide-react';
import { enterpriseCx } from '../foundation';

export function EnterprisePage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={enterpriseCx('vc-enterprise-page', className)}>{children}</div>;
}

export function EnterpriseSectionHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="vc-enterprise-section-header">
      <div>
        {eyebrow ? (
          <div className="vc-enterprise-eyebrow">
            <SparklesIcon className="h-3 w-3" />
            <span>{eyebrow}</span>
          </div>
        ) : null}
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
