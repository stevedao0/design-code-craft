import React from 'react';

export type RowAction = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  hidden?: boolean;
  tone?: 'default' | 'primary' | 'warning' | 'danger';
  dividerBefore?: boolean;
  confirm?: {
    title: string;
    description?: string;
    confirmLabel?: string;
  };
};
