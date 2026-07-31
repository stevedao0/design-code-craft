import React, { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  FilePlus2,
  Printer,
  BarChart3,
  Search,
  Settings as SettingsIcon,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type RailItem = {
  to?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
};

type Props = {
  title: string;
  breadcrumb?: string[];
  statusLabel?: string;
  statusTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  actions?: ReactNode;
  children: ReactNode;
};

const STATUS_TONE_MAP: Record<NonNullable<Props['statusTone']>, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--surface-soft)', fg: 'var(--ink-secondary)' },
  success: { bg: 'var(--vcpmc-success-soft)', fg: 'var(--vcpmc-success)' },
  warning: { bg: 'var(--vcpmc-warning-soft)', fg: 'var(--vcpmc-warning)' },
  danger: { bg: 'var(--vcpmc-danger-soft)', fg: 'var(--vcpmc-danger)' },
  info: { bg: 'var(--vcpmc-info-soft)', fg: 'var(--vcpmc-info)' },
};

export function LuminousAppShell({
  title,
  breadcrumb = ['VCPMC'],
  statusLabel,
  statusTone = 'neutral',
  actions,
  children,
}: Props) {
  const [sidecarOpen, setSidecarOpen] = useState(false);
  const orbRef = useRef<HTMLButtonElement>(null);

  const items: RailItem[] = [
    { to: '/bg', label: 'Trung tâm điều hành', icon: LayoutDashboard },
    { to: '/bg/contracts', label: 'Danh sách hợp đồng', icon: FileText },
    { to: '/bg/contracts/new', label: 'Tạo hợp đồng', icon: FilePlus2 },
    { to: '/bg/contracts/certificates/print', label: 'In GCN', icon: Printer },
    { to: '/bg/design-system', label: 'Hệ thiết kế', icon: BarChart3 },
    { label: 'Tìm kiếm', icon: Search, onClick: () => setSidecarOpen(true) },
  ];

  const tone = STATUS_TONE_MAP[statusTone];

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: 'var(--surface-main)' }}
    >
      {/* RAIL — light */}
      <aside
        className="relative flex shrink-0 flex-col items-center justify-between py-3"
        style={{
          width: 'var(--vcpmc-rail-w)',
          background: 'var(--surface-rail)',
          borderRight: '1px solid var(--border-rail)',
          boxShadow: 'var(--vcpmc-shadow-rail)',
        }}
      >
        <div className="flex flex-col items-center gap-2 pb-2">
          {/* Logo */}
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full">
            <svg viewBox="0 0 60 100" className="h-10 w-6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M535.957 391.46a7.532 7.532 0 1 1-7.531-7.607 7.569 7.569 0 0 1 7.531 7.607z" transform="translate(-506.445 -350.919)" fill="#c95867"/>
              <path d="M519.423 435.958s-.02-30.31-.02-44.432c0-1.372 1.489-7.673 7.73-7.673a7.607 7.607 0 0 1 0 15.214 8.8 8.8 0 0 1-6.756-3.556c.006.249.04 38.436.05 38.6C520.406 436.513 519.423 435.958 519.423 435.958z" transform="translate(-519.403 -383.853)" fill="#c95867"/>
              <path d="M457.219 391.7h15.233s.645 8.772-2.564 16.59c-8.276 20.166-27.4 31.609-50.952 39.784.137.007 47.152-.133 47.152-.133v1.193l-53.578.038s20.21-9.1 24.3-12.274C447.5 428.989 458.339 417.225 457.219 391.7z" transform="translate(-412.509 -357.716)" fill="#c95867"/>
              <path d="M519.784 442.446v-.6c10.623-5.475 29.931-19.8 26.474-50.151l2.324.021C551.782 424.314 529.218 437.967 519.784 442.446z" transform="translate(-505.482 -357.716)" fill="#c95867"/>
            </svg>
          </div>

          <nav className="flex flex-col items-center gap-1.5">
            {items.map((it, i) => {
              const inner = (
                <RailIconBtn label={it.label}>
                  <it.icon className="h-5 w-5" />
                </RailIconBtn>
              );
              return it.to ? (
                <a
                  key={i}
                  href={it.to}
                  title={it.label}
                  className="rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vcpmc-focus)]"
                >
                  {inner}
                </a>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={it.onClick}
                  title={it.label}
                  className="rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vcpmc-focus)]"
                >
                  {inner}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-1.5 pt-2">
          <button type="button" title="Trợ giúp" className="rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vcpmc-focus)]">
            <RailIconBtn label="Trợ giúp">
              <HelpCircle className="h-5 w-5" />
            </RailIconBtn>
          </button>
          <button type="button" title="Hệ thống" className="rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vcpmc-focus)]">
            <RailIconBtn label="Hệ thống">
              <SettingsIcon className="h-5 w-5" />
            </RailIconBtn>
          </button>

          <div className="mt-2 pt-2">
            <button
              ref={orbRef}
              type="button"
              title="VCPMC Command Center"
              onClick={() => setSidecarOpen(true)}
              className="vc-command-orb-new"
              aria-label="Mở command center"
            >
              <div className="vc-command-orb-new__logo">
                <svg viewBox="0 0 60 100" className="h-6 w-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M535.957 391.46a7.532 7.532 0 1 1-7.531-7.607 7.569 7.569 0 0 1 7.531 7.607z" transform="translate(-506.445 -350.919)" fill="#c95867"/>
                  <path d="M519.423 435.958s-.02-30.31-.02-44.432c0-1.372 1.489-7.673 7.73-7.673a7.607 7.607 0 0 1 0 15.214 8.8 8.8 0 0 1-6.756-3.556c.006.249.04 38.436.05 38.6C520.406 436.513 519.423 435.958 519.423 435.958z" transform="translate(-519.403 -383.853)" fill="#c95867"/>
                  <path d="M457.219 391.7h15.233s.645 8.772-2.564 16.59c-8.276 20.166-27.4 31.609-50.952 39.784.137.007 47.152-.133 47.152-.133v1.193l-53.578.038s20.21-9.1 24.3-12.274C447.5 428.989 458.339 417.225 457.219 391.7z" transform="translate(-412.509 -357.716)" fill="#c95867"/>
                  <path d="M519.784 442.446v-.6c10.623-5.475 29.931-19.8 26.474-50.151l2.324.021C551.782 424.314 529.218 437.967 519.784 442.446z" transform="translate(-505.482 -357.716)" fill="#c95867"/>
                </svg>
              </div>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN COLUMN */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TOPBAR — 64px, ivory */}
        <header
          className="flex shrink-0 items-center justify-between gap-4 px-6"
          style={{
            height: 'var(--vcpmc-topbar-h)',
            background: 'var(--surface-topbar)',
            borderBottom: '1px solid var(--border-soft)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <nav
              aria-label="Breadcrumb"
              className="flex shrink-0 flex-nowrap items-center gap-1 text-[12.5px]"
              style={{ color: 'var(--ink-secondary)' }}
            >
              {breadcrumb.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap">
                  {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
                  <span
                    className={cn(i === breadcrumb.length - 1 && 'font-medium')}
                    style={{
                      color:
                        i === breadcrumb.length - 1
                          ? 'var(--ink-primary)'
                          : 'var(--ink-secondary)',
                    }}
                  >
                    {b}
                  </span>
                </span>
              ))}
            </nav>
            <span className="h-4 w-px shrink-0" style={{ background: 'var(--border-soft)' }} />
            <h1
              className="shrink-0 truncate whitespace-nowrap font-semibold"
              style={{ color: 'var(--ink-primary)', fontSize: 17 }}
            >
              {title}
            </h1>
            {statusLabel && (
              <span
                className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
                style={{ background: tone.bg, color: tone.fg }}
              >
                {statusLabel}
              </span>
            )}
          </div>

          {/* Command search trigger */}
          <button
            type="button"
            onClick={() => setSidecarOpen(true)}
            className="hidden items-center gap-2 rounded-[10px] px-3 text-left transition-colors md:flex"
            style={{
              width: 320,
              height: 38,
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-soft)',
              color: 'var(--ink-secondary)',
              fontSize: 12.5,
            }}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">Tìm lệnh, workflow…</span>
            <kbd
              className="rounded px-1.5 py-0.5 font-mono text-[10.5px]"
              style={{
                background: 'var(--surface-main)',
                color: 'var(--ink-secondary)',
                border: '1px solid var(--border-soft)',
              }}
            >
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-2">
            {actions}
            <div
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3"
              style={{ background: 'var(--surface-soft)' }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ background: 'var(--accent-coral)' }}
              >
                NH
              </span>
              <span className="text-[12.5px]" style={{ color: 'var(--ink-primary)' }}>
                Nguyễn Thu Hà
              </span>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main
          className="min-w-0 flex-1 overflow-auto"
          style={{ background: 'var(--surface-canvas)' }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function RailIconBtn({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <span
      title={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors"
      style={{
        color: 'var(--ink-secondary)',
        background: 'transparent',
        transitionDuration: 'var(--vcpmc-dur-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-rail-hover)';
        e.currentTarget.style.color = 'var(--ink-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--ink-secondary)';
      }}
    >
      {children}
    </span>
  );
}
