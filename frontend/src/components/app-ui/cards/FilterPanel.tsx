import React from 'react';
import { ContentCard } from '../ContentCard';

export function FilterPanel({
  title,
  description,
  children,
  actions,
  className = '',
}: {
  title?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <ContentCard title={title} description={description} actions={actions} className={className}>
      <div className="flex flex-col gap-4">{children}</div>
    </ContentCard>
  );
}
