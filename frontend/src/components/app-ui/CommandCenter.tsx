import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { RouteKey } from '../../data/routes';
import type { WorkflowKind } from './WorkflowSheet';
import { AppRail } from './AppRail';
import { CommandRibbon } from './CommandRibbon';
import { CommandLauncher } from './CommandLauncher';

/**
 * CommandCenter — VCPMC Glass Command OS shell.
 *
 * Layout:
 *  - AppRail (left, 68px): orb + nav icons + bottom actions
 *  - CommandRibbon (top, 60px): breadcrumb + search hint + avatar
 *  - Workspace (main): page content
 *  - CommandLauncher (floating, 380px): opens from Orb
 *
 * Bright ivory, no dark sidebar, no heavy blur, no purple gradient.
 */
export function CommandCenter({
  current,
  onNavigate,
  workspace,
  onWorkspaceChange,
  userEmail,
  layoutMode,
  onLayoutModeChange,
  workflow,
  onOpenWorkflow,
  onCloseWorkflow,
  onOpenCalculator,
  children,
}: {
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  workspace: string;
  onWorkspaceChange: (id: string) => void;
  userEmail: string;
  layoutMode: import('./useLayoutMode').LayoutMode;
  onLayoutModeChange?: (m: import('./useLayoutMode').LayoutMode) => void;
  workflow?: WorkflowKind;
  onOpenWorkflow?: (k: Exclude<WorkflowKind, null>) => void;
  onCloseWorkflow?: () => void;
  onOpenCalculator?: () => void;
  children: React.ReactNode;
}) {
  const { logout } = useAuth();
  const [launcherOpen, setLauncherOpen] = useState(false);

  // Ctrl K / Cmd K: open the Orb Launcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setLauncherOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, []);

  // Close launcher on route change so the user lands cleanly on the new page.
  useEffect(() => {
    setLauncherOpen(false);
  }, [current]);

  return (
    <div className="vcpmc-shell">
      {/* Left rail */}
      <AppRail
        current={current}
        onNavigate={onNavigate}
        onOpenLauncher={() => setLauncherOpen((o) => !o)}
        launcherOpen={launcherOpen}
        onLogout={logout}
      />

      {/* Main column: ribbon + workspace */}
      <div className="vcpmc-shell__main">
        <CommandRibbon
          current={current}
          onNavigate={onNavigate}
          onOpenLauncher={() => setLauncherOpen((o) => !o)}
          onOpenCalculator={onOpenCalculator}
        />

        <main className="vcpmc-shell__workspace" key={current}>
          <div className="vcpmc-shell__workspace-inner page-enter">{children}</div>
        </main>      </div>

      {/* Floating command launcher */}
      <CommandLauncher
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        current={current}
        onNavigate={onNavigate}
        onOpenWorkflow={onOpenWorkflow}
      />
    </div>
  );
}
