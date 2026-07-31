import React from 'react';
import { DataTable } from './DataTable';
import type {
  DataTableCellMeta,
  DataTableColumn,
  DataTableDensity,
  DataTableSummaryRow,
} from './DataTableTypes';

type MoneyAlign = 'left' | 'center' | 'right';

function inferAlignFromMeta(meta?: DataTableCellMeta): MoneyAlign {
  if (!meta) return 'left';
  if (meta.kind === 'currency' || meta.kind === 'number' || meta.kind === 'percent') return 'right';
  if (meta.kind === 'date') return 'center';
  return 'left';
}

export type VcpmcMoneyTableProps<T extends { id: string | number }> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  density?: DataTableDensity;
  stickyFirstColumn?: boolean;
  showZebra?: boolean;
  horizontalScroll?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
  summaryRows?: DataTableSummaryRow[];
  grandTotal?: DataTableSummaryRow;
};

export function VcpmcMoneyTable<T extends { id: string | number }>({
  columns,
  rows,
  density = 'comfortable',
  stickyFirstColumn = false,
  showZebra = false,
  horizontalScroll = true,
  emptyState,
  className,
  summaryRows,
  grandTotal,
}: VcpmcMoneyTableProps<T>) {
  const decoratedColumns: DataTableColumn<T>[] = columns.map((col) => {
    if (col.align) return col;
    const inferred = inferAlignFromMeta(col.meta);
    return { ...col, align: inferred };
  });

  const summary: DataTableSummaryRow[] = [];
  if (summaryRows && summaryRows.length > 0) summary.push(...summaryRows);
  if (grandTotal) summary.push(grandTotal);

  return (
    <DataTable
      columns={decoratedColumns}
      rows={rows}
      density={density}
      tableFixed
      stickyFirstColumn={stickyFirstColumn}
      showZebra={showZebra}
      horizontalScroll={horizontalScroll}
      summary={summary}
      empty={emptyState}
      classNames={className ? { shell: className } : undefined}
    />
  );
}