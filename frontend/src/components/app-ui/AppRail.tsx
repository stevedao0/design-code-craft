import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Award,
  Mail,
  BarChart3,
  Search,
  Shield,
  Settings,
  LogOut,
} from 'lucide-react';
import { CommandOrb } from './CommandOrb';
import { RouteKey } from '../../data/routes';
import { useAuth } from '../../lib/auth';

interface AppRailProps {
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  onOpenLauncher: () => void;
  launcherOpen: boolean;
  onLogout: () => void;
}

/**
 * App Rail — fixed 68px left rail.
 *
 * Structure:
 *  - Orb (top)
 *  - Main nav (middle)
 *  - Settings / user mini (bottom)
 *
 * Icon-only 20px nav with soft-pill active state, tooltip on hover.
 * Ivory glass background, no dark sidebar.
 */
export function AppRail({
  current,
  onNavigate,
  onOpenLauncher,
  launcherOpen,
  onLogout,
}: AppRailProps) {
  const { hasPermission } = useAuth();

  const items: { key: RouteKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { key: 'contracts.list', label: 'Hợp đồng', icon: FileText },
    { key: 'contracts.print', label: 'In GCN', icon: Award },
    { key: 'dispatch', label: 'Công văn', icon: Mail },
    { key: 'reports', label: 'Báo cáo', icon: BarChart3 },
    { key: 'search', label: 'Tìm kiếm', icon: Search },
  ];

  const isActive = (key: RouteKey): boolean => {
    if (key === current) return true;
    if (key === 'contracts.list' && ['contracts.create', 'contracts.edit', 'contracts.detail', 'contracts.print'].includes(current)) return true;
    if (key === 'contracts.print' && current === 'contracts.print') return true;
    return false;
  };

  return (
    <aside className="vcpmc-rail" aria-label="Điều hướng chính">
      {/* Orb slot */}
      <div className="vcpmc-rail__top">
        <CommandOrb onClick={onOpenLauncher} isOpen={launcherOpen} />
      </div>

      {/* Main nav */}
      <nav className="vcpmc-rail__nav" aria-label="Module chính">
        {items.map((it) => {
          const active = isActive(it.key);
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onNavigate(it.key)}
              className={`vcpmc-rail__item ${active ? 'is-active' : ''}`}
              title={it.label}
              aria-label={it.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="vcpmc-rail__icon" aria-hidden />
              <span className="vcpmc-rail__tooltip">{it.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom: System + user */}
      <div className="vcpmc-rail__bottom">
        {hasPermission('admin.users.manage') && (
          <button
            type="button"
            onClick={() => onNavigate('admin.users')}
            className={`vcpmc-rail__item ${current === 'admin.users' ? 'is-active' : ''}`}
            title="Thiết lập"
            aria-label="Thiết lập"
          >
            <Settings className="vcpmc-rail__icon" aria-hidden />
            <span className="vcpmc-rail__tooltip">Thiết lập</span>
          </button>
        )}
        {hasPermission('admin.users.manage') && (
          <button
            type="button"
            onClick={() => onNavigate('admin.users')}
            className={`vcpmc-rail__item ${current === 'admin.permissions' ? 'is-active' : ''}`}
            title="Phân quyền"
            aria-label="Phân quyền"
          >
            <Shield className="vcpmc-rail__icon" aria-hidden />
            <span className="vcpmc-rail__tooltip">Phân quyền</span>
          </button>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="vcpmc-rail__item vcpmc-rail__item--danger"
          title="Đăng xuất"
          aria-label="Đăng xuất"
        >
          <LogOut className="vcpmc-rail__icon" aria-hidden />
          <span className="vcpmc-rail__tooltip">Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
