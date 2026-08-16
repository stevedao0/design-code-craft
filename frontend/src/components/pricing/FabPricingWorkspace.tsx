/**
 * FabPricingWorkspace — FAB multi-location pricing panel.
 *
 * A separate workspace for FAB area-based contracts (NOT Karaoke).
 * Each FAB location has its own:
 * - Name, trade name, address
 * - Urban class / urban coefficient (NHÓM B: URBAN COEFFICIENT)
 * - Area m²
 * - Duration months
 *
 * Formula per location (3-tier area-based FAB):
 * Step 1: baseAnnualRoyaltyByArea (using AREA TIER COEFFICIENT: 0.7/0.003/0.001)
 * Step 2: annualRoyaltyAfterUrban = baseAnnual × urbanCoefficient (NHÓM B)
 * Step 3: royaltyBeforeVat = annualRoyaltyAfterUrban × durationMonths / 12
 * Step 4: VAT on total sum of all locations
 *
 * Key distinction:
 * - areaCoefficient (0.7 / 0.003 / 0.001): AREA TIER COEFFICIENT — in the formula breakdown
 * - urbanCoefficient (1.0 / 0.8 / 0.5): URBAN COEFFICIENT — per-location urban adjustment
 */
import React, { useMemo, useState } from 'react';
import { PlusIcon, Trash2Icon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import {
  FAB_URBAN_OPTIONS,
  FAB_AREA_TIER,
  buildFabAreaPricing,
  formatVND,
  URBAN_MODE_OPTIONS,
  DEFAULT_URBAN_APPLICATION_MODE,
  urbanModeLabel,
  type UrbanApplicationMode,
  type FabPricingSnapshot,
  type FabLocationSnapshot,
  DEFAULT_VAT_RATE,
  DEFAULT_BASE_SALARY,
} from '../../lib/pricingSnapshot';
import type { FabLocationInput, FabUrbanClass } from '../../lib/contractCreateTypes';
import { numberToVietnameseWords } from '../../lib/numberToVietnameseWords';
import { UrbanModeSelector } from './UrbanModeSelector';


type Props = {
  initialLocations?: FabLocationInput[];
  initialVatRate?: number;
  /** Called when user clicks "Chốt 3 số tiền" */
  onConfirm?: (snapshot: FabPricingSnapshot, locations: FabLocationInput[]) => void;
};

const URBAN_MAP: Record<FabUrbanClass, number> = {
  special: 1.0,
  I: 0.8,
  II: 0.5,
};

function makeLocation(): FabLocationInput {
  return {
    id: crypto.randomUUID(),
    name: '',
    tradeName: '',
    addressLine: '',
    ward: '',
    province: '',
    areaM2: 0,
    durationMonths: 12,
    urbanClass: 'special',
    note: '',
  };
}

export function FabPricingWorkspace({ initialLocations = [], initialVatRate = 8, onConfirm }: Props) {
  const [locations, setLocations] = useState<FabLocationInput[]>(
    initialLocations.length > 0 ? initialLocations : [makeLocation()]
  );
  const [vatPct, setVatPct] = useState<number>(initialVatRate);
  const [urbanMode, setUrbanMode] = useState<UrbanApplicationMode>(DEFAULT_URBAN_APPLICATION_MODE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([locations[0]?.id]));
  const [toast, setToast] = useState<string | null>(null);

  const updateLocation = (id: string, patch: Partial<FabLocationInput>) => {
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLocation = () => {
    const loc = makeLocation();
    setLocations((prev) => [...prev, loc]);
    setExpandedIds((prev) => new Set([...prev, loc.id]));
  };

  const removeLocation = (id: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== id));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const snapshot = useMemo(() => {
    return buildFabAreaPricing({
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        areaM2: l.areaM2,
        durationMonths: l.durationMonths,
        urbanClass: l.urbanClass,
        vatRate: vatPct / 100,
      })),
      vatRate: vatPct / 100,
      urbanMode,
    });
  }, [locations, vatPct, urbanMode]);


  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const handleConfirm = () => {
    if (!onConfirm) return;
    if (snapshot.totalRoyaltyBeforeVat <= 0) {
      flash('Chưa có khu vực nào có diện tích > 0 để chốt tiền.');
      return;
    }
    onConfirm(snapshot, locations);
    flash('Đã chốt 3 số tiền vào hợp đồng.');
  };

  const handleReset = () => {
    setLocations([makeLocation()]);
    setExpandedIds(new Set());
    flash('Đã đặt lại.');
  };

  return (
    <div className="flex flex-col gap-4 p-5 sm:p-6" style={{ background: '#F6FAF1' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest font-bold" style={{ color: '#4A7202' }}>
            Khu vực tính tiền FAB &amp; Tiền bản quyền
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Mỗi khu vực có hệ số đô thị riêng. Tính riêng từng khu vực, sau đó cộng tổng.
          </div>
        </div>
        <button
          type="button"
          onClick={addLocation}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-[12px] font-semibold text-white transition-colors"
          style={{ background: '#4A7202' }}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Thêm khu vực
        </button>
      </div>

      {/* Urban application mode */}
      <UrbanModeSelector value={urbanMode} onChange={setUrbanMode} />

      {/* Location cards */}
      <div className="flex flex-col gap-3">
        {locations.map((loc, idx) => (
          <LocationCard
            key={loc.id}
            loc={loc}
            index={idx}
            expanded={expandedIds.has(loc.id)}
            snapshot={snapshot.locations.find((s) => s.id === loc.id)}
            onUpdate={(patch) => updateLocation(loc.id, patch)}
            onToggleExpand={() => toggleExpanded(loc.id)}
            onRemove={locations.length > 1 ? () => removeLocation(loc.id) : undefined}
          />
        ))}
      </div>

      {/* Summary */}
      <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid #E7EDE1' }}>
        <div className="px-4 py-3" style={{ background: '#4A7202', color: '#fff' }}>
          <div className="text-[10px] uppercase tracking-widest font-bold opacity-70">Tổng hợp</div>
        </div>
        <div className="px-4 py-4 space-y-3" style={{ background: '#fff' }}>
          <SummaryRow label="Số khu vực" value={`${locations.length}`} />
          <SummaryRow label="Tổng diện tích" value={`${snapshot.totalAreaM2.toLocaleString('vi-VN')} m²`} />
          <SummaryRow label="Cách áp dụng đô thị" value={urbanModeLabel(snapshot.urbanMode)} />
          <div className="border-t border-zinc-200 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold" style={{ color: '#4A7202' }}>Tiền bản quyền trước thuế GTGT</span>
              <span className="font-mono tabular-nums text-[14px] font-bold" style={{ color: '#4A7202' }}>
                {formatVND(snapshot.totalRoyaltyBeforeVat)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-zinc-500">Thuế GTGT</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={vatPct}
                onChange={(e) => setVatPct(Number(e.target.value) || 0)}
                className="w-16 h-7 rounded-lg border border-zinc-300 px-2 text-[12px] font-mono text-right outline-none focus:border-lime-400"
              />
              <span className="text-[11px] text-zinc-500">%</span>
              <span className="ml-auto font-mono tabular-nums text-[12px]">
                {formatVND(snapshot.totalVatAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
              <span className="text-[12px] font-bold" style={{ color: '#4A7202' }}>Tổng thanh toán</span>
              <span className="font-mono tabular-nums text-[18px] font-bold" style={{ color: '#4A7202' }}>
                {formatVND(snapshot.totalAfterVat)}
              </span>
            </div>
            {snapshot.amountInWords && (
              <div className="text-[11px] italic text-zinc-500">
                Bằng chữ: {snapshot.amountInWords}./.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={snapshot.totalRoyaltyBeforeVat <= 0}
          className="flex-1 h-11 rounded-[10px] font-semibold text-[13px] text-white transition-colors disabled:opacity-40"
          style={{ background: '#4A7202' }}
        >
          Chốt 3 số tiền
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="h-11 px-4 rounded-[10px] border font-semibold text-[13px] transition-colors"
          style={{ borderColor: '#E7EDE1', color: '#4A7202', background: '#fff' }}
        >
          Đặt lại
        </button>
      </div>

      {toast && (
        <div className="rounded-[10px] px-3 py-2 text-[12px] font-medium text-center" style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Location Card ─────────────────────────────────────────────────────────────

function LocationCard({
  loc,
  index,
  expanded,
  snapshot,
  onUpdate,
  onToggleExpand,
  onRemove,
}: {
  loc: FabLocationInput;
  index: number;
  expanded: boolean;
  snapshot?: FabLocationSnapshot;
  onUpdate: (patch: Partial<FabLocationInput>) => void;
  onToggleExpand: () => void;
  onRemove?: () => void;
}) {
  const hasBreakdown = loc.areaM2 > 0 && snapshot && snapshot.areaPricingBreakdown.length > 0;

  return (
    <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid #E7EDE1', background: '#fff' }}>
      {/* Card header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer"
        style={{ background: '#F6FAF1', borderBottom: expanded ? '1px solid #E7EDE1' : 'none' }}
        onClick={onToggleExpand}
      >
        <span className="text-[11px] font-bold text-zinc-400 w-5 text-center">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold truncate" style={{ color: '#4A7202' }}>
            {loc.name || 'Khu vực mới'}
          </div>
          {loc.addressLine && (
            <div className="text-[10px] text-zinc-500 truncate">
              {loc.addressLine}{loc.ward ? `, ${loc.ward}` : ''}{loc.province ? `, ${loc.province}` : ''}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loc.areaM2 > 0 && (
            <span className="text-[11px] font-mono text-lime-600">
              {loc.areaM2.toLocaleString('vi-VN')} m²
            </span>
          )}
          {expanded ? (
            <ChevronUpIcon className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Card body */}
      {expanded && (
        <div className="px-4 py-4 space-y-4">
          {/* Row 1: Name + Trade name */}
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Tên khu vực" value={loc.name} onChange={(v) => onUpdate({ name: v })} placeholder="VD: Tầng 1, Phòng VIP, Khu vực chính..." />
            <InputField label="Bảng hiệu" value={loc.tradeName} onChange={(v) => onUpdate({ tradeName: v })} placeholder="VD: CAFE ABC" />
          </div>

          {/* Row 2: Address */}
          <div className="grid grid-cols-3 gap-3">
            <InputField label="Địa chỉ kinh doanh" value={loc.addressLine} onChange={(v) => onUpdate({ addressLine: v })} placeholder="Số nhà, đường" className="col-span-2" />
            <InputField label="Phường/Xã" value={loc.ward} onChange={(v) => onUpdate({ ward: v })} placeholder="Phường 1" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <InputField label="Tỉnh/Thành phố" value={loc.province} onChange={(v) => onUpdate({ province: v })} placeholder="TP. Hồ Chí Minh" />
            <div>
              <label className="block text-[10.5px] uppercase tracking-widest font-semibold text-zinc-500 mb-1">
                Loại đô thị
              </label>
              <select
                value={loc.urbanClass}
                onChange={(e) => onUpdate({ urbanClass: e.target.value as FabUrbanClass })}
                className="w-full h-9 rounded-[8px] px-3 text-[13px] outline-none focus:ring-2"
                style={{ border: '1px solid #E7EDE1', background: '#fff' }}
              >
                {FAB_URBAN_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                Hệ số: {URBAN_MAP[loc.urbanClass]}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InputField label="Diện tích (m²)" value={loc.areaM2 || ''} onChange={(v) => onUpdate({ areaM2: Number(v) || 0 })} type="number" min={0} placeholder="0" />
              <InputField label="Thời hạn (tháng)" value={loc.durationMonths || 12} onChange={(v) => onUpdate({ durationMonths: Number(v) || 12 })} type="number" min={1} placeholder="12" />
            </div>
          </div>

          {/* Urban note */}
          <div className="text-[10px] text-zinc-400 italic px-2">
            Mỗi khu vực có thể thuộc đô thị khác nhau. Hệ số này chỉ áp dụng cho khu vực hiện tại.
          </div>

          {/* Note */}
          <InputField label="Ghi chú" value={loc.note} onChange={(v) => onUpdate({ note: v })} placeholder="Ghi chú (nếu có)" />

          {/* Pricing breakdown */}
          {hasBreakdown && snapshot && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: '#4A7202' }}>
                Bảng tính tiền bản quyền — khu vực {index + 1}
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #E7EDE1' }}>
                <table className="w-full text-[11px]" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt' }}>
                  <thead>
                    <tr style={{ background: '#4A7202', color: '#fff' }}>
                      <th className="px-3 py-2 text-left font-semibold">Bậc diện tích</th>
                      <th className="px-3 py-2 text-right font-semibold">Số m²</th>
                      <th className="px-3 py-2 text-right font-semibold">Hệ số diện tích</th>
                      <th className="px-3 py-2 text-right font-semibold">Công thức</th>
                      <th className="px-3 py-2 text-right font-semibold">Thành tiền/năm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.areaPricingBreakdown.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid #E7EDE1' }}>
                        <td className="px-3 py-2">{row.tierName}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.tierAreaM2.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2 text-right font-mono text-lime-600">{row.areaCoefficient}</td>
                        <td className="px-3 py-2 text-right text-zinc-500">{row.formula}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{formatVND(row.amount)}</td>
                      </tr>
                    ))}
                    {snapshot.urbanMode === 'BEFORE_TIERING' ? (
                      <>
                        <tr style={{ background: '#f5f5f5', fontWeight: 700 }}>
                          <td className="px-3 py-2" colSpan={4}>
                            Diện tích gốc {snapshot.areaM2.toLocaleString('vi-VN')} m² — chia bậc theo input gốc, tỷ lệ đô thị áp trên từng dòng tiền.
                          </td>
                          <td className="px-3 py-2 text-right font-mono">—</td>
                        </tr>
                        <tr style={{ fontWeight: 600 }}>
                          <td className="px-3 py-2" colSpan={4}>
                            Cộng tiền các bậc × tỷ lệ đô thị ({Math.round(snapshot.urbanCoefficient * 100)}%)
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{formatVND(snapshot.annualRoyaltyAfterUrban)}</td>
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr style={{ background: '#f5f5f5', fontWeight: 700 }}>
                          <td className="px-3 py-2" colSpan={4}>Cộng tiền các bậc (chưa × tỷ lệ đô thị)</td>
                          <td className="px-3 py-2 text-right font-mono">{formatVND(snapshot.baseAnnualRoyaltyByArea)}</td>
                        </tr>
                        <tr style={{ fontWeight: 600 }}>
                          <td className="px-3 py-2" colSpan={4}>
                            Sau khi áp tỷ lệ đô thị ×{snapshot.urbanCoefficient}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{formatVND(snapshot.annualRoyaltyAfterUrban)}</td>
                        </tr>
                      </>
                    )}

                    <tr style={{ fontWeight: 600 }}>
                      <td className="px-3 py-2" colSpan={4}>
                        Cho {snapshot.durationMonths} tháng (×{snapshot.durationMonths}/{12})
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatVND(snapshot.royaltyBeforeVat)}</td>
                    </tr>
                    <tr style={{ background: '#E8F5E9', fontWeight: 700, borderTop: '2px solid #E7EDE1' }}>
                      <td className="px-3 py-2" colSpan={4}>Tổng khu vực {index + 1}</td>
                      <td className="px-3 py-2 text-right font-mono text-lime-700">{formatVND(snapshot.royaltyBeforeVat)} đ/năm</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Remove */}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="flex items-center gap-1.5 text-[11px] text-red-500 hover:text-red-700 transition-colors"
            >
              <Trash2Icon className="h-3.5 w-3.5" />
              Xóa khu vực
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  className = '',
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10.5px] uppercase tracking-widest font-semibold text-zinc-500 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-[8px] px-3 text-[13px] outline-none focus:ring-2"
        style={{ border: '1px solid #E7EDE1', background: '#fff' }}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-zinc-600">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}
