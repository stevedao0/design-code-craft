import React from 'react';
import { ActionMenu } from './ActionMenu';
import type { RowAction } from './ActionMenuTypes';

export function RowActions({
  actions,
  label = 'Thao tác',
  align = 'right',
  iconOnly = true,
}: {
  actions: RowAction[];
  label?: string;
  align?: 'left' | 'right';
  iconOnly?: boolean;
}) {
  return <ActionMenu actions={actions} label={label} align={align} iconOnly={iconOnly} />;
}
