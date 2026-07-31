import React, { useState } from 'react';
import { FileTextIcon, CopyIcon, CheckIcon } from 'lucide-react';
export function ContractNumberPreview({ contractNo }: {contractNo: string;}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(contractNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative overflow-hidden rounded-xl ring-1 ring-inset ring-amber-200/70 bg-white border-l-4 border-l-amber-400 shadow-sm">
      <div className="relative px-4 py-3.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="h-6 w-6 rounded-lg bg-amber-100 text-amber-600 inline-flex items-center justify-center ring-1 ring-inset ring-amber-200">
            <FileTextIcon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-600">
            Mã hợp đồng dự kiến
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[20px] leading-none font-semibold text-zinc-900 tracking-tight tabular-nums">
            {contractNo || <span className="text-zinc-400 italic font-normal text-sm">chưa có</span>}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!contractNo}
            className="h-8 w-8 rounded-lg bg-white ring-1 ring-inset ring-zinc-200 hover:ring-amber-400 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center text-zinc-500 hover:text-amber-600 shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-1"
            aria-label="Copy số hợp đồng">
            {copied
              ? <span className="text-lime-500"><CheckIcon className="h-3.5 w-3.5" /></span>
              : <CopyIcon className="h-3.5 w-3.5" />
            }
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed">
          Tự động ghép từ số thứ tự, năm, mã vùng, khu vực và lĩnh vực.
        </p>
      </div>
    </div>);
}