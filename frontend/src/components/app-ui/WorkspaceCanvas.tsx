import React from 'react';
import { RouteKey } from '../../data/routes';
import { WorkspaceFrame } from './WorkspaceFrame';

interface WorkspaceCanvasProps {
  children: React.ReactNode;
  current: RouteKey;
  showDevBadge?: boolean;
  onOpenLauncher?: () => void;
}

export function WorkspaceCanvas({ children, current, showDevBadge = false, onOpenLauncher }: WorkspaceCanvasProps) {
  return (
    <div className="vc-workspace-canvas">
      <WorkspaceFrame current={current} showDevBadge={showDevBadge} onOpenLauncher={onOpenLauncher}>
        {children}
      </WorkspaceFrame>
    </div>
  );
}
