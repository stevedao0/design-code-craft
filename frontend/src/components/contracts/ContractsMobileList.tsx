import React from 'react';
import { Checkbox } from '../app-ui/Checkbox';
import type { ContractRecord } from '../../data/contractRecords';
import { ContractMobileCard } from './ContractMobileCard';

type Props = {
  contracts: ContractRecord[];
  selected: Set<number>;
  allSelected: boolean;
  someSelected: boolean;
  canEdit: boolean;
  canDelete: boolean;
  readOnly?: boolean;
  onOpenDetail: (id: number) => void;
  onToggleOne: (id: number) => void;
  onToggleAll: () => void;
  onWordPreview: (r: ContractRecord) => void;
  onGcnContext: (r: ContractRecord) => void;
  onDeleteConfirm: (r: ContractRecord) => void;
  onPrintCertificate?: (contractId: number) => void;
  onNavigatePrint: () => void;
  onAssignGcn: (r: ContractRecord) => void;
};

export function ContractsMobileList({
  contracts,
  selected,
  allSelected,
  someSelected,
  canEdit,
  canDelete,
  readOnly = false,
  onOpenDetail,
  onToggleOne,
  onToggleAll,
  onWordPreview,
  onGcnContext,
  onDeleteConfirm,
  onPrintCertificate,
  onNavigatePrint,
  onAssignGcn,
}: Props) {
  // List-only: mobile card also must not open detail and must not render
  // action menu. The contract id is still selected via checkbox so the user
  // can see they are inspecting a row, but no navigation occurs.
  const safeOnOpen = readOnly ? () => undefined : onOpenDetail;
  return (
    <div className="contracts-mobile-list" role="list">
      <div className="contracts-mobile-list__toolbar">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onChange={onToggleAll}
          ariaLabel="Chọn tất cả hợp đồng"
        />
        <span className="contracts-mobile-list__toolbar-label">
          {selected.size > 0 ? `Đã chọn ${selected.size}` : 'Chọn tất cả'}
        </span>
      </div>

      {contracts.map((r) => (
        <ContractMobileCard
          key={`m-${r.id}`}
          contract={r}
          isSelected={selected.has(r.id)}
          canEdit={!readOnly && canEdit}
          canDelete={!readOnly && canDelete}
          readOnly={readOnly}
          onOpenDetail={safeOnOpen}
          onToggleOne={onToggleOne}
          onWordPreview={onWordPreview}
          onGcnContext={onGcnContext}
          onDeleteConfirm={onDeleteConfirm}
          onPrintCertificate={onPrintCertificate}
          onNavigatePrint={onNavigatePrint}
          onAssignGcn={onAssignGcn}
        />
      ))}
    </div>
  );
}