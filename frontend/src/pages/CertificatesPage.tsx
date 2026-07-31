import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangleIcon,
  AwardIcon,
  CheckCircle2Icon,
  EyeIcon,
  HashIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  XCircleIcon } from
'lucide-react';
import { Page, PageHeader } from '../components/app-ui/Page';
import { ContentCard } from '../components/app-ui/ContentCard';
import { MetricStrip } from '../components/app-ui/MetricCard';
import { Button } from '../components/app-ui/Button';
import { Select } from '../components/app-ui/Select';
import { SearchBox } from '../components/app-ui/SearchBox';
import { StatusBadge } from '../components/app-ui/StatusBadge';
import { Checkbox } from '../components/app-ui/Checkbox';
import { RowActionsMenu } from '../components/app-ui/RowActionsMenu';
import { FilterBar, FilterField } from '../components/app-ui/FilterBar';
import { Pagination } from '../components/app-ui/Pagination';
import { TableSkeleton } from '../components/app-ui/TableSkeleton';
import { EmptyState } from '../components/app-ui/EmptyState';
import { CertificateQuickView } from '../components/app-ui/CertificateQuickView';
import {
  CERTIFICATE_STATUS_LABEL,
  CertificateRecord,
  CertificateStatus } from
'../data/certificateRecords';
import {
  listCertificates,
  type ApiCertificateRecord,
  type CertificatesSummary } from
'../lib/certificatesClient';
import { formatDate, formatNumber } from '../lib/format';
import { RouteKey } from '../data/routes';

import { CertificateDetailPage } from './CertificateDetailPage';

const TOKEN_KEY = 'vcpmc_new_app_access_token';

const PRINT_STATUS_OPTIONS = [
  { value: 'not_printed', label: 'Chưa in' },
  { value: 'official_printed', label: 'Đã in chính thức' },
  { value: 'reprinted', label: 'In lại' },
];

const YEAR_OPTIONS = [
  { value: '2026', label: '2026' },
  { value: '2025', label: '2025' },
  { value: '2024', label: '2024' },
];

const HAS_NUMBER_OPTIONS = [
  { value: 'has', label: 'Đã cấp số' },
  { value: 'missing', label: 'Chưa cấp số' },
];

const EMPTY_SUMMARY: CertificatesSummary = {
  total: 0,
  draft: 0,
  numbered: 0,
  official_printed: 0,
  final_printed: 0,
  missing_number: 0,
  printed_multiple: 0,
};

function asStatus(value: string): CertificateStatus {
  if (value === 'final_printed') return 'final_printed';
  return 'draft';
}

function mapApiRecord(row: ApiCertificateRecord): CertificateRecord {
  return {
    id: row.id,
    certificate_id: row.certificate_id,
    contract_id: row.contract_id,
    certificate_no: row.certificate_no,
    certificate_issue_date: row.certificate_issue_date,
    status: asStatus(row.status),
    organization_name: row.organization_name || 'Chưa có tên đơn vị',
    business_registration_no: row.business_registration_no,
    business_sign_name: row.business_sign_name,
    business_location: row.business_location,
    address: row.address || row.business_location || '',
    contract_no: row.contract_no || '',
    effective_from: row.effective_from || '',
    effective_to: row.effective_to || '',
    gcn_scope_col_1_text: row.gcn_scope_col_1_text,
    gcn_scope_col_2_text: row.gcn_scope_col_2_text,
    gcn_scope_col_3_text: row.gcn_scope_col_3_text,
    offset_x_mm: row.offset_x_mm,
    offset_y_mm: row.offset_y_mm,
    created_at: row.created_at || '',
    printed_at: row.printed_at,
    printed_by: row.printed_by,
    print_count: row.print_count,
    last_printed_at: row.last_printed_at || null,
    last_print_file: row.last_print_file || null,
    last_print_reason: row.last_print_reason || null,
    has_qr_image: row.has_qr_image,
  };
}

export function CertificatesPage({
  onNavigate
}: {onNavigate: (k: RouteKey) => void;}) {
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  const [summary, setSummary] = useState<CertificatesSummary>(EMPTY_SUMMARY);
  const [keyword, setKeyword] = useState('');
  const [numberStatusFilter, setNumberStatusFilter] = useState(''); // 'has' | 'missing'
  const [printStatusFilter, setPrintStatusFilter] = useState(''); // 'not_printed' | 'official_printed' | 'reprinted'
  const [yearFilter, setYearFilter] = useState('');
  const [hasNumberFilter, setHasNumberFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailView, setDetailView] = useState<{ id: number } | null>(null);
  const [quickView, setQuickView] = useState<CertificateRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const hasActiveFilter = !!keyword || !!numberStatusFilter || !!printStatusFilter || !!yearFilter;

  useEffect(() => {
    let cancelled = false;
    async function fetchCertificates() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setLoadError('Chưa đăng nhập hoặc token không còn trong trình duyệt.');
        return;
      }
      setLoading(true);
      setLoadError('');
      try {
        const response = await listCertificates(token, {
          page,
          page_size: pageSize,
          q: keyword.trim() || undefined,
          year: yearFilter || undefined,
        });
        if (cancelled) return;
        setRecords(response.items.map(mapApiRecord));
        setSummary(response.summary);
        setTotal(response.total);
        setTotalPages(response.total_pages);
        setSelected(new Set());
      } catch (error: any) {
        if (!cancelled) {
          setRecords([]);
          setTotal(0);
          setTotalPages(0);
          setLoadError(String(error?.message || 'Không tải được danh sách GCN.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCertificates();
    return () => {
      cancelled = true;
    };
  }, [keyword, numberStatusFilter, printStatusFilter, yearFilter, page, pageSize, refreshNonce]);

  const displayRecords = useMemo(() => {
    return records.filter((record) => {
      // Number status filter
      if (numberStatusFilter === 'has' && !record.certificate_no) return false;
      if (numberStatusFilter === 'missing' && !!record.certificate_no) return false;
      // Print status filter
      if (printStatusFilter === 'not_printed' && record.print_count > 0) return false;
      if (printStatusFilter === 'official_printed' && !(record.status === 'final_printed')) return false;
      if (printStatusFilter === 'reprinted' && record.print_count < 2) return false;
      return true;
    });
  }, [records, numberStatusFilter, printStatusFilter]);

  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === 0 ? 0 : Math.min(total, (page - 1) * pageSize + displayRecords.length);
  const visibleIds = displayRecords.map((record) => record.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = !allSelected && visibleIds.some((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleIds));
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setKeyword('');
    setNumberStatusFilter('');
    setPrintStatusFilter('');
    setYearFilter('');
    setPage(1);
  };

  const openQuickView = async (record: CertificateRecord) => {
    setQuickView(record);
  };

  const statusTone = (record: CertificateRecord) =>
    record.status === 'final_printed' ? 'success' : 'neutral';

  return (
    <Page>
      <PageHeader
        breadcrumb="/bg/contracts/certificates"
        title="Giấy chứng nhận"
        description="Danh sách, lịch sử và quản lý giấy chứng nhận."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<RefreshCwIcon className="h-4 w-4" />}
              onClick={() => setRefreshNonce((value) => value + 1)}
              disabled={loading}>
              Làm mới
            </Button>
            <Button
              variant="primary"
              leftIcon={<PlusIcon className="h-4 w-4" />}
              onClick={() => onNavigate('contracts.print')}>
              Tạo GCN / In GCN
            </Button>
          </>
        } />

      <MetricStrip
        items={[
          { label: 'Tổng GCN', value: formatNumber(summary.total ?? 0), tone: 'indigo', icon: <AwardIcon className="h-4 w-4" /> },
          { label: 'Đã cấp số', value: formatNumber(summary.numbered ?? 0), tone: 'cyan', icon: <HashIcon className="h-4 w-4" /> },
          { label: 'Chưa cấp số', value: formatNumber(summary.missing_number ?? 0), tone: 'amber', icon: <AlertTriangleIcon className="h-4 w-4" /> },
          { label: 'Đã in chính thức', value: formatNumber(summary.final_printed ?? 0), tone: 'emerald', icon: <CheckCircle2Icon className="h-4 w-4" /> },
          { label: 'Đã in nhiều lần', value: formatNumber(summary.printed_multiple ?? 0), tone: 'violet', icon: <PrinterIcon className="h-4 w-4" /> },
        ]} />


      <FilterBar
        hasActive={hasActiveFilter}
        onClear={clearFilters}
        resultSummary={
          <span>
            Hiển thị <span className="font-semibold text-zinc-900 tabular-nums">{rangeFrom}-{rangeTo}</span> trong{' '}
            <span className="font-semibold text-zinc-900 tabular-nums">{formatNumber(total)}</span> GCN
          </span>
        }>
        <FilterField label="Tìm kiếm" width="flex-1 min-w-[280px]">
          <SearchBox
            value={keyword}
            onChange={(value) => {
              setKeyword(value);
              setPage(1);
            }}
            placeholder="Tìm số GCN, số hợp đồng, đơn vị, bảng hiệu..."
          />
        </FilterField>
        <FilterField label="Trạng thái cấp số" width="w-44">
          <Select
            value={numberStatusFilter}
            onChange={(value) => {
              setNumberStatusFilter(value);
              setPage(1);
            }}
            options={HAS_NUMBER_OPTIONS}
            placeholder="Tất cả"
          />
        </FilterField>
        <FilterField label="Trạng thái in" width="w-44">
          <Select
            value={printStatusFilter}
            onChange={(value) => {
              setPrintStatusFilter(value);
              setPage(1);
            }}
            options={PRINT_STATUS_OPTIONS}
            placeholder="Tất cả"
          />
        </FilterField>
        <FilterField label="Năm" width="w-32">
          <Select
            value={yearFilter}
            onChange={(value) => {
              setYearFilter(value);
              setPage(1);
            }}
            options={YEAR_OPTIONS}
            placeholder="Tất cả"
          />
        </FilterField>
      </FilterBar>

      <ContentCard padded={false}>
        {selected.size > 0 && (() => {
          const selectedRecords = displayRecords.filter(r => selected.has(r.id));
          const hasNumber = selectedRecords.filter(r => !!r.certificate_no).length;
          const noNumber = selectedRecords.length - hasNumber;
          return (
          <div className="border-b border-lime-200 bg-lime-50/80 px-4 py-2.5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-lime-900">
              <CheckCircle2Icon className="h-4 w-4 text-lime-600 shrink-0" />
              <span>Đã chọn <strong className="font-semibold">{selected.size}</strong> GCN</span>
              {noNumber > 0 && <span className="text-lime-700">({noNumber} chưa có số)</span>}
              {hasNumber > 0 && <span className="text-lime-700">({hasNumber} đã có số)</span>}
            </div>
            <div className="h-4 w-px bg-lime-300" />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<HashIcon className="h-3.5 w-3.5" />}
                onClick={() => {}}
                disabled={true}
                title="Chưa hỗ trợ cấp số hàng loạt"
              >
                Cấp số GCN ({noNumber})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<CheckCircle2Icon className="h-3.5 w-3.5" />}
                onClick={() => {}}
                disabled={true}
                title="Chưa hỗ trợ in hàng loạt"
              >
                In chính thức ({hasNumber})
              </Button>
            </div>

            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="text-lime-800" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
          </div>
          );
        })()}

        {loadError &&
          <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loadError}
          </div>
        }

        {loading ?
          <TableSkeleton rows={8} cols={7} /> :
          displayRecords.length === 0 ?
            <EmptyState
              title={total === 0 ? 'Chưa có GCN' : 'Không tìm thấy GCN phù hợp'}
              description={total === 0 ? 'Danh sách GCN hiện đang trống.' : 'Thử điều chỉnh từ khóa hoặc xóa các bộ lọc để xem lại danh sách.'}
              action={<Button variant="secondary" onClick={clearFilters}>Xóa bộ lọc</Button>}
              icon={<XCircleIcon className="h-5 w-5" />}
            /> :
            <div className="overflow-x-auto">
              <table className="vc-datatable">
                <thead>
                  <tr className="bg-zinc-50/60 border-b border-zinc-200">
                    <th className="w-10 pl-5 pr-2 py-3.5">
                      <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} ariaLabel="Chọn tất cả" />
                    </th>
                    <Th>Số GCN</Th>
                    <Th>Số hợp đồng</Th>
                    <Th>Đơn vị / Bảng hiệu</Th>
                    <Th>Địa chỉ</Th>
                    <Th>Hiệu lực</Th>
                    <Th>Trạng thái in</Th>
                    <Th align="right">Số lần in</Th>
                    <Th>Ngày in gần nhất</Th>
                    <Th>Ngày tạo</Th>
                    <th className="w-10 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {displayRecords.map((record) => {
                    const isSelected = selected.has(record.id);
                    const hasNumber = !!record.certificate_no;
                    return (
                      <tr
                        key={record.id}
                        onClick={() => openQuickView(record)}
                        className={`group/row relative border-b border-zinc-100 last:border-0 transition-all cursor-pointer ${isSelected ? 'bg-lime-50/60 hover:bg-lime-50/80' : 'hover:bg-zinc-50 hover:shadow-[inset_0_1px_0_rgba(59,130,246,0.06),inset_0_-1px_0_rgba(59,130,246,0.06)]'}`}>
                        <td className="relative pl-5 pr-2 py-3.5 align-top">
                          <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-[3px] bg-lime-500 transition-opacity ${isSelected ? 'opacity-100 shadow-[0_0_8px_rgba(59,130,246,0.4)]' : 'opacity-0 group-hover/row:opacity-90'}`} />
                          <Checkbox checked={isSelected} onChange={() => toggleOne(record.id)} ariaLabel={`Chọn ${record.certificate_no ?? record.contract_no}`} />
                        </td>
                        <td className="px-4 py-3.5 align-top whitespace-nowrap">
                          {hasNumber ?
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openQuickView(record);
                              }}
                              className="font-mono text-[13px] font-semibold text-lime-700 hover:text-lime-900 group-hover/row:underline underline-offset-[3px] decoration-lime-300/70 decoration-1 transition-colors tracking-tight">
                              {record.certificate_no}
                            </button> :
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15">
                              <HashIcon className="h-2.5 w-2.5" />
                              Chưa cấp số
                            </span>
                          }
                        </td>
                        <td className="px-4 py-3.5 align-top whitespace-nowrap">
                          <span className="font-mono text-[13px] font-medium text-zinc-700 group-hover/row:text-zinc-900 transition-colors">
                            {record.contract_no || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 align-top max-w-[280px]">
                          <p className="text-[14px] font-semibold text-zinc-900 leading-snug line-clamp-2" title={record.organization_name}>
                            {record.organization_name}
                          </p>
                          {record.business_sign_name &&
                            <p className="mt-0.5 text-[12px] text-zinc-500 truncate" title={record.business_sign_name}>
                              {record.business_sign_name}
                            </p>
                          }
                        </td>
                        <td className="px-4 py-3.5 align-top max-w-[260px]">
                          <p className="text-[12.5px] text-zinc-600 leading-snug line-clamp-2" title={record.address}>
                            {record.address || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top whitespace-nowrap">
                          <p className="text-zinc-700 tabular-nums text-[13px]">{formatDate(record.effective_from)}</p>
                          <p className="text-zinc-500 tabular-nums text-[12px]">→ {formatDate(record.effective_to)}</p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <StatusBadge tone={statusTone(record)} dot>
                            {CERTIFICATE_STATUS_LABEL[record.status]}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                          {record.print_count > 0 ?
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15 tabular-nums">
                              <PrinterIcon className="h-3 w-3" />
                              {record.print_count} lần
                            </span> :
                            <span className="text-[12px] text-zinc-400 italic">Chưa in</span>
                          }
                        </td>
                        <td className="px-4 py-3.5 align-top whitespace-nowrap">
                          {record.printed_at ? (
                            <span className={`inline-flex items-center gap-1 text-[13px] tabular-nums font-medium ${record.status === 'final_printed' ? 'text-lime-700' : 'text-amber-700'}`}>
                              {record.status === 'final_printed' && <span className="w-1.5 h-1.5 rounded-full bg-lime-500" />}
                              {record.status !== 'final_printed' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                              {formatDate(record.printed_at.slice(0, 10))}
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-[12px] italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top whitespace-nowrap">
                          <span className="text-zinc-500 tabular-nums text-[13px]">{formatDate(record.created_at.slice(0, 10))}</span>
                        </td>
                        <td className="pr-3 pl-1 align-top text-right">
                          <RowActionsMenu
                            actions={[
                              { label: 'Xem chi tiết', icon: <EyeIcon className="h-4 w-4" />, onClick: () => setDetailView({ id: record.id }) },
                              { label: 'Xem nhanh', icon: <EyeIcon className="h-4 w-4" />, onClick: () => openQuickView(record) },
                              { label: 'Cấp/sửa số GCN', icon: <HashIcon className="h-4 w-4" />, onClick: () => setDetailView({ id: record.id }) },
                              { label: 'Mở trang In GCN', icon: <PrinterIcon className="h-4 w-4" />, onClick: () => onNavigate('contracts.print') },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        }

        {!loading && displayRecords.length > 0 &&
          <Pagination
            page={page}
            totalPages={Math.max(1, totalPages)}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            total={total}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
          />
        }
      </ContentCard>

      <CertificateQuickView
        record={quickView}
        onClose={() => setQuickView(null)}
        onUpdateNumber={(record) => {
          setQuickView(null);
          setDetailView({ id: record.id });
        }}
        onPrintFinal={() => {
          setQuickView(null);
          onNavigate('contracts.print');
        }}
      />

      {detailView && (
        <CertificateDetailPage
          certificateId={detailView.id}
          onNavigate={onNavigate}
          onBack={() => setDetailView(null)}
        />
      )}
    </Page>
  );
}

function Th({
  children,
  align = 'left'
}: {children: React.ReactNode;align?: 'left' | 'right' | 'center';}) {
  return (
    <th className={`px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-700 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      {children}
    </th>
  );
}
