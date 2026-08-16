/**
 * UrbanModeSelector — chọn phương thức áp dụng tỷ lệ đô thị trong bảng tính
 * tiền bản quyền âm nhạc (nghiệp vụ nội bộ, không xuất ra file gửi khách).
 *
 *  Phương thức 1 (mặc định): cộng tiền các bậc → × tỷ lệ đô thị → thuế GTGT
 *  Phương thức 2:            × tỷ lệ đô thị trên từng bậc → cộng → thuế GTGT
 *
 * Tỷ lệ đô thị luôn nhân vào TIỀN, không bao giờ nhân vào diện tích/số lượng,
 * nên hai phương thức cho cùng một tổng.
 */
import React from 'react';
import { URBAN_MODE_OPTIONS, type UrbanApplicationMode } from '../../lib/pricingSnapshot';


const LINE = '#E7EDE1';
const BRAND = '#4A7202';

export function UrbanModeSelector({
  value,
  onChange,
  note,
  className = '',
}: {
  value: UrbanApplicationMode;
  onChange: (mode: UrbanApplicationMode) => void;
  /** Ghi chú phụ hiển thị dưới bộ chọn (vd: cảnh báo Karaoke). */
  note?: string | null;
  className?: string;
}) {
  const active = URBAN_MODE_OPTIONS.find((o) => o.id === value) ?? URBAN_MODE_OPTIONS[0];

  return (
    <section
      className={`rounded-xl border overflow-hidden ${className}`}
      style={{ borderColor: LINE, background: '#fff' }}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 mr-auto">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND }}>
            Cách áp dụng đô thị
          </div>
          <div className="text-[11.5px] mt-0.5 text-zinc-500">{active.hint}</div>
        </div>

        <div
          role="radiogroup"
          aria-label="Cách áp dụng hệ số đô thị"
          className="inline-flex rounded-[10px] p-1 gap-1"
          style={{ background: '#F6FAF0', border: `1px solid ${LINE}` }}
        >
          {URBAN_MODE_OPTIONS.map((opt) => {
            const on = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(opt.id)}
                title={opt.hint}
                className="h-8 px-3 rounded-[8px] text-[12px] font-semibold transition-colors whitespace-nowrap"
                style={{
                  background: on ? BRAND : 'transparent',
                  color: on ? '#fff' : '#5F6B58',
                }}
              >
                {opt.short} · {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {note && (
        <div
          className="px-4 py-2 text-[11.5px] border-t"
          style={{ borderColor: LINE, background: '#FFFBEB', color: '#92400E' }}
        >
          {note}
        </div>
      )}
    </section>
  );
}
