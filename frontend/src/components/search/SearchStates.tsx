import React from 'react';
import { SearchXIcon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '../app-ui/Button';

interface SearchEmptyStateProps {
  query: string;
  onClearFilters?: () => void;
}

export function SearchEmptyState({ query, onClearFilters }: SearchEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-in fade-in duration-300">
      {/* Icon */}
      <div className="h-16 w-16 rounded-full bg-zinc-100 flex items-center justify-center mb-5">
        <SearchXIcon className="h-8 w-8 text-zinc-400" />
      </div>
      
      {/* Title */}
      <h3 className="text-lg font-semibold text-zinc-700 mb-2">
        Không tìm thấy kết quả phù hợp
      </h3>
      
      {/* Description */}
      <p className="text-sm text-zinc-500 text-center max-w-md mb-5">
        {query ? (
          <>Không có kết quả nào cho "<strong className="text-zinc-700">{query}</strong>". Thử bỏ bớt bộ lọc hoặc tìm bằng số hợp đồng/tên đơn vị.</>
        ) : (
          <>Thử điều chỉnh từ khóa tìm kiếm hoặc bỏ bớt bộ lọc để xem thêm kết quả.</>
        )}
      </p>
      
      {/* Actions */}
      {onClearFilters && (
        <Button variant="secondary" leftIcon={<RefreshCwIcon className="h-4 w-4" />} onClick={onClearFilters}>
          Xóa bộ lọc
        </Button>
      )}
    </div>
  );
}

interface SearchErrorStateProps {
  error?: string;
  statusCode?: number;
  onRetry: () => void;
}

export function SearchErrorState({ error, statusCode, onRetry }: SearchErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-in fade-in duration-300">
      {/* Icon */}
      <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center mb-5">
        <AlertCircleIcon className="h-8 w-8 text-rose-500" />
      </div>
      
      {/* Title */}
      <h3 className="text-lg font-semibold text-zinc-700 mb-2">
        Không tải được kết quả tìm kiếm
      </h3>
      
      {/* Error details */}
      <p className="text-sm text-zinc-500 text-center max-w-md mb-2">
        {error || 'Đã xảy ra lỗi khi tải kết quả tìm kiếm.'}
      </p>
      
      {statusCode && (
        <p className="text-xs text-zinc-400 mb-5">
          Máy chủ trả về lỗi {statusCode}
        </p>
      )}
      
      {/* Actions */}
      <Button variant="primary" leftIcon={<RefreshCwIcon className="h-4 w-4" />} onClick={onRetry}>
        Thử lại
      </Button>
      
      {/* Dev note */}
      {import.meta.env.DEV && error && (
        <pre className="mt-4 p-3 bg-zinc-900 text-zinc-300 text-xs rounded-lg max-w-lg overflow-auto">
          {error}
        </pre>
      )}
    </div>
  );
}

interface SearchInitialStateProps {
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function SearchInitialState({ hasActiveFilters, onClearFilters }: SearchInitialStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-in fade-in duration-300">
      {/* Icon */}
      <div className="h-20 w-20 rounded-full bg-amber-50 flex items-center justify-center mb-6 border-2 border-dashed border-amber-200">
        <SearchXIcon className="h-10 w-10 text-amber-400" />
      </div>
      
      {/* Title */}
      <h3 className="text-xl font-semibold text-zinc-700 mb-3">
        Bắt đầu tìm kiếm
      </h3>
      
      {/* Description */}
      <p className="text-sm text-zinc-500 text-center max-w-lg mb-6">
        Nhập từ khóa để tìm kiếm hợp đồng, đơn vị, bảng hiệu, địa chỉ hoặc mã GCN trong workspace hiện tại.
      </p>
      
      {/* Quick tips */}
      <div className="bg-zinc-50 rounded-xl p-4 max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Mẹo tìm kiếm</p>
        <ul className="text-sm text-zinc-600 space-y-1.5">
          <li>Tìm theo <strong className="text-zinc-700">số hợp đồng</strong>: VD: 001/2026</li>
          <li>Tìm theo <strong className="text-zinc-700">tên đơn vị</strong>: VD: Công ty ABC</li>
          <li>Tìm theo <strong className="text-zinc-700">bảng hiệu</strong>: VD: Karaoke Sài Gòn</li>
          <li>Tìm theo <strong className="text-zinc-700">mã GCN</strong>: VD: GCN-2026-001</li>
        </ul>
      </div>
      
      {/* Clear filters if active */}
      {hasActiveFilters && (
        <div className="mt-6">
          <Button variant="secondary" onClick={onClearFilters}>
            Xóa bộ lọc đang áp dụng
          </Button>
        </div>
      )}
    </div>
  );
}
