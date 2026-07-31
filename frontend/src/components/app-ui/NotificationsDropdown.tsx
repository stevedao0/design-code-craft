import React from 'react';
import { BellIcon, CheckCircle2Icon, AlertTriangleIcon, FileTextIcon, AwardIcon } from 'lucide-react';

type Notif = {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: 'success' | 'warning' | 'info' | 'award';
  unread?: boolean;
};

const ITEMS: Notif[] = [
  { id: '1', title: 'Hợp đồng HD-2026-038 sắp hết hạn', desc: 'Còn 12 ngày · Cần gia hạn hoặc thanh lý', time: '5 phút', type: 'warning', unread: true },
  { id: '2', title: 'Đã cấp GCN cho HD-2026-031', desc: 'Số GCN: GCN-2026-0089', time: '32 phút', type: 'award', unread: true },
  { id: '3', title: 'Thanh toán quý IV hoàn tất', desc: '128 hợp đồng · 4.2 tỷ đồng', time: '2 giờ', type: 'success' },
  { id: '4', title: 'Phụ lục mới chờ phê duyệt', desc: '6 phụ lục đang chờ', time: '4 giờ', type: 'info' },
];

const ICON_MAP = {
  success: { I: CheckCircle2Icon, bg: 'bg-lime-50 text-lime-600 ring-lime-200/60' },
  warning: { I: AlertTriangleIcon, bg: 'bg-amber-50 text-amber-700 ring-amber-200/60' },
  info: { I: FileTextIcon, bg: 'bg-[#fcf2e3] text-[#9c6d3e] ring-[#e3d2b3]/60' },
  award: { I: AwardIcon, bg: 'bg-[#fcf2e3] text-[#9c6d3e] ring-[#e3d2b3]/60' },
};

export function NotificationsDropdown({ onClose }: { onClose: () => void }) {
  const unread = ITEMS.filter((i) => i.unread).length;
  return (
    <div
      className="absolute right-0 top-11 w-[360px] rounded-xl bg-white ring-1 ring-[#e3d2b3]/60 shadow-[0_24px_60px_-12px_rgba(15,15,25,0.25)] overflow-hidden z-30"
      style={{ animation: 'scaleIn 180ms ease-out', transformOrigin: 'top right' }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c89968]/70 to-transparent" />
      <header className="px-4 py-3 border-b border-[#e3d2b3]/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellIcon className="h-4 w-4 text-[#9c6d3e]" />
          <h3 className="text-sm font-semibold text-[#2d2419]">Thông báo</h3>
          {unread > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#c89968]/15 text-[#7a4a22] ring-1 ring-inset ring-[#c89968]/30">
              {unread} mới
            </span>
          )}
        </div>
        <button className="text-[11px] font-semibold text-[#9c6d3e] hover:text-[#7a4a22]" onClick={onClose}>
          Đánh dấu đã đọc
        </button>
      </header>
      <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
        {ITEMS.map((n) => {
          const { I, bg } = ICON_MAP[n.type];
          return (
            <button
              key={n.id}
              type="button"
              className={`relative w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-b border-[#f1ede4] last:border-0 ${
                n.unread ? 'bg-[#fffaf0]/60 hover:bg-[#fcf2e3]/60' : 'hover:bg-[#faf8f3]'
              }`}
            >
              {n.unread && <span className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full bg-[#c89968] shadow-[0_0_6px_rgba(200,153,104,0.7)]" />}
              <span className={`shrink-0 h-9 w-9 rounded-lg ring-1 inline-flex items-center justify-center ${bg}`}>
                <I className="h-[17px] w-[17px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[#2d2419] truncate">{n.title}</p>
                <p className="text-[12px] text-[#6b756f] mt-0.5 line-clamp-2">{n.desc}</p>
                <p className="text-[10.5px] text-[#9aa39d] mt-1 font-medium">{n.time} trước</p>
              </div>
            </button>
          );
        })}
      </div>
      <footer className="px-4 py-2.5 border-t border-[#e3d2b3]/40 bg-[#faf8f3]/70 text-center">
        <button className="text-[12px] font-semibold text-[#9c6d3e] hover:text-[#7a4a22]">
          Xem toàn bộ thông báo →
        </button>
      </footer>
    </div>
  );
}
