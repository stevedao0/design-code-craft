import React from 'react';
import { EmployeePerformanceItem } from '../../lib/reportsClient';
import { formatShortVND, formatNumber, formatCurrency } from '../../lib/format';

type TableItem = {
  key: string;
  name: string;
  email: string;
  totalContracts: number;
  signedContracts: number;
  pendingContracts: number;
  expiringContracts: number;
  expiredContracts: number;
  revenue: number;
  avgRevenue: number;
  lastContractDate: string | null;
  completionRate: number;
};

function getPerformanceTone(p: TableItem): 'good' | 'watch' | 'overload' {
  if (p.completionRate >= 80 && p.pendingContracts <= 4) return 'good';
  if (p.completionRate < 70 || p.pendingContracts >= 6) return 'overload';
  return 'watch';
}

const toneBadge: Record<
  'good' | 'watch' | 'overload',
  { label: string; bg: string; text: string; ring: string; dot: string }
> = {
  good: {
    label: 'Tốt',
    bg: 'bg-lime-50',
    text: 'text-lime-700',
    ring: 'ring-lime-600/15',
    dot: 'bg-lime-500',
  },
  watch: {
    label: 'Cần theo dõi',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-600/15',
    dot: 'bg-amber-500',
  },
  overload: {
    label: 'Quá tải',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    ring: 'ring-rose-600/15',
    dot: 'bg-rose-500',
  },
};

interface EmployeePerformanceTableProps {
  items: EmployeePerformanceItem[];
}

export function EmployeePerformanceTable({ items }: EmployeePerformanceTableProps) {
  const tableItems: TableItem[] = items.map((emp) => {
    const totalContracts = emp.total_contracts;
    const completionRate = totalContracts > 0
      ? Math.round((emp.signed_contracts / totalContracts) * 100)
      : 0;

    return {
      key: emp.employee_id.toLowerCase().replace(/\s+/g, '-'),
      name: emp.employee_name,
      email: emp.employee_email,
      totalContracts: emp.total_contracts,
      signedContracts: emp.signed_contracts,
      pendingContracts: emp.pending_contracts,
      expiringContracts: emp.expiring_contracts,
      expiredContracts: emp.expired_contracts,
      revenue: emp.total_revenue,
      avgRevenue: emp.avg_revenue_per_contract,
      lastContractDate: emp.last_contract_date,
      completionRate,
    };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="sticky top-0 z-10 bg-gradient-to-b from-amber-50/30 via-zinc-50 to-zinc-50/30 border-b border-zinc-200">
            <Th>Nhân viên</Th>
            <Th align="right">Tổng HĐ</Th>
            <Th align="right">Đã ký</Th>
            <Th align="right">Chờ xử lý</Th>
            <Th align="right">Sắp hết hạn</Th>
            <Th align="right">Hết hạn</Th>
            <Th align="right">Doanh thu</Th>
            <Th align="right">TB/HĐ</Th>
            <Th>HĐ gần nhất</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {tableItems.map((p) => {
            const tone = getPerformanceTone(p);
            const badge = toneBadge[tone];
            return (
              <tr
                key={p.key}
                className="hover:bg-amber-50/30 transition-colors">
                <td className="px-4 py-3.5 align-top">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-600 to-amber-600 text-white text-xs font-bold inline-flex items-center justify-center shadow-sm shadow-amber-600/20 shrink-0">
                      {p.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-zinc-900 leading-tight">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {p.totalContracts} hợp đồng
                      </p>
                    </div>
                  </div>
                </td>
                <Td align="right">
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {p.totalContracts}
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {p.signedContracts}
                  </span>
                </Td>
                <Td align="right">
                  <span
                    className={`tabular-nums font-medium ${
                      p.pendingContracts >= 6 ? 'text-rose-700' : 'text-zinc-700'
                    }`}>
                    {p.pendingContracts}
                  </span>
                </Td>
                <Td align="right">
                  <span
                    className={`tabular-nums font-medium ${
                      p.expiringContracts >= 7 ? 'text-amber-700' : 'text-zinc-700'
                    }`}>
                    {p.expiringContracts}
                  </span>
                </Td>
                <Td align="right">
                  <span className="text-zinc-600 tabular-nums">
                    {p.expiredContracts}
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-semibold text-zinc-900 tabular-nums whitespace-nowrap text-[13px]">
                    {formatShortVND(p.revenue)}
                  </span>
                </Td>
                <Td align="right">
                  <span className="text-zinc-600 tabular-nums text-[13px]">
                    {p.avgRevenue > 0 ? formatShortVND(p.avgRevenue) : '—'}
                  </span>
                </Td>
                <td className="px-4 py-3.5 align-top text-[12px] text-zinc-500 whitespace-nowrap">
                  {p.lastContractDate ? new Date(p.lastContractDate).toLocaleDateString('vi-VN') : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={`px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-700 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={`px-4 py-3.5 align-top text-[13px] ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
      }`}>
      {children}
    </td>
  );
}
