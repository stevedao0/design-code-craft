import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FilePlusIcon,
  RefreshCwIcon,
  EyeIcon,
  PencilIcon,
  FileDownIcon,
  Trash2Icon,
  FileTextIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  XIcon,
  LoaderIcon,
  PrinterIcon,
  CalendarIcon,
  PlusIcon,
  DownloadIcon,
  ChevronRightIcon,
  ClockIcon,
  PhoneIcon,
  SendIcon,
  CheckIcon,
  EditIcon,
  MoreHorizontalIcon,
  SearchIcon,
  FilterIcon,
  LayersIcon,
} from 'lucide-react';
import { Page, PageHeader } from '../components/app-ui/Page';
import { ContentCard } from '../components/app-ui/ContentCard';
import { Button } from '../components/app-ui/Button';
import { Select } from '../components/app-ui/Select';
import { Input } from '../components/app-ui/Input';
import { Textarea } from '../components/app-ui/Textarea';
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
import {
  getExpiredContracts,
  getEnvelopeLayoutConfig,
  saveEnvelopeLayoutConfig,
  createRenewalBatch,
  createNewKaraokeBatch,
  getDownloadUrl,
  downloadFile,
  getBatches,
  getBatchDetail,
  getTrackingItems,
  updateItemTracking,
  updateBatch,
  deleteBatch,
  updateItem,
  deleteItem,
  bulkDeleteBatches,
  bulkDeleteItems,
  listEnvelopeProfiles,
  getEnvelopeProfileConfig,
  saveEnvelopeProfileConfig,
  createBrotherTestFiles,
  type ExpiredContractItem,
  type EnvelopeLayoutConfig,
  type BatchListItem,
  type BatchDetail,
  type BatchItem,
  type NewKaraokeProspectRow,
  type NewKaraokeIssue,
  type EnvelopeRecipientMode,
  type PrinterProfile,
  type BrotherTransformMode,
  type BrotherTestFilesResponse,
  type TrackingItem,
} from '../lib/dispatchesClient';
import { parseAddressData, exportAddressLabelsDocx, type AddressEntry } from '../lib/exportAddressLabels';

// =============================================================================
// Tab: Tái ký (RenewalContractsTab)
// =============================================================================

function RenewalContractsTab({ onNavigate }: { onNavigate: () => void }) {
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMode, setFilterMode] = useState('month');
  const [filterUnit, setFilterUnit] = useState('');
  const [contracts, setContracts] = useState<ExpiredContractItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; message: string; download_url?: string } | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [
      { value: String(y - 2), label: String(y - 2) },
      { value: String(y - 1), label: String(y - 1) },
      { value: String(y), label: String(y) },
      { value: String(y + 1), label: String(y + 1) },
    ];
  }, []);

  const modeOptions = [
    { value: 'month', label: 'Theo tháng' },
    { value: 'quarter', label: 'Theo quý' },
    { value: 'year', label: 'Theo năm' },
  ];

  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getExpiredContracts({
        filter_mode: filterMode,
        filter_year: filterYear,
        page: 1,
        page_size: 500,
      });
      const allRows = data.rows || [];
      const q = filterUnit.trim().toLowerCase();
      const filtered = q
        ? allRows.filter(r =>
          (r.don_vi_ten || '').toLowerCase().includes(q) ||
          (r.contract_no || '').toLowerCase().includes(q)
        )
        : allRows;
      setContracts(filtered);
      setTotal(filtered.length);
      setTotalPages(Math.ceil(filtered.length / pageSize) || 1);
      setPage(1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterMode, filterYear, filterUnit]);

  useEffect(() => { loadContracts(); }, [loadContracts]);

  const toggleAll = () => {
    if (selected.size === contracts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contracts.map(c => c.contract_id)));
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleCreate = async () => {
    if (selected.size === 0) {
      window.alert('Vui lòng chọn ít nhất một hợp đồng để tạo công văn.');
      return;
    }
    setCreating(true);
    setCreateResult(null);
    try {
      const result = await createRenewalBatch({
        contract_ids: Array.from(selected),
        merge_output: true,
        create_envelope: true,
        note: '',
      });
      if (result.ok) {
        setCreateResult({ ok: true, message: `Đã tạo ${result.total_created} công văn tái ký.`, download_url: result.merged_download_url });
        setSelected(new Set());
        onNavigate();
      } else {
        setCreateResult({ ok: false, message: result.error || 'Lỗi không rõ.' });
      }
    } catch (e: any) {
      setCreateResult({ ok: false, message: e.message || 'Lỗi không rõ.' });
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = () => {
    if (createResult?.download_url) {
      downloadFile(createResult.download_url);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <ContentCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <Input
              label="Tìm kiếm"
              value={filterUnit}
              onChange={(e) => { setFilterUnit(e.target.value); setPage(1); }}
              placeholder="Tên đơn vị, số công văn..."
              className="w-full"
            />
          </div>
          <Select
            label="Năm"
            value={String(filterYear)}
            onChange={v => { setFilterYear(Number(v)); setPage(1); }}
            options={yearOptions}
            size="sm"
          />
          <Select
            label="Lọc theo"
            value={filterMode}
            onChange={v => { setFilterMode(v); setPage(1); }}
            options={modeOptions}
            size="sm"
          />
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<RefreshCwIcon size={13} />}
            onClick={loadContracts}
            disabled={loading}
          >
            Làm mới
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-zinc-500">
              {selected.size} / {contracts.length} đã chọn
            </span>
            <Button
              size="sm"
              variant="primary"
              leftIcon={<FilePlusIcon size={14} />}
              onClick={handleCreate}
              disabled={selected.size === 0 || creating}
            >
              {creating ? 'Đang tạo...' : `Tạo công văn (${selected.size})`}
            </Button>
          </div>
        </div>
      </ContentCard>

      {/* Result message */}
      {createResult && (
        <div className={`p-4 rounded-lg border ${createResult.ok ? 'bg-lime-50 border-lime-200' : 'bg-rose-50 border-rose-200'}`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm ${createResult.ok ? 'text-lime-800' : 'text-rose-800'}`}>{createResult.message}</p>
            <div className="flex gap-2">
              {createResult.ok && createResult.download_url && (
                <Button size="sm" variant="secondary" leftIcon={<DownloadIcon size={13} />} onClick={handleDownload}>
                  Tải công văn
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setCreateResult(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <ContentCard>
        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : contracts.length === 0 ? (
          <EmptyState
            title="Không có hợp đồng hết hạn"
            description={`Không có hợp đồng hết hạn trong ${filterMode === 'month' ? 'tháng' : filterMode === 'quarter' ? 'quý' : 'năm'} ${filterYear}.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="vc-datatable">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-2 pl-4 text-left w-8">
                    <Checkbox
                      checked={selected.size === contracts.length}
                      indeterminate={selected.size > 0 && selected.size < contracts.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Số HĐ</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Đơn vị</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Ngày hết hiệu lực</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Số công văn</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Công văn gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(contract => (
                  <tr key={contract.contract_id} className="border-b last:border-0 hover:bg-zinc-50">
                    <td className="py-2.5 pl-4">
                      <Checkbox
                        checked={selected.has(contract.contract_id)}
                        onChange={() => toggleOne(contract.contract_id)}
                      />
                    </td>
                    <td className="py-2.5 font-mono text-xs text-zinc-700">{contract.contract_no}</td>
                    <td className="py-2.5 text-zinc-700">{contract.don_vi_ten}</td>
                    <td className="py-2.5 text-zinc-500">{formatDate(contract.ngay_het_hieu_luc_hd)}</td>
                    <td className="py-2.5 text-zinc-500">{contract.latest_dispatch_no || '—'}</td>
                    <td className="py-2.5 text-zinc-500">
                      {contract.latest_dispatch_date
                        ? `${formatDate(contract.latest_dispatch_date)} — ${contract.latest_dispatch_status || ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
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
      </ContentCard>
    </div>
  );
}

// =============================================================================
// Tab: Ký mới (NewSignPlaceholderTab)
// =============================================================================

function KyMoiTab({ onNavigate }: { onNavigate: (tab: string | null) => void }) {
  const [rows, setRows] = useState<NewKaraokeProspectRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; merged_download_url?: string; envelope_download_url?: string; issues?: NewKaraokeIssue[] } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [dispatchNo, setDispatchNo] = useState('');
  const [issueDate, setIssueDate] = useState(formatDate(new Date().toISOString()));
  const [mergeOutput, setMergeOutput] = useState(true);
  const [createEnvelope, setCreateEnvelope] = useState(true);
  const [envelopeMode, setEnvelopeMode] = useState<EnvelopeRecipientMode>('dong_nguoi_nhan');

  const handleParse = () => {
    const raw = rows.map(r => `${r.ten_don_vi}\t${r.dia_chi}\t${r.so_dien_thoai || ''}\t${r.nguoi_nhan_bia_thu || ''}`).join('\n');
    const parsed = parseAddressData(raw);
    const mapped: NewKaraokeProspectRow[] = parsed.map((e, i) => ({
      ten_don_vi: e.name,
      dia_chi: e.address,
      so_dien_thoai: e.phone || '',
      nguoi_nhan_bia_thu: rows[i]?.nguoi_nhan_bia_thu || '',
    }));
    setRows(mapped);
  };

  const handleRawPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const lines = e.target.value.split('\n').filter(l => l.trim());
    const parsed = parseAddressData(e.target.value);
    const mapped: NewKaraokeProspectRow[] = parsed.map(e => ({
      ten_don_vi: e.name,
      dia_chi: e.address,
      so_dien_thoai: e.phone || '',
      nguoi_nhan_bia_thu: '',
    }));
    setRows(mapped);
  };

  const updateRow = (idx: number, field: keyof NewKaraokeProspectRow, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleCreate = async () => {
    if (!dispatchNo.trim()) {
      setResult({ ok: false, message: 'Vui lòng nhập Số công văn ở phần cấu hình phía trên. App không tự sinh số công văn.' });
      return;
    }
    if (rows.length === 0) {
      setResult({ ok: false, message: 'Vui lòng nhập dữ liệu đơn vị.' });
      return;
    }
    const missingRows = rows.filter(r => !r.ten_don_vi || !r.dia_chi);
    if (missingRows.length > 0) {
      setResult({ ok: false, message: `${missingRows.length} dòng thiếu thông tin bắt buộc (Tên đơn vị hoặc Địa chỉ).` });
      return;
    }
    setCreating(true);
    setResult(null);
    try {
      const res = await createNewKaraokeBatch({
        rows,
        issue_date: issueDate,
        start_cong_van_no: dispatchNo.trim(),
        merge_output: mergeOutput,
        create_envelope: createEnvelope,
        envelope_recipient_mode: envelopeMode,
      });
      setResult({
        ok: res.ok,
        message: res.error || (res.ok ? `Đã tạo ${res.total_created} công văn.${res.issues && res.issues.length > 0 ? ` ${res.issues.length} dòng bị bỏ qua.` : ''}` : 'Lỗi không rõ.'),
        merged_download_url: res.merged_download_url,
        envelope_download_url: res.envelope_download_url,
        issues: res.issues,
      });
      if (res.ok) {
        onNavigate('created');
      }
    } catch (e: any) {
      setResult({ ok: false, message: e.message || 'Lỗi không rõ.' });
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadMerged = () => { if (result?.merged_download_url) downloadFile(result.merged_download_url); };
  const handleDownloadEnvelope = () => { if (result?.envelope_download_url) downloadFile(result.envelope_download_url); };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Card 1: Cấu hình công văn ── */}
      <ContentCard
        title="Cấu hình công văn"
        description="Thiết lập số công văn, ngày phát hành và tuỳ chọn nhãn."
      >
        {/* Row 1: date / dispatch no / envelope mode */}
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <Input
            label="Ngày phát hành"
            type="date"
            value={issueDate}
            onChange={e => setIssueDate(e.target.value)}
            size="sm"
            className="w-44"
          />
          <div className="flex-1 min-w-64">
            <Input
              label="Số công văn"
              value={dispatchNo}
              onChange={e => setDispatchNo(e.target.value)}
              placeholder="Ví dụ: 123/CV-VCPMC"
              size="sm"
            />
            {!dispatchNo.trim() && (
              <p className="text-[11px] text-amber-600 mt-0.5">Bắt buộc — app không tự sinh số công văn.</p>
            )}
          </div>
          <Select
            label="Cách ghi người nhận"
            value={envelopeMode}
            onChange={v => setEnvelopeMode(v as EnvelopeRecipientMode)}
            options={[
              { value: 'dong_nguoi_nhan', label: 'Tên đơn vị' },
              { value: 'nguoi_nhan_bia_thu', label: 'Người nhận riêng' },
            ]}
            size="sm"
            className="w-48"
          />
        </div>

        {/* Row 2: checkboxes */}
        <div className="flex flex-wrap items-center gap-6">
          <Checkbox
            label="Gộp thành 1 file"
            checked={mergeOutput}
            onChange={v => setMergeOutput(v)}
          />
          <div className="flex items-start gap-2">
            <Checkbox
              label="Tạo nhãn địa chỉ kèm theo"
              checked={createEnvelope}
              onChange={v => setCreateEnvelope(v)}
            />
            {createEnvelope && (
              <span className="text-[11px] text-zinc-400 leading-tight mt-px">
                File A4 để in, cắt và dán lên bìa thư.
              </span>
            )}
          </div>
        </div>
      </ContentCard>

      {/* ── Card 2: Dữ liệu đơn vị ── */}
      <ContentCard
        title="Dữ liệu đơn vị"
        actions={
          <span className="ds-badge text-xs">
            {rows.length > 0 ? `${rows.length} đơn vị` : 'Chưa có đơn vị'}
          </span>
        }
      >
        {/* Paste area */}
        <div className="mb-3">
          <Textarea
            label="Dán dữ liệu từ Excel (cột: Tên đơn vị / Địa chỉ / SĐT)"
            hint="Tab (\t) là ký tự phân cách cột khi paste từ Excel."
            rows={5}
            placeholder={"TEN_DON_VI\tDIA_CHI\tSO_DIEN_THOAI\nNhà Hàng Phương Nam\tẤp Mỹ An 1, Đồng Tháp\t0909 151 525\n..."}
            onChange={handleRawPaste}
            className="font-mono text-xs"
          />
        </div>

        {/* Preview table */}
        {rows.length > 0 ? (
          <div className="overflow-x-auto border border-zinc-200 rounded-xl mb-3">
            <table className="vc-datatable is-compact">
              <thead className="sticky top-0 bg-zinc-50 z-10">
                <tr>
                  <th className="py-2 px-3 text-left font-medium text-zinc-500 w-8">#</th>
                  <th className="py-2 px-3 text-left font-medium text-zinc-500 min-w-[180px]">Tên đơn vị</th>
                  <th className="py-2 px-3 text-left font-medium text-zinc-500 min-w-[220px]">�ịa chỉ</th>
                  <th className="py-2 px-3 text-left font-medium text-zinc-500 w-28">SĐT</th>
                  <th className="py-2 px-3 text-left font-medium text-zinc-500 min-w-[140px]">Người nhận</th>
                  <th className="py-2 px-3 text-left font-medium text-zinc-500 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-t border-zinc-100 hover:bg-zinc-50/50">
                    <td className="py-1.5 px-3 text-zinc-400">{idx + 1}</td>
                    <td className="py-1.5 px-2">
                      <input
                        className="w-full border border-zinc-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-lime-300 focus:border-lime-300"
                        value={row.ten_don_vi}
                        onChange={e => updateRow(idx, 'ten_don_vi', e.target.value)}
                        placeholder="Tên đơn vị *"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        className="w-full border border-zinc-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-lime-300 focus:border-lime-300"
                        value={row.dia_chi}
                        onChange={e => updateRow(idx, 'dia_chi', e.target.value)}
                        placeholder="Địa chỉ *"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        className="w-full border border-zinc-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-lime-300 focus:border-lime-300"
                        value={row.so_dien_thoai || ''}
                        onChange={e => updateRow(idx, 'so_dien_thoai', e.target.value)}
                        placeholder="SĐT"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        className="w-full border border-zinc-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-lime-300 focus:border-lime-300"
                        value={row.nguoi_nhan_bia_thu || ''}
                        onChange={e => updateRow(idx, 'nguoi_nhan_bia_thu', e.target.value)}
                        placeholder="Người nhận"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <button
                        className="text-zinc-400 hover:text-red-500 transition-colors"
                        onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2Icon size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 italic mb-3">Chưa có đơn vị — dán dữ liệu Excel hoặc bấm Thêm dòng bên dưới.</p>
        )}

        {/* Button row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<PlusIcon size={13} />}
            onClick={() => setRows(prev => [...prev, { ten_don_vi: '', dia_chi: '', so_dien_thoai: '', nguoi_nhan_bia_thu: '' }])}
          >
            Thêm dòng
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {!dispatchNo.trim() || rows.length === 0 ? (
              <p className="text-[11px] text-zinc-400">
                {!dispatchNo.trim() && rows.length === 0
                  ? 'Nhập số công văn và ít nhất 1 đơn vị để tạo.'
                  : !dispatchNo.trim()
                  ? 'Nhập số công văn để tạo.'
                  : 'Thêm ít nhất 1 đơn vị để tạo.'}
              </p>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              leftIcon={<FilePlusIcon size={13} />}
              onClick={handleCreate}
              disabled={rows.length === 0 || creating}
            >
              {creating ? 'Đang tạo...' : `Tạo công văn${rows.length > 0 ? ` (${rows.length})` : ''}`}
            </Button>
          </div>
        </div>
      </ContentCard>

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-xl border ${result.ok ? 'bg-lime-50/70 border-lime-200' : 'bg-rose-50/70 border-rose-200'}`}>
          <div className="flex items-start gap-2 mb-3">
            {result.ok
              ? <CheckCircle2Icon className="w-4 h-4 text-lime-600 mt-0.5 shrink-0" />
              : <AlertTriangleIcon className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            }
            <p className={`text-sm font-medium ${result.ok ? 'text-lime-800' : 'text-red-800'}`}>{result.message}</p>
          </div>
          {result.issues && result.issues.length > 0 && (
            <details className="mt-2 text-xs text-red-700">
              <summary className="cursor-pointer font-medium">Xem {result.issues.length} lỗi</summary>
              <ul className="mt-1 list-disc list-inside">
                {result.issues.map((issue, i) => (
                  <li key={i}>Dòng {issue.row_index}: {issue.message}</li>
                ))}
              </ul>
            </details>
          )}
          {result.ok && (
            <div className="flex gap-2 mt-3">
              {result.merged_download_url && (
                <Button size="sm" variant="primary" leftIcon={<DownloadIcon size={13} />} onClick={handleDownloadMerged}>
                  Tải công văn
                </Button>
              )}
              {result.envelope_download_url && (
                <Button size="sm" variant="secondary" leftIcon={<DownloadIcon size={13} />} onClick={handleDownloadEnvelope}>
                  Tải nhãn địa chỉ
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>Đóng</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Tab: Đã tạo (CreatedDispatchesTab)
// =============================================================================

function CreatedDispatchesTab({ onNavigate }: { onNavigate: (route: RouteKey) => void }) {
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatches, setSelectedBatches] = useState<Set<number>>(new Set());
  const [detailBatch, setDetailBatch] = useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalBatches, setTotalBatches] = useState(0);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBatches({ page: currentPage, page_size: pageSize });
      setBatches(data.rows || []);
      setTotalBatches(typeof data.total === 'number' ? data.total : (data.rows?.length ?? 0));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const openDetail = async (batchId: number) => {
    setDetailLoading(true);
    setDetailBatch(null);
    try {
      const detail = await getBatchDetail(batchId);
      setDetailBatch(detail);
    } catch (e) {
      console.error(e);
      window.alert('Không tải được chi tiết batch.');
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleBatch = (id: number) => {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedBatches.size === 0) return;
    const ids = Array.from(selectedBatches);
    if (!window.confirm(`Xóa ${ids.length} đợt công văn?`)) return;
    setDeleting(true);
    try {
      await bulkDeleteBatches(ids);
      setSelectedBatches(new Set());
      loadBatches();
    } catch (e: any) {
      window.alert('Lỗi xóa: ' + (e.message || ''));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteBatch = async (batchId: number) => {
    if (!window.confirm('Xóa đợt công văn này?')) return;
    try {
      await deleteBatch(batchId);
      loadBatches();
      if (detailBatch?.id === batchId) setDetailBatch(null);
    } catch (e: any) {
      window.alert('Lỗi: ' + (e.message || ''));
    }
  };

  const handleDownloadMerged = (url: string) => { downloadFile(url); };
  const handleDownloadEnvelope = (url: string) => { downloadFile(url); };

  return (
    <div className="flex flex-col gap-5">
      {/* Batch list */}
      <ContentCard
        title="Danh sách đợt công văn"
        actions={
          selectedBatches.size > 0 ? (
            <Button size="sm" variant="danger" leftIcon={<Trash2Icon size={13} />} onClick={handleBulkDelete} disabled={deleting}>
              Xóa ({selectedBatches.size})
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : batches.length === 0 ? (
          <EmptyState title="Chưa có công văn nào" description="Tạo công văn tái ký hoặc ký mới ở các tab trên." />
        ) : (
          <div className="overflow-x-auto">
            <table className="vc-datatable">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left w-8">
                    <Checkbox
                      checked={selectedBatches.size === batches.length}
                      indeterminate={selectedBatches.size > 0 && selectedBatches.size < batches.length}
                      onChange={() => {
                        if (selectedBatches.size === batches.length) setSelectedBatches(new Set());
                        else setSelectedBatches(new Set(batches.map(b => b.id)));
                      }}
                    />
                  </th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Số công văn</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Ngày</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Loại</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Tổng</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">File</th>
                  <th className="pb-2 text-left text-zinc-500 font-medium">Tác vụ</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(batch => (
                  <tr key={batch.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="py-2.5">
                      <Checkbox checked={selectedBatches.has(batch.id)} onChange={() => toggleBatch(batch.id)} />
                    </td>
                    <td className="py-2.5 font-mono text-xs">{batch.cong_van_no}</td>
                    <td className="py-2.5 text-zinc-500">{formatDate(batch.issue_date)}</td>
                    <td className="py-2.5">
                      <StatusBadge
                        tone={batch.dispatch_type === 'renewal' ? 'violet' : 'success'}
                        compact
                        dot
                      >
                        {batch.dispatch_type === 'renewal' ? 'Tái ký' : 'Ký mới'}
                      </StatusBadge>
                    </td>
                    <td className="py-2.5 text-zinc-500">{batch.total_items}</td>
                    <td className="py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {batch.merged_download_url && (
                          <button
                            className="text-xs text-lime-600 hover:text-lime-800"
                            onClick={() => handleDownloadMerged(batch.merged_download_url)}
                          >DOCX</button>
                        )}
                        {batch.envelope_download_url && (
                          <button
                            className="text-xs text-lime-600 hover:text-lime-800"
                            onClick={() => handleDownloadEnvelope(batch.envelope_download_url)}
                          >Nhãn địa chỉ</button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <RowActionsMenu
                        actions={[
                          { label: 'Xem chi tiết', onClick: () => openDetail(batch.id) },
                          { label: 'Xóa', tone: 'danger', onClick: () => handleDeleteBatch(batch.id) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && batches.length > 0 && (
          <div className="mt-4">
            <Pagination
              page={currentPage}
              totalPages={Math.max(1, Math.ceil(totalBatches / pageSize))}
              pageSize={pageSize}
              total={totalBatches}
              rangeFrom={(currentPage - 1) * pageSize + 1}
              rangeTo={Math.min(currentPage * pageSize, totalBatches)}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
            />
          </div>
        )}
      </ContentCard>

      {/* Detail Modal */}
      <Modal
        open={!!detailBatch || detailLoading}
        onClose={() => setDetailBatch(null)}
        title={detailBatch ? `Chi tiết: ${detailBatch.cong_van_no}` : 'Đang tải...'}
        size="xl"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12"><LoaderIcon className="animate-spin" size={24} /></div>
        ) : detailBatch ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-zinc-50/70 rounded-lg p-3">
              <div><span className="text-zinc-400">Số công văn:</span> <span className="font-mono font-medium">{detailBatch.cong_van_no}</span></div>
              <div><span className="text-zinc-400">Ngày:</span> {formatDate(detailBatch.issue_date)}</div>
              <div><span className="text-zinc-400">Loại:</span> {detailBatch.dispatch_type === 'renewal' ? 'Tái ký' : detailBatch.dispatch_type === 'new_sign' ? 'Ký mới' : detailBatch.dispatch_type}</div>
              <div><span className="text-zinc-400">Tổng công văn:</span> {detailBatch.total_items}</div>
              {detailBatch.note && <div className="col-span-2"><span className="text-zinc-400">Ghi chú:</span> {detailBatch.note}</div>}
            </div>

            <div className="overflow-x-auto max-h-[400px] border rounded-lg">
              <table className="vc-datatable is-compact">
                <thead className="sticky top-0 bg-zinc-100 z-10">
                  <tr className="text-zinc-500">
                    <th className="py-2 px-3 text-left font-medium w-8">#</th>
                    <th className="py-2 px-3 text-left font-medium">Số công văn</th>
                    <th className="py-2 px-3 text-left font-medium">Số HĐ</th>
                    <th className="py-2 px-3 text-left font-medium">Đơn vị</th>
                    <th className="py-2 px-3 text-left font-medium">Lần gửi</th>
                    <th className="py-2 px-3 text-left font-medium">Trạng thái</th>
                    <th className="py-2 px-3 text-left font-medium w-16">File</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailBatch.items || []).map((item, idx) => (
                    <tr key={item.id} className="border-t border-zinc-100 hover:bg-zinc-50/50">
                      <td className="py-1.5 px-3 text-zinc-400">{idx + 1}</td>
                      <td className="py-1.5 px-3 font-mono">{item.cong_van_no}</td>
                      <td className="py-1.5 px-3 font-mono text-zinc-500">{item.contract_no || '—'}</td>
                      <td className="py-1.5 px-3">{item.recipient_unit}</td>
                      <td className="py-1.5 px-3 text-zinc-500">{item.lan_gui}x</td>
                      <td className="py-1.5 px-3 text-zinc-500">{item.trang_thai_lien_he}</td>
                      <td className="py-1.5 px-3">
                        {item.download_url && (
                          <button className="text-lime-600 hover:text-lime-800 font-medium" onClick={() => downloadFile(item.download_url)}>Tải</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 pt-1">
              {detailBatch.merged_download_url && (
                <Button size="sm" variant="primary" leftIcon={<DownloadIcon size={13} />} onClick={() => downloadFile(detailBatch.merged_download_url)}>
                  Tải công văn
                </Button>
              )}
              {detailBatch.envelope_download_url && (
                <Button size="sm" variant="secondary" leftIcon={<DownloadIcon size={13} />} onClick={() => downloadFile(detailBatch.envelope_download_url)}>
                  Tải nhãn địa chỉ
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

// =============================================================================
// Tab: Theo dõi (TrackingTab)
// =============================================================================

const TRANG_THAI_LIEN_HE: Record<string, string> = {
  CHUA_LIEN_HE: 'Chưa liên hệ',
  DA_LIEN_HE: 'Đã liên hệ',
  DA_GUI_CONG_VAN: 'Đã gửi công văn',
  DA_PHAN_HOI: 'Đã phản hồi',
  DANG_THUONG_LUONG: 'Đang thương lượng',
  NGUNG_HOAT_DONG: 'Ngưng hoạt động',
  KHONG_HOP_TAC: 'Không hợp tác',
  SAI_THONG_TIN: 'Sai thông tin',
};

const TRANG_THAI_LIEN_HE_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'orange'> = {
  CHUA_LIEN_HE: 'neutral',
  DA_LIEN_HE: 'info',
  DA_GUI_CONG_VAN: 'info',
  DA_PHAN_HOI: 'success',
  DANG_THUONG_LUONG: 'warning',
  NGUNG_HOAT_DONG: 'danger',
  KHONG_HOP_TAC: 'danger',
  SAI_THONG_TIN: 'danger',
};

const TRANG_THAI_HOP_DONG: Record<string, string> = {
  CHUA_KY_HOP_DONG: 'Chưa ký hợp đồng',
  DANG_XU_LY_HOP_DONG: 'Đang xử lý hợp đồng',
  DA_KY_HOP_DONG: 'Đã ký hợp đồng',
  TU_CHOI_KY: 'Từ chối ký',
  KHONG_DU_DIEU_KIEN: 'Không đủ điều kiện',
};

const TRANG_THAI_HOP_DONG_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'orange'> = {
  CHUA_KY_HOP_DONG: 'neutral',
  DANG_XU_LY_HOP_DONG: 'warning',
  DA_KY_HOP_DONG: 'success',
  TU_CHOI_KY: 'danger',
  KHONG_DU_DIEU_KIEN: 'danger',
};

const lienHeOptions = Object.entries(TRANG_THAI_LIEN_HE).map(([value, label]) => ({ value, label }));
const hopDongOptions = Object.entries(TRANG_THAI_HOP_DONG).map(([value, label]) => ({ value, label }));

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function TrackingTab() {
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftsById, setDraftsById] = useState<Record<number, {
    trang_thai_lien_he: string;
    trang_thai_hop_dong: string;
    ngay_lien_he_gan_nhat: string;
    ghi_chu_lien_he: string;
  }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [noteModalItem, setNoteModalItem] = useState<TrackingItem | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Filters
  const [filterUnit, setFilterUnit] = useState('');
  const [filterLienHe, setFilterLienHe] = useState('');
  const [filterHD, setFilterHD] = useState('');

  const loadTracking = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTrackingItems({});
      setItems(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTracking(); }, [loadTracking]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filterUnit && !item.recipient_unit.toLowerCase().includes(filterUnit.toLowerCase()) && !item.cong_van_no.toLowerCase().includes(filterUnit.toLowerCase())) return false;
      if (filterLienHe && item.trang_thai_lien_he !== filterLienHe) return false;
      if (filterHD && item.trang_thai_hop_dong !== filterHD) return false;
      return true;
    });
  }, [items, filterUnit, filterLienHe, filterHD]);

  const startEdit = (item: TrackingItem) => {
    setEditingId(item.id);
    setDraftsById(prev => ({
      ...prev,
      [item.id]: {
        trang_thai_lien_he: item.trang_thai_lien_he,
        trang_thai_hop_dong: item.trang_thai_hop_dong,
        ngay_lien_he_gan_nhat: toDateInputValue(item.ngay_lien_he_gan_nhat),
        ghi_chu_lien_he: item.ghi_chu_lien_he || '',
      },
    }));
    setSaveError(null);
  };

  const cancelEdit = (itemId: number) => {
    setDraftsById(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setEditingId(prev => prev === itemId ? null : prev);
    setSaveError(null);
  };

  const handleSaveTracking = async (itemId: number) => {
    const draft = draftsById[itemId];
    if (!draft) return;
    setSavingId(itemId);
    setSaveError(null);
    try {
      await updateItemTracking(itemId, {
        trang_thai_lien_he: draft.trang_thai_lien_he,
        trang_thai_hop_dong: draft.trang_thai_hop_dong,
        ngay_lien_he_gan_nhat: draft.ngay_lien_he_gan_nhat || undefined,
        ghi_chu_lien_he: draft.ghi_chu_lien_he || undefined,
      });
      setDraftsById(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setEditingId(null);
      await loadTracking();
    } catch (e: any) {
      setSaveError(e?.message || 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSavingId(null);
    }
  };

  const openNoteModal = (item: TrackingItem) => {
    setNoteModalItem(item);
    setNoteText(item.ghi_chu_lien_he || '');
  };

  const handleSaveNote = async () => {
    if (!noteModalItem) return;
    setNoteSaving(true);
    try {
      await updateItemTracking(noteModalItem.id, {
        ghi_chu_lien_he: noteText || undefined,
      });
      setNoteModalItem(null);
      await loadTracking();
    } catch (e: any) {
      alert(e?.message || 'Lưu ghi chú thất bại.');
    } finally {
      setNoteSaving(false);
    }
  };

  const getDraft = (itemId: number, item: TrackingItem) => {
    const d = draftsById[itemId];
    if (!d) return item;
    return d;
  };

  const statusBadge = (key: string, labelMap: Record<string, string>, toneMap: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'orange'> = {}) => {
    const label = labelMap[key] || key;
    const tone = toneMap[key] || 'neutral';
    return (
      <StatusBadge tone={tone} compact>
        {label}
      </StatusBadge>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <ContentCard
        title="Theo dõi phản hồi"
        description="Cập nhật trạng thái liên hệ và hợp đồng cho từng công văn đã gửi."
      >
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : (
          <div className="flex flex-col gap-4">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-3 items-end">
              <Select
                label="Trạng thái liên hệ"
                value={filterLienHe}
                onChange={setFilterLienHe}
                options={lienHeOptions}
                placeholder="Tất cả"
                className="w-48"
              />
              <Select
                label="Trạng thái HĐ"
                value={filterHD}
                onChange={setFilterHD}
                options={hopDongOptions}
                placeholder="Tất cả"
                className="w-48"
              />
              <Input
                label="Tìm đơn vị / số công văn"
                placeholder="Tìm..."
                value={filterUnit}
                onChange={e => setFilterUnit(e.target.value)}
                className="w-52"
              />
              {editingId !== null && (
                <Button size="sm" variant="outline" onClick={() => cancelEdit(editingId)}>
                  Hủy sửa
                </Button>
              )}
              {items.length > 0 && (
                <span className="text-xs text-zinc-400 ml-auto">{filteredItems.length} / {items.length} mục</span>
              )}
            </div>

            {saveError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
                <XCircleIcon className="w-4 h-4 flex-shrink-0" />
                {saveError}
              </div>
            )}

            {items.length === 0 ? (
              <EmptyState
                title="Chưa có đơn vị nào trong theo dõi"
                description="Xuất công văn ký mới Karaoke để bắt đầu theo dõi."
              />
            ) : filteredItems.length === 0 ? (
              <EmptyState title="Không có kết quả lọc" description="Thử thay đổi bộ lọc." />
            ) : (
              <div className="overflow-x-auto">
                <table className="vc-datatable">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-2 text-left text-zinc-500 font-medium">Số công văn</th>
                      <th className="pb-2 text-left text-zinc-500 font-medium">Đơn vị</th>
                      <th className="pb-2 text-left text-zinc-500 font-medium">Lần gửi</th>
                      <th className="pb-2 text-left text-zinc-500 font-medium">Trạng thái liên hệ</th>
                      <th className="pb-2 text-left text-zinc-500 font-medium">Trạng thái HĐ</th>
                      <th className="pb-2 text-left text-zinc-500 font-medium">Ngày liên hệ gần nhất</th>
                      <th className="pb-2 text-left text-zinc-500 font-medium">Ghi chú</th>
                      <th className="pb-2 text-left text-zinc-500 font-medium">Tác vụ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => {
                      const draft = getDraft(item.id, item);
                      const isEditing = editingId === item.id;
                      const isSaving = savingId === item.id;
                      return (
                        <tr key={item.id} className={`border-b last:border-0 hover:bg-zinc-50 ${isEditing ? 'bg-lime-50' : ''}`}>
                          <td className="py-2 px-1 font-mono text-xs">{item.cong_van_no}</td>
                          <td className="py-2 px-1 max-w-[200px] truncate" title={item.recipient_unit}>{item.recipient_unit}</td>
                          <td className="py-2 px-1 text-center">{item.lan_gui}x</td>
                          {/* Trạng thái liên hệ */}
                          <td className="py-2 px-1">
                            {isEditing ? (
                              <select
                                value={draft.trang_thai_lien_he}
                                onChange={e => setDraftsById(prev => ({ ...prev, [item.id]: { ...prev[item.id], trang_thai_lien_he: e.target.value } }))}
                                disabled={isSaving}
                                className="border rounded px-1 py-1 text-xs w-full max-w-[160px]"
                              >
                                {Object.entries(TRANG_THAI_LIEN_HE).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                            ) : (
                              statusBadge(item.trang_thai_lien_he, TRANG_THAI_LIEN_HE, TRANG_THAI_LIEN_HE_TONE)
                            )}
                          </td>
                          {/* Trạng thái HĐ */}
                          <td className="py-2 px-1">
                            {isEditing ? (
                              <select
                                value={draft.trang_thai_hop_dong}
                                onChange={e => setDraftsById(prev => ({ ...prev, [item.id]: { ...prev[item.id], trang_thai_hop_dong: e.target.value } }))}
                                disabled={isSaving}
                                className="border rounded px-1 py-1 text-xs w-full max-w-[160px]"
                              >
                                {Object.entries(TRANG_THAI_HOP_DONG).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                            ) : (
                              statusBadge(item.trang_thai_hop_dong, TRANG_THAI_HOP_DONG, TRANG_THAI_HOP_DONG_TONE)
                            )}
                          </td>
                          {/* Ngày liên hệ */}
                          <td className="py-2 px-1">
                            {isEditing ? (
                              <input
                                type="date"
                                value={draft.ngay_lien_he_gan_nhat}
                                onChange={e => setDraftsById(prev => ({ ...prev, [item.id]: { ...prev[item.id], ngay_lien_he_gan_nhat: e.target.value } }))}
                                className="border rounded px-2 py-1 text-xs w-36"
                                disabled={isSaving}
                              />
                            ) : (
                              <span className="text-zinc-500 text-xs">
                                {item.ngay_lien_he_gan_nhat ? formatDate(item.ngay_lien_he_gan_nhat) : '—'}
                              </span>
                            )}
                          </td>
                          {/* Ghi chú */}
                          <td className="py-2 px-1 text-center">
                            <button
                              onClick={() => openNoteModal(item)}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${item.ghi_chu_lien_he ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'}`}
                              title={item.ghi_chu_lien_he ? item.ghi_chu_lien_he : 'Thêm ghi chú'}
                            >
                              <FileTextIcon className="w-3 h-3" />
                              {item.ghi_chu_lien_he ? 'Xem' : 'Thêm'}
                            </button>
                          </td>
                          {/* Tác vụ */}
                          <td className="py-2 px-1">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleSaveTracking(item.id)}
                                  disabled={isSaving}
                                >
                                  {isSaving ? 'Lưu...' : 'Lưu'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => cancelEdit(item.id)}
                                  disabled={isSaving}
                                >
                                  Hủy
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(item)}
                              >
                                Sửa
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </ContentCard>

      {/* Note modal */}
      <Modal
        isOpen={noteModalItem !== null}
        onClose={() => setNoteModalItem(null)}
        title="Ghi chú liên hệ"
        footer={
          <>
            <Button variant="outline" onClick={() => setNoteModalItem(null)}>
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveNote}
              disabled={noteSaving}
            >
              {noteSaving ? 'Đang lưu...' : 'Lưu ghi chú'}
            </Button>
          </>
        }
      >
        {noteModalItem && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-zinc-500">
              <span className="font-medium text-zinc-700">{noteModalItem.recipient_unit}</span>
              {' — '}
              <span className="font-mono text-xs">{noteModalItem.cong_van_no}</span>
            </div>
            <Textarea
              rows={5}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Nhập ghi chú liên hệ..."
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

// =============================================================================
// Tab: Nhãn địa chỉ
// =============================================================================

function DiaChiTab() {
  const [rawText, setRawText] = useState('');
  const [columns, setColumns] = useState<2 | 3>(2);
  const [showKinhGui, setShowKinhGui] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [entries, setEntries] = useState<AddressEntry[]>([]);

  const handleReadData = () => {
    const parsed = parseAddressData(rawText);
    setEntries(parsed);
  };

  const handleClearData = () => {
    setRawText('');
    setEntries([]);
  };

  const handleExport = async () => {
    if (entries.length === 0) {
      window.alert('Chưa có dữ liệu địa chỉ. Vui lòng bấm "Đọc dữ liệu" trước.');
      return;
    }
    setExporting(true);
    try {
      await exportAddressLabelsDocx(entries, {
        columnsPerPage: columns,
        showKinhGui,
        showPhone,
        fontSize: 10.5,
        fontFamily: 'Times New Roman',
      });
    } catch (e: any) {
      window.alert(e?.message || 'Không thể xuất file DOCX.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <ContentCard
        title="In nhãn địa chỉ dán bìa thư"
        description="Tạo file Word A4 gồm nhiều ô địa chỉ để in, cắt và dán lên bìa thư."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Dữ liệu địa chỉ (paste từ Excel)</label>
            <Textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              rows={8}
              placeholder={"TEN_DON_VI\tDIA_CHI\tSO_DIEN_THOAI\nNhà Hàng Phương Nam\tẤp Mỹ An 1, Xã Tháp Mười, Đồng Tháp\t0909 151 525\n..."}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Số cột</label>
              <select
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm"
                value={columns}
                onChange={e => setColumns(Number(e.target.value) as 2 | 3)}
              >
                <option value={2}>2 cột</option>
                <option value={3}>3 cột</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showKinhGui}
                  onChange={e => setShowKinhGui(e.target.checked)}
                  className="accent-lime-500"
                />
                Hiện "Kính gửi:"
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPhone}
                  onChange={e => setShowPhone(e.target.checked)}
                  className="accent-lime-500"
                />
                Hiện SĐT
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-3">
          <Button onClick={handleReadData} size="sm" variant="secondary" leftIcon={<FileTextIcon size={13} />}>
            Đọc dữ liệu
          </Button>
          <Button onClick={handleExport} disabled={exporting || entries.length === 0} size="sm" variant="primary" leftIcon={<DownloadIcon size={13} />}>
            {exporting ? 'Đang xuất...' : 'Tạo DOCX nhãn địa chỉ'}
          </Button>
          <Button onClick={handleClearData} size="sm" variant="ghost" leftIcon={<Trash2Icon size={13} />}>
            Xóa dữ liệu
          </Button>
        </div>

        <p className="text-xs text-zinc-400">
          Xuất file DOCX A4 portrait, mỗi ô có border để cắt. Dán lên bìa thư sau khi in.
        </p>
      </ContentCard>

      {entries.length > 0 && (
        <ContentCard>
          <div className="text-xs font-medium text-zinc-500 mb-3">
            Preview ({entries.length} địa chỉ, {columns} cột)
          </div>
          <div
            className="overflow-x-auto border border-zinc-200 rounded"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: '1px',
              backgroundColor: '#e4e4e7',
            }}
          >
            {entries.map((entry, idx) => (
              <div
                key={idx}
                className="bg-white p-3 text-xs text-zinc-700"
                style={{ minHeight: 120 }}
              >
                {showKinhGui && (
                  <div className="font-bold mb-0.5">Kính gửi:</div>
                )}
                <div className="font-medium mb-0.5">{entry.name}</div>
                <div className="text-zinc-600">{entry.address}</div>
                {showPhone && entry.phone && (
                  <div className="text-zinc-500 mt-0.5">ĐT: {entry.phone}</div>
                )}
              </div>
            ))}
          </div>
        </ContentCard>
      )}
    </div>
  );
}

// =============================================================================
// Tab: Cài đặt (SettingsTab)
// =============================================================================

function SettingsTab() {
  const [config, setConfig] = useState<EnvelopeLayoutConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [local, setLocal] = useState<Record<string, number | string | boolean>>({});

  // Printer profile state
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [brotherModes, setBrotherModes] = useState<BrotherTransformMode[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('legacy_default');
  const [selectedBrotherMode, setSelectedBrotherMode] = useState('swap_orientation_test');
  const [profileLoading, setProfileLoading] = useState(false);
  const [testGenerating, setTestGenerating] = useState(false);
  const [testResult, setTestResult] = useState<BrotherTestFilesResponse | null>(null);

  const VCPMC_PRESET = {
    page_width_mm: 230,
    page_height_mm: 162,
    recipient_box_left_mm: 130,
    recipient_box_bottom_mm: 41,
    recipient_box_width_mm: 95,
    recipient_box_height_mm: 26,
    line_spacing_mm: 8,
    printer_offset_x_mm: 0,
    printer_offset_y_mm: 0,
  };

  const loadProfiles = async () => {
    try {
      const data = await listEnvelopeProfiles();
      setProfiles(data.profiles);
      setBrotherModes(data.brother_transform_modes);
      const configData = await getEnvelopeProfileConfig();
      setSelectedProfile(configData.config.profile_id || 'legacy_default');
      setSelectedBrotherMode(configData.config.brother_transform_mode || 'swap_orientation_test');
    } catch (e) {
      console.error('Failed to load profiles:', e);
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getEnvelopeLayoutConfig();
      setConfig(data);
      setLocal({
        page_width_mm: data.page_width_mm ?? VCPMC_PRESET.page_width_mm,
        page_height_mm: data.page_height_mm ?? VCPMC_PRESET.page_height_mm,
        recipient_box_left_mm: data.recipient_box_left_mm ?? VCPMC_PRESET.recipient_box_left_mm,
        recipient_box_bottom_mm: data.recipient_box_bottom_mm ?? VCPMC_PRESET.recipient_box_bottom_mm,
        recipient_box_width_mm: data.recipient_box_width_mm ?? VCPMC_PRESET.recipient_box_width_mm,
        recipient_box_height_mm: data.recipient_box_height_mm ?? VCPMC_PRESET.recipient_box_height_mm,
        line_spacing_mm: data.line_spacing_mm ?? VCPMC_PRESET.line_spacing_mm,
        printer_offset_x_mm: data.printer_offset_x_mm ?? 0,
        printer_offset_y_mm: data.printer_offset_y_mm ?? 0,
        phone_on_envelope: Boolean(data.phone_on_envelope ?? false),
      });
    } catch (e: any) {
      setError(e.message || 'Lỗi tải cấu hình');
      setLocal({ ...VCPMC_PRESET });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); loadProfiles(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      await saveEnvelopeLayoutConfig({
        page_width_mm: Number(local.page_width_mm),
        page_height_mm: Number(local.page_height_mm),
        recipient_box_left_mm: Number(local.recipient_box_left_mm),
        recipient_box_bottom_mm: Number(local.recipient_box_bottom_mm),
        recipient_box_width_mm: Number(local.recipient_box_width_mm),
        recipient_box_height_mm: Number(local.recipient_box_height_mm),
        line_spacing_mm: Number(local.line_spacing_mm),
        printer_offset_x_mm: Number(local.printer_offset_x_mm),
        printer_offset_y_mm: Number(local.printer_offset_y_mm),
        phone_on_envelope: Boolean(local.phone_on_envelope),
      });
      setSuccess('Đã lưu cấu hình.');
      load();
    } catch (e: any) {
      setError(e.message || 'Lỗi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  const restoreLegacy = async () => {
    try {
      await saveEnvelopeLayoutConfig({ ...VCPMC_PRESET } as Partial<EnvelopeLayoutConfig>);
      setSuccess('Đã khôi phục layout app cũ (230x162, bottom=41).');
      load();
    } catch (e: any) {
      setError('Lỗi khôi phục: ' + (e.message || ''));
    }
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setSuccess('');
    setError('');
    try {
      await saveEnvelopeProfileConfig({
        profile_id: selectedProfile,
        brother_transform_mode: selectedBrotherMode,
      });
      setSuccess('Đã lưu cấu hình máy in.');
      loadProfiles();
    } catch (e: any) {
      setError('Lỗi lưu profile: ' + (e.message || ''));
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCreateBrotherTest = async () => {
    setTestGenerating(true);
    setSuccess('');
    setError('');
    setTestResult(null);
    try {
      const result = await createBrotherTestFiles();
      setTestResult(result);
      setSuccess('Đã tạo 3 file test Brother. Vui lòng tải xuống và in thử.');
    } catch (e: any) {
      setError('Lỗi tạo test: ' + (e.message || ''));
    } finally {
      setTestGenerating(false);
    }
  };

  const downloadTestFile = (url: string) => { window.open(url, '_blank'); };

  if (loading) return (
    <div className="flex items-center justify-center py-12"><LoaderIcon className="animate-spin" size={24} /></div>
  );

  return (
    <div className="flex flex-col gap-6">
      <ContentCard>
        <div className="flex items-center gap-2 text-amber-600 text-sm mb-4">
          <PrinterIcon size={15} />
          <span>Cài đặt in bìa thư — Bia Thu App Cu (230 x 162mm)</span>
        </div>

        {/* Printer Profile Section */}
        <div className="mb-6 p-4 border border-zinc-200 rounded-lg bg-zinc-50">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <PrinterIcon size={14} />
            Máy in bìa thư
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Chọn máy in</label>
              <select
                className="w-full border border-zinc-300 rounded px-3 py-2 text-sm"
                value={selectedProfile}
                onChange={e => setSelectedProfile(e.target.value)}
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {selectedProfile === 'brother_hl_l2360d' && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Chế độ Brother</label>
                <select
                  className="w-full border border-zinc-300 rounded px-3 py-2 text-sm"
                  value={selectedBrotherMode}
                  onChange={e => setSelectedBrotherMode(e.target.value)}
                >
                  <option value="legacy_normal">Legacy Normal</option>
                  <option value="rotate_180">Rotate 180</option>
                  <option value="swap_orientation">Swap Orientation</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            <Button onClick={handleSaveProfile} disabled={profileLoading} size="sm" variant="outline">
              {profileLoading ? 'Đang lưu...' : 'Lưu cấu hình máy in'}
            </Button>
          </div>

          {selectedProfile === 'brother_hl_l2360d' && (
            <div className="mt-4 pt-4 border-t border-zinc-200">
              <div className="flex items-center gap-2 text-sm text-zinc-600 mb-3">
                <PrinterIcon size={14} />
                <span>Tạo file test cho Brother HL-L2360D</span>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Tạo 3 file DOCX để in thử và xác định transform phù hợp cho máy in Brother.
              </p>
              <Button
                onClick={handleCreateBrotherTest}
                disabled={testGenerating}
                size="sm"
                className="bg-lime-600 hover:bg-lime-700 text-white"
              >
                {testGenerating ? 'Đang tạo...' : 'Tạo test Brother L2360D'}
              </Button>

              {testResult && testResult.test_files && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-zinc-600">File đã tạo:</p>
                  {Object.entries(testResult.test_files).map(([mode, file]) => (
                    <div key={mode} className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 min-w-[160px]">{file.filename}</span>
                      <button
                        onClick={() => downloadTestFile(file.download_url)}
                        className="text-xs text-lime-600 hover:text-lime-800 underline"
                      >
                        Tải xuống
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-zinc-500 mt-2">
                    Sau khi in, xác nhận file nào ra đúng vị trí "Kính gửi".
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legacy Bia Thu Settings */}
        <div className="border-t border-zinc-200 pt-4 mt-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-700">Cấu hình layout bìa thư</h3>
            <Button size="sm" variant="ghost" onClick={restoreLegacy}>
              Khôi phục app cũ
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { key: 'page_width_mm', label: 'Chiều rộng (mm)', min: 100, max: 300 },
              { key: 'page_height_mm', label: 'Chiều cao (mm)', min: 100, max: 300 },
              { key: 'recipient_box_left_mm', label: 'Tọa độ X (mm)', min: 0, max: 200 },
              { key: 'recipient_box_bottom_mm', label: 'Tọa độ Y (mm)', min: 0, max: 200 },
              { key: 'recipient_box_width_mm', label: 'Chiều rộng block (mm)', min: 30, max: 200 },
              { key: 'recipient_box_height_mm', label: 'Chiều cao block (mm)', min: 10, max: 100 },
              { key: 'line_spacing_mm', label: 'Khoảng cách dòng (mm)', min: 4, max: 20 },
              { key: 'printer_offset_x_mm', label: 'Offset X máy in (mm)', min: -50, max: 50 },
              { key: 'printer_offset_y_mm', label: 'Offset Y máy in (mm)', min: -50, max: 50 },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-zinc-500 mb-1">{field.label}</label>
                <input
                  type="number"
                  className="w-full border border-zinc-300 rounded px-3 py-2 text-sm"
                  value={local[field.key] ?? ''}
                  min={field.min}
                  max={field.max}
                  step={0.5}
                  onChange={e => setLocal(prev => ({ ...prev, [field.key]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            ))}
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(local.phone_on_envelope)}
                  onChange={e => setLocal(prev => ({ ...prev, phone_on_envelope: e.target.checked }))}
                  className="accent-amber-600"
                />
                In SĐT trên bìa thư
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} size="sm" variant="primary">
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
          </div>

          {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
          {success && <p className="text-green-600 text-xs mt-2">{success}</p>}
        </div>
      </ContentCard>
    </div>
  );
}

// =============================================================================
// Main DispatchesPage
// =============================================================================

type TabId = 'renewal' | 'new_sign' | 'created' | 'tracking' | 'address_labels' | 'settings';

/**
 * DispatchStatBand — dải KPI tổng quan công văn của năm hiện tại.
 * Chỉ đọc số liệu backend trả về, không tự tính lại nghiệp vụ.
 */
function DispatchStatBand() {
  const year = new Date().getFullYear();
  const [state, setState] = useState<{
    loading: boolean;
    error: boolean;
    expired: number;
    batches: number;
    tracked: number;
    resigned: number;
  }>({ loading: true, error: false, expired: 0, batches: 0, tracked: 0, resigned: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [expired, batches, tracking] = await Promise.all([
          getExpiredContracts({ filter_mode: 'year', filter_year: year, page: 1, page_size: 1 }),
          getBatches({ year, page: 1, page_size: 1 }),
          getTrackingItems({ year, page: 1, page_size: 1 }),
        ]);
        if (!alive) return;
        fetch('http://127.0.0.1:7610/ingest/ed7e2e57-0f77-4520-9015-327ec659fccf',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c968d0'},body:JSON.stringify({sessionId:'c968d0',location:'DispatchesPage.tsx:1810',message:'tracking items loaded',data:{total:tracking?.total??0,rowsLoaded:Array.isArray(tracking?.rows)?tracking.rows.length:0},timestamp:Date.now()})}).catch(function(){});
        fetch('http://127.0.0.1:7610/ingest/ed7e2e57-0f77-4520-9015-327ec659fccf',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c968d0'},body:JSON.stringify({sessionId:'c968d0',location:'DispatchesPage.tsx:1810',message:'tracking total for resigned',data:{total:tracking?.total??0},timestamp:Date.now()})}).catch(function(){});
        setState({
          loading: false,
          error: false,
          expired: expired?.total ?? 0,
          batches: batches?.total ?? 0,
          tracked: tracking?.total ?? 0,
          resigned: tracking?.total ?? 0,
        });
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false, error: true }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [year]);

  const tiles = [
    { label: `Hợp đồng hết hạn ${year}`, value: state.expired, hint: 'Nguồn cho công văn tái ký' },
    { label: 'Đợt công văn đã tạo', value: state.batches, hint: `Trong năm ${year}` },
    { label: 'Đơn vị đang theo dõi', value: state.tracked, hint: 'Có trong danh sách gửi' },
    { label: 'Đã tái ký', value: state.resigned, hint: 'Ghi nhận ngày ký hợp đồng', accent: true },
  ];

  if (state.error) return null;

  return (
    <div className="cv-statband" role="group" aria-label="Tổng quan công văn">
      {tiles.map((t) => (
        <div key={t.label} className="cv-statband__tile">
          <span className="cv-statband__label">{t.label}</span>
          <span className={`cv-statband__value ${t.accent ? 'is-accent' : ''}`}>
            {state.loading ? '—' : t.value.toLocaleString('vi-VN')}
          </span>
          <span className="cv-statband__hint">{t.hint}</span>
        </div>
      ))}
    </div>
  );
}

export function DispatchesPage({ onNavigate, embedded }: { onNavigate: (route: RouteKey) => void; embedded?: boolean; }) {
  const [activeTab, setActiveTab] = useState<TabId>('renewal');

  return (
    <Page embedded={embedded}>
      {!embedded && (
        <PageHeader
          title="Công văn"
          description="Tạo công văn nhắc tái ký và theo dõi phản hồi từ các đơn vị."
          breadcrumb="Nghiệp vụ"
        />
      )}

      <DispatchStatBand />

      <div className="cv-tabbar">
        <Tabs
        value={activeTab}
        onChange={v => setActiveTab(v as TabId)}
        tabs={[
          { value: 'renewal', label: 'Tái ký' },
          { value: 'new_sign', label: 'Ký mới' },
          { value: 'created', label: 'Đã tạo' },
          { value: 'tracking', label: 'Theo dõi' },
          { value: 'address_labels', label: 'Nhãn địa chỉ' },
          { value: 'settings', label: 'Cài đặt' },
        ]}
        />
      </div>

      {activeTab === 'renewal' && <RenewalContractsTab onNavigate={() => setActiveTab('created')} />}
      {activeTab === 'new_sign' && <KyMoiTab onNavigate={tab => tab && setActiveTab(tab as TabId)} />}
      {activeTab === 'created' && <CreatedDispatchesTab onNavigate={onNavigate} />}
      {activeTab === 'tracking' && <TrackingTab />}
      {activeTab === 'address_labels' && <DiaChiTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </Page>
  );
}
