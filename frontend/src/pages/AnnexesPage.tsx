/**
 * AnnexesPage — Quản lý Phụ lục hợp đồng
 *
 * Phụ lục là các tài liệu đính kèm hợp đồng chính.
 * Backend phân biệt phụ lục vs hợp đồng chính qua `annex_no IS NOT NULL`.
 *
 * Design: Premium enterprise SaaS, đồng bộ với ContractsListPage.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  PlusIcon,
  EyeIcon,
  PencilIcon,
  Trash2Icon,
  DownloadIcon,
  SearchIcon,
  RefreshCwIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
} from 'lucide-react';
import { Page, PageHeader } from '../components/app-ui/Page';
import { ContentCard } from '../components/app-ui/ContentCard';
import { Button } from '../components/app-ui/Button';
import { Select } from '../components/app-ui/Select';
import { Input } from '../components/app-ui/Input';
import { Tabs } from '../components/app-ui/Tabs';
import { EmptyState } from '../components/app-ui/EmptyState';
import { TableSkeleton } from '../components/app-ui/TableSkeleton';
import { Modal } from '../components/app-ui/Modal';
import { RowActionsMenu } from '../components/app-ui/RowActionsMenu';
import { Checkbox } from '../components/app-ui/Checkbox';
import { StatusBadge } from '../components/app-ui/StatusBadge';
import { Pagination } from '../components/app-ui/Pagination';
import { RouteKey } from '../data/routes';
import { formatDate } from '../lib/format';
import { getStoredToken } from '../lib/authClient';
import {
  downloadDocxFile,
  triggerFileDownload,
} from '../lib/contractsClient';

// =============================================================================
// Types
// =============================================================================

type AnnexListItem = {
  id: number;
  annexNo: string;
  contractNo: string;
  contractId: number;
  customerName: string;
  domain: string;
  signedDate: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: string;
  royaltyAmount: number;
};

type TabId = 'list' | 'create';

// =============================================================================
// Helpers
// =============================================================================

function formatMoney(v: number): string {
  if (v == null || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(v);
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
    ACTIVE: { label: 'Hiệu lực', tone: 'success' },
    EXPIRED: { label: 'Hết hiệu lực', tone: 'neutral' },
    PENDING: { label: 'Chờ ký', tone: 'warning' },
    DRAFT: { label: 'Nháp', tone: 'info' },
    CANCELLED: { label: 'Đã hủy', tone: 'danger' },
  };
  const cfg = config[status] || { label: status, tone: 'neutral' as const };
  return <StatusBadge tone={cfg.tone} compact dot>{cfg.label}</StatusBadge>;
}

function DomainPill({ domain }: { domain: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-lime-50 text-lime-700 ring-1 ring-inset ring-lime-200">
      <PaperclipIcon className="h-3 w-3" />
      {domain || '—'}
    </span>
  );
}

// =============================================================================
// AnnexListTab
// =============================================================================

function AnnexListTab({ onNavigate }: { onNavigate: (route: RouteKey) => void }) {
  const [items, setItems] = useState<AnnexListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailAnnex, setDetailAnnex] = useState<AnnexListItem | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);

  const domainOptions = [
    { value: '', label: 'Tất cả lĩnh vực' },
    { value: 'KARAOKE', label: 'Karaoke' },
    { value: 'CAFE', label: 'Cà phê' },
    { value: 'NHA_HANG', label: 'Nhà hàng' },
    { value: 'KHACH_SAN', label: 'Khách sạn' },
    { value: 'KHU_VUI_CHOI', label: 'Khu vui chơi' },
  ];

  const statusOptions = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'ACTIVE', label: 'Hiệu lực' },
    { value: 'EXPIRED', label: 'Hết hiệu lực' },
    { value: 'PENDING', label: 'Chờ ký' },
    { value: 'DRAFT', label: 'Nháp' },
    { value: 'CANCELLED', label: 'Đã hủy' },
  ];

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      // No dedicated annex API yet — returns empty for now.
      // Wire to /api/contracts?annex=true when backend implements annex filter.
      setItems([]);
      setTotal(0);
      setTotalPages(1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleToggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleToggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDownload = async (item: AnnexListItem) => {
    const token = getStoredToken();
    if (!token) return;
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadDocxFile(token, item.id);
      triggerFileDownload(blob, filename);
    } catch (e: unknown) {
      console.error(e);
      setDownloadError('Tải thất bại. Vui lòng thử lại.');
    }
  };

  const showEmpty = items.length === 0 && !loading;

  return (
    <div className="flex flex-col gap-5">
      {/* Download error banner */}
      {downloadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-rose-700">{downloadError}</span>
          <button
            onClick={() => setDownloadError(null)}
            className="ml-auto text-rose-400 hover:text-rose-600"
          >✕</button>
        </div>
      )}

      {/* Filters */}
      <ContentCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <Input
              label="Tìm kiếm"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Số phụ lục, tên đơn vị..."
              className="w-full"
            />
          </div>
          <Select
            label="Lĩnh vực"
            value={domain}
            onChange={(v) => { setDomain(v); setPage(1); }}
            options={domainOptions}
            size="sm"
            className="w-44"
          />
          <Select
            label="Trạng thái"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={statusOptions}
            size="sm"
            className="w-40"
          />
          <div className="ml-auto flex items-center gap-2">
            {selectedIds.size > 0 && (
              <span className="text-xs text-zinc-500">{selectedIds.size} đã chọn</span>
            )}
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RefreshCwIcon size={13} />}
              onClick={loadItems}
              disabled={loading}
            >
              Làm mới
            </Button>
          </div>
        </div>
      </ContentCard>

      {/* Table */}
      <ContentCard>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : showEmpty ? (
          <EmptyState
            title="Chưa có phụ lục nào"
            description={
              search || domain || status
                ? 'Thử thay đổi bộ lọc để xem thêm kết quả.'
                : 'Phụ lục được tạo từ trang chi tiết hợp đồng. Chọn một hợp đồng để tạo phụ lục.'
            }
            icon={<PaperclipIcon className="h-8 w-8 text-zinc-300" />}
            action={
              <Button
                size="sm"
                variant="primary"
                leftIcon={<PlusIcon size={13} />}
                onClick={() => onNavigate('contracts.list')}
              >
                Xem hợp đồng
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="vc-datatable">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="pb-3 pl-4 pr-2 text-left w-8">
                      <Checkbox
                        checked={selectedIds.size === items.length && items.length > 0}
                        indeterminate={selectedIds.size > 0 && selectedIds.size < items.length}
                        onChange={handleToggleAll}
                      />
                    </th>
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Số phụ lục</th>
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Hợp đồng gốc</th>
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Đơn vị</th>
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Hiệu lực</th>
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Trạng thái</th>
                    <th className="pb-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Số tiền</th>
                    <th className="pb-3 pr-4 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60 transition-colors"
                    >
                      <td className="py-3 pl-4 pr-2">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onChange={() => handleToggleOne(item.id)}
                        />
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => setDetailAnnex(item)}
                          className="font-mono text-xs text-lime-600 hover:text-lime-800 font-medium hover:underline"
                        >
                          {item.annexNo}
                        </button>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => onNavigate('contracts.list')}
                          className="font-mono text-xs text-zinc-600 hover:text-zinc-900 hover:underline"
                        >
                          {item.contractNo}
                        </button>
                      </td>
                      <td className="py-3 text-sm text-zinc-700 max-w-[200px] truncate" title={item.customerName}>
                        {item.customerName || '—'}
                      </td>
                      <td className="py-3 text-xs text-zinc-500">
                        {item.effectiveTo ? (
                          <span>
                            {formatDate(item.effectiveFrom)} — {formatDate(item.effectiveTo)}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        <StatusPill status={item.status} />
                      </td>
                      <td className="py-3 text-xs font-mono text-zinc-600">
                        {item.royaltyAmount > 0 ? (
                          <span>{formatMoney(item.royaltyAmount)}</span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <RowActionsMenu
                          actions={[
                            { label: 'Xem chi tiết', onClick: () => setDetailAnnex(item) },
                            { label: 'Tải DOCX', onClick: () => handleDownload(item) },
                            { label: 'Sửa phụ lục', disabled: true, disabledReason: 'Chưa có endpoint', onClick: () => {} },
                            { label: 'Xóa', tone: 'danger', disabled: true, disabledReason: 'Chưa có endpoint', onClick: () => {} },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  total={total}
                  rangeFrom={(page - 1) * pageSize + 1}
                  rangeTo={Math.min(page * pageSize, total)}
                  onPageChange={(p) => setPage(p)}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                />
              </div>
            )}
          </>
        )}
      </ContentCard>

      {/* Detail Modal */}
      <Modal
        open={!!detailAnnex}
        onClose={() => setDetailAnnex(null)}
        title={detailAnnex ? `Phụ lục: ${detailAnnex.annexNo}` : 'Chi tiết phụ lục'}
        size="lg"
      >
        {detailAnnex && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-zinc-400 text-xs">Số phụ lục: </span>
                <span className="font-mono font-medium">{detailAnnex.annexNo}</span>
              </div>
              <div>
                <span className="text-zinc-400 text-xs">Hợp đồng gốc: </span>
                <span className="font-mono">{detailAnnex.contractNo}</span>
              </div>
              <div>
                <span className="text-zinc-400 text-xs">Đơn vị: </span>
                <span>{detailAnnex.customerName || '—'}</span>
              </div>
              <div>
                <span className="text-zinc-400 text-xs">Lĩnh vực: </span>
                <DomainPill domain={detailAnnex.domain} />
              </div>
              <div>
                <span className="text-zinc-400 text-xs">Ngày ký: </span>
                <span>{formatDate(detailAnnex.signedDate) || '—'}</span>
              </div>
              <div>
                <span className="text-zinc-400 text-xs">Trạng thái: </span>
                <StatusPill status={detailAnnex.status} />
              </div>
              <div>
                <span className="text-zinc-400 text-xs">Hiệu lực từ: </span>
                <span>{formatDate(detailAnnex.effectiveFrom) || '—'}</span>
              </div>
              <div>
                <span className="text-zinc-400 text-xs">Hiệu lực đến: </span>
                <span>{formatDate(detailAnnex.effectiveTo) || '—'}</span>
              </div>
            </div>
            {detailAnnex.royaltyAmount > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">Thông tin tài chính</div>
                <div className="font-mono font-semibold text-zinc-900">
                  {formatMoney(detailAnnex.royaltyAmount)}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="primary"
                leftIcon={<DownloadIcon size={13} />}
                onClick={() => handleDownload(detailAnnex)}
              >
                Tải DOCX
              </Button>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<PencilIcon size={13} />}
                disabled
                title="Chưa có endpoint sửa phụ lục"
                onClick={() => {}}
              >
                Sửa phụ lục
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// =============================================================================
// AnnexCreateTab (placeholder)
// =============================================================================

function AnnexCreateTab() {
  return (
    <div className="flex flex-col gap-5">
      <ContentCard>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-2xl bg-lime-50 flex items-center justify-center mb-4">
            <PlusIcon className="h-6 w-6 text-lime-500" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 mb-2">
            Tạo phụ lục từ hợp đồng
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm mb-4">
            Phụ lục được tạo từ trang chi tiết hợp đồng. Chọn một hợp đồng đã ký trước để bắt đầu.
          </p>
          <p className="text-xs text-zinc-400">
            Tính năng tạo phụ lục sẽ được kết nối ở phase tiếp theo.
          </p>
        </div>
      </ContentCard>
    </div>
  );
}

// =============================================================================
// AnnexesPage (main)
// =============================================================================

export function AnnexesPage({ onNavigate }: { onNavigate: (route: RouteKey) => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('list');

  return (
    <Page>
      <PageHeader
        title="Phụ lục hợp đồng"
        description="Quản lý phụ lục đính kèm hợp đồng chính — theo dõi hiệu lực, tải DOCX và cập nhật trạng thái."
        breadcrumb="Nghiệp vụ"
      />

      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab(v as TabId)}
        tabs={[
          { value: 'list', label: 'Danh sách phụ lục' },
          { value: 'create', label: 'Tạo phụ lục' },
        ]}
      />

      {activeTab === 'list' && <AnnexListTab onNavigate={onNavigate} />}
      {activeTab === 'create' && <AnnexCreateTab />}
    </Page>
  );
}
