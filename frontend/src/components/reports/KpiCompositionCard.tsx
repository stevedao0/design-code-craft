/**
 * KPI Composition Card — "KPI tổng = tổng KPI các lĩnh vực".
 *
 * Trình bày rõ ràng cách một nhân viên có nhiều lĩnh vực (Karaoke, Khu vui chơi, ...)
 * cộng dồn thành KPI năm:
 *   - Dải KPI tổng: mục tiêu năm, thực đạt, tiến độ, còn thiếu/vượt.
 *   - Thanh đóng góp xếp chồng: mỗi lĩnh vực chiếm bao nhiêu % doanh thu thực đạt.
 *   - Bảng cộng dồn từng lĩnh vực (mục tiêu · thực đạt · tiến độ · còn thiếu · số HĐ · tỷ trọng).
 *   - Dòng "Cộng" khớp đúng tổng backend trả về (không tự tính lại tiền).
 */
import React from 'react';
import type { KpiFieldResult, KpiFieldTotals } from '@/lib/kpiFieldClient';
import { fmtVND, fmtNum } from './kpiClient';

export const KPI_FIELD_COLORS = [
  '#4A7202', '#A16207', '#76B400', '#C08A2E',
  '#2F6F3E', '#7C5010', '#8FB33B', '#D9B166',
];

export function kpiFieldColor(index: number): string {
  return KPI_FIELD_COLORS[index % KPI_FIELD_COLORS.length];
}

interface Props {
  year: number;
  fields: KpiFieldResult[];
  totals?: KpiFieldTotals | null;
  canViewMoney?: boolean;
  /** Tên hiển thị của người được tính KPI (email hoặc họ tên). */
  subject?: string;
  selectedField?: string | null;
  onFieldSelect?: (code: string) => void;
}

function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

export function KpiCompositionCard({
  year, fields, totals, canViewMoney = true, subject,
  selectedField = null, onFieldSelect,
}: Props) {
  const money = (v: number | null | undefined) => (canViewMoney ? fmtVND(v ?? 0) : '—');

  const totalTarget = totals?.target_amount ?? fields.reduce((s, f) => s + (f.target || 0), 0);
  const totalActual = totals?.actual_amount ?? fields.reduce((s, f) => s + (f.actual || 0), 0);
  const totalValued = fields.reduce((s, f) => s + (f.valued_contract_count || 0), 0);
  const totalUnresolved = fields.reduce((s, f) => s + (f.unresolved_value_count || 0), 0);
  const totalCount = (totals?.contract_count ?? null) != null
    ? totals!.contract_count
    : totalValued + totalUnresolved;
  const completion = totals?.completion_percent ?? (totalTarget > 0 ? (totalActual / totalTarget) * 100 : null);
  const exceededAmount = (totals?.exceeded_amount ?? 0) || Math.max(totalActual - totalTarget, 0);
  const remainingAmount = totals?.missing_amount ?? Math.max(totalTarget - totalActual, 0);
  const isExceeded = exceededAmount > 0;

  if (fields.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm"
        style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
        Chưa có KPI lĩnh vực nào được thiết lập cho năm {year}.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}>
      {/* Header + tổng hợp */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b px-4 py-3 sm:flex sm:flex-wrap sm:justify-between"
        style={{
          borderColor: 'var(--border-soft)',
          background: 'linear-gradient(90deg, color-mix(in srgb, #76B400 12%, white), var(--surface) 70%)',
        }}>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            KPI năm {year} · cộng dồn theo lĩnh vực
          </div>
          <div className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {fields.length} KPI lĩnh vực{subject ? ` · ${subject}` : ''}
          </div>
          <div className="mt-0.5 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            Số liệu = tổng doanh thu các hợp đồng thuộc lĩnh vực được giao (toàn đơn vị, không lọc theo nhân viên).
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Tiến độ tổng</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: '#4A7202' }}>
            {completion === null ? '—' : `${completion.toFixed(1)}%`}
          </div>
        </div>
      </header>

      {/* 4 số tổng */}
      <div className="grid gap-px sm:grid-cols-4" style={{ background: 'var(--border-soft)' }}>
        {[
          {
            label: 'Mục tiêu năm (Σ lĩnh vực)',
            value: totalTarget > 0 ? money(totalTarget) : 'Chưa thiết lập',
            tone: 'var(--text-primary)',
          },
          {
            label: 'Thực đạt (chưa Thuế GTGT)',
            value: money(totalActual),
            tone: '#4A7202',
          },
          {
            label: totalTarget > 0 ? (isExceeded ? 'Vượt mục tiêu' : 'Còn thiếu') : 'Chưa thiết lập target',
            value: totalTarget > 0 ? money(isExceeded ? exceededAmount : remainingAmount) : '—',
            tone: totalTarget > 0 ? (isExceeded ? 'var(--accent-success)' : 'var(--accent-warning)') : 'var(--text-muted)',
          },
          {
            label: 'Số HĐ (KPI lĩnh vực)',
            value: fmtNum(totalCount),
            tone: 'var(--text-primary)',
            sub: totalUnresolved > 0
              ? `${fmtNum(totalValued)} có giá trị · ${fmtNum(totalUnresolved)} chưa giải quyết`
              : `${fmtNum(totalValued)} có giá trị`,
          },
        ].map(c => (
          <div key={c.label} className="px-4 py-3" style={{ background: 'var(--surface)' }}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{c.label}</div>
            <div className="mt-1 truncate text-[17px] font-bold tabular-nums" style={{ color: c.tone }}>{c.value}</div>
            {c.sub ? (
              <div className="mt-1 truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{c.sub}</div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Thanh đóng góp xếp chồng */}
      <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Tỷ trọng đóng góp doanh thu thực đạt
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-soft)' }}>
          {fields.map((f, i) => {
            const w = pct(f.actual || 0, totalActual);
            if (w <= 0) return null;
            return (
              <button
                key={f.field_code}
                type="button"
                title={`${f.field_label}: ${w.toFixed(1)}%`}
                aria-label={`${f.field_label} chiếm ${w.toFixed(1)}%`}
                onClick={() => onFieldSelect?.(f.field_code)}
                className="h-full transition-opacity hover:opacity-80"
                style={{
                  width: `${w}%`,
                  background: kpiFieldColor(i),
                  opacity: selectedField && selectedField !== f.field_code ? 0.35 : 1,
                }}
              />
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {fields.map((f, i) => (
            <span key={f.field_code} className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: kpiFieldColor(i) }} />
              {f.field_label} · {pct(f.actual || 0, totalActual).toFixed(1)}%
            </span>
          ))}
        </div>
      </div>

      {/* Bảng cộng dồn */}
      <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--border-soft)' }}>
        <table className="w-full text-[12.5px]" style={{ minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'color-mix(in srgb, #76B400 10%, white)' }}>
              <th className="px-4 py-2 text-left font-semibold" style={{ color: '#4A7202' }}>Lĩnh vực</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: '#4A7202' }}>Mục tiêu</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: '#4A7202' }}>Thực đạt</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: '#4A7202' }}>Tiến độ</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: '#4A7202' }}>Còn thiếu / Vượt</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: '#4A7202' }}>Số HĐ</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const isSel = selectedField === f.field_code;
              const over = (f.exceeded || 0) > 0;
              return (
              <tr
                key={`${f.field_code}-${(f.kpi_group_code || f.field_code)}`}
                onClick={() => onFieldSelect?.(f.field_code)}
                className={onFieldSelect ? 'cursor-pointer' : undefined}
                style={{
                  background: isSel
                    ? 'color-mix(in srgb, #76B400 8%, white)'
                    : i % 2 === 1 ? 'color-mix(in srgb, #76B400 3%, white)' : 'var(--surface)',
                  borderTop: '1px solid var(--border-soft)',
                }}>
                  <td className="px-4 py-2">
                    <span className="inline-flex flex-col items-start gap-0.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: kpiFieldColor(i) }} />
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{f.field_label}</span>
                        {!f.is_active && (
                          <span className="rounded px-1.5 py-0.5 text-[10px]"
                            style={{ background: 'var(--border-soft)', color: 'var(--text-muted)' }}>Tạm dừng</span>
                        )}
                      </span>
                      {Array.isArray(f.member_field_codes) && f.member_field_codes.length > 1 && (
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Bao gồm: {f.member_field_codes.join(', ')}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {f.has_target && f.target > 0 ? money(f.target) : 'Chưa giao'}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {money(f.actual)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: (f.progress_percent || 0) >= 100 ? 'var(--accent-success)' : 'var(--text-primary)' }}>
                    {f.has_target && f.target > 0 ? `${(f.progress_percent || 0).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums"
                    style={{ color: over ? 'var(--accent-success)' : 'var(--accent-warning)' }}>
                    {f.has_target && f.target > 0 ? money(over ? f.exceeded : f.remaining) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    <div>{fmtNum(f.contract_count)}</div>
                    {f.unresolved_value_count > 0 ? (
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {fmtNum(f.valued_contract_count || 0)} có giá trị
                        <br />{fmtNum(f.unresolved_value_count)} chưa rõ
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: 'color-mix(in srgb, #76B400 14%, white)', borderTop: '2px solid #76B400' }}>
              <td className="px-4 py-2.5 font-bold" style={{ color: '#4A7202' }}>Cộng KPI năm {year}</td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums" style={{ color: '#4A7202' }}>
                {totalTarget > 0 ? money(totalTarget) : 'Chưa thiết lập'}
              </td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums" style={{ color: '#4A7202' }}>{money(totalActual)}</td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums" style={{ color: '#4A7202' }}>
                {completion === null ? '—' : `${completion.toFixed(1)}%`}
              </td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums" style={{ color: '#4A7202' }}>
                {totalTarget > 0 ? money(isExceeded ? exceededAmount : remainingAmount) : '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums" style={{ color: '#4A7202' }}>
                <div>{fmtNum(totalCount)}</div>
                {totalUnresolved > 0 ? (
                  <div className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>
                    {fmtNum(totalValued)} có giá trị · {fmtNum(totalUnresolved)} chưa rõ
                  </div>
                ) : null}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t px-4 py-2 text-[11px]" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}>
        KPI lĩnh vực tính trên toàn bộ hợp đồng canonical của đơn vị trong năm {year} (không lọc theo nhân viên thực hiện).
        Cộng KPI năm {year} = Σ KPI các lĩnh vực được giao.
        {totalUnresolved > 0 ? ` Có ${totalUnresolved} hợp đồng trong phạm vi lĩnh vực KPI nhưng chưa giải quyết được giá trị chưa Thuế GTGT — xem danh sách dưới.` : ''}
      </p>
    </section>
  );
}
