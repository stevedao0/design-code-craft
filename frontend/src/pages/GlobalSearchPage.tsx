import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchIcon, LoaderIcon } from 'lucide-react';
import { Page, PageHeader } from '../components/app-ui/Page';
import { Button } from '../components/app-ui/Button';
import { Select } from '../components/app-ui/Select';

import { SearchSuggestions } from '../components/search/SearchSuggestions';
import { SearchResultCard } from '../components/search/SearchResultCard';
import { SearchResultSkeleton } from '../components/search/SearchResultSkeleton';
import { SearchEmptyState, SearchErrorState, SearchInitialState } from '../components/search/SearchStates';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { RouteKey } from '../data/routes';
import {
  CONTRACT_YEAR_OPTIONS,
  LINH_VUC_OPTIONS,
  STATUS_OPTIONS,
  StatusFilter,
} from '../data/contractOptions';
import {
  ApiContractItem,
  getContracts,
} from '../lib/contractsClient';
import { useAuth } from '../lib/auth';
import { TOKEN_KEY } from '../lib/authClient';
import { formatDate, formatCurrency } from '../lib/format';
import { getExpiryStatus } from '../data/contractRecords';

// Search scope types
export type SearchScope = 'contracts' | 'gcn' | 'annex' | 'dispatch' | 'partner';

// NOTE: Search V1 chỉ hỗ trợ Hợp đồng (API: /api/contracts)
// Các scope khác (GCN, Phụ lục, Công văn, Đối tác) chờ backend API

const SCOPE_OPTIONS = [
  { value: 'contracts' as const, label: 'Hợp đồng' },
  // These are disabled until backend supports them
  { value: 'gcn' as const, label: 'GCN', disabled: true, disabledReason: 'Chưa có API tìm kiếm GCN' },
  { value: 'annex' as const, label: 'Phụ lục', disabled: true, disabledReason: 'Chưa có API phụ lục' },
  { value: 'dispatch' as const, label: 'Công văn', disabled: true, disabledReason: 'Chưa có API công văn' },
  { value: 'partner' as const, label: 'Đối tác', disabled: true, disabledReason: 'Chưa có API đối tác' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
];

const PAGE_SIZE_OPTIONS = [
  { value: '30', label: '30 / trang' },
  { value: '60', label: '60 / trang' },
  { value: '90', label: '90 / trang' },
  { value: '120', label: '120 / trang' },
];

// Convert API item to search result
interface SearchResult {
  id: number;
  type: 'contract' | 'gcn' | 'annex' | 'dispatch' | 'partner';
  typeLabel: string;
  title: string;
  subtitle: string;
  brandName?: string;
  address?: string;
  metadata: Array<{ label: string; value: string }>;
  contractNo?: string;
  raw: ApiContractItem;
}

function toSearchResult(item: ApiContractItem): SearchResult {
  const expiryStatus = getExpiryStatus(item.end_date || '');
  const startFormatted = item.start_date ? formatDate(item.start_date) : null;
  const endFormatted = item.end_date ? formatDate(item.end_date) : null;
  
  // Build dates string
  let datesStr = '-';
  if (startFormatted && endFormatted) {
    datesStr = `${startFormatted} → ${endFormatted}`;
  } else if (startFormatted) {
    datesStr = `Từ ${startFormatted}`;
  } else if (endFormatted) {
    datesStr = `Đến ${endFormatted}`;
  }
  
  return {
    id: Number(item.id),
    type: 'contract',
    typeLabel: 'Hợp đồng',
    title: item.contract_no || `HĐ-${item.id}`,
    subtitle: item.customer_name || '',
    brandName: item.ten_bang_hieu || undefined,
    address: item.dia_chi_su_dung || undefined,
    metadata: [
      { label: 'Lĩnh vực', value: item.domain || '-' },
      { label: 'Trạng thái', value: expiryStatus.label || '-' },
      { label: 'Mã quyền', value: item.field_code || '-' },
      { label: 'Hiệu lực', value: datesStr },
      ...(item.so_tien_value ? [{ label: 'Giá trị', value: formatCurrency(item.so_tien_value) }] : []),
    ],
    contractNo: item.contract_no,
    raw: item,
  };
}

interface GlobalSearchPageProps {
  onNavigate: (key: RouteKey) => void;
  onOpenDetail: (id: number) => void;
}

export function GlobalSearchPage({ onNavigate, onOpenDetail }: GlobalSearchPageProps) {
  useAuth();

  // Search state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('contracts');
  const [year, setYear] = useState('');
  const [linhVuc, setLinhVuc] = useState('');
  const [status, setStatus] = useState<StatusFilter | ''>('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  // Results state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorStatusCode, setErrorStatusCode] = useState<number | undefined>(undefined);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<Array<{ id: string; type: 'history' | 'contract' | 'partner'; label: string; sublabel?: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Copy state for result cards
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Search history
  const { history, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  // Input ref for focus management
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Debounce for suggestions (slightly faster)
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;

        // Use existing contracts API for suggestions
        const data = await getContracts(token, {
          q: query,
          page: 1,
          page_size: 5,
        });

        const newSuggestions = data.items.slice(0, 5).map((item) => ({
          id: `contract-${item.id}`,
          type: 'contract' as const,
          label: item.contract_no || `HĐ-${item.id}`,
          sublabel: item.customer_name || '',
        }));

        setSuggestions(newSuggestions);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Perform search when filters or query change
  useEffect(() => {
    // Don't search if no query and no filters
    if (!debouncedQuery && !year && !linhVuc && !status) {
      return;
    }

    let cancelled = false;

    async function performSearch() {
      setLoading(true);
      setError('');
      setErrorStatusCode(undefined);

      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
          throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
        }

        const data = await getContracts(token, {
          q: debouncedQuery.trim() || undefined,
          page,
          page_size: pageSize,
          domain: linhVuc.trim() || undefined,
          status: status || undefined,
          year: year || undefined,
        });

        if (cancelled) return;

        // Only show contracts for now (other scopes not supported)
        const contractResults = data.items.map(toSearchResult);
        
        // Sort if needed (newest first is default from API)
        if (sort === 'oldest') {
          contractResults.reverse();
        }

        setResults(contractResults);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 0);
        setHasSearched(true);

        // Add to search history if query was meaningful
        if (debouncedQuery.trim()) {
          addToHistory(debouncedQuery);
        }
      } catch (err: any) {
        if (cancelled) return;
        
        const errorMessage = String(err?.message || 'Không tải được kết quả tìm kiếm.');
        setError(errorMessage);
        setResults([]);
        setTotal(0);
        setTotalPages(0);
        
        // Extract status code if available
        if (err?.response?.status) {
          setErrorStatusCode(err.response.status);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    performSearch();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, year, linhVuc, status, page, pageSize, sort, addToHistory]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, year, linhVuc, status]);

  // Handle search submit
  const handleSearch = useCallback(() => {
    setShowSuggestions(false);
    setPage(1);
  }, []);

  // Handle keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle suggestion selection
  const handleSelectSuggestion = useCallback((suggestion: { id: string; type: string; label: string; sublabel?: string }) => {
    if (suggestion.type === 'history') {
      setQuery(suggestion.label);
      setDebouncedQuery(suggestion.label);
    } else if (suggestion.type === 'contract') {
      // Extract ID and open detail
      const id = parseInt(suggestion.id.replace('contract-', ''), 10);
      if (!isNaN(id)) {
        onOpenDetail(id);
      }
    }
    setShowSuggestions(false);
  }, [onOpenDetail]);

  // Handle history selection
  const handleSelectHistory = useCallback((historyQuery: string) => {
    setQuery(historyQuery);
    setDebouncedQuery(historyQuery);
    setShowSuggestions(false);
  }, []);

  // Handle copy contract number
  const handleCopyContractNo = useCallback(async (contractNo: string, id: number) => {
    try {
      await navigator.clipboard.writeText(contractNo);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = contractNo;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  // Handle result click
  const handleViewDetail = useCallback((id: number) => {
    onOpenDetail(id);
  }, [onOpenDetail]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setYear('');
    setLinhVuc('');
    setStatus('');
    setPage(1);
  }, []);

  const hasActiveFilters = !!year || !!linhVuc || !!status;

  // Calculate range for pagination
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === 0 ? 0 : Math.min(page * pageSize, total);

  // Determine what to show
  const showInitial = !hasSearched && !loading;
  const showLoading = loading && !hasSearched;
  const showResults = hasSearched && !loading && results.length > 0;
  const showEmpty = hasSearched && !loading && results.length === 0 && !error;
  const showError = hasSearched && !loading && !!error;

  return (
    <Page>
      <PageHeader
        breadcrumb="/bg/search"
        title="Tìm kiếm"
        description="Tìm nhanh hợp đồng theo số hợp đồng, tên đơn vị, bảng hiệu, lĩnh vực và trạng thái."
      />

      {/* Main Search Card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 mb-6">
        {/* Search Input */}
        <div className="relative mb-5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
                if (e.key === 'Escape') setShowSuggestions(false);
              }}
              placeholder="Tìm số hợp đồng, tên đơn vị, bảng hiệu, địa chỉ, mã GCN..."
              className="w-full h-12 pl-12 pr-32 text-base rounded-xl bg-zinc-50 border border-zinc-200 placeholder:text-zinc-400 hover:bg-white hover:border-zinc-300 focus:bg-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
              aria-label="Tìm kiếm"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {loading && (
                <LoaderIcon className="h-5 w-5 text-amber-600 animate-spin" />
              )}
              <kbd className="hidden sm:inline-flex items-center px-2 py-1 h-6 text-[11px] font-medium text-zinc-500 bg-zinc-100 border border-zinc-200 rounded">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Suggestions Dropdown */}
          <SearchSuggestions
            query={query}
            suggestions={suggestions}
            history={history}
            onSelectSuggestion={handleSelectSuggestion}
            onSelectHistory={handleSelectHistory}
            onClearHistory={clearHistory}
            onRemoveHistory={removeFromHistory}
            visible={showSuggestions}
            loading={suggestionsLoading}
          />
        </div>

        {/* Scope Tabs — only real types from API */}
        <div className="flex flex-wrap gap-2 mb-5">
          {SCOPE_OPTIONS.filter((o) => !o.disabled).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                scope === option.value
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-zinc-500">Năm:</span>
            <Select
              value={year}
              onChange={setYear}
              options={CONTRACT_YEAR_OPTIONS}
              placeholder="Tất cả"
              className="w-28"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-zinc-500">Lĩnh vực:</span>
            <Select
              value={linhVuc}
              onChange={setLinhVuc}
              options={LINH_VUC_OPTIONS}
              placeholder="Tất cả"
              className="w-36"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-zinc-500">Trạng thái:</span>
            <Select
              value={status}
              onChange={(v) => setStatus(v as StatusFilter | '')}
              options={STATUS_OPTIONS}
              placeholder="Tất cả"
              className="w-36"
            />
          </div>


          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[12px] font-medium text-zinc-500">Sắp xếp:</span>
            <Select
              value={sort}
              onChange={(v) => setSort(v as 'newest' | 'oldest')}
              options={SORT_OPTIONS}
              className="w-28"
            />
          </div>

          {hasActiveFilters && (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Xóa lọc
            </Button>
          )}
        </div>
      </div>

      {/* Results Area */}
      <div className="space-y-4">
        {/* Results Header */}
        {showResults && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-600">
                Hiển thị{' '}
                <span className="font-semibold text-zinc-900">{rangeFrom}–{rangeTo}</span>{' '}
                trong{' '}
                <span className="font-semibold text-zinc-900">{total.toLocaleString()}</span>{' '}
                kết quả
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[12px] text-zinc-500">Số trang:</span>
              <Select
                value={String(pageSize)}
                onChange={(v) => {
                  setPageSize(parseInt(v, 10));
                  setPage(1);
                }}
                options={PAGE_SIZE_OPTIONS}
                className="w-28"
              />
            </div>
          </div>
        )}

        {/* Loading Skeletons */}
        {showLoading && <SearchResultSkeleton count={5} />}

        {/* Initial State */}
        {showInitial && (
          <SearchInitialState hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters} />
        )}

        {/* Results List */}
        {showResults && (
          <div className="space-y-3" role="list" aria-label="Kết quả tìm kiếm">
            {results.map((result, index) => (
              <div
                key={result.id}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}
                role="listitem"
              >
                <SearchResultCard
                  id={result.id}
                  type={result.type}
                  typeLabel={result.typeLabel}
                  title={result.title}
                  subtitle={result.subtitle}
                  brandName={result.brandName}
                  metadata={result.metadata}
                  highlightedText={debouncedQuery}
                  onView={() => handleViewDetail(result.id)}
                  onCopyContractNo={result.contractNo ? () => handleCopyContractNo(result.contractNo!, result.id) : undefined}
                  copied={copiedId === result.id}
                />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {showEmpty && (
          <SearchEmptyState query={debouncedQuery} onClearFilters={hasActiveFilters ? clearFilters : undefined} />
        )}

        {/* Error State */}
        {showError && (
          <SearchErrorState error={error} statusCode={errorStatusCode} onRetry={() => {
            // Retry the search
            setDebouncedQuery(debouncedQuery);
          }} />
        )}

        {/* Pagination */}
        {showResults && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Trang trước
            </Button>

            <span className="px-4 py-2 text-sm text-zinc-600">
              Trang <span className="font-semibold">{page}</span> / <span className="font-semibold">{totalPages}</span>
            </span>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Trang sau
            </Button>
          </div>
        )}

      </div>
    </Page>
  );
}
