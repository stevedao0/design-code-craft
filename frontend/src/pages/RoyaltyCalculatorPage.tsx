/**
 * Tính tiền bản quyền âm nhạc theo Nghị định 17/2023/NĐ-CP
 *
 * Ngôn ngữ thiết kế "Cream & Marine":
 *  - Nền kem #F6FAF1, thẻ trắng, viền #E5E1D8
 *  - Accent navy #4A7202 (chữ + nút primary + waterfall panel)
 *  - Heading: Playfair Display (serif editorial), thân: Inter
 *  - Số liệu tabular monospace, vi-VN
 *  - Bố cục: trái = engine (settings + field cards), phải = sidebar tổng
 */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as Lucide from 'lucide-react';
import {
  CalculatorIcon, InfoIcon, RotateCcwIcon, FileDownIcon, ChevronDownIcon,
  AlertTriangleIcon,
  PlusIcon, XIcon, SearchIcon,
} from 'lucide-react';
import {
  FIELDS, FieldDef, FieldResult, formatVND, formatCoef,
} from '../lib/royaltyCalc';
import { numberToVietnameseWords } from '../lib/numberToVietnameseWords';
import {
  DEFAULT_URBAN_APPLICATION_MODE,
  urbanModeLabel as getUrbanModeLabel,
  type UrbanApplicationMode,
} from '../lib/pricingSnapshot';
import { UrbanModeSelector } from '../components/pricing/UrbanModeSelector';
import {
  buildCalculationSnapshot,
} from '../components/calculations/calculationSnapshotAdapter';
import { recordSnapshot } from '../lib/calculations/calculationHistoryStore';
import { ExcelExportButton } from '../components/calculations/ExcelExportButton';
import type { ExcelExportUiState } from '../components/calculations/calculationTypes';
import {
} from '../lib/calculations/generateRoyaltyCalculationWorkbook';
import { ContractExcelExportDialog } from '../components/calculations/ContractExcelExportDialog';
import { VcpmcMoneyTable } from '../components/app-ui/data-table/VcpmcMoneyTable';
import type {
  DataTableColumn,
  DataTableSummaryRow,
} from '../components/app-ui/data-table';

// Palette — VCPMC brand (vcpmc.org): fresh green on white, thin lines, no heavy fills.
const C = {
  cream: '#FFFFFF',
  paper: '#FFFFFF',
  subtle: '#F6FAF0',
  line: '#E7EDE1',
  lineStrong: '#D6E1C7',
  ink: '#22271F',
  muted: '#5F6B58',
  mute2: '#8A9483',
  navy: '#4A7202',   // brand deep green (text / primary)
  navy600: '#3B5B02',
  green: '#76B400',
  ember: '#B45309',
};

// Headings use the same sans stack as the app — cleaner and more modern than
// the old editorial serif, which read as heavy inside a dense popup.
const SERIF: React.CSSProperties = {
  fontFamily: '"Inter", system-ui, sans-serif',
  letterSpacing: '-0.015em',
};

// Phân loại đô thị (NĐ 134/2026 sửa đổi Phụ lục II NĐ 17/2023)
const URBAN_OPTIONS = [
  { id: 'special', label: 'Hà Nội / TP. HCM', factor: 1.0 },
  { id: 'I', label: 'Đô thị loại I', factor: 0.8 },
  { id: 'II', label: 'Đô thị loại II', factor: 0.5 },
  { id: 'III', label: 'Đô thị loại III', factor: 0.2 },
  { id: 'III_remote', label: 'Loại III · vùng sâu/xa/ĐB khó khăn', factor: 0.1 },
] as const;
type UrbanId = (typeof URBAN_OPTIONS)[number]['id'];
const DEFAULT_MLCS = 2_530_000;
const DEFAULT_VAT = 0.08;

/** Single usage instance — represents one added business location/item. */
type SelectedUsageItem = {
  instanceId: string;
  fieldId: string;
  /** Human-readable area label — falls back to "Khu vực N" if empty. */
  locationName: string;
  /** Custom display name for export — independent per instance. */
  displayName: string;
  /** Trade name / signboard of the location. */
  tradeName: string;
  /** Business address of this specific location. */
  businessAddress: string;
  /** Free-text note about this location. */
  locationNote: string;
  /** Urban classification — per-instance, independent of global dropdown. */
  urbanId: UrbanId;
  urbanLabel: string;
  urbanFactor: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export function RoyaltyCalculatorPage() {
  const [baseSalary, setBaseSalary] = useState<number>(DEFAULT_MLCS);
  const [urban, setUrban] = useState<UrbanId>('special');
  const [supportPct, setSupportPct] = useState<number>(0);
  const [vatPct, setVatPct] = useState<number>(DEFAULT_VAT);
  const [contractMonths, setContractMonths] = useState<number>(12);
  // Cách áp dụng hệ số đô thị — Cách 1 là mặc định (giữ nguyên hành vi cũ).
  const [urbanMode, setUrbanMode] = useState<UrbanApplicationMode>(DEFAULT_URBAN_APPLICATION_MODE);

  // ── Multi-instance state ──────────────────────────────────────────────────────
  // selectedItems: ordered list of usage instances. Each instance has its own
  // instanceId (stable, unique key) and references a FIELDS config by fieldId.
  // Same fieldId can appear multiple times (e.g. two café locations).
  const [selectedItems, setSelectedItems] = useState<SelectedUsageItem[]>([]);
  // inputsByInstance: maps instanceId → per-instance input values.
  // Each instance has its own inputs — editing one does NOT affect another.
  const [inputsByInstance, setInputsByInstance] = useState<Record<string, Record<string, number>>>({});
  // ────────────────────────────────────────────────────────────────────────────

  const [customer, setCustomer] = useState({ name: '', address: '', representative: '' });
  const [exporting, setExporting] = useState(false);
  const [excelState, setExcelState] = useState<ExcelExportUiState>('unavailable');
  const [expandedInstanceId, setExpandedInstanceId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);
  // Contract-level settings are collapsed by default: they are set once,
  // while the domain cards below are what users actually iterate on.
  const [infoOpen, setInfoOpen] = useState(false);

  const urbanFactor = URBAN_OPTIONS.find((u) => u.id === urban)!.factor;
  const urbanLabel = URBAN_OPTIONS.find((u) => u.id === urban)!.label;

  // Add a new usage instance for the given fieldId.
  // Automatically assigns a sequential locationName (e.g. "Khu vực 1") for this fieldId.
  const addItem = (fieldId: string) => {
    const instanceId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const sameFieldCount = selectedItems.filter((item) => item.fieldId === fieldId).length + 1;
    const locationName = `Khu vực ${sameFieldCount}`;
    // New instance inherits current global urban as its default — user can change per-instance independently.
    setSelectedItems((prev) => [
      ...prev,
      { instanceId, fieldId, locationName, displayName: '', tradeName: '', businessAddress: '', locationNote: '',
        urbanId: urban, urbanLabel, urbanFactor },
    ]);
    setInputsByInstance((prev) => ({ ...prev, [instanceId]: {} }));
    setExpandedInstanceId(instanceId);
    setPickerOpen(false);
    setPickerQuery('');
  };

  // Remove a usage instance by its instanceId.
  const removeItem = (instanceId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.instanceId !== instanceId));
    setInputsByInstance((prev) => {
      const n = { ...prev };
      delete n[instanceId];
      return n;
    });
    if (expandedInstanceId === instanceId) setExpandedInstanceId(null);
  };

  // Update location metadata for a specific instance.
  const setInstanceLocation = (
    instanceId: string,
    patch: Partial<Pick<SelectedUsageItem, 'locationName' | 'tradeName' | 'businessAddress' | 'locationNote'>>
  ) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.instanceId === instanceId ? { ...item, ...patch } : item
      )
    );
  };

  // Update urban classification for a specific instance — independent per-instance.
  const setInstanceUrban = (instanceId: string, urbanId: UrbanId) => {
    const opt = URBAN_OPTIONS.find((u) => u.id === urbanId)!;
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.instanceId === instanceId
          ? { ...item, urbanId, urbanLabel: opt.label, urbanFactor: opt.factor }
          : item
      )
    );
  };

  // Update displayName for a specific instance.
  const setInstanceDisplayName = (instanceId: string, displayName: string) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.instanceId === instanceId ? { ...item, displayName } : item
      )
    );
  };

  // Update an input value within a specific instance.
  const setInstanceInput = (instanceId: string, key: string, value: number) => {
    setInputsByInstance((prev) => ({
      ...prev,
      [instanceId]: { ...(prev[instanceId] || {}), [key]: value },
    }));
  };

  const resetAll = () => {
    setSelectedItems([]);
    setInputsByInstance({});
    setExpandedInstanceId(null);
  };

  // Build per-instance display data. Each entry corresponds to one usage instance.
  const perInstance = useMemo(() => {
    const currentUrbanModeLabel = getUrbanModeLabel(urbanMode);
    return selectedItems.map((item) => {
      const field = FIELDS.find((f) => f.id === item.fieldId)!;
      const vals = inputsByInstance[item.instanceId] || {};

      // Luôn chia bậc bằng input gốc (vals). Tỷ lệ đô thị được áp lên TIỀN bậc,
      // không áp lên input. Hai mode (AFTER_SUBTOTAL / PER_TIER) đều cho cùng t�ng tiền
      // vì phép nhân tuyến tính.
      const result = field.compute(vals, baseSalary);

      // Hệ số đô thị thực của địa điểm. urbanExempt → 1 (mục 5.3 & 5.4 NĐ 17).
      const urbanFactor = item.urbanFactor ?? 1;
      const baseTierAmount = result.subTotal;
      // Sau đô thị — không phụ thuộc mode (cộng dồn linear).
      const urbanAdjustedAmount = result.urbanExempt ? baseTierAmount : baseTierAmount * urbanFactor;

      const exportItem = {
        ...item,
        urbanMode,
        urbanModeLabel: currentUrbanModeLabel,
      };

      return {
        item,
        exportItem,
        field,
        vals,
        result,
        urbanMode,
        urbanModeLabel: currentUrbanModeLabel,
        urbanFactor,
        baseTierAmount,
        urbanAdjustedAmount,
        rawArea: Number(vals.area ?? 0) || 0,
      };
    });
    },
    [selectedItems, inputsByInstance, baseSalary, urbanMode]
  );

  // Show instance if user added it AND it has at least one filled input.
  const visibleInstances = perInstance.filter((p) =>
    p.item.instanceId !== null // always show if added
  );
  const activeInstances = perInstance.filter((p) => p.result.hasInput);
  // Có hạng mục không tính theo bậc diện tích (karaoke, khách sạn, vé…)?
  const hasNonAreaInstance = perInstance.some(
    (p) => !(p.field.unit === 'm²' && !p.field.urbanExempt)
  );

  // Sync excel button availability with data
  useEffect(() => {
    setExcelState(activeInstances.length === 0 ? 'unavailable' : 'ready');
  }, [activeInstances.length]);

  const availableToAdd = FIELDS.filter((f) =>
    pickerQuery.trim() === '' || f.name.toLowerCase().includes(pickerQuery.toLowerCase())
  );

  // Compute totals — each instance applies its own urban coefficient.
  // urbanExempt items (flat-fee) are never multiplied by urbanFactor.
  const totals = useMemo(() => {
    const rawSubTotal = perInstance.reduce((s, p) => s + p.baseTierAmount, 0);
    const afterUrban = perInstance.reduce((s, p) => s + p.urbanAdjustedAmount, 0);
    const afterSupport = afterUrban; // support applied in pricing snapshot only; here just base royalty
    const vat = afterSupport * vatPct;
    return {
      rawSubTotal,
      afterUrban,
      afterSupport,
      vat,
      grandTotal: afterSupport + vat,
    };
  }, [perInstance, vatPct]);

  const currentUrbanModeLabel = getUrbanModeLabel(urbanMode);

  const handleSaveToHistory = () => {
    if (activeInstances.length === 0) return;
    setExporting(true);
    try {
      const snapshot = buildCalculationSnapshot({
        customer,
        contractMonths,
        baseSalary,
        vatPct,
        supportPct,
        perField: activeInstances.map(({ exportItem: item, field, vals, result, urbanFactor, urbanAdjustedAmount }) => ({
          item,
          fieldId: field.id,
          vals,
          result,
          subTotal: result.subTotal,
          rows: result.rows.map((r) => ({
            label: r.label,
            scaleText: r.scaleText,
            coefText: r.coefText,
            amount: r.amount,
          })),
          capped: result.capped,
          durationMonths: contractMonths,
          areaM2: (vals.area ?? 0) > 0 ? (vals.area as number) : undefined,
          urbanMode,
          urbanFactor,
          urbanAdjustedAmount,
        })),
      });
      recordSnapshot(snapshot);
      window.dispatchEvent(new CustomEvent('vcpmc:calculation-history-changed'));
    } finally {
      setExporting(false);
    }
  };

  // Nguồn dữ liệu cho hộp thoại xuất Excel — bố cục bảng tính hợp đồng.
  const excelSource = useMemo(() => ({
    instances: activeInstances.map(({ exportItem: item, field, vals, result, urbanFactor, urbanAdjustedAmount, baseTierAmount, urbanMode }) => ({
      instanceId: item.instanceId,
      field,
      result,
      vals,
      locationName: item.locationName,
      displayName: item.displayName,
      urbanLabel: item.urbanLabel,
      urbanFactor,
      // BEFORE_TIERING = Cách 2 (per-tier) theo nhãn UI mới.
      urbanMode: (urbanMode === 'BEFORE_TIERING' ? 'PER_TIER' : 'AFTER_SUBTOTAL') as 'AFTER_SUBTOTAL' | 'PER_TIER',
      baseTierAmount,
      urbanAdjustedAmount,
    })),
    customer,
    baseSalary,
    vatPct,
    supportPct,
    contractMonths,
    quoteDate: new Date().toLocaleDateString('vi-VN'),
  }), [activeInstances, customer, baseSalary, vatPct, supportPct, contractMonths]);

  const handleExportExcel = () => {
    if (activeInstances.length === 0) return;
    setExcelDialogOpen(true);
  };

  return (
    <div
      className="rc-light text-[15px] antialiased"
      style={{ background: C.cream, color: C.ink, fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_336px]">
        {/* ═══════════════════════════════════════════════════════════════════
            LEFT — ENGINE
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="p-5 lg:p-6 space-y-4 lg:border-r" style={{ borderColor: C.line }}>
          {/* Toolbar — one row: what you are doing + the two primary controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 mr-auto">
              <h1 className="text-[17px] font-semibold leading-tight" style={{ ...SERIF, color: C.ink }}>
                Hạng mục sử dụng âm nhạc
              </h1>
              <p className="text-[12px] mt-0.5" style={{ color: C.mute2 }}>
                {selectedItems.length === 0
                  ? 'Thêm lĩnh vực kinh doanh để bắt đầu tính'
                  : `${activeInstances.length}/${selectedItems.length} hạng mục đã có số liệu`}
              </p>
            </div>
            <button
              onClick={resetAll}
              disabled={selectedItems.length === 0}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 h-9 text-[12.5px] font-semibold border transition-colors disabled:opacity-40"
              style={{ borderColor: C.lineStrong, color: C.muted, background: C.paper }}
            >
              <RotateCcwIcon className="h-3.5 w-3.5" /> Làm mới
            </button>
            <FieldPicker
              count={selectedItems.length}
              total={FIELDS.length}
              open={pickerOpen}
              setOpen={setPickerOpen}
              query={pickerQuery}
              setQuery={setPickerQuery}
              items={availableToAdd}
              onPick={addItem}
              allFull={false /* allow multi-location: same domain can have multiple instances */}
            />
          </div>

          {/* Contract-level settings — collapsed summary strip, expand to edit */}
          <section className="rounded-xl border overflow-hidden" style={{ borderColor: C.line, background: C.paper }}>
            <button
              type="button"
              onClick={() => setInfoOpen((o) => !o)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{ background: infoOpen ? C.subtle : C.paper }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] shrink-0" style={{ color: C.navy }}>
                Thông số chung
              </span>
              <span className="flex-1 min-w-0 truncate text-[12.5px]" style={{ color: C.muted }}>
                {customer.name || 'Chưa đặt tên đơn vị'} · MLCS{' '}
                <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{formatVND(baseSalary, false)}đ</span>
                {' · '}{contractMonths} tháng · Thuế GTGT {Math.round(vatPct * 100)}%
                {supportPct > 0 ? ` · hỗ trợ ${Math.round(supportPct * 100)}%` : ''}
              </span>
              <ChevronDownIcon
                className={`h-4 w-4 shrink-0 transition-transform ${infoOpen ? 'rotate-180' : ''}`}
                style={{ color: C.mute2 }}
              />
            </button>

            {infoOpen && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4 px-4 pt-1 pb-4 border-t" style={{ borderColor: C.line }}>
            <div className="md:col-span-2 space-y-4">
              <Field label="Đơn vị sử dụng">
                <input
                  type="text"
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  placeholder="Công ty TNHH Giải trí ABC"
                  className="w-full bg-transparent border-b py-1.5 text-sm outline-none transition-colors"
                  style={{ borderColor: C.lineStrong }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.navy)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.lineStrong)}
                />
              </Field>
              <Field label="Địa chỉ">
                <input
                  type="text"
                  value={customer.address}
                  onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                  placeholder="123 Nguyễn Huệ, Q.1, TP.HCM"
                  className="w-full bg-transparent border-b py-1.5 text-sm outline-none"
                  style={{ borderColor: C.lineStrong }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.navy)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.lineStrong)}
                />
              </Field>
              <Field label="Người đại diện">
                <input
                  type="text"
                  value={customer.representative}
                  onChange={(e) => setCustomer({ ...customer, representative: e.target.value })}
                  placeholder="Ông/Bà Nguyễn Văn A"
                  className="w-full bg-transparent border-b py-1.5 text-sm outline-none"
                  style={{ borderColor: C.lineStrong }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.navy)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.lineStrong)}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Thời hạn hợp đồng">
                  <div className="relative">
                    <input
                      type="number" min={1} value={contractMonths || ''}
                      onChange={(e) => setContractMonths(Number(e.target.value) || 1)}
                      className="w-full bg-transparent border-b py-1.5 pr-12 text-sm font-mono font-semibold outline-none tabular-nums"
                      style={{ borderColor: C.lineStrong, color: C.ink }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = C.navy)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = C.lineStrong)}
                    />
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: C.mute2 }}>tháng</span>
                  </div>
                </Field>
                <Field label="Mức lương cơ sở (MLCS)">
                <div className="relative">
                  <input
                    type="number" value={baseSalary || ''} onChange={(e) => setBaseSalary(Number(e.target.value) || 0)}
                    className="w-full bg-transparent border-b py-1.5 pr-8 text-sm font-mono font-semibold outline-none tabular-nums"
                    style={{ borderColor: C.lineStrong }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = C.navy)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = C.lineStrong)}
                  />
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: C.mute2 }}>đ</span>
                </div>
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 content-start">
              <div className="rounded-[10px] border p-3" style={{ background: C.subtle, borderColor: C.line }}>
                <label className="text-[10px] uppercase font-semibold tracking-[0.14em] block mb-1" style={{ color: C.mute2 }}>
                  Ưu đãi / Hỗ trợ (%)
                </label>
                <div className="flex items-baseline gap-1">
                  <input
                    type="number" min={0} max={100}
                    value={Math.round(supportPct * 100)}
                    onChange={(e) => setSupportPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)}
                    className="w-full text-2xl font-semibold outline-none tabular-nums bg-transparent"
                    style={{ color: C.navy }}
                  />
                  <span className="text-lg font-semibold" style={{ color: C.navy }}>%</span>
                </div>
                <p className="text-[10.5px] mt-0.5" style={{ color: C.mute2 }}>Áp dụng trước Thuế GTGT</p>
              </div>
              <div className="rounded-[10px] border p-3" style={{ background: C.subtle, borderColor: C.line }}>
                <label className="text-[10px] uppercase font-semibold tracking-[0.14em] mb-1 block" style={{ color: C.mute2 }}>
                  Thuế GTGT
                </label>
                <div className="flex items-baseline gap-1">
                  <input
                    type="number" min={0} max={100}
                    value={Math.round(vatPct * 100)}
                    onChange={(e) => setVatPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)}
                    className="w-16 text-2xl font-semibold outline-none tabular-nums bg-transparent"
                    style={{ color: C.ink }}
                  />
                  <span className="text-lg font-semibold" style={{ color: C.ink }}>%</span>
                </div>
                <p className="text-[10.5px] mt-0.5" style={{ color: C.mute2 }}>Theo quy định hiện hành</p>
              </div>
            </div>
            </div>
            )}
          </section>

          {/* Phương thức áp dụng tỷ lệ đô thị (nội bộ) */}
          <UrbanModeSelector
            value={urbanMode}
            onChange={setUrbanMode}
            note={
              urbanMode === 'BEFORE_TIERING' && hasNonAreaInstance
                ? 'Karaoke / khách sạn tính theo số phòng — hai phương thức cho cùng kết quả do phép nhân tuyến tính.'
                : null
            }
          />


          {/* Field list */}
          {visibleInstances.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 px-6 text-center"
              style={{ borderColor: C.lineStrong, background: C.subtle }}
            >
              <div className="h-11 w-11 rounded-full flex items-center justify-center mb-3" style={{ background: C.paper, border: `1px solid ${C.lineStrong}` }}>
                <PlusIcon className="h-5 w-5" style={{ color: C.green }} />
              </div>
              <div className="text-[14px] font-semibold" style={{ color: C.ink }}>Chưa có lĩnh vực nào</div>
              <p className="text-[12.5px] mt-1 max-w-xs leading-relaxed" style={{ color: C.muted }}>
                Bấm <span className="font-semibold" style={{ color: C.navy }}>Thêm hạng mục</span> ở trên để chọn lĩnh vực kinh doanh có sử dụng âm nhạc.
              </p>
            </div>
          ) : (
            <section id="vcpmc-usage-instances" className="space-y-3">
              {visibleInstances.map(({ item, field, vals, result, urbanFactor, baseTierAmount, urbanAdjustedAmount }) => (
                <FieldBlock
                  key={item.instanceId}
                  field={field}
                  vals={vals}
                  result={result}
                  urbanFactor={urbanFactor}
                  urbanMode={urbanMode}
                  baseTierAmount={baseTierAmount}
                  urbanAdjustedAmount={urbanAdjustedAmount}
                  expanded={expandedInstanceId === item.instanceId}
                  onToggleExpand={() => setExpandedInstanceId(expandedInstanceId === item.instanceId ? null : item.instanceId)}
                  onChange={(k, v) => setInstanceInput(item.instanceId, k, v)}
                  onRemove={() => removeItem(item.instanceId)}
                  baseSalary={baseSalary}
                  item={item}
                  onLocationChange={(patch) => setInstanceLocation(item.instanceId, patch)}
                  onUrbanChange={(urbanId) => setInstanceUrban(item.instanceId, urbanId)}
                  onDisplayNameChange={(displayName) => setInstanceDisplayName(item.instanceId, displayName)}
                />
              ))}
            </section>
          )}

          <footer className="pt-4 pb-1 text-[11px] leading-relaxed" style={{ color: C.mute2 }}>
            {urbanMode === 'BEFORE_TIERING'
              ? 'Công thức (Phương thức 2 — áp tỷ lệ đô thị theo từng bậc): Chia bậc theo số liệu gốc → mỗi bậc: MLCS × Hệ số × Số lượng × tỷ lệ đô thị → cộng → mức trần → − hỗ trợ → + Thuế GTGT.'
              : 'Công thức (Phương thức 1 — áp tỷ lệ đô thị trên tổng tiền bậc): Chia bậc theo số liệu gốc → Σ(MLCS × Hệ số × Số lượng) → mức trần → × tỷ lệ đô thị → − hỗ trợ → + Thuế GTGT.'}{' '}

            Căn cứ Phụ lục II ban hành kèm theo Nghị định 17/2023/NĐ-CP, được sửa đổi, bổ sung bởi Nghị định 134/2026/NĐ-CP.
          </footer>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            RIGHT — TOTALS SIDEBAR (light, brand green accents)
            ═══════════════════════════════════════════════════════════════════ */}
        <aside
          className="lg:sticky lg:top-0 lg:self-stretch lg:max-h-screen flex flex-col"
          style={{ background: C.subtle, color: C.ink }}
        >
          <div className="flex-1 overflow-y-auto p-5">
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.16em] pb-3 border-b"
              style={{ color: C.navy, borderColor: C.line }}
            >
              Tóm tắt thanh toán
            </h2>

            {activeInstances.length === 0 ? (
              <div className="mt-6 text-[13px] leading-relaxed" style={{ color: C.mute2 }}>
                Chưa có lĩnh vực nào được nhập. Sau khi điền dữ liệu, bảng tổng hợp và mức tiền bản quyền sẽ hiển thị ở đây.
              </div>
            ) : (
              <>
                {/* Per-instance list */}
                <div className="mt-4 space-y-1.5">
                  {activeInstances.map(({ item, field, result }) => (
                    <div
                      key={item.instanceId}
                      className="flex items-start justify-between gap-3 text-[12px] py-1.5 border-b"
                      style={{ borderColor: C.line }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="leading-snug" style={{ color: C.muted }}>
                          <span className="font-mono mr-1" style={{ color: C.mute2 }}>{String(field.no).padStart(2, '0')}.</span>
                          {field.name}
                        </div>
                        {result.capped && (
                          <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            Đã áp trần
                          </span>
                        )}
                      </div>
                      <div className="font-mono font-semibold tabular-nums text-right shrink-0" style={{ color: C.ink }}>
                        {formatVND(result.subTotal, false)} đ
                      </div>
                    </div>
                  ))}
                </div>

                {/* Waterfall */}
                <div className="mt-5 space-y-2.5 text-[13px]">
                  <WRow label="Cách áp dụng đô thị" value={getUrbanModeLabel(urbanMode)} />
                  <WRow label="Tổng cộng định mức" value={formatVND(totals.rawSubTotal)} />
                  <WRow label="Tổng sau đô thị" value={formatVND(totals.afterUrban)} />
                  {supportPct > 0 && (
                    <WRow
                      label={`Hỗ trợ (-${(supportPct * 100).toFixed(0)}%)`}
                      value={`- ${formatVND(totals.afterUrban - totals.afterSupport)}`}
                      tone="positive"
                    />
                  )}
                  <div className="pt-2.5 border-t" style={{ borderColor: C.line }}>
                    <WRow label={`Thuế GTGT (${(vatPct * 100).toFixed(0)}%)`} value={`+ ${formatVND(totals.vat)}`} />
                  </div>
                </div>

                {/* Grand total */}
                <div className="mt-6 rounded-xl border p-4" style={{ background: C.paper, borderColor: C.lineStrong }}>
                  <label className="text-[10px] font-semibold uppercase tracking-[0.16em] block mb-1.5" style={{ color: C.mute2 }}>
                    Tổng giá trị hợp đồng
                  </label>
                  <div className="text-[28px] font-semibold leading-none tabular-nums" style={{ ...SERIF, color: C.navy }}>
                    {new Intl.NumberFormat('vi-VN').format(Math.round(totals.grandTotal))}
                    <span className="text-base ml-1">đ</span>
                  </div>
                  <p className="text-[11px] mt-2.5 leading-relaxed italic" style={{ color: C.muted }}>
                    Bằng chữ: {numberToVietnameseWords(totals.grandTotal)}./.
                  </p>
                </div>

                {activeInstances.some((a) => a.result.capped) && (
                  <div className="mt-4 p-3 rounded-[10px] border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex gap-2 leading-relaxed">
                    <AlertTriangleIcon className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Đã áp dụng mức trần tối đa cho một số lĩnh vực theo quy định của Nghị định 17/2023.</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="border-t p-4 space-y-2" style={{ background: C.paper, borderColor: C.line }}>
            <ExcelExportButton
              state={excelState}
              disabled={activeInstances.length === 0 || exporting}
              onRequest={handleExportExcel}
            />
            <button
              type="button"
              onClick={handleSaveToHistory}
              disabled={activeInstances.length === 0 || exporting}
              className="w-full border py-2.5 rounded-[10px] font-semibold text-[12px] flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: C.lineStrong, color: C.muted, background: C.paper }}
            >
              <FileDownIcon className="h-3.5 w-3.5" />
              Lưu vào lịch sử bảng tính
            </button>
            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('vcpmc:open-calculation-history'))}
                className="text-[11px] font-semibold transition-colors"
                style={{ color: C.navy }}
              >
                Mở lịch sử bảng tính →
              </button>
              <span className="text-[10.5px]" style={{ color: C.mute2 }}>
                {activeInstances.length}/{FIELDS.length} lĩnh vực
              </span>
            </div>
          </div>
        </aside>
      </div>

      <ContractExcelExportDialog
        open={excelDialogOpen}
        onClose={() => setExcelDialogOpen(false)}
        source={excelSource}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI primitives
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: C.mute2 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function WRow({ label, value, tone }: { label: string; value: string; tone?: 'positive' }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span style={{ color: C.muted }}>{label}</span>
      <span className="font-mono tabular-nums font-semibold" style={{ color: tone === 'positive' ? C.green : C.ink }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Field block — light editorial card
// ─────────────────────────────────────────────────────────────────────────────
function FieldBlock({
  field, vals, result, expanded, onToggleExpand, onChange, onRemove, baseSalary,
  item, onLocationChange, onUrbanChange, onDisplayNameChange,
  urbanFactor, baseTierAmount, urbanAdjustedAmount,
}: {
  urbanFactor: number;
  baseTierAmount: number;
  urbanAdjustedAmount: number;
  field: FieldDef;
  vals: Record<string, number>;
  result: FieldResult;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (key: string, v: number) => void;
  onRemove: () => void;
  baseSalary: number;
  item: SelectedUsageItem;
  onLocationChange: (patch: Partial<Pick<SelectedUsageItem, 'locationName' | 'tradeName' | 'businessAddress' | 'locationNote'>>) => void;
  onUrbanChange: (urbanId: UrbanId) => void;
  onDisplayNameChange: (displayName: string) => void;
}) {
  const Icon = (Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>)[field.icon] || CalculatorIcon;
  const hasInput = result.hasInput;
  const heading = item.displayName?.trim() || item.locationName?.trim() || field.name;
  return (
    <article
      className="rounded-xl border overflow-hidden transition-colors"
      style={{ borderColor: expanded ? C.lineStrong : C.line, background: C.paper }}
    >
      {/* Collapsed summary row — the only thing visible until the card is opened */}
      <div
        className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer"
        style={{ background: expanded ? C.subtle : C.paper }}
        onClick={onToggleExpand}
      >
        <span
          className="h-8 w-8 shrink-0 rounded-[9px] flex items-center justify-center"
          style={{
            background: hasInput ? C.green : C.subtle,
            color: hasInput ? '#fff' : C.mute2,
            border: `1px solid ${hasInput ? C.green : C.line}`,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold leading-tight truncate" style={{ color: C.ink }}>
            {heading}
          </div>
          <div className="text-[11.5px] truncate" style={{ color: C.mute2 }}>
            {String(field.no).padStart(2, '0')}. {field.name} · {item.urbanLabel}
          </div>
        </div>
        {hasInput && result.capped && (
          <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: '#FEF3C7', color: '#92400E' }}>
            Trần
          </span>
        )}
        <div className="text-right shrink-0">
          <div className="font-mono font-semibold text-[13.5px] tabular-nums" style={{ color: hasInput ? C.navy : C.mute2 }}>
            {hasInput ? `${formatVND(result.subTotal, false)} đ` : '—'}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Gỡ hạng mục này"
          className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
          style={{ color: C.mute2 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#B91C1C'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.mute2; }}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          style={{ color: C.mute2 }}
        />
      </div>

      {expanded && (
      <div className="px-3.5 pb-3.5 pt-3 border-t space-y-3" style={{ borderColor: C.line }}>
      {/* Row 1 — identity of this usage instance */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.mute2 }}>
            Tên hạng mục trên bảng tính
          </label>
          <input
            type="text"
            value={item.displayName || ''}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="VD: Khu cà phê tầng trệt"
            className="w-full bg-white border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={{ borderColor: C.line }}
            onFocus={(e) => (e.currentTarget.style.borderColor = C.green)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C.line)}
          />
        </div>
        <div>
          <label className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.mute2 }}>
            Tên khu vực
          </label>
          <input
            type="text"
            value={item.locationName}
            onChange={(e) => onLocationChange({ locationName: e.target.value })}
            placeholder="VD: Cơ sở 1"
            className="w-full bg-white border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={{ borderColor: C.line }}
            onFocus={(e) => (e.currentTarget.style.borderColor = C.green)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C.line)}
          />
        </div>
        <div>
          <label className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.mute2 }}>
            Phân loại đô thị
          </label>
          <UrbanSelect value={item.urbanId} onChange={onUrbanChange} />
        </div>
      </div>

      {/* Location metadata row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.mute2 }}>
            Bảng hiệu
          </label>
          <input
            type="text"
            value={item.tradeName}
            onChange={(e) => onLocationChange({ tradeName: e.target.value })}
            placeholder="VD: Chi nhánh 1, Tầng trệt"
            className="w-full bg-white border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={{ borderColor: C.line }}
            onFocus={(e) => (e.currentTarget.style.borderColor = C.green)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C.line)}
          />
        </div>
        <div>
          <label className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.mute2 }}>
            Địa chỉ
          </label>
          <input
            type="text"
            value={item.businessAddress}
            onChange={(e) => onLocationChange({ businessAddress: e.target.value })}
            placeholder="VD: 123 Nguyễn Huệ, Q.1"
            className="w-full bg-white border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={{ borderColor: C.line }}
            onFocus={(e) => (e.currentTarget.style.borderColor = C.green)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C.line)}
          />
        </div>
        <div>
          <label className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.mute2 }}>
            Ghi chú
          </label>
          <input
            type="text"
            value={item.locationNote}
            onChange={(e) => onLocationChange({ locationNote: e.target.value })}
            placeholder="VD: Khu vực chính"
            className="w-full bg-white border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={{ borderColor: C.line }}
            onFocus={(e) => (e.currentTarget.style.borderColor = C.green)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C.line)}
          />
        </div>
      </div>

      {/* Tỷ lệ áp dụng theo phân loại đô thị — hiển thị trung tính, không phụ thuộc mode */}
      {item.urbanId && (
        <div
          className="rounded-lg border px-3 py-2 text-[11.5px] flex flex-wrap items-center gap-x-4 gap-y-1"
          style={{ borderColor: '#D6E1C7', background: '#F6FAF0', color: C.muted }}
        >
          <span>
            Tỷ lệ áp dụng theo phân loại đô thị:{' '}
            <b className="font-mono tabular-nums" style={{ color: C.ink }}>
              {item.urbanLabel} ({Math.round(urbanFactor * 100)}%)
            </b>
          </span>
        </div>
      )}

      {/* Inputs row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t" style={{ borderColor: C.line }}>
        {field.inputs.map((inp) => (
          <div key={inp.key} className="pt-2">
            <label className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.mute2 }}>
              {inp.label}
            </label>
            <div className="relative">
              {inp.type === 'select' ? (
                <select
                  value={vals[inp.key] || (inp.options && inp.options[0]?.value) || 0}
                  onChange={(e) => onChange(inp.key, Number(e.target.value))}
                  className="w-full bg-white border rounded-lg py-2 px-3 text-[14px] font-semibold outline-none transition-all appearance-none"
                  style={{ borderColor: C.lineStrong, color: C.ink }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(118,180,0,0.16)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = C.lineStrong; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {inp.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number" step="any"
                  value={vals[inp.key] || ''}
                  onChange={(e) => onChange(inp.key, Number(e.target.value) || 0)}
                  placeholder={inp.placeholder || '0'}
                  className="w-full bg-white border rounded-lg py-2 px-3 pr-12 text-[14px] font-mono font-semibold tabular-nums outline-none transition-all"
                  style={{ borderColor: C.lineStrong, color: C.ink }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(118,180,0,0.16)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = C.lineStrong; e.currentTarget.style.boxShadow = 'none'; }}
                />
              )}
              {inp.type !== 'select' && inp.suffix && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold" style={{ color: C.mute2 }}>
                  {inp.suffix}
                </span>
              )}
              {inp.type === 'select' && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDownIcon className="h-4 w-4" style={{ color: C.mute2 }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Hint */}
      <p className="text-[11px] leading-snug flex items-start gap-1.5" style={{ color: C.mute2 }}>
        <InfoIcon className="h-3 w-3 mt-[3px] shrink-0" />
        <span>{field.hint}</span>
      </p>

      {/* Result strip */}
      {hasInput && (
        <div
          className="flex items-center justify-between rounded-lg border px-3.5 py-2.5"
          style={{ background: C.subtle, borderColor: C.line }}
        >
          <div className="text-[11px]" style={{ color: C.muted }}>
            Hệ số gộp: <span className="font-mono font-bold tabular-nums" style={{ color: C.ink }}>{formatCoef(result.totalCoef)}</span>
            {result.capMultiplier !== undefined && (
              <span className="ml-2 italic">
                · trần {result.capMultiplier}×MLCS
              </span>
            )}
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.14em] font-semibold" style={{ color: C.mute2 }}>Thành tiền</div>
            <div className="font-mono font-bold text-[15px] tabular-nums" style={{ color: C.navy }}>
              {formatVND(result.subTotal)}
            </div>
          </div>
        </div>
      )}

      {/* Breakdown */}
      {hasInput && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.line, background: C.paper }}>
          <div className="px-3.5 py-2 border-b text-[10px] font-semibold uppercase tracking-[0.14em] flex items-center gap-1.5" style={{ borderColor: C.line, background: C.subtle, color: C.navy }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.navy }} />
            Diễn giải báo khách
          </div>
          <div className="p-3">
            <RoyaltyBreakdownTable result={result} baseSalary={baseSalary} />
          </div>
        </div>
      )}
      </div>
      )}
    </article>
  );
}

type BreakdownRowView = {
  id: string;
  label: string;
  base_salary: number;
  coefText: string;
  qty: number;
  amount: number;
  hideFormula: boolean;
};

function RoyaltyBreakdownTable({ result, baseSalary }: { result: FieldResult; baseSalary: number }) {
  const rows: BreakdownRowView[] = result.rows.map((r, i) => ({
    id: `bd-${i}`,
    label: r.label,
    base_salary: baseSalary,
    coefText: r.coefText,
    qty: r.qty,
    amount: r.amount,
    hideFormula: !!r.hideFormula,
  }));

  const columns: DataTableColumn<BreakdownRowView>[] = [
    {
      key: 'label',
      header: 'Bậc',
      align: 'left',
      wrap: 'normal',
      cellClassName: 'text-[12px]',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)]',
    },
    {
      key: 'base_salary',
      header: 'MLCS',
      align: 'right',
      wrap: 'nowrap',
      meta: { kind: 'currency', tone: 'muted' },
      cellClassName: 'text-[12px]',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
      render: (row) => (row.hideFormula ? '-' : formatVND(row.base_salary, false)),
    },
    {
      key: 'coefText',
      header: 'Hệ số',
      align: 'right',
      wrap: 'nowrap',
      cellClassName: 'text-[12px]',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
      render: (row) => (row.hideFormula ? '-' : row.coefText),
    },
    {
      key: 'qty',
      header: 'Số lượng',
      align: 'right',
      wrap: 'nowrap',
      meta: { kind: 'number' },
      cellClassName: 'text-[12px]',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
      render: (row) => (row.hideFormula ? '-' : formatCoef(row.qty, 2)),
    },
    {
      key: 'amount',
      header: 'Thành tiền',
      align: 'right',
      wrap: 'nowrap',
      meta: { kind: 'currency', tone: 'strong' },
      cellClassName: 'text-[12px] font-bold',
      headerClassName: 'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
      render: (row) => formatVND(row.amount),
    },
  ];

  const summaryRows: DataTableSummaryRow[] = [
    {
      id: 'cong',
      cells: [
        { id: 'cong-label', content: 'Cộng', align: 'right', colSpan: 4, tone: 'strong' },
        { id: 'cong-value', content: formatVND(result.subTotal), align: 'right', tone: 'strong' },
      ],
    },
  ];

  if (result.capMultiplier !== undefined) {
    summaryRows.push({
      id: 'cap',
      className: result.capped ? 'text-amber-900' : undefined,
      cells: [
        {
          id: 'cap-label',
          content: result.capped ? (
            <span className="inline-flex items-center gap-1 font-bold uppercase">
              <AlertTriangleIcon className="h-3 w-3" />
              Đã áp trần tối đa {result.capMultiplier}×MLCS
            </span>
          ) : (
            <>Mức trần: {result.capMultiplier}×MLCS</>
          ),
          align: 'right',
        },
        {
          id: 'cap-value',
          content: formatVND(result.capAmount || 0),
          align: 'right',
          meta: { kind: 'currency' },
        },
      ],
    });
  }

  return (
    <VcpmcMoneyTable
      columns={columns}
      rows={rows}
      density="comfortable"
      summaryRows={summaryRows}
      emptyState={<div className="px-3 py-6 text-center text-sm text-zinc-500">Chưa có dữ liệu tiền.</div>}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Field picker dropdown (light)
// ─────────────────────────────────────────────────────────────────────────────
function FieldPicker({
  count, total, open, setOpen, query, setQuery, items, onPick, allFull,
}: {
  count: number; total: number;
  open: boolean; setOpen: (v: boolean) => void;
  query: string; setQuery: (v: string) => void;
  items: FieldDef[]; onPick: (id: string) => void;
  allFull: boolean;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-[10px] px-3.5 h-9 text-[12.5px] font-semibold transition-colors"
        style={{ background: C.green, color: '#fff' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = C.navy)}
        onMouseLeave={(e) => (e.currentTarget.style.background = C.green)}
      >
        <PlusIcon className="h-3.5 w-3.5" /> Thêm hạng mục
        <span className="ml-1 rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: 'rgba(255,255,255,0.22)' }}>
          {count}/{total}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[90vw] overflow-hidden rounded-lg shadow-xl border"
            style={{ background: C.paper, borderColor: C.lineStrong, boxShadow: '0 20px 50px rgba(0,56,77,0.15)' }}
          >
            <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: C.line, background: C.subtle }}>
              <SearchIcon className="h-3.5 w-3.5" style={{ color: C.mute2 }} />
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm lĩnh vực…"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: C.ink }}
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {items.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs" style={{ color: C.mute2 }}>
                  {allFull ? 'Đã thêm tất cả lĩnh vực' : 'Không tìm thấy lĩnh vực phù hợp'}
                </div>
              ) : items.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onPick(f.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors"
                  style={{ color: C.ink }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.subtle)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-7 shrink-0 font-mono text-[10px]" style={{ color: C.mute2 }}>{String(f.no).padStart(2, '0')}.</span>
                  <span className="flex-1 truncate">{f.name}</span>
                  <PlusIcon className="h-3.5 w-3.5" style={{ color: C.navy }} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Urban dropdown — light cream + navy accent
// ─────────────────────────────────────────────────────────────────────────────
function UrbanSelect({ value, onChange }: { value: UrbanId; onChange: (v: UrbanId) => void }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = URBAN_OPTIONS.find((u) => u.id === value)!;

  const updateRect = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.bottom + 6, width: r.width });
  };

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onDocPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = () => updateRect();
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 bg-white border rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-semibold outline-none transition-colors"
        style={{ borderColor: open ? C.green : C.line, color: C.navy }}
      >
        <span className="truncate">{current.label}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[11px] rounded px-1.5 py-0.5" style={{ background: C.subtle, color: C.navy }}>
            ×{current.factor.toFixed(1)}
          </span>
          <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: C.muted }} />
        </span>
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', left: rect.left, top: rect.top, width: Math.max(rect.width, 260),
            zIndex: 9999, animation: 'urbanDropIn 160ms cubic-bezier(0.32,0.72,0,1)',
            background: C.paper, border: `1px solid ${C.lineStrong}`,
            boxShadow: '0 18px 44px rgba(34,39,31,0.16)',
          }}
          className="overflow-hidden rounded-lg p-1"
        >
          {URBAN_OPTIONS.map((u) => {
            const active = u.id === value;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => { onChange(u.id); setOpen(false); }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors"
                style={{ background: active ? C.subtle : 'transparent', color: active ? C.navy : C.ink }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = C.subtle; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="truncate">{u.label}</span>
                <span className="font-mono text-[11px] rounded px-1.5 py-0.5" style={{ background: active ? C.green : C.subtle, color: active ? '#fff' : C.muted }}>
                  ×{u.factor.toFixed(1)}
                </span>
              </button>
            );
          })}
          <style>{`
            @keyframes urbanDropIn {
              from { opacity: 0; transform: translateY(-4px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0)    scale(1); }
            }
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
}
