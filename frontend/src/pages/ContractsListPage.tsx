import React, { useEffect, useState } from 'react';
import {
  FilePlusIcon,
  RefreshCwIcon,
  EyeIcon,
  PencilIcon,
  FileDownIcon,
  AwardIcon,
  PrinterIcon,
  Trash2Icon,
  FileTextIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  XIcon,
  LoaderIcon,
  LayersIcon,
  LayoutGridIcon,
} from 'lucide-react';
import { Tabs } from '../components/app-ui/Tabs';
import { Button } from '../components/app-ui/Button';
import { Select } from '../components/app-ui/Select';
import { SearchBox } from '../components/app-ui/SearchBox';
import { Checkbox } from '../components/app-ui/Checkbox';
import { BulkActionBar } from '../components/app-ui/BulkActionBar';
import { Pagination } from '../components/app-ui/Pagination';
import { TableSkeleton } from '../components/app-ui/TableSkeleton';
import { EmptyState } from '../components/app-ui/EmptyState';
import { Modal } from '../components/app-ui/Modal';
import { Page, PageHeader } from '../components/app-ui/Page';
import { RouteKey } from '../data/routes';
import { assignCertificateNumber } from '../lib/certificatesClient';
import {
  ContractRecord,
} from '../data/contractRecords';
import {
  CONTRACT_YEAR_OPTIONS,
  LINH_VUC_OPTIONS,
  FIELD_CODE_OPTIONS,
  StatusFilter,
} from '../data/contractOptions';
import { formatNumber } from '../lib/format';
import {
  ApiContractItem,
  getContracts,
  getContractsSummary,
  exportDocxPreview,
  getCertificateContextDryRun,
  deleteContractCloneOnly,
  type ExportPreviewResult,
  type CertificateContextResult,
  type DeleteContractCloneOnlyResult,
  type ContractsSummaryStats,
} from '../lib/contractsClient';
import { useAuth } from '../lib/auth';
import { TOKEN_KEY } from '../lib/authClient';
import { EnterprisePage } from '../components/enterprise';
import { ContractsDesktopTable } from '../components/contracts/ContractsDesktopTable';
import { ContractsMobileList } from '../components/contracts/ContractsMobileList';

/* ──────────────────────────────────────────────────────────── */
/*  Map API contract → UI record                              */
/* ──────────────────────────────────────────────────────────── */
function toContractRecord(item: ApiContractItem): ContractRecord {
  const contractYearFromNo = (() => {
    const parts = String(item.contract_no || '').split('/');
    if (parts.length < 2) return 0;
    const parsed = Number(parts[1]);
    return Number.isFinite(parsed) ? parsed : 0;
  })();

  return {
    id: Number(item.id),
    contract_no: String(item.contract_no || ''),
    contract_year: Number(item.contract_year || contractYearFromNo || 0),
    don_vi_ten: String(item.customer_name || ''),
    ten_bang_hieu: item.ten_bang_hieu || null,
    dia_chi_su_dung: item.dia_chi_su_dung || '',
    linh_vuc_hien_thi: String(item.domain || ''),
    region_code: String(item.region_code || ''),
    field_code: String(item.field_code || ''),
    ngay_lap_hop_dong: String(item.created_at || ''),
    ngay_bat_dau: String(item.start_date || ''),
    ngay_ket_thuc: String(item.end_date || ''),
    so_tien_value: item.so_tien_value ?? null,
    renewal_status: (item.renewal_status as ContractRecord['renewal_status']) ?? null,
    is_renewable: item.is_renewable ?? false,
    loai_hinh_karaoke: item.loai_hinh_karaoke || null,
    tong_so_phong: item.tong_so_phong ?? null,
    tong_so_box: item.tong_so_box ?? null,
    don_vi_dia_chi: item.don_vi_dia_chi ?? null,
    royalty_amount_before_vat: item.royalty_amount_before_vat ?? null,
    vat_rate: item.vat_rate ?? null,
    vat_amount: item.vat_amount ?? null,
    royalty_amount_after_vat: item.royalty_amount_after_vat ?? null,
    royalty_amount_in_words: item.royalty_amount_in_words ?? null,
    music_usage_areas: item.music_usage_areas ?? null,
    gcn_status: item.gcn_status ?? null,
    gcn_certificate_no: item.gcn_certificate_no ?? null,
    gcn_certificate_id: item.gcn_certificate_id ?? null,
  };
}

/* ──────────────────────────────────────────────────────────── */
/*  Density helpers                                            */
/* ──────────────────────────────────────────────────────────── */
type Density = 'compact' | 'mid' | 'detail';

const DENSITY_KEY = 'vcpmc.contractsTableDensity.v1';

const VALID_DENSITIES = new Set<Density>(['compact', 'mid', 'detail']);

function loadDensity(): Density {
  try {
    const stored = localStorage.getItem(DENSITY_KEY);
    if (stored && VALID_DENSITIES.has(stored as Density)) return stored as Density;
  } catch { /* ignore */ }
  return 'mid'; // safe default per spec
}

function saveDensity(d: Density) {
  try { localStorage.setItem(DENSITY_KEY, d); } catch { /* ignore */ }
}

interface DensityStyle {
  row: string;
  firstCell: string;
  cell: string;
  badgeLine: string;
  // Per-density line-clamp overrides for customer / address cells
  customerLines: string;   // class string for customer name element
  addressLines: string;    // class string for address element
  secondaryLines: string;   // class string for customer secondary element
  // Visual indicator class for density mode
  indicator: string;
}

const DENSITY: Record<Density, DensityStyle> = {
  compact: {
    row: 'h-10',              // 40px - very compact for scanning
    firstCell: 'pl-3 pr-1.5 py-1',
    cell: 'px-2 py-1',
    badgeLine: 'gap-0.5',
    customerLines: 'line-clamp-1',
    addressLines: 'line-clamp-1',
    secondaryLines: 'line-clamp-1',
    indicator: 'border-b-2 border-amber-600', // visual indicator: amber underline
  },
  mid: {
    row: 'h-[58px]',          // 58px — balanced default
    firstCell: 'pl-4 pr-2 py-2',
    cell: 'px-3 py-2',
    badgeLine: 'gap-1',
    customerLines: 'line-clamp-2',
    addressLines: 'line-clamp-2',
    secondaryLines: 'line-clamp-1',
    indicator: '', // no extra indicator for default
  },
  detail: {
    row: 'h-[76px]',          // 76px — noticeably taller for detail review
    firstCell: 'pl-4 pr-2 py-2.5',
    cell: 'px-4 py-2.5',
    badgeLine: 'gap-1.5',
    customerLines: 'line-clamp-2',
    addressLines: 'line-clamp-3',
    secondaryLines: 'line-clamp-2',
    indicator: 'border-b-2 border-lime-600', // visual indicator: emerald underline
  },
};

/* ──────────────────────────────────────────────────────────── */
/*  Main component                                             */
/* ──────────────────────────────────────────────────────────── */
export function ContractsListPage({
  onNavigate,
  onOpenDetail,
  onPrintCertificate,
  onCreateNew,
  onOpenCreateContract,
}: {
  onNavigate: (k: RouteKey) => void;
  onOpenDetail: (id: number) => void;
  onPrintCertificate?: (contractId: number) => void;
  onCreateNew?: (latestContract: ContractRecord | undefined) => void;
  /**
   * Opens the "Tạo hợp đồng" WorkflowSheet over the current page. If not
   * provided (e.g. legacy shell), the CTA falls back to direct navigation.
   */
  onOpenCreateContract?: () => void;
}) {
  const { currentUser, hasPermission } = useAuth();
  // Detail (read full contract) is a separate permission from list-only.
  const canDetail = hasPermission('contracts.read');
  const canCreate = hasPermission('contracts.create');
  const canEdit = canDetail && hasPermission('contracts.update');
  const canDelete = hasPermission('contracts.delete');
  const canExport = hasPermission('reports.export');
  // List-only: no detail, no actions on rows. Row click is disabled.
  const readOnly = !canDetail;

  // Filter state
  const [keyword, setKeyword] = useState('');
  const [year, setYear] = useState('');
  const [linhVuc, setLinhVuc] = useState('');
  const [status, setStatus] = useState<StatusFilter | ''>('');
  const [fieldCode, setFieldCode] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all');
  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Loading
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [summaryStats, setSummaryStats] = useState<ContractsSummaryStats | null>(null);
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [reloadTick, setReloadTick] = useState(0);
  // Density toggle (persisted in localStorage)
  const [density, setDensity] = useState<Density>(loadDensity);

  const hasActiveFilter = !!keyword || !!year || !!linhVuc || !!status || !!fieldCode;
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === 0 ? 0 : Math.min(page * pageSize, total);
  const visibleIds = contracts.map((r) => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = !allSelected && visibleIds.some((id) => selected.has(id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set()); else setSelected(new Set(visibleIds));
  };
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearFilters = () => {
    setKeyword(''); setYear(''); setLinhVuc(''); setStatus(''); setFieldCode('');
    setPage(1); setSelected(new Set());
  };
  const triggerRefresh = () => { setReloadTick((v) => v + 1); };

  // --- Row action handlers ---
  const openWordPreview = async (r: ContractRecord) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setActionModal({
      contractId: r.id, contractNo: r.contract_no, customerName: r.don_vi_ten,
      domain: r.linh_vuc_hien_thi, action: 'word_preview', loading: true, error: '',
      wordResult: null, gcnResult: null, deleteResult: null,
    });
    try {
      const result = await exportDocxPreview(token, r.id, { include_blocks: true });
      setActionModal((p) => ({ ...p, loading: false, wordResult: result, error: result.ok ? '' : 'Preview that bai' }));
    } catch (err: any) {
      setActionModal((p) => ({ ...p, loading: false, error: String(err?.message || 'Loi khi tao Word preview') }));
    }
  };

  const openGcnContext = async (r: ContractRecord) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setActionModal({
      contractId: r.id, contractNo: r.contract_no, customerName: r.don_vi_ten,
      domain: r.linh_vuc_hien_thi, action: 'gcn_context', loading: true, error: '',
      wordResult: null, gcnResult: null, deleteResult: null,
    });
    try {
      const result = await getCertificateContextDryRun(token, r.id);
      setActionModal((p) => ({ ...p, loading: false, gcnResult: result, error: result.ok ? '' : 'Khong lay duoc du lieu GCN' }));
    } catch (err: any) {
      setActionModal((p) => ({ ...p, loading: false, error: String(err?.message || 'Loi khi lay du lieu GCN') }));
    }
  };

  const openDeleteConfirm = (r: ContractRecord) => {
    setActionModal({
      contractId: r.id, contractNo: r.contract_no, customerName: r.don_vi_ten,
      domain: r.linh_vuc_hien_thi, action: 'delete_confirm', loading: false, error: '',
      wordResult: null, gcnResult: null, deleteResult: null,
    });
  };

  const openGcnEdit = (r: ContractRecord) => {
    setGcnEditModal({
      open: true, contractId: r.id, contractNo: r.contract_no,
      certificateId: r.gcn_certificate_id ?? null,
      currentNo: r.gcn_certificate_no ?? '', saving: false, error: '',
    });
  };

  const saveGcnNumber = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const certId = gcnEditModal.certificateId;
    if (!certId) { setGcnEditModal((p) => ({ ...p, error: 'Không tìm thấy bản ghi chứng nhận.' })); return; }
    const newNo = gcnEditModal.currentNo.trim();
    if (!newNo) { setGcnEditModal((p) => ({ ...p, error: 'Số GCN không được để trống.' })); return; }
    setGcnEditModal((p) => ({ ...p, saving: true, error: '' }));
    try {
      const result = await assignCertificateNumber(token, certId, { certificate_no: newNo, allow_duplicate_certificate_no: false });
      if (result.errors && result.errors.length > 0) {
        setGcnEditModal((p) => ({ ...p, saving: false, error: result.errors.map((e: { message: string }) => e.message).join('; ') }));
        return;
      }
      setContracts((prev) => prev.map((c) =>
        c.id === gcnEditModal.contractId ? { ...c, gcn_certificate_no: newNo, gcn_status: result.updated?.status ?? c.gcn_status } : c));
      setGcnEditModal((p) => ({ ...p, open: false }));
    } catch (err: any) {
      setGcnEditModal((p) => ({ ...p, saving: false, error: String(err?.message || 'Lỗi khi lưu số GCN.') }));
    }
  };

  const confirmDelete = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setActionModal((p) => ({ ...p, loading: true, error: '' }));
    try {
      const result = await deleteContractCloneOnly(token, actionModal.contractId);
      setActionModal((p) => ({ ...p, loading: false, deleteResult: result, action: 'delete_result', error: result.ok ? '' : result.message }));
      if (result.ok) { setTimeout(() => { closeActionModal(); triggerRefresh(); }, 1500); }
    } catch (err: any) {
      const msg = String(err?.message || 'Loi khi xoa');
      const mode = msg.includes('405') ? 'endpoint_missing' : msg.includes('403') ? 'forbidden' : 'error';
      setActionModal((p) => ({
        ...p, loading: false, action: 'delete_result',
        deleteResult: {
          ok: false, mode, message: msg, write_performed: false,
          contract_id: actionModal.contractId, contract_no: actionModal.contractNo,
          deleted_contract_records: 0, deleted_certificate_records: 0, deleted_related_rows: 0,
          old_db_touched: false, blocked_final_certificates: 0, admin_delete_any_enabled: false,
          permission_used: null, warnings: [], errors: [{ field: mode === 'endpoint_missing' ? 'http' : 'catch', message: msg }],
        },
        error: '',
      }));
    }
  };

  const closeActionModal = () => {
    setActionModal({
      contractId: 0, contractNo: '', customerName: '', domain: '', action: null,
      loading: false, error: '', wordResult: null, gcnResult: null, deleteResult: null,
    });
  };

  // Action modal state
  const [actionModal, setActionModal] = useState<{
    contractId: number; contractNo: string; customerName: string; domain: string;
    action: 'word_preview' | 'gcn_context' | 'delete_confirm' | 'delete_result' | null;
    loading: boolean; error: string;
    wordResult: ExportPreviewResult | null; gcnResult: CertificateContextResult | null; deleteResult: DeleteContractCloneOnlyResult | null;
  }>({
    contractId: 0, contractNo: '', customerName: '', domain: '', action: null,
    loading: false, error: '', wordResult: null, gcnResult: null, deleteResult: null,
  });

  // GCN edit modal state
  const [gcnEditModal, setGcnEditModal] = useState<{
    open: boolean; contractId: number; contractNo: string;
    certificateId: number | null; currentNo: string; saving: boolean; error: string;
  }>({
    open: false, contractId: 0, contractNo: '', certificateId: null, currentNo: '', saving: false, error: '',
  });

  useEffect(() => {
    let cancelled = false;
    async function loadContracts() {
      setLoading(true); setError('');
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) { throw new Error('Phiên đăng nhập không hợp lệ.'); }
        const data = await getContracts(token, {
          page, page_size: pageSize,
          q: keyword.trim() || undefined,
          domain: (linhVuc || fieldCode || '').trim() || undefined,
          status: status || undefined, year: year || undefined,
        });
        if (cancelled) return;
        setContracts((data.items ?? []).map(toContractRecord));
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 0);
        setSelected((prev) => {
          const allowed = new Set((data.items ?? []).map((x) => Number(x.id)));
          const next = new Set<number>();
          prev.forEach((id) => { if (allowed.has(id)) next.add(id); });
          return next;
        });
      } catch (err: any) {
        if (cancelled) return;
        setContracts([]); setTotal(0); setTotalPages(0);
        setError(String(err?.message || 'Không tải được danh sách hợp đồng.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadContracts();
    return () => { cancelled = true; };
  }, [keyword, year, linhVuc, fieldCode, status, page, pageSize, reloadTick]);

  useEffect(() => {
    let cancelled = false;
    async function loadSummaryStats() {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        const stats = await getContractsSummary(token);
        if (!cancelled) setSummaryStats(stats);
      } catch { if (!cancelled) setSummaryStats(null); }
    }
    loadSummaryStats();
    return () => { cancelled = true; };
  }, [reloadTick]);

  const DS = DENSITY[density];

  // Summary footer stats
  const footerRoyalty = contracts.reduce((sum, r) => sum + (r.royalty_amount_before_vat ?? 0), 0);
  const footerMissingGcn = contracts.filter((r) => r.gcn_status && r.gcn_status !== 'no_gcn' && !r.gcn_certificate_no).length;

  return (
    <Page>
      <EnterprisePage>

        <PageHeader
          eyebrow="Hợp đồng · Danh sách"
          title="Quản lý hợp đồng"
          description="Background & Karaoke · Phân quyền sử dụng tác phẩm âm nhạc"
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCwIcon className="h-4 w-4" />}
                onClick={triggerRefresh}
              >
                Làm mới
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<FilePlusIcon className="h-4 w-4" />}
                disabled={!canCreate}
                onClick={() => {
                  if (onOpenCreateContract) { onOpenCreateContract(); return; }
                  if (onCreateNew && contracts.length > 0) onCreateNew(contracts[0]);
                  onNavigate('contracts.create');
                }}
              >
                Tạo hợp đồng
              </Button>
            </>
          }
        />

        {/* ─── KPI STAT STRIP ────────────────────────────────── */}
        <div className="px-3 py-4 bg-white sm:px-6 sm:py-5 overflow-hidden">
          <div className="grid grid-cols-2 min-w-0 gap-2.5 sm:gap-3 lg:grid-cols-4 lg:gap-4">
            {/* Card 1: Tổng hợp đồng */}
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 sm:px-5 shadow-sm hover:shadow-md transition-all duration-200 hover:border-lime-200 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 min-w-0">
                <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-lime-50 text-lime-600 flex-shrink-0">
                  <FileTextIcon className="h-5 w-5" />
                </div>
                <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-500 min-w-0 break-words leading-tight">Tổng hợp đồng</div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-zinc-900 tabular-nums tracking-tight">{formatNumber(summaryStats?.totalContracts ?? total ?? 0)}</div>
              <div className="text-[11px] sm:text-xs text-zinc-400 mt-1.5">trên toàn hệ thống</div>
            </div>
            {/* Card 2: Còn hiệu lực */}
            <div className="rounded-xl border border-lime-200 bg-gradient-to-br from-lime-50/50 to-white px-4 py-4 sm:px-5 shadow-sm hover:shadow-md transition-all duration-200 hover:border-lime-300 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 min-w-0">
                <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-lime-100 text-lime-600 flex-shrink-0">
                  <CheckCircle2Icon className="h-5 w-5" />
                </div>
                <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-lime-700 min-w-0 break-words leading-tight">Còn hiệu lực</div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-lime-700 tabular-nums tracking-tight">{formatNumber(summaryStats?.active ?? 0)}</div>
              <div className="text-[11px] sm:text-xs text-lime-600 mt-1.5">đang vận hành</div>
            </div>
            {/* Card 3: Cần gia hạn */}
            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/50 to-white px-4 py-4 sm:px-5 shadow-sm hover:shadow-md transition-all duration-200 hover:border-amber-300 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 min-w-0">
                <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-amber-100 text-amber-600 flex-shrink-0">
                  <AlertTriangleIcon className="h-5 w-5" />
                </div>
                <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-amber-700 min-w-0 break-words leading-tight">Cần gia hạn ≤ 30 ngày</div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amber-700 tabular-nums tracking-tight">{formatNumber(summaryStats?.expiringIn30Days ?? 0)}</div>
              <div className="text-[11px] sm:text-xs text-amber-600 mt-1.5">cần xử lý sớm</div>
            </div>
            {/* Card 4: Hết hạn */}
            <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50/50 to-white px-4 py-4 sm:px-5 shadow-sm hover:shadow-md transition-all duration-200 hover:border-rose-300 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 min-w-0">
                <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-rose-100 text-rose-600 flex-shrink-0">
                  <XCircleIcon className="h-5 w-5" />
                </div>
                <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-rose-700 min-w-0 break-words leading-tight">Hết hạn</div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-rose-700 tabular-nums tracking-tight">{formatNumber(summaryStats?.expired ?? 0)}</div>
              <div className="text-[11px] sm:text-xs text-rose-600 mt-1.5">ngưng hiệu lực</div>
            </div>
          </div>
        </div>

        {/* ─── UNIFIED TABLE WORKSPACE ───────────────────────────── */}
        {/* No beige card. Tabs + toolbar + table + footer as one clean block.
           NOTE: no `overflow-hidden` here — mobile cards must grow vertically;
           only the table shell inside can manage its own scroll if needed. */}
        <div className="mx-3 mb-4 border border-zinc-200/80 rounded-xl bg-white shadow-sm sm:mx-6 sm:mb-6">

          {/* --- Status tabs --- */}
          <div className="border-b border-zinc-100 bg-white px-3 pt-3 pb-0 sm:px-4 sm:pt-4">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1 overflow-hidden">
                <Tabs
                  value={tabFilter}
                  onChange={(v) => {
                    setTabFilter(v as typeof tabFilter);
                    if (v === 'all') setStatus('');
                    else if (v === 'active') setStatus('active');
                    else if (v === 'expiring') setStatus('expiring');
                    else if (v === 'expired') setStatus('expired');
                    setPage(1);
                  }}
                  tabs={[
                    { value: 'all', label: 'Tất cả', count: summaryStats?.totalContracts ?? undefined },
                    { value: 'active', label: 'Đang hiệu lực', count: summaryStats?.active ?? undefined },
                    { value: 'expiring', label: 'Cần gia hạn', count: summaryStats?.expiringIn30Days ?? undefined },
                    { value: 'expired', label: 'Hết hạn', count: summaryStats?.expired ?? undefined },
                  ]}
                />
              </div>
              {/* Right side: active filter indicator */}
              {hasActiveFilter && (
                <div className="flex items-center gap-2 text-xs text-lime-600 shrink-0">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-lime-50 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-lime-500 animate-pulse"></span>
                    Đang lọc
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* --- Filter toolbar --- */}
          <div className="px-4 py-3 border-b border-zinc-100 bg-gradient-to-b from-white to-zinc-50/30">
            <div className="flex min-w-0 items-center gap-3 flex-wrap">
              {/* Search — wider and more prominent */}
              <div className="basis-full min-w-0 sm:basis-auto sm:flex-1 sm:min-w-[200px]">
                <SearchBox
                  value={keyword}
                  onChange={(v) => { setKeyword(v); setPage(1); }}
                  placeholder="Tìm số HĐ, đơn vị, bảng hiệu…"
                  size="md"
                  kbd="/"
                  className="shadow-sm"
                />
              </div>

              {/* Filter selects with labels */}
              <div className="flex min-w-0 items-center gap-2 sm:gap-3 flex-wrap w-full sm:w-auto">
                <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
                  <Select size="sm" value={year} onChange={(v) => { setYear(v); setPage(1); }} options={CONTRACT_YEAR_OPTIONS} placeholder="Năm" />
                </div>
                <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
                  <Select size="sm" value={linhVuc} onChange={(v) => { setLinhVuc(v); setPage(1); }} options={LINH_VUC_OPTIONS} placeholder="Lĩnh vực" />
                </div>
                <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
                  <Select size="sm" value={fieldCode} onChange={(v) => { setFieldCode(v); setPage(1); }} options={FIELD_CODE_OPTIONS} placeholder="Mã quyền" />
                </div>
              </div>

              {/* Clear filters */}
              {hasActiveFilter && (
                <Button variant="ghost" size="sm" leftIcon={<XIcon className="h-3.5 w-3.5" />} onClick={clearFilters} className="text-zinc-500 hover:text-lime-600 hover:bg-lime-50">
                  Xóa lọc
                </Button>
              )}

              {/* Right-side: density toggle */}
              <div className="ml-auto flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const next: Density = density === 'compact' ? 'mid' : 'compact';
                    setDensity(next); saveDensity(next);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ring-1 ring-zinc-200 bg-white hover:bg-lime-50 hover:ring-lime-200 hover:text-lime-600 text-[11px] font-medium text-zinc-600 transition-all shrink-0"
                  title={density === 'compact' ? 'Đang xem dạng gọn — nhấn để mở rộng' : 'Đang xem dạng đầy đủ — nhấn để thu gọn'}
                >
                  {density === 'compact' ? (
                    <><LayersIcon className="h-3 w-3" />Dòng gọn</>
                  ) : (
                    <><LayoutGridIcon className="h-3 w-3" />Dòng đầy đủ</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* --- Bulk action bar --- */}
          {selected.size > 0 && (
            <BulkActionBar
              count={selected.size}
              onClear={() => setSelected(new Set())}
              actions={[
                {
                  label: 'Tạo GCN hàng loạt',
                  icon: <AwardIcon className="h-3.5 w-3.5" />,
                  onClick: () => onNavigate('contracts.print'),
                  disabled: selected.size === 0,
                },
              ]}
            />
          )}

          {/* --- Table area --- */}
          {loading ? (
            <TableSkeleton rows={8} cols={9} />
          ) : error ? (
            <EmptyState title="Không tải được dữ liệu" description={error}
              action={<Button variant="secondary" size="sm" onClick={triggerRefresh}>Thử lại</Button>}
              icon={<XCircleIcon className="h-5 w-5" />} />
          ) : contracts.length === 0 ? (
            <EmptyState
              title="Không có hợp đồng nào"
              description={hasActiveFilter ? 'Điều chỉnh từ khóa hoặc xóa bộ lọc.' : 'Chưa có hợp đồng trong danh sách.'}
              action={<Button variant="secondary" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button>}
              icon={<FileTextIcon className="h-5 w-5" />}
            />
          ) : (
            <>
              {/* Mobile/tablet list — real <article> cards. Hidden on >= 1024px. */}
              <ContractsMobileList
                contracts={contracts}
                selected={selected}
                allSelected={allSelected}
                someSelected={someSelected}
                canEdit={canEdit}
                canDelete={canDelete}
                readOnly={readOnly}
                onOpenDetail={onOpenDetail}
                onToggleOne={toggleOne}
                onToggleAll={toggleAll}
                onWordPreview={openWordPreview}
                onGcnContext={openGcnContext}
                onDeleteConfirm={openDeleteConfirm}
                onPrintCertificate={onPrintCertificate}
                onNavigatePrint={() => onNavigate('contracts.print')}
                onAssignGcn={openGcnEdit}
              />

              {/* Desktop table — real <table>. Hidden on < 1024px. */}
              <ContractsDesktopTable
                contracts={contracts}
                selected={selected}
                density={density}
                allSelected={allSelected}
                someSelected={someSelected}
                canEdit={canEdit}
                canDelete={canDelete}
                readOnly={readOnly}
                onOpenDetail={onOpenDetail}
                onToggleOne={toggleOne}
                onToggleAll={toggleAll}
                onWordPreview={openWordPreview}
                onGcnContext={openGcnContext}
                onDeleteConfirm={openDeleteConfirm}
                onPrintCertificate={onPrintCertificate}
                onNavigatePrint={() => onNavigate('contracts.print')}
                onAssignGcn={openGcnEdit}
              />

              {/* ─── FOOTER (desktop table) ───────────────────── */}
              <div className="contracts-desktop-table flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-zinc-100 bg-gradient-to-r from-zinc-50/50 to-white">
                {/* Left: compact stats */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-lime-400"></span>
                    <strong className="text-zinc-700 tabular-nums">{formatNumber(rangeFrom)}–{formatNumber(rangeTo)}</strong>
                    {' / '}
                    <strong className="text-zinc-700 tabular-nums" title="Số hợp đồng trong phạm vi bộ lọc hiện tại">{formatNumber(total)}</strong>{' kết quả'}
                    {hasActiveFilter && summaryStats && summaryStats.totalContracts > total && (
                      <span className="text-zinc-400 ml-1" title="Tổng số hợp đồng trong hệ thống">
                        {' '}trên tổng {formatNumber(summaryStats.totalContracts)}
                      </span>
                    )}
                  </span>
                  {footerRoyalty > 0 && (
                    <>
                      <span className="text-zinc-200 select-none">·</span>
                      <span>Tổng: <strong className="text-zinc-700">{footerRoyalty >= 1_000_000_000 ? `${(footerRoyalty / 1_000_000_000).toFixed(2)} tỷ` : `${(footerRoyalty / 1_000_000).toFixed(1)} triệu`}</strong></span>
                    </>
                  )}
                  {footerMissingGcn > 0 && (
                    <>
                      <span className="text-zinc-200 select-none">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        Thiếu GCN: <strong className="text-amber-600">{footerMissingGcn}</strong>
                      </span>
                    </>
                  )}
                </div>
                {/* Right: pagination */}
                <Pagination
                  page={page}
                  totalPages={Math.max(totalPages, 1)}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                  total={total}
                  rangeFrom={rangeFrom}
                  rangeTo={rangeTo}
                />
              </div>

              {/* ─── MOBILE FOOTER (real cards layout) ───────────── */}
              <div className="contracts-mobile-footer">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '8px 4px 0',
                    borderTop: '1px dashed rgba(0,0,0,0.08)',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#52525b' }}>
                    <strong style={{ color: '#27272a' }}>{formatNumber(rangeFrom)}–{formatNumber(rangeTo)}</strong>
                    {' / '}
                    <strong style={{ color: '#27272a' }}>{formatNumber(total)}</strong> kết quả
                  </div>
                  <Pagination
                    page={page}
                    totalPages={Math.max(totalPages, 1)}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                    total={total}
                    rangeFrom={rangeFrom}
                    rangeTo={rangeTo}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ─── ACTION MODALS ──────────────────────────────────── */}
        {actionModal.action && (
          <Modal
            open
            onClose={closeActionModal}
            title={
              actionModal.action === 'word_preview' ? `Word preview — ${actionModal.contractNo}` :
              actionModal.action === 'gcn_context' ? `Dữ liệu GCN — ${actionModal.contractNo}` :
              actionModal.action === 'delete_confirm' ? `Xác nhận xóa — ${actionModal.contractNo}` :
              actionModal.action === 'delete_result' ? `Kết quả xóa — ${actionModal.contractNo}` :
              `Hành động — ${actionModal.contractNo}`
            }
            size="lg"
          >
            <div className="space-y-4">
              {actionModal.loading && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <LoaderIcon className="h-5 w-5 animate-spin text-amber-700" />
                  <span className="text-sm text-zinc-600">Đang xử lý...</span>
                </div>
              )}
              {actionModal.error && !actionModal.loading && (
                <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-600/15">
                  <div className="flex items-start gap-2">
                    <XCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{actionModal.error}</span>
                  </div>
                </div>
              )}

              {actionModal.action === 'word_preview' && actionModal.wordResult && (
                <div className="space-y-3">
                  <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${actionModal.wordResult.ok ? 'bg-lime-50 text-lime-700' : 'bg-rose-50 text-rose-700'}`}>
                    {actionModal.wordResult.ok ? <CheckCircle2Icon className="h-4 w-4 shrink-0" /> : <XCircleIcon className="h-4 w-4 shrink-0" />}
                    <span className="font-semibold">{actionModal.wordResult.ok ? 'Word preview tạo thành công' : 'Preview thất bại'}</span>
                  </div>
                  {actionModal.wordResult.ok && (
                    <div className="rounded-lg bg-zinc-50 p-4 text-xs space-y-2">
                      {actionModal.wordResult.preview_path && (
                        <div><span className="text-zinc-500">File:</span> <span className="font-mono break-all">{actionModal.wordResult.preview_path}</span></div>
                      )}
                      {actionModal.wordResult.file_size && (
                        <div><span className="text-zinc-500">Size:</span> <span>{(actionModal.wordResult.file_size / 1024).toFixed(1)} KB</span></div>
                      )}
                      {actionModal.wordResult.warnings?.map((w, i) => <p key={i} className="text-amber-600">- {w}</p>)}
                    </div>
                  )}
                </div>
              )}

              {actionModal.action === 'gcn_context' && actionModal.gcnResult && (
                <div className="space-y-3">
                  <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${actionModal.gcnResult.ok ? 'bg-lime-50 text-lime-700' : 'bg-rose-50 text-rose-700'}`}>
                    {actionModal.gcnResult.ok ? <CheckCircle2Icon className="h-4 w-4 shrink-0" /> : <XCircleIcon className="h-4 w-4 shrink-0" />}
                    <span className="font-semibold">{actionModal.gcnResult.ok ? 'Dữ liệu GCN sẵn sàng' : 'Không lấy được dữ liệu GCN'}</span>
                  </div>
                  {actionModal.gcnResult.ok && (
                    <div className="rounded-lg bg-zinc-50 p-4 text-xs space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-zinc-500">Số HĐ:</span> <span className="font-medium">{actionModal.gcnResult.context.contract_no}</span></div>
                        <div><span className="text-zinc-500">Số GCN:</span> <span className="font-medium">{actionModal.gcnResult.context.certificate_no || '(chưa có)'}</span></div>
                        <div className="col-span-2"><span className="text-zinc-500">Đơn vị:</span> <span className="font-medium">{actionModal.gcnResult.context.organization_name}</span></div>
                        <div className="col-span-2"><span className="text-zinc-500">Địa chỉ:</span> <span className="font-medium">{actionModal.gcnResult.context.address || '(chưa có)'}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {actionModal.action === 'delete_confirm' && !actionModal.loading && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-600/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        {currentUser?.role === 'super_admin' ? (
                          <>
                            <p className="font-semibold">Xác nhận xóa vĩnh viễn khỏi DB chính</p>
                            <p className="mt-1 text-xs">Hợp đồng: <strong>{actionModal.contractNo}</strong> · ID: <strong>{actionModal.contractId}</strong></p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold">Xác nhận xóa hợp đồng này?</p>
                            <p className="mt-1 text-xs">Hợp đồng: <strong>{actionModal.contractNo}</strong></p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" onClick={closeActionModal}>Hủy</Button>
                    <Button variant="primary" tone="danger" leftIcon={<Trash2Icon className="h-4 w-4" />} onClick={confirmDelete}>
                      {currentUser?.role === 'super_admin' ? 'Xóa vĩnh viễn' : 'Xác nhận xóa'}
                    </Button>
                  </div>
                </div>
              )}

              {actionModal.action === 'delete_result' && actionModal.deleteResult && (
                <div className="space-y-3">
                  <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${actionModal.deleteResult.ok ? 'bg-lime-50 text-lime-700' : 'bg-rose-50 text-rose-700'}`}>
                    {actionModal.deleteResult.ok ? <CheckCircle2Icon className="h-4 w-4 shrink-0" /> : <XCircleIcon className="h-4 w-4 shrink-0" />}
                    <span className="font-semibold">{actionModal.deleteResult.ok ? 'Xóa thành công' : 'Xóa thất bại'}</span>
                  </div>
                  {actionModal.deleteResult.ok && (
                    <div className="rounded-lg bg-zinc-50 p-4 text-xs space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-zinc-500">contract_no:</span> <span className="font-medium">{actionModal.deleteResult.contract_no}</span></div>
                        <div><span className="text-zinc-500">mode:</span> <span className="font-medium">{actionModal.deleteResult.mode}</span></div>
                        <div><span className="text-zinc-500">deleted_contract_records:</span> <span className="font-medium">{actionModal.deleteResult.deleted_contract_records}</span></div>
                        <div><span className="text-zinc-500">deleted_certificate_records:</span> <span className="font-medium">{actionModal.deleteResult.deleted_certificate_records}</span></div>
                      </div>
                    </div>
                  )}
                  {!actionModal.deleteResult.ok && (
                    <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
                      <p className="font-semibold">Không thể xóa hợp đồng này.</p>
                      <p className="mt-1">{actionModal.deleteResult.message}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-zinc-200">
                <Button variant="secondary" leftIcon={<XIcon className="h-4 w-4" />} onClick={closeActionModal}>Đóng</Button>
              </div>
            </div>
          </Modal>
        )}

        {/* ─── GCN NUMBER EDIT MODAL ─────────────────────────── */}
        <Modal
          open={gcnEditModal.open}
          onClose={() => setGcnEditModal((p) => ({ ...p, open: false }))}
          title={`Sửa số GCN — ${gcnEditModal.contractNo}`}
          description="Nhập số GCN để cập nhật bản ghi chứng nhận hiện có."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setGcnEditModal((p) => ({ ...p, open: false }))} disabled={gcnEditModal.saving}>Hủy</Button>
              <Button variant="primary" onClick={saveGcnNumber} disabled={gcnEditModal.saving}
                leftIcon={gcnEditModal.saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : undefined}>
                {gcnEditModal.saving ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {gcnEditModal.error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{gcnEditModal.error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Số GCN <span className="text-rose-500">*</span></label>
              <input
                type="text"
                className="w-full h-9 rounded-lg border border-zinc-300 px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400"
                value={gcnEditModal.currentNo}
                onChange={(e) => setGcnEditModal((p) => ({ ...p, currentNo: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !gcnEditModal.saving) saveGcnNumber(); }}
                placeholder="VD: GCN-OTGAN/2024/HCM/00318"
                autoFocus
                disabled={gcnEditModal.saving}
              />
              <p className="mt-1.5 text-xs text-zinc-500">Cập nhật số chứng nhận cho hợp đồng hiện có. Không tạo bản ghi mới.</p>
            </div>
          </div>
        </Modal>

      </EnterprisePage>
    </Page>
  );
}
