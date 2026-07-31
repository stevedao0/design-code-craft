import React from 'react';
import { Button } from './Button';
import { CompletionChecklist } from './CompletionChecklist';
import { formatCurrency, formatDate } from '../../lib/format';
import { SaveIcon, EyeIcon, PlusCircleIcon } from 'lucide-react';
type SummaryData = {
  contractNo: string;
  contractType: string;       // e.g. "Ký mới", "Tái ký", "Hợp đồng khung"
  partner: string;
  brand: string;
  field: string;
  rooms: number;
  startDate: string;
  endDate: string;
  totalValue: number;
  assignee: string;
  templateName?: string;     // e.g. "export_template_contract_karaoke.docx"
};
export function ContractSummaryPanel({
  data,
  checklist,
  onSaveDraft,
  onPreview,
  onCreate,
  isDirty,
  createLabel = 'Tạo hợp đồng',
  safetyNote










}: {data: SummaryData;checklist: {label: string;completed: boolean;}[];onSaveDraft: () => void;onPreview: () => void;onCreate: () => void;isDirty: boolean;createLabel?: string;safetyNote?: string;}) {
  const allComplete = checklist.every((c) => c.completed);
  return (
    <aside className="sticky top-6 space-y-4">
      {/* Main summary card */}
      <div className="relative bg-white rounded-2xl ring-1 ring-zinc-900/[0.06] shadow-[0_1px_2px_rgba(15,15,25,0.04),0_2px_6px_rgba(15,15,25,0.03)] overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
        
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-white to-zinc-50/40" />
        
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-600/50 to-transparent" />

        <div className="relative">
          <header className="px-4 py-3 border-b border-zinc-100/80">
            <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
              Tóm tắt hợp đồng
            </h3>
            {isDirty &&
            <span className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-600/15">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Có thay đổi chưa lưu
              </span>
            }
          </header>

          <div className="p-4 space-y-3">
            <SummaryField label="Số hợp đồng" value={data.contractNo} mono />
            <SummaryField label="Loại HĐ" value={data.contractType || '—'} />
            <SummaryField label="Đơn vị" value={data.partner} />
            <SummaryField label="Bảng hiệu" value={data.brand} />
            <SummaryField label="Lĩnh vực" value={data.field} />
            <SummaryField label="Số phòng" value={`${data.rooms} phòng`} mono />
            <SummaryField
              label="Hiệu lực"
              value={`${formatDate(data.startDate)} → ${formatDate(data.endDate)}`}
              mono />
            <SummaryField
              label="Tổng tiền"
              value={formatCurrency(data.totalValue)}
              mono
              highlight />
            <SummaryField label="Người thực hiện" value={data.assignee} />
            {data.templateName && (
              <SummaryField
                label="Template"
                value={data.templateName}
                mono
                className="text-xs text-zinc-500"
              />
            )}
          </div>
        </div>
      </div>

      {/* Checklist card */}
      <div className="relative bg-white rounded-2xl ring-1 ring-zinc-900/[0.06] shadow-[0_1px_2px_rgba(15,15,25,0.04),0_2px_6px_rgba(15,15,25,0.03)] overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
        
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-white to-zinc-50/40" />
        

        <div className="relative p-4">
          <CompletionChecklist items={checklist} />
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          variant="primary"
          size="lg"
          leftIcon={<PlusCircleIcon className="h-4 w-4" />}
          onClick={onCreate}
          disabled={!allComplete}
          className="w-full">
          
          {createLabel}
        </Button>
        {safetyNote &&
        <p className="text-[11px] leading-relaxed text-amber-700 bg-amber-50 ring-1 ring-amber-600/15 rounded-lg px-3 py-2">
            {safetyNote}
          </p>
        }
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="md"
            leftIcon={<SaveIcon className="h-3.5 w-3.5" />}
            onClick={onSaveDraft}
            className="w-full">
            
            Lưu nháp
          </Button>
          <Button
            variant="secondary"
            size="md"
            leftIcon={<EyeIcon className="h-3.5 w-3.5" />}
            onClick={onPreview}
            className="w-full">
            
            Xem trước
          </Button>
        </div>
      </div>
    </aside>);

}
function SummaryField({
  label,
  value,
  mono,
  highlight





}: {label: string;value: string;mono?: boolean;highlight?: boolean;}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500">
        {label}
      </span>
      <span
        className={`text-sm leading-snug break-words ${mono ? 'font-mono tabular-nums' : ''} ${highlight ? 'font-semibold text-lime-700' : 'text-zinc-900 font-medium'}`}>
        
        {value}
      </span>
    </div>);

}
