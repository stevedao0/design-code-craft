import React from 'react';
import { CommandCenter } from './CommandCenter';
import { useLayoutMode } from './useLayoutMode';

import { RouteKey } from '../../data/routes';
import type { WorkflowKind } from './WorkflowSheet';

export function AppShell({
  current,
  onNavigate,
  workspace,
  onWorkspaceChange,
  userEmail,
  workflow,
  onOpenWorkflow,
  onCloseWorkflow,
  layoutMode,
  onLayoutModeChange,
  onOpenCalculator,
  children,
}: {
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  workspace: string;
  onWorkspaceChange: (id: string) => void;
  userEmail: string;
  workflow?: WorkflowKind;
  onOpenWorkflow?: (k: Exclude<WorkflowKind, null>) => void;
  onCloseWorkflow?: () => void;
  layoutMode?: import('./useLayoutMode').LayoutMode;
  onLayoutModeChange?: (m: import('./useLayoutMode').LayoutMode) => void;
  onOpenCalculator?: () => void;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useLayoutMode();
  const activeMode = layoutMode ?? mode;
  const setActiveMode = onLayoutModeChange ?? setMode;
  const showDevBadge = import.meta.env.DEV;

  // Command Center is the primary shell: compact topbar + orb + workspace content
  return (
    <CommandCenter
      current={current}
      onNavigate={onNavigate}
      workspace={workspace}
      onWorkspaceChange={onWorkspaceChange}
      userEmail={userEmail}
      layoutMode={activeMode}
      onLayoutModeChange={setActiveMode}
      workflow={workflow}
      onOpenWorkflow={onOpenWorkflow}
      onCloseWorkflow={onCloseWorkflow}
      onOpenCalculator={onOpenCalculator}
    >
      {children}
    </CommandCenter>
  );
}
