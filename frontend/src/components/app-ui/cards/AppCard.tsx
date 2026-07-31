import React from 'react';
import { ContentCard } from '../ContentCard';

export function AppCard({
  children,
  className = '',
  title,
  description,
  actions,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <ContentCard
      title={title}
      description={description}
      actions={actions}
      padded={padded}
      className={className}
    >
      {children}
    </ContentCard>
  );
}
