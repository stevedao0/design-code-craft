import React, { useState, useCallback } from 'react';
import { AlertCircleIcon, ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Button } from '@/components/app-ui/Button';
import { Input } from '@/components/app-ui/Input';
import { Select } from '@/components/app-ui/Select';
import { Badge } from '@/components/app-ui/Badge';
import { EmptyState } from '@/components/app-ui/EmptyState';
import { Skeleton } from './Skeleton';
import { Pagination } from './Pagination';
import { getContracts, fmtVND, fmtDate } from './kpiClient';
import { getFieldDomains } from '@/lib/kpiFieldClient';
import type { ContractListResponse } from './types';

interface ContractTableProps {
  year: number;
  signingBucket?: string;
  contractState?: string;
  gcnState?: string;
  canViewMoney?: boolean;
  /** Restrict the table to contracts where the owner (nguoi_thuc_hien_email) equals this email.
   *  Used by the "Tổng quan của tôi" tab so the table grain matches the rest of the screen. */
  ownerEmail?: string;
}

const PAGE_SIZE = 20;

const SIGNING_LABELS: Record<string, string> = {
  NEW: 'Ký mới',
  RENEWAL: 'Tái ký',
  FRAME: 'Hợp đồng khung',
  PENDING_RENEWAL: 'Tái ký',
  RENEWED: 'Tái ký',
  FRAME_CONTRACT: 'Hợp đồng khung',
  UNKNOWN: 'Chưa xác định',
};

const STATE_LABELS: Record<string, string> = {
  ALL: 'Tất cả',
  ACTIVE: 'Đang hiệu lực',
  EXPIRED: 'Hết hạn',
  EXPIRING: 'Sắp hết hạn',
  RENEWED: 'Đã tái ký',
};

const GCN_LABELS: Record<string, string> = {
  ALL: 'Tất cả',
  ISSUED: 'Đã cấp',
  MISSING: 'Chưa cấp',
};

// Data-quality filter — applied server side (`value_filter`) so pagination
// totals always match the selected subset, not just the loaded page.
const VALUE_FILTER_LABELS: Record<string, string> = {
  all: 'Tất cả',
  positive: 'Có giá trị',
  zero: 'Bằng 0',
  null: 'Chưa có dữ liệu',
};

/** Sortable table header — click cycles ascending → descending. */
function SortHeader({
  label, columnKey, sortBy, sortOrder, onSort, align = 'left',
}: {
  label: string;
  columnKey: string;
  sortBy: string;
  sortOrder: string;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
}) {
  const active = sortBy === columnKey;
  const Icon = !active ? ChevronsUpDownIcon : sortOrder === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <th
      className={`sticky top-0 whitespace-nowrap px-3 py-2.5 font-medium ${align === 'right' ? 'text-right' : ''}`}
      style={{ background: 'var(--surface-muted, #f1ece4)' }}
      aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`inline-flex items-center gap-1 transition-colors hover:underline ${align === 'right' ? 'flex-row-reverse' : ''}`}
        style={{ color: active ? 'var(--accent-primary, #4A7202)' : 'inherit' }}
        title={`Sắp xếp theo ${label}`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </th>
  );
}

function ContractRowCard({ item }: { item: ContractListResponse['items'][0] }) {
  const val = item.royalty_amount_before_vat;
  const valueLabel =
    val == null
      ? 'Chưa có dữ liệu'
      : val === 0
        ? '0 đ'
        : fmtVND(val);
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--border-default, #e6e0d7)', background: 'var(--surface, white)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {item.contract_number}
          </div>
          <div className="mt-0.5 text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {item.organization_name}
          </div>
        </div>
        <Badge variant={item.gcn_state === 'ISSUED' ? 'success' : 'secondary'}>
          {item.gcn_state === 'ISSUED' ? 'GCN' : 'Chưa GCN'}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{item.field}</span>
        <span> · </span>
        <span>{fmtDate(item.signed_date)}</span>
        <span> → </span>
        <span>{fmtDate(item.end_date)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span
          className="font-semibold text-sm"
          style={{ color: val == null ? 'var(--text-muted, #8a847c)' : 'var(--accent-primary)' }}
        >
          {valueLabel}
        </span>
        <div className="flex items-center gap-1">
          <Badge variant="outline" size="sm">
            {SIGNING_LABELS[item.signing_bucket] ?? item.signing_bucket}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// Render the contract main value cell. Primary display = Doanh thu chưa GTGT.
// Falls back to total_payment (sau GTGT) only when before_vat is missing.
function ContractValueCell({ item }: { item: ContractListResponse['items'][0] }) {
  const beforeVat = item.royalty_amount_before_vat;
  const afterVat = item.total_payment;

  // Primary: Doanh thu chưa GTGT
  if (beforeVat != null && beforeVat !== 0) {
    return (
      <div className="text-right">
        <div className="tabular-nums font-semibold" style={{ color: 'var(--accent-primary, #4A7202)' }}>{fmtVND(beforeVat)}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {afterVat != null && afterVat !== beforeVat
            ? <>Tổng giá trị HĐ: {fmtVND(afterVat)}</>
            : 'Doanh thu chưa GTGT'}
        </div>
      </div>
    );
  }
  if (beforeVat === 0) {
    return (
      <div className="text-right">
        <div className="tabular-nums" style={{ color: 'var(--text-muted, #8a847c)' }}>0 đ</div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Doanh thu chưa GTGT</div>
      </div>
    );
  }
  // No before-vat data
  if (afterVat != null && afterVat !== 0) {
    return (
      <div className="text-right">
        <div className="tabular-nums" style={{ color: 'var(--text-muted, #8a847c)' }}>{fmtVND(afterVat)}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>(sau thuế · chưa xác định before-vat)</div>
      </div>
    );
  }
  if (afterVat === 0) {
    return (
      <div className="text-right">
        <div className="tabular-nums" style={{ color: 'var(--text-muted, #8a847c)' }}>0 đ</div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Chưa xác định doanh thu</div>
      </div>
    );
  }
  return (
    <span className="italic" style={{ color: 'var(--text-muted, #8a847c)' }}>
      Chưa có dữ liệu
    </span>
  );
}

export function ContractTable({ year, signingBucket, contractState, gcnState, canViewMoney = true, ownerEmail }: ContractTableProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [field, setField] = useState('');
  // valueFilter is sent to the API so the pagination total reflects the subset.
  const [valueFilter, setValueFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState('signed_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [data, setData] = useState<ContractListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldOptions, setFieldOptions] = useState<{value: string; label: string}[]>([]);

  // Reset page when year or owner scope changes
  React.useEffect(() => {
    setPage(1);
    setField('');
  }, [year, ownerEmail]);

  // Load domain options once on mount (uses getFieldDomains from kpiFieldClient)
  React.useEffect(() => {
    let cancelled = false;
    getFieldDomains().then(r => {
      if (!cancelled) {
        setFieldOptions([
          { value: '', label: 'Tất cả lĩnh vực' },
          ...r.domains.map(d => ({ value: d.code, label: d.label })),
        ]);
      }
    }).catch(() => {
      if (!cancelled) setFieldOptions([{ value: '', label: 'Tất cả lĩnh vực' }]);
    });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getContracts({
        year,
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        field: field || undefined,
        signing_bucket: signingBucket || undefined,
        contract_state: contractState || undefined,
        gcn_state: gcnState || undefined,
        value_filter: valueFilter === 'all' ? undefined : valueFilter,
        sort_by: sortBy,
        sort_order: sortOrder,
        owner_email: ownerEmail || undefined,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, [year, page, search, field, signingBucket, contractState, gcnState, valueFilter, sortBy, sortOrder, ownerEmail]);

  React.useEffect(() => { load(); }, [load]);

  const resetFilters = () => {
    setSearch('');
    setField('');
    setValueFilter('all');
    setSortBy('signed_date');
    setSortOrder('desc');
    setPage(1);
  };

  const hasActiveFilters = !!search || !!field || valueFilter !== 'all' || sortBy !== 'signed_date' || sortOrder !== 'desc';

  const filteredItems = data?.items ?? [];

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder(key === 'signed_date' || key === 'ngay_ket_thuc' ? 'desc' : 'desc');
    }
    setPage(1);
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
        <Input
          placeholder="Tìm số HĐ, đơn vị..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full"
        />
        <Select
          value={field}
          onChange={v => { setField(v); setPage(1); }}
          options={fieldOptions}
          size="sm"
        />
        <Select
          value={valueFilter}
          onChange={v => { setValueFilter(v); setPage(1); }}
          options={Object.entries(VALUE_FILTER_LABELS).map(([value, label]) => ({
            value,
            label: value === 'all' ? 'Tất cả giá trị' : label,
          }))}
          size="sm"
        />
        <Select
          value={`${sortBy}:${sortOrder}`}
          onChange={v => {
            const [s, o] = v.split(':');
            setSortBy(s);
            setSortOrder(o);
            setPage(1);
          }}
          options={[
            { value: 'signed_date:desc', label: 'Ngày ký · mới nhất' },
            { value: 'signed_date:asc', label: 'Ngày ký · cũ nhất' },
            { value: 'ngay_ket_thuc:asc', label: 'Ngày kết thúc · gần nhất' },
            { value: 'ngay_ket_thuc:desc', label: 'Ngày kết thúc · xa nhất' },
            { value: 'royalty_amount_before_vat:desc', label: 'Doanh thu · cao → thấp' },
            { value: 'royalty_amount_before_vat:asc', label: 'Doanh thu · thấp → cao' },
            { value: 'contract_no:asc', label: 'Số HĐ · A → Z' },
            { value: 'don_vi_ten:asc', label: 'Đơn vị · A → Z' },
          ]}
          size="sm"
        />
        <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasActiveFilters}>Đặt lại</Button>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          <span>Đang lọc:</span>
          {search && <Badge variant="outline" size="sm">Từ khoá “{search}”</Badge>}
          {field && (
            <Badge variant="outline" size="sm">
              {fieldOptions.find(o => o.value === field)?.label ?? field}
            </Badge>
          )}
          {valueFilter !== 'all' && <Badge variant="outline" size="sm">{VALUE_FILTER_LABELS[valueFilter]}</Badge>}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,6,9].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 rounded-xl border p-4" style={{ borderColor: 'var(--accent-primary)', background: 'var(--surface)' }}>
          <AlertCircleIcon className="h-5 w-5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
          <div className="flex-1 text-sm">{error}</div>
          <Button variant="ghost" size="sm" onClick={load}>Thử lại</Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && data && filteredItems.length === 0 && (
        <EmptyState
          title="Không tìm thấy hợp đồng nào"
          description="Thử thay đổi bộ lọc hoặc năm khác."
        />
      )}

      {/* Table — desktop */}
      {!loading && !error && data && filteredItems.length > 0 && (
        <>
          <div
            className="hidden overflow-x-auto rounded-xl border md:block"
            style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}
          >
            <table className="w-full text-xs">
              <thead style={{ background: 'var(--surface-muted, #f1ece4)' }}>
                <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                  <SortHeader label="Số HĐ" columnKey="contract_no" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortHeader label="Đơn vị" columnKey="don_vi_ten" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Lĩnh vực</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Người thực hiện</th>
                  <SortHeader label="Ngày ký" columnKey="signed_date" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th className="sticky top-0 whitespace-nowrap px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Ngày bắt đầu</th>
                  <SortHeader label="Ngày kết thúc" columnKey="ngay_ket_thuc" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  {canViewMoney && (
                    <SortHeader label="Doanh thu chưa GTGT" columnKey="royalty_amount_before_vat" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
                  )}
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Loại ký</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Trạng thái</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium" style={{ background: 'var(--surface-muted, #f1ece4)' }}>GCN</th>
                  <th className="sticky top-0 px-3 py-2.5 font-medium text-center" style={{ background: 'var(--surface-muted, #f1ece4)' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, i) => (
                  <tr
                    key={item.id}
                    className="border-t transition-colors hover:bg-zinc-50"
                    style={{ borderColor: 'var(--border-default)' }}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      <button
                        type="button"
                        onClick={() => item.detail_url && (window.location.href = item.detail_url)}
                        className="text-left transition-colors hover:underline"
                        style={{ color: 'var(--accent-primary, #4A7202)' }}
                        title={`Mở chi tiết ${item.contract_number}`}
                      >
                        {item.contract_number}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 max-w-32 truncate" title={item.organization_name}>{item.organization_name}</td>
                    <td className="px-3 py-2.5 max-w-[140px] truncate" title={item.field}>{item.field}</td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate" title={item.owner_name ?? ''}>{item.owner_name ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(item.signed_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(item.start_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(item.end_date)}</td>
                    {canViewMoney && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <ContractValueCell item={item} />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" size="sm">
                        {SIGNING_LABELS[item.signing_bucket] ?? item.signing_bucket}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={item.contract_state === 'ACTIVE' ? 'success' : item.contract_state === 'EXPIRING' ? 'warning' : 'secondary'}
                        size="sm"
                      >
                        {STATE_LABELS[item.contract_state] ?? item.contract_state}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {item.gcn_number ? (
                        <span className="text-xs font-medium">{item.gcn_number}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => item.detail_url && (window.location.href = item.detail_url)}
                        title={`Mở chi tiết ${item.contract_number}`}
                      >
                        Xem
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards — mobile */}
          <div className="grid gap-3 md:hidden">
            {filteredItems.map(item => <ContractRowCard key={item.id} item={item} />)}
          </div>

          {/* Pagination */}
          <Pagination
            page={page}
            totalPages={data.total_pages}
            total={data.total}
            onPageChange={setPage}
            pageSize={PAGE_SIZE}
            rangeFrom={(page - 1) * PAGE_SIZE + 1}
            rangeTo={Math.min(page * PAGE_SIZE, data.total)}
          />
        </>
      )}
    </div>
  );
}
