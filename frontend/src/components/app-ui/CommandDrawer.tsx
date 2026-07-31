import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  FilterIcon,
  LayoutGridIcon,
  PanelLeftIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  FileTextIcon,
  AwardIcon,
  MailIcon,
  BarChart3Icon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  XIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { DOMAINS } from '../../data/authData';
import { RouteKey } from '../../data/routes';
import {
  DRAWER_GROUPS,
  DRAWER_QUICK_ACTIONS,
  TOP_LEVEL_MODULES,
  type NavItem,
} from './navConfig';
import { LayoutMode } from './useLayoutMode';
import vcpmcLogo from '../../assets/vcpmc-logo-animated.webp';

/**
 * CommandLauncher — premium floating launcher with rail + panel layout.
 *
 * Inspired by macOS Spotlight / Raycast style: a compact rail on the left
 * with primary section icons, and a full content panel on the right with
 * nav groups, quick actions, search, and footer controls.
 *
 * Layout:
 *  +--------------------------------------------------------------+
 *  | backdrop (dims page content, not topbar)                     |
 *  +--------------------------------------------------------------+
 *  | +----------------------------------------------------------+ |
 *  | | launcher shell (grid: rail | content)                    | |
 *  | | +--------+-----------------------------------------------+| |
 *  | | |  rail |  header + search + quick actions + nav groups  | |
 *  | | | (72px)|  + footer                                     | |
 *  | | +--------+-----------------------------------------------+| |
 *  | +----------------------------------------------------------+ |
 *  +--------------------------------------------------------------+
 *
 * The launcher does NOT cover the topbar/orb (z-30). The backdrop
 * starts below the topbar. The rail provides direct navigation
 * to top-level sections; clicking a rail item navigates and closes.
 */

// ─── Rail icons map (top-level modules → icons + labels) ───────────────────
// Each rail item is a CATEGORY SELECTOR (section switcher), NOT a navigation
// link. Clicking switches the active section in the launcher panel without
// closing the launcher and without changing the route.
const RAIL_ITEMS: (NavItem & { sectionLabel: string })[] = [
  { key: 'dashboard', label: 'Tổng quan', sectionLabel: 'Tổng quan', icon: <LayoutDashboardIcon className="h-[18px] w-[18px]" />, requiredPerm: 'portal.access' },
  { key: 'contracts.list', label: 'Hợp đồng', sectionLabel: 'Hợp đồng', icon: <FileTextIcon className="h-[18px] w-[18px]" />, requiredPerm: 'contracts.read' },
  { key: 'contracts.print', label: 'GCN', sectionLabel: 'GCN', icon: <AwardIcon className="h-[18px] w-[18px]" />, requiredPerm: 'contracts.read' },
  { key: 'dispatch', label: 'Công văn', sectionLabel: 'Công văn', icon: <MailIcon className="h-[18px] w-[18px]" />, requiredPerm: 'annexes.read' },
  { key: 'reports', label: 'Báo cáo', sectionLabel: 'Báo cáo', icon: <BarChart3Icon className="h-[18px] w-[18px]" />, requiredPerm: 'reports.view' },
  { key: 'search', label: 'Tìm kiếm', sectionLabel: 'Tìm kiếm', icon: <SearchIcon className="h-[18px] w-[18px]" />, requiredPerm: 'works.read' },
  { key: 'admin.users', label: 'Hệ thống', sectionLabel: 'Hệ thống', icon: <FilterIcon className="h-[18px] w-[18px]" />, requiredPerm: 'admin.users.manage' },
];

// ─── Section group mapping ─────────────────────────────────────────────────
// Which DRAWER_GROUPS labels should be shown when a section is active.
const SECTION_TO_GROUPS: Record<string, string[]> = {
  'Tổng quan': ['Tổng quan'],
  'Hợp đồng': ['Hợp đồng'],
  'GCN': ['GCN'],
  'Công văn': ['Công văn'],
  'Báo cáo': ['Báo cáo'],
  'Tìm kiếm': ['Tìm kiếm'],
  'Hệ thống': ['Hệ thống'],
};

// Map a quick-action route key to a WorkflowSheet kind. Returns null if the
// action should remain a plain navigation (no sheet).
function quickActionToWorkflow(key: RouteKey): 'create-contract' | 'print-gcn' | 'dispatches' | null {
  switch (key) {
    case 'contracts.create': return 'create-contract';
    case 'contracts.print': return 'print-gcn';
    case 'dispatch': return 'dispatches';
    default: return null;
  }
}

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  workspace: string;
  onWorkspaceChange?: (id: string) => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (m: LayoutMode) => void;
  onOpenWorkflow?: (k: 'create-contract' | 'print-gcn' | 'dispatches') => void;
  drawerRef?: React.RefObject<HTMLDivElement | null>;
};

export const CommandDrawer = forwardRef<{ focusSearch: () => void }, DrawerProps>(
  function CommandDrawer(
    {
      open,
      onClose,
      current,
      onNavigate,
      workspace,
      onWorkspaceChange,
      layoutMode,
      onLayoutModeChange,
      onOpenWorkflow,
      drawerRef,
    }: DrawerProps,
    ref,
  ) {
    const { currentUser, logout, hasPermission, hasDomain } = useAuth();
    const [query, setQuery] = useState('');
    const [selectedSection, setSelectedSection] = useState('Tổng quan');
    const [showSettings, setShowSettings] = useState(false);
    const themeStorageKey = currentUser?.id
      ? `vcpmc.theme.dark.${currentUser.id}`
      : 'vcpmc.theme.dark';
    const [themeDark, setThemeDark] = useState(() => {
      if (typeof window === 'undefined') return true;
      return localStorage.getItem(themeStorageKey) === '1';
    });
    const searchRef = useRef<HTMLInputElement>(null);

    // Expose focusSearch to parent so CommandCenter can call it on Ctrl+K.
    useImperativeHandle(ref, () => ({
      focusSearch: () => searchRef.current?.focus(),
    }), []);

    // Listen for vcpmc:focus-launcher-search dispatched by CommandCenter on Ctrl+K.
    useEffect(() => {
      if (!open) return;
      const handler = () => searchRef.current?.focus();
      window.addEventListener('vcpmc:focus-launcher-search', handler);
      return () => window.removeEventListener('vcpmc:focus-launcher-search', handler);
    }, [open]);

    // Reload theme preference when active user changes so logout/login as
    // another account does not inherit the previous user's theme.
    useEffect(() => {
      if (typeof window === 'undefined') return;
      setThemeDark(localStorage.getItem(themeStorageKey) === '1');
    }, [themeStorageKey]);

    // Sync theme
    useEffect(() => {
      const el = document.documentElement;
      if (themeDark) el.classList.add('theme-obsidian');
      else el.classList.remove('theme-obsidian');
      localStorage.setItem(themeStorageKey, themeDark ? '1' : '0');
    }, [themeDark, themeStorageKey]);

    // Focus trap: Tab/Shift+Tab wrap inside the sidecar.
    useEffect(() => {
      if (!open) return;
      const panel = drawerRef.current;
      if (!panel) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    // Keyboard shortcuts (ESC to close, Ctrl+F to focus search).
    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
          return;
        }
        const isFind = (e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F');
        if (isFind) {
          e.preventDefault();
          searchRef.current?.focus();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    // Reset state on close.
    useEffect(() => {
      if (!open) {
        setQuery('');
        setSelectedSection('Tổng quan');
        setShowSettings(false);
      }
    }, [open]);

    const visibleRailItems = useMemo(
      () => RAIL_ITEMS.filter((it) => !it.requiredPerm || hasPermission(it.requiredPerm)),
      [hasPermission],
    );

    const visibleWorkspaces = useMemo(
      () => DOMAINS.filter((d) => !d.adminOnly && hasDomain(d.id)),
      [hasDomain],
    );
    const activeWorkspaceLabel =
      visibleWorkspaces.find((w) => w.id === workspace)?.label ??
      (DOMAINS.find((d) => d.id === workspace)?.label ?? '—');

    const visibleQuickActions = useMemo(
      () => DRAWER_QUICK_ACTIONS.filter((it) => !it.requiredPerm || hasPermission(it.requiredPerm)),
      [hasPermission],
    );

    // Determine which section to show based on current route.
    const defaultSection = useMemo(() => {
      if (!current) return 'Tổng quan';
      const found = RAIL_ITEMS.find((r) => r.key === current);
      return found?.sectionLabel ?? 'Tổng quan';
    }, [current]);

    // Determine if the active section's primary actions are quick-only.
    const activeQuickOnly = useMemo(() => {
      const sectionGroups = SECTION_TO_GROUPS[selectedSection] ?? [];
      return DRAWER_GROUPS
        .filter((g) => sectionGroups.includes(g.label))
        .every((g) => g.quickOnly);
    }, [selectedSection]);

    // Reset selected section when opening.
    useEffect(() => {
      if (open) setSelectedSection(defaultSection);
    }, [open, defaultSection]);

    // Visible groups filtered by query and selected section.
    const visibleGroups = useMemo(() => {
      const needle = query.trim().toLowerCase();
      const sectionGroups = SECTION_TO_GROUPS[selectedSection] ?? [];

      return DRAWER_GROUPS
        .map((g) => ({
          ...g,
          items: g.items.filter((it) => {
            if (it.requiredPerm && !hasPermission(it.requiredPerm)) return false;
            if (!needle) {
              return sectionGroups.includes(g.label);
            }
            return (
              it.label.toLowerCase().includes(needle) ||
              g.label.toLowerCase().includes(needle)
            );
          }),
        }))
        .filter((g) => g.items.length > 0);
    }, [hasPermission, query, selectedSection]);

    const isRouteActive = (key: RouteKey): boolean => {
      if (key === current) return true;
      if (key === 'contracts.list' && ['contracts.create', 'contracts.edit', 'contracts.detail', 'contracts.print'].includes(current)) {
        return true;
      }
      if (key === 'admin.users' && ['admin.permissions', 'admin.import', 'assistant'].includes(current)) {
        return true;
      }
      return false;
    };

    const handleRailClick = (item: (typeof RAIL_ITEMS)[number]) => {
      setSelectedSection(item.sectionLabel);
      setShowSettings(false);
    };

    const handleNavItemClick = (key: RouteKey) => {
      onNavigate(key);
      onClose();
    };

    if (!open) return null;

    return (
      <div
        className="vc-launcher-root vc-launcher-root--orb-anchored"
        role="dialog"
        aria-label="VCPMC Command Launcher"
        aria-modal="false"
      >
        <div className="vc-launcher-backdrop" onClick={onClose} aria-hidden />

        <div
          ref={drawerRef}
          className="vc-launcher-shell vc-launcher-shell--orb-anchored"
          onClick={(e) => e.stopPropagation()}
          role="document"
        >
          <span className="vc-launcher-shell__notch" aria-hidden />

          {/* ── Left rail ── */}
          <aside className="vc-launcher-rail" aria-label="Điều hướng nhanh">
            <div className="vc-launcher-rail__brand" title="VCPMC Command Launcher">
              <img src={vcpmcLogo} alt="VCPMC" className="vc-launcher-rail__logo" />
            </div>

            <nav className="vc-launcher-rail__nav" aria-label="Các mục chính">
              {visibleRailItems.map((item) => {
                const isActive = item.sectionLabel === selectedSection && !showSettings;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleRailClick(item)}
                    className={`vc-launcher-rail__btn ${isActive ? 'is-active' : ''}`}
                    title={item.label}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.icon}
                  </button>
                );
              })}
            </nav>

            <div className="vc-launcher-rail__bottom">
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className={`vc-launcher-rail__btn ${showSettings ? 'is-active' : ''}`}
                title="Cài đặt giao diện"
                aria-label="Cài đặt giao diện"
                aria-pressed={showSettings}
              >
                <SettingsIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          </aside>

          {/* ── Main content panel ── */}
          <div className="vc-launcher-panel">
            {/* Header */}
            <div className="vc-launcher-panel__header">
              <div className="vc-launcher-panel__brand">
                <span className="vc-launcher-panel__brand-mark">VCPMC</span>
                <span className="vc-launcher-panel__brand-title">Command Center</span>
                <span className="vc-launcher-panel__brand-tag">Internal</span>
              </div>
              <div className="vc-launcher-panel__header-right">
                <button
                  type="button"
                  onClick={onClose}
                  className="vc-launcher-panel__close"
                  aria-label="Đóng trung tâm điều hướng"
                  title="Đóng (Esc)"
                >
                  <XIcon className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* V6: Primary search — the single search entry point. */}
            <div className="vc-launcher-panel__search">
              <label className="vc-launcher-primary-search">
                <SearchIcon className="vc-launcher-primary-search__icon" aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm hợp đồng, GCN, đối tác, menu..."
                  className="vc-launcher-primary-search__input"
                  aria-label="Tìm kiếm"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="vc-launcher-primary-search__clear"
                    aria-label="Xoá tìm kiếm"
                    title="Xoá"
                  >
                    ×
                  </button>
                ) : (
                  <kbd className="vc-launcher-primary-search__kbd">ESC</kbd>
                )}
              </label>
            </div>

            {/* Scrollable content */}
            <div className="vc-launcher-panel__scroll">
              {/* Quick actions */}
              {visibleQuickActions.length > 0 && (
                <div className="vc-launcher-quick">
                  {visibleQuickActions.map((qa) => {
                    const active = isRouteActive(qa.key);
                    const workflowKind = quickActionToWorkflow(qa.key);
                    return (
                      <button
                        key={qa.key}
                        type="button"
                        onClick={() => {
                          if (workflowKind && onOpenWorkflow) {
                            onOpenWorkflow(workflowKind);
                            onClose();
                          } else {
                            handleNavItemClick(qa.key);
                          }
                        }}
                        className={`vc-launcher-quick__btn ${active ? 'is-active' : ''}`}
                        title={qa.label}
                        aria-label={qa.label}
                      >
                        <span className="vc-launcher-quick__icon">{qa.icon}</span>
                        <span className="vc-launcher-quick__label">{qa.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeQuickOnly && (
                <p className="vc-launcher-helper">
                  Tác vụ chính của mục này nằm ở hàng thao tác nhanh phía trên.
                </p>
              )}

              {/* Nav groups */}
              <nav className="vc-launcher-nav" aria-label="Danh sách chức năng">
                {visibleGroups.length === 0 && !activeQuickOnly && (
                  <p className="vc-launcher-nav__empty">Không có mục phù hợp.</p>
                )}
                {visibleGroups.map((g) => (
                  <LauncherGroupBlock
                    key={g.label}
                    group={g}
                    isRouteActive={isRouteActive}
                    onNavigate={handleNavItemClick}
                  />
                ))}
              </nav>
            </div>

            {/* Settings panel */}
            {showSettings && (
              <div className="vc-launcher-settings">
                <p className="vc-launcher-settings__title">Mảng làm việc</p>
                {onWorkspaceChange && visibleWorkspaces.length > 0 ? (
                  <div className="vc-launcher-settings__list">
                    {visibleWorkspaces.map((w) => {
                      const dot = w.accent === 'amber' ? 'bg-amber-400' : 'bg-[#c89968]';
                      const isActive = w.id === workspace;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            onWorkspaceChange(w.id);
                            setShowSettings(false);
                            onClose();
                          }}
                          className={`vc-launcher-settings__listitem ${isActive ? 'is-active' : ''}`}
                          aria-pressed={isActive}
                          title={`Chuyển sang mảng ${w.label}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                          <span className="vc-launcher-settings__listlabel">{w.label}</span>
                          {isActive && <span className="vc-launcher-settings__check" aria-hidden>•</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="vc-launcher-settings__hint">
                    Đang ở mảng: <strong>{activeWorkspaceLabel}</strong>
                  </p>
                )}

                <p className="vc-launcher-settings__title vc-launcher-settings__title--spaced">Giao diện</p>
                <div className="vc-launcher-settings__row">
                  <button
                    type="button"
                    onClick={() => onLayoutModeChange('command-center')}
                    className={`vc-launcher-settings__btn ${layoutMode === 'command-center' ? 'is-active' : ''}`}
                    aria-pressed={layoutMode === 'command-center'}
                    title="Command Center"
                  >
                    <LayoutGridIcon className="h-4 w-4" />
                    <span>Command Center</span>
                    {layoutMode === 'command-center' && <span className="vc-launcher-settings__check" aria-hidden>•</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => onLayoutModeChange('sidebar')}
                    className={`vc-launcher-settings__btn ${layoutMode === 'sidebar' ? 'is-active' : ''}`}
                    aria-pressed={layoutMode === 'sidebar'}
                    title="Sidebar cũ"
                  >
                    <PanelLeftIcon className="h-4 w-4" />
                    <span>Sidebar cũ</span>
                    {layoutMode === 'sidebar' && <span className="vc-launcher-settings__check" aria-hidden>•</span>}
                  </button>
                </div>

                <p className="vc-launcher-settings__title vc-launcher-settings__title--spaced">Chế độ hiển thị</p>
                <div className="vc-launcher-settings__row">
                  <button
                    type="button"
                    onClick={() => setThemeDark(true)}
                    className={`vc-launcher-settings__btn ${themeDark ? 'is-active' : ''}`}
                    aria-pressed={themeDark}
                    title="Chế độ tối"
                  >
                    <MoonIcon className="h-4 w-4" />
                    <span>Tối</span>
                    {themeDark && <span className="vc-launcher-settings__check" aria-hidden>•</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeDark(false)}
                    className={`vc-launcher-settings__btn ${!themeDark ? 'is-active' : ''}`}
                    aria-pressed={!themeDark}
                    title="Chế độ sáng"
                  >
                    <SunIcon className="h-4 w-4" />
                    <span>Sáng</span>
                    {!themeDark && <span className="vc-launcher-settings__check" aria-hidden>•</span>}
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="vc-launcher-panel__footer">
              {currentUser && (
                <div className="vc-launcher-user vc-launcher-user--compact" title={`${currentUser.name} • ${currentUser.email}`}>
                  <span className="vc-launcher-user__avatar">{currentUser.avatarInitial || 'U'}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => { onClose(); logout(); }}
                className="vc-launcher-logout"
                aria-label="Đăng xuất"
              >
                <LogOutIcon className="h-4 w-4" aria-hidden />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

type GroupProps = {
  group: { label: string; system?: boolean; items: { key: RouteKey; label: string; icon: React.ReactNode; badge?: string }[] };
  isRouteActive: (k: RouteKey) => boolean;
  onNavigate: (k: RouteKey) => void;
};

function LauncherGroupBlock({ group, isRouteActive, onNavigate }: GroupProps) {
  return (
    <div className={`vc-launcher-group ${group.system ? 'is-system' : ''}`}>
      <p className="vc-launcher-group__label">{group.label}</p>
      <div className="vc-launcher-group__items">
        {group.items.map((it) => {
          const active = isRouteActive(it.key);
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onNavigate(it.key)}
              className={`vc-launcher-item ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="vc-launcher-item__icon">{it.icon}</span>
              <span className="vc-launcher-item__label">{it.label}</span>
              {it.badge && <span className="vc-launcher-item__badge">{it.badge}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
