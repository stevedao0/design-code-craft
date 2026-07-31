import React from 'react';

/**
 * FormSection — thẻ section chuẩn của app (nền trắng, nhấn xanh VCPMC).
 *
 * Tiêu đề dạng "1. Định danh hợp đồng" sẽ tự tách số thứ tự thành badge tròn
 * để mọi section có cùng nhịp thị giác. Padding co lại trên mobile.
 */
export function FormSection({
  id,
  title,
  description,
  actions,
  children,
  className = '',
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const match = /^\s*(\d+)\.\s*(.+)$/.exec(title);
  const step = match?.[1];
  const heading = match?.[2] ?? title;

  return (
    <section
      id={id}
      className={`relative overflow-hidden rounded-2xl border border-zinc-900/[0.07] bg-white shadow-[0_1px_2px_rgba(15,15,25,0.04)] transition-colors duration-200 focus-within:border-lime-700/40 hover:border-lime-700/30 ${className}`}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-zinc-900/[0.06] bg-[#FBFDF7] px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-start gap-3">
          {step && (
            <span className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime-700 text-[11px] font-bold text-white">
              {step}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-[13.5px] font-semibold tracking-tight text-zinc-900 sm:text-sm">
              {heading}
            </h3>
            {description && (
              <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-500 sm:text-xs">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
