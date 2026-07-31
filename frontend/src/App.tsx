import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AppShell } from './components/app-ui/AppShell';
import { useLayoutMode } from './components/app-ui/useLayoutMode';
import { AccessDenied } from './components/app-ui/AccessDenied';
import { RouteKey, ROUTE_PATHS, WORKSPACES } from './data/routes';
import { AuthProvider, useAuth } from './lib/auth';
import { DOMAINS } from './data/authData';
import { Loader2Icon } from 'lucide-react';
import { WorkflowSheet } from './components/app-ui/WorkflowSheet';
import type { WorkflowKind } from './components/app-ui/WorkflowSheet';
import { ToastContainer } from './components/app-ui/Toast';
import { NavHistoryProvider } from './lib/navHistory';
import { installProductionGuards } from './lib/productionGuards';

// Install production-only source-deterrence guards (right-click + dev shortcuts)
// exactly once at app bootstrap. No-op in dev. See productionGuards.ts for the
// full rationale — this is a UX-level friction, NOT a security boundary.
installProductionGuards();

// =============================================================================
// URL pathname ↔ RouteKey mapping
// =============================================================================
// Why this lives in App.tsx:
//   The navigation surface (sidebar, command palette, breadcrumb, in-page
//   links) mixes `setRoute(key)` calls with native `<a href="/bg/...">` links.
//   Without a single source of truth that maps URL → key (and writes key → URL),
//   the URL bar and the in-memory route drift apart, the browser back button
//   stops working, and hard-reload on `/bg/contracts/new` does not mount
//   CreateContractPage (the route is restored from sessionStorage, not from
//   `window.location.pathname`).
//   The exact set of paths below is what the current UI emits.
const PATHNAME_TO_ROUTE: Record<string, RouteKey> = {
  '/bg': 'dashboard',
  '/bg/contracts': 'contracts.list',
  '/bg/contracts/new': 'contracts.create',
  '/bg/contracts/certificates/print': 'contracts.print',
  '/bg/reports': 'reports',
  '/bg/dispatches': 'dispatch',
  '/bg/search': 'search',
  '/tools/royalty-calculator': 'tools.royalty',
  '/tools/royalty-calculator/history': 'tools.royalty.history',
  '/bang-tinh': 'tools.royalty',
  '/cong-cu/bang-tinh': 'tools.royalty',
};

// Reverse map so we can pushState the canonical URL for any RouteKey.
const ROUTE_TO_PATHNAME: Record<RouteKey, string> = ROUTE_PATHS as Record<RouteKey, string>;

function pathnameToRoute(pathname: string): RouteKey | null {
  // Exact match first.
  if (PATHNAME_TO_ROUTE[pathname]) {
    return PATHNAME_TO_ROUTE[pathname];
  }
  // Detail / edit routes use IDs: `/bg/contracts/123`, `/bg/contracts/123/edit`.
  // We don't have a contract id to seed yet, so fall back to contracts.list.
  if (/^\/bg\/contracts\/\d+$/.test(pathname)) return 'contracts.list';
  if (/^\/bg\/contracts\/\d+\/edit$/.test(pathname)) return 'contracts.list';
  return null;
}

// Lazy-load ALL page components so a crash in one page cannot kill the app shell
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ContractsListPage = lazy(() => import('./pages/ContractsListPage').then(m => ({ default: m.ContractsListPage })));
const ContractDetailPage = lazy(() => import('./pages/ContractDetailPage').then(m => ({ default: m.ContractDetailPage })));
const ContractEditPage = lazy(() => import('./pages/ContractEditPage').then(m => ({ default: m.ContractEditPage })));
const CreateContractPage = lazy(() => import('./pages/CreateContractPage').then(m => ({ default: m.CreateContractPage })));
const CertificatePrintPage = lazy(() => import('./pages/CertificatePrintPage').then(m => ({ default: m.CertificatePrintPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const PermissionsPage = lazy(() => import('./pages/PermissionsPage').then(m => ({ default: m.PermissionsPage })));
const GlobalSearchPage = lazy(() => import('./pages/GlobalSearchPage').then(m => ({ default: m.GlobalSearchPage })));
const ImportContractsPage = lazy(() => import('./pages/ImportContractsPage').then(m => ({ default: m.ImportContractsPage })));
const DispatchesPage = lazy(() => import('./pages/DispatchesPage').then(m => ({ default: m.DispatchesPage })));
const AnnexesPage = lazy(() => import('./pages/AnnexesPage').then(m => ({ default: m.AnnexesPage })));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage').then(m => ({ default: m.PlaceholderPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RoyaltyCalculatorPage = lazy(() => import('./pages/RoyaltyCalculatorPage').then(m => ({ default: m.RoyaltyCalculatorPage })));
const RoyaltyHistoryPageContainer = lazy(() => import('./pages/RoyaltyHistoryPage').then(m => ({ default: m.RoyaltyHistoryPageContainer })));
const DeploymentPage = lazy(() => import('./pages/DeploymentPage').then(m => ({ default: m.DeploymentPage })));

import { RoyaltyCalculatorFab } from './components/app-ui/RoyaltyCalculatorFab';

// ErrorBoundary: isolates a page crash so the AppShell + sidebar remain usable
class PageErrorBoundary extends React.Component<
  { routeKey: RouteKey; children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { routeKey: RouteKey; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
          <div
            className="rounded-xl p-6 max-w-lg text-center"
            style={{
              background: 'var(--accent-danger-soft)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent-danger) 22%, transparent)',
            }}
          >
            <div className="font-semibold text-lg mb-2" style={{ color: 'var(--accent-danger)' }}>
              Lỗi khi tải trang
            </div>
            <div className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Trang <code
                className="px-1 rounded"
                style={{ background: 'var(--surface-muted)' }}
              >{this.props.routeKey}</code> gặp lỗi.
            </div>
            <div
              className="font-mono mt-2 truncate text-xs"
              style={{ color: 'var(--text-muted)' }}
              title={this.state.error}
            >
              {this.state.error}
            </div>
          </div>
          <button
            className="px-4 py-2 rounded-md text-sm font-semibold transition-colors"
            style={{
              background: 'var(--accent-primary)',
              color: 'white',
            }}
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Loading fallback for Suspense
function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader2Icon className="h-8 w-8 animate-spin" style={{ color: 'var(--accent-primary)' }} />
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải trang...</span>
    </div>
  );
}
const PLACEHOLDER_META: Partial<
  Record<
    RouteKey,
    {
      title: string;
      description: string;
    }>> =

{
  annexes: {
    title: 'Phụ lục hợp đồng',
    description: 'Quản lý phụ lục đính kèm hợp đồng.'
  },
  dispatch: {
    title: 'Công văn',
    description: 'Theo dõi công văn gửi đi và nhận về.'
  },
  search: {
    title: 'Tìm kiếm toàn cục',
    description: 'Truy vấn nhanh trên hợp đồng, GCN, phụ lục, công văn.'
  },
  assistant: {
    title: 'AI Assistant',
    description: 'Trợ lý AI cho nghiệp vụ hợp đồng.'
  },
  'tools.royalty': {
    title: 'Tính tiền bản quyền (NĐ 17/2023)',
    description: 'Công cụ tính tiền bản quyền âm nhạc — Nghị định 17/2023/NĐ-CP'
  }
};
function AppContent() {
  const { currentUser, hasPermission, hasDomain } = useAuth();
  const [layoutMode, setLayoutMode] = useLayoutMode();
  // Restore route from URL first (so deep links and hard reload work),
  // then fall back to sessionStorage so a refresh on a tab-mounted route
  // is still safe. The URL is the source of truth for the address bar;
  // sessionStorage is a fallback for browsers that strip paths.
  const [route, setRouteRaw] = useState<RouteKey>(() => {
    const fromUrl = pathnameToRoute(window.location.pathname);
    if (fromUrl) return fromUrl;
    const saved = sessionStorage.getItem('app_route');
    return (saved as RouteKey) || 'dashboard';
  });
  // Guard against setRoute's URL-sync effect causing an infinite loop with
  // popstate: route changes from history.pushState should NOT trigger another
  // pushState for the same path.
  const lastPushedPathRef = useRef<string | null>(null);
  const [activeContractId, setActiveContractId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem('app_active_contract_id');
    return saved ? Number(saved) : null;
  });
  const [pendingPrintContractId, setPendingPrintContractId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem('app_pending_print_contract_id');
    return saved ? Number(saved) : null;
  });
  const [pendingPrintCertificateId, setPendingPrintCertificateId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem('app_pending_print_certificate_id');
    return saved ? Number(saved) : null;
  });

  // Persist route changes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('app_route', route);
  }, [route]);

  // Sync URL bar ↔ route state.
  // - When route changes via setRoute, push the canonical pathname (only if
  //   it differs from the current URL, to avoid history spam).
  // - When the user hits back/forward, popstate fires; read pathname and
  //   convert it back to a RouteKey so the page slot rerenders correctly.
  useEffect(() => {
    const targetPath = ROUTE_TO_PATHNAME[route];
    if (!targetPath) return;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ appRoute: route }, '', targetPath);
      lastPushedPathRef.current = targetPath;
    }
    // No cleanup — popstate handler below is registered once.
  }, [route]);

  useEffect(() => {
    const onPopState = () => {
      const fromUrl = pathnameToRoute(window.location.pathname);
      if (fromUrl && fromUrl !== route) {
        setRouteRaw(fromUrl);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // We intentionally don't depend on `route` — popstate is an external
    // event and reading its current value is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Public setter: route changes flow through here so URL sync stays in sync.
  const setRoute = useCallback((next: RouteKey) => {
    setRouteRaw(next);
  }, []);

  // Persist active contract ID
  useEffect(() => {
    if (activeContractId) {
      sessionStorage.setItem('app_active_contract_id', String(activeContractId));
    } else {
      sessionStorage.removeItem('app_active_contract_id');
    }
  }, [activeContractId]);

  // Persist pending print contract ID
  useEffect(() => {
    if (pendingPrintContractId) {
      sessionStorage.setItem('app_pending_print_contract_id', String(pendingPrintContractId));
    } else {
      sessionStorage.removeItem('app_pending_print_contract_id');
    }
  }, [pendingPrintContractId]);

  // Persist pending print certificate ID
  useEffect(() => {
    if (pendingPrintCertificateId) {
      sessionStorage.setItem('app_pending_print_certificate_id', String(pendingPrintCertificateId));
    } else {
      sessionStorage.removeItem('app_pending_print_certificate_id');
    }
  }, [pendingPrintCertificateId]);

  const [latestContractForCreate, setLatestContractForCreate] = useState<import('./data/contractRecords').ContractRecord | undefined>(undefined);

  // Royalty Calculator popup state — controlled by the shared header action.
  // Hidden on contracts.create because the inline calculator in section 6
  // already covers that flow.
  const [calcOpen, setCalcOpen] = useState(false);
  const openCalculator = useCallback(() => setCalcOpen(true), []);
  const closeCalculator = useCallback(() => setCalcOpen(false), []);
  useEffect(() => {
    // Auto-close calculator when navigating to a route where it must not appear.
    if (route === 'contracts.create') setCalcOpen(false);
  }, [route]);

  // Listen for "open calculation history" events fired from the calculator.
  // Used by "Mở lịch sử bảng tính" button inside RoyaltyCalculatorPage so
  // the FAB-hosted calculator can deep-link into the dedicated history page.
  useEffect(() => {
    const handler = () => {
      setCalcOpen(false);
      setRoute('tools.royalty.history');
    };
    window.addEventListener('vcpmc:open-calculation-history', handler);
    return () => window.removeEventListener('vcpmc:open-calculation-history', handler);
  }, []);

  // WorkflowSheet state: when set, a floating task workspace overlays the
  // current page. The normal route is NEVER changed by opening/closing a
  // sheet — only the "Mở trang đầy đủ" button navigates.
  const [workflow, setWorkflow] = useState<WorkflowKind>(null);
  const openWorkflow = useCallback((kind: Exclude<WorkflowKind, null>) => {
    setWorkflow(kind);
  }, []);
  const closeWorkflow = useCallback(() => {
    setWorkflow(null);
  }, []);
  const navigateToWorkflowRoute = useCallback((kind: Exclude<WorkflowKind, null>) => {
    const routeForKind: Record<Exclude<WorkflowKind, null>, RouteKey> = {
      'create-contract': 'contracts.create',
      'print-gcn': 'contracts.print',
      'dispatches': 'dispatch',
    };
    setWorkflow(null);
    setRoute(routeForKind[kind]);
  }, []);
  // Default workspace to first allowed domain
  const allowedWorkspaces = DOMAINS.filter(
    (d) => !d.adminOnly && hasDomain(d.id)
  );
  const [workspace, setWorkspace] = useState(
    allowedWorkspaces[0]?.id || WORKSPACES[0].id
  );

  // Public tools: routes that anyone (no auth) can open. The shared calculator
  // service is reused; no second formula source, no extra scope. They are
  // rendered without the AppShell and without the Login form.
  const publicPathnames = new Set(['/bang-tinh', '/cong-cu/bang-tinh']);
  const isPublicTool = publicPathnames.has(window.location.pathname);

  if (!currentUser && !isPublicTool) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    );
  }
  const renderPage = () => {
    // Permission checks
    if (route === 'contracts.list' && !hasPermission('contracts.list') && !hasPermission('contracts.read'))
    return (
      <AccessDenied
        requiredPermission="contracts.list"
        onBack={() => setRoute('dashboard')} />);


    if (route === 'contracts.detail' && !hasPermission('contracts.read'))
    return (
      <AccessDenied
        requiredPermission="contracts.read"
        onBack={() => setRoute('dashboard')} />);

    if (route === 'contracts.edit' && !hasPermission('contracts.update'))
    return (
      <AccessDenied
        requiredPermission="contracts.update"
        onBack={() => setRoute('contracts.list')} />);


    if (route === 'reports' && !hasPermission('reports.view'))
    return (
      <AccessDenied
        requiredPermission="reports.view"
        onBack={() => setRoute('dashboard')} />);


    if (route === 'search' && !hasPermission('works.read'))
    return (
      <AccessDenied
        requiredPermission="works.read"
        onBack={() => setRoute('dashboard')} />);


    if (route === 'admin.users' && !hasPermission('admin.users.manage'))
    return (
      <AccessDenied
        requiredPermission="admin.users.manage"
        onBack={() => setRoute('dashboard')} />);


    if (route === 'admin.permissions' && !hasPermission('admin.users.manage'))
    return (
      <AccessDenied
        requiredPermission="admin.users.manage"
        onBack={() => setRoute('dashboard')} />);


    if (route === 'assistant' && !hasPermission('portal.access'))
    return (
      <AccessDenied
        requiredPermission="portal.access"
        onBack={() => setRoute('dashboard')} />);

    if (route === 'admin.import' && !['admin', 'mod'].includes(currentUser.backendRole))
    return (
      <AccessDenied
        requiredPermission="admin.users.manage"
        onBack={() => setRoute('dashboard')} />);


    if (route === 'admin.deployment' && !hasPermission('admin.users.manage'))
    return (
      <AccessDenied
        requiredPermission="admin.users.manage"
        onBack={() => setRoute('dashboard')} />);


    if (route === 'dashboard') {
      return (
        <DashboardPage userEmail={currentUser.email} onNavigate={setRoute} />);

    }
    if (route === 'contracts.list') {
      return (
        <ContractsListPage
          onNavigate={setRoute}
          onOpenDetail={(id) => {
            setActiveContractId(id);
            setRoute('contracts.detail');
          }}
          onPrintCertificate={(contractId) => {
            setPendingPrintContractId(contractId);
            setRoute('contracts.print');
          }}
          onCreateNew={(latest) => setLatestContractForCreate(latest)}
          onOpenCreateContract={() => openWorkflow('create-contract')}
        />
      );
    }
    if (route === 'contracts.detail') {
      return (
        <ContractDetailPage
          contractId={activeContractId}
          onBack={() => setRoute('contracts.list')}
          onEdit={(id) => {
            setActiveContractId(id);
            setRoute('contracts.edit');
          }}
          onNavigate={setRoute}
          onCreateGcn={(contractId) => {
            setPendingPrintContractId(contractId);
            setRoute('contracts.print');
          }}
        />
      );
    }
    if (route === 'contracts.edit') {
      return (
        <ContractEditPage
          contractId={activeContractId}
          onBack={() => {
            setActiveContractId(null);
            setRoute('contracts.list');
          }}
          onSaved={(id) => {
            setActiveContractId(id);
            setRoute('contracts.detail');
          }}
        />
      );
    }
    if (route === 'contracts.create') {
      return (
        <CreateContractPage
          onNavigate={setRoute}
          onOpenCreatedContract={(id) => {
            setActiveContractId(id);
            setRoute('contracts.detail');
          }}
          initialDraftFromContract={latestContractForCreate}
        />
      );
    }
    if (route === 'contracts.print') {
      return <CertificatePrintPage onNavigate={setRoute} initialContractId={pendingPrintContractId} initialCertificateId={pendingPrintCertificateId} onPrinted={() => { setPendingPrintContractId(null); setPendingPrintCertificateId(null); }} />;
    }
    if (route === 'reports') {
      return <ReportsPage />;
    }
    if (route === 'admin.users') {
      return <UsersPage />;
    }
    if (route === 'admin.permissions') {
      return <PermissionsPage />;
    }
    if (route === 'admin.import') {
      return <ImportContractsPage onNavigate={setRoute} />;
    }
    if (route === 'admin.deployment') {
      return <DeploymentPage />;
    }
    if (route === 'search') {
      return (
        <GlobalSearchPage
          onNavigate={setRoute}
          onOpenDetail={(id) => {
            setActiveContractId(id);
            setRoute('contracts.detail');
          }}
        />
      );
    }
    if (route === 'dispatch') {
      return <DispatchesPage onNavigate={setRoute} />;
    }
    if (route === 'annexes') {
      return <AnnexesPage onNavigate={setRoute} />;
    }
    if (route === 'tools.royalty') {
      return <RoyaltyCalculatorPage />;
    }
    if (route === 'tools.royalty.history') {
      return <RoyaltyHistoryPageContainer onNavigate={(k) => setRoute(k as RouteKey)} />;
    }
    const meta = PLACEHOLDER_META[route];
    if (!meta) {
      return null;
    }
    return (
      <PlaceholderPage
        title={meta.title}
        description={meta.description}
        routePath={ROUTE_PATHS[route]}
        onBack={setRoute} />);


  };
  // Public tools (no auth): render the calculator directly with a small
  // public wrapper (back-to-login button). Calculator logic is the same as
  // the authenticated page — no second formula source.
  if (!currentUser && isPublicTool) {
    return (
      <div className="vcpmc-public-shell">
        <div className="vcpmc-public-shell__bar">
          <button
            type="button"
            className="vcpmc-public-shell__back"
            onClick={() => {
              window.history.pushState({}, '', '/');
              window.location.assign('/');
            }}
          >
            ← Quay lại Đăng nhập
          </button>
          <span className="vcpmc-public-shell__title">Bảng tính tiền bản quyền</span>
          <span className="vcpmc-public-shell__hint">Công cụ dùng chung, không cần đăng nhập</span>
        </div>
        <PageErrorBoundary routeKey={route}>
          <Suspense fallback={<PageLoader />}>
            {renderPage()}
          </Suspense>
        </PageErrorBoundary>
      </div>
    );
  }

  return (
    <>
      <NavHistoryProvider current={route} onNavigate={setRoute}>
      <AppShell
        current={route}
        onNavigate={setRoute}
        workspace={workspace}
        onWorkspaceChange={setWorkspace}
        userEmail={currentUser.email}
        workflow={workflow}
        onOpenWorkflow={openWorkflow}
        onCloseWorkflow={closeWorkflow}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        onOpenCalculator={route === 'contracts.create' ? undefined : openCalculator}>
        {/* Normal page slot */}
        <PageErrorBoundary routeKey={route}>
          <Suspense fallback={<PageLoader />}>
            {renderPage()}
          </Suspense>
        </PageErrorBoundary>
      </AppShell>
      </NavHistoryProvider>
      {/* WorkflowSheet is portaled to <body> so it overlays the entire shell.
          WorkflowSheet is NOT inside AppShell to avoid z-index
          conflicts and ensure it floats above everything. */}
      {workflow && createPortal(
        <WorkflowSheet
          workflow={workflow}
          onClose={closeWorkflow}
          onOpenFullPage={() => navigateToWorkflowRoute(workflow)}
          title={workflowTitle(workflow)}
          subtitle={workflowSubtitle(workflow)}
          routePath={workflowRoutePath(workflow)}
        />,
        document.body
      )}
      {/* Floating royalty calculator popup (controlled by shared header action) */}
      {route !== 'contracts.create' && (
        <RoyaltyCalculatorFab
          hideTrigger
          controlledOpen={calcOpen}
          onClose={closeCalculator}
        />
      )}
      {/* Notifications (portal to <body>) */}
      <ToastContainer />
    </>
  );
}

function workflowTitle(kind: WorkflowKind): string {
  switch (kind) {
    case 'create-contract': return 'Tạo hợp đồng';
    case 'print-gcn': return 'In GCN';
    case 'dispatches': return 'Công văn';
    default: return 'Workflow';
  }
}

function workflowSubtitle(kind: WorkflowKind): string {
  switch (kind) {
    case 'create-contract': return 'Tạo mới hợp đồng bản quyền tác giả âm nhạc';
    case 'print-gcn': return 'In giấy chứng nhận theo hợp đồng đã chọn';
    case 'dispatches': return 'Theo dõi và quản lý công văn gửi đi/nhận về';
    default: return '';
  }
}

function workflowRoutePath(kind: WorkflowKind): string {
  switch (kind) {
    case 'create-contract': return '/bg/contracts/new';
    case 'print-gcn': return '/bg/contracts/certificates/print';
    case 'dispatches': return '/bg/dispatches';
    default: return '';
  }
}
export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>);

}
