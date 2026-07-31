import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SearchIcon,
  LayoutDashboardIcon,
  FileTextIcon,
  FilePlusIcon,
  PrinterIcon,
  PaperclipIcon,
  MailIcon,
  BarChart3Icon,
  ShieldIcon,
  SparklesIcon,
  CornerDownLeftIcon,
} from 'lucide-react';
import { RouteKey } from '../../data/routes';

type Cmd = {
  key: RouteKey;
  label: string;
  group: string;
  hint?: string;
  icon: React.ReactNode;
  perm?: string;
};

const ICON = 'h-[15px] w-[15px]';

const COMMANDS: Cmd[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'Tổng quan', icon: <LayoutDashboardIcon className={ICON} />, perm: 'dashboard.view' },
  { key: 'contracts.list', label: 'Danh sách hợp đồng', group: 'Hợp đồng', icon: <FileTextIcon className={ICON} />, perm: 'contracts.view' },
  { key: 'contracts.create', label: 'Tạo hợp đồng mới', group: 'Hợp đồng', hint: 'Tạo nhanh', icon: <FilePlusIcon className={ICON} />, perm: 'contracts.create' },
  { key: 'contracts.print', label: 'In GCN', group: 'Hợp đồng', icon: <PrinterIcon className={ICON} />, perm: 'certificates.view' },
  { key: 'annexes', label: 'Phụ lục', group: 'Nghiệp vụ', icon: <PaperclipIcon className={ICON} />, perm: 'contracts.view' },
  { key: 'dispatch', label: 'Công văn', group: 'Nghiệp vụ', icon: <MailIcon className={ICON} />, perm: 'contracts.view' },
  { key: 'reports', label: 'Báo cáo', group: 'Nghiệp vụ', icon: <BarChart3Icon className={ICON} />, perm: 'reports.view' },
  { key: 'search', label: 'Tìm kiếm toàn cục', group: 'Nghiệp vụ', icon: <SearchIcon className={ICON} />, perm: 'search.view' },
  { key: 'admin.users', label: 'Quản lý người dùng', group: 'Hệ thống', icon: <ShieldIcon className={ICON} />, perm: 'admin.users.view' },
  { key: 'admin.permissions', label: 'Ma trận phân quyền', group: 'Hệ thống', icon: <ShieldIcon className={ICON} />, perm: 'admin.roles.view' },
  { key: 'admin.deployment', label: 'Triển khai', group: 'Hệ thống', icon: <ShieldIcon className={ICON} />, perm: 'admin.users.view' },
  { key: 'assistant', label: 'AI Assistant', group: 'Hệ thống', hint: 'Beta', icon: <SparklesIcon className={ICON} />, perm: 'ai.view' },
];

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  hasPermission,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (k: RouteKey) => void;
  hasPermission: (p: string) => boolean;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const allowed = COMMANDS.filter((c) => !c.perm || hasPermission(c.perm));
    const needle = q.trim().toLowerCase();
    if (!needle) return allowed;
    return allowed.filter(
      (c) =>
        c.label.toLowerCase().includes(needle) ||
        c.group.toLowerCase().includes(needle),
    );
  }, [q, hasPermission]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const hit = items[active];
        if (hit) {
          onNavigate(hit.key);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose, onNavigate]);

  if (!open) return null;

  const groups: Record<string, Cmd[]> = {};
  items.forEach((it) => {
    (groups[it.group] ||= []).push(it);
  });

  let flatIdx = -1;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div
        className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[3px]"
        onClick={onClose}
        style={{ animation: 'fadeUp 180ms ease-out' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl bg-white rounded-2xl ring-1 ring-[#e3d2b3]/60 shadow-[0_30px_70px_-20px_rgba(15,15,25,0.35),0_0_0_1px_rgba(200,153,104,0.18)] overflow-hidden"
        style={{ animation: 'scaleIn 200ms cubic-bezier(0.32,0.72,0,1)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c89968]/70 to-transparent"
        />
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-[#e3d2b3]/40">
          <SearchIcon className="h-4 w-4 text-[#9c6d3e]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Đi tới trang, tìm hành động..."
            className="flex-1 h-full bg-transparent outline-none text-[14px] text-[#2d2419] placeholder:text-[#9aa39d]"
          />
          <kbd className="text-[10px] font-semibold text-[#6b756f] bg-[#f5efe2] border border-[#e3d2b3]/60 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto scrollbar-thin py-2">
          {items.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[#6b756f]">
              Không có kết quả phù hợp.
            </div>
          )}
          {Object.entries(groups).map(([group, list]) => (
            <div key={group} className="mb-1">
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9c8569]">
                {group}
              </p>
              {list.map((c) => {
                flatIdx += 1;
                const isActive = flatIdx === active;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onMouseEnter={() => setActive(flatIdx)}
                    onClick={() => {
                      onNavigate(c.key);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-[13.5px] text-left transition-colors ${
                      isActive
                        ? 'bg-gradient-to-r from-[#c89968]/18 via-[#c89968]/8 to-transparent text-[#2d1f14]'
                        : 'text-[#3d4a44] hover:bg-[#faf8f3]'
                    }`}
                  >
                    <span
                      className={`shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md ${
                        isActive
                          ? 'bg-white ring-1 ring-[#c89968]/50 text-[#9c6d3e]'
                          : 'bg-[#f5efe2] text-[#8a7560]'
                      }`}
                    >
                      {c.icon}
                    </span>
                    <span className="flex-1 truncate font-medium">{c.label}</span>
                    {c.hint && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9c6d3e] bg-[#fcf2e3] px-1.5 py-0.5 rounded">
                        {c.hint}
                      </span>
                    )}
                    {isActive && (
                      <CornerDownLeftIcon className="h-3.5 w-3.5 text-[#9c6d3e]" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-4 h-9 border-t border-[#e3d2b3]/40 bg-[#faf8f3]/70 flex items-center gap-4 text-[11px] text-[#6b756f]">
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-white border border-[#e3d2b3]/60 rounded px-1 text-[10px]">↑↓</kbd>
            Di chuyển
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-white border border-[#e3d2b3]/60 rounded px-1 text-[10px]">↵</kbd>
            Mở
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <kbd className="bg-white border border-[#e3d2b3]/60 rounded px-1 text-[10px]">⌘K</kbd>
            Mở nhanh
          </span>
        </div>
      </div>
    </div>
  );
}
