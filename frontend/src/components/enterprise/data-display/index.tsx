import React from 'react';
import { EnterpriseTone, enterpriseCx, enterpriseToneClassMap } from '../foundation';

export type EnterpriseMetricItem = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: React.ReactNode;
  tone?: EnterpriseTone;
  icon?: React.ReactNode;
};

export function EnterpriseMetricGrid({
  items,
}: {
  items: EnterpriseMetricItem[];
}) {
  return (
    <div className="vc-enterprise-metric-grid">
      {items.map((item) => (
        <section key={String(item.label)} className="vc-enterprise-metric-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="vc-enterprise-label">{item.label}</div>
              <div className="mt-3 vc-enterprise-value">{item.value}</div>
              {item.hint ? <div className="mt-2 text-xs vc-enterprise-subtle">{item.hint}</div> : null}
            </div>
            {item.icon ? (
              <span className={enterpriseCx('vc-enterprise-badge', enterpriseToneClassMap[item.tone ?? 'accent'])}>{item.icon}</span>
            ) : null}
          </div>
          {item.delta ? <div className="mt-4 text-xs font-semibold vc-enterprise-subtle">{item.delta}</div> : null}
        </section>
      ))}
    </div>
  );
}

export function EnterpriseTableShell({
  title,
  description,
  toolbar,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={enterpriseCx('vc-enterprise-table-shell', className)}>
      {(title || description || toolbar) ? (
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="vc-enterprise-section-header">
            <div>
              {title ? <h3>{title}</h3> : null}
              {description ? <p>{description}</p> : null}
            </div>
            {toolbar}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
