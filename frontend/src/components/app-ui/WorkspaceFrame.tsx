import React, { useEffect, useState } from 'react';
import { RouteKey } from '../../data/routes';
import { RefreshCwIcon, Maximize2Icon, Minimize2Icon, SearchIcon } from 'lucide-react';

const ROUTE_LABELS: Partial<Record<RouteKey, { label: string; group?: string; badge?: string }>> = {
  dashboard: { label: 'Dashboard', group: 'Tổng quan' },
  'contracts.list': { label: 'Danh sách hợp đồng', group: 'Hợp đồng' },
  'contracts.detail': { label: 'Chi tiết hợp đồng', group: 'Hợp đồng' },
  'contracts.edit': { label: 'Chỉnh sửa hợp đồng', group: 'Hợp đồng' },
  'contracts.create': { label: 'Tạo hợp đồng', group: 'Hợp đồng' },
  'contracts.print': { label: 'In GCN', group: 'GCN', badge: 'Print' },
  annexes: { label: 'Phụ lục', group: 'Nghiệp vụ' },
  dispatch: { label: 'Công văn', group: 'Nghiệp vụ' },
  reports: { label: 'Báo cáo', group: 'Nghiệp vụ' },
  search: { label: 'Tìm kiếm toàn cục', group: 'Nghiệp vụ' },
  'admin.users': { label: 'Người dùng', group: 'Hệ thống' },
  'admin.permissions': { label: 'Phân quyền', group: 'Hệ thống' },
  'admin.import': { label: 'Import Excel', group: 'Hệ thống' },
  'admin.deployment': { label: 'Triển khai', group: 'Hệ thống' },
  assistant: { label: 'AI Assistant', group: 'Hệ thống' },
};

interface WorkspaceFrameProps {
  current: RouteKey;
  children: React.ReactNode;
  showDevBadge?: boolean;
  onOpenLauncher?: () => void;
}

export function WorkspaceFrame({ current, children, showDevBadge = false, onOpenLauncher }: WorkspaceFrameProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const meta = ROUTE_LABELS[current];

  // Track fullscreen state (browser native)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      const el = document.querySelector('.vc-workspace-frame');
      if (el && (el as HTMLElement).requestFullscreen) {
        (el as HTMLElement).requestFullscreen().catch(() => {});
      }
    }
  };

  const handleRefresh = () => {
    const evt = new CustomEvent('vc-workspace-refresh', { detail: { route: current } });
    window.dispatchEvent(evt);
  };

  return (
    <div className="vc-workspace-frame" data-workspace-frame>
      {/* Frame header */}
      <header className="vc-workspace-frame__header">
        <div className="vc-workspace-frame__crumb">
          <span className="vc-workspace-frame__crumb-group">{meta?.group ?? 'Workspace'}</span>
          <span className="vc-workspace-frame__crumb-sep">/</span>
          <span className="vc-workspace-frame__crumb-label">{meta?.label ?? current}</span>
        </div>
        <div className="vc-workspace-frame__actions">
          {onOpenLauncher && (
            <button
              type="button"
              className="vc-workspace-frame__search-trigger"
              onClick={onOpenLauncher}
              aria-label="Mở Command Launcher"
              title="Mở Command Launcher (⌘K)"
            >
              <SearchIcon />
              <span className="vc-workspace-frame__search-trigger-text">
                Tìm lệnh, hợp đồng…
              </span>
              <kbd className="vc-workspace-frame__search-kbd">⌘K</kbd>
            </button>
          )}
          <span className="vc-workspace-frame__badge">Workspace</span>
          {meta?.badge && <span className="vc-workspace-frame__badge vc-workspace-frame__badge--accent">{meta.badge}</span>}
          <button
            type="button"
            className="vc-workspace-frame__btn"
            onClick={handleRefresh}
            aria-label="Làm mới"
            title="Làm mới"
          >
            <RefreshCwIcon />
          </button>
          <button
            type="button"
            className="vc-workspace-frame__btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          >
            {isFullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
          </button>
        </div>
      </header>

      {/* Frame content area */}
      <div className="vc-workspace-frame__body page-enter" key={current}>
        {children}
      </div>

      {showDevBadge && (
        <div className="vc-workspace-frame__dev-badge">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Development build
        </div>
      )}
    </div>
  );
}
