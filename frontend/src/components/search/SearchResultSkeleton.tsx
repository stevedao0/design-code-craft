import React from 'react';

interface SearchResultSkeletonProps {
  count?: number;
}

export function SearchResultSkeleton({ count = 5 }: SearchResultSkeletonProps) {
  return (
    <div className="space-y-3" role="status" aria-label="Đang tải kết quả tìm kiếm">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-zinc-200 p-5 animate-pulse"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="flex items-start gap-4">
            {/* Icon skeleton */}
            <div className="h-10 w-10 rounded-lg bg-zinc-200 shrink-0" />
            
            {/* Content skeleton */}
            <div className="flex-1 space-y-2.5">
              {/* Type badge + Title row */}
              <div className="flex items-center gap-2">
                <div className="h-5 w-20 rounded-full bg-zinc-200" />
                <div className="h-5 w-48 rounded bg-zinc-200" />
              </div>
              
              {/* Subtitle */}
              <div className="h-4 w-64 rounded bg-zinc-100" />
              
              {/* Metadata row */}
              <div className="flex items-center gap-3 pt-1">
                <div className="h-4 w-20 rounded bg-zinc-100" />
                <div className="h-4 w-24 rounded bg-zinc-100" />
                <div className="h-4 w-16 rounded bg-zinc-100" />
                <div className="h-4 w-28 rounded bg-zinc-100" />
              </div>
            </div>
            
            {/* Action skeleton */}
            <div className="h-8 w-24 rounded-lg bg-zinc-100 shrink-0" />
          </div>
        </div>
      ))}
      <span className="sr-only">Đang tải kết quả tìm kiếm...</span>
    </div>
  );
}
