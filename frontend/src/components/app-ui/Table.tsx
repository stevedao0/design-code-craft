import React from 'react';
import { cn } from '@/lib/utils';

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

export function Table({ children, className = '', ...props }: TableProps) {
  return (
    <div className="w-full overflow-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export function TableHeader({ children, className = '', ...props }: TableHeaderProps) {
  return (
    <thead className={cn('[&_tr]:border-b', className)} {...props}>
      {children}
    </thead>
  );
}

export interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export function TableBody({ children, className = '', ...props }: TableBodyProps) {
  return (
    <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
}

export function TableRow({ children, className = '', ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        'border-b transition-colors hover:bg-[var(--surface-muted)]/50',
        'data-[state=selected]:bg-[var(--accent-primary-soft)]',
        className
      )}
      style={{ borderColor: 'var(--border-subtle)' }}
      {...props}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

export function TableHead({ children, className = '', ...props }: TableHeadProps) {
  return (
    <th
      className={cn(
        'h-10 px-4 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0',
        className
      )}
      style={{ color: 'var(--text-secondary)' }}
      {...props}
    >
      {children}
    </th>
  );
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

export function TableCell({ children, className = '', ...props }: TableCellProps) {
  return (
    <td
      className={cn('px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    >
      {children}
    </td>
  );
}
