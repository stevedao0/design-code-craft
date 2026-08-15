/**
 * KaraokePricingWorkspace — reusable pricing panel shown inside
 * the RoyaltyCalculatorFab when opened from Create Contract.
 *
 * Renders a clean quote-style table matching Nghị định 17/2023 tiers
 * (4 phòng đầu / 6 phòng sau / phòng còn lại) with base salary from
 * Nghị định 161/2026/NĐ-CP (2.530.000 đ, Điều 3 khoản 2).
 *
 * Table uses Word-like styling: Times New Roman 11pt, Word-compatible borders.
 *
 * SIMPLIFIED FLOW: Calculator is for:
 * - Viewing calculation results
 * - Copying table / summary
 * - Viewing/exporting quotes
 * - "Chốt 3 số tiền" to sync totals to contract draft
 *
 * "Chốt 3 số tiền" syncs: Cộng, Thuế GTGT, Tổng giá trị
 * into draft.areaBased fields. NO tier rows, NO DOCX table fill.
 */
import React, { useMemo, useState } from 'react';
import { CopyIcon, RotateCcwIcon, CalculatorIcon } from 'lucide-react';
import {
  BASE_SALARY_LEGAL_NOTE,
  DEFAULT_BASE_SALARY,
  DEFAULT_VAT_RATE,
  KARAOKE_AREA_LABEL,
  buildKaraokePricingSnapshot,
  copyRichAndPlain,
  formatCoef,
  formatVND,
  getSupportRateLabel,
  snapshotSummaryText,
  snapshotToHTMLTable,
  snapshotToPlainText,
  type KaraokeAreaGroup,
  type PricingSnapshot,
} from '../../lib/pricingSnapshot';

const NAVY = '#4A7202';
const CREAM = '#F6FAF1';
const LINE = '#E7EDE1';
const SERIF: React.CSSProperties = { fontFamily: '"Cormorant Garamond", Georgia, serif' };

export type KaraokeWorkspaceContext = {
  totalRooms?: number;
  areaGroup?: KaraokeAreaGroup;
  months?: number;
  vatRate?: number;
  baseSalary?: number;
  customerName?: string;
  signboard?: string;
};

type Props = {
  context: KaraokeWorkspaceContext;
  /** Called when user confirms amounts (copy/use for reference) */
  onConfirmAmounts?: (snapshot: PricingSnapshot) => void;
};

// ─── Table column widths (must total ~100%) ────────────────────────────────
// Col1: Số lượng phòng (rowspan)    ~13%
// Col2: Tier label                  ~22%
// Col3: MLCS (2.530.000 đ)         ~15%
// Col4: ×                          ~4%
// Col5: Hệ số                     ~9%
// Col6: Đơn vị (phòng/năm)       ~16%
// Col7: Thành tiền                ~21%
// Table min-width: 860px

type CellStyle = React.CSSProperties;
const cellBase: CellStyle = { border: '1px solid #000', padding: '8px 10px', verticalAlign: 'middle' };
const cellHeader: CellStyle = {
  background: NAVY, color: '#fff', border: `1px solid ${NAVY}`,
  padding: '8px 10px', fontFamily: '"Times New Roman", Times, serif',
  fontSize: '11pt', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle',
};
const cellThRight: CellStyle = {
  ...cellHeader, textAlign: 'right', width: '21%',
};
const cellThLeft: CellStyle = {
  ...cellHeader, textAlign: 'center', width: '13%',
};
const cellThMid: CellStyle = {
  ...cellHeader, textAlign: 'center',
};
const cellNavy: CellStyle = {
  background: NAVY, color: '#fff', border: `1px solid ${NAVY}`,
  padding: '10px', fontFamily: '"Times New Roman", Times, serif',
  fontSize: '11pt', fontWeight: 700, textAlign: 'right', verticalAlign: 'middle',
};
const cellPale: CellStyle = {
  background: '#f5f5f5', border: '1px solid #E7EDE1',
  padding: '8px 10px', fontFamily: '"Times New Roman", Times, serif',
  fontSize: '11pt', verticalAlign: 'middle',
};
const cellWhite: CellStyle = {
  background: '#fff', border: '1px solid #E7EDE1',
  padding: '8px 10px', fontFamily: '"Times New Roman", Times, serif',
  fontSize: '11pt', verticalAlign: 'middle',
};
const cellItalic: CellStyle = {
  background: '#fff', border: '1px solid #E7EDE1',
  padding: '8px 10px', fontFamily: '"Times New Roman", Times, serif',
  fontSize: '11pt', fontStyle: 'italic', verticalAlign: 'middle',
};

export function KaraokePricingWorkspace({ context, onConfirmAmounts }: Props) {
  const [rooms, setRooms] = useState<number>(context.totalRooms ?? 0);
  const [areaGroup, setAreaGroup] = useState<KaraokeAreaGroup>(context.areaGroup ?? 'FROM_20_TO_30');
  const [months, setMonths] = useState<number>(context.months ?? 12);
  const [vatPct, setVatPct] = useState<number>((context.vatRate ?? DEFAULT_VAT_RATE) * 100);
  const [baseSalary, setBaseSalary] = useState<number>(context.baseSalary ?? DEFAULT_BASE_SALARY);
  const [supportRatePct, setSupportRatePct] = useState<number>(100);
  const [toast, setToast] = useState<string | null>(null);

  const snapshot = useMemo(
    () =>
      buildKaraokePricingSnapshot({
        totalRooms: rooms,
        areaGroup,
        months,
        vatRate: vatPct / 100,
        baseSalary,
        contextLabel:
          context.customerName || context.signboard
            ? `${context.customerName ?? ''}${context.signboard ? ` · ${context.signboard}` : ''} · ${rooms} phòng · ${months} tháng`
            : undefined,
        supportRatePercent: supportRatePct,
      }),
    [rooms, areaGroup, months, vatPct, baseSalary, context.customerName, context.signboard, supportRatePct],
  );

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const URBAN_MODE_NOTE =
    'Karaoke tính theo số phòng nên hai cách áp dụng đô thị (Cách 1 — sau khi cộng tiền bậc, Cách 2 — trước khi chia bậc) cho cùng kết quả; bảng này dùng Cách 1.';

  const handleCopyTable = async () => {
    const ok = await copyRichAndPlain(
      `${snapshotToHTMLTable(snapshot)}<p>${URBAN_MODE_NOTE}</p>`,
      `${snapshotToPlainText(snapshot)}\n${URBAN_MODE_NOTE}`,
    );
    flash(ok ? 'Đã copy bảng vào clipboard' : 'Copy thất bại — trình duyệt chặn quyền');
  };
  const handleCopySummary = async () => {
    const summary = `${snapshotSummaryText(snapshot)}\n${URBAN_MODE_NOTE}`;
    const ok = await copyRichAndPlain(`<pre>${summary}</pre>`, summary);
    flash(ok ? 'Đã copy tóm tắt' : 'Copy thất bại');
  };

  const hasRows = snapshot.rows.length > 0;

  return (
    <div
      className="grid gap-4 p-5 sm:p-6"
      style={{
        // Stacked by default. The aside (summary/actions) always goes BELOW the table.
        // Table min-width: 860px — it overflow-x into its own wrapper if needed,
        // but the workspace itself takes full width of the section.
        gridTemplateColumns: 'minmax(0, 1fr)',
        background: CREAM,
      }}
    >
      {/* TOP: inputs + table (takes full width) */}
      <div className="space-y-4 min-w-0">
        {/* Context / customer summary */}
        {(context.customerName || context.signboard) && (
          <div
            className="rounded-[10px] px-4 py-3 text-[13px]"
            style={{ background: '#fff', border: `1px solid ${LINE}`, color: '#333' }}
          >
            <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#8C877E' }}>
              Bối cảnh hợp đồng
            </div>
            <div className="mt-1 font-semibold" style={{ color: NAVY }}>
              {context.customerName || '—'}
              {context.signboard ? <span className="text-zinc-500 font-normal"> · {context.signboard}</span> : null}
            </div>
          </div>
        )}

        {/* Inputs */}
        <div className="rounded-[10px] p-4" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
          <div className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: NAVY }}>
            Thông số tính
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NumField label="Tổng số phòng" value={rooms} min={0} onChange={setRooms} suffix="phòng" />
            <SelectField
              label="Nhóm diện tích"
              value={areaGroup}
              onChange={(v) => setAreaGroup(v as KaraokeAreaGroup)}
              options={[
                { value: 'DEN_20', label: KARAOKE_AREA_LABEL.DEN_20 },
                { value: 'FROM_20_TO_30', label: KARAOKE_AREA_LABEL.FROM_20_TO_30 },
                { value: 'GT_30', label: KARAOKE_AREA_LABEL.GT_30 },
              ]}
            />
            <NumField label="Thời hạn HĐ" value={months} min={1} onChange={setMonths} suffix="tháng" />
            <NumField label="Thuế GTGT" value={vatPct} min={0} step={0.5} onChange={setVatPct} suffix="%" />
            <NumField label="Mức hỗ trợ thu (%)" value={supportRatePct} min={0} max={100} step={1} onChange={setSupportRatePct} suffix="%" />
            <NumField
              label="Mức lương cơ sở"
              value={baseSalary}
              min={0}
              step={10000}
              onChange={setBaseSalary}
              suffix="đ"
              wide
            />
          </div>
          <div className="text-[11px] mt-3" style={{ color: '#6B665F' }}>
            Mặc định 2.530.000 đ/tháng — <b>Nghị định 161/2026/NĐ-CP, Điều 3 khoản 2</b>. Hệ số theo{' '}
            <b>Nghị định 17/2023/NĐ-CP</b>.
            <br />
            Mức hỗ trợ thu là tỷ lệ thu áp dụng; 100% là thu đủ, 50% là thu 50%. GTGT tính trên số sau hỗ trợ.
          </div>
        </div>

        {/* Pricing table — Word-like (Times New Roman 11pt, Word-compatible borders) */}
        <div className="rounded-[10px] overflow-hidden" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
          {hasRows ? (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                fontFamily: '"Times New Roman", Times, serif',
                fontSize: '11pt',
                lineHeight: 1.25,
                width: '100%',
                minWidth: 860,
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                <col style={{ width: '13%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '4%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '21%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={cellThLeft}>Số lượng<br/>phòng</th>
                  <th colSpan={5} style={cellThMid}>Mức tiền bản quyền (chưa gồm thuế GTGT)</th>
                  <th style={cellThRight}>Thành tiền (đồng)</th>
                </tr>
              </thead>
              <tbody>
                {!hasRows ? (
                  <tr>
                    <td colSpan={7} style={{ ...cellWhite, textAlign: 'center', padding: '16px', color: '#8C877E' }}>
                      Nhập số phòng để sinh bảng tiền bản quyền.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* Formula row */}
                    <tr>
                      <td colSpan={7} style={{ ...cellPale, textAlign: 'center', fontStyle: 'italic', color: NAVY, fontSize: '10.5pt' }}>
                        Tiền bản quyền (theo năm) = Mức lương cơ sở × Hệ số điều chỉnh
                      </td>
                    </tr>

                    {/* Tier rows */}
                    {snapshot.rows.map((r, i) => (
                      <tr key={i}>
                        {i === 0 && (
                          <td
                            rowSpan={snapshot.rows.length}
                            style={{ ...cellPale, textAlign: 'center', fontWeight: 700, fontSize: '15pt', color: NAVY }}
                          >
                            {rooms} phòng
                          </td>
                        )}
                        <td style={{ ...cellWhite, color: NAVY, fontWeight: 600 }}>{r.quantity} phòng {tierSuffix(i)}</td>
                        <td style={{ ...cellWhite, textAlign: 'right' }}>{formatVND(r.base_salary ?? 0)}</td>
                        <td style={{ ...cellWhite, textAlign: 'center', color: '#8C877E' }}>×</td>
                        <td style={{ ...cellWhite, textAlign: 'center' }}>{formatCoef(r.coefficient)}</td>
                        <td style={{ ...cellWhite, color: '#6B665F' }}>phòng/năm</td>
                        <td style={{ ...cellWhite, textAlign: 'right', fontWeight: 700 }}>{formatVND(r.amount)}</td>
                      </tr>
                    ))}

                    {/* Mức hỗ trợ thu / Mức thu */}
                    <tr>
                      <td colSpan={6} style={{ ...cellWhite, textAlign: 'right', fontWeight: 700 }}>
                        {getSupportRateLabel(snapshot.support_rate_percent ?? 0)}
                      </td>
                      <td style={{ ...cellWhite, textAlign: 'right', fontWeight: 700 }}>
                        {snapshot.support_rate_percent ?? 0}%
                      </td>
                    </tr>

                    {/* Cộng */}
                    <tr>
                      <td colSpan={6} style={{ ...cellPale, textAlign: 'right', fontWeight: 700 }}>Cộng</td>
                      <td style={{ ...cellPale, textAlign: 'right', fontWeight: 700 }}>{formatVND(snapshot.subtotal)}</td>
                    </tr>

                    {/* Thuế GTGT */}
                    <tr>
                      <td colSpan={6} style={{ ...cellWhite, textAlign: 'right' }}>Thuế GTGT {(snapshot.vat_rate * 100).toFixed(0)}%</td>
                      <td style={{ ...cellWhite, textAlign: 'right' }}>{formatVND(snapshot.vat_amount)}</td>
                    </tr>

                    {/* Tổng */}
                    <tr>
                      <td colSpan={6} style={{ ...cellNavy }}>
                        <strong>TỔNG GIÁ TRỊ HỢP ĐỒNG ({snapshot.duration_months} tháng)</strong>
                      </td>
                      <td style={{ ...cellNavy, textAlign: 'right' }}>
                        <strong>{formatVND(snapshot.total)}</strong>
                      </td>
                    </tr>

                    {/* Bằng chữ */}
                    {snapshot.amount_in_words && (
                      <tr>
                        <td colSpan={7} style={{ ...cellItalic }}>
                          <strong>Bằng chữ:</strong> {snapshot.amount_in_words}./.
                        </td>
                      </tr>
                    )}

                    {/* MLCS note */}
                    <tr>
                      <td colSpan={7} style={{ ...cellWhite, fontSize: '11pt', color: '#444' }}>
                        {snapshot.note}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16" style={{ minWidth: 0 }}>
              <CalculatorIcon className="h-10 w-10 mb-3" style={{ color: '#E7EDE1' }} />
              <p className="text-[13px]" style={{ color: '#8C877E' }}>
                Nhập số phòng để sinh bảng tiền bản quyền.
              </p>
            </div>
          )}
          <div
            className="px-4 py-3 text-[11.5px] leading-relaxed"
            style={{ background: '#FAF9F6', borderTop: `1px solid ${LINE}`, color: '#6B665F' }}
          >
            {BASE_SALARY_LEGAL_NOTE}
          </div>
        </div>
      </div>

      {/* BOTTOM: sticky summary + actions */}
      <aside>
        <div className="rounded-[10px] p-4" style={{ background: NAVY, color: '#fff' }}>
          <div className="text-[10px] uppercase tracking-widest font-bold opacity-70">Tổng giá trị</div>
          <div className="text-[26px] font-bold tabular-nums mt-1" style={SERIF}>
            {formatVND(snapshot.total)}
          </div>
          <div className="text-[11.5px] opacity-80 mt-1">HĐ {snapshot.duration_months} tháng · GTGT {(snapshot.vat_rate * 100).toFixed(0)}%</div>

          <div className="mt-4 space-y-2 text-[12px]">
            <RowKV k="Cộng" v={formatVND(snapshot.subtotal)} />
            <RowKV k="Thuế GTGT" v={formatVND(snapshot.vat_amount)} />
            <RowKV k="Số phòng" v={`${rooms} phòng`} />
            <RowKV k="Nhóm diện tích" v={KARAOKE_AREA_LABEL[areaGroup]} />
            {(snapshot.support_rate_percent ?? 0) > 0 && (
              <RowKV k="Hỗ trợ thu" v={`${snapshot.support_rate_percent}%`} />
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (snapshot.subtotal > 0 && snapshot.total > 0) {
                onConfirmAmounts?.(snapshot);
                setToast('Đã chốt 3 số tiền vào hợp đồng');
                setTimeout(() => setToast(null), 2500);
              }
            }}
            disabled={snapshot.subtotal <= 0 || snapshot.total <= 0}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 rounded-[10px] font-semibold text-[13px] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#fff', color: NAVY }}
          >
            <CalculatorIcon className="h-4 w-4" />
            Chốt 3 số tiền
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <ActionBtn onClick={handleCopyTable} icon={<CopyIcon className="h-3.5 w-3.5" />}>Copy bảng</ActionBtn>
          <ActionBtn onClick={handleCopySummary} icon={<CopyIcon className="h-3.5 w-3.5" />}>Copy tóm tắt</ActionBtn>
          <ActionBtn
            onClick={() => {
              setRooms(0);
              setMonths(12);
              setVatPct(DEFAULT_VAT_RATE * 100);
              setSupportRatePct(100); // Reset to default "thu đủ"
            }}
            icon={<RotateCcwIcon className="h-3.5 w-3.5" />}
          >
            Đặt lại
          </ActionBtn>
        </div>

        {toast && (
          <div
            className="mt-3 rounded-[10px] px-3 py-2 text-[12px] font-medium text-center"
            style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }}
          >
            {toast}
          </div>
        )}
      </aside>
    </div>
  );
}

// ─── Tiny primitives ─────────────────────────────────────────────────────────
function NumField({
  label, value, onChange, min = 0, step = 1, suffix, wide,
}: {
  label: string; value: number; onChange: (n: number) => void;
  min?: number; step?: number; suffix?: string; wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <span className="block text-[10.5px] uppercase tracking-widest font-semibold text-zinc-500">{label}</span>
      <div className="mt-1 relative">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full h-9 rounded-[8px] px-3 pr-10 text-[13px] tabular-nums outline-none focus:ring-2"
          style={{ border: `1px solid ${LINE}`, background: '#fff' }}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-zinc-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="block text-[10.5px] uppercase tracking-widest font-semibold text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 rounded-[8px] px-2 text-[13px] outline-none focus:ring-2"
        style={{ border: `1px solid ${LINE}`, background: '#fff' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function tierSuffix(i: number): string {
  return i === 0 ? 'đầu' : i === 1 ? 'tiếp theo' : 'còn lại';
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="opacity-70">{k}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </div>
  );
}

function ActionBtn({
  children, onClick, icon, active = false,
}: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-[8px] text-[12px] font-semibold transition-colors"
      style={{
        background: active ? NAVY : '#fff',
        color: active ? '#fff' : NAVY,
        border: `1px solid ${active ? NAVY : LINE}`,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = CREAM;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = '#fff';
      }}
    >
      {icon}
      {children}
    </button>
  );
}
