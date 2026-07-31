import React from 'react';
import { formatCurrency } from '../../../lib/format';
import { EnterpriseBadge, EnterpriseChip } from '../primitives';

export function EnterpriseContractNoCell({
  primary,
  secondary,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-semibold text-[13px] leading-snug text-zinc-800" title={typeof primary === 'string' ? primary : undefined}>{primary}</div>
      {secondary ? <div className="mt-0.5 text-[11px] vc-enterprise-subtle">{secondary}</div> : null}
    </div>
  );
}

export function EnterpriseCustomerCell({
  name,
  secondary,
}: {
  name: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[12.5px] font-medium leading-snug line-clamp-1 text-zinc-800" title={typeof name === 'string' ? name : undefined}>{name}</div>
      {secondary ? (
        <div className="text-[11.5px] text-zinc-400 leading-snug line-clamp-1" title={typeof secondary === 'string' ? secondary : undefined}>{secondary}</div>
      ) : null}
    </div>
  );
}

export function EnterpriseLocationCell({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="text-[12.5px] leading-snug vc-enterprise-subtle">{children}</div>;
}

export function EnterpriseAmountCell({
  amount,
}: {
  amount: number | null;
}) {
  if (amount == null) {
    return <span className="text-zinc-400 italic text-xs">Chưa có</span>;
  }

  if (amount === 0) {
    return <span className="text-zinc-500 text-xs">Chưa tính</span>;
  }

  const formatted = formatCurrency(amount);
  return <span className="money-strong tabular-nums text-[13.5px]" title={formatted}>{formatted}</span>;
}

export function EnterpriseStatusPair({
  primary,
  secondary,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 items-start">
      {primary}
      {secondary}
    </div>
  );
}

export function EnterpriseUsageChips({
  items,
  extra,
  detail,
}: {
  items: string[];
  extra?: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-1">
      {items.map((item, index) => (
        <EnterpriseChip key={`${String(item)}-${index}`} tone="teal" className="usage-area-chip">{item}</EnterpriseChip>
      ))}
      {extra ? <EnterpriseBadge tone="neutral" className="usage-extra-chip">{extra}</EnterpriseBadge> : null}
      {detail}
    </div>
  );
}
