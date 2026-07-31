import React, { useMemo } from 'react';
import { DataTableEmptyState } from './DataTableEmptyState';
import { DataTableErrorState } from './DataTableErrorState';
import { DataTableLoadingState } from './DataTableLoadingState';
import { DataTablePagination } from './DataTablePagination';
import { DataTableToolbar } from './DataTableToolbar';
import type {
  DataTableClassNames,
  DataTableColumn,
  DataTableDensity,
  DataTablePaginationConfig,
  DataTableSelectionConfig,
  DataTableStateProps,
  DataTableSummaryRow,
  DataTableWrap,
} from './DataTableTypes';

function resolveCellValue<T>(row: T, column: DataTableColumn<T>): React.ReactNode {
  if (column.accessor == null) return undefined;
  if (typeof column.accessor === 'function') return column.accessor(row);
  return row[column.accessor] as React.ReactNode;
}

function alignClassName(align: DataTableColumn<any>['align']) {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function getColumnLabel(header: React.ReactNode): string | undefined {
  if (typeof header === 'string' || typeof header === 'number') return String(header);
  return undefined;
}

function wrapClassName(wrap: DataTableWrap) {
  if (wrap === 'nowrap') return 'whitespace-nowrap';
  if (wrap === 'clamp-1') return 'line-clamp-1';
  if (wrap === 'clamp-2') return 'line-clamp-2';
  if (wrap === 'clamp-3') return 'line-clamp-3';
  return 'whitespace-normal break-words';
}

function densityRowClass(density: DataTableDensity) {
  if (density === 'compact') return 'ds-table-row-compact';
  if (density === 'detailed') return 'ds-table-row-detailed';
  return 'ds-table-row-comfortable';
}

function densityCellPadding(density: DataTableDensity) {
  if (density === 'compact') return 'py-2';
  if (density === 'detailed') return 'py-4';
  return 'py-3';
}

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  loading = false,
  error = false,
  empty,
  toolbar,
  pagination,
  selection,
  density = 'comfortable',
  stickyHeader = false,
  horizontalScroll = true,
  stickyActionColumn = false,
  onRowClick,
  classNames,
  state,
  summary,
  tableFixed = false,
  stickyFirstColumn = false,
  showZebra = false,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: boolean;
  empty?: React.ReactNode;
  toolbar?: {
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    className?: string;
  };
  pagination?: DataTablePaginationConfig;
  selection?: DataTableSelectionConfig<T, T['id']>;
  density?: DataTableDensity;
  stickyHeader?: boolean;
  horizontalScroll?: boolean;
  stickyActionColumn?: boolean;
  onRowClick?: (row: T) => void;
  classNames?: DataTableClassNames;
  state?: DataTableStateProps;
  summary?: DataTableSummaryRow[];
  tableFixed?: boolean;
  stickyFirstColumn?: boolean;
  showZebra?: boolean;
}) {
  const selectableRows = useMemo(
    () => rows.filter((row) => !(selection?.isRowDisabled?.(row) ?? false)),
    [rows, selection]
  );

  const selectableIds = useMemo(
    () => selectableRows.map((row) => selection?.getRowId(row)).filter(Boolean) as T['id'][],
    [selectableRows, selection]
  );

  const allSelected =
    !!selection && selectableIds.length > 0 && selectableIds.every((rowId) => selection.selectedIds.includes(rowId));

  const someSelected = !!selection && !allSelected && selectableIds.some((rowId) => selection.selectedIds.includes(rowId));

  if (loading) return <DataTableLoadingState label={state?.description ?? undefined} />;
  if (error) {
    return (
      <DataTableErrorState
        title={state?.title}
        description={state?.description}
        action={state?.action}
      />
    );
  }
  if (rows.length === 0) return empty ?? <DataTableEmptyState title={state?.title} description={state?.description} action={state?.action} />;

  return (
    <div className={`ds-table-shell flex flex-col ${classNames?.shell ?? ''}`}>
      {(state?.title || state?.description || toolbar?.leading || toolbar?.trailing) && (
        <DataTableToolbar
          leading={
            <>
              {(state?.title || state?.description) && (
                <div className="min-w-0">
                  {state?.title && <p className="text-sm font-semibold text-fg-primary">{state.title}</p>}
                  {state?.description && <p className="mt-0.5 text-xs text-fg-muted">{state.description}</p>}
                </div>
              )}
              {toolbar?.leading}
            </>
          }
          trailing={toolbar?.trailing}
          className={`${classNames?.toolbar ?? ''} ${toolbar?.className ?? ''}`}
        />
      )}

      <div
        className={`${horizontalScroll ? 'overflow-x-auto' : 'overflow-x-visible'} overflow-y-auto ${stickyHeader ? 'max-h-[72vh]' : ''} ${classNames?.scroll ?? ''}`}
      >
        <table className={`w-full border-separate border-spacing-0 text-sm ${classNames?.table ?? ''}`}>{tableFixed && (<colgroup>
              {selection && <col style={{ width: '40px' }} />}
              {columns.map((col) => (
                <col
                  key={`col-${col.key}`}
                  style={{ width: col.width, minWidth: col.minWidth, maxWidth: col.maxWidth }}
                />
              ))}
            </colgroup>)}<thead className={`ds-table-head ${stickyHeader ? 'sticky top-0 z-[1]' : ''} ${classNames?.header ?? ''}`}>
            <tr>
              {selection && (
                <th className="ds-table-head-cell w-10 px-4 py-3 text-left" scope="col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = someSelected;
                    }}
                    onChange={(e) => selection.onToggleAll(selectableIds, e.target.checked)}
                    aria-label="Chọn tất cả"
                    className="h-4 w-4 cursor-pointer rounded-[5px]"
                  />
                </th>
              )}
              {columns.map((col, colIdx) => {
                const sticky = stickyActionColumn && colIdx === columns.length - 1;
                const stickyFirst = stickyFirstColumn && colIdx === 0;
                return (
                  <th
                    key={col.key}
                    className={`ds-table-head-cell px-4 py-3 ${alignClassName(col.align)} ${sticky ? 'sticky right-0 z-[2] bg-[color:var(--surface-muted)]' : ''} ${stickyFirst ? 'sticky left-0 z-[2] bg-[color:var(--surface-elevated)]' : ''} ${col.headerClassName ?? ''}`}
                    style={{ width: col.width, minWidth: col.minWidth, maxWidth: col.maxWidth }}
                    scope="col"
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={classNames?.body ?? ''}>
            {rows.map((row, rowIdx) => {
              const rowId = selection?.getRowId(row) ?? row.id;
              const isSelected = selection?.selectedIds.includes(rowId) ?? false;
              const isDisabled = selection?.isRowDisabled?.(row) ?? false;

              return (
                <tr
                  key={row.id}
                  onClick={isDisabled || !onRowClick ? undefined : () => onRowClick(row)}
                  aria-selected={isSelected || undefined}
                  className={`ds-table-row ${densityRowClass(density)} ${showZebra && rowIdx % 2 === 1 ? 'ds-table-row-alt' : ''} ${isSelected ? 'ds-table-row-selected' : ''} ${onRowClick && !isDisabled ? 'cursor-pointer' : ''} ${isDisabled ? 'opacity-60' : ''} ${classNames?.row ?? ''}`}
                >
                  {selection && (
                    <td className={`ds-table-cell w-10 px-4 ${densityCellPadding(density)}`} onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (!isDisabled) selection.onToggleRow(rowId);
                        }}
                        disabled={isDisabled}
                        aria-label={`Chọn dòng ${rowIdx + 1}`}
                        className="h-4 w-4 cursor-pointer rounded-[5px]"
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => {
                    const raw = resolveCellValue(row, col);
                    const rendered = col.render ? col.render(row, raw) : raw;
                    const sticky = stickyActionColumn && colIdx === columns.length - 1;
                    const stickyFirst = stickyFirstColumn && colIdx === 0;
                    const cellTitle = col.tooltip && typeof rendered === 'string' ? rendered : undefined;

                    return (
                      <td
                        key={col.key}
                        data-label={getColumnLabel(col.header)}
                        className={`ds-table-cell px-4 ${densityCellPadding(density)} ${alignClassName(col.align)} ${wrapClassName(col.wrap ?? 'normal')} ${sticky ? 'sticky right-0 z-[1] bg-[color:var(--surface-elevated)]' : ''} ${stickyFirst ? 'sticky left-0 z-[1] bg-[color:var(--surface-elevated)]' : ''} ${col.cellClassName ?? ''} ${classNames?.cell ?? ''}`}
                        style={{ width: col.width, minWidth: col.minWidth, maxWidth: col.maxWidth }}
                        title={cellTitle}
                      >
                        {rendered}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {summary && summary.length > 0 && (
            <tfoot className="ds-table-foot">
              {summary.map((row) => (
                <tr key={row.id} className={`ds-table-row ${row.className ?? ''}`}>
                  {row.cells.map((cell) => {
                    const toneClass =
                      cell.tone === 'grand-total'
                        ? 'bg-[color:var(--vcpmc-grand-total-bg)] text-[color:var(--vcpmc-grand-total-fg)] font-bold tabular-nums'
                        : cell.tone === 'subtle'
                          ? 'bg-[color:var(--vcpmc-table-row-alt)]'
                          : cell.tone === 'strong'
                            ? 'font-semibold'
                            : '';
                    const align = cell.align ?? 'left';
                    return (
                      <td
                        key={cell.id}
                        colSpan={cell.colSpan}
                        className={`ds-table-cell px-4 ${densityCellPadding(density)} ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${toneClass}`}
                      >
                        {cell.content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      {pagination && (
        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          pageSizeOptions={pagination.pageSizeOptions}
        />
      )}
    </div>
  );
}
