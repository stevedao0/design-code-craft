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
import { StatusBadge } from '../app-ui/StatusBadge';
import { RowActionsMenu } from '../app-ui/RowActionsMenu';
import {
  EnterpriseAmountCell,
  EnterpriseContractNoCell,
} from '../enterprise';
import type { ContractRecord } from '../../data/contractRecords';
import { getExpiryStatus } from '../../data/contractRecords';
import { formatDate } from '../../lib/format';

type Density = 'compact' | 'mid' | 'detail';

interface DensityStyle {
  row: string;
  firstCell: string;
  cell: string;
  badgeLine: string;
  customerLines: string;
  addressLines: string;
  secondaryLines: string;
}

const DENSITY: Record<Density, DensityStyle> = {
  compact: {
    row: 'h-10',
    firstCell: 'pl-3 pr-1.5 py-1',
    cell: 'px-2 py-1',
    badgeLine: 'gap-0.5',
    customerLines: 'line-clamp-1',
    addressLines: 'line-clamp-1',
    secondaryLines: 'line-clamp-1',
  },
  mid: {
    row: 'h-[58px]',
    firstCell: 'pl-4 pr-2 py-2',
    cell: 'px-3 py-2',
    badgeLine: 'gap-1',
    customerLines: 'line-clamp-2',
    addressLines: 'line-clamp-2',
    secondaryLines: 'line-clamp-1',
  },
  detail: {
    row: 'h-[76px]',
    firstCell: 'pl-4 pr-2 py-2.5',
    cell: 'px-4 py-2.5',
    badgeLine: 'gap-1.5',
    customerLines: 'line-clamp-2',
    addressLines: 'line-clamp-3',
    secondaryLines: 'line-clamp-2',
  },
};

function formatContractNoDisplay(contractNo: string): {
  full: string;
  primary: string;
  suffix: string;
} {
  const value = String(contractNo || '').trim();
  const parts = value.split('/');
  const primary = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : value;
  const rawTail = parts.length >= 3 ? parts.slice(2).join('/') : '';
  const suffix = rawTail.replace(/^(HĐ[A-Z]+-?)/i, '');
  return { full: value, primary, suffix };
}

type Props = {
  contracts: ContractRecord[];
  selected: Set<number>;
  density: Density;
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

export function ContractsDesktopTable({
  contracts,
  selected,
  density,
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
  const DS = DENSITY[density];
  // List-only mode: no row click → detail, no actions column, no chevron.
  const rowInteractive = !readOnly;
  const showActions = !readOnly && (canEdit || canDelete);

  return (
    <div className={`vc-contracts-table-scroll vc-density-${density} contracts-desktop-table`}>
      <table className="w-full border-collapse text-sm">
        <colgroup>
          <col className="w-9" />
          <col className="vc-col-contract-no" />
          <col className="vc-col-customer" />
          <col className="vc-col-term" />
          <col className="vc-col-status" />
          <col className="vc-col-amount" />
          <col className="vc-col-owner" />
          {showActions && <col className="vc-col-actions" />}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-gradient-to-r from-zinc-50 to-zinc-50/80 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
            <th className={`w-9 ${DS.firstCell} text-left pl-4 pr-2 py-3`}>
              <Checkbox checked={allSelected} indeterminate={someSelected} onChange={onToggleAll} ariaLabel="Chọn tất cả" />
            </th>
            <th className={`${DS.cell} text-left text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap py-3`}>Số HĐ</th>
            <th className={`${DS.cell} text-left text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap py-3`}>Đối tác & Địa chỉ</th>
            <th className={`${DS.cell} text-left text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap py-3`}>Thời hạn</th>
            <th className={`${DS.cell} text-left text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap py-3`}>Trạng thái</th>
            <th className={`${DS.cell} text-right text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap py-3`}>Giá trị</th>
            <th className={`${DS.cell} text-left text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap py-3`}>Phụ trách</th>
            {showActions && <th className="vc-col-actions pl-1 text-left vc-col-actions-sticky py-3" />}
          </tr>
        </thead>
        <tbody>
          {contracts.map((r) => {
            const isSelected = selected.has(r.id);
            const exp = getExpiryStatus(r.ngay_ket_thuc);

            return (
              <tr
                key={r.id}
                onClick={rowInteractive ? () => onOpenDetail(r.id) : undefined}
                className={`${DS.row} transition-colors vc-table-row ${isSelected ? 'vc-row-selected' : ''} ${rowInteractive ? 'cursor-pointer' : ''}`}
              >
                <td className={`${DS.firstCell} align-top relative`}>
                  <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-lime-500 via-lime-400 to-lime-600 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}`} />
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onChange={() => onToggleOne(r.id)} ariaLabel={`Chọn ${r.contract_no}`} />
                  </div>
                </td>

                <td className={`${DS.cell} align-top pr-4`}>
                  {rowInteractive ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenDetail(r.id); }}
                      title={r.contract_no}
                      className="block text-left"
                    >
                      {(() => {
                        const { primary, suffix, full } = formatContractNoDisplay(r.contract_no);
                        return (
                          <EnterpriseContractNoCell
                            primary={primary}
                            secondary={suffix && suffix !== full ? suffix : undefined}
                          />
                        );
                      })()}
                    </button>
                  ) : (
                    <div className="block text-left" title={r.contract_no}>
                      {(() => {
                        const { primary, suffix, full } = formatContractNoDisplay(r.contract_no);
                        return (
                          <EnterpriseContractNoCell
                            primary={primary}
                            secondary={suffix && suffix !== full ? suffix : undefined}
                          />
                        );
                      })()}
                    </div>
                  )}
                </td>

                <td className={`${DS.cell} align-top`}>
                  <div className={DS.customerLines}>
                    <div className="text-[13px] font-semibold leading-snug text-zinc-800 line-clamp-2" title={r.ten_bang_hieu || r.don_vi_ten}>
                      {r.ten_bang_hieu || r.don_vi_ten}
                    </div>
                    {(r.linh_vuc_hien_thi || r.don_vi_ten) && (
                      <div className="text-[11.5px] text-zinc-500 leading-snug mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {r.linh_vuc_hien_thi && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium">{r.linh_vuc_hien_thi}</span>
                        )}
                        {r.ten_bang_hieu && r.don_vi_ten ? (
                          <span className="truncate max-w-[160px]" title={r.don_vi_ten}>{r.don_vi_ten}</span>
                        ) : null}
                      </div>
                    )}
                    <div className="text-[11.5px] text-zinc-600 leading-snug mt-1 flex items-start gap-1.5">
                      <svg
                        aria-hidden="true"
                        className="h-3.5 w-3.5 mt-[2px] flex-shrink-0 text-lime-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                      <span className={`${DS.addressLines} min-w-0 flex-1`} title={r.dia_chi_su_dung || ''}>
                        {r.dia_chi_su_dung || <span className="italic text-zinc-400">Chưa có địa chỉ sử dụng</span>}
                      </span>
                      {Array.isArray((r as any).music_usage_areas) && (r as any).music_usage_areas.length > 1 && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-lime-50 text-lime-700 text-[10.5px] font-semibold flex-shrink-0 cursor-help"
                          title={
                            ((r as any).music_usage_areas as any[])
                              .map((a, idx) => `${idx + 1}. ${a.area_name || a.location_name || `Khu vực ${idx + 1}`}${a.address_line ? ' — ' + [a.address_line, a.ward, a.province].filter(Boolean).join(', ') : ''}`)
                              .join('\n')
                          }
                        >
                          +{(r as any).music_usage_areas.length - 1} khu vực
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                <td className={`${DS.cell} align-top`}>
                  <div className={`tabular-nums text-[12.5px] font-medium leading-snug whitespace-nowrap ${
                    exp.status === 'active' ? 'text-lime-600' :
                    exp.status === 'expiring' ? 'text-amber-600' :
                    'text-rose-500'
                  }`}>
                    {formatDate(r.ngay_bat_dau)} → {formatDate(r.ngay_ket_thuc)}
                  </div>
                  <div className="text-[10.5px] text-zinc-400 mt-0.5 whitespace-nowrap">
                    Lập {formatDate(r.ngay_lap_hop_dong)}
                    {exp.status === 'expiring' && <span className="ml-1 font-semibold text-amber-600">· còn {exp.daysLeft}d</span>}
                  </div>
                </td>

                <td className={`${DS.cell} align-top pr-4`}>
                  <div className={DS.badgeLine}>
                    {exp.status === 'active' && <StatusBadge tone="success" dot compact>Còn hiệu lực</StatusBadge>}
                    {exp.status === 'expiring' && <StatusBadge tone="warning" dot compact>Sắp hết · {exp.daysLeft}d</StatusBadge>}
                    {exp.status === 'expired' && <StatusBadge tone="danger" dot compact>Hết hạn</StatusBadge>}
                  </div>
                  <div className="mt-1.5">
                    {r.gcn_certificate_id && r.gcn_certificate_no ? (
                      <button
                        type="button"
                        title={`GCN số ${r.gcn_certificate_no} — nhấn để in`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onPrintCertificate) onPrintCertificate(r.gcn_certificate_id!);
                          else onNavigatePrint();
                        }}
                        className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-lime-600 hover:text-lime-800 transition-colors"
                      >
                        <AwardIcon className="h-3 w-3" />
                        GCN {r.gcn_certificate_no}
                      </button>
                    ) : (r.gcn_certificate_id || (r.gcn_status && r.gcn_status !== 'no_gcn')) && !r.gcn_certificate_no ? (
                      <button
                        type="button"
                        title="Nhập số GCN"
                        onClick={(e) => { e.stopPropagation(); onAssignGcn(r); }}
                        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-zinc-500 hover:text-zinc-700 transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        GCN chưa cấp số
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Tạo GCN cho hợp đồng này"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onPrintCertificate) onPrintCertificate(r.id);
                          else onNavigatePrint();
                        }}
                        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-zinc-400 hover:text-lime-600 transition-colors"
                      >
                        <AwardIcon className="h-3 w-3" />
                        Tạo GCN
                      </button>
                    )}
                  </div>
                </td>

                <td className={`${DS.cell} align-top text-right`}>
                  <div className="tabular-nums text-[13px] font-semibold text-zinc-800 whitespace-nowrap">
                    <EnterpriseAmountCell amount={r.royalty_amount_before_vat} />
                  </div>
                  {r.royalty_amount_before_vat > 0 && (
                    <div className="text-[10.5px] text-zinc-400 mt-0.5 whitespace-nowrap">
                      Thuế GTGT {(r.royalty_amount_before_vat * 0.08).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} ₫
                    </div>
                  )}
                </td>

                <td className={`${DS.cell} align-top`}>
                  <div className="text-[12px] text-zinc-700 truncate max-w-[140px]" title={(r as any).ten_nhan_vien || (r as any).employee_name || ''}>
                    {(r as any).ten_nhan_vien || (r as any).employee_name || <span className="text-zinc-300">—</span>}
                  </div>
                </td>

                {showActions && (
                <td className="vc-col-actions pr-4 pl-1 align-top text-right vc-col-actions-sticky">
                  <RowActionsMenu
                    actions={[
                      { label: 'Xem chi tiết', icon: <EyeIcon className="h-4 w-4" />, onClick: () => onOpenDetail(r.id) },
                      { label: 'Chỉnh sửa', icon: <PencilIcon className="h-4 w-4" />, onClick: () => onOpenDetail(r.id), disabled: !canEdit, disabledReason: !canEdit ? 'Không có quyền chỉnh sửa' : undefined },
                      { label: 'Xuất Word', icon: <FileDownIcon className="h-4 w-4" />, onClick: () => onWordPreview(r) },
                      { label: 'Xem dữ liệu GCN', icon: <AwardIcon className="h-4 w-4" />, onClick: () => onGcnContext(r) },
                      { label: 'Tạo GCN', icon: <AwardIcon className="h-4 w-4" />, onClick: () => onPrintCertificate ? onPrintCertificate(r.id) : onNavigatePrint() },
                      { label: 'In / Gửi', icon: <PrinterIcon className="h-4 w-4" />, onClick: () => onNavigatePrint() },
                      { divider: true, label: 'Xóa', icon: <Trash2Icon className="h-4 w-4" />, tone: 'danger', onClick: () => onDeleteConfirm(r), disabled: !canDelete, disabledReason: !canDelete ? 'Không có quyền xóa' : undefined },
                    ]}
                  />
                </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}