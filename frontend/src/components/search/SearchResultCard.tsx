import React from 'react';
import { FileTextIcon, AwardIcon, FileDownIcon, ExternalLinkIcon, CopyIcon, CheckIcon } from 'lucide-react';

interface SearchResultCardProps {
  id: number;
  type: 'contract' | 'gcn' | 'annex' | 'dispatch' | 'partner';
  typeLabel: string;
  title: string;
  subtitle: string;
  brandName?: string;
  metadata: Array<{ label: string; value: string }>;
  onView: () => void;
  onCopyContractNo?: () => void;
  copied?: boolean;
  highlightedText?: string;
}

const TYPE_CONFIG = {
  contract: {
    icon: FileTextIcon,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-600',
    badgeBg: 'bg-amber-100 text-amber-700',
  },
  gcn: {
    icon: AwardIcon,
    bgColor: 'bg-lime-50',
    borderColor: 'border-lime-200',
    iconColor: 'text-lime-600',
    badgeBg: 'bg-lime-100 text-lime-700',
  },
  annex: {
    icon: FileDownIcon,
    bgColor: 'bg-lime-50',
    borderColor: 'border-lime-200',
    iconColor: 'text-lime-600',
    badgeBg: 'bg-lime-100 text-lime-700',
  },
  dispatch: {
    icon: FileDownIcon,
    bgColor: 'bg-lime-50',
    borderColor: 'border-lime-200',
    iconColor: 'text-lime-600',
    badgeBg: 'bg-lime-100 text-lime-700',
  },
  partner: {
    icon: FileTextIcon,
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    iconColor: 'text-rose-600',
    badgeBg: 'bg-rose-100 text-rose-700',
  },
} as const;

function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword || !keyword.trim()) {
    return <>{text}</>;
  }

  try {
    // Escape special regex characters
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <mark key={i} className="bg-amber-200/70 text-amber-900 rounded px-0.5 py-0.5 not-italic">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

export function SearchResultCard({
  type,
  typeLabel,
  title,
  subtitle,
  brandName,
  metadata,
  onView,
  onCopyContractNo,
  copied,
  highlightedText = '',
}: SearchResultCardProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <div
      className={`group relative ${config.bgColor} ${config.borderColor} border rounded-xl p-5 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 cursor-pointer`}
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onView()}
    >
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div className={`shrink-0 w-10 h-10 ${config.bgColor} ${config.iconColor} rounded-lg flex items-center justify-center border ${config.borderColor}`}>
          <Icon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Type badge + Title (Số hợp đồng) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${config.badgeBg}`}>
              {typeLabel}
            </span>
            <h3 className="text-[15px] font-semibold text-zinc-900 font-mono tracking-tight">
              <HighlightedText text={title} keyword={highlightedText} />
            </h3>
          </div>

          {/* Tên đơn vị */}
          {subtitle && (
            <p className="mt-1.5 text-[14px] font-medium text-zinc-800 truncate">
              <HighlightedText text={subtitle} keyword={highlightedText} />
            </p>
          )}

          {/* Bảng hiệu */}
          {brandName && (
            <p className="mt-0.5 text-[12px] text-zinc-500 truncate">
              <span className="text-amber-600">Bảng hiệu:</span>{' '}
              <HighlightedText text={brandName} keyword={highlightedText} />
            </p>
          )}

          {/* Metadata row */}
          {metadata.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {metadata.map((item, i) => (
                <span key={i} className="text-[12px] text-zinc-500">
                  <span className="font-medium text-zinc-600">{item.label}:</span>{' '}
                  <span className="text-zinc-700">{item.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {onCopyContractNo && (
            <button
              type="button"
              onClick={onCopyContractNo}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              title="Copy số hợp đồng"
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-lime-500" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onView}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
          >
            Xem chi tiết
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
