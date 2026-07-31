import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  FilePlus,
  Printer,
  BarChart3,
  Mail,
  LayoutDashboard,
  FileText,
  Paperclip,
  Award,
  Shield,
  Upload,
  Sparkles,
  X,
  Calculator,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { RouteKey } from '../../data/routes';
import {
  DRAWER_GROUPS,
  DRAWER_QUICK_ACTIONS,
  type NavItem,
} from './navConfig';
import type { WorkflowKind } from './WorkflowSheet';

interface CommandLauncherProps {
  open: boolean;
  onClose: () => void;
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  onOpenWorkflow?: (k: Exclude<WorkflowKind, null>) => void;
}

/**
 * Command Launcher — floating panel anchored under the Orb.
 *
 * Not a sidebar. Not a sidecar. A compact 380px floating panel that opens
 * from the Orb. Backdrop is a barely-visible dim layer (≤4%) which does NOT
 * blur the workspace.
 *
 * Layout:
 *  - Search input
 *  - Quick actions row (Tạo HĐ, In GCN, Báo cáo, Công văn)
 *  - Section nav groups
 *  - Active route highlighted
 */
export function CommandLauncher({
  open,
  onClose,
  current,
  onNavigate,
  onOpenWorkflow,
}: CommandLauncherProps) {
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      // wait one frame so the panel is mounted
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setQuery('');
    }
  }, [open]);

  // Click outside closes
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current && !panelRef.current.contains(target)) {
        // ignore clicks on the Orb itself (it owns the open toggle)
        const onOrb = (target as Element).closest?.('.vcpmc-orb');
        if (!onOrb) onClose();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, onClose]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const allItems = useMemo(() => {
    return DRAWER_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.label, system: g.system })));
  }, []);

  const visibleQuickActions = useMemo(
    () => DRAWER_QUICK_ACTIONS.filter((it) => !it.requiredPerm || hasPermission(it.requiredPerm)),
    [hasPermission],
  );

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return DRAWER_GROUPS
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          if (it.requiredPerm && !hasPermission(it.requiredPerm)) return false;
          if (!needle) return true;
          return (
            it.label.toLowerCase().includes(needle) ||
            g.label.toLowerCase().includes(needle)
          );
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [query, hasPermission]);

  const isRouteActive = (key: RouteKey): boolean => {
    if (key === current) return true;
    if (key === 'contracts.list' && ['contracts.create', 'contracts.edit', 'contracts.detail', 'contracts.print'].includes(current)) return true;
    if (key === 'admin.users' && ['admin.permissions', 'admin.import', 'assistant'].includes(current)) return true;
    return false;
  };

  const handleQuickAction = (key: RouteKey) => {
    if (key === 'contracts.create' && onOpenWorkflow) {
      onOpenWorkflow('create-contract');
      onClose();
      return;
    }
    if (key === 'contracts.print' && onOpenWorkflow) {
      onOpenWorkflow('print-gcn');
      onClose();
      return;
    }
    if (key === 'dispatch' && onOpenWorkflow) {
      onOpenWorkflow('dispatches');
      onClose();
      return;
    }
    onNavigate(key);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="vcpmc-launcher-root" role="dialog" aria-modal="false" aria-label="Bảng khởi chạy nhanh">
      {/* Barely-visible dim backdrop — does NOT blur workspace */}
      <div className="vcpmc-launcher-backdrop" aria-hidden onClick={onClose} />

      <div ref={panelRef} className="vcpmc-launcher-shell">
        {/* Search */}
        <div className="vcpmc-launcher__search">
          <Search className="vcpmc-launcher__search-icon" aria-hidden />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trang, hành động..."
            className="vcpmc-launcher__search-input"
            aria-label="Tìm kiếm trong launcher"
          />
          <button
            type="button"
            onClick={onClose}
            className="vcpmc-launcher__close"
            aria-label="Đóng launcher"
            title="Đóng (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="vcpmc-launcher__quick">
          <div className="vcpmc-launcher__section-label">Tác vụ nhanh</div>
          <div className="vcpmc-launcher__quick-grid" data-quick-grid>
            {visibleQuickActions
              .filter((it) => it.key !== 'tools.royalty')
              .map((it) => {
                const Icon = pickIcon(it.key);
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => handleQuickAction(it.key)}
                    className="vcpmc-launcher__quick-item"
                    title={it.label}
                  >
                    <Icon className="vcpmc-launcher__quick-icon" aria-hidden />
                    <span>{it.label}</span>
                  </button>
                );
              })}
          </div>
          {/* Dedicated full-width "Bảng tính" row — not a cramped grid tile */}
          {visibleQuickActions.some((it) => it.key === 'tools.royalty') && (
            <button
              type="button"
              onClick={() => handleQuickAction('tools.royalty')}
              className="vcpmc-launcher__calc-item"
              title="Bảng tính"
            >
              <Calculator className="vcpmc-launcher__calc-icon" aria-hidden />
              <span>Bảng tính</span>
            </button>
          )}
        </div>

        {/* Groups */}
        <div className="vcpmc-launcher__groups">
          {filteredGroups.map((g) => (
            <div key={g.label} className={`vcpmc-launcher__group ${g.system ? 'is-system' : ''}`}>
              <div className="vcpmc-launcher__section-label">{g.label}</div>
              <ul className="vcpmc-launcher__list">
                {g.items.map((it) => {
                  const active = isRouteActive(it.key);
                  const Icon = pickIcon(it.key);
                  return (
                    <li key={it.key}>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(it.key);
                          onClose();
                        }}
                        className={`vcpmc-launcher__item ${active ? 'is-active' : ''}`}
                      >
                        <Icon className="vcpmc-launcher__item-icon" aria-hidden />
                        <span>{it.label}</span>
                        {active && <span className="vcpmc-launcher__item-dot" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {filteredGroups.length === 0 && (
            <div className="vcpmc-launcher__empty">Không có kết quả phù hợp.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function pickIcon(key: RouteKey) {
  switch (key) {
    case 'dashboard': return LayoutDashboard;
    case 'contracts.list': return FileText;
    case 'contracts.create': return FilePlus;
    case 'contracts.print': return Printer;
    case 'contracts.edit': return FileText;
    case 'contracts.detail': return FileText;
    case 'tools.royalty': return Calculator;
    case 'tools.royalty.history': return Calculator;
    case 'annexes': return Paperclip;
    case 'dispatch': return Mail;
    case 'reports': return BarChart3;
    case 'search': return Search;
    case 'admin.users': return Shield;
    case 'admin.permissions': return Shield;
    case 'admin.import': return Upload;
    case 'admin.deployment': return Upload;
    case 'assistant': return Sparkles;
    default: return Award;
  }
}
