import React from 'react';
import {
  LayoutDashboardIcon,
  FileTextIcon,
  FilePlusIcon,
  ListIcon,
  PaperclipIcon,
  MailIcon,
  BarChart3Icon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  PrinterIcon,
  UploadIcon,
  AwardIcon,
  CalculatorIcon,
} from 'lucide-react';
import { RouteKey } from '../../data/routes';

// =============================================================================
// SHARED NAVIGATION CONFIG
// Source of truth for both the legacy Sidebar and the new Command Center
// topbar + subnav. Sidebar still renders its full tree from this; the
// Command Center uses TOP_LEVEL_MODULES + SUBNAV_BY_MODULE for the topbar
// first-class nav, and PINNED_DOCK for the floating quick-action dock.
// =============================================================================

export type NavItem = {
  key: RouteKey;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  requiredPerm?: string;
};

// --- Top-level modules in the Command Center topbar ---
// Order matters — first item is shown leftmost in the topbar.
export const TOP_LEVEL_MODULES: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Tổng quan',
    icon: <LayoutDashboardIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'portal.access',
  },
  {
    key: 'contracts.list',
    label: 'Hợp đồng',
    icon: <FileTextIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'contracts.read',
  },
  {
    key: 'contracts.print',
    label: 'GCN',
    icon: <AwardIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'contracts.read',
  },
  {
    key: 'dispatch',
    label: 'Công văn',
    icon: <MailIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'annexes.read',
  },
  {
    key: 'reports',
    label: 'Báo cáo',
    icon: <BarChart3Icon className="h-[15px] w-[15px]" />,
    requiredPerm: 'reports.view',
  },
  {
    key: 'admin.users',
    label: 'Hệ thống',
    icon: <ShieldIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'admin.users.manage',
  },
];

// --- Subnav rows by active top-level module ---
// Only includes items that map to REAL existing routes. Items whose target
// route is a placeholder are intentionally omitted to avoid fakes.
// Per Orb Drawer Phase 2, we de-duplicate the reports subnav: all 5 "tabs"
// previously pointed to the same `reports` route. Keep only ONE entry.
export const SUBNAV_BY_MODULE: Partial<Record<RouteKey, NavItem[]>> = {
  'contracts.list': [
    { key: 'contracts.list', label: 'Danh sách hợp đồng', icon: <ListIcon className="h-[14px] w-[14px]" />, requiredPerm: 'contracts.read' },
    { key: 'contracts.create', label: 'Tạo hợp đồng', icon: <FilePlusIcon className="h-[14px] w-[14px]" />, requiredPerm: 'contracts.create' },
    { key: 'contracts.print', label: 'In GCN', icon: <PrinterIcon className="h-[14px] w-[14px]" />, requiredPerm: 'contracts.read' },
    { key: 'annexes', label: 'Phụ lục', icon: <PaperclipIcon className="h-[14px] w-[14px]" />, requiredPerm: 'annexes.read' },
  ],
  'contracts.print': [
    { key: 'contracts.list', label: 'Quay về hợp đồng', icon: <ListIcon className="h-[14px] w-[14px]" />, requiredPerm: 'contracts.read' },
    { key: 'contracts.print', label: 'In GCN', icon: <PrinterIcon className="h-[14px] w-[14px]" />, requiredPerm: 'contracts.read' },
  ],
  dispatch: [
    { key: 'dispatch', label: 'Công văn', icon: <MailIcon className="h-[14px] w-[14px]" />, requiredPerm: 'annexes.read' },
  ],
  reports: [
    { key: 'reports', label: 'Báo cáo', icon: <BarChart3Icon className="h-[14px] w-[14px]" />, requiredPerm: 'reports.view' },
  ],
  'admin.users': [
    { key: 'admin.users', label: 'Quản lý người dùng', icon: <ShieldIcon className="h-[14px] w-[14px]" />, requiredPerm: 'admin.users.manage' },
    { key: 'admin.permissions', label: 'Ma trận phân quyền', icon: <ShieldIcon className="h-[14px] w-[14px]" />, requiredPerm: 'admin.users.manage' },
    { key: 'admin.import', label: 'Import Excel', icon: <UploadIcon className="h-[14px] w-[14px]" />, requiredPerm: 'admin.users.manage' },
    { key: 'admin.deployment', label: 'Triển khai', icon: <UploadIcon className="h-[14px] w-[14px]" />, requiredPerm: 'admin.users.manage' },
    { key: 'assistant', label: 'AI Assistant', icon: <SparklesIcon className="h-[14px] w-[14px]" />, badge: 'Beta', requiredPerm: 'portal.access' },
  ],
};

// --- Drawer nav groups (full app map shown when orb is clicked) ---
// Group label → array of nav items. Items are filtered by `requiredPerm`.
// Each item maps to a REAL existing route.
//
// Launcher mental model (V2):
//   - Primary workflow actions (Tạo HĐ, In GCN, Công văn, Báo cáo) live ONLY
//     in the quick-action row above the menu. They open WorkflowSheet.
//   - The menu list below shows the navigation submenu for the ACTIVE rail
//     category only. Items that duplicate a quick action are intentionally
//     removed to avoid half-modal / half-page confusion.
//   - Rail click switches the active section WITHOUT closing the launcher
//     and WITHOUT navigating (section selector only).
export type DrawerGroup = {
  label: string;
  /** When true, the group is rendered with a divider above and dimmer styling,
   *  signalling that its items are admin / system-level controls. */
  system?: boolean;
  /** When true, the group's items are skipped from the menu (only the section
   *  helper hint is shown). Used for sections whose primary actions are
   *  covered by quick actions only. */
  quickOnly?: boolean;
  items: NavItem[];
};

export const DRAWER_GROUPS: DrawerGroup[] = [
  {
    label: 'Tổng quan',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboardIcon className="h-[14px] w-[14px]" />, requiredPerm: 'portal.access' },
    ],
  },
  {
    // Hợp đồng section: navigation submenu. Workflow actions (Tạo HĐ / In GCN)
    // are intentionally excluded because they are already in the quick-action
    // row above and open WorkflowSheet.
    label: 'Hợp đồng',
    items: [
      { key: 'contracts.list', label: 'Danh sách hợp đồng', icon: <ListIcon className="h-[14px] w-[14px]" />, requiredPerm: 'contracts.read' },
      { key: 'annexes', label: 'Phụ lục', icon: <PaperclipIcon className="h-[14px] w-[14px]" />, requiredPerm: 'annexes.read' },
    ],
  },
  {
    // GCN section: the In GCN action is a quick action (opens sheet). The
    // section menu shows a helper note instead of duplicate entries.
    label: 'GCN',
    quickOnly: true,
    items: [],
  },
  {
    label: 'Công văn',
    items: [
      { key: 'dispatch', label: 'Danh sách công văn', icon: <MailIcon className="h-[14px] w-[14px]" />, requiredPerm: 'annexes.read' },
    ],
  },
  {
    label: 'Báo cáo',
    items: [
      { key: 'reports', label: 'Báo cáo tổng quan', icon: <BarChart3Icon className="h-[14px] w-[14px]" />, requiredPerm: 'reports.view' },
    ],
  },
  {
    label: 'Tìm kiếm',
    items: [
      { key: 'search', label: 'Tra cứu nhanh', icon: <SearchIcon className="h-[14px] w-[14px]" />, requiredPerm: 'works.read' },
    ],
  },
  {
    label: 'Hệ thống',
    system: true,
    items: [
      { key: 'admin.users', label: 'Quản lý người dùng', icon: <ShieldIcon className="h-[14px] w-[14px]" />, requiredPerm: 'admin.users.manage' },
      { key: 'admin.permissions', label: 'Ma trận phân quyền', icon: <ShieldIcon className="h-[14px] w-[14px]" />, requiredPerm: 'admin.users.manage' },
      { key: 'admin.import', label: 'Import Excel', icon: <UploadIcon className="h-[14px] w-[14px]" />, requiredPerm: 'admin.users.manage' },
      { key: 'admin.deployment', label: 'Triển khai', icon: <UploadIcon className="h-[14px] w-[14px]" />, requiredPerm: 'admin.users.manage' },
      { key: 'assistant', label: 'AI Assistant', icon: <SparklesIcon className="h-[14px] w-[14px]" />, requiredPerm: 'portal.access' },
    ],
  },
];

// --- Drawer quick actions (top of drawer) ---
// Each must navigate to a real route. Used as compact 2x2 grid above groups.
export const DRAWER_QUICK_ACTIONS: NavItem[] = [
  { key: 'contracts.create', label: 'Tạo HĐ', icon: <FilePlusIcon className="h-[16px] w-[16px]" />, requiredPerm: 'contracts.create' },
  { key: 'contracts.print', label: 'In GCN', icon: <PrinterIcon className="h-[16px] w-[16px]" />, requiredPerm: 'contracts.read' },
  { key: 'tools.royalty', label: 'Bảng tính', icon: <CalculatorIcon className="h-[16px] w-[16px]" />, requiredPerm: 'portal.access' },
  { key: 'reports', label: 'Báo cáo', icon: <BarChart3Icon className="h-[16px] w-[16px]" />, requiredPerm: 'reports.view' },
  { key: 'dispatch', label: 'Công văn', icon: <MailIcon className="h-[16px] w-[16px]" />, requiredPerm: 'annexes.read' },
];

// --- Pinned quick-action dock (4 actions, subtle) ---
// All entries must navigate to a REAL existing route. Reduced to 4 since
// drawer is now the full app map.
//
// NOTE: In the Command Center default, the dock is hidden (see
// COMMAND_CENTER_FLAGS.COMMAND_DOCK_ENABLED below). The constant is kept
// here so the data is reusable and available for future use.
export const PINNED_DOCK: NavItem[] = [
  { key: 'contracts.create', label: 'Tạo HĐ', icon: <FilePlusIcon className="h-[18px] w-[18px]" />, requiredPerm: 'contracts.create' },
  { key: 'contracts.print', label: 'In GCN', icon: <PrinterIcon className="h-[18px] w-[18px]" />, requiredPerm: 'contracts.read' },
  { key: 'reports', label: 'Báo cáo', icon: <BarChart3Icon className="h-[18px] w-[18px]" />, requiredPerm: 'reports.view' },
  { key: 'dispatch', label: 'Công văn', icon: <MailIcon className="h-[18px] w-[18px]" />, requiredPerm: 'annexes.read' },
];

// --- Optional topbar "+ Tạo mới" actions ---
// Used by the optional compact "Tạo mới" dropdown in the topbar. Each entry
// must navigate to a real existing route. Order = dropdown order.
export const TOPBAR_CREATE_ACTIONS: NavItem[] = [
  { key: 'contracts.create', label: 'Tạo hợp đồng', icon: <FilePlusIcon className="h-[14px] w-[14px]" />, requiredPerm: 'contracts.create' },
  { key: 'contracts.print', label: 'In GCN', icon: <PrinterIcon className="h-[14px] w-[14px]" />, requiredPerm: 'contracts.read' },
  { key: 'dispatch', label: 'Công văn', icon: <MailIcon className="h-[14px] w-[14px]" />, requiredPerm: 'annexes.read' },
  { key: 'reports', label: 'Báo cáo', icon: <BarChart3Icon className="h-[14px] w-[14px]" />, requiredPerm: 'reports.view' },
];

// =============================================================================
// Feature flags for the Command Center shell.
// Flip these to true to re-enable the optional sub-layers.
// =============================================================================
export const COMMAND_CENTER_FLAGS = {
  /** When true, the left-side dock rail is rendered. Default: false (drawer
   *  is the primary navigation; the dock would be a duplication of the
   *  drawer's quick actions). */
  COMMAND_DOCK_ENABLED: false,
  /** When true, the global subnav strip under the topbar is rendered when
   *  there are subnav items for the active module. Default: false
   *  (subnav previously duplicated the drawer groups). */
  COMMAND_SUBNAV_ENABLED: false,
  /** When true, a compact "+ Tạo mới" button with a real-action dropdown is
   *  rendered in the topbar. Default: false — primary workflow actions now
   *  live in the Orb Launcher's quick-action row to avoid duplication. */
  COMMAND_TOPBAR_CREATE_ENABLED: false,
} as const;

// --- Legacy Sidebar groups (kept untouched) ---
// These are still consumed by the legacy Sidebar.tsx for the fallback layout.
export const SIDEBAR_TOP: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboardIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'portal.access',
  },
];

export const SIDEBAR_CONTRACTS_CHILDREN: NavItem[] = [
  {
    key: 'contracts.list',
    label: 'Danh sách hợp đồng',
    icon: <ListIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'contracts.read',
  },
  {
    key: 'contracts.create',
    label: 'Tạo hợp đồng',
    icon: <FilePlusIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'contracts.create',
  },
  {
    key: 'contracts.print',
    label: 'In GCN',
    icon: <PrinterIcon className="h-[15px] w-[15px]" />,
    requiredPerm: 'contracts.read',
  },
];

export const SIDEBAR_BUSINESS_REST: NavItem[] = [
  { key: 'annexes', label: 'Phụ lục', icon: <PaperclipIcon className="h-[15px] w-[15px]" />, requiredPerm: 'annexes.read' },
  { key: 'dispatch', label: 'Công văn', icon: <MailIcon className="h-[15px] w-[15px]" />, requiredPerm: 'annexes.read' },
  { key: 'reports', label: 'Báo cáo', icon: <BarChart3Icon className="h-[15px] w-[15px]" />, requiredPerm: 'reports.view' },
  { key: 'search', label: 'Tìm kiếm', icon: <SearchIcon className="h-[15px] w-[15px]" />, requiredPerm: 'works.read' },
];

export const SIDEBAR_SYSTEM: NavItem[] = [
  { key: 'admin.users', label: 'Quản lý người dùng', icon: <ShieldIcon className="h-[15px] w-[15px]" />, requiredPerm: 'admin.users.manage' },
  { key: 'admin.permissions', label: 'Ma trận phân quyền', icon: <ShieldIcon className="h-[15px] w-[15px]" />, requiredPerm: 'admin.users.manage' },
  { key: 'admin.import', label: 'Import Excel', icon: <UploadIcon className="h-[15px] w-[15px]" />, requiredPerm: 'admin.users.manage' },
  { key: 'admin.deployment', label: 'Triển khai', icon: <UploadIcon className="h-[15px] w-[15px]" />, requiredPerm: 'admin.users.manage' },
  { key: 'assistant', label: 'AI Assistant', icon: <SparklesIcon className="h-[15px] w-[15px]" />, badge: 'Beta', requiredPerm: 'portal.access' },
];

// All route keys that belong to the "Hợp đồng" group in the legacy sidebar.
export const CONTRACTS_GROUP_KEYS: RouteKey[] = [
  ...SIDEBAR_CONTRACTS_CHILDREN.map((c) => c.key),
  'contracts.detail',
  'contracts.edit',
  'contracts.create',
  'contracts.print',
];

// Helper: which top-level module is "active" for a given current route?
export function resolveActiveTopLevel(current: RouteKey): RouteKey {
  // Direct top-level match
  if (TOP_LEVEL_MODULES.some((m) => m.key === current)) return current;
  // Contract children collapse to "Hợp đồng"
  if (CONTRACTS_GROUP_KEYS.includes(current)) return 'contracts.list';
  // GCN print
  if (current === 'contracts.print') return 'contracts.print';
  // Hệ thống children
  if (['admin.users', 'admin.permissions', 'admin.import', 'admin.deployment', 'assistant'].includes(current)) return 'admin.users';
  // Default
  return 'dashboard';
}
