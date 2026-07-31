import React, { useMemo } from 'react';
import {
  LayoutDashboardIcon,
  FileTextIcon,
  AwardIcon,
  MailIcon,
  BarChart3Icon,
  SearchIcon,
  ShieldIcon,
} from 'lucide-react';
import { RouteKey } from '../../data/routes';
import { useAuth } from '../../lib/auth';
import vcpmcLogo from '../../assets/vcpmc-logo-animated.webp';

interface NavigationRailProps {
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  onOpenLauncher: () => void;
}

const RAIL_ITEMS = [
  { key: 'dashboard', icon: <LayoutDashboardIcon />, label: 'Tổng quan', requiredPerm: 'portal.access' },
  { key: 'contracts.list', icon: <FileTextIcon />, label: 'Hợp đồng', requiredPerm: 'contracts.read' },
  { key: 'contracts.print', icon: <AwardIcon />, label: 'GCN', requiredPerm: 'contracts.read' },
  { key: 'dispatch', icon: <MailIcon />, label: 'Công văn', requiredPerm: 'annexes.read' },
  { key: 'reports', icon: <BarChart3Icon />, label: 'Báo cáo', requiredPerm: 'reports.view' },
  { key: 'search', icon: <SearchIcon />, label: 'Tìm kiếm', requiredPerm: 'works.read' },
  { key: 'admin.users', icon: <ShieldIcon />, label: 'Hệ thống', requiredPerm: 'admin.users.manage' },
];

export function NavigationRail({ current, onNavigate, onOpenLauncher }: NavigationRailProps) {
  const { hasPermission } = useAuth();

  const visibleItems = useMemo(
    () => RAIL_ITEMS.filter((it) => !it.requiredPerm || hasPermission(it.requiredPerm)),
    [hasPermission],
  );

  const isRouteActive = (key: RouteKey): boolean => {
    if (key === current) return true;
    if (key === 'contracts.list' && ['contracts.create', 'contracts.edit', 'contracts.detail', 'contracts.print'].includes(current)) return true;
    if (key === 'admin.users' && ['admin.permissions', 'admin.import', 'assistant'].includes(current)) return true;
    return false;
  };

  return (
    <nav className="vc-nav-rail" aria-label="Navigation Rail">
      {/* Orb */}
      <button
        type="button"
        onClick={onOpenLauncher}
        className="vc-command-orb-new vc-nav-rail__orb"
        aria-label="Mở Command Center"
        title="VCPMC Command Center"
      >
        <img
          src={vcpmcLogo}
          alt="VCPMC"
          className="vc-command-orb-new__logo"
          style={{ width: 28, height: 28, objectFit: 'contain' }}
        />
      </button>

      <div className="vc-nav-rail__divider" />

      {/* Nav items */}
      {visibleItems.map((item) => {
        const active = isRouteActive(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key)}
            className={`vc-nav-rail__btn ${active ? 'is-active' : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon}
          </button>
        );
      })}

      <div className="vc-nav-rail__spacer" />
    </nav>
  );
}
