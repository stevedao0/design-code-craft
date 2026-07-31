import React from 'react';
import { ActionMenu } from '../actions';
import type { RowAction } from '../actions';

export function MoreActions({
  actions,
  label = 'Tác vụ khác',
  align = 'right',
}: {
  actions: RowAction[];
  label?: string;
  align?: 'left' | 'right';
}) {
  return <ActionMenu actions={actions} label={label} align={align} iconOnly={false} />;
}
