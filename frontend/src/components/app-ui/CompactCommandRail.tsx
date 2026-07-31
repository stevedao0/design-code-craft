import React, { useMemo } from 'react';
import {
  LayoutDashboardIcon,
  FileTextIcon,
  MailIcon,
  BarChart3Icon,
  SearchIcon,
  ShieldIcon,
} from 'lucide-react';
import { RouteKey } from '../../data/routes';
import { useAuth } from '../../lib/auth';
import vcpmcLogo from '../../assets/vcpmc-logo-animated.webp';

export type RailGroupKey =
  | 'command'
  | 'dashboard'
  | 'contracts'
  | 'dispatch'
  | 'reports'
  | 'search'
  | 'admin';

interface CompactCommandRailProps {
  current: RouteKey;
  activeGroup: RailGroupKey | null;
  onSelectGroup: (g: RailGroupKey | null, event?: React.MouseEvent) => void;
  onNavigate: (k: RouteKey) => void;
  onOpenLauncher: () => void;
}

const RAIL_GROUPS: Array<{
  key: RailGroupKey;
  label: string;
  icon: React.ReactNode;
  routeHint: RouteKey;
  requiredPerm?: string;
}> = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboardIcon />, routeHint: 'dashboard', requiredPerm: 'portal.access' },
  // Hợp đồng absorbs GCN/In-GCN as a sub-feature. GCN lives in the
  // ContextFlyout commands, not on the rail, so the rail only carries
  // top-level modules.
  { key: 'contracts', label: 'Hợp đồng', icon: <FileTextIcon />, routeHint: 'contracts.list', requiredPerm: 'contracts.read' },
  { key: 'dispatch', label: 'Công văn', icon: <MailIcon />, routeHint: 'dispatch', requiredPerm: 'annexes.read' },
  { key: 'reports', label: 'Báo cáo', icon: <BarChart3Icon />, routeHint: 'reports', requiredPerm: 'reports.view' },
  { key: 'search', label: 'Tìm kiếm', icon: <SearchIcon />, routeHint: 'search', requiredPerm: 'works.read' },
  { key: 'admin', label: 'Hệ thống', icon: <ShieldIcon />, routeHint: 'admin.users', requiredPerm: 'admin.users.manage' },
];

const isRouteInGroup = (key: RailGroupKey, route: RouteKey): boolean => {
  switch (key) {
    case 'dashboard':
      return route === 'dashboard';
    case 'contracts':
      // GCN/In-GCN is a sub-feature of Hợp đồng, so print-gcn highlights
      // the contracts rail item.
      return (
        route === 'contracts.list' ||
        route === 'contracts.create' ||
        route === 'contracts.edit' ||
        route === 'contracts.detail' ||
        route === 'contracts.print' ||
        route === 'annexes'
      );
    case 'dispatch':
      return route === 'dispatch';
    case 'reports':
      return route === 'reports';
    case 'search':
      return route === 'search';
    case 'admin':
      return route === 'admin.users' || route === 'admin.permissions' || route === 'admin.import' || route === 'assistant';
    default:
      return false;
  }
};

export function CompactCommandRail({ current, activeGroup, onSelectGroup, onNavigate, onOpenLauncher }: CompactCommandRailProps) {
  const { hasPermission } = useAuth();

  const visibleGroups = useMemo(
    () => RAIL_GROUPS.filter((g) => !g.requiredPerm || hasPermission(g.requiredPerm)),
    [hasPermission],
  );

  const handleGroupClick = (g: RailGroupKey, e: React.MouseEvent) => {
    // If clicking the active group, toggle off (close flyout). Otherwise
    // open flyout for the new group. Either way, ensure launcher is closed.
    if (activeGroup === g) {
      onSelectGroup(null);
    } else {
      onSelectGroup(g, e);
    }
  };

  return (
    <nav className="vc-command-rail" aria-label="Compact Command Rail" data-rail="compact-v2">
      {/* Orb at top — opens the global CommandLauncher */}
      <button
        type="button"
        onClick={onOpenLauncher}
        className="vc-command-rail__orb"
        aria-label="Mở Command Center"
        title="VCPMC Command Center (⌘K)"
      >
        <img
          src={vcpmcLogo}
          alt="VCPMC"
          className="vc-command-rail__orb-logo"
        />
      </button>

      <div className="vc-command-rail__divider" aria-hidden />

      {/* Module icons */}
      {visibleGroups.map((g) => {
        const isActiveGroup = activeGroup === g.key;
        const isRouteActive = isRouteInGroup(g.key, current);
        return (
          <button
            key={g.key}
            type="button"
            onClick={(e) => handleGroupClick(g.key, e)}
            className={`vc-command-rail__btn ${isActiveGroup ? 'is-open' : ''} ${isRouteActive ? 'is-active' : ''}`}
            aria-label={g.label}
            aria-pressed={isActiveGroup}
            title={g.label}
          >
            {g.icon}
            <span className="vc-command-rail__btn-tooltip">{g.label}</span>
          </button>
        );
      })}

      <div className="vc-command-rail__spacer" aria-hidden />
    </nav>
  );
}
