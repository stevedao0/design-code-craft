import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  LayoutDashboardIcon,
  FileTextIcon,
  FilePlusIcon,
  MailIcon,
  BarChart3Icon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
  KeySquareIcon,
  UploadCloudIcon,
  SparklesIcon,
  ScrollTextIcon,
  PrinterIcon,
  UploadIcon,
  ChevronRightIcon,
  XIcon,
} from 'lucide-react';
import { RouteKey } from '../../data/routes';
import { useAuth } from '../../lib/auth';
import type { RailGroupKey } from './CompactCommandRail';

export interface ContextFlyoutProps {
  open: boolean;
  group: RailGroupKey | null;
  /** Vertical pixel position of the rail button that opened this flyout.
   *  Used to position the popover near its trigger (Apple-style). */
  anchorTop: number;
  onClose: () => void;
  onNavigate: (k: RouteKey) => void;
  onOpenLauncher: () => void;
}

type CommandItem = {
  key: string;
  label: string;
  description: string;
  /** Keyboard shortcut badge shown on the right, e.g. "⌘K", "⌘P" */
  shortcut?: string;
  icon: React.ReactNode;
  route: RouteKey;
  requiredPerm?: string;
};

// All commands by rail group. GCN lives inside Hợp đồng — NOT a standalone
// rail item. Only existing RouteKeys are referenced.
const COMMANDS: Record<Exclude<RailGroupKey, 'command'>, CommandItem[]> = {
  dashboard: [
    { key: 'overview', label: 'Tổng quan', description: 'Dashboard workspace', icon: <LayoutDashboardIcon />, route: 'dashboard' },
  ],

  contracts: [
    { key: 'list', label: 'Danh sách hợp đồng', description: 'Duyệt tất cả hợp đồng', shortcut: '⌘L', icon: <FileTextIcon />, route: 'contracts.list', requiredPerm: 'contracts.read' },
    { key: 'create', label: 'Tạo hợp đồng / Ký mới', description: 'Workflow tạo hợp đồng mới', shortcut: '⌘N', icon: <FilePlusIcon />, route: 'contracts.create', requiredPerm: 'contracts.create' },
    { key: 'print', label: 'In GCN', description: 'In giấy chứng nhận từ hợp đồng', shortcut: '⌘P', icon: <PrinterIcon />, route: 'contracts.print', requiredPerm: 'contracts.read' },
    { key: 'paste-excel', label: 'Dán Excel GCN', description: 'Nạp danh sách GCN từ bảng Excel', shortcut: '⇧⌘V', icon: <UploadIcon />, route: 'contracts.print', requiredPerm: 'contracts.read' },
    { key: 'annexes', label: 'Phụ lục', description: 'Quản lý phụ lục hợp đồng', icon: <ScrollTextIcon />, route: 'annexes', requiredPerm: 'annexes.read' },
    { key: 'attention', label: 'Hợp đồng cần chú ý', description: 'Danh sách hợp đồng cần xử lý', icon: <FileTextIcon />, route: 'contracts.list', requiredPerm: 'contracts.read' },
  ],

  dispatch: [
    { key: 'list', label: 'Danh sách công văn', description: 'Duyệt tất cả công văn', icon: <MailIcon />, route: 'dispatch', requiredPerm: 'annexes.read' },
    { key: 'new', label: 'Ký mới công văn', description: 'Workflow tạo công văn mới', icon: <FilePlusIcon />, route: 'dispatch', requiredPerm: 'annexes.read' },
    { key: 'tracking', label: 'Theo dõi liên hệ', description: 'TODO: view theo dõi; hiện mở danh sách', icon: <MailIcon />, route: 'dispatch', requiredPerm: 'annexes.read' },
  ],

  reports: [
    { key: 'overview', label: 'Báo cáo tổng quan', description: 'Số liệu tổng hợp toàn hệ thống', icon: <BarChart3Icon />, route: 'reports', requiredPerm: 'reports.view' },
    { key: 'week', label: 'Báo cáo tuần', description: 'TODO: scope=week; hiện mở báo cáo tổng quan', icon: <BarChart3Icon />, route: 'reports', requiredPerm: 'reports.view' },
    { key: 'year', label: 'Báo cáo năm', description: 'TODO: scope=year; hiện mở báo cáo tổng quan', icon: <BarChart3Icon />, route: 'reports', requiredPerm: 'reports.view' },
  ],

  search: [
    { key: 'global', label: 'Tra cứu nhanh', description: 'Tìm kiếm toàn cục', shortcut: '⌘/', icon: <SearchIcon />, route: 'search', requiredPerm: 'works.read' },
  ],

  admin: [
    { key: 'users', label: 'Quản lý người dùng', description: 'Danh sách & vai trò người dùng', icon: <UsersIcon />, route: 'admin.users', requiredPerm: 'admin.users.manage' },
    { key: 'permissions', label: 'Ma trận phân quyền', description: 'Role × permission', icon: <KeySquareIcon />, route: 'admin.permissions', requiredPerm: 'admin.users.manage' },
    { key: 'import', label: 'Import Excel', description: 'Nhập liệu từ bảng tính', icon: <UploadCloudIcon />, route: 'admin.import', requiredPerm: 'admin.users.manage' },
    { key: 'assistant', label: 'AI Assistant', description: 'Trợ lý AI', icon: <SparklesIcon />, route: 'assistant', requiredPerm: 'admin.users.manage' },
    { key: 'deployment', label: 'Triển khai', description: 'Public URL & tunnel', icon: <UploadCloudIcon />, route: 'admin.deployment', requiredPerm: 'admin.users.manage' },
  ],
};

const GROUP_META: Record<Exclude<RailGroupKey, 'command'>, { title: string; subtitle: string; icon: React.ReactNode }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Tổng quan workspace', icon: <LayoutDashboardIcon /> },
  contracts: { title: 'Hợp đồng', subtitle: 'Quản lý hợp đồng, phụ lục & GCN', icon: <FileTextIcon /> },
  dispatch: { title: 'Công văn', subtitle: 'Xuất & theo dõi công văn', icon: <MailIcon /> },
  reports: { title: 'Báo cáo', subtitle: 'Số liệu tổng hợp', icon: <BarChart3Icon /> },
  search: { title: 'Tìm kiếm', subtitle: 'Tra cứu nhanh toàn cục', icon: <SearchIcon /> },
  admin: { title: 'Hệ thống', subtitle: 'Người dùng, quyền, nhập liệu', icon: <ShieldIcon /> },
};

// Popover height estimation for anchor positioning
const ESTIMATED_ROW_PX = 52;
const HEADER_PX = 60;
const FOOTER_PX = 44;
const SEARCH_PX = 40;

function computeFlyoutTop(anchorTop: number, commandCount: number): number {
  const estimatedHeight = HEADER_PX + SEARCH_PX + commandCount * ESTIMATED_ROW_PX + FOOTER_PX;
  const MARGIN = 8;
  const minTop = MARGIN;
  const maxTop = window.innerHeight - estimatedHeight - MARGIN;
  return Math.max(minTop, Math.min(anchorTop - 16, maxTop));
}

export function ContextFlyout({ open, group, anchorTop, onClose, onNavigate, onOpenLauncher }: ContextFlyoutProps) {
  const { hasPermission } = useAuth();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');

  // Reset search when group changes
  useEffect(() => {
    setQuery('');
    searchRef.current?.focus();
  }, [group]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current && panelRef.current.contains(t)) return;
      const rail = document.querySelector('.vc-command-rail');
      if (rail && rail.contains(t)) return;
      onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  const visibleCommands = useMemo(() => {
    if (!group || group === 'command') return [];
    const all = COMMANDS[group] || [];
    const filtered = all.filter((c) => !c.requiredPerm || hasPermission(c.requiredPerm));
    if (!query.trim()) return filtered;
    const q = query.toLowerCase();
    return filtered.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [group, query, hasPermission]);

  if (!open || !group || group === 'command') return null;

  const meta = GROUP_META[group];
  const flyoutTop = computeFlyoutTop(anchorTop, visibleCommands.length);

  const handleCommand = (route: RouteKey) => {
    onNavigate(route);
    onClose();
  };

  const handleOpenLauncher = () => {
    onOpenLauncher();
    onClose();
  };

  return (
    <>
      {/* Transparent scrim — captures outside clicks */}
      <div className="vc-context-flyout__scrim" aria-hidden onClick={onClose} />

      <aside
        ref={panelRef}
        className="vc-context-flyout"
        role="menu"
        aria-label={`${meta.title} — context menu`}
        data-flyout-group={group}
        data-flyout-v="v8"
        style={{ top: flyoutTop }}
      >
        {/* Header */}
        <header className="vc-context-flyout__header">
          <div className="vc-context-flyout__header-icon">{meta.icon}</div>
          <div className="vc-context-flyout__header-text">
            <p className="vc-context-flyout__header-title">{meta.title}</p>
            <p className="vc-context-flyout__header-sub">{meta.subtitle}</p>
          </div>
          <button
            type="button"
            className="vc-context-flyout__close"
            onClick={onClose}
            aria-label="Đóng"
          >
            <XIcon />
          </button>
        </header>

        {/* Search mini */}
        <div className="vc-context-flyout__search">
          <SearchIcon className="vc-context-flyout__search-icon" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Lọc lệnh..."
            className="vc-context-flyout__search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Lọc lệnh"
          />
          {query && (
            <button
              type="button"
              className="vc-context-flyout__search-clear"
              onClick={() => setQuery('')}
              aria-label="Xóa tìm kiếm"
            >
              <XIcon />
            </button>
          )}
        </div>

        {/* Command list */}
        <ul className="vc-context-flyout__list">
          {visibleCommands.length === 0 ? (
            <li className="vc-context-flyout__empty">Không có lệnh khả dụng.</li>
          ) : (
            visibleCommands.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  className="vc-context-flyout__item"
                  onClick={() => handleCommand(c.route)}
                  role="menuitem"
                >
                  <span className="vc-context-flyout__item-icon">{c.icon}</span>
                  <span className="vc-context-flyout__item-text">
                    <span className="vc-context-flyout__item-label">{c.label}</span>
                    <span className="vc-context-flyout__item-desc">{c.description}</span>
                  </span>
                  {c.shortcut && (
                    <kbd className="vc-context-flyout__item-shortcut">{c.shortcut}</kbd>
                  )}
                  <ChevronRightIcon className="vc-context-flyout__item-arrow" />
                </button>
              </li>
            ))
          )}
        </ul>

        {/* Footer: opens the full CommandLauncher — styled as a command item */}
        <div className="vc-context-flyout__footer">
          <button
            type="button"
            className="vc-context-flyout__item vc-context-flyout__item--launcher"
            onClick={handleOpenLauncher}
          >
            <span className="vc-context-flyout__item-icon">
              <SearchIcon />
            </span>
            <span className="vc-context-flyout__item-text">
              <span className="vc-context-flyout__item-label">Mở tất cả lệnh &amp; menu</span>
              <span className="vc-context-flyout__item-desc">Command launcher toàn hệ thống</span>
            </span>
            <kbd className="vc-context-flyout__item-shortcut">⌘K</kbd>
            <ChevronRightIcon className="vc-context-flyout__item-arrow" />
          </button>
        </div>
      </aside>
    </>
  );
}
