/**
 * PHASE KVC-01: KVC Usage Locations Model/UI Refinement
 *
 * Validation functions for the contract create form.
 * Handles:
 * - Common field validation
 * - Domain-specific validation
 * - Karaoke calculation validation
 * - Calculation line validation
 * - Business usage location validation
 */

import type {
  AreaBasedUsageInfo,
  BusinessUsageLocation,
  CalculationModuleCode,
  CreateContractDraft,
  ValidationIssue,
  BackgroundDomainCode,
  KaraokeUsageInfo,
  RoyaltyCalculationLine,
} from './contractCreateTypes';

import {
  isKaraokeCalcDomain,
  isAreaBasedDomain,
  isPlaceholderOnlyDomain,
  isFullyImplementedDomain,
  isModuleAvailable,
  getModuleDisplayName,
  DEFAULT_BASE_SALARY_VND,
} from './contractCreateMapper';

// =============================================================================
// INVALID ADDRESS PATTERNS (placeholder/key strings that must NEVER be accepted)
// =============================================================================

const INVALID_ADDRESS_PATTERNS: Set<string> = new Set([
  // Field/column name references
  'don_vi_dia_chi',
  'dia_chi',
  'legal_address',
  'legal_full_address',
  'usage_address',
  'usage_full_address',
  'address',
  'business_address',
  // CamelCase variants
  'legalAddress',
  'usageAddress',
  'fullAddress',
]);

// Regex patterns for invalid formats
const PLACEHOLDER_PATTERN = /^\{\{[^}]+\}\}$/;
const SENTINEL_PATTERN = /^_{2,}_$/;
// Minimum realistic address length
const MIN_ADDRESS_LENGTH = 10;

/**
 * Check if a string value looks like a real address, not a placeholder/key.
 *
 * Returns false if the value is:
 * - null/undefined or empty
 * - A field/column name reference (e.g., "don_vi_dia_chi")
 * - A template placeholder (e.g., "{{don_vi_dia_chi}}")
 * - A sentinel value (e.g., "__...__")
 * - Too short to be a real address
 * - Has no spaces (real addresses typically have street numbers and names)
 */
export function isRealAddressValue(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const stripped = String(value).trim();
  if (!stripped) {
    return false;
  }

  // Check against known invalid field/key names (case-insensitive)
  if (INVALID_ADDRESS_PATTERNS.has(stripped.toLowerCase())) {
    return false;
  }

  // Check for {{...}} placeholder pattern
  if (PLACEHOLDER_PATTERN.test(stripped)) {
    return false;
  }

  // Check for __...__ sentinel pattern
  if (SENTINEL_PATTERN.test(stripped)) {
    return false;
  }

  // Too short to be a real address
  if (stripped.length < MIN_ADDRESS_LENGTH) {
    return false;
  }

  // Real addresses typically have spaces (street numbers, names, district names)
  if (!stripped.includes(' ')) {
    return false;
  }

  return true;
}

// =============================================================================
// ISO DATE VALIDATION
// =============================================================================

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value: string): boolean => ISO_DATE_REGEX.test(value);

const isValidDate = (value: string): boolean => {
  if (!isIsoDate(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
};

// =============================================================================
// VALIDATION ISSUES
// =============================================================================

/**
 * Validate a contract draft and return issues.
 */
export const validateContractDraft = (
  draft: CreateContractDraft
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Validate common fields
  issues.push(...validateCommonFields(draft));

  // Validate customer fields
  issues.push(...validateCustomerFields(draft));

  // Validate location fields
  issues.push(...validateLocationFields(draft));

  // Validate term fields
  issues.push(...validateTermFields(draft));

  // Validate domain
  issues.push(...validateDomain(draft));

  // Validate domain-specific fields
  issues.push(...validateDomainSpecificFields(draft));

  // NOTE: validateCalculationLines() is NOT called here anymore.
  // For Karaoke Template 1, pricingSnapshot is the source of truth for create.
  // The calculationLines legacy calculator validation only applies to:
  // - Manual "Tính tiền bản quyền" calculator flow (validateKaraokeCalcInput)
  // - Preflight checks (hasValidCalculationLines)
  // When pricingSnapshot exists, it takes precedence over calculationLines.

  return issues;
};

/**
 * Get blocking validation errors (errors only).
 */
export const getBlockingValidationErrors = (
  issues: ValidationIssue[]
): ValidationIssue[] => issues.filter((issue) => issue.severity === 'error');

/**
 * Get warning issues only.
 */
export const getWarningIssues = (
  issues: ValidationIssue[]
): ValidationIssue[] => issues.filter((issue) => issue.severity === 'warning');

/**
 * Add a duplicate contract warning (soft check).
 * Called when an existing contract with same unit + address + date range is found.
 */
export const addDuplicateContractWarning = (
  issues: ValidationIssue[],
  existingContractNo: string
): ValidationIssue[] => [
  ...issues,
  {
    field: 'customer.legalName',
    message: `Có thể đã tồn tại hợp đồng tương tự: ${existingContractNo}. Kiểm tra trước khi tạo.`,
    severity: 'warning',
  },
];

// =============================================================================
// COMMON FIELD VALIDATION
// =============================================================================

const validateCommonFields = (draft: CreateContractDraft): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Contract number is USER INPUT only
  if (!draft.common.contractNumber.trim()) {
    issues.push({
      field: 'common.contractNumber',
      message: 'Số hợp đồng là bắt buộc.',
      severity: 'error',
    });
  }

  if (!draft.common.contractYear.trim()) {
    issues.push({
      field: 'common.contractYear',
      message: 'Năm hợp đồng là bắt buộc.',
      severity: 'error',
    });
  } else if (!/^\d{4}$/.test(draft.common.contractYear.trim())) {
    issues.push({
      field: 'common.contractYear',
      message: 'Năm phải là 4 chữ số (VD: 2026).',
      severity: 'error',
    });
  }

  if (!draft.common.signedDate.trim()) {
    issues.push({
      field: 'common.signedDate',
      message: 'Ngày lập hợp đồng là bắt buộc.',
      severity: 'error',
    });
  } else if (!isValidDate(draft.common.signedDate)) {
    issues.push({
      field: 'common.signedDate',
      message: 'Ngày lập phải theo định dạng YYYY-MM-DD.',
      severity: 'error',
    });
  }

  return issues;
};

// =============================================================================
// CUSTOMER FIELD VALIDATION
// =============================================================================

const validateCustomerFields = (draft: CreateContractDraft): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!draft.customer.legalName.trim()) {
    issues.push({
      field: 'customer.legalName',
      message: 'Tên đơn vị là bắt buộc.',
      severity: 'error',
    });
  }

  if (!draft.customer.brandName.trim()) {
    issues.push({
      field: 'customer.brandName',
      message: 'Tên bảng hiệu là bắt buộc.',
      severity: 'error',
    });
  }

  if (!draft.customer.legalAddress.trim()) {
    issues.push({
      field: 'customer.legalAddress',
      message: 'Địa chỉ pháp lý là bắt buộc.',
      severity: 'error',
    });
  }

  // Validate email format if provided
  if (draft.customer.email.trim() && !isValidEmail(draft.customer.email)) {
    issues.push({
      field: 'customer.email',
      message: 'Định dạng email không hợp lệ (VD: ten@vcpmc.org).',
      severity: 'error',
    });
  }

  // Validate MST (Tax code) — numeric soft check
  if (draft.customer.taxCode.trim()) {
    const mstClean = draft.customer.taxCode.replace(/\s|-|\./g, '');
    const isNumeric = /^\d+$/.test(mstClean);
    const abnormalLength = mstClean.length > 0 && (mstClean.length < 10 || mstClean.length > 14);
    if (!isNumeric) {
      issues.push({
        field: 'customer.taxCode',
        message: 'Mã số thuế nên là chuỗi số (10–14 chữ số).',
        severity: 'warning',
      });
    } else if (abnormalLength) {
      issues.push({
        field: 'customer.taxCode',
        message: `Mã số thuế có độ dài bất thường (${mstClean.length} chữ số). Kiểm tra lại.`,
        severity: 'warning',
      });
    }
  }

  return issues;
};

// =============================================================================
// LOCATION FIELD VALIDATION
// =============================================================================

const validateLocationFields = (draft: CreateContractDraft): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!draft.location.usageAddress.trim()) {
    issues.push({
      field: 'location.usageAddress',
      message: 'Địa chỉ sử dụng là bắt buộc.',
      severity: 'error',
    });
  }

  return issues;
};

// =============================================================================
// TERM FIELD VALIDATION
// =============================================================================

const validateTermFields = (draft: CreateContractDraft): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!draft.term.effectiveFrom.trim()) {
    issues.push({
      field: 'term.effectiveFrom',
      message: 'Ngày bắt đầu là bắt buộc.',
      severity: 'error',
    });
  } else if (!isValidDate(draft.term.effectiveFrom)) {
    issues.push({
      field: 'term.effectiveFrom',
      message: 'Ngày bắt đầu phải theo định dạng YYYY-MM-DD.',
      severity: 'error',
    });
  }

  if (!draft.term.effectiveTo.trim()) {
    issues.push({
      field: 'term.effectiveTo',
      message: 'Ngày kết thúc là bắt buộc.',
      severity: 'error',
    });
  } else if (!isValidDate(draft.term.effectiveTo)) {
    issues.push({
      field: 'term.effectiveTo',
      message: 'Ngày kết thúc phải theo định dạng YYYY-MM-DD.',
      severity: 'error',
    });
  }

  // Check end date is after start date
  if (
    isValidDate(draft.term.effectiveFrom) &&
    isValidDate(draft.term.effectiveTo) &&
    draft.term.effectiveTo < draft.term.effectiveFrom
  ) {
    issues.push({
      field: 'term.effectiveTo',
      message: 'Ngày kết thúc phải sau ngày bắt đầu.',
      severity: 'error',
    });
  }

  return issues;
};

// =============================================================================
// DOMAIN VALIDATION
// =============================================================================

const validateDomain = (draft: CreateContractDraft): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Only show "not implemented" warning for domains that are not karaoke and not area-based
  if (
    !isFullyImplementedDomain(draft.domain.domainCode) &&
    !isAreaBasedDomain(draft.domain.domainCode) &&
    !isPlaceholderOnlyDomain(draft.domain.domainCode)
  ) {
    issues.push({
      field: 'domain.domainCode',
      message: `Lĩnh vực "${draft.domain.domainDisplayName}" chưa triển khai tính năng tính phí. Sẽ có trong phase sau.`,
      severity: 'warning',
    });
  }

  return issues;
};

// =============================================================================
// DOMAIN-SPECIFIC VALIDATION
// =============================================================================

const validateDomainSpecificFields = (draft: CreateContractDraft): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (isKaraokeCalcDomain(draft.domain.domainCode)) {
    issues.push(...validateKaraokeFields(draft.karaoke));
  }

  if (isAreaBasedDomain(draft.domain.domainCode)) {
    issues.push(...validateAreaBasedFields(draft.areaBased, draft.domain.domainCode === 'KHU_VUI_CHOI'));
  }

  if (isPlaceholderOnlyDomain(draft.domain.domainCode)) {
    issues.push({
      field: 'domain.domainCode',
      message: `Lĩnh vực "${draft.domain.domainDisplayName}" sẽ có form riêng ở phase sau.`,
      severity: 'warning',
    });
  }

  return issues;
};

// =============================================================================
// AREA-BASED FIELD VALIDATION
// =============================================================================

const validateAreaBasedFields = (areaBased: AreaBasedUsageInfo): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Validate music usage areas - require at least 1 row
  const musicAreas = Array.isArray(areaBased.musicUsageAreas) ? areaBased.musicUsageAreas : [];
  if (musicAreas.length === 0) {
    issues.push({
      field: 'areaBased.musicUsageAreas',
      message: 'Vui lòng thêm ít nhất một khu vực sử dụng âm nhạc.',
      severity: 'warning',
    });
  }

  // Validate total area
  if (areaBased.totalAreaM2 < 0) {
    issues.push({
      field: 'areaBased.totalAreaM2',
      message: 'Tổng diện tích không thể âm.',
      severity: 'error',
    });
  }

  // Validate music usage area
  if (areaBased.musicUsageAreaM2 < 0) {
    issues.push({
      field: 'areaBased.musicUsageAreaM2',
      message: 'Diện tích sử dụng nhạc không thể âm.',
      severity: 'error',
    });
  }

  // Validate music usage area <= total area
  if (areaBased.totalAreaM2 > 0 && areaBased.musicUsageAreaM2 > areaBased.totalAreaM2) {
    issues.push({
      field: 'areaBased.musicUsageAreaM2',
      message: 'Diện tích sử dụng nhạc không thể lớn hơn tổng diện tích.',
      severity: 'error',
    });
  }

  // Validate number of floors
  if (areaBased.numberOfFloors < 0) {
    issues.push({
      field: 'areaBased.numberOfFloors',
      message: 'Số tầng không thể âm.',
      severity: 'error',
    });
  }

  // Validate number of zones
  if (areaBased.numberOfZones < 0) {
    issues.push({
      field: 'areaBased.numberOfZones',
      message: 'Số khu vực không thể âm.',
      severity: 'error',
    });
  }

  // At least one music usage flag should be enabled or usage description provided
  const hasMusicUsage =
    areaBased.hasBackgroundMusic ||
    areaBased.hasLiveMusic ||
    areaBased.hasDj ||
    areaBased.hasKaraokeActivity ||
    areaBased.usageDescription.trim().length > 0;

  if (!hasMusicUsage && areaBased.totalAreaM2 > 0) {
    issues.push({
      field: 'areaBased',
      message: 'Cần ít nhất một loại sử dụng nhạc (nhạc nền, live, DJ, karaoke) hoặc mô tả khu vực.',
      severity: 'warning',
    });
  }

  return issues;
};

// =============================================================================
// KARAOKE FIELD VALIDATION
// =============================================================================

const validateKaraokeFields = (karaoke: KaraokeUsageInfo): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Validate rooms/boxes based on type
  if (karaoke.karaokeType === 'PHONG') {
    if (karaoke.totalRooms <= 0) {
      issues.push({
        field: 'karaoke.totalRooms',
        message: 'Số phòng phải lớn hơn 0 cho loại hình Phòng.',
        severity: 'warning',
      });
    }
  } else if (karaoke.karaokeType === 'BOX') {
    if (karaoke.totalBoxes <= 0) {
      issues.push({
        field: 'karaoke.totalBoxes',
        message: 'Số box phải lớn hơn 0 cho loại hình Box.',
        severity: 'warning',
      });
    }
  }

  // Validate base salary
  if (karaoke.baseSalary <= 0) {
    issues.push({
      field: 'karaoke.baseSalary',
      message: 'Mức lương cơ sở phải lớn hơn 0.',
      severity: 'warning',
    });
  } else if (karaoke.baseSalary !== DEFAULT_BASE_SALARY_VND) {
    issues.push({
      field: 'karaoke.baseSalary',
      message: `Mức lương cơ sở khác mặc định (${DEFAULT_BASE_SALARY_VND.toLocaleString('vi-VN')} VND). Vui lòng xác nhận giá trị đúng theo chính sách hiện hành.`,
      severity: 'info',
    });
  }

  // Validate GTGT percent
  if (karaoke.gtgtPercent < 0) {
    issues.push({
      field: 'karaoke.gtgtPercent',
      message: 'Phần trăm GTGT không thể âm.',
      severity: 'error',
    });
  }

  // Validate support percentages
  if (karaoke.annualSupportPercent < 0 || karaoke.annualSupportPercent > 100) {
    issues.push({
      field: 'karaoke.annualSupportPercent',
      message: 'Tỷ lệ hỗ trợ hàng năm phải từ 0-100%.',
      severity: 'warning',
    });
  }


  return issues;
};

// =============================================================================
// EMAIL VALIDATION HELPER
// =============================================================================

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

// =============================================================================
// KARAOKE CALCULATION VALIDATION
// =============================================================================

/**
 * Validate karaoke calculation input before sending to API.
 */
export const validateKaraokeCalcInput = (
  draft: CreateContractDraft
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (!isKaraokeCalcDomain(draft.domain.domainCode)) {
    issues.push({
      field: 'domain.domainCode',
      message: 'Tính năng tính tiền chỉ khả dụng cho Karaoke và Phòng thu âm.',
      severity: 'warning',
    });
    return issues;
  }

  // Delegate to karaoke validation
  issues.push(...validateKaraokeFields(draft.karaoke));

  // Additional validation for calculation
  if (draft.karaoke.karaokeType === 'PHONG' && draft.karaoke.totalRooms <= 0) {
    issues.push({
      field: 'karaoke.totalRooms',
      message: 'Cần nhập số phòng để tính tiền bản quyền.',
      severity: 'error',
    });
  }

  if (draft.karaoke.karaokeType === 'BOX' && draft.karaoke.totalBoxes <= 0) {
    issues.push({
      field: 'karaoke.totalBoxes',
      message: 'Cần nhập số box để tính tiền bản quyền.',
      severity: 'error',
    });
  }

  if (!draft.term.effectiveFrom.trim()) {
    issues.push({
      field: 'term.effectiveFrom',
      message: 'Cần nhập ngày bắt đầu để tính kỳ hạn hiệu lực.',
      severity: 'error',
    });
  }

  if (!draft.term.effectiveTo.trim()) {
    issues.push({
      field: 'term.effectiveTo',
      message: 'Cần nhập ngày kết thúc để tính kỳ hạn hiệu lực.',
      severity: 'error',
    });
  }

  return issues;
};

/**
 * Get blocking errors for karaoke calculation.
 */
export const getBlockingCalcErrors = (
  issues: ValidationIssue[]
): ValidationIssue[] => issues.filter(
  (issue) => issue.severity === 'error' && issue.field.startsWith('karaoke.')
);

// =============================================================================
// CALCULATION LINE VALIDATION
// =============================================================================

/**
 * Validate a single calculation line.
 */
export const validateCalculationLine = (
  line: RoyaltyCalculationLine
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Check if line has a label
  if (!line.label.trim()) {
    issues.push({
      field: `${line.id}.label`,
      message: 'Tên khoản tính là bắt buộc.',
      severity: 'error',
    });
  }

  // Check if module is available
  if (!isModuleAvailable(line.calculationModule)) {
    const moduleName = getModuleDisplayName(line.calculationModule);
    issues.push({
      field: `${line.id}.calculationModule`,
      message: `Module "${moduleName}" chưa triển khai.`,
      severity: 'warning',
    });
  }

  // Module-specific validation
  if (line.input.module === 'KARAOKE_PHONG') {
    issues.push(...validateKaraokePhongLine(line));
  } else if (line.input.module === 'KARAOKE_BOX') {
    issues.push(...validateKaraokeBoxLine(line));
  }

  return issues;
};

/**
 * Validate a karaoke phong calculation line.
 * 
 * Note: Only report ERROR when:
 * 1. Line is enabled AND
 * 2. Line has a result (meaning it was calculated) AND
 * 3. totalRooms <= 0
 * 
 * If line is enabled but has no result, it's a warning because the user
 * may be using Phase 2 direct input instead of calculation.
 */
const validateKaraokePhongLine = (line: RoyaltyCalculationLine): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const input = line.input as { module: 'KARAOKE_PHONG'; totalRooms: number; baseSalary: number };

  if (input.totalRooms <= 0) {
    // Only ERROR if line is enabled AND has a result (was calculated)
    // If no result yet, it's a warning - user might be using Phase 2 direct input
    const hasResult = line.result !== undefined;
    const severity = (line.enabled && hasResult) ? 'error' : 'warning';
    issues.push({
      field: `${line.id}.input.totalRooms`,
      message: 'Số phòng phải lớn hơn 0.',
      severity,
    });
  }

  if (input.baseSalary <= 0) {
    issues.push({
      field: `${line.id}.input.baseSalary`,
      message: 'Mức lương cơ sở phải lớn hơn 0.',
      severity: line.enabled ? 'error' : 'warning',
    });
  }

  return issues;
};

/**
 * Validate a karaoke box calculation line.
 * 
 * Note: Only report ERROR when:
 * 1. Line is enabled AND
 * 2. Line has a result (meaning it was calculated) AND
 * 3. totalBoxes <= 0
 * 
 * If line is enabled but has no result, it's a warning because the user
 * may be using Phase 2 direct input instead of calculation.
 */
const validateKaraokeBoxLine = (line: RoyaltyCalculationLine): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const input = line.input as { module: 'KARAOKE_BOX'; totalBoxes: number; baseSalary: number };

  if (input.totalBoxes <= 0) {
    // Only ERROR if line is enabled AND has a result (was calculated)
    // If no result yet, it's a warning - user might be using Phase 2 direct input
    const hasResult = line.result !== undefined;
    const severity = (line.enabled && hasResult) ? 'error' : 'warning';
    issues.push({
      field: `${line.id}.input.totalBoxes`,
      message: 'Số box phải lớn hơn 0.',
      severity,
    });
  }

  if (input.baseSalary <= 0) {
    issues.push({
      field: `${line.id}.input.baseSalary`,
      message: 'Mức lương cơ sở phải lớn hơn 0.',
      severity: line.enabled ? 'error' : 'warning',
    });
  }

  return issues;
};

/**
 * Validate all calculation lines in a draft.
 * 
 * @param lines - Calculation lines to validate
 * @param domainCode - Domain code to determine which validation applies
 */
export const validateCalculationLines = (
  lines: RoyaltyCalculationLine[],
  domainCode: BackgroundDomainCode = 'KARAOKE'
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Check if at least one line exists
  if (lines.length === 0) {
    issues.push({
      field: 'calculationLines',
      message: 'Cần ít nhất một khoản tính. Nhấn "+ Thêm khoản tính" để thêm.',
      severity: 'warning',
    });
  }

  // Only validate karaoke lines for karaoke domains
  const isKaraokeDomain = isKaraokeCalcDomain(domainCode);

  // Validate each line
  for (const line of lines) {
    if (!line.enabled) continue;
    
    // Skip karaoke-specific lines (KARAOKE_PHONG, KARAOKE_BOX) for non-karaoke domains
    const isKaraokeLine = line.input.module === 'KARAOKE_PHONG' || line.input.module === 'KARAOKE_BOX';
    if (isKaraokeLine && !isKaraokeDomain) continue;
    
    issues.push(...validateCalculationLine(line));
  }

  return issues;
};

/**
 * Check if a draft has valid calculation lines for preflight.
 */
export const hasValidCalculationLines = (
  lines: RoyaltyCalculationLine[],
  domainCode: BackgroundDomainCode = 'KARAOKE'
): boolean => {
  const enabledLines = lines.filter((line) => line.enabled);

  if (enabledLines.length === 0) {
    return false;
  }

  // Check for blocking errors (only for karaoke domains)
  const allIssues = validateCalculationLines(lines, domainCode);
  const blockingErrors = allIssues.filter(
    (issue) => issue.severity === 'error' && issue.field.includes('.input.')
  );

  return blockingErrors.length === 0;
};

// =============================================================================
// BUSINESS USAGE LOCATION VALIDATION
// =============================================================================

/**
 * Validate a single business usage location.
 */
export const validateBusinessLocation = (
  location: BusinessUsageLocation,
  locationIndex: number,
  isKvcDomain: boolean = false
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const prefix = `areaBased.locations[${locationIndex}]`;

  // locationName required for KVC
  if (isKvcDomain && !location.locationName.trim()) {
    issues.push({
      field: `${prefix}.locationName`,
      message: 'Tên khu vực là bắt buộc cho Khu vui chơi.',
      severity: 'warning',
    });
  }

  // businessAddress required for KVC
  if (isKvcDomain && !location.businessAddress.trim()) {
    issues.push({
      field: `${prefix}.businessAddress`,
      message: 'Địa chỉ kinh doanh là bắt buộc cho Khu vui chơi.',
      severity: 'warning',
    });
  }

  // musicUsageAreaM2 validation
  if (location.musicUsageAreaM2 < 0) {
    issues.push({
      field: `${prefix}.musicUsageAreaM2`,
      message: 'Diện tích sử dụng âm nhạc không thể âm.',
      severity: 'error',
    });
  }

  // For KVC, musicUsageAreaM2 should be > 0
  if (isKvcDomain && location.musicUsageAreaM2 <= 0) {
    issues.push({
      field: `${prefix}.musicUsageAreaM2`,
      message: 'Diện tích sử dụng âm nhạc phải lớn hơn 0 cho Khu vui chơi.',
      severity: 'warning',
    });
  }

  return issues;
};

/**
 * Validate area-based usage info with locations.
 */
export const validateAreaBasedLocations = (
  areaBased: AreaBasedUsageInfo,
  isKvcDomain: boolean = false
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // At least one location required
  if (areaBased.locations.length === 0) {
    issues.push({
      field: 'areaBased.locations',
      message: 'Cần ít nhất một khu vực sử dụng âm nhạc.',
      severity: 'warning',
    });
  }

  // Validate each location
  areaBased.locations.forEach((location, index) => {
    issues.push(...validateBusinessLocation(location, index, isKvcDomain));
  });

  // Validate displayMode
  if (!['auto', 'text', 'table'].includes(areaBased.displayMode)) {
    issues.push({
      field: 'areaBased.displayMode',
      message: 'Cách hiển thị không hợp lệ.',
      severity: 'error',
    });
  }

  return issues;
};
