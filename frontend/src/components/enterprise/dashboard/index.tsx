import React from 'react';
import { EnterpriseMetricGrid, EnterpriseMetricItem } from '../data-display';

export function EnterpriseSummaryStrip({
  items,
}: {
  items: EnterpriseMetricItem[];
}) {
  return <EnterpriseMetricGrid items={items} />;
}
