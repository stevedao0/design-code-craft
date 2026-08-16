/**
 * Compact royalty calculator for FAB popup — Apple/macOS sheet style.
 *
 * Design: frosted glass white bg, soft shadow, rounded-28px,
 * scale+fade animation, modern and minimal.
 */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { XIcon, PlusIcon, ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon, Maximize2Icon, InfoIcon } from 'lucide-react';
import {
  FIELDS, FieldResult, computeQuoteTotals, formatVND, formatCoef,
} from '../lib/royaltyCalc';
import { numberToVietnameseWords } from '../lib/numberToVietnameseWords';
import { VcpmcMoneyTable } from './app-ui/data-table/VcpmcMoneyTable';
import type {
  DataTableColumn,
  DataTableSummaryRow,
} from './app-ui/data-table';

const URBAN_OPTIONS = [
  { id: 'special', label: 'Hà Nội / TP. HCM', factor: 1.0 },
  { id: 'I', label: 'Đô thị loại I', factor: 0.8 },
  { id: 'II', label: 'Đô thị loại II', factor: 0.5 },
] as const;
type UrbanId = (typeof URBAN_OPTIONS)[number]['id'];

const DEFAULT_MLCS = 2_000_000;
const DEFAULT_VAT = 10;

// Field categories available for quick-add in compact mode
const QUICK_ADD_FIELDS = [
  { fid: 'cafe', label: 'Quán cà phê / Giải khát' },
  { fid: 'restaurant', label: 'Nhà hàng / Tiệc cưới' },
  { fid: 'showroom', label: 'Cửa hàng / Showroom' },
  { fid: 'fitness', label: 'CLB Gym / Thể dục' },
  { fid: 'karaoke-box', label: 'Karaoke Box' },
  { fid: 'bar', label: 'Bar / Club / Bistro' },
  { fid: 'amusement', label: 'Khu vui chơi / Giải trí' },
  { fid: 'mall', label: 'TTTM / Cao ốc văn phòng' },
  { fid: 'supermarket', label: 'Siêu thị' },
  { fid: 'avia-intl', label: 'Hàng không quốc tế' },
  { fid: 'avia-dom', label: 'Hàng không nội địa' },
  { fid: 'rail', label: 'Đường sắt / Ga tàu' },
  { fid: 'sing-restaurant', label: 'Hát với nhau – Nhà hàng / QCafé / CLB khiêu vũ' },
  { fid: 'sing-bar', label: 'Hát với nhau – Vũ trường / bar / lounge / bistro' },
  { fid: 'wedding-hall', label: 'Sảnh / khu vực tổ chức tiệc cưới' },
];

interface ActiveField {
  fid: string;
  vals: Record<string, number>;
  result: FieldResult;
}

interface RoyaltyCalculatorCompactProps {
  onOpenFullPage?: () => void;
  /** True when rendered inside the FAB popup — hides redundant header/footer */
  embedded?: boolean;
}

export function RoyaltyCalculatorCompact({ onOpenFullPage, embedded = false }: RoyaltyCalculatorCompactProps) {
  const handleOpenFullPage = () => {
    if (onOpenFullPage) {
      onOpenFullPage();
    } else {
      window.location.hash = '#/tools/royalty-calculator';
    }
  };
  const [baseSalary, setBaseSalary] = useState(DEFAULT_MLCS);
  const [urban, setUrban] = useState<UrbanId>('special');
  const [vatPct, setVatPct] = useState(DEFAULT_VAT);
  const [supportPct, setSupportPct] = useState(0);
  const [fields, setFields] = useState<ActiveField[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customFees, setCustomFees] = useState<Array<{ id: string; label: string; amount: number }>>([]);

  const urbanFactor = URBAN_OPTIONS.find((u) => u.id === urban)!.factor;
  const urbanLabel = URBAN_OPTIONS.find((u) => u.id === urban)!.label;

  const availableToAdd = QUICK_ADD_FIELDS.filter(
    (q) => !fields.find((f) => f.fid === q.fid)
  );

  const setFieldVal = (fid: string, key: string, value: number) => {
    setFields((prev) =>
      prev.map((f) =>
        f.fid === fid ? { ...f, vals: { ...f.vals, [key]: value } } : f
      )
    );
  };

  const addField = (fid: string) => {
    if (fields.find((f) => f.fid === fid)) return;
    setFields((prev) => [...prev, { fid, vals: {}, result: { rows: [], totalCoef: 0, subTotal: 0, capped: false, hasInput: false } }]);
    setPickerOpen(false);
  };

  const removeField = (fid: string) => {
    setFields((prev) => prev.filter((f) => f.fid !== fid));
  };

  const perField = useMemo(() => {
    return FIELDS.map((f) => {
      const active = fields.find((af) => af.fid === f.id);
      const vals = active?.vals || {};
      const result = f.compute(vals, baseSalary);
      return { field: f, vals, result };
    });
  }, [fields, baseSalary]);

  const activeFields = perField.filter((p) => p.result.hasInput);

  const totals = useMemo(() => {
    const base = computeQuoteTotals({
      perField: perField.map((p) => p.result),
      urbanFactor,
      supportPct: supportPct / 100,
      vatPct: vatPct / 100,
    });
    const customTotal = customFees.reduce((s, f) => s + f.amount, 0);
    // Spec: custom fees KHÔNG nhân urban, KHÔNG bị trừ hỗ trợ, cộng sau hỗ trợ rồi tính GTGT trên tổng
    const taxableSubtotal = base.afterSupport + customTotal;
    const gtgtAmount = taxableSubtotal * (vatPct / 100);
    const supportAmount = base.afterUrban - base.afterSupport;
    return {
      /** Chỉ tiền bản quyền (không kể chi phí khác) */
      royaltySubTotal: base.rawSubTotal,
      /** Tiền lĩnh vực sau đô thị + hỗ trợ */
      afterSupport: base.afterSupport,
      supportAmount,
      customTotal,
      taxableSubtotal,
      gtgt: gtgtAmount,
      grandTotal: taxableSubtotal + gtgtAmount,
    };
  }, [perField, urbanFactor, supportPct, vatPct, customFees]);

  return (
    <div className={`flex flex-col h-full min-h-0 ${embedded ? '!min-h-[60vh]' : ''}`}>
      {/* Header — only show in full page mode */}
      {!embedded && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200/80 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Tính tiền bản quyền</div>
            <div className="text-xs text-lime-500 mt-0.5">NĐ 17/2023 · Bảng tính tiền bản quyền</div>
          </div>
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.18) transparent' }}>
        <div className="px-5 py-4 space-y-3">

          {/* Global inputs row */}
          <div className="grid grid-cols-3 gap-2">
            <CompactStatInput
              label="MLCS"
              value={baseSalary}
              onChange={(v) => setBaseSalary(v)}
              suffix="đ"
              accent="indigo"
            />
            <UrbanCompactSelect value={urban} onChange={(v) => setUrban(v)} />
            <CompactStatInput
              label="Thuế GTGT"
              value={vatPct}
              onChange={(v) => setVatPct(v)}
              suffix="%"
              accent="cyan"
            />
          </div>

          {/* Support row — only show if > 0 */}
          <div className="grid grid-cols-3 gap-2">
            <CompactStatInput
              label="Hỗ trợ"
              value={supportPct}
              onChange={(v) => setSupportPct(v)}
              suffix="%"
              accent="amber"
            />
            <div className="col-span-2" />
          </div>

          {/* Quick add */}
          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-lime-300 bg-lime-50 px-3 py-2 text-xs font-semibold text-lime-600 transition-colors hover:border-lime-400 hover:bg-lime-100"
            >
              <PlusIcon size={12} />
              Thêm lĩnh vực kinh doanh
              {fields.length > 0 && (
                <span className="ml-1 rounded-full bg-lime-200 text-lime-700 px-1.5 py-0.5 text-[10px] font-bold">
                  {fields.length}
                </span>
              )}
            </button>

            {pickerOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-zinc-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden">
                <div className="max-h-44 overflow-y-auto p-1.5 space-y-0.5">
                  {availableToAdd.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-3">Đã thêm tất cả</p>
                  ) : (
                    availableToAdd.map((q) => (
                      <button
                        key={q.fid}
                        onClick={() => addField(q.fid)}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-lime-50 hover:text-lime-700 rounded-lg transition-colors font-medium"
                      >
                        {q.label}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Field rows */}
          {fields.length === 0 && customFees.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-400">Chưa có lĩnh vực nào</p>
              <p className="text-xs text-zinc-300 mt-1">Bấm "Thêm lĩnh vực kinh doanh" để bắt đầu</p>
            </div>
          )}

          {fields.map((activeField) => {
            const def = FIELDS.find((f) => f.id === activeField.fid)!;
            const result = def.compute(activeField.vals, baseSalary);
            return (
              <FieldRowCompact
                key={activeField.fid}
                field={def}
                vals={activeField.vals}
                result={result}
                onChange={(k, v) => setFieldVal(activeField.fid, k, v)}
                onRemove={() => removeField(activeField.fid)}
                baseSalary={baseSalary}
              />
            );
          })}

          {/* Custom fees — always visible, below field rows */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-600">Chi phí khác / Phụ thu</div>
              <button
                onClick={() => setCustomFees((prev) => [...prev, { id: crypto.randomUUID(), label: '', amount: 0 }])}
                className="flex items-center gap-1 text-[10px] text-lime-500 hover:text-lime-700 font-medium transition-colors"
              >
                <PlusIcon size={10} />
                Thêm chi phí khác
              </button>
            </div>

            {customFees.length === 0 ? (
              <div className="text-center py-2">
                <p className="text-[11px] text-zinc-300 italic">Chưa có chi phí khác</p>
              </div>
            ) : (
              <>
                {customFees.map((fee) => (
                  <div key={fee.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={fee.label}
                      onChange={(e) => setCustomFees((prev) => prev.map((f) => f.id === fee.id ? { ...f, label: e.target.value } : f))}
                      placeholder="Tên khoản phí (vd: Phụ thu, Phí khác...)"
                      className="flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none focus:border-lime-400 transition-colors"
                    />
                    <div className="relative w-28">
                      <input
                        type="number"
                        value={fee.amount || ''}
                        onChange={(e) => setCustomFees((prev) => prev.map((f) => f.id === fee.id ? { ...f, amount: Number(e.target.value) || 0 } : f))}
                        placeholder="0"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 pr-7 text-xs font-mono font-semibold text-zinc-900 outline-none focus:border-lime-400 transition-colors text-right"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">đ</span>
                    </div>
                    <button
                      onClick={() => setCustomFees((prev) => prev.filter((f) => f.id !== fee.id))}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      <XIcon size={10} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5">
                  <span className="text-[10px] text-amber-600 font-medium">Tổng chi phí khác</span>
                  <span className="text-xs font-bold text-amber-600 font-mono tabular-nums">
                    {formatVND(customFees.reduce((s, f) => s + f.amount, 0))}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Results summary */}
          {(activeFields.length > 0 || customFees.some((f) => f.amount > 0)) && (
            <div className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200/80">
                <div className="text-xs font-bold text-zinc-700">Tổng hợp</div>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                {activeFields.length > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Bản quyền</span>
                    <span className="font-mono text-zinc-700">{formatVND(totals.royaltySubTotal)}</span>
                  </div>
                )}
                {totals.customTotal > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Chi phí khác</span>
                    <span className="font-mono text-amber-600">{formatVND(totals.customTotal)}</span>
                  </div>
                )}
                {supportPct > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Hỗ trợ ({supportPct}%)</span>
                    <span className="font-mono text-amber-500">−{formatVND(totals.supportAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Thuế GTGT ({vatPct}%)</span>
                  <span className="font-mono text-lime-600">{formatVND(totals.gtgt)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-zinc-200">
                  <div>
                    <div className="text-sm font-bold text-zinc-900">Tổng cộng</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 italic">
                      {numberToVietnameseWords(totals.grandTotal)}./.
                    </div>
                  </div>
                  <div className="text-xl font-bold text-lime-600 font-mono">{formatVND(totals.grandTotal)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      {(activeFields.length > 0 || customFees.some((f) => f.amount > 0)) && (
        <div className="flex-shrink-0 px-5 py-3.5 border-t border-zinc-200/80 flex items-center gap-2">
          <button
            onClick={handleOpenFullPage}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-300 text-zinc-600 text-xs font-semibold hover:bg-zinc-50 transition-colors"
          >
            <ExternalLinkIcon size={13} />
            Mở toàn trang
          </button>
        </div>
      )}
    </div>
  );
}

function CompactStatInput({ label, value, onChange, suffix, accent }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix: string; accent: 'indigo' | 'cyan' | 'amber' | 'emerald';
}) {
  const borderColor: Record<string, string> = {
    indigo: 'focus-within:border-lime-400',
    cyan: 'focus-within:border-lime-400',
    amber: 'focus-within:border-amber-400',
    emerald: 'focus-within:border-lime-400',
  };
  const labelColor: Record<string, string> = {
    indigo: 'text-lime-500',
    cyan: 'text-lime-500',
    amber: 'text-amber-500',
    emerald: 'text-lime-500',
  };
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white px-3 py-2 transition-colors ${borderColor[accent]}`}>
      <div className={`text-[10px] font-semibold ${labelColor[accent]} mb-1`}>{label}</div>
      <div className="relative flex items-center">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-sm font-mono font-bold text-zinc-900 outline-none pr-6"
        />
        <span className="absolute right-0 text-[10px] text-zinc-400">{suffix}</span>
      </div>
    </div>
  );
}

function UrbanCompactSelect({ value, onChange }: { value: UrbanId; onChange: (v: UrbanId) => void }) {
  const [open, setOpen] = useState(false);
  const current = URBAN_OPTIONS.find((u) => u.id === value)!;
  return (
    <div className="relative rounded-xl border border-zinc-200 bg-white px-3 py-2 transition-colors focus-within:border-lime-400">
      <div className="text-[10px] font-semibold text-lime-500 mb-1">Đô thị</div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-1 text-left"
      >
        <span className="text-xs font-semibold text-zinc-700 truncate">{current.label}</span>
        <ChevronDownIcon size={11} className="text-zinc-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-zinc-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden">
          {URBAN_OPTIONS.map((u) => (
            <button
              key={u.id}
              onClick={() => { onChange(u.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                u.id === value ? 'bg-lime-50 text-lime-700' : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRowCompact({ field, vals, result, onChange, onRemove, baseSalary }: {
  field: (typeof FIELDS)[number];
  vals: Record<string, number>;
  result: FieldResult;
  onChange: (key: string, v: number) => void;
  onRemove: () => void;
  baseSalary: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [breakdownMode, setBreakdownMode] = useState<'table' | 'friendly'>('friendly');
  const hasInput = result.hasInput;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-colors ${hasInput ? 'border-lime-200 bg-lime-50/50' : 'border-zinc-200 bg-white'}`}>
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit/30">
        <button
          onClick={onRemove}
          className="w-5 h-5 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
        >
          <XIcon size={10} />
        </button>
        <span className="text-xs font-semibold text-zinc-700 flex-1 truncate">{field.name}</span>
      </div>

      {/* Input area */}
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          {field.inputs.map((inp) => (
            <div key={inp.key} className="flex-1 min-w-0">
              <label className="text-[10px] text-zinc-400 mb-0.5 block truncate">{inp.label}</label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={vals[inp.key] ?? ''}
                  onChange={(e) => onChange(inp.key, Number(e.target.value) || 0)}
                  placeholder={inp.placeholder || '0'}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 pr-10 text-xs font-mono font-semibold text-zinc-900 outline-none focus:border-lime-400 transition-colors"
                />
                {inp.suffix && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 pointer-events-none">{inp.suffix}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Compact hint */}
        {hasInput && (
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-zinc-400 leading-snug">
              Hệ số: <span className="text-lime-500 font-mono">{formatCoef(result.totalCoef)}</span>
              {result.capped && <span className="ml-1 text-amber-500 font-medium">· trần</span>}
            </div>
            <div className="text-sm font-bold text-lime-600 font-mono tabular-nums">
              {formatVND(result.subTotal)}
            </div>
          </div>
        )}

        {/* Expand toggle + breakdown */}
        {hasInput && (
          <div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex-1 flex items-center justify-center gap-1 text-[10px] text-lime-500 hover:text-lime-700 py-0.5 font-medium transition-colors"
              >
                {expanded ? <ChevronUpIcon size={10} /> : <ChevronDownIcon size={10} />}
                {expanded ? 'Ẩn diễn giải' : 'Xem diễn giải'}
              </button>
              {expanded && (
                <button
                  onClick={() => setBreakdownMode((m) => m === 'friendly' ? 'table' : 'friendly')}
                  className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-lime-500 py-0.5 transition-colors"
                  title={breakdownMode === 'friendly' ? 'Chuyển bảng kỹ thuật' : 'Chuyển diễn giải khách hàng'}
                >
                  <InfoIcon size={9} />
                  {breakdownMode === 'friendly' ? 'Kỹ thuật' : 'Dễ hiểu'}
                </button>
              )}
            </div>

            {expanded && (
              <div className="border border-zinc-200 rounded-lg overflow-hidden mt-1.5 bg-white">
                <div className="bg-lime-50 px-2.5 py-1.5 border-b border-zinc-200 flex items-center justify-between">
                  <div className="text-[10px] font-bold text-lime-600">
                    {breakdownMode === 'friendly' ? 'Diễn giải báo khách' : 'Bảng kỹ thuật'}
                  </div>
                </div>

                {breakdownMode === 'friendly' ? (
                  <div className="px-3 py-2.5 space-y-2">
                    {/* Customer-friendly explanation */}
                    {result.rows.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <div className="w-4 h-4 rounded-full bg-lime-100 text-lime-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 text-zinc-700 leading-snug">
                          <span className="font-semibold text-zinc-900">{r.label}</span>
                          {' — '}
                          <span className="text-zinc-500">MLCS {formatVND(baseSalary, false)} × hệ số {r.coefText.replace('/phòng', '').replace('/box', '').replace('/m²', '')} = </span>
                          <span className="font-mono font-semibold text-lime-600">{formatVND(r.amount)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-zinc-200 pt-2 flex items-center justify-between">
                      <div className="text-[11px] font-semibold text-zinc-700">Tổng cộng</div>
                      <div className="text-[11px] font-bold font-mono text-lime-600">{formatVND(result.subTotal)}</div>
                    </div>
                    {result.capped && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                        <div className="text-[10px] text-amber-600 font-medium">
                          ⚠ Đã áp mức trần: {result.capMultiplier}× MLCS
                        </div>
                        <div className="text-[10px] font-mono text-amber-500 mt-0.5">
                          = {formatVND(result.capAmount || 0)}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <CompactBreakdownTable result={result} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type CompactBreakdownRow = {
  id: string;
  label: string;
  coefText: string;
  qty: number;
  amount: number;
};

function CompactBreakdownTable({ result }: { result: FieldResult }) {
  const rows: CompactBreakdownRow[] = result.rows.map((r, i) => ({
    id: `cbd-${i}`,
    label: r.label,
    coefText: r.coefText,
    qty: r.qty,
    amount: r.amount,
  }));

  const columns: DataTableColumn<CompactBreakdownRow>[] = [
    {
      key: 'label',
      header: 'Bậc',
      align: 'left',
      wrap: 'normal',
      cellClassName: 'text-[10px] text-zinc-700',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)]',
    },
    {
      key: 'coefText',
      header: 'Hệ số',
      align: 'right',
      wrap: 'nowrap',
      cellClassName: 'text-[10px] font-mono text-lime-600',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
    },
    {
      key: 'qty',
      header: 'SL',
      align: 'right',
      wrap: 'nowrap',
      meta: { kind: 'number', tone: 'muted' },
      cellClassName: 'text-[10px]',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
      render: (row) => formatCoef(row.qty, 2),
    },
    {
      key: 'amount',
      header: 'Thành tiền',
      align: 'right',
      wrap: 'nowrap',
      meta: { kind: 'currency', tone: 'strong' },
      cellClassName: 'text-[10px] font-semibold',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
    },
  ];

  const summaryRows: DataTableSummaryRow[] = [
    {
      id: 'cong',
      cells: [
        { id: 'cong-label', content: 'Cộng', align: 'right', colSpan: 3, tone: 'strong' },
        { id: 'cong-value', content: formatVND(result.subTotal), align: 'right', tone: 'strong' },
      ],
    },
  ];

  return (
    <div>
      <VcpmcMoneyTable
        columns={columns}
        rows={rows}
        density="compact"
        summaryRows={summaryRows}
        emptyState={<div className="px-2 py-4 text-center text-[10px] text-zinc-500">Chưa có dữ liệu tiền.</div>}
      />
      {result.capMultiplier !== undefined && (
        <div className="px-2.5 py-1.5 border-t border-zinc-200 bg-amber-50">
          <div className="text-[10px] text-amber-600 font-medium">
            {result.capped ? <>Đã áp trần {result.capMultiplier}×MLCS</> : <>Mức trần: {result.capMultiplier}×MLCS</>}
          </div>
          <div className="text-[10px] font-mono text-zinc-400">{formatVND(result.capAmount || 0)}</div>
        </div>
      )}
    </div>
  );
}
