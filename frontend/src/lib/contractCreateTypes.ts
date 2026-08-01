/**
 * PHASE KVC-02: VCPMC Tariff Dry-Run Calculation
 *
 * Type definitions for the contract create form.
 * Organized into clear model groups:
 * - common: CommonContractInfo (shared across all Background domains)
 * - domain: BackgroundDomainSelection (domain selector)
 * - usage: DomainUsageInfo (domain-specific business area)
 * - calculation: DomainCalculationInput (calculation inputs)
 * - draft: CreateContractDraft (complete form state)
 * - lines: RoyaltyCalculationLine[] (multiple calculation modules per contract)
 */

// =============================================================================
// DOMAIN CODES
// =============================================================================

/** Active Background domain codes - all Background domains share common contract info */
export type BackgroundDomainCode =
  | 'KARAOKE'
  | 'PHONG_THU_AM'
  | 'CAFE'
  | 'NHA_HANG'
  | 'KHU_VUI_CHOI'
  | 'KHACH_SAN'
  | 'SIEU_THI'
  | 'TRUNG_TAM_THUONG_MAI'
  | 'BAR'
  | 'VAN_PHONG'
  | 'CUA_HANG'
  | 'RAP_CHIEU'
  | 'PHONG_TRA'
  | 'CHAM_SOC_SUC_KHOE';

/** Legacy domain aliases (for display only, not for data submission) */
export const BACKGROUND_DOMAIN_ALIASES: Record<string, BackgroundDomainCode> = {
  'Phòng ghi âm': 'PHONG_THU_AM',
  'PHONG_GHI_AM': 'PHONG_THU_AM',
  'PTA': 'PHONG_THU_AM',
  'Cà phê': 'CAFE',
  'Coffee': 'CAFE',
  'Cafe': 'CAFE',
  'Nhà hàng': 'NHA_HANG',
  'Nhà hàng tiệc cưới': 'NHA_HANG',
  'Khu vui chơi': 'KHU_VUI_CHOI',
  'KVC': 'KHU_VUI_CHOI',
  'Khách sạn': 'KHACH_SAN',
  'Siêu thị': 'SIEU_THI',
  'Trung tâm thương mại': 'TRUNG_TAM_THUONG_MAI',
  'Bar': 'BAR',
  'Văn phòng': 'VAN_PHONG',
  'Cửa hàng': 'CUA_HANG',
  'Rạp chiếu phim': 'RAP_CHIEU',
  'Phòng trà': 'PHONG_TRA',
  'Chăm sóc sức khỏe': 'CHAM_SOC_SUC_KHOE',
};

/** Domain display names (Vietnamese) */
export const BACKGROUND_DOMAIN_DISPLAY_NAMES: Record<BackgroundDomainCode, string> = {
  KARAOKE: 'Karaoke',
  PHONG_THU_AM: 'Phòng thu âm',
  CAFE: 'Cà phê / Coffee',
  NHA_HANG: 'Nhà hàng',
  KHU_VUI_CHOI: 'Khu vui chơi',
  KHACH_SAN: 'Khách sạn',
  SIEU_THI: 'Siêu thị',
  TRUNG_TAM_THUONG_MAI: 'Trung tâm thương mại',
  BAR: 'Bar',
  VAN_PHONG: 'Văn phòng',
  CUA_HANG: 'Cửa hàng',
  RAP_CHIEU: 'Rạp chiếu phim',
  PHONG_TRA: 'Phòng trà',
  CHAM_SOC_SUC_KHOE: 'Chăm sóc sức khỏe',
};

/** Domains that support karaoke-style calculation (PHONG/BOX) */
export const KARAOKE_CALC_DOMAINS: BackgroundDomainCode[] = [
  'KARAOKE',
  'PHONG_THU_AM',
];

/** Domains that have been fully implemented for calculation */
export const FULLY_IMPLEMENTED_DOMAINS: BackgroundDomainCode[] = [
  'KARAOKE',
  'PHONG_THU_AM',
];

/** Area-based Background domains that use area-based usage fields */
export const AREA_BASED_DOMAINS: BackgroundDomainCode[] = [
  'CAFE',
  'NHA_HANG',
  'KHU_VUI_CHOI',
  'SIEU_THI',
  'TRUNG_TAM_THUONG_MAI',
  'BAR',
  'VAN_PHONG',
  'CUA_HANG',
  'RAP_CHIEU',
  'PHONG_TRA',
  'CHAM_SOC_SUC_KHOE',
];

/** Domains that have placeholder-only form (not yet implemented) */
// KHACH_SAN moved out: now uses manual fee (Nhập tay) consistently with
// CAFE / NHA_HANG. Phase Next will add a real Khu vui choi-style formula.
export const PLACEHOLDER_ONLY_DOMAINS: BackgroundDomainCode[] = [];

// =============================================================================
// COMMON CONTRACT INFO (shared across all Background domains)
// =============================================================================

export type CommonContractInfo = {
  /** Số hợp đồng - USER INPUT ONLY, not auto-generated */
  contractNumber: string;
  /** Ngày lập hợp đồng (YYYY-MM-DD) */
  signedDate: string;
  /** Năm hợp đồng */
  contractYear: string;
  /** Mã vùng (e.g., HĐQTGAN-PN) */
  regionCode: string;
  /** Khu vực (e.g., PN) */
  areaCode: string;
  /** Mã quyền / Mảng (e.g., PR) */
  fieldCode: string;
};

// =============================================================================
// ADDRESS STRUCTURE (Post-2025 merger: no Quận/Huyện)
// =============================================================================

export type AddressBlock = {
  /** Số nhà, tên đường, khu phố/thôn... */
  addressLine: string;
  /** Phường/Xã sau sáp nhập 2025 */
  ward: string;
  /** Tỉnh/Thành phố */
  province: string;
  /** Địa chỉ đầy đủ, auto-built từ các trường trên */
  fullAddress: string;
};

/**
 * Build full address from parts.
 * Format: [addressLine], [ward], [province]
 */
export const buildFullAddress = (addressLine: string, ward: string, province: string): string => {
  const parts = [addressLine, ward, province].filter((p) => p.trim());
  return parts.join(', ');
};

// =============================================================================
// CUSTOMER / ENTITY INFO (shared across all Background domains)
// =============================================================================

export type CustomerInfo = {
  /** Tên đơn vị / legal entity name */
  legalName: string;
  /** Tên bảng hiệu / business signage */
  brandName: string;
  /** Người đại diện */
  representativeName: string;
  /** Chức vụ đại diện */
  representativeTitle: string;
  /** Mã số thuế / Tax code */
  taxCode: string;
  /** Số CCCD */
  cccd: string;
  /** Điện thoại liên hệ */
  phone: string;
  /** Email liên hệ */
  email: string;
  /** Địa chỉ pháp lý (full text - backward compatible) */
  legalAddress: string;
  /** Địa chỉ pháp lý - số nhà/đường */
  legalAddressLine: string;
  /** Địa chỉ pháp lý - Phường/Xã */
  legalWard: string;
  /** Địa chỉ pháp lý - Tỉnh/Thành phố */
  legalProvince: string;
  /** Địa chỉ pháp lý đầy đủ (auto-built) */
  legalFullAddress: string;
};

// =============================================================================
// BUSINESS LOCATION (shared across all Background domains)
// =============================================================================

export type BusinessLocationInfo = {
  /** Số nhà, tên đường, khu phố/thôn... */
  usageAddressLine: string;
  /** Phường/Xã sau sáp nhập 2025 */
  usageWard: string;
  /** Tỉnh/Thành phố */
  usageProvince: string;
  /** Địa chỉ sử dụng đầy đủ (auto-built) */
  usageFullAddress: string;
  /** Địa chỉ sử dụng full text - backward compatible (deprecated, use usageFullAddress) */
  usageAddress: string;
  /** Nếu true: usage = legal. User không nhập riêng */
  usageSameAsLegal: boolean;
  /** @deprecated Dùng usageProvince */
  city: string;
  /** @deprecated Bỏ sau sáp nhập 2025 */
  district: string;
  /** @deprecated Dùng usageWard */
  ward: string;
};

// =============================================================================
// CONTRACT TERM (shared across all Background domains)
// =============================================================================

export type ContractTermInfo = {
  /** Ngày bắt đầu hiệu lực (YYYY-MM-DD) */
  effectiveFrom: string;
  /** Ngày kết thúc hiệu lực (YYYY-MM-DD) */
  effectiveTo: string;
};

// =============================================================================
// ASSIGNEE (shared across all Background domains)
// =============================================================================

export type AssigneeInfo = {
  /** Email người thực hiện */
  email: string;
};

// =============================================================================
// NOTES (shared across all Background domains)
// =============================================================================

export type NotesInfo = {
  /** Ghi chú nội bộ */
  internal: string;
  /** Ghi chú/điều khoản xuất hợp đồng */
  contractTerms: string;
};

// =============================================================================
// DOMAIN SELECTION (shared across all Background domains)
// =============================================================================

export type DomainSelectionInfo = {
  /** Domain group (always 'background' for this phase) */
  domainGroup: 'background';
  /** Selected domain code */
  domainCode: BackgroundDomainCode;
  /** Display name of domain */
  domainDisplayName: string;
  /** Loại hợp đồng: NEW, PENDING_RENEWAL (tái ký), FRAME_CONTRACT */
  renewalStatus: CreateContractRenewalStatus;
  /** ID hợp đồng gốc tham chiếu (khi tái ký) */
  referenceContractId: number | null;
  /** Số hợp đồng gốc tham chiếu */
  referenceContractNo: string;
  /** ID hợp đồng dùng làm mẫu nhập liệu (Phase TEMPLATE-CREATE-01) */
  sourceTemplateContractId: number | null;
  /** Số hợp đồng dùng làm mẫu nhập liệu */
  sourceTemplateContractNo: string;
};

// =============================================================================
// KARAOKE / PHÒNG THU ÂM USAGE (domain-specific for karaoke_calc domains)
// =============================================================================

export type KaraokeUsageInfo = {
  /** Loại hình: PHONG hoặc BOX */
  karaokeType: 'PHONG' | 'BOX';
  /** Nhóm diện tích: DEN_20, TREN_20_DEN_30, TREN_30, BOX */
  areaGroup: 'DEN_20' | 'TREN_20_DEN_30' | 'TREN_30' | 'BOX';
  /** Tổng số phòng (cho loại PHONG) */
  totalRooms: number;
  /** Tổng số box (cho loại BOX) */
  totalBoxes: number;
  /** Mức lương cơ sở VND (default: 2,340,000) */
  baseSalary: number;
  /** Tỷ lệ hỗ trợ hàng năm (%) */
  annualSupportPercent: number;
  /** Tỷ lệ hỗ trợ bậc 1 (%) */
  tier1SupportPercent: number;
  /** Tỷ lệ hỗ trợ bậc 2 (%) */
  tier2SupportPercent: number;
  /** Tỷ lệ hỗ trợ bậc 3 (%) */
  tier3SupportPercent: number;
  /** Phần trăm GTGT/VAT */
  gtgtPercent: number;
  /** Chế độ hiển thị: 'text' hoặc 'table' */
  pricingRenderMode: 'text' | 'table';
  /** Các khu vực phòng chi tiết */
  roomSections: RoomSection[];
};

export type RoomSection = {
  /** Key/label cho section */
  key: string;
  /** Số lượng phòng trong section */
  roomCount: number;
  /** Tên các phòng (comma-separated) */
  roomNames: string;
};

// =============================================================================
// AREA-BASED USAGE (domain-specific for area-based Background domains)
// =============================================================================

/**
 * Display mode for area usage when exporting contract.
 * - auto: automatically choose text or table based on location count
 * - text: show as text/paragraph
 * - table: show as table
 */
export type AreaUsageDisplayMode = 'auto' | 'text' | 'table';

/**
 * KVC pricing mode (placeholder - not implemented yet).
 * - VCPMC_TARIFF: Biểu giá VCPMC
 * - ND17: Áp dụng Nghị định 17/2023
 */
export type KvcPricingMode = '' | 'VCPMC_TARIFF' | 'ND17';

/**
 * Music usage area - a row in the Word-like music usage table.
 * Generic for all Background domains (Karaoke, Cafe, Restaurant, Hotel, etc.)
 */
export type MusicUsageArea = {
  /** Unique ID for this area row */
  id: string;
  /** Vị trí / khu vực sử dụng âm nhạc */
  areaName: string;
  /** Tên riêng hiển thị trên Bảng tính tiền bản quyền — instance-level, không sửa tên danh mục chuẩn */
  pricingLabel?: string;
  /** Quy mô, sức chứa (Số phòng, số chỗ, diện tích...) */
  scaleDescription: string;
  /** Hình thức sử dụng âm nhạc */
  musicUsageType: string;
};

/**
 * A single business usage location for area-based domains.
 * One contract can have one or many locations.
 */
export type BusinessUsageLocation = {
  /** Unique ID for this location */
  id: string;
  /** Tên địa điểm / location name */
  locationName: string;
  /** Địa chỉ kinh doanh / business address */
  businessAddress: string;
  /** Diện tích sử dụng âm nhạc (m²) */
  musicUsageAreaM2: number;
  /** Hình thức sử dụng âm nhạc */
  musicUsageType: 'NHAC_NEN' | 'LIVE_ACOUSTIC' | 'DJ' | 'KARAOKE' | 'MIXED';
  /** Ghi chú / notes */
  note: string;
};

/**
 * FAB multi-location pricing types.
 * Each FAB location has its own area-based royalty calculation.
 */
// #region FAB types
export type FabUrbanClass = 'special' | 'I' | 'II';

export type FabLocationInput = {
  id: string;
  name: string;
  tradeName: string;
  addressLine: string;
  ward: string;
  province: string;
  areaM2: number;
  durationMonths: number;
  urbanClass: FabUrbanClass;
  note: string;
  /** Optional display label for bảng tính/Word export. Falls back to area_name when empty. */
  pricingLabel?: string | null;
  /** Alias for pricingLabel (snake_case). */
  pricing_label?: string | null;
};
// #endregion

/**
 * Area-based usage info for area-based Background domains.
 * Supports one or many business locations.
 */
export type AreaBasedUsageInfo = {
  /** Danh sách địa điểm kinh doanh / business locations */
  locations: BusinessUsageLocation[];
  /** Danh sách khu vực sử dụng âm nhạc (Word-like table) */
  musicUsageAreas: MusicUsageArea[];
  /** FAB multi-location entries (each with its own area-based royalty calculation) */
  fabLocations?: FabLocationInput[];
  /** Cách hiển thị khu vực kinh doanh khi xuất hợp đồng */
  displayMode: AreaUsageDisplayMode;
  /** Preview text (computed, not persisted) */
  usageSummaryText?: string;
  /** Preview table rows (computed, not persisted) */
  usageTablePreview?: {
    headers: string[];
    rows: string[][];
  };
  /** Phương án tính tiền KVC (placeholder - not implemented) */
  pricingMode?: KvcPricingMode;
  /** VAT rate (%) - default 8 */
  vatRate?: number;
  /** Tiền bản quyền trước thuế - user input */
  royaltyAmountBeforeVat?: number;
  /** Tiền thuế GTGT - calculated */
  vatAmount?: number;
  /** Tổng tiền sau thuế - calculated */
  royaltyAmountAfterVat?: number;
  /** Số tiền bằng chữ - calculated */
  royaltyAmountInWords?: string;
  /** @deprecated Use locations instead */
  usageKind: 'NHAC_NEN' | 'LIVE_ACOUSTIC' | 'DJ' | 'KARAOKE' | 'MIXED';
  /** @deprecated Use locations[].musicUsageAreaM2 instead */
  totalAreaM2: number;
  /** @deprecated Use locations[].musicUsageAreaM2 instead */
  musicUsageAreaM2: number;
  /** @deprecated Not used anymore */
  numberOfFloors: number;
  /** @deprecated Not used anymore */
  numberOfZones: number;
  /** @deprecated Use locations instead */
  hasBackgroundMusic: boolean;
  /** @deprecated Use locations instead */
  hasLiveMusic: boolean;
  /** @deprecated Use locations instead */
  hasDj: boolean;
  /** @deprecated Use locations instead */
  hasKaraokeActivity: boolean;
  /** @deprecated Use locations instead */
  operatingModel: 'CHINH_HOP' | 'CHINH_KHONG_HOP' | 'TRON_BO';
  /** @deprecated Use locations instead */
  usageDescription: string;
  /** @deprecated Use locations[].note instead */
  areaNotes: string;
  /** @deprecated Use pricingMode instead */
  pricingMethod: string;
  /** @deprecated Use locations instead */
  usageSections: AreaUsageSection[];
};

export type AreaUsageSection = {
  /** Tên khu vực */
  name: string;
  /** Diện tích (m²) */
  areaM2: number;
  /** Mô tả */
  description: string;
  /** Loại sử dụng nhạc */
  musicUsage: 'NHAC_NEN' | 'LIVE_ACOUSTIC' | 'DJ' | 'KARAOKE' | 'MIXED';
};

// =============================================================================
// CALCULATION MODULE CODES
// =============================================================================

/** Available calculation module codes */
export type CalculationModuleCode =
  | 'KARAOKE_PHONG'
  | 'KARAOKE_BOX'
  | 'KVC_VCPMC_TARIFF'
  | 'KVC_ND17'
  | 'CAFE'
  | 'NHA_HANG'
  | 'KHACH_SAN'
  | 'MANUAL_FEE'
  | 'CUSTOM_PLACEHOLDER';

/** Calculation module status */
export type CalculationModuleStatus =
  | 'implemented'
  | 'planned'
  | 'disabled'
  | 'locked';

/** Calculation module definition */
export type CalculationModule = {
  code: CalculationModuleCode;
  label: string;
  description: string;
  status: CalculationModuleStatus;
  /** Whether this module requires location binding */
  requiresLocationBinding: boolean;
  /** Sample input for reference */
  sampleInput?: Record<string, unknown>;
};

// =============================================================================
// ROYALTY CALCULATION LINE
// =============================================================================

/** A single royalty calculation line in a contract */
export type RoyaltyCalculationLine = {
  /** Unique ID for this line */
  id: string;
  /** User-defined label for this line */
  label: string;
  /** Which calculation module this line uses */
  calculationModule: CalculationModuleCode;
  /** Whether this line is enabled */
  enabled: boolean;
  /** IDs of locations this line applies to (for KVC contracts) */
  appliesToLocationIds: string[];
  /** Module-specific input data */
  input: CalculationLineInput;
  /** Result from calculation (set after user clicks "Tính thử") */
  result: CalculationLineResult | null;
  /** Current status */
  status: 'idle' | 'calculating' | 'success' | 'error' | 'disabled';
  /** Validation issues */
  errors: { field: string; message: string }[];
  /** Calculation warnings */
  warnings: { field: string; message: string }[];
};

/** Input for a calculation line (varies by module) */
export type CalculationLineInput =
  | KaraokePhongInput
  | KaraokeBoxInput
  | VcpmcTariffInput
  | Nd17Input
  | CafeInput
  | NhaHangInput
  | KhachSanInput
  | ManualFeeInput
  | CustomPlaceholderInput;

export type KaraokePhongInput = {
  module: 'KARAOKE_PHONG';
  areaGroup: 'DEN_20' | 'TREN_20_DEN_30' | 'TREN_30';
  totalRooms: number;
  baseSalary: number;
  annualSupportPercent: number;
  tier1SupportPercent: number;
  tier2SupportPercent: number;
  tier3SupportPercent: number;
  gtgtPercent: number;
};

export type KaraokeBoxInput = {
  module: 'KARAOKE_BOX';
  totalBoxes: number;
  baseSalary: number;
  gtgtPercent: number;
};

export type VcpmcTariffInput = {
  module: 'KVC_VCPMC_TARIFF';
  /** Locations with area for calculation */
  locationAreas: { locationId: string; areaM2: number }[];
  /** GTGT percent (user input, default 8%) */
  gtgtPercent: number;
  /** Support/discount amount in VND (applied before GTGT) */
  supportAmount: number;
};

export type Nd17Input = {
  module: 'KVC_ND17';
  /** Placeholder - not implemented yet */
  locationAreas: { locationId: string; areaM2: number }[];
  nd17Fields: Record<string, unknown>;
};

export type CafeInput = {
  module: 'CAFE';
  /** Placeholder - not implemented yet */
  locationAreas: { locationId: string; areaM2: number }[];
};

export type NhaHangInput = {
  module: 'NHA_HANG';
  /** Placeholder - not implemented yet */
  locationAreas: { locationId: string; areaM2: number }[];
};

export type KhachSanInput = {
  module: 'KHACH_SAN';
  /** Placeholder - not implemented yet */
  locationAreas: { locationId: string; areaM2: number }[];
};

export type ManualFeeInput = {
  module: 'MANUAL_FEE';
  /** Tiền chưa thuế (VND) - user enters directly */
  tienChuaGtgt: number;
  /** Phần trăm thuế GTGT (e.g. 8) */
  gtgtPercent: number;
  /** Tiền thuế GTGT (computed) */
  gtgtAmount: number;
  /** Tiền sau thuế (computed) */
  tienSauThue: number;
};

export type CustomPlaceholderInput = {
  module: 'CUSTOM_PLACEHOLDER';
  /** For future custom calculations */
  customData: Record<string, unknown>;
};

/** Result from a calculation line */
export type CalculationLineResult = {
  /** Term months (6 or 12) */
  termMonths: number;
  /** Subtotal before GTGT */
  subtotalBeforeGtgt: number;
  /** GTGT amount */
  gtgtAmount: number;
  /** Total amount (with GTGT) */
  totalAmount: number;
  /** For 6-month contracts */
  effectiveSubtotalBeforeGtgt: number;
  /** Effective total for 6-month contracts */
  effectiveTotalAmount: number;
  /** Module-specific detail rows */
  detailRows: CalculationDetailRow[];
  /** Warnings from calculation */
  warnings: { field: string; message: string; severity: string }[];
  /** Errors from calculation */
  errors: { field: string; message: string }[];
  /** DOCX context preview (for renderer) */
  docxContextPreview?: Record<string, string>;
};

export type CalculationDetailRow = {
  label: string;
  value: number;
  formula?: string;
  coefficient?: number;
};

// =============================================================================
// KVC VCPMC TARIFF CALCULATION TYPES (PHASE KVC-02)
// =============================================================================

/**
 * Result for a single location in KVC VCPMC tariff calculation.
 */
export type VcpmcTariffLocationResult = {
  /** Location ID */
  locationId: string;
  /** Location name (for display) */
  locationName: string;
  /** Area in m² */
  areaM2: number;
  /** Base included area */
  baseIncludedAreaM2: number;
  /** Excess area beyond base */
  excessAreaM2: number;
  /** Raw increment blocks before rounding */
  rawIncrementBlocks: number;
  /** Rounded increment blocks (half-up rule) */
  incrementBlocks: number;
  /** Base fee (1,000,000 VND for 1-50m²) */
  baseFee: number;
  /** Increment fee per block (400,000 VND) */
  incrementFeePerBlock: number;
  /** Total increment amount */
  incrementAmount: number;
  /** Location subtotal before support */
  locationSubtotal: number;
};

/**
 * Result from KVC VCPMC tariff calculation.
 */
export type VcpmcTariffResult = {
  /** Whether calculation succeeded */
  ok: boolean;
  /** Location-level results */
  locations: VcpmcTariffLocationResult[];
  /** Total subtotal before support (sum of all locations) */
  subtotalBeforeSupport: number;
  /** Support/discount amount applied */
  supportAmount: number;
  /** Amount after support */
  amountAfterSupport: number;
  /** GTGT percent applied */
  gtgtPercent: number;
  /** GTGT amount (rounded) */
  gtgtAmount: number;
  /** Total amount (after support + GTGT) */
  totalAmount: number;
  /** Summary text for display */
  summaryText: string;
  /** Detail rows for table display */
  detailRows: {
    locationName: string;
    areaM2: number;
    baseFee: number;
    incrementBlocks: number;
    incrementAmount: number;
    locationSubtotal: number;
  }[];
};

// =============================================================================
// AGGREGATION (frontend-only preview)
// =============================================================================

/** Aggregated calculation result from all enabled lines */
export type CalculationAggregation = {
  /** Sum of all line subtotals before GTGT */
  subtotalBeforeGtgt: number;
  /** Sum of all line GTGT amounts */
  gtgtAmount: number;
  /** Total amount (sum of all line totals) */
  totalAmount: number;
  /** Effective total for 6-month contracts */
  effectiveTotalAmount: number;
  /** Combined warnings from all lines */
  warnings: { field: string; message: string }[];
  /** Combined errors from all lines */
  errors: { field: string; message: string }[];
  /** Number of enabled lines */
  enabledLineCount: number;
  /** Number of calculated lines */
  calculatedLineCount: number;
};

// =============================================================================
// CALCULATION INPUT (for karaoke calculation panel)
// =============================================================================

export type KaraokeCalculationInput = {
  /** Contract number (for reference only) */
  contractNo: string;
  /** Karaoke type: PHONG or BOX */
  karaokeType: 'PHONG' | 'BOX';
  /** Area group */
  areaGroup: 'DEN_20' | 'TREN_20_DEN_30' | 'TREN_30' | 'BOX';
  /** Total rooms */
  totalRooms: number;
  /** Total boxes */
  totalBoxes: number;
  /** Base salary VND (null = use default 2,340,000) */
  baseSalary: number | null;
  /** Annual support percent */
  annualSupportPercent: number;
  /** Tier 1 support percent */
  tier1SupportPercent: number;
  /** Tier 2 support percent */
  tier2SupportPercent: number;
  /** Tier 3 support percent */
  tier3SupportPercent: number;
  /** GTGT percent */
  gtgtPercent: number;
  /** Start date (YYYY-MM-DD) */
  startDate: string;
  /** End date (YYYY-MM-DD) */
  endDate: string;
  /** Pricing render mode */
  pricingRenderMode: 'text' | 'table';
  /** Room/box sections for usage display in contract output */
  roomSections?: RoomSection[];
};

// =============================================================================
// CALCULATION RESULT (from karaoke calc dry-run)
// =============================================================================

export type KaraokeCalculationResult = {
  /** Success flag */
  ok: boolean;
  /** Mode identifier */
  mode: string;
  /** Whether write was performed */
  write_performed: boolean;
  /** Whether contract was created */
  contract_created: boolean;
  /** Whether DOCX was generated */
  docx_generated: boolean;
  /** Whether XLSX was generated */
  xlsx_generated: boolean;
  /** Whether GCN was created */
  gcn_created: boolean;
  /** Whether contract_no was auto-generated */
  contract_no_generated: boolean;
  /** Errors from calculation */
  errors: { field: string; message: string }[];
  /** Warnings from calculation */
  warnings: { field: string; message: string }[];
  /** Echo of input parameters */
  input_echo: {
    contract_no: string | null;
    karaoke_type: string;
    area_group: string;
    tong_so_phong: number | null;
    tong_so_box: number | null;
    muc_luong_co_so: number | null;
    ty_le_ho_tro: number;
    ty_le_ho_tro_bac_1: number;
    ty_le_ho_tro_bac_2: number;
    ty_le_ho_tro_bac_3: number;
    gtgt_percent: number;
    start_date: string | null;
    end_date: string | null;
    pricing_render_mode: string;
  };
  /** Calculation result */
  calculation: {
    /** Term months (6 or 12) */
    term_months: number;
    /** Tier breakdown */
    tiers: KaraokeTier[];
    /** Subtotal before support */
    subtotal_before_support: number;
    /** Support by tier total */
    support_by_tier: number;
    /** Annual support amount */
    annual_support_amount: number;
    /** Amount before GTGT */
    amount_before_gtgt: number;
    /** GTGT percent */
    gtgt_percent: number;
    /** GTGT amount */
    gtgt_amount: number;
    /** Total amount */
    total_amount: number;
    /** Effective amount (halved for 6-month) before GTGT */
    effective_amount_before_gtgt: number;
    /** Effective total (halved for 6-month) */
    effective_total_amount: number;
    /** Detail rows */
    detail_rows: KaraokeDetailRow[];
    /** DOCX context preview */
    docx_context_preview: {
      room_display_text: string;
      pricing_detail_text: string;
      pricing_total_text: string;
      karaoke_pricing_render_mode: string;
    };
  };
};

export type KaraokeTier = {
  name: string;
  rooms: number;
  coefficient: number;
  amount: number;
  support_rate: number;
  support_amount: number;
  net_amount: number;
};

export type KaraokeDetailRow = {
  label: string;
  room_count: number;
  formula: string;
  support_rate: number;
  support_amount: number;
  net_amount: number;
};

// =============================================================================
// COMPLETE DRAFT (all form state)
// =============================================================================

/** Contract template codes for Background exports */
export type ContractTemplateCode = 'TEMPLATE_1' | 'TEMPLATE_2';

/** Template display names */
export const CONTRACT_TEMPLATE_DISPLAY_NAMES: Record<ContractTemplateCode, string> = {
  TEMPLATE_1: 'Mẫu 1',
  TEMPLATE_2: 'Mẫu 2',
};

/** Template filenames */
export const CONTRACT_TEMPLATE_FILENAMES: Record<ContractTemplateCode, string> = {
  TEMPLATE_1: 'export_template_contract_1.docx',
  TEMPLATE_2: 'export_template_contract_2.docx',
};

export type CreateContractDraft = {
  /** Common contract identification (shared) */
  common: CommonContractInfo;
  /** Customer/entity information (shared) */
  customer: CustomerInfo;
  /** Business location (shared) */
  location: BusinessLocationInfo;
  /** Contract term (shared) */
  term: ContractTermInfo;
  /** Assigned staff (shared) */
  assignee: AssigneeInfo;
  /** Notes (shared) */
  notes: NotesInfo;
  /** Domain selection (shared) */
  domain: DomainSelectionInfo;
  /** Domain-specific usage info (karaoke-specific) */
  karaoke: KaraokeUsageInfo;
  /** Domain-specific usage info (area-based domains) */
  areaBased: AreaBasedUsageInfo;
  /** Royalty calculation lines (multiple modules per contract) */
  calculationLines: RoyaltyCalculationLine[];
  /** Selected export template code (TEMPLATE_1 or TEMPLATE_2) */
  contractTemplateCode: ContractTemplateCode;
};

// =============================================================================
// MAPPER TYPES (for mapping draft to API payloads)
// =============================================================================

/** Backend contract_records row candidate */
export type ContractRecordsCandidate = {
  contract_no: string;
  contract_year: number | null;
  ngay_lap_hop_dong: string;
  domain_group: string;
  linh_vuc: string;
  linh_vuc_hien_thi: string;
  region_code: string;
  field_code: string;
  don_vi_ten: string;
  ten_bang_hieu: string;
  don_vi_dia_chi: string;
  /** Structured legal address (Phase 2) */
  legal_address_line?: string;
  legal_ward?: string;
  legal_province?: string;
  legal_full_address?: string;
  don_vi_dien_thoai: string;
  don_vi_email: string;
  don_vi_nguoi_dai_dien: string;
  don_vi_chuc_vu: string;
  don_vi_mst: string;
  dia_chi_su_dung: string;
  usage_same_as_legal: boolean;
  usage_address_line: string;
  usage_ward: string;
  usage_province: string;
  usage_full_address: string;
  nguoi_thuc_hien_email: string;
  loai_hinh_karaoke: 'PHONG' | 'BOX';
  tong_so_phong: number;
  tong_so_box: number;
  karaoke_room_details_json?: string;
  room_display_text?: string;
  ngay_bat_dau: string;
  ngay_ket_thuc: string;
  so_tien_chua_gtgt_value: number;
  thue_percent: number;
  thue_gtgt_value: number;
  so_tien_value: number;
  renewal_status: CreateContractRenewalStatus;
  reference_contract_id: number | null;
  reference_contract_no: string;
  // Source template fields (Phase TEMPLATE-CREATE-01)
  source_template_contract_id: number | null;
  source_template_contract_no: string;
  contract_terms_note: string;
  // Phase 2: Music usage areas + simplified royalty
  // Extended for FAB multi-location: rows may include FAB-specific fields
  music_usage_areas: Array<{
    area_name: string;
    scale_description: string;
    music_usage_type: string;
    // FAB multi-location fields
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
  }>;
  royalty_amount_before_vat: number;
  vat_rate: number;
  vat_amount: number;
  royalty_amount_after_vat: number;
  royalty_amount_in_words: string;
};

// =============================================================================
// RENEWAL STATUS
// =============================================================================

export type CreateContractRenewalStatus =
  | 'NEW'
  | 'PENDING_RENEWAL'
  | 'FRAME_CONTRACT';

// =============================================================================
// DB TARGET HINTS
// =============================================================================

export type DbTargetHint = {
  field: string;
  dbTable: string;
  dbColumn: string;
  risk: 'low' | 'medium' | 'high';
  note: string;
};

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export type ValidationIssue = {
  field: string;
  message: string;
  severity: 'error' | 'warning';
};

// =============================================================================
// LEGACY TYPES (for backward compatibility during migration)
// =============================================================================

/** @deprecated Use BackgroundDomainCode instead */
export type CreateContractDomainCode = BackgroundDomainCode;

/** @deprecated Use CreateContractDraft instead */
export type LegacyCreateContractDraft = CreateContractDraft;

/** @deprecated Use KARAOKE_CALC_DOMAINS instead */
export const LEGACY_KARAOKE_DOMAINS: BackgroundDomainCode[] = KARAOKE_CALC_DOMAINS;
