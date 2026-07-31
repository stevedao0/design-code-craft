import React, { useMemo } from 'react';
import {
  SearchIcon,
  FileTextIcon,
  InboxIcon,
  FilePlusIcon,
  AwardIcon,
  LayoutDashboardIcon,
  MailIcon,
  BarChart3Icon,
  ShieldIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { RouteKey } from '../../data/routes';
import { useAuth } from '../../lib/auth';
import { CommandOrb } from './CommandOrb';

// Primary navigation: single source of truth. Admin/import/AI/recent live
// in CommandLauncher only.
type NavItem = {
  key: RouteKey;
  label: string;
  icon: React.ReactNode;
  requiredPerm?: string;
  /** When defined, a small numeric badge is rendered on the right edge of the
   *  nav item. Pass `null` or `0` to hide the badge entirely. */
  count?: number | null;
};

const PRIMARY_NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboardIcon />, requiredPerm: 'portal.access' },
  { key: 'contracts.list', label: 'Hợp đồng', icon: <FileTextIcon />, requiredPerm: 'contracts.read', count: 43 },
  { key: 'dispatch', label: 'Công văn', icon: <MailIcon />, requiredPerm: 'annexes.read' },
  { key: 'contracts.print', label: 'GCN', icon: <AwardIcon />, requiredPerm: 'contracts.read', count: 42 },
  { key: 'reports', label: 'Báo cáo', icon: <BarChart3Icon />, requiredPerm: 'reports.view' },
  { key: 'search', label: 'Tìm kiếm', icon: <SearchIcon />, requiredPerm: 'works.read' },
  { key: 'admin.users', label: 'Hệ thống', icon: <ShieldIcon />, requiredPerm: 'admin.users.manage' },
];

// Quick actions: workflow shortcuts (NOT navigation). They open the action
// directly — distinct from the matching module in Primary Navigation.
const QUICK_ACTIONS: NavItem[] = [
  { key: 'contracts.create', label: 'Tạo HĐ', icon: <FilePlusIcon />, requiredPerm: 'contracts.create' },
  { key: 'contracts.print', label: 'In GCN', icon: <AwardIcon />, requiredPerm: 'contracts.read' },
  { key: 'dispatch', label: 'Tạo công văn', icon: <MailIcon />, requiredPerm: 'annexes.read' },
  { key: 'reports', label: 'Báo cáo', icon: <BarChart3Icon />, requiredPerm: 'reports.view' },
];

interface MissionPanelProps {
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  onOpenLauncher: () => void;
  launcherOpen: boolean;
}

export function MissionPanel({ current, onNavigate, onOpenLauncher, launcherOpen }: MissionPanelProps) {
  const { hasPermission } = useAuth();

  const visibleQuickActions = useMemo(
    () => QUICK_ACTIONS.filter((it) => !it.requiredPerm || hasPermission(it.requiredPerm)).slice(0, 4),
    [hasPermission],
  );
  const visiblePrimaryNav = useMemo(
    () => PRIMARY_NAV.filter((it) => !it.requiredPerm || hasPermission(it.requiredPerm)),
    [hasPermission],
  );

  const isActive = (key: RouteKey): boolean => {
    if (key === current) return true;
    if (key === 'contracts.list' && ['contracts.create', 'contracts.edit', 'contracts.detail', 'contracts.print', 'contracts.gcn'].includes(current)) return true;
    if (key === 'admin.users' && ['admin.permissions', 'admin.import', 'assistant'].includes(current)) return true;
    return false;
  };

  return (
    <aside className="vc-mission-panel" aria-label="Mission Panel" data-mission-panel="v5-clean">
      {/* A. Brand + Orb */}
      <div className="vc-mission-panel__hero">
        <div className="vc-mission-panel__hero-orb">
          <CommandOrb onClick={onOpenLauncher} isOpen={launcherOpen} />
        </div>
        <div className="vc-mission-panel__hero-meta">
          <p className="vc-mission-panel__hero-title">VCPMC</p>
          <p className="vc-mission-panel__hero-sub">
            <span className="vc-mission-panel__hero-dot" /> Online · Background
          </p>
        </div>
      </div>

      {/* B. Command Search */}
      <div className="vc-mission-panel__search">
        <div className="vc-mission-panel__search-wrap">
          <SearchIcon className="vc-mission-panel__search-icon" />
          <input
            type="text"
            placeholder="Tìm hoặc gõ lệnh..."
            className="vc-mission-panel__search-input"
            onFocus={onOpenLauncher}
            readOnly
            aria-label="Tìm hoặc gõ lệnh"
          />
          <kbd className="vc-mission-panel__search-kbd">⌘K</kbd>
        </div>
      </div>

      {/* C. Quick Actions (4 cards 2x2, no active state) */}
      {visibleQuickActions.length > 0 && (
        <div className="vc-mission-panel__qa-grid">
          {visibleQuickActions.map((qa) => (
            <button
              key={qa.key}
              type="button"
              onClick={() => onNavigate(qa.key)}
              className="vc-mission-panel__qa-card"
              title={qa.label}
            >
              <span className="vc-mission-panel__qa-icon">{qa.icon}</span>
              <span className="vc-mission-panel__qa-label">{qa.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* D. Primary Navigation (single source of truth, with optional count badge) */}
      <nav className="vc-mission-panel__nav" aria-label="Điều hướng chính">
        {visiblePrimaryNav.map((it) => {
          const active = isActive(it.key);
          const badge = typeof it.count === 'number' && it.count > 0 ? it.count : null;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onNavigate(it.key)}
              className={`vc-mission-panel__nav-item ${active ? 'is-active' : ''}`}
              title={it.label}
            >
              <span className="vc-mission-panel__nav-icon">{it.icon}</span>
              <span className="vc-mission-panel__nav-label">{it.label}</span>
              {badge !== null && (
                <span className="vc-mission-panel__nav-count">{badge.toLocaleString('vi-VN')}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* E. Footer hint to open CommandLauncher for everything else */}
      <button
        type="button"
        onClick={onOpenLauncher}
        className="vc-mission-panel__more"
        aria-label="Mở Command Launcher"
      >
        <span>Mở thêm lệnh & menu</span>
        <ChevronRightIcon />
      </button>
    </aside>
  );
}
