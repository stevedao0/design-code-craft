import React from 'react';
import { MetricCard } from '../MetricCard';
import type { MetricCardProps } from '../MetricCard';

export function StatCard(props: MetricCardProps) {
  return <MetricCard {...props} />;
}
