/**
 * Adapter: build a CalculationSnapshot from the calculator's running state.
 *
 * The calculator page owns the formula (frontend/src/lib/royaltyCalc.ts);
 * this module does NOT recompute the math. It packages numbers exactly as
 * they appear in the calculator sidebar so that the history view shows
 * the same figures the user already saw when they confirmed it.
 */

import { FIELDS } from '../../lib/royaltyCalc';
import { numberToVietnameseWords } from '../../lib/numberToVietnameseWords';
import type {
  CalculationBreakdownLine,
  CalculationLocationSnapshot,
  CalculationSnapshot,
} from './calculationTypes';
import {
  DEFAULT_BASE_SALARY,
  DEFAULT_LEGAL_BASIS,
  DEFAULT_LEGAL_ARTICLE,
  DEFAULT_EFFECTIVE_FROM,
} from '../../lib/pricingSnapshot';

export type CalculatorInstanceLike = {
  instanceId: string;
  fieldId: string;
  locationName: string;
  displayName: string;
  tradeName: string;
  businessAddress: string;
  locationNote: string;
  urbanId: string;
  urbanLabel: string;
  urbanFactor: number;
};

export type CalculatorPerFieldLike = {
  item: CalculatorInstanceLike;
  fieldId: string;
  /** Result rows from FIELDS[id].compute(...). */
  rows?: { label: string; scaleText?: string; amount: number; coefText: string }[];
  /** Result.subTotal — final amount after cap (already used in calculator totals). */
  subTotal: number;
  capped?: boolean;
  durationMonths: number;
  /** Raw area in m² when known (for area-based fields). */
  areaM2?: number;
  /** Raw room count when known (for room-based fields). */
  roomsCount?: number;
};

export type CalculatorSnapshotInput = {
  customer: { name: string; address: string; representative?: string };
  contractMonths: number;
  baseSalary?: number;
  vatPct: number;
  supportPct: number;
  perField: CalculatorPerFieldLike[];
  /** Email or display name of the user who confirmed — uses sessionAuth when omitted. */
  createdBy?: string | null;
};

function formatVND(n: number): string {
  return (Math.round(n) || 0).toLocaleString('vi-VN') + ' đ';
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function formatTerm(months: number): string {
  const m = Math.max(1, Math.round(months || 1));
  return `${m} tháng`;
}

function formatArea(m2?: number): string {
  if (!Number.isFinite(m2 ?? NaN)) return '—';
  return `${(m2 ?? 0).toLocaleString('vi-VN')} m²`;
}

function makeCode(legalName: string, iso: string): string {
  const slug = (legalName || 'KH').slice(0, 16).replace(/[^A-Za-z0-9À-ỹ]+/g, '-');
  const day = iso.slice(0, 10).replace(/-/g, '');
  return `BT-${day}-${slug}`.toUpperCase();
}

function locationBreakdownFromResult(
  pf: CalculatorPerFieldLike,
  baseSalary: number
): { breakdown: CalculationBreakdownLine[]; narrative: string } {
  if (!pf.rows || pf.rows.length === 0) {
    return {
      breakdown: [],
      narrative: 'Hệ thống chưa cung cấp diễn giải cách tính cho khu vực này.',
    };
  }
  const breakdown: CalculationBreakdownLine[] = pf.rows.map((r, i) => ({
    id: `bd-${i}`,
    label: r.label,
    value: formatVND(r.amount),
    detail: r.scaleText
      ? `Quy mô: ${r.scaleText} · Hệ số: ${r.coefText}`
      : `Hệ số: ${r.coefText}`,
    qty: r.qty ?? null,
    coef: r.coef ?? null,
    scaleText: r.scaleText ?? null,
  }));
  const narrative =
    `Cách tính: áp dụng MLCS (${formatVND(baseSalary)}) theo bậc thang Nghị định 17/2023/NĐ-CP. ` +
    `Tổng cộng ${formatVND(pf.subTotal)} cho thời hạn ${formatTerm(pf.durationMonths)}.`;
  return { breakdown, narrative };
}

export function buildCalculationSnapshot(input: CalculatorSnapshotInput): CalculationSnapshot {
  const baseSalary = input.baseSalary && input.baseSalary > 0 ? input.baseSalary : DEFAULT_BASE_SALARY;
  const nowIso = new Date().toISOString();
  const totalBeforeVat = input.perField.reduce((sum, p) => {
    const ex = isUrbanExempt(p);
    return sum + (ex ? p.subTotal : p.subTotal * p.item.urbanFactor);
  }, 0);
  const vat = Math.round(totalBeforeVat * (input.vatPct || 0));
  const total = totalBeforeVat + vat;

  const locations: CalculationLocationSnapshot[] = input.perField.map((pf, i) => {
    const ex = isUrbanExempt(pf);
    const royaltyBeforeVat = Math.round(ex ? pf.subTotal : pf.subTotal * pf.item.urbanFactor);
    const locVat = Math.round(royaltyBeforeVat * (input.vatPct || 0));
    const locTotal = royaltyBeforeVat + locVat;
    const { breakdown, narrative } = locationBreakdownFromResult(pf, baseSalary);
    const fieldName = FIELDS.find((f) => f.id === pf.fieldId)?.name ?? pf.fieldId;
    const displayName = (pf.item.displayName || '').trim();
    const actualLocationName = (pf.item.locationName || '').trim() || `Khu vực ${i + 1}`;

    // For room-based fields (karaoke, hotels), show "N phòng"; for area-based show "X m²"
    const rawRooms = Number.isFinite(pf.roomsCount ?? NaN) ? pf.roomsCount : undefined;
    const roomsDisplay = rawRooms != null
      ? `${rawRooms.toLocaleString('vi-VN')} phòng`
      : undefined;
    const areaOrRooms = roomsDisplay ?? formatArea(pf.areaM2);

    return {
      id: pf.item.instanceId || `loc-${i}`,
      displayName: displayName || null,
      actualLocationName,
      actualArea: pf.item.businessAddress?.trim() || null,
      domainLabel: fieldName,
      musicUseAddress: pf.item.businessAddress?.trim() || null,
      areaDisplay: areaOrRooms,
      roomsDisplay: roomsDisplay ?? null,
      roomsCount: rawRooms ?? null,
      termDisplay: formatTerm(pf.durationMonths),
      urbanType: pf.item.urbanLabel || '—',
      urbanCoefficient: formatPercent(pf.item.urbanFactor),
      supportDisplay: input.supportPct > 0 ? `−${formatPercent(input.supportPct)}` : '—',
      royaltyBeforeVatDisplay: formatVND(royaltyBeforeVat),
      vatDisplay: formatVND(locVat),
      totalPaymentDisplay: formatVND(locTotal),
      calculationNarrative: narrative,
      calculationBreakdown: breakdown,
      royaltyBeforeVatRaw: royaltyBeforeVat,
      vatRaw: locVat,
      totalPaymentRaw: locTotal,
      durationMonths: Math.max(1, Math.round(pf.durationMonths || input.contractMonths || 1)),
      areaM2: Number.isFinite(pf.areaM2 ?? NaN) ? pf.areaM2 : undefined,
    };
  });

  const createdBy = input.createdBy || 'VCPMC';

  const snapshot: CalculationSnapshot = {
    id: `snap-${nowIso}-${Math.random().toString(36).slice(2, 8)}`,
    calculationCode: makeCode(input.customer.name, nowIso),
    createdAtIso: nowIso,
    createdAtDisplay: formatDisplay(nowIso),
    legalEntityName: input.customer.name || '—',
    contractReference: null,
    customerAddress: input.customer.address || null,
    customerRepresentative: input.customer.representative || null,
    locationCount: locations.length,
    royaltyBeforeVatDisplay: formatVND(totalBeforeVat),
    vatDisplay: formatVND(vat),
    totalPaymentDisplay: formatVND(total),
    amountInWords: `${numberToVietnameseWords(total)}./.`,
    createdBy,
    verificationStatus: 'confirmed',
    excelExportedAt: null,
    source: 'calculator',
    legalBasis: DEFAULT_LEGAL_BASIS,
    legalArticle: DEFAULT_LEGAL_ARTICLE,
    effectiveFrom: DEFAULT_EFFECTIVE_FROM,
    baseSalaryDisplay: `${baseSalary.toLocaleString('vi-VN')} đồng/tháng`,
    locations,
  };
  return snapshot;
}

function formatDisplay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function isUrbanExempt(pf: CalculatorPerFieldLike): boolean {
  const field = FIELDS.find((f) => f.id === pf.fieldId);
  return Boolean(field?.urbanExempt);
}

export function emptySnapshotTotalsNotice(): string {
  return 'Chưa có số liệu — hãy thêm khu vực và nhập thông tin để tạo bảng tính.';
}
