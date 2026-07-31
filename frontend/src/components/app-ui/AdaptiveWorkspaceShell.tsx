import React, { useEffect, useState } from 'react';
import { RouteKey } from '../../data/routes';
import { CompactCommandRail, type RailGroupKey } from './CompactCommandRail';
import { ContextFlyout } from './ContextFlyout';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import { CommandLauncher } from './CommandLauncher';
import { useAuth } from '../../lib/auth';
import vcpmcLogo from '../../assets/vcpmc-logo-animated.webp';
import type { WorkflowKind } from './WorkflowSheet';

interface AdaptiveWorkspaceShellProps {
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  workspace: string;
  onWorkspaceChange?: (id: string) => void;
  userEmail?: string;
  workflow: WorkflowKind;
  onOpenWorkflow?: (k: Exclude<WorkflowKind, null>) => void;
  onCloseWorkflow?: () => void;
  children: React.ReactNode;
}

export function AdaptiveWorkspaceShell({
  current,
  onNavigate,
  workspace,
  userEmail,
  workflow,
  onOpenWorkflow,
  children,
}: AdaptiveWorkspaceShellProps) {
  const { currentUser } = useAuth();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<RailGroupKey | null>(null);
  /** Vertical pixel position of the rail button that opened the flyout.
   *  Used to position the popover near its trigger (Apple-style). */
  const [flyoutAnchorTop, setFlyoutAnchorTop] = useState(80);
  const showDevBadge = import.meta.env.DEV;

  // Ctrl+K to open launcher (and close flyout if open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActiveGroup(null);
        setLauncherOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  // Close launcher + flyout on route change
  useEffect(() => {
    setLauncherOpen(false);
    setActiveGroup(null);
  }, [current]);

  const handleOpenLauncher = () => {
    setActiveGroup(null);
    setFlyoutAnchorTop(80);
    setLauncherOpen(true);
  };
  const handleCloseLauncher = () => setLauncherOpen(false);

  const handleSelectGroup = (g: RailGroupKey | null, event?: React.MouseEvent) => {
    setLauncherOpen(false);
    if (g && event?.currentTarget) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setFlyoutAnchorTop(rect.top);
    }
    setActiveGroup(g);
  };

  const handleOpenWorkflow: (k: 'create-contract' | 'print-gcn' | 'dispatches') => void =
    (kind) => {
      onOpenWorkflow?.(kind);
    };

  // Viewport: mobile (< 768) vs tablet (768–1023) vs desktop (>= 1024)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024);
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w < 1024);
      if (w >= 768) {
        // close flyout when leaving mobile, so it doesn't survive a resize
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="vc-adaptive-shell" data-shell="adaptive-v2">
      {/* Body: rail + canvas (flyout is overlay, not in grid) */}
      <div className="vc-adaptive-shell__body">
        {/* Compact Command Rail — desktop & tablet (>=768px) */}
        {!isMobile && (
          <CompactCommandRail
            current={current}
            activeGroup={activeGroup}
            onSelectGroup={handleSelectGroup}
            onNavigate={onNavigate}
            onOpenLauncher={handleOpenLauncher}
          />
        )}

        {/* Workspace Canvas — always rendered, takes remaining space */}
        <WorkspaceCanvas current={current} showDevBadge={showDevBadge} onOpenLauncher={handleOpenLauncher}>
          {children}
        </WorkspaceCanvas>
      </div>

      {/* Context Flyout — overlay next to the rail when a group is active */}
      <ContextFlyout
        open={!!activeGroup}
        group={activeGroup}
        anchorTop={flyoutAnchorTop}
        onClose={() => setActiveGroup(null)}
        onNavigate={onNavigate}
        onOpenLauncher={handleOpenLauncher}
      />

      {/* Mobile FAB Orb — only on mobile */}
      {isMobile && (
        <button
          type="button"
          onClick={handleOpenLauncher}
          className={`vc-mobile-orb-fab ${launcherOpen ? 'is-open' : ''}`}
          aria-label="Mở Command Center"
          title="VCPMC Command Center"
        >
          <img
            src={vcpmcLogo}
            alt="VCPMC"
            className="vc-mobile-orb-fab__logo"
          />
        </button>
      )}

      {/* Command Launcher — overlay everywhere */}
      <CommandLauncher
        open={launcherOpen}
        onClose={handleCloseLauncher}
        onNavigate={onNavigate}
        onOpenWorkflow={handleOpenWorkflow}
      />
    </div>
  );
}
