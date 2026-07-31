import React from 'react';
import { ContentCard } from '../ContentCard';

export function ChartCard({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ContentCard title={title} description={description} actions={actions} className={className}>
      <div className="min-h-[12rem]">{children}</div>
    </ContentCard>
  );
}
