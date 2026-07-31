import React from 'react';
import {
  EyeIcon,
  PencilIcon,
  FileDownIcon,
  AwardIcon,
  PrinterIcon,
  Trash2Icon,
} from 'lucide-react';
import { Checkbox } from '../app-ui/Checkbox';
import { RowActionsMenu } from '../app-ui/RowActionsMenu';
import { StatusBadge } from '../app-ui/StatusBadge';
import type { ContractRecord } from '../../data/contractRecords';
import { getExpiryStatus } from '../../data/contractRecords';
import { formatCurrency, formatDate } from '../../lib/format';

type Props = {
  contract: ContractRecord;
  isSelected: boolean;
  canEdit: boolean;
  canDelete: boolean;
  readOnly?: boolean;
  onOpenDetail: (id: number) => void;
  onToggleOne: (id: number) => void;
  onWordPreview: (r: ContractRecord) => void;
  onGcnContext: (r: ContractRecord) => void;
  onDeleteConfirm: (r: ContractRecord) => void;
  onPrintCertificate?: (contractId: number) => void;
  onNavigatePrint: () => void;
  onAssignGcn: (r: ContractRecord) => void;
};

export function ContractMobileCard({
  contract,
  isSelected,
  canEdit,
  canDelete,
  readOnly = false,
  onOpenDetail,
  onToggleOne,
  onWordPreview,
  onGcnContext,
  onDeleteConfirm,
  onPrintCertificate,
  onNavigatePrint,
  onAssignGcn,
}: Props) {
  const exp = getExpiryStatus(contract.ngay_ket_thuc);
  const partnerName = contract.ten_bang_hieu || contract.don_vi_ten || '—';
  const legalName = contract.ten_bang_hieu && contract.don_vi_ten ? contract.don_vi_ten : '';
  const owner = (contract as any).ten_nhan_vien || (contract as any).employee_name || '';
  const vat = (contract.royalty_amount_before_vat ?? 0) > 0
    ? Math.round((contract.royalty_amount_before_vat ?? 0) * 0.08)
    : 0;

  const handleCardOpen = (e: React.MouseEvent) => {
    // Avoid swallowing clicks on checkbox / actions.
    const target = e.target as HTMLElement;
    if (target.closest('[data-card-control="1"]')) return;
    if (readOnly) return;
    onOpenDetail(contract.id);
  };

  const handleKeyOpen = (e: React.KeyboardEvent) => {
    if (readOnly) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenDetail(contract.id);
    }
  };

  const gcnHasCert = !!contract.gcn_certificate_id && !!contract.gcn_certificate_no;
  const gcnNeedsNumber =
    (!!contract.gcn_certificate_id || (!!contract.gcn_status && contract.gcn_status !== 'no_gcn')) &&
    !contract.gcn_certificate_no;

  return (
    <article
      className={`contract-mobile-card${isSelected ? ' is-selected' : ''}`}
      aria-label={`Hợp đồng ${contract.contract_no}`}
    >
      <div className="contract-mobile-card__header">
        <div className="contract-mobile-card__select" data-card-control="1">
          <Checkbox
            checked={isSelected}
            onChange={() => onToggleOne(contract.id)}
            ariaLabel={`Chọn hợp đồng ${contract.contract_no}`}
          />
        </div>
        <div className="contract-mobile-card__identity" data-card-control="1">
          <div
            className={`contract-mobile-card__number${readOnly ? '' : ' contract-mobile-card__number--interactive'}`}
            onClick={handleCardOpen}
            role={readOnly ? undefined : 'button'}
            tabIndex={readOnly ? -1 : 0}
            onKeyDown={handleKeyOpen}
          >
            {contract.contract_no || '—'}
          </div>
          <div className="contract-mobile-card__partner" title={partnerName}>
            {partnerName}
          </div>
        </div>
        <div className="contract-mobile-card__actions" data-card-control="1">
          {!readOnly && (
            <RowActionsMenu
              actions={[
                { label: 'Xem chi tiết', icon: <EyeIcon className="h-4 w-4" />, onClick: () => onOpenDetail(contract.id) },
                {
                  label: 'Chỉnh sửa',
                  icon: <PencilIcon className="h-4 w-4" />,
                  onClick: () => onOpenDetail(contract.id),
                  disabled: !canEdit,
                  disabledReason: !canEdit ? 'Không có quyền chỉnh sửa' : undefined,
                },
                { label: 'Xuất Word', icon: <FileDownIcon className="h-4 w-4" />, onClick: () => onWordPreview(contract) },
                { label: 'Xem dữ liệu GCN', icon: <AwardIcon className="h-4 w-4" />, onClick: () => onGcnContext(contract) },
                {
                  label: 'Tạo GCN',
                  icon: <AwardIcon className="h-4 w-4" />,
                  onClick: () =>
                    onPrintCertificate ? onPrintCertificate(contract.id) : onNavigatePrint(),
                },
                { label: 'In / Gửi', icon: <PrinterIcon className="h-4 w-4" />, onClick: onNavigatePrint },
                {
                  divider: true,
                  label: 'Xóa',
                  icon: <Trash2Icon className="h-4 w-4" />,
                  tone: 'danger',
                  onClick: () => onDeleteConfirm(contract),
                  disabled: !canDelete,
                  disabledReason: !canDelete ? 'Không có quyền xóa' : undefined,
                },
              ]}
            />
          )}
        </div>
      </div>

      <div
        className="contract-mobile-card__address"
        onClick={handleCardOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenDetail(contract.id);
          }
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-3.5 w-3.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
        <span
          className={`contract-mobile-card__address-text${
            contract.dia_chi_su_dung ? '' : ' contract-mobile-card__address-text--empty'
          }`}
        >
          {contract.dia_chi_su_dung || 'Chưa có địa chỉ sử dụng'}
        </span>
      </div>

      <dl className="contract-mobile-card__meta">
        <div className="contract-mobile-card__meta-row">
          <dt>Lĩnh vực</dt>
          <dd>{contract.linh_vuc_hien_thi || '—'}</dd>
        </div>
        <div className="contract-mobile-card__meta-row">
          <dt>Ngày lập</dt>
          <dd className="mono">{formatDate(contract.ngay_lap_hop_dong) || '—'}</dd>
        </div>
        <div className="contract-mobile-card__meta-row">
          <dt>Hiệu lực</dt>
          <dd className="mono">
            {formatDate(contract.ngay_bat_dau) || '—'} → {formatDate(contract.ngay_ket_thuc) || '—'}
          </dd>
        </div>
        <div className="contract-mobile-card__meta-row">
          <dt>Phụ trách</dt>
          <dd>{owner || <span style={{ color: '#d4d4d8' }}>—</span>}</dd>
        </div>
        {legalName && (
          <div className="contract-mobile-card__meta-row" style={{ gridColumn: '1 / -1' }}>
            <dt>Pháp nhân</dt>
            <dd>{legalName}</dd>
          </div>
        )}
      </dl>

      <div className="contract-mobile-card__footer">
        <div>
          <div className="contract-mobile-card__value">
            {formatCurrency(contract.royalty_amount_before_vat ?? 0)}
          </div>
          {vat > 0 && (
            <div className="contract-mobile-card__value-sub">Thuế GTGT ≈ {formatCurrency(vat)}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {exp.status === 'active' && <StatusBadge tone="success" dot compact>Còn hiệu lực</StatusBadge>}
          {exp.status === 'expiring' && (
            <StatusBadge tone="warning" dot compact>
              Sắp hết · {exp.daysLeft}d
            </StatusBadge>
          )}
          {exp.status === 'expired' && <StatusBadge tone="danger" dot compact>Hết hạn</StatusBadge>}
          {gcnHasCert ? (
            <button
              type="button"
              data-card-control="1"
              title={`GCN số ${contract.gcn_certificate_no} — nhấn để in`}
              onClick={(e) => {
                e.stopPropagation();
                if (onPrintCertificate && contract.gcn_certificate_id) onPrintCertificate(contract.gcn_certificate_id);
                else onNavigatePrint();
              }}
              className="contract-mobile-card__gcn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                color: '#4d7c0f',
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
              }}
            >
              <AwardIcon className="h-3 w-3" />
              GCN {contract.gcn_certificate_no}
            </button>
          ) : gcnNeedsNumber ? (
            <button
              type="button"
              data-card-control="1"
              title="Nhập số GCN"
              onClick={(e) => {
                e.stopPropagation();
                onAssignGcn(contract);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: '#71717a',
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fbbf24' }} />
              GCN chưa cấp số
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}