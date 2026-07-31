/**
 * Contract record types — mirrors backend ContractRecordRow model.
 *
 * These types are kept for reference. In the new architecture, contract data
 * is fetched from /api/reports/summary (real-time from DB).
 * The old static CONTRACT_RECORDS array has been removed.
 */
export type RenewalStatus = 'NEW' | 'PENDING_RENEWAL' | 'RENEWED' | null;

export type ContractRecord = {
  id: number;
  contract_no: string;
  contract_year: number;
  don_vi_ten: string;
  ten_bang_hieu: string | null;
  /** Legal full address (single text). Backward compat alias for legacy records. */
  don_vi_dia_chi: string | null;
  /** Structured legal address fields (Phase 2) */
  legal_address_line?: string | null;
  legal_ward?: string | null;
  legal_province?: string | null;
  legal_full_address?: string | null;
  /** Structured usage address fields (Phase 2) */
  usage_same_as_legal?: boolean | null;
  usage_address_line?: string | null;
  usage_ward?: string | null;
  usage_province?: string | null;
  usage_full_address?: string | null;
  dia_chi_su_dung: string;
  linh_vuc_hien_thi: string;
  region_code: string;
  field_code: string;
  ngay_lap_hop_dong: string;
  ngay_bat_dau: string;
  ngay_ket_thuc: string;
  so_tien_value: number | null;
  renewal_status: RenewalStatus;
  is_renewable: boolean;
  loai_hinh_karaoke: string | null;
  tong_so_phong: number | null;
  tong_so_box: number | null;
  // Phase 2 simplified royalty fields (canonical source)
  royalty_amount_before_vat: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  royalty_amount_after_vat: number | null;
  royalty_amount_in_words: string | null;
  // Phase 2: Music usage areas
  music_usage_areas: Array<{
    area_name?: string;
    scale_description?: string;
    music_usage_type?: string;
    urban_class?: string;
    urban_coefficient?: number;
    location_name?: string;
    trade_name?: string;
    address_line?: string;
    ward?: string;
    province?: string;
    area_m2?: number;
    duration_months?: number;
    royalty_subtotal?: number;
  }> | null;
  // Phase 3: GCN integrated status
  gcn_status: string | null;
  gcn_certificate_no: string | null;
  gcn_certificate_id: number | null;
};

// ---- Computed status helpers ----

export type ExpiryStatus = 'active' | 'expiring' | 'expired';

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function getExpiryStatus(
  endIso: string,
  todayIso: string = new Date().toISOString().slice(0, 10)
): { status: ExpiryStatus; daysLeft: number } {
  const daysLeft = daysBetween(todayIso, endIso);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 60) return { status: 'expiring', daysLeft };
  return { status: 'active', daysLeft };
}

export const RENEWAL_LABEL: Record<NonNullable<RenewalStatus> | 'UNKNOWN', string> = {
  NEW: 'Hợp đồng mới',
  PENDING_RENEWAL: 'Chờ tái ký',
  RENEWED: 'Đã tái ký',
  UNKNOWN: 'Chưa xác định',
};
