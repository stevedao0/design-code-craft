import React from 'react';
import { ArrowLeft, Calculator as CalculatorIcon, ChevronRight } from 'lucide-react';
import { RouteKey } from '../../data/routes';
import { useAuth } from '../../lib/auth';
import { useNavHistory } from '../../lib/navHistory';

interface CommandRibbonProps {
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  onOpenLauncher: () => void;
  onOpenCalculator?: () => void;
}

type RibbonMeta = { group: string; label: string; groupRoute?: RouteKey };

const ROUTE_LABELS: Partial<Record<RouteKey, RibbonMeta>> = {
  dashboard: { group: 'Tổng quan', label: 'Bảng điều khiển', groupRoute: 'dashboard' },
  'contracts.list': { group: 'Hợp đồng', label: 'Danh sách hợp đồng', groupRoute: 'contracts.list' },
  'contracts.detail': { group: 'Hợp đồng', label: 'Chi tiết hợp đồng', groupRoute: 'contracts.list' },
  'contracts.edit': { group: 'Hợp đồng', label: 'Chỉnh sửa hợp đồng', groupRoute: 'contracts.list' },
  'contracts.create': { group: 'Hợp đồng', label: 'Tạo hợp đồng', groupRoute: 'contracts.list' },
  'contracts.print': { group: 'Hợp đồng', label: 'In giấy chứng nhận', groupRoute: 'contracts.list' },
  annexes: { group: 'Nghiệp vụ', label: 'Phụ lục' },
  dispatch: { group: 'Nghiệp vụ', label: 'Công văn', groupRoute: 'dispatch' },
  reports: { group: 'Nghiệp vụ', label: 'Báo cáo', groupRoute: 'reports' },
  search: { group: 'Nghiệp vụ', label: 'Tìm kiếm', groupRoute: 'search' },
  'admin.users': { group: 'Hệ thống', label: 'Người dùng', groupRoute: 'admin.users' },
  'admin.permissions': { group: 'Hệ thống', label: 'Phân quyền', groupRoute: 'admin.users' },
  'admin.import': { group: 'Hệ thống', label: 'Import Excel', groupRoute: 'admin.users' },
  'admin.deployment': { group: 'Hệ thống', label: 'Triển khai', groupRoute: 'admin.users' },
  assistant: { group: 'Hệ thống', label: 'Trợ lý AI' },
  'tools.royalty': { group: 'Công cụ', label: 'Tính tiền bản quyền' },
  'tools.royalty.history': { group: 'Công cụ', label: 'Lịch sử bảng tính' },
};

/**
 * Command Ribbon — 60px premium topbar.
 *
 * Brand rule: the VCPMC logo lives ONLY inside the CommandOrb. The topbar
 * carries the wordmark "VCPMC · Hệ thống quản lý cấp phép" as text only,
 * with no seal, no mini-logo, and no placeholder block.
 *
 * Layout:
 *  - Wordmark + breadcrumb (left)
 *  - Inline command hint (center, opens launcher)
 *  - Date + user avatar (right)
 */
export function CommandRibbon({ current, onNavigate, onOpenLauncher: _onOpenLauncher, onOpenCalculator }: CommandRibbonProps) {
  const { currentUser } = useAuth();
  const { canGoBack, goBack } = useNavHistory();
  const meta: RibbonMeta = ROUTE_LABELS[current] ?? { group: 'VCPMC', label: 'Trung tâm điều hành' };
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const fullDate = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
  const initials = React.useMemo(() => {
    const e = currentUser?.email || '';
    const name = e.split('@')[0];
    if (!name) return 'VC';
    const parts = name.split(/[._-]/);
    return (parts[0]?.[0] ?? 'V').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
  }, [currentUser?.email]);


  return (
    <header className="vcpmc-ribbon" aria-label="Command ribbon">
      <div className="vcpmc-ribbon__inner">
        {/* LEFT: back + breadcrumb only. The brand mark lives in the Orb. */}
        <div className="vcpmc-ribbon__brand-zone">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            className="vcpmc-ribbon__back"
            aria-label="Quay lại trang trước"
            title="Quay lại trang trước"
          >
            <ArrowLeft className="vcpmc-ribbon__back-icon" aria-hidden />
          </button>
          <nav className="vcpmc-ribbon__breadcrumb" aria-label="Vị trí hiện tại">
            {meta.groupRoute && meta.groupRoute !== current ? (
              <button
                type="button"
                className="vcpmc-ribbon__crumb"
                onClick={() => onNavigate(meta.groupRoute as RouteKey)}
              >
                {meta.group}
              </button>
            ) : (
              <span className="vcpmc-ribbon__group">{meta.group}</span>
            )}
            <ChevronRight className="vcpmc-ribbon__sep" aria-hidden />
            <span className="vcpmc-ribbon__label" aria-current="page">{meta.label}</span>
          </nav>
        </div>

        {/* RIGHT: compact system tray — calculator · clock · avatar */}
        <div className="vcpmc-ribbon__right">
          <div className="vcpmc-tray">
            {onOpenCalculator && (
              <button
                type="button"
                onClick={onOpenCalculator}
                className="vcpmc-tray__action"
                aria-label="Tính tiền bản quyền"
                title="Tính tiền bản quyền"
              >
                <CalculatorIcon className="vcpmc-tray__action-icon" aria-hidden />
                <span className="vcpmc-tray__action-label">Bảng tính</span>
              </button>
            )}
            <span className="vcpmc-tray__clock" title={`${time} · ${fullDate}`}>
              <span className="vcpmc-tray__time">{time}</span>
              <span className="vcpmc-tray__date">{fullDate}</span>
            </span>
            <span className="vcpmc-tray__divider" aria-hidden />
            <span className="vcpmc-ribbon__avatar" title={currentUser?.email || ''}>
              {initials}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}