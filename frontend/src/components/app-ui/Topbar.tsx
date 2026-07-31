import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  BellIcon,
  ChevronDownIcon,
  SearchIcon,
  LogOutIcon,
  UserIcon,
  SettingsIcon,
  KeyIcon,
  LayoutGridIcon,
  PanelLeftIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { DOMAINS, ROLE_DEFS } from '../../data/authData';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { NotificationsDropdown } from './NotificationsDropdown';
import { RouteKey } from '../../data/routes';
import { ThemeToggle } from './ThemeToggle';
import { LayoutMode } from './useLayoutMode';

const ROUTE_LABELS: Partial<Record<RouteKey, { label: string; group?: string }>> = {
  dashboard: { label: 'Dashboard', group: 'Tổng quan' },
  'contracts.list': { label: 'Danh sách hợp đồng', group: 'Hợp đồng' },
  'contracts.detail': { label: 'Chi tiết hợp đồng', group: 'Hợp đồng' },
  'contracts.edit': { label: 'Chỉnh sửa hợp đồng', group: 'Hợp đồng' },
  'contracts.create': { label: 'Tạo hợp đồng', group: 'Hợp đồng' },
  'contracts.print': { label: 'In GCN', group: 'GCN' },
  annexes: { label: 'Phụ lục', group: 'Nghiệp vụ' },
  dispatch: { label: 'Công văn', group: 'Nghiệp vụ' },
  reports: { label: 'Báo cáo', group: 'Nghiệp vụ' },
  search: { label: 'Tìm kiếm', group: 'Nghiệp vụ' },
  'admin.users': { label: 'Người dùng', group: 'Hệ thống' },
  'admin.permissions': { label: 'Phân quyền', group: 'Hệ thống' },
  'admin.import': { label: 'Import Excel', group: 'Hệ thống' },
  'admin.deployment': { label: 'Triển khai', group: 'Hệ thống' },
  assistant: { label: 'AI Assistant', group: 'Hệ thống' },
};

// Detect Mac vs Windows for shortcut display.
function detectShortcutLabel(): { key: string; symbol: string } {
  if (typeof window === 'undefined') return { key: 'Ctrl K', symbol: 'Ctrl' };
  const platform = (navigator.platform || '').toLowerCase();
  const ua = (navigator.userAgent || '').toLowerCase();
  if (platform.includes('mac') || ua.includes('mac')) {
    return { key: '⌘K', symbol: '⌘' };
  }
  return { key: 'Ctrl K', symbol: 'Ctrl' };
}

export function Topbar({
  workspace,
  onWorkspaceChange,
  userEmail,
  current,
  onNavigate,
  compact = false,
  bare = false,
  layoutMode,
  onLayoutModeChange,
}: {
  workspace: string;
  onWorkspaceChange: (id: string) => void;
  userEmail: string;
  current?: RouteKey;
  onNavigate?: (k: RouteKey) => void;
  /**
   * compact = true renders only the right-side utility cluster
   * (search button, workspace chip, theme, bell, avatar).
   * Used by CommandCenter to embed the utility group inside its own topbar.
   */
  compact?: boolean;
  /**
   * bare = true renders a minimal avatar-only user button. All other
   * controls (search pill, workspace chip, theme toggle, layout switch)
   * live in the Orb Launcher.
   * + keydown listener + profile/password modals so Ctrl K keeps working
   * regardless of where the user is.
   */
  bare?: boolean;
  layoutMode?: LayoutMode;
  onLayoutModeChange?: (m: LayoutMode) => void;
}) {
  const { currentUser, logout, hasDomain, hasPermission } = useAuth();
  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const shortcut = useMemo(detectShortcutLabel, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setWsOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Ctrl K now lives in CommandCenter.tsx — Topbar no longer owns it.

  const allowedDomains = DOMAINS.filter((d) => !d.adminOnly && hasDomain(d.id));
  const activeWs =
    allowedDomains.find((w) => w.id === workspace) ??
    allowedDomains[0] ??
    DOMAINS[0];
  const isAmber = activeWs.accent === 'amber';
  const wsDot = isAmber ? 'bg-amber-400' : 'bg-[#c89968]';
  const wsGlow = isAmber
    ? 'shadow-[0_0_8px_rgba(251,191,36,0.55)]'
    : 'shadow-[0_0_8px_rgba(200,153,104,0.6)]';

  // Real notifications: there is no backend endpoint yet. The dropdown still
  // works (shows an empty state), but the unread red dot is HONEST — only
  // rendered when there is at least one unread item.
  const NOTIFICATIONS_ENABLED = false; // toggle to true when backend ships
  const unreadCount = 0;

  const roleName = currentUser
    ? ROLE_DEFS[currentUser.role as keyof typeof ROLE_DEFS]?.name
    : '';

  const currentMeta = current ? ROUTE_LABELS[current] : undefined;

  // -- Utility cluster (rendered in both legacy and Command Center modes) --
  // Grouped into two sub-clusters separated by a thin vertical divider:
  //   actions:  workspace chip (and notifications, when enabled)
  //   account:  theme toggle, user menu
  // The wrapper uses ml-auto on the actions group so the cluster sticks to
  // the right edge of the topbar, with consistent intra/inter-group gaps.
  const utilityCluster = (
    <div className="vc-topbar-utility ml-auto flex items-center">
      {/* ── Action group: workspace chip (+ notifications when enabled) ── */}
      <div className="vc-topbar-utility__group vc-topbar-utility__actions flex items-center gap-2.5">
      {!compact && (
        <div className="relative flex-1 max-w-md group">
          <button
            type="button"
            onClick={() => setPaletteOpen((open) => !open)}
            className="vc-enterprise-search w-full h-9 pl-9 pr-14 text-sm rounded-xl text-left transition-all"
            aria-label="Mở Command Palette"
          >
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 group-hover:text-[var(--vc-enterprise-accent)] transition-colors" />
            <span className="truncate text-stone-500">Tìm hợp đồng, GCN, đối tác... hoặc nhấn {shortcut.key}</span>
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 px-1.5 h-5 inline-flex items-center text-[10px] font-semibold text-stone-400 bg-stone-100 border border-stone-200 rounded shadow-xs">
              {shortcut.key}
            </kbd>
          </button>
        </div>
      )}

      {!compact && <div className="flex-1" />}

      <div ref={wsRef} className="relative">
        <button
          type="button"
          onClick={() => {
            // If only one workspace is available, the dropdown is display-only.
            if (allowedDomains.length <= 1) return;
            setWsOpen((o) => !o);
          }}
          className="vc-enterprise-topbar-chip vc-topbar-workspace h-9 pl-2.5 pr-2.5 inline-flex items-center gap-2 rounded-xl text-sm transition-all shadow-xs disabled:cursor-default"
          title={allowedDomains.length <= 1 ? 'Mảng làm việc hiện tại' : 'Đổi mảng làm việc'}
          aria-label={`Mảng làm việc: ${activeWs.label}`}
          disabled={allowedDomains.length <= 1}
        >
          <span className={`h-2 w-2 rounded-full ${wsDot} ${wsGlow}`} />
          <span className="vc-topbar-workspace__label">Mảng:</span>
          <span className="vc-topbar-workspace__value font-semibold">
            {activeWs.label}
          </span>
          {allowedDomains.length > 1 && (
            <ChevronDownIcon className="h-3.5 w-3.5 text-stone-400 vc-topbar-workspace__chev" />
          )}
        </button>
        {wsOpen && allowedDomains.length > 1 && (
          <div className="vc-topbar-workspace__menu absolute right-0 top-11 w-56 rounded-2xl ring-1 shadow-2xl py-1.5 z-30 origin-top-right max-h-96 overflow-y-auto">
            <p className="vc-topbar-workspace__menu-label px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
              Mảng làm việc
            </p>
            {allowedDomains.map((w) => {
              const dot = w.accent === 'amber' ? 'bg-amber-400' : 'bg-[#c89968]';
              const isActive = w.id === workspace;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    onWorkspaceChange(w.id);
                    setWsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm vc-topbar-workspace__menu-item inline-flex items-center gap-2 transition-colors ${isActive ? 'is-active' : ''}`}
                >
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  {w.label}
                  {isActive && (
                    <span className="ml-auto text-[10px] font-bold tracking-wider uppercase text-[var(--vc-enterprise-accent)]">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ThemeToggle />

      {NOTIFICATIONS_ENABLED && (
        <div ref={notifRef} className="relative">
          <button
            type="button"
            aria-label="Thông báo"
            onClick={() => setNotifOpen((o) => !o)}
            className={`relative h-9 w-9 inline-flex items-center justify-center rounded-xl transition-colors ${
              notifOpen
                ? 'bg-white/8 text-[var(--vc-enterprise-accent)] ring-1 ring-white/10'
                : 'text-white/68 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <BellIcon className="h-[17px] w-[17px]" />
            {unreadCount > 0 && (
              <span
                aria-label={`${unreadCount} chưa đọc`}
                className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-danger text-[9px] font-bold text-white inline-flex items-center justify-center ring-2 ring-[#0f1b18]"
              >
                {unreadCount}
              </span>
            )}
          </button>
          {notifOpen && <NotificationsDropdown onClose={() => setNotifOpen(false)} />}
        </div>
      )}
      </div>
      {/* ── Subtle vertical divider between actions and account ── */}
      <span aria-hidden className="vc-topbar-utility__divider" />
      {/* ── Account group: theme toggle + user menu ── */}
      <div className="vc-topbar-utility__group vc-topbar-utility__account flex items-center gap-2">

      <div ref={userRef} className="relative">
        <button
          type="button"
          onClick={() => setUserOpen((o) => !o)}
          className="vc-topbar-user h-9 pl-1 pr-1 sm:pr-2.5 inline-flex items-center gap-2 rounded-xl ring-1 ring-transparent hover:ring-white/10 hover:bg-white/[0.04] transition-all"
          aria-label="Tài khoản"
          title="Tài khoản"
        >
          <span className="relative h-7 w-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-950 text-white text-[11px] font-semibold flex items-center justify-center shadow-xs">
            {currentUser?.avatarInitial || 'U'}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10"
            />
          </span>
          <span className="vc-topbar-user__email hidden md:inline text-sm text-white font-medium max-w-[200px] truncate">
            {userEmail}
          </span>
          <ChevronDownIcon className="hidden sm:inline h-3.5 w-3.5 text-white/36" />
        </button>
        {userOpen && (
          <div className="vc-topbar-user-menu absolute right-0 mt-2.5 w-[260px] rounded-2xl bg-[#0f1b18]/95 backdrop-blur-md ring-1 ring-white/10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)] py-1.5 z-40 origin-top-right">
            <div className="px-3 py-2.5 border-b border-white/10">
              <p className="text-sm font-semibold text-white truncate">
                {currentUser?.name}
              </p>
              <p className="text-xs text-white/48 mt-0.5">{roleName}</p>
            </div>
            <button
              onClick={() => {
                setShowProfile(true);
                setUserOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/40 cursor-not-allowed"
              disabled
              aria-disabled="true"
              title="Hồ sơ cá nhân (sắp ra mắt)"
            >
              <UserIcon className="h-4 w-4" /> Hồ sơ cá nhân
              <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-white/28">
                Sắp ra mắt
              </span>
            </button>
            {layoutMode !== undefined && onLayoutModeChange && (
              <div className="my-1 border-t border-white/10" />
            )}
            {layoutMode !== undefined && onLayoutModeChange && (
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/32">
                Giao diện
              </p>
            )}
            {layoutMode !== undefined && onLayoutModeChange && (
              <button
                onClick={() => {
                  onLayoutModeChange('command-center');
                  setUserOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  layoutMode === 'command-center'
                    ? 'text-[var(--vc-enterprise-accent)] bg-white/[0.05]'
                    : 'text-white/72 hover:bg-white/[0.05]'
                }`}
              >
                <LayoutGridIcon className="h-4 w-4 text-fg-muted" />
                <span className="flex-1 text-left">Command Center</span>
                {layoutMode === 'command-center' && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--vc-enterprise-accent)]">
                    Active
                  </span>
                )}
              </button>
            )}
            {layoutMode !== undefined && onLayoutModeChange && (
              <button
                onClick={() => {
                  onLayoutModeChange('sidebar');
                  setUserOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  layoutMode === 'sidebar'
                    ? 'text-[var(--vc-enterprise-accent)] bg-white/[0.05]'
                    : 'text-white/72 hover:bg-white/[0.05]'
                }`}
              >
                <PanelLeftIcon className="h-4 w-4 text-fg-muted" />
                <span className="flex-1 text-left">Sidebar cũ</span>
                {layoutMode === 'sidebar' && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--vc-enterprise-accent)]">
                    Active
                  </span>
                )}
              </button>
            )}
            <div className="my-1 border-t border-white/10" />
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-rose-500/10 transition-colors"
            >
              <LogOutIcon className="h-4 w-4" /> Đăng xuất
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );

  // -- Full legacy topbar (only when neither compact nor bare) --
  if (!compact && !bare) {
    return (
      <>
        <header className="vc-enterprise-topbar sticky top-0 z-20 h-14 px-4 sm:px-6 flex items-center gap-3">
          {currentMeta && (
            <nav className="hidden lg:flex items-center gap-1.5 text-[12.5px] mr-2 shrink-0">
              {currentMeta.group && (
                <>
                  <span className="text-stone-500 font-medium">{currentMeta.group}</span>
                  <span className="text-stone-300">/</span>
                </>
              )}
              <span className="text-stone-950 font-semibold tracking-tight">{currentMeta.label}</span>
            </nav>
          )}
          {utilityCluster}
        </header>
        <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
        <ChangePasswordModal
          open={showPassword}
          onClose={() => setShowPassword(false)}
        />
      </>
    );
  }

  // -- Compact: just the utility cluster (no own <header> wrapper) --
  if (compact) {
    return (
      <>
        {utilityCluster}
        <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
        <ChangePasswordModal
          open={showPassword}
          onClose={() => setShowPassword(false)}
        />
      </>
    );
  }

  // -- Bare: avatar-only user button. Command Center default (V4 minimal
  // topbar). Keeps profile/password modals; Ctrl K lives in CommandCenter
  // modal still work; only the chrome itself is reduced to a single avatar.
  const bareAvatar = (
    <div ref={userRef} className="relative">
      <button
        type="button"
        onClick={() => setUserOpen((o) => !o)}
        className="vc-topbar-user-bare h-9 w-9 inline-flex items-center justify-center rounded-xl ring-1 ring-transparent hover:ring-white/10 hover:bg-white/[0.04] transition-all"
        aria-label="Tài khoản"
        title={currentUser?.name ?? 'Tài khoản'}
      >
        <span className="relative h-7 w-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-950 text-white text-[11px] font-semibold flex items-center justify-center shadow-xs">
          {currentUser?.avatarInitial || 'U'}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10"
          />
        </span>
      </button>
      {userOpen && (
        <div className="vc-topbar-user-menu absolute right-0 mt-2.5 w-[260px] rounded-2xl bg-[#0f1b18]/95 backdrop-blur-md ring-1 ring-white/10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)] py-1.5 z-40 origin-top-right">
          <div className="px-3 py-2.5 border-b border-white/10">
            <p className="text-sm font-semibold text-white truncate">
              {currentUser?.name}
            </p>
            <p className="text-xs text-white/48 mt-0.5">{userEmail}</p>
          </div>
          <button
            onClick={() => {
              setShowProfile(true);
              setUserOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/40 cursor-not-allowed"
            disabled
            aria-disabled="true"
            title="Hồ sơ cá nhân (sắp ra mắt)"
          >
            <UserIcon className="h-4 w-4" /> Hồ sơ cá nhân
            <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-white/28">
              Sắp ra mắt
            </span>
          </button>
          <div className="my-1 border-t border-white/10" />
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-rose-500/10 transition-colors"
          >
            <LogOutIcon className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {bareAvatar}
      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
      <ChangePasswordModal
        open={showPassword}
        onClose={() => setShowPassword(false)}
      />
    </>
  );
}

function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const roleName = ROLE_DEFS[currentUser.role as keyof typeof ROLE_DEFS]?.name;
  const domainsText = currentUser.domains.includes('__all__')
    ? 'Tất cả lĩnh vực'
    : DOMAINS.filter((d) => currentUser.domains.includes(d.id))
        .map((d) => d.label)
        .join(', ');
  return (
    <Modal open={open} onClose={onClose} title="Hồ sơ cá nhân" maxWidth="sm">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-950 text-white text-2xl font-semibold flex items-center justify-center shadow-lg">
            {currentUser.avatarInitial}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">
              {currentUser.name}
            </h3>
            <p className="text-sm text-zinc-500">{currentUser.email}</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Vai trò
            </label>
            <p className="mt-1 text-sm font-medium text-zinc-900">{roleName}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Phạm vi nghiệp vụ
            </label>
            <p className="mt-1 text-sm text-zinc-900 leading-relaxed">
              {domainsText}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Trạng thái
              </label>
              <p className="mt-1 text-sm text-lime-600 font-medium flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-lime-500" /> Hoạt động
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Đăng nhập lần cuối
              </label>
              <p className="mt-1 text-sm text-zinc-900">
                {currentUser.lastLogin}
              </p>
            </div>
          </div>
        </div>
        <div className="pt-4 border-t border-zinc-100 flex justify-end">
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [success, setSuccess] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // NOTE: This control currently does not call the backend.
    // It is kept visible but visibly decorative. We do not auto-close the
    // modal — the user can cancel — to avoid faking a real password change.
    setSuccess(true);
  };
  return (
    <Modal open={open} onClose={onClose} title="Đổi mật khẩu" maxWidth="sm">
      <div className="p-6">
        {success ? (
          <div className="text-center py-6">
            <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <KeyIcon className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 mb-2">
              Tính năng đang được hoàn thiện
            </h3>
            <p className="text-sm text-zinc-500">
              Đổi mật khẩu sẽ được kích hoạt khi backend hỗ trợ endpoint.
            </p>
            <Button className="mt-5" variant="secondary" onClick={onClose}>Đóng</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200/70 rounded-md px-3 py-2">
              Tính năng đang được hoàn thiện. Việc đổi mật khẩu sẽ được kích hoạt khi backend sẵn sàng.
            </p>
            <Input
              label="Mật khẩu hiện tại"
              type="password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled
            />
            <Input
              label="Mật khẩu mới"
              type="password"
              required
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              disabled
            />
            <Input
              label="Nhập lại mật khẩu mới"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled
            />
            <div className="pt-4 flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>Hủy</Button>
              <Button variant="primary" type="submit" disabled>
                Cập nhật
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
