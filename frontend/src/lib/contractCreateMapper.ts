/**
 * PHASE KVC-02: VCPMC Tariff Dry-Run Calculation
 *
 * Mapper functions for the contract create form.
 * Handles:
 * - Default draft creation
 * - Draft to API payload mapping
 * - Domain helper functions
 * - Karaoke calculation helpers
 * - KVC VCPMC tariff calculation
 * - Calculation line helpers
 */

import type {
  AddressBlock,
  AreaBasedUsageInfo,
  AreaUsageDisplayMode,
  AreaUsageSection,
  BackgroundDomainCode,
  BusinessLocationInfo,
  BusinessUsageLocation,
  CalculationDetailRow,
  CalculationLineInput,
  CalculationLineResult,
  CalculationModuleCode,
  CalculationAggregation,
  CreateContractDraft,
  CreateContractRenewalStatus,
  ContractRecordsCandidate,
  CustomerInfo,
  DbTargetHint,
  FabLocationInput,
  FabUrbanClass,
  KvcPricingMode,
  KaraokeCalculationInput,
  KaraokeCalculationResult,
  KaraokeUsageInfo,
  MusicUsageArea,
  RoyaltyCalculationLine,
  RoomSection,
  VcpmcTariffInput,
  VcpmcTariffResult,
  VcpmcTariffLocationResult,
} from './contractCreateTypes';
import {
  AREA_BASED_DOMAINS,
  BACKGROUND_DOMAIN_DISPLAY_NAMES,
  FULLY_IMPLEMENTED_DOMAINS,
  KARAOKE_CALC_DOMAINS,
  PLACEHOLDER_ONLY_DOMAINS,
  buildFullAddress,
} from './contractCreateTypes';

import type { KvcCalculationResult, KvcNd17Result } from './contractsClient';
import { numberToVietnameseWords } from '../components/contract/SimpleRoyaltyInput';
import { FAB_URBAN_MAP, FAB_AREA_TIER, buildFabAreaPricing } from './pricingSnapshot';

// =============================================================================
// ADDRESS HELPERS (Post-2025 merger)
// =============================================================================

/**
 * Build full address from parts.
 * Format: [addressLine], [ward], [province]
 * Parts that are empty are skipped.
 */
export const buildFullAddressFromParts = (
  addressLine: string,
  ward: string,
  province: string
): string => {
  const parts = [addressLine, ward, province].filter((p) => (p || '').trim());
  return parts.join(', ');
};

/**
 * Sync usage address from legal address when usageSameAsLegal = true.
 * Returns a new location object with usage fields = legal fields.
 */
export const syncUsageFromLegal = (
  customer: CustomerInfo,
  location: BusinessLocationInfo
): BusinessLocationInfo => {
  return {
    ...location,
    usageSameAsLegal: true,
    usageAddressLine: customer.legalAddressLine,
    usageWard: customer.legalWard,
    usageProvince: customer.legalProvince,
    usageFullAddress: customer.legalFullAddress,
    // Legacy fields
    usageAddress: customer.legalFullAddress,
    city: customer.legalProvince,
  };
};

// =============================================================================
// DEFAULT VALUES
// =============================================================================

/** Default base salary per Nghị định 161/2026/NĐ-CP, effective from 01/07/2026 */
export const DEFAULT_BASE_SALARY_VND = 2530000;

/** Default GTGT percent */
export const DEFAULT_GTGT_PERCENT = 8;

/** Default contract year */
export const DEFAULT_CONTRACT_YEAR = '2026';

/** Default calculation line ID prefix */
const CALC_LINE_ID_PREFIX = 'calc-line-';

/** Default business location ID prefix */
const LOCATION_ID_PREFIX = 'location-';

// =============================================================================
// KVC VCPMC TARIFF CONSTANTS (PHASE KVC-02)
// =============================================================================

/** Base fee for KVC VCPMC tariff (VND) */
export const KVC_BASE_FEE_VND = 1_000_000;

/** Increment fee per block for KVC VCPMC tariff (VND) */
export const KVC_INCREMENT_FEE_VND = 400_000;

/** Base included area for KVC VCPMC tariff (m²) */
export const KVC_BASE_INCLUDED_AREA_M2 = 50;

/** Block size for KVC VCPMC tariff (m²) */
export const KVC_BLOCK_SIZE_M2 = 50;

// =============================================================================
// DEFAULT DRAFT CREATION
// =============================================================================

/**
 * Create a default contract draft with new architecture.
 * Form starts EMPTY - user must fill in partner details.
 * Only system defaults (year, region, domain type) are pre-set.
 */
export const createDefaultContractDraft = (): CreateContractDraft => {
  // Default calculation lines - empty karaoke phong line (user fills in)
  const defaultCalcLine = createCalculationLine('KARAOKE_PHONG', 0);
  if (defaultCalcLine.input.module === 'KARAOKE_PHONG') {
    defaultCalcLine.input = {
      ...defaultCalcLine.input,
      totalRooms: 0,  // User must enter room count
      baseSalary: DEFAULT_BASE_SALARY_VND,
      gtgtPercent: DEFAULT_GTGT_PERCENT,
    };
  }

  return {
    common: {
      contractNumber: '',  // USER INPUT - leave empty
      signedDate: '',      // USER INPUT - leave empty
      contractYear: DEFAULT_CONTRACT_YEAR,
      regionCode: 'HĐQTGAN-PN',  // Default region (Vietnamese accented)
      areaCode: '',
      fieldCode: 'PR',     // Default right code (Phat hanh)
    },
    customer: {
      // ALL CUSTOMER INFO MUST BE USER INPUT
      legalName: '',
      brandName: '',
      representativeName: '',
      representativeTitle: '',
      taxCode: '',
      cccd: '',
      phone: '',
      email: '',
      legalAddress: '',
      legalAddressLine: '',
      legalWard: '',
      legalProvince: '',
      legalFullAddress: '',
    },
    location: {
      usageSameAsLegal: true,  // Default to same as legal
      usageAddressLine: '',
      usageWard: '',
      usageProvince: '',
      usageFullAddress: '',
      usageAddress: '',
      city: '',
      district: '',
      ward: '',
    },
    term: {
      effectiveFrom: '',  // USER INPUT
      effectiveTo: '',    // USER INPUT
    },
    assignee: {
      email: '',
    },
    notes: {
      internal: '',
      contractTerms: '',
    },
    domain: {
      domainGroup: 'background',
      domainCode: 'KARAOKE',  // Default domain
      domainDisplayName: 'Karaoke',
      renewalStatus: 'NEW',    // Default: new contract
      referenceContractId: null,
      referenceContractNo: '',
      sourceTemplateContractId: null,
      sourceTemplateContractNo: '',
    },
    karaoke: {
      karaokeType: 'PHONG',
      areaGroup: 'DEN_20',
      totalRooms: 0,    // User must enter
      totalBoxes: 0,
      baseSalary: DEFAULT_BASE_SALARY_VND,
      annualSupportPercent: 0,
      tier1SupportPercent: 0,
      tier2SupportPercent: 0,
      tier3SupportPercent: 0,
      gtgtPercent: DEFAULT_GTGT_PERCENT,
      pricingRenderMode: 'text',
      roomSections: [],
    },
    areaBased: {
      locations: [],
      displayMode: 'auto',
      pricingMode: undefined,
      usageKind: 'NHAC_NEN',
      totalAreaM2: 0,
      musicUsageAreaM2: 0,
      numberOfFloors: 1,
      numberOfZones: 1,
      hasBackgroundMusic: false,
      hasLiveMusic: false,
      hasDj: false,
      hasKaraokeActivity: false,
      operatingModel: 'CHINH_HOP',
      usageDescription: '',
      areaNotes: '',
      pricingMethod: '',
      usageSections: [],
      musicUsageAreas: [],
      vatRate: 8,
      royaltyAmountBeforeVat: 0,
      vatAmount: 0,
      royaltyAmountAfterVat: 0,
      royaltyAmountInWords: '',
    },
    calculationLines: [defaultCalcLine],
    // Export template selection (Phase BACKGROUND-TEMPLATE-REFACTOR)
    contractTemplateCode: 'TEMPLATE_1',  // Default to Mẫu 1
  };
};

/**
 * Create a contract draft from an existing contract's data.
 * Used to pre-populate the create form with the latest contract's values.
 */
export const createDraftFromContract = (
  contract: import('../data/contractRecords').ContractRecord
): CreateContractDraft => {
  const defaultDraft = createDefaultContractDraft();

  // Normalize domain code from display name
  const rawDomain = (contract.linh_vuc_hien_thi || '').toUpperCase().trim();
  let domainCode: string = rawDomain;
  if (rawDomain === 'KARAOKE') domainCode = 'KARAOKE';
  else if (['PHÒNG THU ÂM', 'PHONG THU AM', 'PHÒNG THU AM'].includes(rawDomain)) domainCode = 'PHONG_THU_AM';
  else if (['KHU VUI CHƠI', 'KHU VUI CHOI', 'KVC'].includes(rawDomain)) domainCode = 'KHU_VUI_CHOI';
  else if (['CÀ PHÊ', 'CAFE', 'COFFEE'].includes(rawDomain)) domainCode = 'CAFE';
  else if (['NHÀ HÀNG', 'NHA HANG', 'NHÀ HÀNG TIỆC CƯỚI'].includes(rawDomain)) domainCode = 'NHA_HANG';
  else if (['KHÁCH SẠN', 'KHACH SAN'].includes(rawDomain)) domainCode = 'KHACH_SAN';
  else if (['SIÊU THỊ', 'SIEU THI'].includes(rawDomain)) domainCode = 'SIEU_THI';
  else if (['TRUNG TÂM THƯƠNG MẠI', 'TRUNG TAM THUONG MAI'].includes(rawDomain)) domainCode = 'TRUNG_TAM_THUONG_MAI';

  const domainDisplayName = contract.linh_vuc_hien_thi || domainCode;

  // Create location from contract
  const location = createDefaultBusinessLocation(0);
  if (contract.dia_chi_su_dung) {
    location.businessAddress = contract.dia_chi_su_dung;
    location.locationName = contract.ten_bang_hieu || '';
  }

  // Create karaoke usage if applicable
  let karaoke = defaultDraft.karaoke;
  if (['KARAOKE', 'PHONG_THU_AM'].includes(domainCode)) {
    karaoke = {
      ...defaultDraft.karaoke,
      karaokeType: (contract.loai_hinh_karaoke as 'PHONG' | 'BOX') || 'PHONG',
      totalRooms: contract.tong_so_phong ?? 0,
      totalBoxes: contract.tong_so_box ?? 0,
    };
  }

  return {
    ...defaultDraft,
    common: {
      ...defaultDraft.common,
      regionCode: contract.region_code || defaultDraft.common.regionCode,
      fieldCode: contract.field_code || defaultDraft.common.fieldCode,
    },
    customer: {
      ...defaultDraft.customer,
      legalName: contract.don_vi_ten || '',
      brandName: contract.ten_bang_hieu || '',
      // Backward compat: if structured fields exist, use them; otherwise fallback to full text
      legalAddress: contract.don_vi_dia_chi || '',
      legalAddressLine: (contract as Record<string, unknown>).legal_address_line as string || (contract.don_vi_dia_chi || '').split(',')[0]?.trim() || '',
      legalWard: (contract as Record<string, unknown>).legal_ward as string || '',
      legalProvince: (contract as Record<string, unknown>).legal_province as string || (contract.don_vi_dia_chi || '').split(',').slice(-2, -1)[0]?.trim() || '',
      legalFullAddress: (contract as Record<string, unknown>).legal_full_address as string || contract.don_vi_dia_chi || '',
    },
    location: {
      ...defaultDraft.location,
      usageSameAsLegal: false,
      usageFullAddress: (contract as Record<string, unknown>).usage_full_address as string || contract.dia_chi_su_dung || '',
      usageAddress: contract.dia_chi_su_dung || '',
      usageAddressLine: (contract as Record<string, unknown>).usage_address_line as string || (contract.dia_chi_su_dung || '').split(',')[0]?.trim() || '',
      usageWard: (contract as Record<string, unknown>).usage_ward as string || '',
      usageProvince: (contract as Record<string, unknown>).usage_province as string || (contract.dia_chi_su_dung || '').split(',').slice(-2, -1)[0]?.trim() || '',
    },
    domain: {
      ...defaultDraft.domain,
      domainCode: domainCode as any,
      domainDisplayName,
    },
    karaoke,
    areaBased: {
      ...defaultDraft.areaBased,
      locations: [location],
    },
    // Phase BACKGROUND-TEMPLATE-REFACTOR: Preserve existing template selection or default to TEMPLATE_1
    contractTemplateCode: (contract as Record<string, unknown>).contract_template_code as string || 'TEMPLATE_1',
  };
};

// =============================================================================
// COMPOSE CONTRACT NUMBER
// =============================================================================

/**
 * Compose full contract number from parts.
 * Format: {numberPart}/{year}/{regionCode}/{fieldCode}
 */
export const composeContractNo = (draft: CreateContractDraft): string => {
  const { contractNumber, contractYear, regionCode, fieldCode } = draft.common;
  const parts = [
    contractNumber.trim(),
    contractYear.trim(),
    regionCode.trim(),
    fieldCode.trim(),
  ].filter(Boolean);
  return parts.join('/');
};

// =============================================================================
// GTGT CALCULATION (frontend-only, for preview)
// =============================================================================

/**
 * Calculate GTGT amount from pre-tax amount and percentage.
 * This is a frontend preview only - backend recalculates on real write.
 */
export const calculateGtgtAmount = (
  amountBeforeGtgt: number,
  gtgtPercent: number
): number => Math.round(amountBeforeGtgt * gtgtPercent / 100);

// =============================================================================
// DOMAIN HELPER FUNCTIONS
// =============================================================================

/**
 * Get display name for a domain code.
 */
export const getDomainDisplayName = (code: BackgroundDomainCode): string => {
  return BACKGROUND_DOMAIN_DISPLAY_NAMES[code] || code;
};

/**
 * Get canonical field code for a domain.
 * Field codes are right types (PR = Performing Right, MR = Mechanical Right),
 * not domain types. Defaults to PR; user should manually select MR if needed.
 * Used for composing contract number.
 */
export const getCanonicalFieldCode = (_code: BackgroundDomainCode): string => {
  return 'PR';
};

/**
 * Check if domain supports karaoke-style calculation.
 */
export const isKaraokeCalcDomain = (code: BackgroundDomainCode): boolean => {
  return KARAOKE_CALC_DOMAINS.includes(code);
};

/**
 * Check if domain is fully implemented for calculation.
 */
export const isFullyImplementedDomain = (code: BackgroundDomainCode): boolean => {
  return FULLY_IMPLEMENTED_DOMAINS.includes(code);
};

/**
 * Get the DOCX template filename for a domain.
 * Used for debug/audit display in the summary panel.
 */
export const getTemplateName = (code: BackgroundDomainCode): string => {
  const TEMPLATES: Record<string, string> = {
    KARAOKE: 'export_template_contract_karaoke.docx',
    PHONG_THU_AM: 'export_template_contract_phong_thu_am.docx',
    CAFE: 'export_template_contract_cafe.docx',
    NHA_HANG: 'export_template_contract_nha_hang.docx',
    KHU_VUI_CHOI: 'export_template_contract_khu_vui_choi.docx',
    KHACH_SAN: 'export_template_contract_khach_san.docx',
    SIEU_THI: 'export_template_contract_sieu_thi.docx',
    TRUNG_TAM_THUONG_MAI: 'export_template_contract_trung_tam_thuong_mai.docx',
    BAR: 'export_template_contract_bar.docx',
    VAN_PHONG: 'export_template_contract_van_phong.docx',
    CUA_HANG: 'export_template_contract_cua_hang.docx',
    RAP_CHIEU: 'export_template_contract_rap_chieu.docx',
    PHONG_TRA: 'export_template_contract_phong_tra.docx',
    CHAM_SOC_SUC_KHOE: 'export_template_contract_cham_suc_suc_khoe.docx',
  };
  return TEMPLATES[code] || `export_template_contract_${code.toLowerCase()}.docx`;
};

/**
 * Check if domain is area-based (uses area-based usage fields).
 */
export const isAreaBasedDomain = (code: BackgroundDomainCode): boolean => {
  return AREA_BASED_DOMAINS.includes(code);
};

/**
 * Check if domain is placeholder-only (not yet implemented).
 */
export const isPlaceholderOnlyDomain = (code: BackgroundDomainCode): boolean => {
  return PLACEHOLDER_ONLY_DOMAINS.includes(code);
};

/**
 * Get area group options based on karaoke type.
 */
export const getAreaGroupOptions = (
  karaokeType: 'PHONG' | 'BOX'
): { value: string; label: string }[] => {
  if (karaokeType === 'BOX') {
    return [{ value: 'BOX', label: 'Box' }];
  }
  return [
    { value: 'DEN_20', label: 'Đến 20m²' },
    { value: 'TREN_20_DEN_30', label: 'Trên 20m² - 30m²' },
    { value: 'TREN_30', label: 'Trên 30m²' },
  ];
};

// =============================================================================
// MAPPING DRAFT TO API PAYLOADS
// =============================================================================

/**
 * Map draft to contract_records candidate for backend API.
 */
export const mapDraftToContractRecordsCandidate = (
  draft: CreateContractDraft,
  aggregation?: CalculationAggregation
): ContractRecordsCandidate => {
  const contractNo = composeContractNo(draft);
  const year = Number.isFinite(Number(draft.common.contractYear))
    ? Number(draft.common.contractYear)
    : null;
  const normalizedRoomSections = draft.karaoke.roomSections.map((section, index) => {
    const roomNames = section.roomNames
      .split(/[,;\n]+/)
      .map((name) => name.trim())
      .filter(Boolean);
    return {
      key: section.key || `KHU_VUC_${index + 1}`,
      label: section.key || `Khu vực ${index + 1}`,
      room_count: Math.max(0, Number(section.roomCount) || 0),
      room_names: roomNames,
      room_names_text: roomNames.join(', '),
    };
  });
  const roomDisplayText = normalizedRoomSections
    .filter((section) => section.room_count > 0)
    .flatMap((section) => [
      `${section.label}: ${String(section.room_count).padStart(2, '0')} phòng`,
      section.room_names_text ? `Tên phòng: ${section.room_names_text}` : '',
    ])
    .filter(Boolean)
    .join('\n');

  // Phase 2: Use direct input from form when available.
  // Karaoke simplified flow: user confirms totals via "Chốt 3 số tiền" → royaltyAmountAfterVat > 0.
  // When direct input has any value, prefer it (do NOT fall back to aggregation 0).
  const aggregationHasValue = (aggregation?.subtotalBeforeGtgt ?? 0) > 0;
  const phase2HasDirectInput = (draft.areaBased.royaltyAmountBeforeVat ?? 0) > 0
    || (draft.areaBased.royaltyAmountAfterVat ?? 0) > 0;

  // FAB detection: must be done before money computation since FAB totals override default
  const hasFabLocations = (draft.areaBased.fabLocations?.length ?? 0) > 0;

  // FAB pricing snapshot (used to derive per-location royalty_subtotal AND contract totals)
  const fabSnapshot = hasFabLocations
    ? buildFabAreaPricing({
        locations: draft.areaBased.fabLocations!.map((loc) => ({
          id: loc.id,
          name: loc.name,
          areaM2: loc.areaM2,
          durationMonths: loc.durationMonths,
          urbanClass: loc.urbanClass,
          vatRate: (draft.areaBased.vatRate || 8) / 100,
        })),
        vatRate: (draft.areaBased.vatRate || 8) / 100,
      })
    : null;

  // Determine final amount: prefer Phase 2 direct input (Karaoke simplified flow),
  // fall back to aggregation only if direct input is empty.
  // For FAB contracts, total comes from fabSnapshot to ensure consistency.
  const royaltyAmountBeforeVat = (hasFabLocations && fabSnapshot)
    ? fabSnapshot.totalRoyaltyBeforeVat
    : (phase2HasDirectInput
        ? Math.max(0, Math.round(draft.areaBased.royaltyAmountBeforeVat ?? 0))
        : Math.max(0, Math.round(aggregation?.subtotalBeforeGtgt ?? 0)));
  const vatRate = draft.areaBased.vatRate ?? 8;
  const gtgtAmount = (hasFabLocations && fabSnapshot)
    ? fabSnapshot.totalVatAmount
    : Math.round(royaltyAmountBeforeVat * vatRate / 100);
  const totalAmount = royaltyAmountBeforeVat + gtgtAmount;

  // Legacy financial fields (keep for backward compatibility)
  const amountBeforeGtgt = royaltyAmountBeforeVat;

  // Phase 2: Music usage areas
  // FAB multi-location: each fabLocation becomes a row with full FAB fields.
  // Standard area rows are NOT sent for FAB contracts to avoid double-counting.
  // For Karaoke contracts, fabLocations is empty so only standard rows are sent.
  const musicUsageAreas = hasFabLocations
      ? draft.areaBased.fabLocations!.map((loc) => {
        const locSnapshot = fabSnapshot?.locations.find((s) => s.id === loc.id);
        // pricing_label: preserve both snake_case and camelCase aliases from location data
        const pricingLabel = loc.pricing_label ?? loc.pricingLabel ?? null;
        return {
          area_name: loc.name || '',
          scale_description: `${loc.areaM2} m²`,
          music_usage_type: 'FAB_AREA',
          urban_class: loc.urbanClass || '',
          urban_coefficient: FAB_URBAN_MAP[loc.urbanClass] ?? 1.0,
          location_name: loc.name || '',
          trade_name: loc.tradeName || '',
          address_line: loc.addressLine || '',
          ward: loc.ward || '',
          province: loc.province || '',
          area_m2: loc.areaM2 || 0,
          duration_months: loc.durationMonths || 12,
          royalty_subtotal: locSnapshot?.royaltyBeforeVat ?? 0,
          // pricing_label là tên hiển thị tùy chọn trên bảng tính/Word; backend fallback area_name khi rỗng.
          pricing_label:
            typeof pricingLabel === 'string' && pricingLabel.trim()
              ? pricingLabel.trim()
              : null,
        };
      })
    : draft.areaBased.musicUsageAreas.map((area) => ({
        area_name: area.areaName || '',
        scale_description: area.scaleDescription || '',
        music_usage_type: area.musicUsageType || '',
        // pricing_label là tên hiển thị tùy chọn trên bảng tính/Word; backend fallback area_name khi rỗng.
        pricing_label: (area.pricingLabel && area.pricingLabel.trim()) || null,
      }));

  // Phase 2: Simplified royalty (direct input from form) - already computed above
  const royaltyAmountAfterVat = royaltyAmountBeforeVat + gtgtAmount;

  return {
    contract_no: contractNo,
    contract_year: year,
    ngay_lap_hop_dong: draft.common.signedDate,
    domain_group: draft.domain.domainGroup,
    linh_vuc: draft.domain.domainCode,
    linh_vuc_hien_thi: draft.domain.domainDisplayName,
    region_code: draft.common.regionCode,
    field_code: draft.common.fieldCode,
    don_vi_ten: draft.customer.legalName.trim(),
    ten_bang_hieu: draft.customer.brandName.trim(),
    // Legal address (backward compat + new structured fields)
    don_vi_dia_chi: draft.customer.legalAddress.trim(),
    legal_address_line: draft.customer.legalAddressLine.trim(),
    legal_ward: draft.customer.legalWard.trim(),
    legal_province: draft.customer.legalProvince.trim(),
    legal_full_address: draft.customer.legalFullAddress.trim(),
    don_vi_dien_thoai: draft.customer.phone.trim(),
    don_vi_email: draft.customer.email.trim(),
    don_vi_nguoi_dai_dien: draft.customer.representativeName.trim(),
    don_vi_chuc_vu: draft.customer.representativeTitle.trim(),
    don_vi_mst: draft.customer.taxCode.trim(),
    // Usage address (new structured fields)
    usage_same_as_legal: draft.location.usageSameAsLegal,
    usage_address_line: draft.location.usageAddressLine.trim(),
    usage_ward: draft.location.usageWard.trim(),
    usage_province: draft.location.usageProvince.trim(),
    usage_full_address: draft.location.usageFullAddress.trim(),
    // Legacy: keep full text for backward compat
    dia_chi_su_dung: draft.location.usageFullAddress.trim(),
    nguoi_thuc_hien_email: draft.assignee.email.trim(),
    ngay_bat_dau: draft.term.effectiveFrom,
    ngay_ket_thuc: draft.term.effectiveTo,
    // Karaoke specific: total rooms saved by calculator "Chốt 3 số tiền"
    // (used by filename builder and Word export total).
    tong_so_phong: draft.karaoke.totalRooms || 0,
    tong_so_box: draft.karaoke.totalBoxes || 0,
    loai_hinh_karaoke: draft.karaoke.karaokeType || 'PHONG',
    // Legacy financial fields
    so_tien_chua_gtgt_value: amountBeforeGtgt,
    thue_percent: vatRate,
    thue_gtgt_value: gtgtAmount,
    so_tien_value: totalAmount,
    renewal_status: draft.domain.renewalStatus || 'NEW',
    reference_contract_id: draft.domain.referenceContractId,
    reference_contract_no: draft.domain.referenceContractNo?.trim() || '',
    source_template_contract_id: draft.domain.sourceTemplateContractId,
    source_template_contract_no: draft.domain.sourceTemplateContractNo?.trim() || '',
    contract_terms_note: draft.notes.contractTerms.trim(),
    // Phase 2: Music usage areas
    music_usage_areas: musicUsageAreas,
    // Phase 2: Simplified royalty fields
    royalty_amount_before_vat: royaltyAmountBeforeVat,
    vat_rate: vatRate,
    vat_amount: gtgtAmount,
    royalty_amount_after_vat: royaltyAmountAfterVat,
    royalty_amount_in_words: numberToVietnameseWords(royaltyAmountAfterVat),
    // Phase BACKGROUND-TEMPLATE-REFACTOR: Export template selection
    contract_template_code: draft.contractTemplateCode,
  };
};

/**
 * Map draft to karaoke calculation input for dry-run API.
 */
export const mapDraftToKaraokeCalcInput = (
  draft: CreateContractDraft
): KaraokeCalculationInput => {
  return {
    contractNo: composeContractNo(draft),
    karaokeType: draft.karaoke.karaokeType,
    areaGroup: draft.karaoke.areaGroup,
    totalRooms: draft.karaoke.totalRooms,
    totalBoxes: draft.karaoke.totalBoxes,
    baseSalary: draft.karaoke.baseSalary,
    annualSupportPercent: draft.karaoke.annualSupportPercent,
    tier1SupportPercent: 0,
    tier2SupportPercent: 0,
    tier3SupportPercent: 0,
    gtgtPercent: draft.karaoke.gtgtPercent,
    startDate: draft.term.effectiveFrom,
    endDate: draft.term.effectiveTo,
    pricingRenderMode: draft.karaoke.pricingRenderMode,
    roomSections: draft.karaoke.roomSections,
  };
};

// =============================================================================
// KARAOKE CALCULATION RESULT PARSING
// =============================================================================

/**
 * Parse karaoke calculation response into structured result.
 */
export const parseKaraokeCalcResponse = (
  response: KaraokeCalculationResult
): {
  ok: boolean;
  termMonths: number;
  amountBeforeGtgt: number;
  gtgtAmount: number;
  totalAmount: number;
  effectiveAmountBeforeGtgt: number;
  effectiveTotalAmount: number;
  tierSummary: string;
  roomDisplayText: string;
  pricingDetailText: string;
  pricingTotalText: string;
} => {
  const calc = response.calculation;

  const tierSummary = calc.tiers
    .filter((t) => t.rooms > 0)
    .map((t) => `${t.name}: ${t.rooms} phòng x ${t.coefficient} = ${t.amount.toLocaleString('vi-VN')}đ`)
    .join(' | ');

  return {
    ok: response.ok,
    termMonths: calc.term_months,
    amountBeforeGtgt: calc.amount_before_gtgt,
    gtgtAmount: calc.gtgt_amount,
    totalAmount: calc.total_amount,
    effectiveAmountBeforeGtgt: calc.effective_amount_before_gtgt,
    effectiveTotalAmount: calc.effective_total_amount,
    tierSummary,
    roomDisplayText: calc.docx_context_preview.room_display_text,
    pricingDetailText: calc.docx_context_preview.pricing_detail_text,
    pricingTotalText: calc.docx_context_preview.pricing_total_text,
  };
};

// =============================================================================
// UPDATE HELPERS
// =============================================================================

/**
 * Create updater for a nested field in draft.
 */
export type DraftUpdater = (current: CreateContractDraft) => CreateContractDraft;

/**
 * Update common info fields.
 */
export const updateCommonField = (
  updater: (current: CreateContractDraft['common']) => CreateContractDraft['common']
): DraftUpdater => (current) => ({
  ...current,
  common: updater(current.common),
});

/**
 * Update customer info fields.
 */
export const updateCustomerField = (
  updater: (current: CreateContractDraft['customer']) => CreateContractDraft['customer']
): DraftUpdater => (current) => ({
  ...current,
  customer: updater(current.customer),
});

/**
 * Update location info fields.
 */
export const updateLocationField = (
  updater: (current: CreateContractDraft['location']) => CreateContractDraft['location']
): DraftUpdater => (current) => ({
  ...current,
  location: updater(current.location),
});

/**
 * Update term fields.
 */
export const updateTermField = (
  updater: (current: CreateContractDraft['term']) => CreateContractDraft['term']
): DraftUpdater => (current) => ({
  ...current,
  term: updater(current.term),
});

/**
 * Update assignee fields.
 */
export const updateAssigneeField = (
  updater: (current: CreateContractDraft['assignee']) => CreateContractDraft['assignee']
): DraftUpdater => (current) => ({
  ...current,
  assignee: updater(current.assignee),
});

/**
 * Update notes fields.
 */
export const updateNotesField = (
  updater: (current: CreateContractDraft['notes']) => CreateContractDraft['notes']
): DraftUpdater => (current) => ({
  ...current,
  notes: updater(current.notes),
});

/**
 * Update domain selection.
 */
export const updateDomainSelection = (code: BackgroundDomainCode): DraftUpdater => (
  current
) => ({
  ...current,
  domain: {
    ...current.domain,
    domainCode: code,
    domainDisplayName: getDomainDisplayName(code),
    // Only reset fieldCode to 'PR' if user has not explicitly selected one yet.
    // This prevents overwriting a user's MR selection when they switch domains.
    fieldCode: current.common.fieldCode || getCanonicalFieldCode(code),
    renewalStatus: current.domain.renewalStatus || 'NEW',
    referenceContractId: current.domain.referenceContractId,
    referenceContractNo: current.domain.referenceContractNo,
  },
  karaoke: isKaraokeCalcDomain(code) ? current.karaoke : {
    karaokeType: 'PHONG' as const,
    areaGroup: 'DEN_20' as const,
    totalRooms: 0,
    totalBoxes: 0,
    baseSalary: DEFAULT_BASE_SALARY_VND,
    annualSupportPercent: 0,
    tier1SupportPercent: 0,
    tier2SupportPercent: 0,
    tier3SupportPercent: 0,
    gtgtPercent: DEFAULT_GTGT_PERCENT,
    pricingRenderMode: 'text' as const,
    roomSections: [],
  },
  areaBased: isAreaBasedDomain(code) ? current.areaBased : createDefaultAreaBasedUsageInfo(),
});

/**
 * Update karaoke usage fields.
 */
export const updateKaraokeField = (
  updater: (current: CreateContractDraft['karaoke']) => CreateContractDraft['karaoke']
): DraftUpdater => (current) => ({
  ...current,
  karaoke: updater(current.karaoke),
});

/**
 * Update area-based usage fields.
 */
export const updateAreaBasedField = (
  updater: (current: CreateContractDraft['areaBased']) => CreateContractDraft['areaBased']
): DraftUpdater => (current) => ({
  ...current,
  areaBased: updater(current.areaBased),
});

/**
 * Update calculation lines.
 */
export const updateCalculationLines = (
  lines: RoyaltyCalculationLine[]
): DraftUpdater => (current) => ({
  ...current,
  calculationLines: lines,
});

/**
 * Update a single calculation line by ID.
 */
export const updateCalculationLineById = (
  lineId: string,
  updater: (current: RoyaltyCalculationLine) => RoyaltyCalculationLine
): DraftUpdater => (current) => ({
  ...current,
  calculationLines: current.calculationLines.map((line) =>
    line.id === lineId ? updater(line) : line
  ),
});

/**
 * Add a new calculation line.
 */
export const addCalculationLine = (
  module: CalculationModuleCode
): DraftUpdater => (current) => {
  const newLine = createCalculationLine(module, current.calculationLines.length);
  return {
    ...current,
    calculationLines: [...current.calculationLines, newLine],
  };
};

/**
 * Remove a calculation line by ID.
 */
export const removeCalculationLineById = (
  lineId: string
): DraftUpdater => (current) => ({
  ...current,
  calculationLines: (current.calculationLines ?? []).filter((line) => line.id !== lineId),
});

/**
 * Enable or disable a calculation line.
 */
export const toggleCalculationLineEnabled = (
  lineId: string
): DraftUpdater => (current) => ({
  ...current,
  calculationLines: current.calculationLines.map((line) =>
    line.id === lineId ? { ...line, enabled: !line.enabled } : line
  ),
});

/**
 * Sync karaoke fields with domain changes.
 * When domain changes, reset karaoke fields appropriately.
 */
export const syncKaraokeWithDomain = (domainCode: BackgroundDomainCode): DraftUpdater => (
  current
) => {
  if (isKaraokeCalcDomain(domainCode)) {
    // Keep existing karaoke fields
    return current;
  }
  // Reset karaoke fields for non-karaoke domains
  return {
    ...current,
    karaoke: {
      karaokeType: 'PHONG',
      areaGroup: 'DEN_20',
      totalRooms: 0,
      totalBoxes: 0,
      baseSalary: DEFAULT_BASE_SALARY_VND,
      annualSupportPercent: 0,
      tier1SupportPercent: 0,
      tier2SupportPercent: 0,
      tier3SupportPercent: 0,
      gtgtPercent: DEFAULT_GTGT_PERCENT,
      pricingRenderMode: 'text',
      roomSections: [],
    },
  };
};

/**
 * Sync area-based fields with domain changes.
 * When domain changes, reset area-based fields appropriately.
 */
export const syncAreaBasedWithDomain = (domainCode: BackgroundDomainCode): DraftUpdater => (
  current
) => {
  if (isAreaBasedDomain(domainCode)) {
    // Keep existing area-based fields
    return current;
  }
  // Reset area-based fields for non-area-based domains
  return {
    ...current,
    areaBased: createDefaultAreaBasedUsageInfo(),
  };
};

// =============================================================================
// CALCULATION LINE HELPERS
// =============================================================================

/**
 * Get module status for a calculation module code.
 * PHASE KVC-05: KVC_ND17 is now implemented.
 */
export const getModuleStatus = (module: CalculationModuleCode): 'implemented' | 'planned' | 'disabled' | 'locked' => {
  switch (module) {
    case 'KARAOKE_PHONG':
    case 'KARAOKE_BOX':
    case 'KVC_VCPMC_TARIFF':
    case 'KVC_ND17':
    case 'CAFE':
    case 'NHA_HANG':
    case 'KHACH_SAN':
    case 'MANUAL_FEE':
      return 'implemented';
    case 'CUSTOM_PLACEHOLDER':
      return 'disabled';
    default:
      return 'locked';
  }
};

/**
 * Check if a calculation module is implemented.
 */
export const isModuleImplemented = (module: CalculationModuleCode): boolean => {
  return getModuleStatus(module) === 'implemented';
};

/**
 * Check if a calculation module is available for selection.
 */
export const isModuleAvailable = (module: CalculationModuleCode): boolean => {
  const status = getModuleStatus(module);
  return status === 'implemented';
};

/**
 * Get module display name.
 */
export const getModuleDisplayName = (module: CalculationModuleCode): string => {
  switch (module) {
    case 'KARAOKE_PHONG':
      return 'Karaoke Phòng';
    case 'KARAOKE_BOX':
      return 'Karaoke Box';
    case 'KVC_VCPMC_TARIFF':
      return 'KVC - Biểu giá VCPMC';
    case 'KVC_ND17':
      return 'KVC - NĐ17/2023';
    case 'CAFE':
      return 'Cà phê';
    case 'NHA_HANG':
      return 'Nhà hàng';
    case 'KHACH_SAN':
      return 'Khách sạn';
    case 'CUSTOM_PLACEHOLDER':
      return 'Tùy chỉnh';
    default:
      return module;
  }
};

/**
 * Create a new calculation line with default values.
 */
export const createCalculationLine = (
  module: CalculationModuleCode,
  existingLinesCount: number,
  allLocationIds: string[] = [],
): RoyaltyCalculationLine => {
  const moduleLabel = getModuleDisplayName(module);
  const lineNumber = existingLinesCount + 1;

  const defaultInput: CalculationLineInput = createDefaultLineInput(module);

  const isKvcModule = module === 'KVC_VCPMC_TARIFF' || module === 'KVC_ND17';

  return {
    id: `${CALC_LINE_ID_PREFIX}${Date.now()}-${existingLinesCount}`,
    label: `${moduleLabel} ${lineNumber}`,
    calculationModule: module,
    enabled: true,
    appliesToLocationIds: isKvcModule ? allLocationIds : [],
    input: defaultInput,
    result: null,
    status: isModuleImplemented(module) ? 'idle' : 'disabled',
    errors: [],
    warnings: [],
  };
};

/**
 * Create default input for a calculation line based on module type.
 */
export const createDefaultLineInput = (module: CalculationModuleCode): CalculationLineInput => {
  switch (module) {
    case 'KARAOKE_PHONG':
      return {
        module: 'KARAOKE_PHONG',
        areaGroup: 'DEN_20',
        totalRooms: 0,
        baseSalary: DEFAULT_BASE_SALARY_VND,
        annualSupportPercent: 0,
        tier1SupportPercent: 0,
        tier2SupportPercent: 0,
        tier3SupportPercent: 0,
        gtgtPercent: DEFAULT_GTGT_PERCENT,
      };
    case 'KARAOKE_BOX':
      return {
        module: 'KARAOKE_BOX',
        totalBoxes: 0,
        baseSalary: DEFAULT_BASE_SALARY_VND,
        gtgtPercent: DEFAULT_GTGT_PERCENT,
      };
    case 'KVC_VCPMC_TARIFF':
      return {
        module: 'KVC_VCPMC_TARIFF',
        gtgtPercent: DEFAULT_GTGT_PERCENT,
        supportPercent: 0,
        supportAmount: 0,
        usageDisplayMode: 'auto',
      };
    case 'KVC_ND17':
      return {
        module: 'KVC_ND17',
        baseSalary: DEFAULT_BASE_SALARY_VND,
        gtgtPercent: DEFAULT_GTGT_PERCENT,
        supportPercent: 0,
        supportAmount: 0,
        urbanClass: 'HN_HCM',
        usageDisplayMode: 'auto',
      };
    case 'CAFE':
      return {
        module: 'CAFE',
        locationAreas: [],
      };
    case 'NHA_HANG':
      return {
        module: 'NHA_HANG',
        locationAreas: [],
      };
    case 'KHACH_SAN':
      return {
        module: 'KHACH_SAN',
        locationAreas: [],
      };
    case 'MANUAL_FEE':
      return {
        module: 'MANUAL_FEE',
        tienChuaGtgt: 0,
        gtgtPercent: DEFAULT_GTGT_PERCENT,
        gtgtAmount: 0,
        tienSauThue: 0,
      };
    case 'CUSTOM_PLACEHOLDER':
    default:
      return {
        module: 'CUSTOM_PLACEHOLDER',
        customData: {},
      };
  }
};

/**
 * Aggregate calculation results from multiple lines (frontend-only preview).
 */
export const aggregateCalculationLines = (
  lines: RoyaltyCalculationLine[],
  contractTermMonths: number
): CalculationAggregation => {
  const enabledLines = lines.filter((line) => line.enabled && line.result);
  const calculatedLines = lines.filter((line) => line.enabled && line.result);

  let subtotalBeforeGtgt = 0;
  let gtgtAmount = 0;
  let totalAmount = 0;
  let effectiveTotalAmount = 0;

  const allWarnings: { field: string; message: string }[] = [];
  const allErrors: { field: string; message: string }[] = [];

  for (const line of calculatedLines) {
    if (line.result) {
      subtotalBeforeGtgt += line.result.subtotalBeforeGtgt;
      gtgtAmount += line.result.gtgtAmount;
      totalAmount += line.result.totalAmount;
      effectiveTotalAmount += line.result.effectiveTotalAmount;

      // Collect warnings and errors
      if (line.result.warnings) {
        allWarnings.push(...line.result.warnings.map((w) => ({
          field: `${line.label}.${w.field}`,
          message: w.message,
        })));
      }
      if (line.result.errors) {
        allErrors.push(...line.result.errors.map((e) => ({
          field: `${line.label}.${e.field}`,
          message: e.message,
        })));
      }
    }
  }

  // Add warnings for disabled/undone lines
  const disabledLines = lines.filter(
    (line) => line.enabled && !line.result && line.status !== 'disabled'
  );
  if (disabledLines.length > 0) {
    allWarnings.push({
      field: 'calculationLines',
      message: `${disabledLines.length} khoản tính đã bật nhưng chưa tính.`,
    });
  }

  const undonesLines = lines.filter(
    (line) => line.enabled && line.status === 'idle'
  );
  if (undonesLines.length > 0) {
    allWarnings.push({
      field: 'calculationLines',
      message: `${undonesLines.length} khoản tính đã bật nhưng chưa nhấn "Tính thử".`,
    });
  }

  return {
    subtotalBeforeGtgt,
    gtgtAmount,
    totalAmount,
    effectiveTotalAmount,
    warnings: allWarnings,
    errors: allErrors,
    enabledLineCount: enabledLines.length,
    calculatedLineCount: calculatedLines.length,
  };
};

/**
 * Map a karaoke calculation line input to the API request format.
 */
export const mapLineInputToKaraokeCalc = (
  input: CalculationLineInput,
  contractNo: string,
  startDate: string,
  endDate: string,
  pricingRenderMode: 'text' | 'table' = 'text',
  roomSections: { key: string; roomCount: number; roomNames: string }[] = []
): KaraokeCalculationInput | null => {
  if (input.module === 'KARAOKE_PHONG') {
    return {
      contractNo,
      karaokeType: 'PHONG',
      areaGroup: input.areaGroup,
      totalRooms: input.totalRooms,
      totalBoxes: 0,
      baseSalary: input.baseSalary,
      annualSupportPercent: input.annualSupportPercent,
      tier1SupportPercent: 0,
      tier2SupportPercent: 0,
      tier3SupportPercent: 0,
      gtgtPercent: input.gtgtPercent,
      startDate,
      endDate,
      pricingRenderMode,
      roomSections,
    };
  }

  if (input.module === 'KARAOKE_BOX') {
    return {
      contractNo,
      karaokeType: 'BOX',
      areaGroup: 'BOX',
      totalRooms: 0,
      totalBoxes: input.totalBoxes,
      baseSalary: input.baseSalary,
      annualSupportPercent: 0,
      tier1SupportPercent: 0,
      tier2SupportPercent: 0,
      tier3SupportPercent: 0,
      gtgtPercent: input.gtgtPercent,
      startDate,
      endDate,
      pricingRenderMode,
      roomSections,
    };
  }

  return null;
};

/**
 * Map karaoke API response to calculation line result.
 */
export const mapKaraokeResponseToLineResult = (
  response: KaraokeCalculationResult
): CalculationLineResult => {
  const calc = response.calculation;

  // Build detailRows from tiers BEFORE support is applied
  // This shows the user what the full (non-discounted) amounts are
  const detailRows: CalculationDetailRow[] = calc.tiers
    .filter((t) => t.rooms > 0)
    .map((tier) => ({
      label: tier.name,
      value: tier.amount,
      formula: `${tier.rooms} phòng × ${tier.coefficient}`,
      coefficient: tier.coefficient,
    }));

  const warnings = response.warnings.map((w) => ({
    field: w.field,
    message: w.message,
    severity: 'warning',
  }));

  const errors = response.errors.map((e) => ({
    field: e.field,
    message: e.message,
  }));

  // subtotalBeforeGtgt = subtotal BEFORE support (full amount before discount)
  // This is what the table should show as the "before support" row
  const subtotalBeforeSupport = calc.subtotal_before_support;
  const supportAmount = calc.annual_support_amount;
  const amountAfterSupport = calc.amount_before_gtgt; // This is after support

  return {
    termMonths: calc.term_months,
    subtotalBeforeGtgt: subtotalBeforeSupport, // Use subtotal_before_support
    gtgtAmount: calc.gtgt_amount,
    totalAmount: calc.total_amount,
    effectiveSubtotalBeforeGtgt: calc.effective_amount_before_gtgt,
    effectiveTotalAmount: calc.effective_total_amount,
    detailRows,
    warnings,
    errors,
    docxContextPreview: {
      roomDisplayText: calc.docx_context_preview.room_display_text,
      pricingDetailText: calc.docx_context_preview.pricing_detail_text,
      pricingTotalText: calc.docx_context_preview.pricing_total_text,
      karaokePricingRenderMode: calc.docx_context_preview.karaoke_pricing_render_mode,
    },
  };
};

/**
 * Map KVC VCPMC tariff API response to calculation line result.
 * PHASE KVC-02b: Backend is source of truth for KVC money calculations.
 */
export const mapKvcResponseToLineResult = (
  response: KvcCalculationResult
): CalculationLineResult => {
  const calc = response.calculation;

  const detailRows: CalculationDetailRow[] = calc.detail_rows.map((row) => ({
    label: row.location_name,
    value: row.location_subtotal,
    formula: `${row.area_m2}m² → ${row.increment_blocks} blocks × 400,000đ`,
    blocks: row.increment_blocks,
  }));

  const warnings = response.warnings.map((w) => ({
    field: w.field,
    message: w.message,
    severity: w.severity as 'warning' | 'info',
  }));

  const errors = response.errors.map((e) => ({
    field: e.field,
    message: e.message,
  }));

  return {
    termMonths: 0,
    subtotalBeforeGtgt: calc.subtotal_before_support,
    gtgtAmount: calc.gtgt_amount,
    totalAmount: calc.total_amount,
    effectiveSubtotalBeforeGtgt: calc.amount_after_support,
    effectiveTotalAmount: calc.total_amount,
    detailRows,
    warnings,
    errors,
    docxContextPreview: {
      locationsTableText: calc.subtotal_before_support > 0
        ? response.docx_context_preview.locations_table_text
        : '',
      pricingDetailText: response.docx_context_preview.pricing_detail_text,
      pricingTotalText: response.docx_context_preview.pricing_total_text,
      kvcPricingMode: response.docx_context_preview.pricing_mode,
    } as Record<string, string>,
  };
};

/**
 * Map KVC ND17 API response to calculation line result.
 * PHASE KVC-05: ND17 calculation based on Phụ lục II Mục 8.
 */
export const mapKvcNd17ResponseToLineResult = (
  response: KvcNd17Result
): CalculationLineResult => {
  const calc = response.calculation;

  if (!calc) {
    return {
      termMonths: 0,
      subtotalBeforeGtgt: 0,
      gtgtAmount: 0,
      totalAmount: 0,
      effectiveSubtotalBeforeGtgt: 0,
      effectiveTotalAmount: 0,
      detailRows: [],
      warnings: response.warnings.map((w) => ({
        field: w.field,
        message: w.message,
        severity: w.severity as 'warning' | 'info',
      })),
      errors: response.errors.map((e) => ({
        field: e.field,
        message: e.message,
      })),
      docxContextPreview: {},
    };
  }

  const detailRows: CalculationDetailRow[] = calc.detail_rows.map((row) => ({
    label: row.location_name,
    value: row.urban_adjusted_amount,
    formula: `${row.area_m2}m² → hệ số ${row.coefficient.toFixed(4)} → ${formatVND(row.urban_adjusted_amount)}`,
    blocks: 0,
  }));

  const warnings = response.warnings.map((w) => ({
    field: w.field,
    message: w.message,
    severity: w.severity as 'warning' | 'info',
  }));

  const errors = response.errors.map((e) => ({
    field: e.field,
    message: e.message,
  }));

  return {
    termMonths: 0,
    subtotalBeforeGtgt: calc.subtotal_after_urban,
    gtgtAmount: calc.gtgt_amount,
    totalAmount: calc.total_amount,
    effectiveSubtotalBeforeGtgt: calc.amount_after_support,
    effectiveTotalAmount: calc.total_amount,
    detailRows,
    warnings,
    errors,
    docxContextPreview: {
      locationsTableText: calc.subtotal_after_urban > 0
        ? `ND17 - ${response.input_echo.urban_class || 'HN/HCM'} - Hệ số ${response.input_echo.urban_rate}`
        : '',
      pricingDetailText: calc.detail_rows.map((r) =>
        `${r.location_name}: ${r.area_m2}m², hệ số ${r.coefficient.toFixed(4)}, thành tiền ${formatVND(r.urban_adjusted_amount)}`
      ).join('\n'),
      pricingTotalText: `Tổng: ${formatVND(calc.subtotal_after_urban)}đ\n` +
        (calc.support_amount > 0 ? `Hỗ trợ: -${formatVND(calc.support_amount)}đ\n` : '') +
        `Chưa GTGT: ${formatVND(calc.amount_after_support)}đ\n` +
        `GTGT ${calc.gtgt_percent}%: +${formatVND(calc.gtgt_amount)}đ\n` +
        `Tổng cộng: ${formatVND(calc.total_amount)}đ`,
      kvcPricingMode: 'ND17',
    } as Record<string, string>,
  };
};

function formatVND(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

// =============================================================================
// BUSINESS USAGE LOCATION HELPERS
// =============================================================================

/**
 * Create a new business usage location with default values.
 */
export const createDefaultBusinessLocation = (
  existingLocationsCount: number = 0
): BusinessUsageLocation => {
  return {
    id: `${LOCATION_ID_PREFIX}${Date.now()}-${existingLocationsCount}`,
    locationName: '',
    businessAddress: '',
    musicUsageAreaM2: 0,
    musicUsageType: 'NHAC_NEN',
    note: '',
  };
};

/**
 * Create default area-based usage info with one location.
 */
export const createDefaultAreaBasedUsageInfo = (): AreaBasedUsageInfo => {
  return {
    locations: [createDefaultBusinessLocation(0)],
    musicUsageAreas: [],
    displayMode: 'auto',
    pricingMode: undefined,
    // Legacy fields (deprecated)
    usageKind: 'NHAC_NEN',
    totalAreaM2: 0,
    musicUsageAreaM2: 0,
    numberOfFloors: 1,
    numberOfZones: 1,
    hasBackgroundMusic: false,
    hasLiveMusic: false,
    hasDj: false,
    hasKaraokeActivity: false,
    operatingModel: 'CHINH_HOP',
    usageDescription: '',
    areaNotes: '',
    pricingMethod: '',
    usageSections: [],
  };
};

/**
 * Create a default music usage area row.
 */
export const createDefaultMusicUsageArea = (): MusicUsageArea => {
  return {
    id: `mua-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    areaName: '',
    scaleDescription: '',
    musicUsageType: '',
  };
};

/**
 * Add a new location to area-based usage.
 */
export const addBusinessLocation = (
  areaBased: AreaBasedUsageInfo
): AreaBasedUsageInfo => {
  return {
    ...areaBased,
    locations: [...areaBased.locations, createDefaultBusinessLocation(areaBased.locations.length)],
  };
};

/**
 * Remove a location from area-based usage.
 */
export const removeBusinessLocation = (
  areaBased: AreaBasedUsageInfo,
  locationId: string
): AreaBasedUsageInfo => {
  const newLocations = areaBased.locations.filter((loc) => loc.id !== locationId);
  // Ensure at least one location exists
  if (newLocations.length === 0) {
    newLocations.push(createDefaultBusinessLocation(0));
  }
  return {
    ...areaBased,
    locations: newLocations,
  };
};

/**
 * Update a location by ID.
 */
export const updateBusinessLocation = (
  areaBased: AreaBasedUsageInfo,
  locationId: string,
  updater: (location: BusinessUsageLocation) => BusinessUsageLocation
): AreaBasedUsageInfo => {
  return {
    ...areaBased,
    locations: areaBased.locations.map((loc) =>
      loc.id === locationId ? updater(loc) : loc
    ),
  };
};

/**
 * Get effective display mode based on location count.
 * - If displayMode is 'auto', use text for 1 location, table for 2+
 * - Otherwise, use the selected mode
 */
export const getEffectiveDisplayMode = (
  displayMode: AreaUsageDisplayMode,
  locationCount: number
): 'text' | 'table' => {
  if (displayMode === 'auto') {
    return locationCount >= 2 ? 'table' : 'text';
  }
  return displayMode;
};

/**
 * Build usage text preview for a single location.
 */
export const buildLocationTextPreview = (location: BusinessUsageLocation): string => {
  const parts: string[] = [];

  if (location.locationName) {
    parts.push(location.locationName);
  }

  if (location.businessAddress) {
    parts.push(`Địa chỉ: ${location.businessAddress}`);
  }

  if (location.musicUsageAreaM2 > 0) {
    parts.push(`Diện tích sử dụng âm nhạc: ${location.musicUsageAreaM2}m²`);
  }

  const usageTypeLabel = getMusicUsageTypeLabel(location.musicUsageType);
  if (usageTypeLabel) {
    parts.push(`Hình thức: ${usageTypeLabel}`);
  }

  if (location.note) {
    parts.push(`Ghi chú: ${location.note}`);
  }

  return parts.join(' · ');
};

/**
 * Build usage text preview for all locations (paragraph style for 1, bullet for 2+).
 */
export const buildUsageTextPreview = (
  locations: BusinessUsageLocation[],
  displayMode: AreaUsageDisplayMode
): string => {
  if (locations.length === 0) {
    return '(Chưa có khu vực sử dụng âm nhạc)';
  }

  if (locations.length === 1) {
    return buildLocationTextPreview(locations[0]);
  }

  // Multiple locations - bullet list style
  return locations
    .map((loc, idx) => `${idx + 1}. ${buildLocationTextPreview(loc)}`)
    .join('\n');
};

/**
 * Build usage table preview.
 */
export const buildUsageTablePreview = (
  locations: BusinessUsageLocation[]
): { headers: string[]; rows: string[][] } => {
  const headers = [
    'Địa điểm',
    'Địa chỉ kinh doanh',
    'Diện tích sử dụng âm nhạc (m²)',
    'Hình thức sử dụng',
  ];

  const rows = locations.map((loc) => [
    loc.locationName || '(chưa có)',
    loc.businessAddress || '(chưa có)',
    loc.musicUsageAreaM2 > 0 ? String(loc.musicUsageAreaM2) : '-',
    getMusicUsageTypeLabel(loc.musicUsageType),
  ]);

  return { headers, rows };
};

/**
 * Get display label for music usage type.
 */
export const getMusicUsageTypeLabel = (
  usageType: 'NHAC_NEN' | 'LIVE_ACOUSTIC' | 'DJ' | 'KARAOKE' | 'MIXED'
): string => {
  const labels: Record<string, string> = {
    NHAC_NEN: 'Nhạc nền',
    LIVE_ACOUSTIC: 'Live / Acoustic',
    DJ: 'DJ',
    KARAOKE: 'Karaoke',
    MIXED: 'Hỗn hợp',
  };
  return labels[usageType] || usageType;
};

/**
 * Get display label for KVC pricing mode.
 */
export const getKvcPricingModeLabel = (mode: KvcPricingMode): string => {
  const labels: Record<KvcPricingMode, string> = {
    VCPMC_TARIFF: 'Theo biểu giá VCPMC',
    ND17: 'Áp dụng Nghị định 17/2023',
  };
  return labels[mode] || mode;
};

// =============================================================================
// KVC VCPMC TARIFF CALCULATION (PHASE KVC-02)
// =============================================================================

/**
 * User-confirmed rounding rule for KVC VCPMC tariff increment blocks.
 *
 * IMPORTANT: Do NOT use Math.ceil or banker'larounding.
 *
 * Rules:
 * - raw_blocks = (area_m2 - 50) / 50
 * - decimal part < 0.5 => round down (floor)
 * - decimal part >= 0.5 => round up (floor + 1)
 * - exactly 0.5 => round up
 *
 * Examples:
 * - 16.1 => 16 (decimal 0.1 < 0.5)
 * - 16.49 => 16 (decimal 0.49 < 0.5)
 * - 16.5 => 17 (decimal 0.5 >= 0.5)
 * - 16.51 => 17 (decimal 0.51 >= 0.5)
 * - 17.0 => 17 (no decimal)
 * - 0.5 => 1 (boundary case)
 * - 0.49 => 0 (below 0.5)
 */
export const roundIncrementBlocksHalfUp = (rawBlocks: number): number => {
  if (rawBlocks <= 0) return 0;
  const floorValue = Math.floor(rawBlocks);
  const decimalPart = rawBlocks - floorValue;
  // Round up if decimal >= 0.5, otherwise round down
  return decimalPart >= 0.5 ? floorValue + 1 : floorValue;
};

/**
 * Calculate KVC VCPMC tariff for a single location.
 *
 * Formula:
 * 1. Base: 1,000,000 VND for 1-50m²
 * 2. Increment: raw_blocks = (area - 50) / 50
 *    - Round increment_blocks using half-up rule
 *    - increment_amount = increment_blocks * 400,000
 * 3. Location subtotal = base_fee + increment_amount
 */
export const calculateVcpmcTariffLocation = (
  areaM2: number,
  locationId: string,
  locationName: string = ''
): VcpmcTariffLocationResult => {
  const excessArea = Math.max(0, areaM2 - KVC_BASE_INCLUDED_AREA_M2);
  const rawBlocks = excessArea / KVC_BLOCK_SIZE_M2;
  const incrementBlocks = roundIncrementBlocksHalfUp(rawBlocks);
  const baseFee = KVC_BASE_FEE_VND;
  const incrementAmount = incrementBlocks * KVC_INCREMENT_FEE_VND;
  const locationSubtotal = baseFee + incrementAmount;

  return {
    locationId,
    locationName,
    areaM2,
    baseIncludedAreaM2: KVC_BASE_INCLUDED_AREA_M2,
    excessAreaM2: excessArea,
    rawIncrementBlocks: rawBlocks,
    incrementBlocks,
    baseFee,
    incrementFeePerBlock: KVC_INCREMENT_FEE_VND,
    incrementAmount,
    locationSubtotal,
  };
};

/**
 * Calculate KVC VCPMC tariff for all locations and aggregate.
 *
 * Formula:
 * 1. Calculate each location separately
 * 2. Sum subtotals to get subtotalBeforeSupport
 * 3. Apply support amount (before GTGT)
 * 4. Calculate GTGT on amount after support
 * 5. total = amountAfterSupport + GTGT
 *
 * CityGamesPlus example verification:
 * - 855m²: excess = 805, raw = 16.1, blocks = 16, subtotal = 1,000,000 + 6,400,000 = 7,400,000
 * - 701m²: excess = 651, raw = 13.02, blocks = 13, subtotal = 1,000,000 + 5,200,000 = 6,200,000
 * - 920m²: excess = 870, raw = 17.4, blocks = 17, subtotal = 1,000,000 + 6,800,000 = 7,800,000
 * - subtotalBeforeSupport = 21,400,000
 * - support = 0
 * - amountAfterSupport = 21,400,000
 * - GTGT 8% = 1,712,000
 * - total = 23,112,000
 */
export const calculateVcpmcTariff = (
  locations: { id: string; name: string; areaM2: number }[],
  gtgtPercent: number,
  supportAmount: number = 0
): VcpmcTariffResult => {
  // Calculate each location
  const locationResults = locations.map((loc) =>
    calculateVcpmcTariffLocation(loc.areaM2, loc.id, loc.name)
  );

  // Sum subtotals
  const subtotalBeforeSupport = locationResults.reduce(
    (sum, loc) => sum + loc.locationSubtotal,
    0
  );

  // Apply support (before GTGT)
  const amountAfterSupport = Math.max(0, subtotalBeforeSupport - supportAmount);

  // Calculate GTGT (rounded)
  const gtgtAmount = Math.round(amountAfterSupport * gtgtPercent / 100);

  // Total
  const totalAmount = amountAfterSupport + gtgtAmount;

  // Build detail rows
  const detailRows = locationResults.map((loc) => ({
    locationName: loc.locationName || loc.locationId,
    areaM2: loc.areaM2,
    baseFee: loc.baseFee,
    incrementBlocks: loc.incrementBlocks,
    incrementAmount: loc.incrementAmount,
    locationSubtotal: loc.locationSubtotal,
  }));

  // Build summary text
  const locationSummary = locationResults
    .map((loc) => `${loc.locationName || loc.locationId}: ${loc.areaM2}m² → ${loc.incrementBlocks} blocks = ${loc.locationSubtotal.toLocaleString('vi-VN')}đ`)
    .join('\n');

  const summaryText = [
    `KVC VCPMC Tariff (${locations.length} địa điểm):`,
    locationSummary,
    `---`,
    `Subtotal: ${subtotalBeforeSupport.toLocaleString('vi-VN')}đ`,
    supportAmount > 0 ? `Hỗ trợ: -${supportAmount.toLocaleString('vi-VN')}đ` : null,
    `Sau hỗ trợ: ${amountAfterSupport.toLocaleString('vi-VN')}đ`,
    `GTGT ${gtgtPercent}%: +${gtgtAmount.toLocaleString('vi-VN')}đ`,
    `---`,
    `Tổng cộng: ${totalAmount.toLocaleString('vi-VN')}đ`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ok: true,
    locations: locationResults,
    subtotalBeforeSupport,
    supportAmount,
    amountAfterSupport,
    gtgtPercent,
    gtgtAmount,
    totalAmount,
    summaryText,
    detailRows,
  };
};

// =============================================================================
// DB TARGET HINTS
// =============================================================================

export const CONTRACT_CREATE_DB_TARGET_HINTS: DbTargetHint[] = [
  {
    field: 'common.contractNumber',
    dbTable: 'contract_records',
    dbColumn: 'contract_no',
    risk: 'high',
    note: 'Full contract number composition and duplicate rules must be checked by dry-run.',
  },
  {
    field: 'domain.domainCode',
    dbTable: 'contract_records',
    dbColumn: 'linh_vuc',
    risk: 'high',
    note: 'Karaoke and Phong thu am must stay distinct; legacy Phong ghi am is alias only.',
  },
  {
    field: 'karaoke.baseSalary',
    dbTable: 'contract_records',
    dbColumn: 'muc_luong_co_so',
    risk: 'high',
    note: 'Mức lương cơ sở: 2,530,000 đồng/tháng theo Nghị định 161/2026/NĐ-CP, Điều 3 khoản 2 (hiệu lực 01/07/2026).',
  },
  {
    field: 'term.effectiveFrom/term.effectiveTo',
    dbTable: 'contract_records',
    dbColumn: 'ngay_bat_dau/ngay_ket_thuc',
    risk: 'high',
    note: 'Old Karaoke flow has date repair logic; dry-run must validate.',
  },
  {
    field: 'notes.internal',
    dbTable: 'contracts',
    dbColumn: 'internal_note',
    risk: 'medium',
    note: 'Normalized table target is unresolved; do not submit in first write.',
  },
];

// =============================================================================
// LEGACY MAPPER COMPATIBILITY
// =============================================================================

/**
 * Convert old draft structure to new structure.
 * Used for backward compatibility during migration.
 */
export const migrateLegacyDraft = (
  legacyDraft: Record<string, unknown>
): CreateContractDraft => {
  const defaultDraft = createDefaultContractDraft();

  return {
    ...defaultDraft,
    common: {
      contractNumber: String((legacyDraft as Record<string, unknown>).contractNumber || legacyDraft?.contract?.numberPart || ''),
      signedDate: String((legacyDraft as Record<string, unknown>).signedDate || legacyDraft?.contract?.signedDate || ''),
      contractYear: String((legacyDraft as Record<string, unknown>).contractYear || legacyDraft?.contract?.year || ''),
      regionCode: String((legacyDraft as Record<string, unknown>).regionCode || legacyDraft?.contract?.regionCode || ''),
      areaCode: String((legacyDraft as Record<string, unknown>).areaCode || legacyDraft?.contract?.areaCode || ''),
      fieldCode: String((legacyDraft as Record<string, unknown>).fieldCode || legacyDraft?.contract?.fieldCode || ''),
    },
    customer: {
      legalName: String((legacyDraft as Record<string, unknown>).legalName || legacyDraft?.customer?.legalName || ''),
      brandName: String((legacyDraft as Record<string, unknown>).brandName || legacyDraft?.customer?.brandName || ''),
      representativeName: String((legacyDraft as Record<string, unknown>).representative || legacyDraft?.customer?.representative || ''),
      representativeTitle: String((legacyDraft as Record<string, unknown>).position || legacyDraft?.customer?.position || ''),
      taxCode: String((legacyDraft as Record<string, unknown>).taxCode || legacyDraft?.customer?.taxCode || ''),
      cccd: '',
      phone: String((legacyDraft as Record<string, unknown>).phone || legacyDraft?.customer?.phone || ''),
      email: String((legacyDraft as Record<string, unknown>).email || legacyDraft?.customer?.email || ''),
      // Backward compat: treat full legalAddress as full_address
      legalAddress: String((legacyDraft as Record<string, unknown>).legalAddress || legacyDraft?.customer?.legalAddress || ''),
      legalAddressLine: String((legacyDraft as Record<string, unknown>).addressLine || ''),
      legalWard: String((legacyDraft as Record<string, unknown>).ward || legacyDraft?.customer?.ward || ''),
      legalProvince: String((legacyDraft as Record<string, unknown>).province || legacyDraft?.customer?.province || ''),
      legalFullAddress: String((legacyDraft as Record<string, unknown>).legalAddress || legacyDraft?.customer?.legalAddress || ''),
    },
    location: {
      usageSameAsLegal: false,
      usageAddress: String((legacyDraft as Record<string, unknown>).businessAddress || legacyDraft?.location?.businessAddress || ''),
      usageAddressLine: String((legacyDraft as Record<string, unknown>).usageAddressLine || ''),
      usageWard: String((legacyDraft as Record<string, unknown>).ward || legacyDraft?.location?.ward || ''),
      usageProvince: String((legacyDraft as Record<string, unknown>).city || legacyDraft?.location?.city || ''),
      usageFullAddress: String((legacyDraft as Record<string, unknown>).businessAddress || legacyDraft?.location?.businessAddress || ''),
      city: '',
      district: '',
      ward: '',
    },
    term: {
      effectiveFrom: String((legacyDraft as Record<string, unknown>).startDate || legacyDraft?.dates?.startDate || ''),
      effectiveTo: String((legacyDraft as Record<string, unknown>).endDate || legacyDraft?.dates?.endDate || ''),
    },
    assignee: {
      email: String((legacyDraft as Record<string, unknown>).assigneeEmail || legacyDraft?.assignee?.email || ''),
    },
    notes: {
      internal: String((legacyDraft as Record<string, unknown>).internalNotes || legacyDraft?.notes?.internal || ''),
      contractTerms: String((legacyDraft as Record<string, unknown>).contractTerms || legacyDraft?.notes?.contractTerms || ''),
    },
    domain: {
      domainGroup: 'background',
      domainCode: String((legacyDraft as Record<string, unknown>).linhVuc || legacyDraft?.domain?.code || 'KARAOKE') as BackgroundDomainCode,
      domainDisplayName: String((legacyDraft as Record<string, unknown>).linhVucHienThi || legacyDraft?.domain?.displayName || 'Karaoke'),
      renewalStatus: 'NEW',
      referenceContractId: null,
      referenceContractNo: '',
    },
    karaoke: {
      karaokeType: String((legacyDraft as Record<string, unknown>).loaiHinh || legacyDraft?.domain?.karaokeUsageType || 'PHONG') as 'PHONG' | 'BOX',
      areaGroup: 'DEN_20',
      totalRooms: Number((legacyDraft as Record<string, unknown>).rooms || legacyDraft?.karaokeBackground?.rooms || 0),
      totalBoxes: Number((legacyDraft as Record<string, unknown>).boxes || legacyDraft?.karaokeBackground?.boxes || 0),
      baseSalary: DEFAULT_BASE_SALARY_VND,
      annualSupportPercent: 0,
      tier1SupportPercent: 0,
      tier2SupportPercent: 0,
      tier3SupportPercent: 0,
      gtgtPercent: Number((legacyDraft as Record<string, unknown>).gtgtPercent || legacyDraft?.financial?.gtgtPercent || DEFAULT_GTGT_PERCENT),
      pricingRenderMode: 'text',
      roomSections: [],
    },
    areaBased: createDefaultAreaBasedUsageInfo(),
  };
};
