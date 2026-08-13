/**
 * PHASE KVC-01: KVC Usage Locations Model/UI Refinement
 *
 * Create Contract page with new architecture:
 * - Section 1: Thông tin chung (Common contract/customer/company info - shared)
 * - Section 2: Lĩnh vực (Domain selector)
 * - Section 3: Khu vực kinh doanh (Business usage locations)
 * - Section 4: Tiền bản quyền (Multiple calculation lines)
 * - Section 5: Tạo hợp đồng (Official workflow)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { XIcon, CalculatorIcon, InfoIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { Page, PageHeader } from '../components/app-ui/Page';
import { FormSection } from '../components/app-ui/FormSection';
import { FieldGrid } from '../components/app-ui/FieldGrid';
import { Input } from '../components/app-ui/Input';
import { Textarea } from '../components/app-ui/Textarea';
import { Select } from '../components/app-ui/Select';
import { Button } from '../components/app-ui/Button';
import { ContractNumberPreview } from '../components/app-ui/ContractNumberPreview';
import { StepIndicator } from '../components/app-ui/StepIndicator';
import { WordLikeRoyaltyTable, formatVnd } from '../components/contract/WordLikeRoyaltyTable';
import type { RoyaltyTableData } from '../components/contract/WordLikeRoyaltyTable';
import { buildKaraokeRoyaltyTableData } from '../lib/calculations/karaokeRoyaltyRowModel';
import { MusicUsageAreaSection } from '../components/contract/MusicUsageAreaSection';
import { SimpleRoyaltyInput } from '../components/contract/SimpleRoyaltyInput';
import { ContractTemplateSearch } from '../components/contract/ContractTemplateSearch';
import { KaraokePricingWorkspace } from '../components/pricing/KaraokePricingWorkspace';
import { QuotePreviewDialog } from '../components/pricing/QuotePreviewDialog';
import { SectionNavChips, SectionNavRail, type SectionNavItem } from '../components/app-ui/SectionNavChips';
import type { PricingSnapshot } from '../lib/pricingSnapshot';
import type { KaraokeAreaGroup } from '../lib/pricingSnapshot';
import { VcpmcMoneyTable } from '../components/app-ui/data-table/VcpmcMoneyTable';
import type { DataTableColumn, DataTableSummaryRow } from '../components/app-ui/data-table';
import { useEmployeeOptions } from '../hooks/useEmployeeOptions';
import type { PrefillSourceResponse } from '../lib/contractsClient';
import { buildKaraokeRoyaltyRows, type KaraokeBackendRow } from '../lib/calculations/karaokeRoyaltyRowModel';
import {
  AREA_USAGE_KIND_OPTIONS,
  AVAILABLE_CALCULATION_MODULES,
  CALC_MODULE_NOT_IMPLEMENTED_PLACEHOLDER,
  CALCULATION_MODULE_OPTIONS,
  CREATE_CONTRACT_AREA_OPTIONS,
  CREATE_CONTRACT_BACKGROUND_DOMAIN_OPTIONS,
  CREATE_CONTRACT_KARAOKE_USAGE_OPTIONS,
  CREATE_CONTRACT_PRICING_RENDER_OPTIONS,
  CREATE_CONTRACT_REGION_OPTIONS,
  CREATE_CONTRACT_RENEWAL_OPTIONS,
  CONTRACT_YEAR_OPTIONS,
  CREATE_CONTRACT_AREA_GROUP_OPTIONS,
  DOMAIN_NOT_IMPLEMENTED_PLACEHOLDER,
  DOMAIN_PLACEHOLDER_ONLY_PLACEHOLDER,
  getModulesByDomainFamily,
  getDomainFamilyFromDomainCode,
  isModuleCompatibleWithDomain,
} from '../data/createContractOptions';
import { RouteKey } from '../data/routes';
import {
  composeContractNo,
  CONTRACT_CREATE_DB_TARGET_HINTS,
  createCalculationLine,
  createDefaultBusinessLocation,
  createDefaultContractDraft,
  createDraftFromContract,
  DEFAULT_BASE_SALARY_VND,
  DEFAULT_GTGT_PERCENT,
  getAreaGroupOptions,
  getCanonicalFieldCode,
  getDomainDisplayName,
  getEffectiveDisplayMode,
  getKvcPricingModeLabel,
  getModuleDisplayName,
  getMusicUsageTypeLabel,
  isAreaBasedDomain,
  isFullyImplementedDomain,
  isKaraokeCalcDomain,
  isModuleAvailable,
  isPlaceholderOnlyDomain,
  mapDraftToContractRecordsCandidate,
  mapDraftToKaraokeCalcInput,
  mapKaraokeResponseToLineResult,
  mapKvcResponseToLineResult,
  mapKvcNd17ResponseToLineResult,
  mapLineInputToKaraokeCalc,
  removeCalculationLineById,
  toggleCalculationLineEnabled,
  updateCalculationLineById,
  addCalculationLine,
  aggregateCalculationLines,
  buildFullAddressFromParts,
  syncUsageFromLegal,
} from '../lib/contractCreateMapper';
import type {
  BackgroundDomainCode,
  BusinessLocationInfo,
  CalculationAggregation,
  CalculationLineInput,
  CalculationModuleCode,
  CreateContractDraft,
  CreateContractRenewalStatus,
  CustomerInfo,
  KaraokeCalculationResult,
  RoyaltyCalculationLine,
} from '../lib/contractCreateTypes';
import {
  buildFullAddress,
} from '../lib/contractCreateTypes';
import {
  getBlockingValidationErrors,
  getWarningIssues,
  isRealAddressValue,
  validateContractDraft,
  validateKaraokeCalcInput,
} from '../lib/contractCreateValidation';
import { useAuth } from '../lib/auth';
import {
  calculateKaraokeDryRun,
  calculateKvcNd17,
  calculateKvcVcpmcTariff,
  simpleCreateContract,
  createAndExportDocx,
  checkContractNoAvailability,
  downloadDocxFile,
  downloadGeneratedDocxFile,
  triggerFileDownload,
  type CreateAndExportDocxResponse,
  type SimpleCreateContractResponse,
} from '../lib/contractsClient';

const TOKEN_KEY = 'vcpmc_new_app_access_token';
const ROOM_SECTION_PRESETS = [
  { value: 'TRET', label: 'Trệt', key: 'Trệt' },
  { value: 'LUNG', label: 'Lửng', key: 'Lửng' },
  ...Array.from({ length: 10 }, (_, index) => {
    const floor = index + 1;
    return { value: `LAU_${floor}`, label: `Lầu ${floor}`, key: `Lầu ${floor}` };
  }),
  { value: 'SAN_VUON', label: 'Sân vườn', key: 'Sân vườn' },
  { value: 'KHAC', label: 'Khác', key: '' },
] as const;

const ROOM_SECTION_OPTIONS = ROOM_SECTION_PRESETS.map(({ value, label }) => ({
  value,
  label,
}));

const getRoomSectionPresetValue = (key: string) =>
  ROOM_SECTION_PRESETS.find((preset) => preset.key && preset.key === key)?.value ?? 'KHAC';

const getRoomSectionKeyFromPreset = (value: string) =>
  ROOM_SECTION_PRESETS.find((preset) => preset.value === value)?.key ?? '';

/**
 * Map calculation line result to RoyaltyTableData for WordLikeRoyaltyTable
 */
function mapCalculationLineToRoyaltyTable(
  line: {
    label: string;
    calculationModule: string;
    input: Record<string, unknown>;
    result: {
      termMonths: number;
      subtotalBeforeGtgt: number;
      gtgtAmount: number;
      totalAmount: number;
      effectiveTotalAmount?: number;
      detailRows: Array<{ label: string; value: number; formula?: string; coefficient?: number }>;
    };
  },
  options?: { totalSubjectText?: string; supportYear?: string }
): RoyaltyTableData {
  const input = line.input as Record<string, unknown>;
  const result = line.result;

  // Build fee lines from detail rows
  const feeLines = result.detailRows.map((row) => ({
    label: row.label,
    baseAmount: input.baseSalary as number || (row.coefficient ? (row.value / (row.coefficient * (input.totalRooms as number || 1))) : row.value),
    coefficient: row.coefficient,
    unitLabel: 'phòng/năm',
    quantity: input.totalRooms as number || 0,
    amount: row.value,
  }));

  // Calculate support
  const supportRate = (input.annualSupportPercent as number) || 0;
  const subtotalBeforeSupport = feeLines.reduce((sum, f) => sum + f.amount, 0);
  const supportAmount = (supportRate / 100) * subtotalBeforeSupport;
  const subtotalAfterSupport = subtotalBeforeSupport - supportAmount;

  // Get GTGT rate and calculate
  const gtgtRate = (input.gtgtPercent as number) || 8;
  const gtgtAmount = Math.round((subtotalAfterSupport * gtgtRate) / 100);

  return {
    subjectLabel: 'phòng Karaoke',
    subjectQuantityText: options?.totalSubjectText || `${input.totalRooms || 0} phòng`,
    formulaText: '(Số tiền bản quyền chi trả (tính theo năm) = Mức lương cơ sở x Hệ số điều chỉnh)',
    lines: feeLines,
    summary: {
      subtotalBeforeSupport,
      supportRate: supportRate > 0 ? supportRate : undefined,
      supportAmount: supportAmount > 0 ? supportAmount : undefined,
      subtotalAfterSupport,
      vatRate: gtgtRate,
      vatAmount: result.gtgtAmount || gtgtAmount,
      totalAmount: result.totalAmount,
      supportYear: options?.supportYear || '2026',
    },
    baseSalary: input.baseSalary as number,
    legalNoteYear: options?.supportYear || '2026',
  };
}

export function CreateContractPage({
  onNavigate,
  onOpenCreatedContract,
  initialDraftFromContract,
  embedded,
}: {
  onNavigate: (k: RouteKey) => void;
  onOpenCreatedContract?: (id: number) => void;
  /** Optional initial draft data from the latest contract */
  initialDraftFromContract?: import('../data/contractRecords').ContractRecord;
  /** When true, page is mounted inside the Workspace Frame. Suppresses
   *  the duplicate outer PageHeader (the workspace already provides one)
   *  and removes the page's max-width so it fills the frame. Form data,
   *  validation, and save behavior are NOT affected. */
  embedded?: boolean;
}) {
  const { currentUser } = useAuth();
  const { employees, loading: employeesLoading } = useEmployeeOptions();
  const today = new Date().toISOString().split('T')[0];
  const [draft, setDraft] = useState<CreateContractDraft>(() => {
    const baseDraft = initialDraftFromContract
      ? createDraftFromContract(initialDraftFromContract)
      : createDefaultContractDraft();
    // Auto-fill assignee from logged-in user
    if (currentUser) {
      const userEmail = currentUser.email || '';
      const matchingEmployee = employees.find(
        (e) => e.email?.toLowerCase() === userEmail.toLowerCase() || e.name?.toLowerCase() === currentUser.name?.toLowerCase()
      );
      baseDraft.assignee = {
        name: matchingEmployee?.name || currentUser.name || '',
        email: matchingEmployee?.email || userEmail,
      };
    }
    // Default signedDate to today if not set
    if (!baseDraft.common.signedDate) {
      baseDraft.common.signedDate = today;
    }
    return baseDraft;
  });

  // ── Pricing workspace state (frontend-only PricingSnapshot preview) ────────
  const [pricingWorkspaceOpen, setPricingWorkspaceOpen] = useState(false);

  const pricingButtonRef = useRef<HTMLButtonElement>(null);
  const [quoteDialogSnapshot, setQuoteDialogSnapshot] = useState<PricingSnapshot | null>(null);

  // ── Karaoke preview (debounced backend dry-run snapshot) ─────────────
  // The CreateContractPage owns no royalty math — it pulls rows from the
  // backend dry-run with a 450ms debounce whenever karaoke inputs change.
  const [karaokePreviewRows, setKaraokePreviewRows] = useState<KaraokeBackendRow[] | null>(null);
  const [karaokePreviewPending, setKaraokePreviewPending] = useState(false);
  const [karaokePreviewError, setKaraokePreviewError] = useState<string | null>(null);
  const [karaokePreviewTotals, setKaraokePreviewTotals] = useState<{
    amountBeforeGtgt: number;
    gtgtAmount: number;
    totalAmount: number;
    vatPercent: number;
    rawSubtotal: number;
  } | null>(null);
  const karaokePreviewTimer = useRef<number | null>(null);
  const karaokePreviewSeq = useRef(0);
  const mapDraftAreaGroupToSnapshot = (g: string | undefined): KaraokeAreaGroup => {
    if (g === 'DEN_20') return 'DEN_20';
    if (g === 'GT_30') return 'GT_30';
    return 'FROM_20_TO_30';
  };
  const [isDirty, setIsDirty] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [roomSectionPresetToAdd, setRoomSectionPresetToAdd] = useState('');

  // Template source tracking (Phase TEMPLATE-CREATE-01)
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedTemplateNo, setSelectedTemplateNo] = useState<string>('');
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [formEditedAfterPrefill, setFormEditedAfterPrefill] = useState(false);

  // Dry-run state
  // Karaoke calculation state (legacy single calc - kept for backward compatibility)
  const [isCalcLoading, setIsCalcLoading] = useState(false);
  const [calcResult, setCalcResult] =
    useState<KaraokeCalculationResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Calculation lines state
  const [isLineCalcLoading, setIsLineCalcLoading] = useState<Record<string, boolean>>({});
  const [lineCalcErrors, setLineCalcErrors] = useState<Record<string, string | null>>({});

  // Derived: calculate aggregation from lines
  const calcLinesAggregation = useMemo<CalculationAggregation>(() => {
    return aggregateCalculationLines(draft.calculationLines, 12);
  }, [draft.calculationLines]);

  // Official create state
  const [isCreateLoading, setIsCreateLoading] = useState(false);
  const [createResult, setCreateResult] =
    useState<CreateAndExportDocxResponse | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [docxDownloadSuccess, setDocxDownloadSuccess] = useState(false);
  const [docxDownloadError, setDocxDownloadError] = useState<string | null>(null);

  // Availability check state
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityCheck, setAvailabilityCheck] = useState<{
    available: boolean | null;
    contract_no: string;
    existing_contract_id: number | null;
    suggested_next: string | null;
    message: string;
  } | null>(null);

  // Derived values
  const contractNoPreview = useMemo(() => composeContractNo(draft), [draft]);
  const candidatePayload = useMemo(
    () => mapDraftToContractRecordsCandidate(draft, calcLinesAggregation),
    [draft, calcLinesAggregation]
  );
  const validationIssues = useMemo(() => validateContractDraft(draft), [draft]);
  const blockingErrors = useMemo(
    () => getBlockingValidationErrors(validationIssues),
    [validationIssues]
  );
  const fieldErrors = useMemo(() => {
    if (!submitAttempted) return {};
    const map: Record<string, string> = {};
    blockingErrors.forEach((err) => {
      if (!map[err.field]) {
        map[err.field] = err.message;
      }
    });
    return map;
  }, [blockingErrors, submitAttempted]);
  const warningIssues = useMemo(
    () => getWarningIssues(validationIssues),
    [validationIssues]
  );

  const isKaraokeDomain = isKaraokeCalcDomain(draft.domain.domainCode);
  const isAreaBasedDomainFlag = isAreaBasedDomain(draft.domain.domainCode);
  const isPlaceholderOnlyDomainFlag = isPlaceholderOnlyDomain(draft.domain.domainCode);
  const isImplementedDomain = isFullyImplementedDomain(draft.domain.domainCode);
  // Area-based (non-Karaoke) domains currently use manual fee entry.
  // They have NO backend formula yet — only Karaoke + KVC are fully
  // implemented. The banner makes this explicit so users do not assume
  // the app auto-computes the price.
  const isManualFeeDomain =
    isAreaBasedDomainFlag &&
    !isKaraokeDomain &&
    draft.domain.domainCode !== 'KHU_VUI_CHOI';
  const domainFamily = getDomainFamilyFromDomainCode(draft.domain.domainCode);
  const filteredModules = useMemo(
    () => getModulesByDomainFamily(domainFamily),
    [domainFamily]
  );
  const canCreateContract =
    !isCreateLoading &&
    // Karaoke: require either confirmed totals from the calculation table
    // (royaltyAmountAfterVat > 0) OR direct manual amount entry
    // (royaltyAmountBeforeVat > 0). Both flows are valid.
    // Also require a positive room/box count appropriate to the karaoke type:
    //   PHONG → totalRooms > 0
    //   BOX    → totalBoxes > 0
    // Manual entry via SimpleRoyaltyInput already writes to draft.areaBased,
    // so checking royaltyAmountBeforeVat > 0 is sufficient.
    (!isKaraokeDomain ||
      (((draft.areaBased.royaltyAmountBeforeVat ?? 0) > 0 ||
        (draft.areaBased.royaltyAmountAfterVat ?? 0) > 0) &&
        (draft.karaoke.karaokeType === 'BOX'
          ? (draft.karaoke.totalBoxes ?? 0) > 0
          : (draft.karaoke.totalRooms ?? 0) > 0)));
  const createdContractId =
    typeof createResult?.contract_id === 'number'
      ? createResult.contract_id
      : null;

  // =========================================================================
  // UPDATE HANDLERS
  // =========================================================================

  const updateDraft = (
    updater: (current: CreateContractDraft) => CreateContractDraft
  ) => {
    setDraft((current) => updater(current));
    setIsDirty(true);
    setCreateResult(null);
    setCreateError(null);
    setCalcResult(null);
    setDocxDownloadSuccess(false);
    // Clear availability check when any field changes
    setAvailabilityCheck(null);
    // Track if user edited form after prefill (for template change warning)
    if (selectedTemplateId) {
      setFormEditedAfterPrefill(true);
    }
  };

  // ===========================================================================
  // WORKFLOW NAVIGATION (Guided Dossier integration)
  // ===========================================================================

  const [activeSectionId, setActiveSectionId] = React.useState('sec-id');

  const contractHasNumber = !!draft.common.contractNumber && !!draft.common.contractYear;
  const contractHasTerm =
    !!draft.customer.representativeName && !!draft.term.effectiveFrom && !!draft.term.effectiveTo;
  const partnerComplete =
    !!draft.customer.legalName &&
    !!draft.customer.brandName &&
    !!draft.customer.legalAddress;
  const usageAddressComplete =
    !!draft.customer.legalAddress &&
    !!draft.location.usageAddress;
  const domainComplete = !!draft.domain.domainCode;

  const sectionStatus = (
    filled: boolean,
    isCurrent: boolean
  ): SectionNavItem['status'] => {
    if (isCurrent) return 'current';
    if (filled) return 'complete';
    return 'idle';
  };

  const navItems: SectionNavItem[] = React.useMemo(() => {
    const items: SectionNavItem[] = [
      {
        id: 'sec-id',
        number: '01',
        label: 'Định danh & Lĩnh vực',
        status: sectionStatus(contractHasNumber && domainComplete, activeSectionId === 'sec-id'),
      },
      {
        id: 'sec-partner',
        number: '02',
        label: 'Đối tác & Địa chỉ',
        status: sectionStatus(partnerComplete && usageAddressComplete, activeSectionId === 'sec-partner'),
      },
      {
        id: 'sec-term',
        number: '03',
        label: 'Thời hạn & người thực hiện',
        status: sectionStatus(contractHasTerm, activeSectionId === 'sec-term'),
      },
      {
        id: 'sec-template',
        number: '04',
        label: 'Mẫu xuất hợp đồng',
        status: sectionStatus(true, activeSectionId === 'sec-template'),
      },
      {
        id: 'sec-usage',
        number: '05',
        label: 'Khu vực & Tiền bản quyền',
        status: sectionStatus(draft.areaBased.musicUsageAreas.length > 0, activeSectionId === 'sec-usage'),
      },
    ];
    return items;
  }, [
    contractHasNumber,
    domainComplete,
    partnerComplete,
    usageAddressComplete,
    contractHasTerm,
    draft.areaBased.musicUsageAreas.length,
    activeSectionId,
  ]);

  // IntersectionObserver: track which section is currently in view.
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => (a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top));
        if (visible.length > 0) {
          setActiveSectionId(visible[0].target.id);
        }
      },
      { rootMargin: '-15% 0px -55% 0px', threshold: 0 }
    );
    const sections = document.querySelectorAll('section[id^="sec-"]');
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const scrollToSection = React.useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSectionId(id);
    }
  }, []);

  // =============================================================================
  // TEMPLATE HANDLERS (Phase TEMPLATE-CREATE-01)
  // =============================================================================

  const handleTemplateSelected = (contractId: number, contractNo: string) => {
    setSelectedTemplateId(contractId);
    setSelectedTemplateNo(contractNo);
    setFormEditedAfterPrefill(false);
  };

  const handleTemplateCleared = () => {
    setSelectedTemplateId(null);
    setSelectedTemplateNo('');
    setSelectedTemplateName('');
    setFormEditedAfterPrefill(false);
    // Clear template references from draft but keep form data
    updateDraft((current) => ({
      ...current,
      domain: {
        ...current.domain,
        sourceTemplateContractId: null,
        sourceTemplateContractNo: '',
      },
    }));
  };

  const handlePrefillData = (prefillData: PrefillSourceResponse) => {
    // Extract domain code from string
    const domainCodeMap: Record<string, import('../lib/contractCreateTypes').BackgroundDomainCode> = {
      'KARAOKE': 'KARAOKE',
      'PHONG_THU_AM': 'PHONG_THU_AM',
      'CAFE': 'CAFE',
      'NHA_HANG': 'NHA_HANG',
      'KHU_VUI_CHOI': 'KHU_VUI_CHOI',
      'KHACH_SAN': 'KHACH_SAN',
      'SIEU_THI': 'SIEU_THI',
      'TRUNG_TAM_THUONG_MAI': 'TRUNG_TAM_THUONG_MAI',
      'BAR': 'BAR',
      'VAN_PHONG': 'VAN_PHONG',
      'CUA_HANG': 'CUA_HANG',
      'RAP_CHIEU': 'RAP_CHIEU',
      'PHONG_TRA': 'PHONG_TRA',
      'CHAM_SOC_SUC_KHOE': 'CHAM_SOC_SUC_KHOE',
    };
    const domainCode = prefillData.domain_code
      ? (domainCodeMap[prefillData.domain_code.toUpperCase()] || prefillData.domain_code as any)
      : prefillData.domain_code;

    // Parse room sections from prefill data
    const roomSections = (prefillData.room_sections || []).map((section: any) => ({
      key: section.key || '',
      roomCount: section.room_count || section.roomCount || 0,
      roomNames: section.room_names_text || section.roomNames || '',
    }));

    // ================================================================
    // NORMALIZE PREFILL DATA (Frontend Safety Layer)
    // ================================================================

    // Address normalization with strict validation
    // Filter out placeholder/key strings (e.g., "don_vi_dia_chi", "{{...}}", "__...__")
    let legalFullAddress = isRealAddressValue(prefillData.legal_full_address)
      ? prefillData.legal_full_address
      : null;
    let usageFullAddress = isRealAddressValue(prefillData.usage_full_address)
      ? prefillData.usage_full_address
      : null;
    let legalAddressLine = isRealAddressValue(prefillData.legal_address_line)
      ? prefillData.legal_address_line
      : null;
    let usageAddressLine = isRealAddressValue(prefillData.usage_address_line)
      ? prefillData.usage_address_line
      : null;

    // If legal_full_address is missing but legal_address_line has data, use it
    if (!legalFullAddress && legalAddressLine) {
      legalFullAddress = legalAddressLine;
    }

    // If legal_address_line is missing but legal_full_address has data, use it
    if (!legalAddressLine && legalFullAddress) {
      legalAddressLine = legalFullAddress;
    }

    // If usage_full_address is missing but usage_address_line has data, use it
    if (!usageFullAddress && usageAddressLine) {
      usageFullAddress = usageAddressLine;
    }

    // If usage_address_line is missing but usage_full_address has data, use it
    if (!usageAddressLine && usageFullAddress) {
      usageAddressLine = usageFullAddress;
    }

    // Legal address fallback: if no real legal address, use usage_full_address
    if (!legalFullAddress && usageFullAddress) {
      legalFullAddress = usageFullAddress;
      legalAddressLine = usageAddressLine;
    }

    // Determine usage_same_as_legal
    // Only use the prefill value if explicitly provided (not undefined/null)
    let usageSameAsLegal: boolean;
    if (prefillData.usage_same_as_legal !== undefined && prefillData.usage_same_as_legal !== null) {
      usageSameAsLegal = Boolean(prefillData.usage_same_as_legal);
    } else {
      // Fallback: compare usage and legal addresses
      usageSameAsLegal = !usageFullAddress || (legalFullAddress && usageFullAddress === legalFullAddress);
    }

    // Parse music usage areas
    let musicUsageAreas = (prefillData.music_usage_areas || []).map((area: any, idx: number) => ({
      id: `area-${idx}`,
      areaName: area.area_name || area.areaName || '',
      pricingLabel: area.pricing_label || area.pricingLabel || area.area_name || area.areaName || '',
      scaleDescription: area.scale_description || area.scaleDescription || '',
      musicUsageType: area.music_usage_type || area.musicUsageType || 'NHAC_NEN',
    }));

    // Music usage areas fallback: generate from room_sections/total_rooms
    let generatedFromRoomSections = false;
    if (musicUsageAreas.length === 0 && (prefillData.total_rooms || roomSections.length > 0)) {
      const totalRooms = prefillData.total_rooms || 0;
      let scaleDescription = '';

      if (totalRooms > 0) {
        scaleDescription = `${totalRooms} phòng`;
      } else if (roomSections.length > 0) {
        // Calculate total from room sections
        const calculatedTotal = roomSections.reduce((sum, s) => sum + (s.roomCount || 0), 0);
        if (calculatedTotal > 0) {
          scaleDescription = `${calculatedTotal} phòng`;
        } else {
          scaleDescription = 'Theo thông tin hợp đồng cũ';
        }
      } else {
        scaleDescription = 'Theo thông tin hợp đồng cũ';
      }

      musicUsageAreas = [{
        id: 'area-0',
        areaName: 'Phòng Karaoke',
        pricingLabel: 'Phòng Karaoke',
        scaleDescription: scaleDescription,
        musicUsageType: 'KARAOKE',
      }];
      generatedFromRoomSections = true;
    }

    // Check if it's a karaoke domain
    const isKaraokeDomain = ['KARAOKE', 'PHONG_THU_AM'].includes(prefillData.domain_code || '');

    updateDraft((current) => {
      // Track old template ID for logging
      const oldTemplateId = current.domain.sourceTemplateContractId;

      // Start with default draft to ensure all required fields exist
      // This prevents undefined crashes when components call .filter() on arrays
      const baseDraft = createDefaultContractDraft();

      // Build safe prefill data (ensure arrays)
      const safeMusicUsageAreas = Array.isArray(musicUsageAreas) ? musicUsageAreas : [];
      const safeRoomSections = Array.isArray(roomSections) ? roomSections : [];

      // Keep user-input fields
      const userInputContractNumber = current.common.contractNumber;
      const userInputSignedDate = current.common.signedDate;
      const userInputEffectiveFrom = current.term.effectiveFrom;
      const userInputEffectiveTo = current.term.effectiveTo;

      const newDraft: CreateContractDraft = {
        // Merge base draft first (ensures all fields exist)
        ...baseDraft,

        // Override with business data from template
        customer: {
          ...baseDraft.customer,
          legalName: prefillData.legal_name || '',
          brandName: prefillData.brand_name || '',
          representativeName: prefillData.representative_name || '',
          representativeTitle: prefillData.representative_title || '',
          taxCode: prefillData.tax_code || '',
          cccd: prefillData.cccd || '',
          phone: prefillData.phone || '',
          email: prefillData.email || '',
          legalAddressLine: legalAddressLine || '',
          legalWard: prefillData.legal_ward || '',
          legalProvince: prefillData.legal_province || '',
          legalFullAddress: legalFullAddress || '',
          legalAddress: legalFullAddress || '',
        },
        location: {
          ...baseDraft.location,
          usageSameAsLegal: usageSameAsLegal,
          usageAddressLine: usageAddressLine || '',
          usageWard: prefillData.usage_ward || '',
          usageProvince: prefillData.usage_province || '',
          usageFullAddress: usageFullAddress || '',
          usageAddress: usageFullAddress || '',
        },
        domain: {
          ...baseDraft.domain,
          domainGroup: prefillData.domain_group || 'background',
          domainCode: (domainCode as any) || 'KARAOKE',
          domainDisplayName: prefillData.domain_display_name || prefillData.domain_code || 'Karaoke',
          fieldCode: prefillData.field_code || '',
          renewalStatus: 'NEW',
          referenceContractId: null,
          referenceContractNo: '',
          sourceTemplateContractId: prefillData.contract_id,
          sourceTemplateContractNo: prefillData.contract_no,
        },
        karaoke: isKaraokeDomain ? {
          ...baseDraft.karaoke,
          karaokeType: (prefillData.karaoke_type as 'PHONG' | 'BOX') || 'PHONG',
          totalRooms: prefillData.total_rooms || 0,
          totalBoxes: prefillData.total_boxes || 0,
          baseSalary: 2530000,
          annualSupportPercent: 100,
          tier1SupportPercent: 0,
          tier2SupportPercent: 0,
          tier3SupportPercent: 0,
          gtgtPercent: 8,
          pricingRenderMode: 'text',
          roomSections: safeRoomSections,
        } : baseDraft.karaoke,
        areaBased: {
          ...baseDraft.areaBased,
          musicUsageAreas: safeMusicUsageAreas,
          royaltyAmountBeforeVat: prefillData.royalty_amount_before_vat ?? 0,
          vatRate: prefillData.vat_rate ?? 8,
          vatAmount: prefillData.vat_amount ?? 0,
          royaltyAmountAfterVat: prefillData.royalty_amount_after_vat ?? 0,
          royaltyAmountInWords: prefillData.royalty_amount_in_words || '',
        },
        notes: {
          ...baseDraft.notes,
          contractTerms: prefillData.contract_terms_note || '',
        },
        // User input fields - never override from template
        common: {
          ...baseDraft.common,
          contractNumber: userInputContractNumber,
          signedDate: userInputSignedDate,
          contractYear: current.common.contractYear || baseDraft.common.contractYear,
          regionCode: current.common.regionCode || baseDraft.common.regionCode,
          areaCode: current.common.areaCode,
          fieldCode: current.common.fieldCode,
        },
        term: {
          ...baseDraft.term,
          effectiveFrom: userInputEffectiveFrom,
          effectiveTo: userInputEffectiveTo,
        },
        assignee: {
          ...baseDraft.assignee,
          email: current.assignee.email || baseDraft.assignee.email,
        },
      };

      updateDraft(() => newDraft);

      return newDraft;
    });

    // Update template name for display
    setSelectedTemplateName(prefillData.legal_name || '');
  };

  // Check contract number availability
  const checkAvailability = async () => {
    if (!contractNoPreview) {
      setAvailabilityCheck(null);
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    setIsCheckingAvailability(true);
    try {
      const result = await checkContractNoAvailability({
        contract_no: contractNoPreview,
        short_no: draft.common.contractNumber,
        year: parseInt(draft.common.contractYear) || undefined,
        region_code: draft.common.regionCode || undefined,
        permission_code: draft.common.fieldCode || undefined,
      });
      setAvailabilityCheck({
        available: result.available,
        contract_no: result.contract_no,
        existing_contract_id: result.existing_contract_id,
        suggested_next: result.suggested_next,
        message: result.message,
      });
    } catch (error: any) {
      console.error("[contract-no-check] error:", error);
      setAvailabilityCheck(null);
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const updateDomain = (code: BackgroundDomainCode) => {
    const domainFamily = getDomainFamilyFromDomainCode(code);
    updateDraft((current) => ({
      ...current,
      common: {
        ...current.common,
        fieldCode: getCanonicalFieldCode(code),
      },
      domain: {
        ...current.domain,
        domainCode: code,
        domainDisplayName: getDomainDisplayName(code),
      },
      karaoke: isKaraokeCalcDomain(code) ? current.karaoke : {
        karaokeType: 'PHONG' as const,
        areaGroup: 'DEN_20' as const,
        totalRooms: 0,
        totalBoxes: 0,
        baseSalary: DEFAULT_BASE_SALARY_VND,
        annualSupportPercent: 100,
        tier1SupportPercent: 0,
        tier2SupportPercent: 0,
        tier3SupportPercent: 0,
        gtgtPercent: DEFAULT_GTGT_PERCENT,
        pricingRenderMode: 'text' as const,
        roomSections: [],
      },
      // Keep only lines compatible with the new domain family (with guard)
      calculationLines: (current.calculationLines ?? []).filter((line) =>
        isModuleCompatibleWithDomain(line.calculationModule, code)
      ),
    }));
  };

  const updateKaraokeRoomCount = (count: number) => {
    updateDraft((current) => {
      const normalizedCount = Math.max(0, count || 0);
      const karaokeType = current.karaoke.karaokeType;
      return {
        ...current,
        karaoke: {
          ...current.karaoke,
          totalRooms: karaokeType === 'PHONG' ? normalizedCount : current.karaoke.totalRooms,
          totalBoxes: karaokeType === 'BOX' ? normalizedCount : current.karaoke.totalBoxes,
        },
        calculationLines: current.calculationLines.map((line) => {
          if (karaokeType === 'PHONG' && line.input.module === 'KARAOKE_PHONG') {
            return {
              ...line,
              input: {
                ...line.input,
                totalRooms: normalizedCount,
                areaGroup: current.karaoke.areaGroup === 'BOX' ? 'DEN_20' : current.karaoke.areaGroup,
              },
              result: null,
              status: 'idle',
            };
          }
          if (karaokeType === 'BOX' && line.input.module === 'KARAOKE_BOX') {
            return {
              ...line,
              input: {
                ...line.input,
                totalBoxes: normalizedCount,
              },
              result: null,
              status: 'idle',
            };
          }
          return line;
        }),
      };
    });
  };

  const updateKaraokeCalculationField = (
    lineId: string,
    field: string,
    value: number | string,
  ) => {
    updateDraft((current) => ({
      ...current,
      karaoke: {
        ...current.karaoke,
        ...(field === 'baseSalary' || field === 'gtgtPercent' || field === 'annualSupportPercent'
          ? { [field]: value, tier1SupportPercent: 0, tier2SupportPercent: 0, tier3SupportPercent: 0 }
          : {}),
      },
      calculationLines: current.calculationLines.map((line) =>
        line.id === lineId
          ? { ...line, input: { ...line.input, [field]: value }, result: null, status: 'idle' }
          : line
      ),
    }));
  };

  const updateRoomSection = (
    index: number,
    field: 'key' | 'roomCount' | 'roomNames',
    value: string | number
  ) => {
    updateDraft((current) => {
      const roomSections = current.karaoke.roomSections.map((section, i) =>
        i === index ? { ...section, [field]: value } : section
      );
      const sectionTotal = roomSections.reduce(
        (sum, section) => sum + Math.max(0, Number(section.roomCount) || 0),
        0
      );
      const karaokeType = current.karaoke.karaokeType;

      return {
        ...current,
        karaoke: {
          ...current.karaoke,
          roomSections,
          totalRooms: karaokeType === 'PHONG' ? sectionTotal : current.karaoke.totalRooms,
          totalBoxes: karaokeType === 'BOX' ? sectionTotal : current.karaoke.totalBoxes,
        },
        calculationLines: current.calculationLines.map((line) => {
          if (karaokeType === 'PHONG' && line.input.module === 'KARAOKE_PHONG') {
            return {
              ...line,
              input: { ...line.input, totalRooms: sectionTotal },
              result: null,
              status: 'idle',
            };
          }
          if (karaokeType === 'BOX' && line.input.module === 'KARAOKE_BOX') {
            return {
              ...line,
              input: { ...line.input, totalBoxes: sectionTotal },
              result: null,
              status: 'idle',
            };
          }
          return line;
        }),
      };
    });
  };

  const addRoomSection = (presetValue: string) => {
    const key = getRoomSectionKeyFromPreset(presetValue);
    updateDraft((current) => ({
      ...current,
      karaoke: {
        ...current.karaoke,
        roomSections: [
          ...current.karaoke.roomSections,
          {
            key,
            roomCount: 0,
            roomNames: '',
          },
        ],
      },
    }));
  };

  const removeRoomSection = (index: number) => {
    updateDraft((current) => {
      const roomSections = (current.karaoke.roomSections ?? []).filter((_, i) => i !== index);
      const sectionTotal = roomSections.reduce(
        (sum, section) => sum + Math.max(0, Number(section.roomCount) || 0),
        0
      );
      const karaokeType = current.karaoke.karaokeType;

      return {
        ...current,
        karaoke: {
          ...current.karaoke,
          roomSections,
          totalRooms: karaokeType === 'PHONG' ? sectionTotal : current.karaoke.totalRooms,
          totalBoxes: karaokeType === 'BOX' ? sectionTotal : current.karaoke.totalBoxes,
        },
        calculationLines: current.calculationLines.map((line) => {
          if (karaokeType === 'PHONG' && line.input.module === 'KARAOKE_PHONG') {
            return {
              ...line,
              input: { ...line.input, totalRooms: sectionTotal },
              result: null,
              status: 'idle',
            };
          }
          if (karaokeType === 'BOX' && line.input.module === 'KARAOKE_BOX') {
            return {
              ...line,
              input: { ...line.input, totalBoxes: sectionTotal },
              result: null,
              status: 'idle',
            };
          }
          return line;
        }),
      };
    });
  };

  // =========================================================================
  // CHECKLIST & STEPS
  // =========================================================================

  const checklist = useMemo(
    () => [
      {
        label: 'Số hợp đồng hợp lệ',
        completed: !!draft.common.contractNumber && !!draft.common.contractYear,
        targetId: 'field-contract',
      },
      {
        label: 'Đã có đối tác',
        completed: !!draft.customer.legalName && !!draft.customer.brandName,
        targetId: 'field-customer',
      },
      {
        label: 'Đã có địa chỉ sử dụng',
        completed: !!draft.location.usageAddress || !!draft.customer.legalFullAddress,
        targetId: 'field-location',
      },
      {
        label: 'Đã có thời hạn',
        completed: !!draft.term.effectiveFrom && !!draft.term.effectiveTo,
        targetId: 'field-term',
      },
    ],
    [draft]
  );

  const steps = [
    { label: 'Thông tin chung', completed: checklist[0].completed && checklist[1].completed },
    { label: 'Lĩnh vực', completed: !!draft.domain.domainCode },
    { label: 'Khu vực KD', completed: true },
    { label: 'Tiền bản quyền', completed: (draft.areaBased.royaltyAmountBeforeVat ?? 0) > 0 },
    { label: 'Mẫu & Kiểm tra', completed: checklist.every((c) => c.completed) },
  ];

  // =========================================================================
  // KARAOKE CALCULATION HANDLER
  // =========================================================================

  const handleKaraokeCalc = async () => {
    const calcIssues = validateKaraokeCalcInput(draft);
    const blocking = calcIssues.filter((i) => i.severity === 'error');
    if (blocking.length > 0) {
      setCalcError('Vui lòng kiểm tra lại thông tin trước khi tính.');
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setCalcError('Bạn cần đăng nhập trước khi tính tiền bản quyền.');
      return;
    }

    setIsCalcLoading(true);
    setCalcError(null);
    try {
      const input = mapDraftToKaraokeCalcInput(draft);
      const result = await calculateKaraokeDryRun(token, input);
      setCalcResult(result);
    } catch (error: any) {
      setCalcError(String(error?.message || 'Tính tiền thất bại.'));
    } finally {
      setIsCalcLoading(false);
    }
  };

  // =========================================================================
  // KARAOKE LIVE PREVIEW (backend is the single source of truth)
  // Debounced dry-run whenever the karaoke inputs change, so the contract
  // layout table below the form always mirrors the backend calculation.
  // =========================================================================
  const karaokeCalcSignature = useMemo(
    () =>
      JSON.stringify({
        domain: draft.domain.domainCode,
        karaokeType: draft.karaoke.karaokeType,
        areaGroup: draft.karaoke.areaGroup,
        totalRooms: draft.karaoke.totalRooms,
        totalBoxes: draft.karaoke.totalBoxes,
        baseSalary: draft.karaoke.baseSalary,
        support: draft.karaoke.annualSupportPercent,
        gtgt: draft.karaoke.gtgtPercent,
        from: draft.term.effectiveFrom,
        to: draft.term.effectiveTo,
      }),
    [draft.domain.domainCode, draft.karaoke, draft.term.effectiveFrom, draft.term.effectiveTo]
  );

  useEffect(() => {
    if (!isKaraokeDomain) {
      setCalcResult(null);
      return;
    }
    const units = (draft.karaoke.totalRooms || 0) + (draft.karaoke.totalBoxes || 0);
    if (units <= 0 || !(draft.karaoke.baseSalary > 0)) {
      setCalcResult(null);
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await calculateKaraokeDryRun(token, mapDraftToKaraokeCalcInput(draft));
        if (!cancelled) setCalcResult(result);
      } catch {
        if (!cancelled) setCalcResult(null);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karaokeCalcSignature, isKaraokeDomain]);

  /** Contract-layout rows for the preview — derived ONLY from backend result. */
  const karaokePreviewTable = useMemo<RoyaltyTableData | null>(() => {
    if (!isKaraokeDomain || !calcResult) return null;
    return buildKaraokeRoyaltyTableData(calcResult, {
      supportYear: (draft.term.effectiveFrom || '').slice(0, 4) || undefined,
    });
  }, [isKaraokeDomain, calcResult, draft.term.effectiveFrom]);

  // =========================================================================
  // CALCULATION LINES HANDLERS
  // =========================================================================

  const handleAddCalcLine = (module: CalculationModuleCode) => {
    updateDraft((current) => {
      const allLocationIds = current.areaBased.locations.map((loc) => loc.id);
      return {
        ...current,
        calculationLines: [
          ...current.calculationLines,
          createCalculationLine(module, current.calculationLines.length, allLocationIds),
        ],
      };
    });
  };

  const handleRemoveCalcLine = (lineId: string) => {
    updateDraft((current) => ({
      ...current,
      calculationLines: (current.calculationLines ?? []).filter((line) => line.id !== lineId),
    }));
  };

  const handleToggleCalcLineEnabled = (lineId: string) => {
    updateDraft((current) => ({
      ...current,
      calculationLines: current.calculationLines.map((line) =>
        line.id === lineId ? { ...line, enabled: !line.enabled } : line
      ),
    }));
  };

  const handleUpdateCalcLineLabel = (lineId: string, label: string) => {
    updateDraft((current) => ({
      ...current,
      calculationLines: current.calculationLines.map((line) =>
        line.id === lineId ? { ...line, label } : line
      ),
    }));
  };

  const handleUpdateCalcLineModule = (lineId: string, module: CalculationModuleCode) => {
    updateDraft((current) => {
      const allLocationIds = current.areaBased.locations.map((loc) => loc.id);
      return {
        ...current,
        calculationLines: current.calculationLines.map((line) => {
          if (line.id !== lineId) return line;
          const newLine = createCalculationLine(module, current.calculationLines.length, allLocationIds);
          return {
            ...newLine,
            id: lineId,
            label: line.label || newLine.label,
            enabled: line.enabled,
          };
        }),
      };
    });
  };

  const handleUpdateLineInput = (lineId: string, input: RoyaltyCalculationLine['input']) => {
    updateDraft((current) => ({
      ...current,
      calculationLines: current.calculationLines.map((line) =>
        line.id === lineId ? { ...line, input } : line
      ),
    }));
  };

  const handleCalculateLine = async (lineId: string) => {
    const line = draft.calculationLines.find((l) => l.id === lineId);
    if (!line) return;

    if (!isModuleAvailable(line.calculationModule)) {
      setLineCalcErrors((prev) => ({ ...prev, [lineId]: 'Module này chưa triển khai.' }));
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLineCalcErrors((prev) => ({ ...prev, [lineId]: 'Bạn cần đăng nhập.' }));
      return;
    }

    setIsLineCalcLoading((prev) => ({ ...prev, [lineId]: true }));
    setLineCalcErrors((prev) => ({ ...prev, [lineId]: null }));

    try {
      if (line.calculationModule === 'KARAOKE_PHONG' || line.calculationModule === 'KARAOKE_BOX') {
        const calcInput = mapLineInputToKaraokeCalc(
          line.input.module === 'KARAOKE_PHONG'
            ? {
                ...line.input,
                areaGroup: draft.karaoke.areaGroup === 'BOX' ? 'DEN_20' : draft.karaoke.areaGroup,
                totalRooms: draft.karaoke.totalRooms,
              }
            : line.input.module === 'KARAOKE_BOX'
              ? {
                  ...line.input,
                  totalBoxes: draft.karaoke.totalBoxes,
                }
              : line.input,
          composeContractNo(draft),
          draft.term.effectiveFrom,
          draft.term.effectiveTo,
          draft.karaoke.pricingRenderMode,
          draft.karaoke.roomSections
        );

        if (!calcInput) {
          throw new Error('Không thể tạo input cho module này.');
        }

        const response = await calculateKaraokeDryRun(token, calcInput);
        const lineResult = mapKaraokeResponseToLineResult(response);

        updateDraft((current) => ({
          ...current,
          calculationLines: current.calculationLines.map((l) =>
            l.id === lineId
              ? {
                  ...l,
                  result: lineResult,
                  status: response.ok ? 'success' : 'error',
                  errors: response.errors.map((e) => ({ field: e.field, message: e.message })),
                  warnings: response.warnings.map((w) => ({ field: w.field, message: w.message })),
                }
              : l
          ),
        }));
      } else if (line.calculationModule === 'KVC_VCPMC_TARIFF') {
        // PHASE KVC-02b: Backend is source of truth
        const locations = (draft.areaBased.locations ?? [])
          .filter((loc) => line.appliesToLocationIds.includes(loc.id))
          .map((loc) => ({
            id: loc.id,
            name: loc.locationName || loc.businessAddress || loc.id,
            area_m2: loc.musicUsageAreaM2 || 0,
          }));

        const calcInput = {
          locations,
          gtgt_percent: (line.input as any).gtgtPercent ?? 8.0,
          support_percent: (line.input as any).supportPercent ?? 0.0,
          support_amount: (line.input as any).supportAmount ?? 0,
          support_note: (line.input as any).supportNote ?? '',
        };

        const response = await calculateKvcVcpmcTariff(token, calcInput);
        const lineResult = mapKvcResponseToLineResult(response);

        updateDraft((current) => ({
          ...current,
          calculationLines: current.calculationLines.map((l) =>
            l.id === lineId
              ? {
                  ...l,
                  result: lineResult,
                  status: response.ok ? 'success' : 'error',
                  errors: response.errors.map((e) => ({ field: e.field, message: e.message })),
                  warnings: response.warnings.map((w) => ({ field: w.field, message: w.message })),
                }
              : l
          ),
        }));
      } else if (line.calculationModule === 'KVC_ND17') {
        // PHASE KVC-05: ND17 calculation
        const locations = (draft.areaBased.locations ?? [])
          .filter((loc) => line.appliesToLocationIds.includes(loc.id))
          .map((loc) => ({
            id: loc.id,
            name: loc.locationName || loc.businessAddress || loc.id,
            area_m2: loc.musicUsageAreaM2 || 0,
          }));

        const calcInput = {
          locations,
          base_salary: (line.input as any).baseSalary ?? 2530000,
          urban_class: (line.input as any).urbanClass,
          gtgt_percent: (line.input as any).gtgtPercent ?? 8.0,
          support_percent: (line.input as any).supportPercent ?? 0.0,
          support_amount: (line.input as any).supportAmount ?? 0,
          support_note: (line.input as any).supportNote ?? '',
          include_premise_services: (line.input as any).includePremiseServices ?? false,
          premise_services_note: (line.input as any).premiseServicesNote ?? '',
        };

        const response = await calculateKvcNd17(token, calcInput);
        const lineResult = mapKvcNd17ResponseToLineResult(response);

        updateDraft((current) => ({
          ...current,
          calculationLines: current.calculationLines.map((l) =>
            l.id === lineId
              ? {
                  ...l,
                  result: lineResult,
                  status: response.ok ? 'success' : 'error',
                  errors: response.errors.map((e) => ({ field: e.field, message: e.message })),
                  warnings: response.warnings.map((w) => ({ field: w.field, message: w.message })),
                }
              : l
          ),
        }));
      } else if (['CAFE', 'NHA_HANG', 'KHACH_SAN', 'MANUAL_FEE'].includes(line.calculationModule)) {
        // Manual fee modules - compute result locally from user input
        const tienChuaGtgt = (line.input as any).tienChuaGtgt ?? 0;
        const gtgtPercent = (line.input as any).gtgtPercent ?? 8;
        const gtgtAmount = Math.round(tienChuaGtgt * gtgtPercent / 100);
        const tienSauThue = tienChuaGtgt + gtgtAmount;

        const termFrom = draft.term.effectiveFrom ? new Date(draft.term.effectiveFrom) : null;
        const termTo = draft.term.effectiveTo ? new Date(draft.term.effectiveTo) : null;
        let termMonths = 12;
        if (termFrom && termTo) {
          const months = (termTo.getFullYear() - termFrom.getFullYear()) * 12 + (termTo.getMonth() - termFrom.getMonth());
          termMonths = Math.max(1, Math.min(12, months));
        }

        const manualLineResult = {
          termMonths,
          subtotalBeforeGtgt: tienChuaGtgt,
          gtgtAmount,
          totalAmount: tienSauThue,
          effectiveSubtotalBeforeGtgt: tienChuaGtgt,
          effectiveTotalAmount: tienSauThue,
          detailRows: [
            { label: 'Tiền chưa thuế GTGT', value: tienChuaGtgt },
            { label: `Thuế GTGT (${gtgtPercent}%)`, value: gtgtAmount },
          ],
          warnings: [] as { field: string; message: string; severity: string }[],
          errors: [] as { field: string; message: string }[],
          docxContextPreview: {} as Record<string, string>,
        };

        updateDraft((current) => ({
          ...current,
          calculationLines: current.calculationLines.map((l) =>
            l.id === lineId
              ? {
                  ...l,
                  result: manualLineResult,
                  status: 'success' as const,
                  errors: [],
                  warnings: [],
                }
              : l
          ),
        }));
      } else {
        // Module not implemented yet
        setLineCalcErrors((prev) => ({ ...prev, [lineId]: CALC_MODULE_NOT_IMPLEMENTED_PLACEHOLDER }));
      }
    } catch (error: any) {
      setLineCalcErrors((prev) => ({ ...prev, [lineId]: String(error?.message || 'Tính thử thất bại.') }));
      updateDraft((current) => ({
        ...current,
        calculationLines: current.calculationLines.map((l) =>
          l.id === lineId
            ? { ...l, status: 'error' as const, result: null }
            : l
        ),
      }));
    } finally {
      setIsLineCalcLoading((prev) => ({ ...prev, [lineId]: false }));
    }
  };

  // =========================================================================
  // OFFICIAL CREATE + DOWNLOAD HANDLER
  // =========================================================================

  const handleCreateContract = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setCreateError('Bạn cần đăng nhập trước khi tạo hợp đồng.');
      return;
    }
    if (!canCreateContract) {
      // Money guard: allow either manual entry (royaltyAmountBeforeVat > 0) or
      // calculation result (royaltyAmountAfterVat > 0). Neither alone is enough.
      const hasMoney =
        (draft.areaBased.royaltyAmountBeforeVat ?? 0) > 0 ||
        (draft.areaBased.royaltyAmountAfterVat ?? 0) > 0;
      const isBoxType = draft.karaoke.karaokeType === 'BOX';
      const hasRooms =
        isBoxType
          ? (draft.karaoke.totalBoxes ?? 0) > 0
          : (draft.karaoke.totalRooms ?? 0) > 0;

      if (isKaraokeDomain && !hasMoney) {
        setCreateError(
          'Vui lòng nhập tiền bản quyền thủ công hoặc sử dụng bảng tính Karaoke trước khi tạo hợp đồng.',
        );
      } else if (isKaraokeDomain && !hasRooms) {
        setCreateError(
          isBoxType
            ? 'Vui lòng nhập số box trong thông tin Karaoke trước khi tạo hợp đồng.'
            : 'Vui lòng nhập tổng số phòng trong thông tin Karaoke trước khi tạo hợp đồng.',
        );
      } else {
        setCreateError('Vui lòng điền đầy đủ thông tin hợp đồng trước khi tạo.');
      }
      return;
    }

    // If we already know it's unavailable, warn user
    if (availabilityCheck && !availabilityCheck.available) {
      setCreateError(`${availabilityCheck.message} (${availabilityCheck.contract_no})`);
      return;
    }

    setIsCreateLoading(true);
    setCreateError(null);
    setCreateResult(null);
    setDocxDownloadError(null);
    setDocxDownloadSuccess(false);
    setSubmitAttempted(true);

    // Safe debug log — no token / secrets
    console.info('[create-contract] submitting', {
      domain: draft.domain.domainCode,
      template: draft.contractTemplateCode,
      contractNo: contractNoPreview,
      beforeVat: candidatePayload.royalty_amount_before_vat,
      vatRate: candidatePayload.vat_rate,
      vatAmount: candidatePayload.vat_amount,
      afterVat: candidatePayload.royalty_amount_after_vat,
    });

    try {
      const result = await createAndExportDocx(token, {
        draft,
        client_preflight: candidatePayload,
      });
      setCreateResult(result);

      console.info('[create-contract] response', {
        ok: result.ok,
        mode: result.mode,
        contractId: result.contract_id,
        contractNo: result.contract_no,
        docxPath: result.docx_path,
        docxExportSkipped: result.docx_export_skipped,
        docxSkipReason: result.docx_skip_reason,
      });

      if (!result.ok) {
        // 401: treat as session-expired / not-logged-in
        const isUnauthorized =
          (result as any)._isUnauthorized === true ||
          (result as any)._status === 401 ||
          result.error_code === 'UNAUTHORIZED' ||
          result.mode === 'unauthorized';
        if (isUnauthorized) {
          setCreateError('Phiên đăng nhập đã hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại.');
          // Clear stale token and redirect to contracts list (login guard handles the rest)
          localStorage.removeItem(TOKEN_KEY);
          onNavigate('contracts.list');
          return;
        }
        // Build detailed error message
        let errorMsg = result.message || 'Tạo hợp đồng thất bại.';
        if (result.contract_no) {
          errorMsg = `${errorMsg} (${result.contract_no})`;
        }
        if (result.suggested_next) {
          errorMsg = `${errorMsg} Gợi ý: ${result.suggested_next}`;
        }
        setCreateError(errorMsg);
      } else {
        // Show success state first
        setCreateResult(result);
        setSubmitAttempted(false);

        // Surface DOCX failure explicitly so user knows what happened
        if (result.docx_export_skipped || !result.docx_path) {
          const reason = result.docx_skip_reason || 'Không rõ lý do (response không trả docx_path).';
          setCreateError(`Hợp đồng đã tạo nhưng chưa xuất được Word: ${reason}`);
        }

        // Compute safe download filename (prefer backend suggestion).
        // NEVER falls back to the raw full contract_no (which would include
        // region/field codes). Accept BOTH "/" and "-" separators, since
        // legacy rows may store contract_no as "9999-2026-HĐQTGAN-PN-PR".
        const computeDownloadFilename = (): string => {
          if (result.docx_filename) {
            return String(result.docx_filename);
          }
          const rawNo = String(result.contract_no || `contract_${result.contract_id}`);
          let shortNo = "";
          if (rawNo.includes("/")) {
            shortNo = rawNo.split("/")[0].trim();
          } else if (rawNo.includes("-")) {
            // Prefer the first purely-numeric dash segment.
            const segs = rawNo.split("-").map((s) => s.trim());
            const firstNumeric = segs.find((s) => /^\d+$/.test(s));
            shortNo = firstNumeric || segs[0] || "";
          } else {
            shortNo = rawNo;
          }
          const cleaned = (shortNo || `contract_${result.contract_id}`).replace(/[/\\]/g, "-");
          return `${cleaned}.docx`;
        };

        // Manual download — ALWAYS uses GET /download-docx (regenerates from DB saved totals).
        // We do NOT call POST /download-generated-docx in create flow anymore — that endpoint
        // is for fetching an exact previously-rendered file. With simplified totals flow,
        // regenerating from DB saved totals is the stable source.
        const performDownload = async (): Promise<boolean> => {
          if (!result.contract_id) return false;
          try {
            const { blob, filename: serverFilename } = await downloadDocxFile(
              token,
              result.contract_id,
              draft.contractTemplateCode
            );
            // Prefer Content-Disposition filename (server-truth) over create-response field.
            const finalFilename = serverFilename || result.docx_filename || computeDownloadFilename();
            triggerFileDownload(blob, finalFilename);
            setDocxDownloadSuccess(true);
            setDocxDownloadError(null);
            console.info('[create-contract] download success', { contractId: result.contract_id, filename: finalFilename });
            return true;
          } catch (downloadError: any) {
            const msg = downloadError?.message || 'unknown';
            console.error('[create-contract] download failed', downloadError);
            setDocxDownloadSuccess(false);
            setDocxDownloadError(msg);
            setCreateError(`Đã tạo hợp đồng nhưng tải file Word thất bại: ${msg}`);
            return false;
          }
        };

        // Auto download once after create — uses GET /download-docx (works whether or not backend
        // attached docx_path). With simplified totals flow, regenerate from DB is the
        // stable source.
        if (result.contract_id) {
          performDownload();
        }
      }
    } catch (error: any) {
      console.error('[create-contract] threw', error);
      setCreateError(String(error?.message || 'Tạo hợp đồng thất bại.'));
    } finally {
      setIsCreateLoading(false);
    }
  };

  // Manual download — triggered by user clicking the "Tải file Word" fallback button.
  // Always uses GET /download-docx (regenerate from DB saved totals).
  const handleManualDownload = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !createResult?.contract_id) {
      setCreateError('Không có thông tin hợp đồng để tải file.');
      return;
    }

    setDocxDownloadError(null);

    try {
      const { blob, filename: serverFilename } = await downloadDocxFile(
        token,
        createResult.contract_id,
        draft.contractTemplateCode
      );
      const finalFilename = serverFilename
        || createResult.docx_filename
        || `${(createResult.contract_no || `contract_${createResult.contract_id}`)
          .replace(/\//g, '-').replace(/\\/g, '-')}.docx`;
      triggerFileDownload(blob, finalFilename);
      setDocxDownloadSuccess(true);
      console.info('[create-contract] manual download success', {
        contractId: createResult.contract_id,
        filename: finalFilename,
      });
    } catch (downloadError: any) {
      const msg = downloadError?.message || 'unknown';
      console.error('[create-contract] manual download failed', downloadError);
      setDocxDownloadError(msg);
      setCreateError(`Tải file Word thất bại: ${msg}`);
    }
  };

  // =========================================================================
  // LOCAL ACTIONS
  // =========================================================================

  const handleSaveDraft = () => {
    setIsDirty(false);
    setSubmitAttempted(false);
  };

  const handleCancel = () => {
    if (isDirty) {
      if (
        confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn hủy và quay lại?')
      ) {
        onNavigate('contracts.list');
      }
    } else {
      onNavigate('contracts.list');
    }
  };

  // =========================================================================
  // KARAOKE PREVIEW — debounced backend dry-run snapshot
  // =========================================================================
  // The UI never recomputes money. It sends the current karaoke inputs to
  // the backend with a 450ms debounce and renders the rows the backend
  // returns. Backend errors and missing inputs are surfaced as separate
  // UI states (empty / pending / error) — they never crash the page.
  useEffect(() => {
    const isKaraoke = isKaraokeDomain;
    if (!isKaraoke) {
      setKaraokePreviewRows(null);
      setKaraokePreviewError(null);
      setKaraokePreviewPending(false);
      return;
    }

    const totalRooms = Number(draft.karaoke?.totalRooms ?? 0);
    const totalBoxes = Number(draft.karaoke?.totalBoxes ?? 0);
    const baseSalary = Number(draft.areaBased?.baseSalary ?? 0);
    const vatPct = Number(draft.areaBased?.vatRate ?? 0);
    // ty_le_thu (collection rate) drives amount_before_gtgt in the backend.
    // Default to 100 (= full collection) when user leaves the field blank;
    // 0 would zero out the entire pipeline.
    const tyLeThu = Number(draft.karaoke?.annualSupportPercent ?? 100);
    const months = Number(draft.karaoke?.durationMonths ?? draft.contract?.durationMonths ?? 12);
    const areaGroup = mapDraftAreaGroupToSnapshot(draft.karaoke.areaGroup as string);

    if ((totalRooms + totalBoxes) <= 0 || baseSalary <= 0) {
      setKaraokePreviewRows(null);
      setKaraokePreviewError(null);
      setKaraokePreviewPending(false);
      return;
    }

    if (karaokePreviewTimer.current != null) {
      window.clearTimeout(karaokePreviewTimer.current);
    }
    setKaraokePreviewPending(true);
    const seq = ++karaokePreviewSeq.current;
    karaokePreviewTimer.current = window.setTimeout(async () => {
      try {
        const token = (() => {
          try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
        })();
        const resp = await fetch('/api/background/karaoke/calculate-dry-run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            karaoke_type: areaGroup === 'BOX' ? 'BOX' : 'PHONG',
            area_group: areaGroup,
            tong_so_phong: totalRooms,
            tong_so_box: totalBoxes,
            muc_luong_co_so: baseSalary,
            ty_le_ho_tro: tyLeThu,
            ty_le_ho_tro_bac_1: 0,
            ty_le_ho_tro_bac_2: 0,
            ty_le_ho_tro_bac_3: 0,
            gtgt_percent: vatPct,
            start_date: draft.contract?.startDate || null,
            end_date: draft.contract?.endDate || null,
            room_sections: Array.isArray(draft.areaBased?.musicUsageAreas)
              ? draft.areaBased.musicUsageAreas
              : [],
            pricing_render_mode: 'table',
          }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (seq !== karaokePreviewSeq.current) return; // stale
        const calc = data?.calculation;
        const tiers = Array.isArray(calc?.tiers) ? calc.tiers : [];
        const rows: KaraokeBackendRow[] = tiers
          .filter((t: any) => Number(t?.rooms) > 0 && Number(t?.amount) > 0)
          .map((t: any) => ({
            label: String(t?.name ?? ''),
            rooms: Number(t?.rooms ?? 0),
            coef: Number(t?.coefficient ?? 0),
            amount: Number(t?.amount ?? 0),
          }));
        // Stash the totals so the table can show "Cộng / Thuế GTGT / Tổng thanh toán"
        // — read straight from the backend snapshot, no UI recompute.
        const totals = {
          amountBeforeGtgt: Number(calc?.amount_before_gtgt ?? 0),
          gtgtAmount: Number(calc?.gtgt_amount ?? 0),
          totalAmount: Number(calc?.total_amount ?? 0),
          vatPercent: Number(calc?.gtgt_percent ?? vatPct ?? 0),
          rawSubtotal: Number(calc?.subtotal_before_support ?? 0),
        };
        setKaraokePreviewTotals(totals);
        setKaraokePreviewRows(rows);
        setKaraokePreviewError(null);
        // Sync draft money fields so the DOCX export uses the exact backend
        // snapshot totals. This is a copy, not a recompute — the source of
        // truth stays in the backend response.
        if (totals.amountBeforeGtgt > 0) {
          updateDraft((current) => ({
            ...current,
            areaBased: {
              ...current.areaBased,
              royaltyAmountBeforeVat: totals.amountBeforeGtgt,
              vatAmount: totals.gtgtAmount,
              royaltyAmountAfterVat: totals.totalAmount,
              royaltyAmountInWords:
                current.areaBased.royaltyAmountInWords || '',
            },
            karaoke: {
              ...current.karaoke,
              totalRooms: totalRooms,
            },
          }));
        }
      } catch (err: unknown) {
        if (seq !== karaokePreviewSeq.current) return;
        setKaraokePreviewError(err instanceof Error ? err.message : 'Lỗi dry-run');
        setKaraokePreviewRows(null);
        setKaraokePreviewTotals(null);
      } finally {
        if (seq === karaokePreviewSeq.current) {
          setKaraokePreviewPending(false);
        }
      }
    }, 450);

    return () => {
      if (karaokePreviewTimer.current != null) {
        window.clearTimeout(karaokePreviewTimer.current);
        karaokePreviewTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isKaraokeDomain,
    draft.karaoke?.totalRooms,
    draft.karaoke?.totalBoxes,
    draft.karaoke?.areaGroup,
    draft.areaBased?.baseSalary,
    draft.areaBased?.vatRate,
    draft.karaoke?.annualSupportPercent,
    draft.karaoke?.durationMonths,
    draft.contract?.startDate,
    draft.contract?.endDate,
    draft.areaBased?.musicUsageAreas,
  ]);

  // =========================================================================
  // RENDER
  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <>
    <Page embedded={embedded}>
      {!embedded && (
        <PageHeader
          breadcrumb="/bg/contracts/new"
          title="Tạo hợp đồng mới"
          description="Tạo hợp đồng chính thức trên hệ thống VCPMC."
          actions={<StepIndicator steps={steps} />}
        />
      )}
      {embedded && (
        <div className="vc-workspace-stepbar">
          <StepIndicator steps={steps} />
        </div>
      )}

      {/* Template Search Section (Phase TEMPLATE-CREATE-01) */}
      <ContractTemplateSearch
        selectedTemplateId={selectedTemplateId}
        selectedTemplateNo={selectedTemplateNo}
        selectedTemplateName={selectedTemplateName}
        formEditedAfterPrefill={formEditedAfterPrefill}
        onTemplateSelected={handleTemplateSelected}
        onTemplateCleared={handleTemplateCleared}
        onPrefillData={handlePrefillData}
      />

      {/* Workflow navigation: chips on mobile/tablet, rail on desktop */}
      <div className="lg:hidden">
        <SectionNavChips items={navItems} activeId={activeSectionId} onItemClick={scrollToSection} />
      </div>

      <div className="flex gap-6 items-start">
        <SectionNavRail items={navItems} activeId={activeSectionId} onItemClick={scrollToSection} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 flex-1 min-w-0">
        <div className="min-w-0 space-y-6">
          {/* =================================================================== */}
          {/* SECTION 1: THÔNG TIN CHUNG */}
          {/* Shared across all Background domains */}
          {/* =================================================================== */}
          <FormSection
            id="sec-id"
            title="1. Định danh hợp đồng & Lĩnh vực"
            description="Số thứ tự HĐ, năm, mã định danh và lĩnh vực kinh doanh Background"
          >
            <div className="space-y-4">
              {/* Row 1: Lĩnh vực */}
              <FieldGrid>
                <Select
                  label="Lĩnh vực *"
                  value={draft.domain.domainCode}
                  onChange={(value) => updateDomain(value as BackgroundDomainCode)}
                  options={CREATE_CONTRACT_BACKGROUND_DOMAIN_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
              </FieldGrid>
              {/* Domain description */}
              <div className="mt-0.5 px-3 py-2 rounded-xl bg-amber-50 ring-1 ring-amber-200/60 border border-amber-100">
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="font-semibold">
                    {draft.domain.domainDisplayName}
                  </span>
                  {draft.domain.domainGroup === 'background' && (
                    <span className="text-amber-500/70">· Background</span>
                  )}
                </p>
              </div>

              {/* Row 2: Số thứ tự HĐ | Ngày lập | Năm */}
              <div id="field-contract" className="mt-3">
                <FieldGrid cols={3}>
                <Input
                  label="Số thứ tự HĐ"
                  value={draft.common.contractNumber}
                  onChange={(e) =>
                    updateDraft((current) => ({
                      ...current,
                      common: {
                        ...current.common,
                        contractNumber: e.target.value,
                      },
                    }))
                  }
                  onBlur={() => {
                    if (draft.common.contractNumber.trim() && contractNoPreview) {
                      checkAvailability();
                    }
                  }}
                  required
                  error={fieldErrors['common.contractNumber']}
                  hint="Nhập số thứ tự, ví dụ 1234. Hệ thống tự ghép thành mã HĐ hoàn chỉnh."
                />
                <Input
                  label="Ngày lập"
                  type="date"
                  value={draft.common.signedDate}
                  onChange={(e) =>
                    updateDraft((current) => ({
                      ...current,
                      common: { ...current.common, signedDate: e.target.value },
                    }))
                  }
                  required
                  error={fieldErrors['common.signedDate']}
                />
                <div>
                  <Select
                    label="Năm"
                    value={draft.common.contractYear}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        common: { ...current.common, contractYear: value },
                      }))
                    }
                    options={CONTRACT_YEAR_OPTIONS}
                  />
                  {fieldErrors['common.contractYear'] && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors['common.contractYear']}</p>
                  )}
                </div>
              </FieldGrid>
              </div>{/* end #field-contract */}

              {/* Row 3: Mã vùng | Khu vực | Mã quyền */}
              <FieldGrid cols={3}>
                <Select
                  label="Mã vùng"
                  value={draft.common.regionCode}
                  onChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      common: { ...current.common, regionCode: value },
                    }))
                  }
                  options={CREATE_CONTRACT_REGION_OPTIONS}
                />
                <Select
                  label="Khu vực"
                  value={draft.common.areaCode}
                  onChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      common: { ...current.common, areaCode: value },
                    }))
                  }
                  options={CREATE_CONTRACT_AREA_OPTIONS}
                />
                <Select
                  label="Mã quyền"
                  value={draft.common.fieldCode}
                  onChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      common: { ...current.common, fieldCode: value },
                    }))
                  }
                  options={[
                    { value: 'PR', label: 'PR (Quyền biểu diễn)' },
                    { value: 'MR', label: 'MR (Quyền cơ khí)' },
                  ]}
                />
              </FieldGrid>

              {/* Mã hợp đồng dự kiến banner */}
              <ContractNumberPreview contractNo={contractNoPreview} />
              {/* Availability check */}
              <div className="mt-1">
                <button
                  type="button"
                  onClick={checkAvailability}
                  disabled={isCheckingAvailability || !contractNoPreview}
                  className="text-xs px-3 py-1.5 bg-lime-50 text-lime-700 rounded-md hover:bg-lime-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCheckingAvailability ? 'Đang kiểm tra...' : 'Kiểm tra số hợp đồng'}
                </button>
                {availabilityCheck && (
                  <div className={`mt-2 px-3 py-2 rounded-md text-xs ${
                    availabilityCheck.available
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {availabilityCheck.available ? (
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs">✓</span>
                        <span>{availabilityCheck.message}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs">!</span>
                          <span className="font-semibold">{availabilityCheck.message}</span>
                        </div>
                        <p className="ml-6 font-mono">{availabilityCheck.contract_no}</p>
                        {availabilityCheck.suggested_next && (
                          <div className="ml-6 mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                const parts = availabilityCheck.suggested_next?.split('/');
                                if (parts && parts.length >= 1) {
                                  updateDraft((current) => ({
                                    ...current,
                                    common: {
                                      ...current.common,
                                      contractNumber: parts[0],
                                    },
                                  }));
                                  setAvailabilityCheck(null);
                                }
                              }}
                              className="text-lime-600 hover:text-lime-800 underline"
                            >
                              Dùng số gợi ý: {availabilityCheck.suggested_next}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </FormSection>

          <FormSection
            id="sec-partner"
            title="2. Đối tác & Địa chỉ"
            description="Pháp nhân, người đại diện và địa chỉ pháp lý / sử dụng âm nhạc"
          >
            <div className="space-y-6">
              <div>
                <div className="space-y-4">
                  <div id="field-customer">
                    <FieldGrid>
                    <Input
                      label="Tên đơn vị"
                      value={draft.customer.legalName}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          customer: { ...current.customer, legalName: e.target.value },
                        }))
                      }
                      required
                      error={fieldErrors['customer.legalName']}
                    />
                    <Input
                      label="Tên bảng hiệu"
                      value={draft.customer.brandName}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          customer: { ...current.customer, brandName: e.target.value },
                        }))
                      }
                      required
                      error={fieldErrors['customer.brandName']}
                    />
                  </FieldGrid>
                  </div>{/* end #field-customer */}

                  <FieldGrid>
                    <Input
                      label="Người đại diện"
                      value={draft.customer.representativeName}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          customer: {
                            ...current.customer,
                            representativeName: e.target.value,
                          },
                        }))
                      }
                    />
                    <Input
                      label="Chức vụ"
                      value={draft.customer.representativeTitle}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          customer: {
                            ...current.customer,
                            representativeTitle: e.target.value,
                          },
                        }))
                      }
                    />
                  </FieldGrid>
                  <FieldGrid>
                    <Input
                      label="Mã số thuế"
                      value={draft.customer.taxCode}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          customer: { ...current.customer, taxCode: e.target.value },
                        }))
                      }
                    />
                    <Input
                      label="Số CCCD"
                      value={draft.customer.cccd}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          customer: { ...current.customer, cccd: e.target.value },
                        }))
                      }
                    />
                  </FieldGrid>
                  <FieldGrid>
                    <Input
                      label="Điện thoại"
                      type="tel"
                      value={draft.customer.phone}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          customer: { ...current.customer, phone: e.target.value },
                        }))
                      }
                    />
                    <Input
                      label="Email"
                      type="email"
                      value={draft.customer.email}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          customer: { ...current.customer, email: e.target.value },
                        }))
                      }
                    />
                  </FieldGrid>

                  {/* A. Địa chỉ pháp lý / trụ sở */}
                  <div className="border border-dashed border-zinc-300 rounded-lg p-4 bg-zinc-50">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                        A. Địa chỉ pháp lý / trụ sở
                      </span>
                    </div>
                    <div className="space-y-3">
                      <Input
                        label="Số nhà, tên đường, khu phố/thôn..."
                        placeholder="VD: 123 Nguyễn Huệ, Khu phố 3"
                        value={draft.customer.legalAddressLine}
                        onChange={(e) =>
                          updateDraft((current) => {
                            const newLine = e.target.value;
                            const newFull = buildFullAddress(
                              newLine,
                              current.customer.legalWard,
                              current.customer.legalProvince
                            );
                            return {
                              ...current,
                              customer: {
                                ...current.customer,
                                legalAddressLine: newLine,
                                legalFullAddress: newFull,
                                legalAddress: newFull,
                              },
                              location: current.location.usageSameAsLegal
                                ? {
                                    ...current.location,
                                    usageAddressLine: newLine,
                                    usageFullAddress: newFull,
                                    usageAddress: newFull,
                                  }
                                : current.location,
                            };
                          })
                        }
                      />
                      <FieldGrid cols={2}>
                        <Input
                          label="Phường/Xã sau sáp nhập"
                          placeholder="VD: Phường Bến Nghé"
                          value={draft.customer.legalWard}
                          onChange={(e) =>
                            updateDraft((current) => {
                              const newWard = e.target.value;
                              const newFull = buildFullAddress(
                                current.customer.legalAddressLine,
                                newWard,
                                current.customer.legalProvince
                              );
                              return {
                                ...current,
                                customer: {
                                  ...current.customer,
                                  legalWard: newWard,
                                  legalFullAddress: newFull,
                                  legalAddress: newFull,
                                },
                                location: current.location.usageSameAsLegal
                                  ? {
                                      ...current.location,
                                      usageWard: newWard,
                                      usageFullAddress: newFull,
                                      usageAddress: newFull,
                                    }
                                  : current.location,
                              };
                            })
                          }
                        />
                        <Input
                          label="Tỉnh/Thành phố"
                          placeholder="VD: TP. Hồ Chí Minh"
                          value={draft.customer.legalProvince}
                          onChange={(e) =>
                            updateDraft((current) => {
                              const newProvince = e.target.value;
                              const newFull = buildFullAddress(
                                current.customer.legalAddressLine,
                                current.customer.legalWard,
                                newProvince
                              );
                              return {
                                ...current,
                                customer: {
                                  ...current.customer,
                                  legalProvince: newProvince,
                                  legalFullAddress: newFull,
                                  legalAddress: newFull,
                                },
                                location: current.location.usageSameAsLegal
                                  ? {
                                      ...current.location,
                                      usageProvince: newProvince,
                                      usageFullAddress: newFull,
                                      usageAddress: newFull,
                                    }
                                  : current.location,
                              };
                            })
                          }
                        />
                      </FieldGrid>
                      <Input
                        label="Địa chỉ đầy đủ"
                        placeholder="Auto-built: [Số nhà/đường], [Phường/Xã], [Tỉnh/Thành phố]"
                        value={draft.customer.legalFullAddress}
                        onChange={(e) =>
                          updateDraft((current) => ({
                            ...current,
                            customer: {
                              ...current.customer,
                              legalFullAddress: e.target.value,
                              legalAddress: e.target.value,
                            },
                          }))
                        }
                        readOnly
                        className="bg-zinc-50 text-zinc-600 cursor-default font-medium text-zinc-800"
                        hint="Tự động ghép từ các trường địa chỉ bên trên."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* B. Địa điểm sử dụng âm nhạc */}
              <div id="field-location">
                <div className="flex items-center gap-3 mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                    B. Địa chỉ sử dụng âm nhạc
                  </h4>
                  <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={draft.location.usageSameAsLegal}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked) {
                          updateDraft((current) => ({
                            ...current,
                            location: syncUsageFromLegal(current.customer, current.location),
                          }));
                        } else {
                          updateDraft((current) => ({
                            ...current,
                            location: {
                              ...current.location,
                              usageSameAsLegal: false,
                            },
                          }));
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-zinc-400"
                    />
                    <span className="font-medium text-lime-700">
                      Giống địa chỉ pháp lý
                    </span>
                  </label>
                </div>

                <div className={`space-y-3 ${draft.location.usageSameAsLegal ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                  <Input
                    label="Số nhà, tên đường, khu phố/thôn..."
                    placeholder="VD: 456 Lê Lợi, Khu phố 5"
                    value={draft.location.usageAddressLine}
                    onChange={(e) =>
                      updateDraft((current) => {
                        const newLine = e.target.value;
                        const newFull = buildFullAddress(
                          newLine,
                          current.location.usageWard,
                          current.location.usageProvince
                        );
                        return {
                          ...current,
                          location: {
                            ...current.location,
                            usageAddressLine: newLine,
                            usageFullAddress: newFull,
                            usageAddress: newFull,
                          },
                        };
                      })
                    }
                  />
                  <FieldGrid cols={2}>
                    <Input
                      label="Phường/Xã sau sáp nhập"
                      placeholder="VD: Phường Bến Nghé"
                      value={draft.location.usageWard}
                      onChange={(e) =>
                        updateDraft((current) => {
                          const newWard = e.target.value;
                          const newFull = buildFullAddress(
                            current.location.usageAddressLine,
                            newWard,
                            current.location.usageProvince
                          );
                          return {
                            ...current,
                            location: {
                              ...current.location,
                              usageWard: newWard,
                              usageFullAddress: newFull,
                              usageAddress: newFull,
                            },
                          };
                        })
                      }
                    />
                    <Input
                      label="Tỉnh/Thành phố"
                      placeholder="VD: TP. Hồ Chí Minh"
                      value={draft.location.usageProvince}
                      onChange={(e) =>
                        updateDraft((current) => {
                          const newProvince = e.target.value;
                          const newFull = buildFullAddress(
                            current.location.usageAddressLine,
                            current.location.usageWard,
                            newProvince
                          );
                          return {
                            ...current,
                            location: {
                              ...current.location,
                              usageProvince: newProvince,
                              usageFullAddress: newFull,
                              usageAddress: newFull,
                            },
                          };
                        })
                      }
                    />
                  </FieldGrid>
                  <Input
                    label="Địa chỉ đầy đủ"
                    placeholder="Auto-built: [Số nhà/đường], [Phường/Xã], [Tỉnh/Thành phố]"
                    value={draft.location.usageFullAddress}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        location: {
                          ...current.location,
                          usageFullAddress: e.target.value,
                          usageAddress: e.target.value,
                        },
                      }))
                    }
                    readOnly
                    className="bg-zinc-50 text-zinc-600 cursor-default font-medium text-zinc-800"
                    hint="Tự động ghép từ các trường địa chỉ bên trên."
                  />
                </div>
              </div>
              </div>{/* end #field-location */}
            </FormSection>

          <FormSection
            id="sec-term"
            title="3. Thời hạn & người thực hiện"
            description="Hiệu lực hợp đồng và người chịu trách nhiệm"
          >
            {(() => {
              return null;
            })()}
            <div className="space-y-6">
              <div id="field-term">
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500 mb-3">
                  Thời hạn hợp đồng
                </h4>
                <div className="space-y-4">
                  <FieldGrid cols={2}>
                    <Input
                      label="Ngày bắt đầu"
                      type="date"
                      value={draft.term.effectiveFrom}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          term: { ...current.term, effectiveFrom: e.target.value },
                        }))
                      }
                      required
                      error={fieldErrors['term.effectiveFrom']}
                    />
                    <Input
                      label="Ngày kết thúc"
                      type="date"
                      value={draft.term.effectiveTo}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          term: { ...current.term, effectiveTo: e.target.value },
                        }))
                      }
                      required
                      error={fieldErrors['term.effectiveTo']}
                    />
                  </FieldGrid>
                  <Select
                    label="Loại hợp đồng"
                    value={draft.domain.renewalStatus}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        domain: {
                          ...current.domain,
                          renewalStatus: value as CreateContractRenewalStatus,
                          // Reset reference contract when switching away from tái ký
                          ...(value !== 'PENDING_RENEWAL'
                            ? { referenceContractId: null, referenceContractNo: '' }
                            : {}),
                        },
                      }))
                    }
                    options={CREATE_CONTRACT_RENEWAL_OPTIONS}
                  />

                  {/* Tái ký: reference contract search */}
                  {draft.domain.renewalStatus === 'PENDING_RENEWAL' && (
                    <div className="mt-3 p-3 border border-lime-200 bg-lime-50 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-lime-700">
                        <span>Hợp đồng gốc tham chiếu</span>
                      </div>
                      <Input
                        label="Tìm hợp đồng gốc"
                        placeholder="Nhập số HĐ hoặc tên đơn vị..."
                        value={draft.domain.referenceContractNo || ''}
                        onChange={(e) =>
                          updateDraft((current) => ({
                            ...current,
                            domain: {
                              ...current.domain,
                              referenceContractNo: e.target.value,
                            },
                          }))
                        }
                      />
                      {draft.domain.referenceContractId && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-lime-100 border border-lime-300 rounded text-xs text-lime-800 font-medium">
                          <span>Đã chọn HĐ gốc: </span>
                          <span className="font-semibold">{draft.domain.referenceContractNo}</span>
                        </div>
                      )}
                      <p className="text-xs text-lime-600">
                        Dùng để prefill thông tin. Không cập nhật hợp đồng cũ.
                      </p>
                    </div>
                  )}

                  {/* Hợp đồng khung: info note */}
                  {draft.domain.renewalStatus === 'FRAME_CONTRACT' && (
                    <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                      Áp dụng cho nhiều khu vực / nhiều phụ lục. Thời hạn linh hoạt hơn.
                    </div>
                  )}
                </div>
              </div>{/* end #field-term */}

              {/* Người thực hiện */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500 mb-3">
                  Người thực hiện
                </h4>
                {employeesLoading ? (
                  <div className="h-10 bg-zinc-100 rounded-lg animate-pulse" />
                ) : employees.length > 0 ? (
                  <Select
                    label="Người thực hiện"
                    value={draft.assignee.email}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        assignee: {
                          email: value,
                        },
                      }))
                    }
                    options={employees.map((e) => ({
                      value: e.email || e.id,
                      label: e.email || e.id,
                    }))}
                  />
                ) : (
                  <Select
                    label="Người thực hiện"
                    value={draft.assignee.email}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        assignee: {
                          email: value,
                        },
                      }))
                    }
                    options={[
                      { value: currentUser?.email || '', label: currentUser?.email || '' },
                    ]}
                  />
                )}
              </div>
            </div>
          </FormSection>

          {/* =================================================================== */}
          {/* SECTION 2B: MẪU XUẤT HỢP ĐỒNG */}
          {/* Phase BACKGROUND-TEMPLATE-REFACTOR: Template selection */}
          {/* =================================================================== */}
          <FormSection
            id="sec-template"
            title="4. Mẫu xuất hợp đồng"
            description="Chọn mẫu Word để xuất hợp đồng"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Mẫu 1 */}
              <button
                type="button"
                onClick={() => updateDraft((current) => ({
                  ...current,
                  contractTemplateCode: 'TEMPLATE_1',
                }))}
                className={`
                  relative p-4 rounded-xl border-2 text-left transition-all
                  ${draft.contractTemplateCode === 'TEMPLATE_1'
                    ? 'border-amber-700 bg-amber-50 shadow-sm'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`
                    flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${draft.contractTemplateCode === 'TEMPLATE_1'
                      ? 'border-amber-700 bg-amber-700'
                      : 'border-zinc-300'
                    }
                  `}>
                    {draft.contractTemplateCode === 'TEMPLATE_1' && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold ${
                      draft.contractTemplateCode === 'TEMPLATE_1'
                        ? 'text-amber-950'
                        : 'text-zinc-900'
                    }`}>
                      Mẫu 1
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      draft.contractTemplateCode === 'TEMPLATE_1'
                        ? 'text-amber-800'
                        : 'text-zinc-500'
                    }`}>
                      export_template_contract_1.docx
                    </p>
                  </div>
                </div>
                {draft.contractTemplateCode === 'TEMPLATE_1' && (
                  <div className="absolute top-2 right-2">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-700 text-white">
                      Đang chọn
                    </span>
                  </div>
                )}
              </button>

              {/* Mẫu 2 */}
              <button
                type="button"
                onClick={() => updateDraft((current) => ({
                  ...current,
                  contractTemplateCode: 'TEMPLATE_2',
                }))}
                className={`
                  relative p-4 rounded-xl border-2 text-left transition-all
                  ${draft.contractTemplateCode === 'TEMPLATE_2'
                    ? 'border-amber-700 bg-amber-50 shadow-sm'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`
                    flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${draft.contractTemplateCode === 'TEMPLATE_2'
                      ? 'border-amber-700 bg-amber-700'
                      : 'border-zinc-300'
                    }
                  `}>
                    {draft.contractTemplateCode === 'TEMPLATE_2' && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold ${
                      draft.contractTemplateCode === 'TEMPLATE_2'
                        ? 'text-amber-950'
                        : 'text-zinc-900'
                    }`}>
                      Mẫu 2
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      draft.contractTemplateCode === 'TEMPLATE_2'
                        ? 'text-amber-800'
                        : 'text-zinc-500'
                    }`}>
                      export_template_contract_2.docx
                    </p>
                  </div>
                </div>
                {draft.contractTemplateCode === 'TEMPLATE_2' && (
                  <div className="absolute top-2 right-2">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-700 text-white">
                      Đang chọn
                    </span>
                  </div>
                )}
              </button>
            </div>

            {/* Helper text */}
            <p className="mt-2 text-xs text-zinc-500">
              Cả hai mẫu đều có cùng placeholder và nội dung. Khác nhau về bố cục/format.
            </p>
          </FormSection>

          {/* =================================================================== */}
          {/* SECTION 6: KHU VỰC KINH DOANH */}
          {/* Domain-specific fields */}
          {/* =================================================================== */}

          <FormSection
            id="sec-usage"
            title="5. Khu vực kinh doanh & Tiền bản quyền"
            description="Thông tin tùy theo lĩnh vực đã chọn"
          >
            {isKaraokeDomain ? (
              // Karaoke domain - MusicUsageAreaSection + SimpleRoyaltyInput
              <div className="space-y-6">
                {/* Music usage areas table */}
                <MusicUsageAreaSection
                  value={draft.areaBased.musicUsageAreas}
                  onChange={(areas) =>
                    updateDraft((current) => ({
                      ...current,
                      areaBased: {
                        ...current.areaBased,
                        musicUsageAreas: areas,
                      },
                    }))
                  }
                  scaleLabel="Số phòng / số chỗ"
                />

                {/* Simplified royalty input */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                      Tiền bản quyền
                    </h4>
                    <button
                      type="button"
                      ref={pricingButtonRef}
                      onClick={() => {
                        setPricingWorkspaceOpen((v) => !v);
                        if (!pricingWorkspaceOpen) {
                          setTimeout(() => pricingButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] font-semibold text-white transition-colors"
                      style={{ background: pricingWorkspaceOpen ? '#0A4C66' : '#4A7202' }}
                      onMouseEnter={(e) => { if (!pricingWorkspaceOpen) e.currentTarget.style.background = '#0A4C66'; }}
                      onMouseLeave={(e) => { if (!pricingWorkspaceOpen) e.currentTarget.style.background = '#4A7202'; }}
                    >
                      <CalculatorIcon className="h-3.5 w-3.5" />
                      {pricingWorkspaceOpen ? 'Ẩn bảng tính tiền' : 'Tính tiền bản quyền'}
                    </button>
                  </div>

                  {/* Inline pricing workspace — expands/collapses below */}
                  {pricingWorkspaceOpen && (
                    <div className="mb-4 rounded-[12px] overflow-hidden" style={{ border: '1px solid #E7EDE1', background: '#F6FAF1' }}>
                      <KaraokePricingWorkspace
                        context={{
                          totalRooms: draft.karaoke.totalRooms || 0,
                          areaGroup: mapDraftAreaGroupToSnapshot(draft.karaoke.areaGroup as string),
                          months: 12,
                          vatRate: (draft.areaBased.vatRate || 8) / 100,
                          customerName: draft.customer.legalName || undefined,
                          signboard: draft.customer.brandName || undefined,
                        }}
                        onConfirmAmounts={(snap) => {
                          // Simplified flow: sync 3 money totals + total rooms
                          // entered by the user in the calculator to the draft.
                          updateDraft((current) => ({
                            ...current,
                            karaoke: {
                              ...current.karaoke,
                              // Snapshot.rows sum quantity for total room count
                              // (matches what user typed as "Tổng số phòng" in the calculator).
                              totalRooms: (snap.rows && snap.rows.length > 0)
                                ? snap.rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
                                : current.karaoke.totalRooms,
                            },
                            areaBased: {
                              ...current.areaBased,
                              royaltyAmountBeforeVat: snap.subtotal,
                              vatRate: Math.round(snap.vat_rate * 100),
                              vatAmount: snap.vat_amount,
                              royaltyAmountAfterVat: snap.total,
                              royaltyAmountInWords: snap.amount_in_words || current.areaBased.royaltyAmountInWords || '',
                            },
                          }));
                        }}
                        onOpenQuote={() => {
                          /* Inline preview now handled inside the workspace
                           * itself (KaraokePricingWorkspace renders its own
                           * panel under the "Xem bảng tính" button). We no
                           * longer open the global modal from here, to keep
                           * the preview near the user's attention area and
                           * avoid jumping to the top of the page. */
                        }}
                      />
                    </div>
                  )}

                  {/* Contract-layout preview — rows come from the backend
                      calculation (dry-run), identical row model as DOCX. */}
                  {karaokePreviewTable && (
                    <div
                      className="mb-4 rounded-[12px] overflow-hidden"
                      style={{ border: '1px solid #E7EDE1', background: '#FFFFFF' }}
                    >
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                        style={{ background: '#F4F1EA', borderBottom: '1px solid #E7EDE1' }}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4A7202]">
                          Bảng tính tiền bản quyền (theo bố cục hợp đồng)
                        </p>
                        <span className="text-[11px] text-zinc-500">
                          Số liệu lấy từ kết quả tính của hệ thống
                        </span>
                      </div>
                      <div className="overflow-x-auto p-3">
                        <div className="min-w-[560px]">
                          <WordLikeRoyaltyTable data={karaokePreviewTable} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SimpleRoyaltyInput: manual amount entry for all karaoke contracts */}
                  <SimpleRoyaltyInput
                    initialData={{
                      royaltyAmountBeforeVat: draft.areaBased.royaltyAmountBeforeVat || 0,
                      vatRate: draft.areaBased.vatRate || 8,
                      vatAmount: draft.areaBased.vatAmount || 0,
                      totalAmountAfterVat: draft.areaBased.royaltyAmountAfterVat || 0,
                      amountInWords: draft.areaBased.royaltyAmountInWords || '',
                    }}
                    onChange={(data) => {
                      updateDraft((current) => ({
                        ...current,
                        areaBased: {
                          ...current.areaBased,
                          royaltyAmountBeforeVat: data.royaltyAmountBeforeVat,
                          vatRate: data.vatRate,
                          vatAmount: data.vatAmount,
                          royaltyAmountAfterVat: data.totalAmountAfterVat,
                          royaltyAmountInWords: data.amountInWords,
                        },
                      }));
                    }}
                  />

                  {/* Karaoke preview table — backend dry-run snapshot, no UI recompute */}
                  <div className="mt-4">
                    {karaokePreviewError && (
                      <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
                        Không tải được bảng preview karaoke: {karaokePreviewError}
                      </div>
                    )}
                    {!karaokePreviewError && karaokePreviewPending && (
                      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600">
                        Đang tính bảng karaoke…
                      </div>
                    )}
                    {!karaokePreviewError && !karaokePreviewPending && karaokePreviewRows && (
                      <KaraokePreviewTable
                        rows={karaokePreviewRows}
                        totals={karaokePreviewTotals}
                        baseSalary={draft.areaBased.baseSalary}
                        totalRooms={draft.karaoke.totalRooms}
                      />
                    )}
                    {!karaokePreviewError && !karaokePreviewPending && !karaokePreviewRows && (
                      <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-500">
                        Nhập số phòng / MLCS để xem bảng tính karaoke.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : isAreaBasedDomainFlag ? (
              // Area-based domain (non-Karaoke) — MusicUsageAreaSection + SimpleRoyaltyInput
              // TODO: FabPricingWorkspace requires explicit FAB domain/mode before enabling.
              //       Do not use for all area-based domains — they have different formulas.
              <div className="space-y-6">
                <MusicUsageAreaSection
                  value={draft.areaBased.musicUsageAreas}
                  onChange={(areas) =>
                    updateDraft((current) => ({
                      ...current,
                      areaBased: {
                        ...current.areaBased,
                        musicUsageAreas: areas,
                      },
                    }))
                  }
                  domainCode={draft.domain.domainCode}
                  scaleLabel={isKaraokeDomain ? 'Số phòng / số chỗ' : 'Quy mô, sức chứa'}
                />

                {/* Simplified royalty input */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500 mb-3">
                    Thông tin tiền tham khảo
                  </h4>
                  {isManualFeeDomain && (
                    <div
                      role="note"
                      className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"
                    >
                      <span className="font-semibold">Lĩnh vực này đang dùng nhập tiền thủ công, chưa có công thức tự động.</span>{' '}
                      Hệ thống không tự tính tiền bản quyền cho "{draft.domain.domainDisplayName}". Bạn nhập tiền trước thuế, hệ thống tự cộng Thuế GTGT 8% và tiền sau thuế.
                    </div>
                  )}
                  <SimpleRoyaltyInput
                    initialData={{
                      royaltyAmountBeforeVat: draft.areaBased.royaltyAmountBeforeVat || 0,
                      vatRate: draft.areaBased.vatRate || 8,
                      vatAmount: draft.areaBased.vatAmount || 0,
                      totalAmountAfterVat: draft.areaBased.royaltyAmountAfterVat || 0,
                      amountInWords: draft.areaBased.royaltyAmountInWords || '',
                    }}
                    onChange={(data) => {
                      updateDraft((current) => ({
                        ...current,
                        areaBased: {
                          ...current.areaBased,
                          royaltyAmountBeforeVat: data.royaltyAmountBeforeVat,
                          vatRate: data.vatRate,
                          vatAmount: data.vatAmount,
                          royaltyAmountAfterVat: data.totalAmountAfterVat,
                          royaltyAmountInWords: data.amountInWords,
                        },
                      }));
                    }}
                  />
                </div>
              </div>
            ) : isPlaceholderOnlyDomainFlag ? (
              // Placeholder for domain-specific forms not yet implemented
              <div className="p-4 rounded-lg bg-zinc-100 text-center">
                <p className="text-sm text-zinc-600">
                  {DOMAIN_PLACEHOLDER_ONLY_PLACEHOLDER}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Lĩnh vực "{draft.domain.domainDisplayName}" sẽ có form riêng ở phase sau.
                </p>
              </div>
            ) : (
              // Generic placeholder for other non-implemented domains
              <div className="p-4 rounded-lg bg-zinc-100 text-center">
                <p className="text-sm text-zinc-600">
                  {DOMAIN_NOT_IMPLEMENTED_PLACEHOLDER}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Lĩnh vực "{draft.domain.domainDisplayName}" sẽ có form khu vực/tính phí riêng ở phase sau.
                </p>
              </div>
            )}
          </FormSection>


          {/* =================================================================== */}
          {/* VALIDATION ERRORS */}
          {/* =================================================================== */}
          {submitAttempted && blockingErrors.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <h4 className="text-sm font-semibold text-red-800 mb-2">Tổng hợp lỗi (sửa trực tiếp trên từng trường):</h4>
              <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                {blockingErrors.map((error, i) => (
                  <li key={i}>{error.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* =================================================================== */}
          {/* FOOTER ACTIONS */}
          {/* =================================================================== */}
          <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-zinc-50/95 backdrop-blur-sm border-t border-zinc-200 z-50">
            {/* Create result banner */}
            {(createResult?.ok || createError) && (
              <div
                className={`mb-3 rounded-lg px-3 py-2 text-[12.5px] ${
                  createError
                    ? 'bg-red-50 text-red-800 border border-red-200'
                    : docxDownloadSuccess
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
                role="status"
                aria-live="polite"
              >
                {createError ? (
                  <div className="flex items-start gap-2">
                    <span className="font-semibold shrink-0">Lỗi:</span>
                    <span className="flex-1">{createError}</span>
                  </div>
                ) : createResult?.ok ? (
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="font-semibold shrink-0">
                      {docxDownloadSuccess ? 'Đã tải file Word.' : 'Hợp đồng đã tạo. File Word đã sẵn sàng.'}
                    </span>
                    {createResult.contract_no && (
                      <span className="font-mono text-[11px] opacity-80">
                        {createResult.contract_no}
                      </span>
                    )}
                    {(createResult.docx_path || createResult.docx_filename) && (
                      <button
                        type="button"
                        onClick={handleManualDownload}
                        className="ml-auto px-3 py-1 rounded bg-white border border-emerald-300 text-emerald-800 text-[11.5px] font-semibold hover:bg-emerald-100"
                      >
                        {docxDownloadSuccess ? 'Tải lại file Word' : 'Tải file Word'}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )}
            <div className="flex items-center gap-3">
              {!createdContractId ? (
                <>
                  <Button
                    variant="ghost"
                    leftIcon={<XIcon className="h-4 w-4" />}
                    onClick={handleCancel}
                  >
                    Hủy
                  </Button>
                  <Button variant="ghost" onClick={handleSaveDraft}>
                    Lưu nháp cục bộ
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleCreateContract}
                    disabled={!canCreateContract || isCreateLoading}
                    title="Tạo hợp đồng chính thức"
                  >
                    {isCreateLoading ? 'Đang tạo...' : 'Tạo hợp đồng'}
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-emerald-700 font-semibold">
                    Hợp đồng #{createResult?.contract_id} đã tạo.
                  </span>
                  <div className="flex-1" />
                  <Button variant="secondary" onClick={() => handleManualDownload()} disabled={isCreateLoading || !createResult?.docx_path && !createResult?.docx_filename}>
                    {docxDownloadSuccess ? 'Tải lại file Word' : 'Tải file Word'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SIDEBAR: SUMMARY */}
        {/* =================================================================== */}
        <div className="hidden xl:block">
          <div className="sticky top-16 max-h-[calc(100vh-8rem)] overflow-y-auto space-y-4 pb-4">
            {/* Contract summary */}
            <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">
                Tóm tắt hợp đồng
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Số HĐ</span>
                  <span className="font-mono font-semibold">
                    {contractNoPreview || '(chưa có)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Loại HĐ</span>
                  <span className="font-medium text-lime-700">
                    {draft.domain.renewalStatus === 'NEW' ? 'Ký mới' :
                     draft.domain.renewalStatus === 'PENDING_RENEWAL' ? 'Tái ký' :
                     draft.domain.renewalStatus === 'FRAME_CONTRACT' ? 'Hợp đồng khung' : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Đối tác</span>
                  <span className="truncate max-w-[150px]">
                    {draft.customer.legalName || '(chưa có)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Bảng hiệu</span>
                  <span className="truncate max-w-[150px]">
                    {draft.customer.brandName || '(chưa có)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Lĩnh vực</span>
                  <span>{draft.domain.domainDisplayName || '(chưa chọn)'}</span>
                </div>
                {/* Phase BACKGROUND-TEMPLATE-REFACTOR: Show selected export template */}
                <div className="flex justify-between">
                  <span className="text-zinc-600">Mẫu xuất</span>
                  <span className="font-medium text-amber-800">
                    {draft.contractTemplateCode === 'TEMPLATE_2' ? 'Mẫu 2' : 'Mẫu 1'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Template</span>
                  <span className="font-mono text-zinc-500 text-[10px]">
                    {draft.contractTemplateCode === 'TEMPLATE_2'
                      ? 'export_template_contract_2.docx'
                      : 'export_template_contract_1.docx'}
                  </span>
                </div>
                {/* Nguồn mẫu (Phase TEMPLATE-CREATE-01) */}
                {draft.domain.sourceTemplateContractNo && (
                  <div className="flex justify-between items-center bg-lime-50 px-2 py-1 rounded">
                    <span className="text-lime-600 text-[10px]">Mẫu từ HĐ:</span>
                    <span className="font-mono text-lime-700 text-[10px] font-medium">
                      {draft.domain.sourceTemplateContractNo}
                    </span>
                  </div>
                )}
                {/* Tái ký reference (existing feature) */}
                {draft.domain.referenceContractNo && (
                  <div className="flex justify-between items-center bg-amber-50 px-2 py-1 rounded">
                    <span className="text-amber-600 text-[10px]">Tái ký từ HĐ:</span>
                    <span className="font-mono text-amber-700 text-[10px] font-medium">
                      {draft.domain.referenceContractNo}
                    </span>
                  </div>
                )}
                {isKaraokeDomain && (
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Phòng/Box</span>
                    <span>
                      {draft.karaoke.karaokeType === 'PHONG'
                        ? `${draft.karaoke.totalRooms} phòng`
                        : `${draft.karaoke.totalBoxes} box`}
                    </span>
                  </div>
                )}
                {(draft.areaBased.musicUsageAreas?.length ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Khu vực sử dụng</span>
                    <span>{draft.areaBased.musicUsageAreas.length} khu vực</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-600">Thời hạn</span>
                  <span>
                    {draft.term.effectiveFrom
                      ? `${draft.term.effectiveFrom} → ${draft.term.effectiveTo}`
                      : '(chưa có)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Phụ trách</span>
                  <span className="truncate max-w-[150px]">
                    {draft.assignee?.name || '(chưa có)'}
                  </span>
                </div>
                {(draft.areaBased.royaltyAmountBeforeVat ?? 0) > 0 && (
                  <div className="mt-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <CreateContractMoneySummaryTable
                      royaltyAmountBeforeVat={draft.areaBased.royaltyAmountBeforeVat ?? 0}
                      vatRate={draft.areaBased.vatRate ?? 0}
                      vatAmount={draft.areaBased.vatAmount ?? 0}
                      royaltyAmountAfterVat={draft.areaBased.royaltyAmountAfterVat ?? 0}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Checklist */}
            <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">
                Checklist
              </h3>
              {/* Progress bar */}
              {(() => {
                const completedCount = checklist.filter(c => c.completed).length;
                const total = checklist.length;
                const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
                return (
                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5">
                      <span className="font-medium">Tiến độ</span>
                      <span className="tabular-nums">{completedCount}/{total}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 ${!item.completed ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (item.completed || !item.targetId) return;
                      const el = document.getElementById(item.targetId);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      const input = el?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="checkbox"]):not([type="radio"]), select, textarea');
                      input?.focus();
                    }}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                        item.completed
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-200 text-zinc-400'
                      }`}
                    >
                      {item.completed ? '✓' : '·'}
                    </span>
                    <span
                      className={`text-xs ${item.completed ? 'text-emerald-700' : 'text-zinc-500 hover:text-amber-700 transition-colors'}`}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Info note */}
            <div className="px-1 py-1">
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                Dữ liệu địa chỉ được lưu theo cấu trúc Phường/Xã sau sáp nhập 2025.
              </p>
            </div>
          </div>{/* end sticky top-16 */}
        </div>{/* end xl:block */}
      </div>
      </div>
    </Page>

    {quoteDialogSnapshot && (
      <QuotePreviewDialog
        snapshot={quoteDialogSnapshot}
        customerName={draft.customer.legalName || undefined}
        signboard={draft.customer.brandName || undefined}
        onClose={() => setQuoteDialogSnapshot(null)}
      />
    )}
  </>
  );
}

type CreateContractMoneyRow = {
  id: string;
  label: string;
  value: string;
};

type CreateContractMoneySummaryTableProps = {
  royaltyAmountBeforeVat: number;
  vatRate: number;
  vatAmount: number;
  royaltyAmountAfterVat: number;
};

function CreateContractMoneySummaryTable({
  royaltyAmountBeforeVat,
  vatRate,
  vatAmount,
  royaltyAmountAfterVat,
}: CreateContractMoneySummaryTableProps) {
  const rows: CreateContractMoneyRow[] = [
    {
      id: 'rb',
      label: 'Trước Thuế GTGT',
      value: `${(royaltyAmountBeforeVat ?? 0).toLocaleString('vi-VN')} đ`,
    },
    {
      id: 'vat',
      label: `Thuế GTGT (${vatRate ?? 0}%)`,
      value: `${(vatAmount ?? 0).toLocaleString('vi-VN')} đ`,
    },
  ];

  const columns: DataTableColumn<CreateContractMoneyRow>[] = [
    {
      key: 'label',
      header: 'Khoản mục',
      align: 'left',
      wrap: 'nowrap',
      cellClassName: 'text-[11px] text-zinc-700',
      headerClassName:
        'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-left',
    },
    {
      key: 'value',
      header: 'Giá trị',
      align: 'right',
      wrap: 'nowrap',
      meta: { kind: 'currency' },
      cellClassName: 'text-[11px] font-mono tabular-nums text-zinc-800',
      headerClassName:
        'bg-[color:var(--vcpmc-table-header-bg)] text-[color:var(--vcpmc-table-header-fg)] text-right',
    },
  ];

  const grandTotal: DataTableSummaryRow = {
    id: 'grand-total',
    cells: [
      {
        id: 'gt-label',
        content: 'Tổng tiền',
        align: 'left',
        tone: 'grand-total',
        className: 'text-[10px] font-semibold uppercase tracking-wider',
      },
      {
        id: 'gt-value',
        content: `${(royaltyAmountAfterVat ?? 0).toLocaleString('vi-VN')} đ`,
        align: 'right',
        tone: 'grand-total',
        meta: { kind: 'currency' },
        className: 'text-[20px] font-bold leading-none tabular-nums',
      },
    ],
  };

  return (
    <VcpmcMoneyTable
      columns={columns}
      rows={rows}
      density="compact"
      grandTotal={grandTotal}
      emptyState={
        <div className="px-2 py-2 text-center text-[10px] text-zinc-500">
          Chưa có dữ liệu tiền.
        </div>
      }
    />
  );
}


// =============================================================================
// KaraokePreviewTable — read-only preview of karaoke backend dry-run rows.
// Uses karaokeRoyaltyRowModel to filter out empty/zero rows. Never
// recomputes money in the UI.
// =============================================================================
function KaraokePreviewTable({
  rows,
  totals,
  baseSalary,
  totalRooms,
}: {
  rows: KaraokeBackendRow[];
  totals: {
    amountBeforeGtgt: number;
    gtgtAmount: number;
    totalAmount: number;
    vatPercent: number;
    rawSubtotal: number;
  } | null;
  baseSalary?: number;
  totalRooms?: number;
}) {
  const uiRows = buildKaraokeRoyaltyRows(rows);
  const fmtVnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} đ`;
  if (uiRows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-500">
        Chưa có dòng tính phí nào từ backend.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-zinc-200 bg-white">
      <div className="px-3 py-2 border-b border-zinc-200 bg-zinc-50">
        <h5 className="text-[12px] font-semibold text-zinc-700">
          Bảng tính tiền bản quyền (Karaoke — Nghị định 17/2023/NĐ-CP)
        </h5>
        {totalRooms && baseSalary ? (
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Tổng {totalRooms} phòng · MLCS {fmtVnd(baseSalary)}
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full border-collapse text-[12px]" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1 text-left">Bậc tính</th>
              <th className="border border-zinc-300 px-2 py-1 text-right">Số phòng</th>
              <th className="border border-zinc-300 px-2 py-1 text-right">Hệ số</th>
              <th className="border border-zinc-300 px-2 py-1 text-right whitespace-nowrap">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {uiRows.map((r) => (
              <tr key={r.index}>
                <td className="border border-zinc-200 px-2 py-1">{r.label}</td>
                <td className="border border-zinc-200 px-2 py-1 text-right">{r.rooms}</td>
                <td className="border border-zinc-200 px-2 py-1 text-right">
                  {Number.isFinite(r.coef) ? r.coef.toFixed(2).replace('.', ',') : '—'}
                </td>
                <td className="border border-zinc-200 px-2 py-1 text-right whitespace-nowrap tabular-nums">
                  {r.amountDisplay}
                </td>
              </tr>
            ))}
            {totals && (
              <>
                <tr className="bg-zinc-50">
                  <td colSpan={3} className="border border-zinc-200 px-2 py-1 text-right font-semibold">
                    Cộng tiền bản quyền
                  </td>
                  <td className="border border-zinc-200 px-2 py-1 text-right whitespace-nowrap tabular-nums font-semibold">
                    {fmtVnd(totals.amountBeforeGtgt)}
                  </td>
                </tr>
                <tr className="bg-zinc-50">
                  <td colSpan={3} className="border border-zinc-200 px-2 py-1 text-right">
                    Thuế GTGT {Number.isFinite(totals.vatPercent) ? totals.vatPercent : ''}%
                  </td>
                  <td className="border border-zinc-200 px-2 py-1 text-right whitespace-nowrap tabular-nums">
                    {fmtVnd(totals.gtgtAmount)}
                  </td>
                </tr>
                <tr className="bg-[#0F172A] text-white">
                  <td colSpan={3} className="border border-zinc-700 px-2 py-1 text-right font-semibold">
                    Tổng thanh toán
                  </td>
                  <td className="border border-zinc-700 px-2 py-1 text-right whitespace-nowrap tabular-nums font-bold">
                    {fmtVnd(totals.totalAmount)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


