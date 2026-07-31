import React, { useMemo, useState } from 'react';
import {
  FileTextIcon,
  MailIcon,
  BarChart3Icon,
  UserCircle2Icon,
  SearchIcon,
  ChevronDownIcon,
  LockIcon,
  LayoutDashboardIcon,
} from 'lucide-react';
import { RouteKey } from '../../data/routes';
import { DOMAINS } from '../../data/authData';
import { useAuth } from '../../lib/auth';
import vcpmcLogo from '../../assets/vcpmc-logo-animated.webp';
import {
  CONTRACTS_GROUP_KEYS,
  SIDEBAR_BUSINESS_REST,
  SIDEBAR_CONTRACTS_CHILDREN,
  SIDEBAR_SYSTEM,
  SIDEBAR_TOP,
  type NavItem,
} from './navConfig';
export function Sidebar({
  current,
  onNavigate,
  workspace,



}: {current: RouteKey;onNavigate: (k: RouteKey) => void;workspace?: string;}) {
  const { hasPermission, currentUser } = useAuth();
  const [contractsOpen, setContractsOpen] = useState(
    CONTRACTS_GROUP_KEYS.includes(current)
  );
  const renderItem = (it: NavItem, indent = false) => {
    const isManager = currentUser?.role === 'manager';
    const isAdminItem = it.key === 'admin.users' || it.key === 'admin.permissions' || it.key === 'admin.import';
    const showDisabled = isManager && isAdminItem;
    const hasAccess = it.requiredPerm ? hasPermission(it.requiredPerm) : true;
    if (!hasAccess && !showDisabled) return null;
    const active = current === it.key;
    if (showDisabled) {
      return (
        <div
          key={it.key}
          className={`group relative w-full flex items-center gap-3 ${indent ? 'pl-9 pr-3' : 'px-3'} py-1.5 rounded-xl text-[13px] font-medium text-white/35 cursor-not-allowed`}
          title="Không có quyền">
          <span className="shrink-0 opacity-50">{it.icon}</span>
          <span className="flex-1 text-left truncate opacity-50">{it.label}</span>
          <LockIcon className="h-3 w-3 opacity-50" />
        </div>);
    }
    if (indent) {
      return (
        <button
          key={it.key}
          type="button"
          onClick={() => onNavigate(it.key)}
          className={`group relative w-full flex items-center gap-3 pl-7 pr-3 py-1.5 text-[12.5px] transition-colors border-l-2 ${
            active
              ? 'text-white border-[var(--vc-enterprise-accent)] font-semibold bg-[var(--vc-enterprise-accent)]/[0.10]'
              : 'text-white/52 hover:text-white border-white/10 hover:border-white/22 hover:bg-white/[0.035] hover:font-medium'
          }`}>
          <span className="flex-1 text-left truncate">{it.label}</span>
        </button>);
    }
    return (
      <button
        key={it.key}
        type="button"
        onClick={() => onNavigate(it.key)}
        className={`group relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[12.5px] font-medium transition-colors duration-fast ease-out ${
          active
            ? 'text-white bg-[var(--vc-enterprise-accent)]/12 ring-1 ring-inset ring-[var(--vc-enterprise-accent)]/25'
            : 'text-white/68 hover:text-white hover:bg-white/[0.045]'
        }`}>
        <span className={`shrink-0 ${active ? 'text-[var(--vc-enterprise-accent)]' : 'text-white/42 group-hover:text-white/78'}`}>
          {it.icon}
        </span>
        <span className="flex-1 text-left truncate">{it.label}</span>
        {it.badge &&
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full bg-white/8 text-[var(--vc-enterprise-accent)] ring-1 ring-inset ring-white/10">
            {it.badge}
          </span>
        }
      </button>);
  };
  const groupLabel = (label: string) =>
  <p className="px-3 mt-5 mb-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/32">
      {label}
    </p>;

  const contractsActive = CONTRACTS_GROUP_KEYS.includes(current);
  const activeWorkspace = useMemo(() => DOMAINS.find((item) => item.id === workspace), [workspace]);
  const primaryRailItems = [
    SIDEBAR_TOP[0],
    { key: 'contracts.list' as RouteKey, label: 'Hợp đồng', icon: <FileTextIcon className="h-[16px] w-[16px]" /> },
    { key: 'dispatch' as RouteKey, label: 'Công văn', icon: <MailIcon className="h-[16px] w-[16px]" /> },
    { key: 'reports' as RouteKey, label: 'Báo cáo', icon: <BarChart3Icon className="h-[16px] w-[16px]" /> },
    { key: 'search' as RouteKey, label: 'Tìm kiếm', icon: <SearchIcon className="h-[16px] w-[16px]" /> },
  ].filter((item) => {
    const match = item.key === 'contracts.list'
      ? hasPermission('contracts.read')
      : item.key === 'dispatch'
        ? hasPermission('annexes.read')
        : item.key === 'reports'
          ? hasPermission('reports.view')
          : item.key === 'search'
            ? hasPermission('works.read')
            : hasPermission('portal.access');
    return match;
  });

  const railActive = (key: RouteKey) => key === 'contracts.list' ? contractsActive : current === key;

  return (
    <aside className="vc-enterprise-sidebar hidden md:flex h-screen shrink-0 sticky top-0 z-30 overflow-hidden">
      <div className="vc-enterprise-icon-rail">
        <div className="vc-enterprise-icon-rail__top">
          <button
            type="button"
            className="vc-enterprise-rail-home"
            onClick={() => onNavigate('dashboard')}
            aria-label="Go to dashboard"
            title="Dashboard"
          >
            <LayoutDashboardIcon className="h-[15px] w-[15px]" />
          </button>
          <div className="vc-enterprise-rail-stack">
            {primaryRailItems.map((item) => {
              const active = railActive(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  title={item.label}
                  onClick={() => onNavigate(item.key)}
                  className={`vc-enterprise-rail-button ${active ? 'is-active' : ''}`}
                >
                  {item.icon}
                </button>
              );
            })}
          </div>
        </div>
        <div className="vc-enterprise-rail-bottom">
          <div className="vc-enterprise-rail-status" title="Workspace đang hoạt động">
            <UserCircle2Icon className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      <div className="vc-enterprise-sidebar-panel w-[15rem] flex flex-col relative overflow-hidden">
      {/* Workspace panel accent lines */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.18]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 7px, rgba(45,212,191,0.24) 7px, rgba(45,212,191,0.24) 8px)',
          maskImage: 'linear-gradient(to bottom, black, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
        }}
      />

      <div className="relative px-5 py-5 border-b border-white/8 flex items-center gap-3">
        <div className="relative h-10 w-10 rounded-xl bg-white/95 flex items-center justify-center shadow-sm ring-1 ring-inset ring-white/70 overflow-hidden">
          <img src={vcpmcLogo} alt="VCPMC" className="h-full w-full object-cover" />
          <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--vc-enterprise-accent)] shadow-[0_0_6px_rgba(45,212,191,0.8)]" />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[12px] font-bold text-white tracking-tight uppercase">
            VCPMC
          </span>
          <span className="text-[9px] text-[var(--vc-enterprise-accent)] uppercase tracking-[0.18em] font-semibold leading-tight">
            Quyền tác giả Âm nhạc · Hợp đồng
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="vc-enterprise-workspace-card">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="vc-enterprise-workspace-card__eyebrow">Workspace</p>
              <p className="vc-enterprise-workspace-card__title">{activeWorkspace?.label ?? 'Background'}</p>
            </div>
            <span className="vc-enterprise-workspace-card__status" title="Workspace đang hoạt động" aria-label="Active workspace">
              <span className="vc-enterprise-workspace-card__status-dot" />
              <span className="vc-enterprise-workspace-card__status-label">Active</span>
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-4 pt-3">
        {groupLabel('Tổng quan')}
        <div className="flex flex-col gap-0.5">
          {SIDEBAR_TOP.map((it) => renderItem(it))}
        </div>

        {hasPermission('contracts.read') &&
        <>
            {groupLabel('Nghiệp vụ')}
            <div className="flex flex-col gap-0.5">
              <button
              type="button"
              onClick={() => setContractsOpen((o) => !o)}
              className={`group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[12.5px] font-medium transition-colors duration-fast ease-out ${
                contractsActive
                  ? 'text-white bg-[var(--vc-enterprise-accent)]/12 ring-1 ring-inset ring-[var(--vc-enterprise-accent)]/25'
                  : 'text-white/68 hover:text-white hover:bg-white/[0.045]'
              }`}>
                <span className={`shrink-0 ${contractsActive ? 'text-[var(--vc-enterprise-accent)]' : 'text-white/42 group-hover:text-white/78'}`}>
                  <FileTextIcon className="h-[15px] w-[15px]" />
                </span>
                <span className="flex-1 text-left">Hợp đồng</span>
                <ChevronDownIcon
                className={`h-3 w-3 text-white/42 transition-transform duration-fast ${contractsOpen ? 'rotate-0' : '-rotate-90'}`} />
              </button>
              <div
              className={`flex flex-col overflow-hidden transition-all duration-base ml-4 ${contractsOpen ? 'max-h-72 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                {SIDEBAR_CONTRACTS_CHILDREN.map((c) => renderItem(c, true))}
              </div>
              {SIDEBAR_BUSINESS_REST.map((it) => renderItem(it))}
            </div>
          </>
        }

        {groupLabel('Hệ thống')}
        <div className="flex flex-col gap-0.5">
          {SIDEBAR_SYSTEM.map((it) => renderItem(it))}
        </div>
      </nav>

      <div className="vc-enterprise-sidebar-footer">
        <span className="vc-enterprise-sidebar-footer__version">v1.0 · INTERNAL</span>
        <span className="vc-enterprise-sidebar-footer__divider" aria-hidden="true" />
        <span className="vc-enterprise-sidebar-footer__status">
          <span className="vc-enterprise-sidebar-footer__status-dot" />
          Online
        </span>
      </div>
      </div>
    </aside>);

}
