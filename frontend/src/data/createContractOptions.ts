/**
 * PHASE KVC-01: KVC Usage Locations Model/UI Refinement
 *
 * Options data for the contract create form.
 * Contains all domain options, region options, area options, etc.
 */

import type {
  AreaUsageDisplayMode,
  BackgroundDomainCode,
  CalculationModuleCode,
  CreateContractRenewalStatus,
  KvcPricingMode,
} from '../lib/contractCreateTypes';

// =============================================================================
// ASSIGNEE OPTIONS (email-based)
// =============================================================================

// Note: Real user data is fetched from API via useEmployeeOptions hook
// Kept for backward compatibility if needed
export const CREATE_CONTRACT_ASSIGNEE_OPTIONS = [
  { value: 'tuan@vcpmc.org', label: 'tuan@vcpmc.org' },
  { value: 'admin@vcpmc.org', label: 'admin@vcpmc.org' },
  { value: 'user1@vcpmc.org', label: 'user1@vcpmc.org' },
];

export const CREATE_CONTRACT_ASSIGNEE_EMAILS = [
  'tuan@vcpmc.org',
  'admin@vcpmc.org',
  'user1@vcpmc.org',
];

// =============================================================================
// REGION & AREA OPTIONS
// =============================================================================

export const CREATE_CONTRACT_REGION_OPTIONS = [
  { value: 'HĐQTGAN-PN', label: 'HĐQTGAN-PN' },
];

export const CREATE_CONTRACT_AREA_OPTIONS = [
  { value: 'PN', label: 'PN' },
];

// =============================================================================
// CONTRACT YEAR OPTIONS
// =============================================================================

export const CONTRACT_YEAR_OPTIONS = [
  { value: '2026', label: '2026' },
  { value: '2025', label: '2025' },
  { value: '2024', label: '2024' },
  { value: '2023', label: '2023' },
  { value: '2022', label: '2022' },
];

// =============================================================================
// DOMAIN GROUP OPTIONS
// =============================================================================

export const CREATE_CONTRACT_DOMAIN_GROUP_OPTIONS: {
  value: 'background';
  label: string;
  disabled?: boolean;
}[] = [
  { value: 'background', label: 'Background' },
  { value: 'background', label: 'Media/SCTT - locked', disabled: true },
];

// =============================================================================
// BACKGROUND DOMAIN OPTIONS (all active Background domains)
// =============================================================================

export type DomainSuggestionTemplate = {
  areaName: string;
  scaleDescription: string;
  musicUsageType: string;
};

export const DOMAIN_SUGGESTION_TEMPLATES: Record<string, DomainSuggestionTemplate[]> = {
  KARAOKE: [
    { areaName: 'Phòng Karaoke', scaleDescription: '', musicUsageType: 'Sử dụng nhạc qua đầu Karaoke' },
    { areaName: 'Sảnh chờ', scaleDescription: '', musicUsageType: 'Phát nhạc nền' },
  ],
  PHONG_THU_AM: [
    { areaName: 'Phòng thu âm', scaleDescription: '', musicUsageType: 'Biểu diễn âm nhạc trực tiếp' },
  ],
  CAFE: [
    { areaName: 'Khu vực phục vụ khách', scaleDescription: '', musicUsageType: 'Phát nhạc nền' },
  ],
  NHA_HANG: [
    { areaName: 'Sảnh tiệc', scaleDescription: '', musicUsageType: 'Phát nhạc nền' },
    { areaName: 'Khu vực phục vụ', scaleDescription: '', musicUsageType: 'Phát nhạc nền' },
  ],
  KHU_VUI_CHOI: [
    { areaName: 'Khu trò chơi trung tâm', scaleDescription: '', musicUsageType: 'Phát nhạc nền' },
  ],
  KHACH_SAN: [
    { areaName: 'Sảnh lobby', scaleDescription: '', musicUsageType: 'Phát nhạc nền' },
    { areaName: 'Khu vực hồ bơi', scaleDescription: '', musicUsageType: 'Phát nhạc nền' },
  ],
  CHAM_SOC_SUC_KHOE: [
    { areaName: 'Khu vực chờ', scaleDescription: '', musicUsageType: 'Phát nhạc nền' },
  ],
};

export const CREATE_CONTRACT_BACKGROUND_DOMAIN_OPTIONS: {
  value: BackgroundDomainCode;
  label: string;
  description?: string;
}[] = [
  { value: 'KARAOKE', label: 'Karaoke', description: 'Karaoke / Phòng hát' },
  { value: 'PHONG_THU_AM', label: 'Phòng thu âm', description: 'Phòng thu âm / Phòng ghi âm' },
  { value: 'CAFE', label: 'Cà phê / Coffee / Cafe', description: 'Quán cà phê, quán cafe' },
  { value: 'NHA_HANG', label: 'Nhà hàng / Nhà hàng tiệc cưới', description: 'Nhà hàng, tiệc cưới' },
  { value: 'KHU_VUI_CHOI', label: 'Khu vui chơi / KVC', description: 'Khu vui chơi giải trí' },
  { value: 'KHACH_SAN', label: 'Khách sạn', description: 'Khách sạn, resort' },
  { value: 'SIEU_THI', label: 'Siêu thị', description: 'Siêu thị' },
  { value: 'TRUNG_TAM_THUONG_MAI', label: 'Trung tâm thương mại', description: 'TTTM, trung tâm mua sắm' },
  { value: 'BAR', label: 'Bar', description: 'Quầy bar, bar karaoke' },
  { value: 'VAN_PHONG', label: 'Văn phòng', description: 'Văn phòng làm việc' },
  { value: 'CUA_HANG', label: 'Cửa hàng', description: 'Cửa hàng bán lẻ' },
  { value: 'RAP_CHIEU', label: 'Rạp chiếu phim', description: 'Rạp chiếu phim' },
  { value: 'PHONG_TRA', label: 'Phòng trà', description: 'Phòng trà, cao lâu' },
  { value: 'CHAM_SOC_SUC_KHOE', label: 'Chăm sóc sức khỏe', description: 'Spa, mát-xa, chăm sóc sức khỏe' },
];

// =============================================================================
// LEGACY DOMAIN OPTIONS (for backward compatibility)
// =============================================================================

export const CREATE_CONTRACT_DOMAIN_OPTIONS: {
  value: BackgroundDomainCode;
  label: string;
}[] = [
  { value: 'KARAOKE', label: 'Karaoke' },
  { value: 'PHONG_THU_AM', label: 'Phòng thu âm' },
];

/** Legacy domain aliases */
export const LEGACY_CREATE_CONTRACT_DOMAIN_ALIASES: Record<
  string,
  BackgroundDomainCode
> = {
  'Phòng ghi âm': 'PHONG_THU_AM',
  'PHONG_GHI_AM': 'PHONG_THU_AM',
  PTA: 'PHONG_THU_AM',
  'Cà phê': 'CAFE',
  Coffee: 'CAFE',
  Cafe: 'CAFE',
  'Nhà hàng': 'NHA_HANG',
  'Khu vui chơi': 'KHU_VUI_CHOI',
  KVC: 'KHU_VUI_CHOI',
  'Khách sạn': 'KHACH_SAN',
  'Siêu thị': 'SIEU_THI',
  'Trung tâm thương mại': 'TRUNG_TAM_THUONG_MAI',
  Bar: 'BAR',
  'Văn phòng': 'VAN_PHONG',
  'Cửa hàng': 'CUA_HANG',
  'Rạp chiếu phim': 'RAP_CHIEU',
  'Phòng trà': 'PHONG_TRA',
  'Chăm sóc sức khỏe': 'CHAM_SOC_SUC_KHOE',
};

// =============================================================================
// KARAOKE USAGE TYPE OPTIONS
// =============================================================================

export const CREATE_CONTRACT_KARAOKE_USAGE_OPTIONS: {
  value: 'PHONG' | 'BOX';
  label: string;
}[] = [
  { value: 'PHONG', label: 'Phòng (theo phòng)' },
  { value: 'BOX', label: 'Box (theo box)' },
];

// =============================================================================
// AREA GROUP OPTIONS
// =============================================================================

export const CREATE_CONTRACT_AREA_GROUP_OPTIONS: {
  value: 'DEN_20' | 'TREN_20_DEN_30' | 'TREN_30' | 'BOX';
  label: string;
  description?: string;
}[] = [
  { value: 'DEN_20', label: 'Đến 20m²', description: 'Hệ số: 1.5 / 1.2 / 1.05' },
  { value: 'TREN_20_DEN_30', label: 'Trên 20m² - 30m²', description: 'Hệ số: 1.6 / 1.28 / 1.12' },
  { value: 'TREN_30', label: 'Trên 30m²', description: 'Hệ số: 1.7 / 1.36 / 1.19' },
  { value: 'BOX', label: 'Box', description: 'Hệ số: 0.85' },
];

// =============================================================================
// PRICING RENDER MODE OPTIONS
// =============================================================================

export const CREATE_CONTRACT_PRICING_RENDER_OPTIONS: {
  value: 'text' | 'table';
  label: string;
}[] = [
  { value: 'text', label: 'Văn bản (text)' },
  { value: 'table', label: 'Bảng (table)' },
];

// =============================================================================
// RENEWAL STATUS OPTIONS
// =============================================================================

export const CREATE_CONTRACT_RENEWAL_OPTIONS: {
  value: CreateContractRenewalStatus;
  label: string;
}[] = [
  { value: 'NEW', label: 'Ký mới' },
  { value: 'PENDING_RENEWAL', label: 'Tái ký' },
  { value: 'FRAME_CONTRACT', label: 'Hợp đồng khung' },
];

/** Map contract type to display label */
export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  NEW: 'Ký mới',
  PENDING_RENEWAL: 'Tái ký',
  FRAME_CONTRACT: 'Hợp đồng khung',
};

// =============================================================================
// FIELD CODE OPTIONS
// =============================================================================

export const CREATE_CONTRACT_FIELD_CODE_OPTIONS = [
  { value: 'PR', label: 'PR (Quyền biểu diễn)' },
  { value: 'MR', label: 'MR (Quyền cơ khí)' },
];

// =============================================================================
// MEDIA DOMAIN OPTIONS (LOCKED - not selectable)
// =============================================================================

export const CREATE_CONTRACT_MEDIA_DOMAIN_OPTIONS: {
  value: string;
  label: string;
  locked: boolean;
}[] = [
  { value: 'SCTT', label: 'SCTT - Chưa triển khai', locked: true },
  { value: 'BD', label: 'Biểu diễn / BD - Chưa triển khai', locked: true },
];

// =============================================================================
// PLACEHOLDER TEXT FOR NON-IMPLEMENTED DOMAINS
// =============================================================================

export const DOMAIN_NOT_IMPLEMENTED_PLACEHOLDER =
  'Sẽ triển khai logic khu vực/tính phí ở phase sau.';

export const DOMAIN_PLACEHOLDER_ONLY_PLACEHOLDER =
  'Sẽ triển khai form riêng ở phase sau.';

export const AREA_CALC_NOT_IMPLEMENTED_PLACEHOLDER =
  'Logic tính tiền lĩnh vực này sẽ triển khai ở phase sau. Hiện chỉ chuẩn hóa khu vực sử dụng nhạc.';

// =============================================================================
// AREA-BASED USAGE KIND OPTIONS
// =============================================================================

export const AREA_USAGE_KIND_OPTIONS: {
  value: 'NHAC_NEN' | 'LIVE_ACOUSTIC' | 'DJ' | 'KARAOKE' | 'MIXED';
  label: string;
}[] = [
  { value: 'NHAC_NEN', label: 'Nhạc nền' },
  { value: 'LIVE_ACOUSTIC', label: 'Live / Acoustic' },
  { value: 'DJ', label: 'DJ' },
  { value: 'KARAOKE', label: 'Karaoke' },
  { value: 'MIXED', label: 'Hỗn hợp' },
];

// =============================================================================
// OPERATING MODEL OPTIONS
// =============================================================================

export const OPERATING_MODEL_OPTIONS: {
  value: 'CHINH_HOP' | 'CHINH_KHONG_HOP' | 'TRON_BO';
  label: string;
  description?: string;
}[] = [
  { value: 'CHINH_HOP', label: 'Chính họp', description: 'Hoạt động kinh doanh chính là nhạc' },
  { value: 'CHINH_KHONG_HOP', label: 'Chính không họp', description: 'Nhạc là hoạt động phụ' },
  { value: 'TRON_BO', label: 'Trọn bộ', description: 'Tất cả các loại hình' },
];

// =============================================================================
// CALCULATION MODULE OPTIONS
// =============================================================================

/** Status label mapping */
const MODULE_STATUS_LABELS: Record<string, string> = {
  implemented: 'Đã triển khai',
  planned: 'Sắp triển khai',
  disabled: 'Tạm khóa',
  locked: 'Không khả dụng',
};

/**
 * Domain family for calculation modules.
 * Used to filter modules based on the selected domain.
 * - 'karaoke': Only for KARAOKE, PHONG_THU_AM domains
 * - 'kvc': Only for KHU_VUI_CHOI domain
 * - 'area': Manual modules for CAFE, NHA_HANG, KHACH_SAN domains
 * - 'any': Works across all domains (e.g. MANUAL_FEE)
 */
export type ModuleDomainFamily = 'karaoke' | 'kvc' | 'area' | 'any';

/**
 * Calculation module options for the dropdown.
 */
export const CALCULATION_MODULE_OPTIONS: {
  value: CalculationModuleCode;
  label: string;
  description?: string;
  status: 'implemented' | 'planned' | 'disabled' | 'locked';
  domainFamily: ModuleDomainFamily;
}[] = [
  {
    value: 'KARAOKE_PHONG',
    label: 'Karaoke Phòng',
    description: 'Tính tiền theo số phòng karaoke',
    status: 'implemented',
    domainFamily: 'karaoke',
  },
  {
    value: 'KARAOKE_BOX',
    label: 'Karaoke Box',
    description: 'Tính tiền theo số box karaoke',
    status: 'implemented',
    domainFamily: 'karaoke',
  },
  {
    value: 'KVC_VCPMC_TARIFF',
    label: 'KVC - Biểu giá VCPMC',
    description: 'Tính tiền theo biểu giá VCPMC cho Khu vui chơi, giải trí',
    status: 'implemented',
    domainFamily: 'kvc',
  },
  {
    value: 'KVC_ND17',
    label: 'KVC - NĐ17/2023',
    description: 'Tính tiền theo Nghị định 17/2023, Phụ lục II, Mục 8 cho Khu vui chơi',
    status: 'implemented',
    domainFamily: 'kvc',
  },
  {
    value: 'CAFE',
    label: 'KVC - Cà phê',
    description: 'Nhập tay tiền bản quyền cho lĩnh vực cà phê',
    status: 'implemented',
    domainFamily: 'area',
  },
  {
    value: 'NHA_HANG',
    label: 'KVC - Nhà hàng',
    description: 'Nhập tay tiền bản quyền cho lĩnh vực nhà hàng',
    status: 'implemented',
    domainFamily: 'area',
  },
  {
    value: 'KHACH_SAN',
    label: 'KVC - Khách sạn',
    description: 'Nhập tay tiền bản quyền cho lĩnh vực khách sạn',
    status: 'implemented',
    domainFamily: 'area',
  },
  {
    value: 'MANUAL_FEE',
    label: 'KVC - Nhập tay',
    description: 'Nhập tay tiền chưa thuế, thuế GTGT, tiền sau thuế (cho mọi lĩnh vực)',
    status: 'implemented',
    domainFamily: 'any',
  },
  {
    value: 'CUSTOM_PLACEHOLDER',
    label: 'Tùy chỉnh',
    description: 'Tính tiền tùy chỉnh (chưa triển khai)',
    status: 'disabled',
    domainFamily: 'any',
  },
];

/**
 * Get modules filtered by domain family.
 */
export const getModulesByDomainFamily = (
  domainFamily: ModuleDomainFamily,
  options: typeof CALCULATION_MODULE_OPTIONS = CALCULATION_MODULE_OPTIONS
): typeof CALCULATION_MODULE_OPTIONS => {
  return options.filter(
    (m) => m.domainFamily === 'any' || m.domainFamily === domainFamily
  );
};

/**
 * Map domain code to module domain family.
 */
export const getDomainFamilyFromDomainCode = (domainCode: BackgroundDomainCode): ModuleDomainFamily => {
  if (domainCode === 'KARAOKE' || domainCode === 'PHONG_THU_AM') return 'karaoke';
  if (domainCode === 'KHU_VUI_CHOI') return 'kvc';
  return 'area';
};

/**
 * Check if a module is compatible with a domain.
 */
export const isModuleCompatibleWithDomain = (
  moduleCode: CalculationModuleCode,
  domainCode: BackgroundDomainCode
): boolean => {
  const module = CALCULATION_MODULE_OPTIONS.find((m) => m.value === moduleCode);
  if (!module) return false;
  if (module.domainFamily === 'any') return true;
  return module.domainFamily === getDomainFamilyFromDomainCode(domainCode);
};

/**
 * Get available modules for the dropdown (implemented only).
 */
export const AVAILABLE_CALCULATION_MODULES = CALCULATION_MODULE_OPTIONS.filter(
  (m) => m.status === 'implemented'
);

/**
 * Get status label for a module.
 */
export const getModuleStatusLabel = (status: 'implemented' | 'planned' | 'disabled' | 'locked'): string => {
  return MODULE_STATUS_LABELS[status] || status;
};

/**
 * Check if a module can be added (enabled for selection).
 */
export const isModuleSelectable = (module: CalculationModuleCode): boolean => {
  const option = CALCULATION_MODULE_OPTIONS.find((m) => m.value === module);
  return option ? option.status === 'implemented' : false;
};

/**
 * Placeholder message for planned modules.
 */
export const CALC_MODULE_NOT_IMPLEMENTED_PLACEHOLDER =
  'Sẽ triển khai ở phase sau. Chưa tính tự động.';

// =============================================================================
// AREA USAGE DISPLAY MODE OPTIONS
// =============================================================================

/**
 * Options for how to display business usage locations when exporting contract.
 */
export const AREA_USAGE_DISPLAY_MODE_OPTIONS: {
  value: AreaUsageDisplayMode;
  label: string;
  description?: string;
}[] = [
  { value: 'auto', label: 'Tự động', description: 'Tự chọn dạng phù hợp theo số địa điểm' },
  { value: 'text', label: 'Dạng chữ', description: 'Hiển thị dạng văn bản/đoạn' },
  { value: 'table', label: 'Dạng bảng', description: 'Hiển thị dạng bảng' },
];

// =============================================================================
// KVC PRICING MODE OPTIONS (placeholder - not implemented)
// =============================================================================

/**
 * Options for KVC pricing mode (placeholder for future implementation).
 */
export const KVC_PRICING_MODE_OPTIONS: {
  value: KvcPricingMode;
  label: string;
  description?: string;
}[] = [
  { value: 'VCPMC_TARIFF', label: 'Theo biểu giá VCPMC', description: 'Tính theo biểu giá VCPMC' },
  { value: 'ND17', label: 'Áp dụng Nghị định 17/2023', description: 'Tính theo NĐ17/2023' },
];

/**
 * Placeholder message for KVC pricing.
 */
export const KVC_PRICING_NOT_IMPLEMENTED_PLACEHOLDER =
  'Chưa triển khai tính tiền KVC ở phase này. Biểu giá VCPMC và ND17 sẽ làm ở phase riêng.';
