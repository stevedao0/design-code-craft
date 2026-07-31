import React, { useEffect } from 'react';
import {
  XIcon,
  PrinterIcon,
  AwardIcon,
  HashIcon,
  FileTextIcon,
  BuildingIcon,
  MapPinIcon,
  CalendarIcon,
  HistoryIcon } from
'lucide-react';
import {
  CertificateRecord,
  CERTIFICATE_STATUS_LABEL } from
'../../data/certificateRecords';
import { StatusBadge } from './StatusBadge';
import { Button } from './Button';
import { formatDate } from '../../lib/format';
export function CertificateQuickView({
  record,
  onClose,
  onUpdateNumber,
  onPrintFinal
}: {record: CertificateRecord | null;onClose: () => void;onUpdateNumber?: (r: CertificateRecord) => void;onPrintFinal?: (r: CertificateRecord) => void;}) {
  useEffect(() => {
    if (!record) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [record, onClose]);
  if (!record) return null;
  const hasNumber = !!record.certificate_no;
  const statusLabel = CERTIFICATE_STATUS_LABEL[record.status];
  const statusTone =
    record.status === 'final_printed' ? 'success' : 'neutral';
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        style={{
          animation: 'fadeIn 180ms ease-out'
        }}
        onClick={onClose} />
      
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Chi tiết GCN ${record.certificate_no ?? 'chưa cấp số'}`}
        className="absolute right-0 top-0 bottom-0 w-full max-w-[480px] bg-zinc-50 shadow-2xl shadow-zinc-950/40 flex flex-col"
        style={{
          animation: 'slideInR 240ms cubic-bezier(0.32,0.72,0,1)'
        }}>
        
        <header className="relative overflow-hidden text-white">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
              'linear-gradient(135deg, #0a0a1a 0%, #312e81 35%, #6d28d9 100%)'
            }} />
          
          <svg
            aria-hidden
            viewBox="0 0 200 200"
            className="absolute -bottom-8 -right-8 h-44 w-44 opacity-[0.08] text-white"
            fill="none">
            
            <circle
              cx="100"
              cy="100"
              r="78"
              stroke="currentColor"
              strokeWidth="2" />
            
            <circle
              cx="100"
              cy="100"
              r="62"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 4" />
            
            <text
              x="100"
              y="106"
              textAnchor="middle"
              fontFamily="serif"
              fontSize="16"
              fill="currentColor"
              fontWeight="600"
              letterSpacing="2">
              
              GCN
            </text>
          </svg>
          <div
            aria-hidden
            className="absolute -top-12 -left-10 h-44 w-44 rounded-full"
            style={{
              background:
              'radial-gradient(circle, rgba(168,85,247,0.4) 0%, transparent 65%)',
              filter: 'blur(20px)'
            }} />
          
          <div className="relative px-5 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                <AwardIcon className="h-5 w-5" />
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/70 font-semibold">
                    Certificate quick view
                  </div>
                  <StatusBadge tone={statusTone}>
                    {statusLabel}
                  </StatusBadge>
                </div>
                
                <h2 className="mt-2 text-xl font-semibold tracking-tight leading-tight">
                  {record.organization_name || 'Chưa có tên đơn vị'}
                </h2>
                
                <div className="mt-2 flex items-center gap-2 text-sm text-white/80 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/10">
                    <HashIcon className="h-3.5 w-3.5" />
                    {record.certificate_no || 'Chưa cấp số'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/10">
                    <FileTextIcon className="h-3.5 w-3.5" />
                    {record.contract_no || '—'}
                  </span>
                </div>
              </div>
              
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/90 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/15 hover:text-white"
                aria-label="Đóng">
                <XIcon className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto">
          <section className="px-5 py-4 border-b border-zinc-200 bg-white">
            <div className="grid grid-cols-2 gap-3">
              <QuickMetric
                icon={<HashIcon className="h-4 w-4" />}
                label="Số GCN"
                value={record.certificate_no || 'Chưa cấp số'}
                emphasize={!hasNumber} />
              <QuickMetric
                icon={<PrinterIcon className="h-4 w-4" />}
                label="Số lần in"
                value={String(record.print_count || 0)} />
              <QuickMetric
                icon={<CalendarIcon className="h-4 w-4" />}
                label="Ngày cấp"
                value={record.certificate_issue_date ? formatDate(record.certificate_issue_date) : '—'} />
              <QuickMetric
                icon={<HistoryIcon className="h-4 w-4" />}
                label="In gần nhất"
                value={record.printed_at ? formatDate(record.printed_at) : 'Chưa in'} />
            </div>
          </section>
          
          <section className="px-5 py-4 space-y-5">
            <PanelCard title="Thông tin đơn vị">
              <InfoItem icon={<BuildingIcon className="h-4 w-4" />} label="Đơn vị" value={record.organization_name} />
              <InfoItem icon={<BuildingIcon className="h-4 w-4" />} label="Bảng hiệu" value={record.business_sign_name || '—'} />
              <InfoItem icon={<MapPinIcon className="h-4 w-4" />} label="Địa chỉ" value={record.address || '—'} multiline />
              <InfoItem icon={<MapPinIcon className="h-4 w-4" />} label="Điểm sử dụng" value={record.business_location || '—'} multiline />
            </PanelCard>
            
            <PanelCard title="Thông tin hợp đồng & hiệu lực">
              <InfoItem icon={<FileTextIcon className="h-4 w-4" />} label="Số hợp đồng" value={record.contract_no || '—'} mono />
              <InfoItem icon={<CalendarIcon className="h-4 w-4" />} label="Hiệu lực từ" value={record.effective_from ? formatDate(record.effective_from) : '—'} />
              <InfoItem icon={<CalendarIcon className="h-4 w-4" />} label="Hiệu lực đến" value={record.effective_to ? formatDate(record.effective_to) : '—'} />
            </PanelCard>
            
            <PanelCard title="Theo dõi in ấn">
              <InfoItem icon={<PrinterIcon className="h-4 w-4" />} label="Trạng thái" value={statusLabel} />
              <InfoItem icon={<PrinterIcon className="h-4 w-4" />} label="Số lần in" value={record.print_count ? `${record.print_count} lần` : '0'} />
              <InfoItem icon={<HistoryIcon className="h-4 w-4" />} label="Lần in gần nhất" value={record.last_printed_at ? formatDate(record.last_printed_at) : '—'} />
              <InfoItem icon={<HistoryIcon className="h-4 w-4" />} label="Lý do in gần nhất" value={record.last_print_reason || '—'} multiline />
            </PanelCard>
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-zinc-200 bg-white flex items-center gap-2 flex-wrap">
          {!hasNumber &&
          <Button
            variant="primary"
            leftIcon={<HashIcon className="h-4 w-4" />}
            onClick={() => onUpdateNumber?.(record)}
            disabled={!onUpdateNumber}
            title="GCN-P1 read-only: chua bat cap so GCN">
              Cập nhật số GCN
            </Button>
          }
          {hasNumber && record.status === 'draft' &&
          <Button
            variant="primary"
            leftIcon={<PrinterIcon className="h-4 w-4" />}
            onClick={() => onPrintFinal?.(record)}
            disabled={!onPrintFinal}
            title="In chính thức GCN">
              In chính thức
            </Button>
          }
          {record.print_count > 1 &&
          <Button
            variant="secondary"
            leftIcon={<PrinterIcon className="h-4 w-4" />}
            onClick={() => onPrintFinal?.(record)}
            disabled={!onPrintFinal}
            title="In lại GCN">
              In lại
            </Button>
          }
          {hasNumber && record.status !== 'draft' &&
          <Button
            variant="secondary"
            leftIcon={<HashIcon className="h-4 w-4" />}
            onClick={() => onUpdateNumber?.(record)}
            disabled={!onUpdateNumber}
            title="GCN-P1 read-only: chua bat sua so GCN">
              Sửa số GCN
            </Button>
          }
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </footer>

        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideInR { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `}</style>
      </aside>
    </div>);
}

function QuickMetric({
  icon,
  label,
  value,
  emphasize = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        <span className="text-zinc-400">{icon}</span>
        {label}
      </div>
      <div className={`mt-2 text-[15px] font-semibold leading-tight ${emphasize ? 'text-amber-700' : 'text-zinc-900'}`}>
        {value}
      </div>
    </div>);
}

function PanelCard({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50/60">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      </div>
      <div className="px-4 py-2 divide-y divide-zinc-100">{children}</div>
    </section>);
}

function InfoItem({
  icon,
  label,
  value,
  mono = false,
  multiline = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="py-3 flex gap-3 items-start">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          {label}
        </div>
        <div className={`mt-1 text-[14px] leading-6 ${mono ? 'font-mono text-[13px]' : 'font-medium'} ${multiline ? 'whitespace-pre-wrap text-zinc-700' : 'text-zinc-900 truncate'}`}>
          {value}
        </div>
      </div>
    </div>);
}
