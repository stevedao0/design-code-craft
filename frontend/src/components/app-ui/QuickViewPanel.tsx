import React, { useEffect } from 'react';
import {
  XIcon,
  PencilIcon,
  AwardIcon,
  MapPinIcon,
  WalletIcon,
  BuildingIcon,
  TagIcon,
  CalendarPlusIcon,
  PlayCircleIcon,
  CalendarXIcon } from
'lucide-react';
import {
  ContractRecord,
  getExpiryStatus,
  RENEWAL_LABEL } from
'../../data/contractRecords';
import { StatusBadge } from './StatusBadge';
import { Button } from './Button';
import { formatCurrency, formatDate, formatShortVND } from '../../lib/format';
export function QuickViewPanel({
  record,
  onClose,
  onEdit,
  onCreateGcn





}: {record: ContractRecord | null;onClose: () => void;onEdit?: (r: ContractRecord) => void;onCreateGcn?: (r: ContractRecord) => void;}) {
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
  const expiry = getExpiryStatus(record.ngay_ket_thuc);
  const renewalKey = record.renewal_status ?? 'UNKNOWN';
  const renewalTone =
  renewalKey === 'NEW' ?
  'violet' :
  renewalKey === 'PENDING_RENEWAL' ?
  'orange' :
  renewalKey === 'RENEWED' ?
  'success' :
  'neutral';
  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        style={{
          animation: 'fadeIn 180ms ease-out'
        }}
        onClick={onClose} />
      
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Chi tiết hợp đồng ${record.contract_no}`}
        className="absolute right-0 top-0 bottom-0 w-full max-w-[480px] bg-zinc-50 shadow-2xl shadow-zinc-950/40 flex flex-col"
        style={{
          animation: 'slideInR 240ms cubic-bezier(0.32,0.72,0,1)'
        }}>
        
        {/* Premium gradient header */}
        <header className="relative overflow-hidden text-white">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
              'linear-gradient(135deg, #0a0a1a 0%, #1e1b4b 35%, #4c1d95 100%)'
            }} />
          
          <div
            aria-hidden
            className="absolute -top-16 -right-16 h-56 w-56 rounded-full"
            style={{
              background:
              'radial-gradient(circle, rgba(168,85,247,0.4) 0%, transparent 65%)',
              filter: 'blur(20px)'
            }} />
          
          <div aria-hidden className="absolute inset-0 dot-grid opacity-50" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          

          <div className="relative px-5 py-5 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
                Hợp đồng
              </p>
              <h2 className="mt-1.5 font-mono text-lg sm:text-xl font-semibold text-white tracking-tight break-all leading-tight">
                {record.contract_no}
              </h2>
              <p className="mt-1.5 text-[13px] text-amber-100/85 line-clamp-1">
                {record.don_vi_ten}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {expiry.status === 'active' &&
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-lime-400/15 text-lime-200 ring-1 ring-inset ring-lime-400/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
                    Còn hiệu lực · {expiry.daysLeft} ngày
                  </span>
                }
                {expiry.status === 'expiring' &&
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Sắp hết · {expiry.daysLeft} ngày
                  </span>
                }
                {expiry.status === 'expired' &&
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-400/15 text-rose-200 ring-1 ring-inset ring-rose-400/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    Đã hết hạn
                  </span>
                }
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${renewalKey === 'NEW' ? 'bg-amber-500/15 text-amber-200 ring-amber-500/30' : renewalKey === 'PENDING_RENEWAL' ? 'bg-orange-400/15 text-orange-200 ring-orange-400/30' : renewalKey === 'RENEWED' ? 'bg-lime-400/15 text-lime-200 ring-lime-400/30' : 'bg-white/10 text-zinc-300 ring-white/15'}`}>
                  
                  {RENEWAL_LABEL[renewalKey]}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white transition-colors shrink-0 ring-1 ring-inset ring-white/10">
              
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3">
          {/* Money block */}
          <MoneyBlock
            value={record.so_tien_value}
            renewalLabel={RENEWAL_LABEL[renewalKey]}
            renewalTone={renewalTone} />
          

          {/* Đơn vị */}
          <SectionCard
            title="Đơn vị"
            icon={<BuildingIcon className="h-3.5 w-3.5" />}>
            
            <div className="grid grid-cols-1 gap-3">
              <Field label="Tên đơn vị" value={record.don_vi_ten} />
              {record.ten_bang_hieu &&
              <Field label="Tên bảng hiệu" value={record.ten_bang_hieu} />
              }
            </div>
          </SectionCard>

          {/* Địa chỉ */}
          <SectionCard
            title="Địa chỉ sử dụng âm nhạc"
            icon={<MapPinIcon className="h-3.5 w-3.5" />}>
            
            <p className="text-sm text-zinc-700 leading-relaxed">
              {record.dia_chi_su_dung}
            </p>
          </SectionCard>

          {/* Phân loại */}
          <SectionCard
            title="Phân loại"
            icon={<TagIcon className="h-3.5 w-3.5" />}>
            
            <div className="flex flex-wrap gap-1.5">
              <Chip primary>{record.linh_vuc_hien_thi}</Chip>
              {record.loai_hinh_karaoke &&
              <Chip>
                  <span>{record.loai_hinh_karaoke}</span>
                  {record.tong_so_phong != null &&
                <>
                      <span className="text-zinc-400 mx-1">·</span>
                      <span className="font-semibold tabular-nums">
                        {record.tong_so_phong} phòng
                      </span>
                    </>
                }
                </Chip>
              }
              <Chip>
                <span className="text-zinc-500 mr-1">Mã vùng:</span>
                <span className="font-semibold">{record.region_code}</span>
              </Chip>
              <Chip>
                <span className="text-zinc-500 mr-1">Mã quyền:</span>
                <span className="font-semibold">{record.field_code}</span>
              </Chip>
            </div>
          </SectionCard>

          {/* Timeline */}
          <SectionCard
            title="Mốc thời gian"
            icon={<CalendarPlusIcon className="h-3.5 w-3.5" />}>
            
            <Timeline
              items={[
              {
                label: 'Ngày lập',
                date: record.ngay_lap_hop_dong,
                tone: 'indigo',
                icon: <CalendarPlusIcon className="h-3 w-3" />
              },
              {
                label: 'Hiệu lực từ',
                date: record.ngay_bat_dau,
                tone: 'violet',
                icon: <PlayCircleIcon className="h-3 w-3" />
              },
              {
                label: 'Hiệu lực đến',
                date: record.ngay_ket_thuc,
                tone:
                expiry.status === 'expired' ?
                'rose' :
                expiry.status === 'expiring' ?
                'amber' :
                'emerald',
                icon: <CalendarXIcon className="h-3 w-3" />
              }]
              } />
            
          </SectionCard>
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-zinc-200 bg-white flex items-center gap-2">
          <Button
            variant="primary"
            leftIcon={<PencilIcon className="h-4 w-4" />}
            onClick={() => onEdit?.(record)}>
            
            Chỉnh sửa
          </Button>
          <Button
            variant="secondary"
            leftIcon={<AwardIcon className="h-4 w-4" />}
            onClick={() => onCreateGcn?.(record)}>
            
            Tạo GCN
          </Button>
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
function SectionCard({
  title,
  icon,
  children




}: {title: string;icon?: React.ReactNode;children: React.ReactNode;}) {
  return (
    <section className="relative bg-white rounded-xl ring-1 ring-zinc-900/[0.06] shadow-[0_1px_2px_rgba(15,15,25,0.03)] p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
      
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-3">
        {icon && <span className="text-zinc-400">{icon}</span>}
        {title}
      </h3>
      <div>{children}</div>
    </section>);

}
function Field({ label, value }: {label: string;value: string;}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-900 font-medium break-words leading-snug">
        {value}
      </span>
    </div>);

}
function Chip({
  children,
  primary



}: {children: React.ReactNode;primary?: boolean;}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium ring-1 ring-inset ${primary ? 'bg-amber-50 text-amber-800 ring-amber-700/15' : 'bg-zinc-100 text-zinc-700 ring-zinc-900/5'}`}>
      
      {children}
    </span>);

}
function MoneyBlock({
  value,
  renewalLabel,
  renewalTone




}: {value: number | null;renewalLabel: string;renewalTone: 'success' | 'orange' | 'violet' | 'neutral';}) {
  const isEmpty = value == null;
  const isZero = value === 0;
  return (
    <div className="relative overflow-hidden rounded-xl ring-1 ring-lime-600/10 bg-gradient-to-br from-lime-50/70 via-white to-lime-50/40 p-4 shadow-[0_1px_2px_rgba(16,185,129,0.05)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -right-12 h-40 w-40 rounded-full"
        style={{
          background:
          'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 65%)',
          filter: 'blur(8px)'
        }} />
      
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-7 w-7 rounded-lg bg-lime-100 text-lime-700 ring-1 ring-lime-600/15 inline-flex items-center justify-center">
              <WalletIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-lime-800">
              Giá trị hợp đồng
            </span>
          </div>
          <p className="mt-2 font-mono text-[26px] sm:text-[28px] leading-none font-semibold text-zinc-900 tracking-tight tabular-nums">
            {isEmpty ?
            <span className="text-zinc-400 italic font-sans text-base">
                Chưa có dữ liệu
              </span> :
            isZero ?
            <span className="text-zinc-500 font-sans text-base">
                Chưa tính
              </span> :

            <>{formatCurrency(value)}</>
            }
          </p>
          {!isEmpty && !isZero &&
          <p className="mt-1 text-xs text-lime-700/80">
              ≈ {formatShortVND(value)} VND
            </p>
          }
        </div>
        <StatusBadge tone={renewalTone}>{renewalLabel}</StatusBadge>
      </div>
    </div>);

}
function Timeline({
  items







}: {items: {label: string;date: string;tone: 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';icon: React.ReactNode;}[];}) {
  const dotColors: Record<string, string> = {
    indigo: 'bg-amber-600 ring-amber-200',
    violet: 'bg-amber-600 ring-amber-200',
    emerald: 'bg-lime-500 ring-lime-200',
    amber: 'bg-amber-500 ring-amber-200',
    rose: 'bg-rose-500 ring-rose-200'
  };
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute left-2 right-2 top-3 h-0.5 bg-gradient-to-r from-amber-200 via-amber-200 to-lime-200 rounded-full" />
      
      <ol className="relative grid grid-cols-3 gap-2">
        {items.map((it) =>
        <li key={it.label} className="flex flex-col items-start">
            <span
            className={`relative z-10 h-6 w-6 rounded-full ring-4 ring-white flex items-center justify-center text-white shadow-sm ${dotColors[it.tone]}`}>
            
              {it.icon}
            </span>
            <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              {it.label}
            </span>
            <span className="text-sm font-semibold text-zinc-900 tabular-nums">
              {formatDate(it.date)}
            </span>
          </li>
        )}
      </ol>
    </div>);

}