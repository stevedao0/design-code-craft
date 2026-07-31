import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AwardIcon,
  ArrowLeftIcon,
  FileTextIcon,
  PrinterIcon,
  ChevronDownIcon,
} from 'lucide-react';
import { ContentCard } from '../components/app-ui/ContentCard';
import { Button } from '../components/app-ui/Button';
import { Input } from '../components/app-ui/Input';
import { Textarea } from '../components/app-ui/Textarea';
import { SearchBox } from '../components/app-ui/SearchBox';
import { CertificatePaperPreview } from '../modules/certificates/CertificatePaperPreview';
import { GCN_LOCKED_OFFSET } from '../modules/certificates/certificateLayoutLocked';
import {
  ensureDefaultProfile,
  readActiveProfile,
  readCalibrationMode,
  resetActiveProfileOffsets,
  upsertProfile,
  writeCalibrationMode,
  type PrintCalibrationProfile,
} from '../modules/certificates/printCalibration';
import type { CalibrationMode, CalibrationProfileLike, CertificatePreviewData, CertificateTypographyOverrides, GcnPreviewZoomMode, GcnPreviewZoomState } from '../modules/certificates/certificateTypes';
import type { CertificatePreviewContext } from '../lib/certificatesClient';
import {
  getCertificateContextDryRun,
  getContracts,
  getContractDetail,
  createCertificateDraft,
} from '../lib/contractsClient';
import {
  updateCertificate,
  checkExtensionWithVersion,
  type CertificateUpdatePayload,
  type CertificateUpdateResponse,
} from '../lib/certificatesClient';
import { RouteKey } from '../data/routes';

const TOKEN_KEY = 'vcpmc_new_app_access_token';
const TYPOGRAPHY_KEY = 'certificates.typography.v1';
const PREVIEW_ZOOM_KEY = 'vcpmc.gcnPreviewZoom.v1';
const DEFAULT_TYPOGRAPHY: CertificateTypographyOverrides = {};

const PREVIEW_ZOOM_DEFAULT: GcnPreviewZoomState = { mode: 'fit-height', scale: 1 };
const PREVIEW_ZOOM_MIN = 0.25;
const PREVIEW_ZOOM_MAX = 2.0;
const PREVIEW_ZOOM_STEP = 0.1;

const readPreviewZoom = (): GcnPreviewZoomState => {
  try {
    const raw = localStorage.getItem(PREVIEW_ZOOM_KEY);
    if (!raw) return PREVIEW_ZOOM_DEFAULT;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return PREVIEW_ZOOM_DEFAULT;
    const mode = (['fit-height', 'fit-width', 'actual-100', 'custom'] as GcnPreviewZoomMode[]).includes(parsed.mode)
      ? parsed.mode
      : 'fit-height';
    const scale = Number(parsed.scale);
    return {
      mode,
      scale: isFinite(scale) ? Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, scale)) : 1,
    };
  } catch {
    return PREVIEW_ZOOM_DEFAULT;
  }
};

const writePreviewZoom = (state: GcnPreviewZoomState) => {
  try {
    localStorage.setItem(PREVIEW_ZOOM_KEY, JSON.stringify(state));
  } catch {
    /* non-fatal */
  }
};

const readTypography = (): CertificateTypographyOverrides => {
  try {
    const raw = localStorage.getItem(TYPOGRAPHY_KEY);
    if (!raw) return DEFAULT_TYPOGRAPHY;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return DEFAULT_TYPOGRAPHY;
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
};

const writeTypography = (cfg: CertificateTypographyOverrides) => {
  try {
    localStorage.setItem(TYPOGRAPHY_KEY, JSON.stringify(cfg));
  } catch {
    // storage full or unavailable — non-fatal
  }
};
const EXCEL_TEMPLATE_FILENAME = 'Mau_Dan_Du_Lieu_GCN.xls';
const EXTERNAL_HEADERS = [
  'Số GCN',
  'Ngày cấp',
  'Tên đơn vị',
  'MST/CCCD',
  'Bảng hiệu',
  'Địa chỉ',
  'Địa điểm kinh doanh',
  'Số hợp đồng',
  'Ngày bắt đầu',
  'Ngày kết thúc',
  'Phạm vi cột 1',
  'Phạm vi cột 2',
  'Phạm vi cột 3',
] as const;

type SourceMode = 'contract' | 'manual' | 'external';

type ScopeAlign = {
  col1: 'left' | 'center' | 'right';
  col2: 'left' | 'center' | 'right';
  col3: 'left' | 'center' | 'right';
};

type BaseCertificateForm = {
  certificate_no: string;
  certificate_issue_date: string;
  organization_name: string;
  business_registration_no: string;
  address: string;
  business_sign_name: string;
  business_location: string;
  contract_no: string;
  effective_from: string;
  effective_to: string;
  gcn_scope_col_1_text: string;
  gcn_scope_col_2_text: string;
  gcn_scope_col_3_text: string;
  qr_image_data: string;
  offset_x_mm: number;
  offset_y_mm: number;
  fieldOffsets: Record<string, { dx: number; dy: number }>;
  scopeColAlign: ScopeAlign;
};

type FreeFormData = BaseCertificateForm;
type EditableCertData = BaseCertificateForm;

type SimpleContractItem = {
  id: number;
  contract_no: string;
  organization_name: string;
  business_sign_name: string;
  domain_group: string;
};

type ExternalCertificateRow = EditableCertData & {
  id: string;
  sourceLabel: string;
  createdAt: number;
};

type CompactSummaryItem = {
  label: string;
  value: string;
  mono?: boolean;
};

const emptyScopeAlign: ScopeAlign = { col1: 'left', col2: 'center', col3: 'center' };

const emptyFree: FreeFormData = {
  certificate_no: '',
  certificate_issue_date: '',
  organization_name: '',
  business_registration_no: '',
  address: '',
  business_sign_name: '',
  business_location: '',
  contract_no: '',
  effective_from: '',
  effective_to: '',
  gcn_scope_col_1_text: '',
  gcn_scope_col_2_text: '',
  gcn_scope_col_3_text: '',
  qr_image_data: '',
  offset_x_mm: 0,
  offset_y_mm: 0,
  fieldOffsets: {},
  scopeColAlign: emptyScopeAlign,
};

const EXTERNAL_HEADER_ALIASES: Record<string, keyof EditableCertData> = {
  sogcn: 'certificate_no',
  sogiaychungnhan: 'certificate_no',
  ngaycap: 'certificate_issue_date',
  tendonvi: 'organization_name',
  donvi: 'organization_name',
  mstcccd: 'business_registration_no',
  mst: 'business_registration_no',
  masothue: 'business_registration_no',
  banghieu: 'business_sign_name',
  diachi: 'address',
  diadiemkinhdoanh: 'business_location',
  diadiemsudung: 'business_location',
  sohopdong: 'contract_no',
  ngaybatdau: 'effective_from',
  ngayketthuc: 'effective_to',
  phamvicot1: 'gcn_scope_col_1_text',
  phamvicot2: 'gcn_scope_col_2_text',
  phamvicot3: 'gcn_scope_col_3_text',
};

function normalizeHeader(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function normalizeDate(input: string): string {
  const value = input.trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const slash = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return value;
}

function buildEditableFromCtx(ctx: CertificatePreviewContext): EditableCertData {
  return {
    certificate_no: ctx.certificate_no || '',
    certificate_issue_date: ctx.certificate_issue_date || '',
    organization_name: ctx.organization_name,
    business_registration_no: ctx.business_registration_no || '',
    address: ctx.address || '',
    business_sign_name: ctx.business_sign_name || '',
    business_location: ctx.business_location || '',
    contract_no: ctx.contract_no || '',
    effective_from: ctx.effective_from || '',
    effective_to: ctx.effective_to || '',
    gcn_scope_col_1_text: ctx.gcn_scope_col_1_text || '',
    gcn_scope_col_2_text: ctx.gcn_scope_col_2_text || '',
    gcn_scope_col_3_text: ctx.gcn_scope_col_3_text || '',
    qr_image_data: ctx.qr_image_data || '',
    offset_x_mm: ctx.offset_x_mm || 0,
    offset_y_mm: ctx.offset_y_mm || 0,
    fieldOffsets: ctx.fieldOffsets || {},
    scopeColAlign: ctx.scopeColAlign || emptyScopeAlign,
  };
}

function createExternalRow(partial: Partial<EditableCertData>, index: number): ExternalCertificateRow {
  return {
    ...emptyFree,
    ...partial,
    certificate_issue_date: normalizeDate(partial.certificate_issue_date || ''),
    effective_from: normalizeDate(partial.effective_from || ''),
    effective_to: normalizeDate(partial.effective_to || ''),
    fieldOffsets: partial.fieldOffsets || {},
    scopeColAlign: partial.scopeColAlign || emptyScopeAlign,
    id: `external-${Date.now()}-${index}`,
    sourceLabel: partial.organization_name || partial.contract_no || `Dòng ${index + 1}`,
    createdAt: Date.now() + index,
  };
}

function parseExcelTsv(raw: string): string[][] {
  if (typeof raw !== 'string' || raw.length === 0) return [];

  let text = raw;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotedCell = false;
  let lastWasQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotedCell) {
      if (lastWasQuote) {
        if (ch === '"') {
          currentCell += '"';
          lastWasQuote = false;
          continue;
        }
        inQuotedCell = false;
        lastWasQuote = false;
      } else if (ch === '"') {
        lastWasQuote = true;
        continue;
      } else {
        currentCell += ch;
        continue;
      }
    }

    if (ch === '"') {
      if (currentCell.length === 0) {
        inQuotedCell = true;
        lastWasQuote = false;
        continue;
      }
      currentCell += ch;
      continue;
    }

    if (ch === '\t') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (ch === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    if (ch === '\r') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      if (text[i + 1] === '\n') i += 1;
      continue;
    }

    currentCell += ch;
  }

  if (inQuotedCell && !lastWasQuote) {
    inQuotedCell = false;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);

  return rows
    .filter((cells) => cells.some((c) => c.length > 0))
    .map((cells) => cells.map((c) => c.replace(/\r/g, '')));
}

function normalizeCell(value: string): string {
  let v = value || '';
  if (v.charCodeAt(0) === 0xFEFF) v = v.slice(1);
  v = v.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  v = v.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
  v = v.replace(/\n{3,}/g, '\n\n');
  return v;
}

function parseExternalRows(raw: string): ExternalCertificateRow[] {
  const matrix = parseExcelTsv(raw);
  if (matrix.length === 0) return [];

  const headerCandidates = matrix[0].map((cell) => EXTERNAL_HEADER_ALIASES[normalizeHeader(cell)]);
  const hasHeader = headerCandidates.some(Boolean);
  const headers = hasHeader
    ? headerCandidates
    : EXTERNAL_HEADERS.map((header) => EXTERNAL_HEADER_ALIASES[normalizeHeader(header)]);
  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const expectedColCount = headers.length;
  const rows: ExternalCertificateRow[] = [];
  dataRows.forEach((cells, index) => {
    const draft: Partial<EditableCertData> = {};
    cells.forEach((cell, cellIndex) => {
      const field = headers[cellIndex];
      if (!field) return;
      const value = normalizeCell(cell);
      (draft[field] as string | undefined) = value;
    });
    const row = createExternalRow(draft, index);
    const hasAnyValue = Object.entries(row).some(([key, val]) => {
      if (key === 'id' || key === 'sourceLabel' || key === 'createdAt') return false;
      return typeof val === 'string' && val.trim().length > 0;
    });
    if (hasAnyValue) rows.push(row);
  });

  return rows;
}

function buildExcelTemplateHtml(): string {
  const sampleRow = [
    '0137/2026.GCN_KA',
    '10/06/2026',
    'Công ty TNHH Ví dụ VCPMC',
    '0101234567',
    'Cafe Ví Dụ',
    '12 Nguyễn Huệ, Quận 1, TP.HCM',
    'Tầng 3, TTTM Ví Dụ',
    'HĐ-2026-001',
    '01/01/2026',
    '31/12/2026',
    'Phòng 101',
    'Phòng 102',
    'Phòng 103',
  ];

  const escape = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const headerHtml = EXTERNAL_HEADERS.map((header) => `<th>${escape(header)}</th>`).join('');
  const sampleHtml = sampleRow.map((value) => `<td>${escape(value)}</td>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Type" content="application/vnd.ms-excel; charset=utf-8" />
<title>MẪU DÁN DỮ LIỆU GCN</title>
<style>
body { font-family: Arial, sans-serif; }
table { border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
th { background: #f2e8c9; font-weight: 700; }
.note { font-weight: 700; color: #7a4b00; }
</style>
</head>
<body>
<table>
<tr><td class="note" colspan="13">MẪU DÁN DỮ LIỆU GCN</td></tr>
<tr><td colspan="13">Copy dữ liệu từ file mẫu Excel rồi dán vào đây, gồm cả dòng tiêu đề.</td></tr>
<tr><td colspan="13">Các cột ngày chấp nhận định dạng dd/mm/yyyy hoặc yyyy-mm-dd. Dữ liệu chỉ nạp vào bộ nhớ tạm, không ghi DB.</td></tr>
<tr>${headerHtml}</tr>
<tr>${sampleHtml}</tr>
</table>
</body>
</html>`;
}

function downloadExcelTemplate() {
  const bom = '\uFEFF';
  const html = bom + buildExcelTemplateHtml();
  const blob = new Blob([html], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = EXCEL_TEMPLATE_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function CertificatePrintPage({
  onNavigate,
  initialContractId,
  initialCertificateId,
  onPrinted,
  embedded,
}: {
  onNavigate: (k: RouteKey) => void;
  initialContractId?: number | null;
  initialCertificateId?: number | null;
  onPrinted?: () => void;
  /** When true, page is mounted inside the Workspace Frame. Suppresses
   *  the page's own header bar (the workspace already provides one).
   *  Preview, calibration, print output, and save behavior are NOT
   *  affected — only the visual chrome. */
  embedded?: boolean;
}) {
  const [sourceMode, setSourceMode] = useState<SourceMode>('contract');
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [previewZoom, setPreviewZoom] = useState<GcnPreviewZoomState>(() => readPreviewZoom());

  const [contractSearch, setContractSearch] = useState('');
  const [contractResults, setContractResults] = useState<SimpleContractItem[]>([]);
  const [contractLoading, setContractLoading] = useState(false);
  const [selectedContract, setSelectedContract] = useState<SimpleContractItem | null>(null);
  const [contractCtx, setContractCtx] = useState<CertificatePreviewContext | null>(null);
  const [contractCtxLoading, setContractCtxLoading] = useState(false);
  const [contractEditable, setContractEditable] = useState<EditableCertData | null>(null);
  const [savedCertId, setSavedCertId] = useState<number | null>(null);
  const [typographyOverrides, setTypographyOverrides] = useState<CertificateTypographyOverrides>(() => readTypography());

  // Print calibration (Phase 1) — disabled for runtime safety; CalibrationPanel JSX removed.
  // State still exists for offset-aware buildPrintHtml and CertificatePaperPreview, but forced to safe defaults.
  const [calibrationProfile, setCalibrationProfile] = useState<PrintCalibrationProfile | null>(() => {
    try {
      const p = ensureDefaultProfile();
      // Force 0/0 offset to avoid any localStorage override leaking into the page.
      return p ? { ...p, offsetXmm: 0, offsetYmm: 0 } : null;
    } catch {
      return null;
    }
  });
  const [calibrationMode, setCalibrationMode] = useState<CalibrationMode>('off');
  const [calibrationOffsetXInput, setCalibrationOffsetXInput] = useState<string>('0');
  const [calibrationOffsetYInput, setCalibrationOffsetYInput] = useState<string>('0');
  const [calibrationNameInput, setCalibrationNameInput] = useState<string>('Default');
  const [calibrationMsg, setCalibrationMsg] = useState<string>('');
  const [calibrationMsgType, setCalibrationMsgType] = useState<'success' | 'error' | 'info'>('info');

  useEffect(() => {
    if (!calibrationProfile) return;
    setCalibrationOffsetXInput(String(calibrationProfile.offsetXmm));
    setCalibrationOffsetYInput(String(calibrationProfile.offsetYmm));
    setCalibrationNameInput(calibrationProfile.name);
  }, [calibrationProfile]);

  useEffect(() => {
    writeCalibrationMode(calibrationMode === 'on');
  }, [calibrationMode]);

  const flashCalibrationMsg = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setCalibrationMsg(msg);
    setCalibrationMsgType(type);
    setTimeout(() => setCalibrationMsg(''), 3500);
  };

  const [freeForm, setFreeForm] = useState<FreeFormData>(emptyFree);

  const [externalPasteValue, setExternalPasteValue] = useState('');
  const [externalRows, setExternalRows] = useState<ExternalCertificateRow[]>([]);
  const [externalPreviewRows, setExternalPreviewRows] = useState<ExternalCertificateRow[]>([]);
  const [externalIncompleteRowCount, setExternalIncompleteRowCount] = useState(0);
  const [externalSearch, setExternalSearch] = useState('');
  const [selectedExternalRowId, setSelectedExternalRowId] = useState<string | null>(null);

  const [extStatus, setExtStatus] = useState<'checking' | 'connected' | 'not_found'>('checking');
  const [extVersion, setExtVersion] = useState<string | null>(null);
  const [extLastChecked, setExtLastChecked] = useState<number | null>(null);
  const [extSendMsg, setExtSendMsg] = useState('');
  const [extSendMsgType, setExtSendMsgType] = useState<'success' | 'error' | 'info'>('info');

  // ─── Periodic extension handshake (ping) ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let activeHandler: ((event: MessageEvent) => void) | null = null;
    let activeTimer: ReturnType<typeof setTimeout> | null = null;
    let attemptCount = 0;
    const MAX_INITIAL_ATTEMPTS = 3;

    const cleanup = () => {
      if (activeHandler) {
        window.removeEventListener('message', activeHandler);
        activeHandler = null;
      }
      if (activeTimer) {
        clearTimeout(activeTimer);
        activeTimer = null;
      }
    };

    const checkExtension = () => {
      if (cancelled) return;
      cleanup();
      attemptCount++;

      const requestId = `ping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      activeTimer = setTimeout(() => {
        if (cancelled) return;
        if (attemptCount < MAX_INITIAL_ATTEMPTS) {
          checkExtension();
        } else {
          setExtStatus('not_found');
          setExtVersion(null);
          retryTimer = setTimeout(checkExtension, 10000);
        }
      }, 5000);

      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.source !== 'VCPMC_QR_HELPER') return;
        if (data.type !== 'VCPMC_QR_HELPER_RESPONSE') return;
        if (data.requestId !== requestId) return;

        if (cancelled) return;

        if (activeTimer) {
          clearTimeout(activeTimer);
          activeTimer = null;
        }

        if (data.ok === true) {
          setExtStatus('connected');
          setExtVersion(typeof data.version === 'string' ? data.version : null);
          setExtLastChecked(Date.now());
          retryTimer = setTimeout(checkExtension, 60000);
        } else {
          if (attemptCount < MAX_INITIAL_ATTEMPTS) {
            checkExtension();
          } else {
            setExtStatus('not_found');
            setExtVersion(null);
            retryTimer = setTimeout(checkExtension, 10000);
          }
        }
      };

      activeHandler = handler;
      window.addEventListener('message', handler);

      window.postMessage(
        { source: 'VCPMC_APP', type: 'VCPMC_QR_HELPER_PING', requestId },
        window.location.origin
      );
    };

    checkExtension();
    return () => {
      cancelled = true;
      cleanup();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const currentExternalRow = useMemo(
    () => externalRows.find((row) => row.id === selectedExternalRowId) || null,
    [externalRows, selectedExternalRowId],
  );

  const activeEditable = sourceMode === 'contract'
    ? contractEditable
    : sourceMode === 'manual'
      ? freeForm
      : currentExternalRow;

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  // ---------- Screen-only preview zoom ----------
  const paperShellRef = React.useRef<HTMLDivElement | null>(null);
  const [shellMetrics, setShellMetrics] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const node = paperShellRef.current;
    if (!node) return;
    const update = () => {
      const r = node.getBoundingClientRect();
      setShellMetrics({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [activeEditable]);

  // A4 paper: 209.6mm × 296.6mm. 1mm ≈ 3.7795px (96dpi).
  const MM_TO_PX = 96 / 25.4;
  const paperWpx = 209.6 * MM_TO_PX;
  const paperHpx = 296.6 * MM_TO_PX;

  const computedFitScale = useMemo(() => {
    if (!shellMetrics.width || !shellMetrics.height) return 1;
    // Reserve ~32px each side for shell padding
    const innerW = Math.max(80, shellMetrics.width - 32);
    const innerH = Math.max(120, shellMetrics.height - 48);
    const scaleW = innerW / paperWpx;
    const scaleH = innerH / paperHpx;
    if (previewZoom.mode === 'fit-width') return Math.min(1, scaleW);
    if (previewZoom.mode === 'fit-height') return Math.min(1, scaleH);
    if (previewZoom.mode === 'actual-100') return 1;
    return previewZoom.scale;
  }, [previewZoom, shellMetrics, paperWpx, paperHpx]);

  const effectiveScale = previewZoom.mode === 'custom' ? previewZoom.scale : computedFitScale;

  const setZoomMode = (mode: GcnPreviewZoomMode) => {
    let next: GcnPreviewZoomState;
    if (mode === 'fit-height' || mode === 'fit-width' || mode === 'actual-100') {
      // scale is computed from shell metrics; stored value is the user's last custom
      next = { mode, scale: previewZoom.scale };
    } else {
      next = { mode: 'custom', scale: previewZoom.scale || 1 };
    }
    setPreviewZoom(next);
    writePreviewZoom(next);
  };

  const zoomIn = () => {
    const next: GcnPreviewZoomState = {
      mode: 'custom',
      scale: Math.min(PREVIEW_ZOOM_MAX, (previewZoom.scale || effectiveScale) + PREVIEW_ZOOM_STEP),
    };
    setPreviewZoom(next);
    writePreviewZoom(next);
  };

  const zoomOut = () => {
    const next: GcnPreviewZoomState = {
      mode: 'custom',
      scale: Math.max(PREVIEW_ZOOM_MIN, (previewZoom.scale || effectiveScale) - PREVIEW_ZOOM_STEP),
    };
    setPreviewZoom(next);
    writePreviewZoom(next);
  };

  const updateTypography = (key: string, patch: { fontSizePt?: number | null; bold?: boolean | null }) => {
    setTypographyOverrides((prev) => {
      const current = prev[key] ?? {};
      const next = { ...prev, [key]: { ...current, ...patch } };
      // Clean up: remove key if no overrides remain
      if (next[key]?.fontSizePt == null && next[key]?.bold === undefined) {
        delete next[key];
      }
      writeTypography(next);
      return next;
    });
  };

  const resetTypography = (key: string) => {
    setTypographyOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      writeTypography(next);
      return next;
    });
  };

  const resetAllTypography = () => {
    setTypographyOverrides({});
    writeTypography({});
  };

  const handleSendToExtension = () => {
    const computeRegion = (no: string): string => {
      if (no.includes('-PN/') || no.includes('PN/PR') || no.includes('PN\\PR')) return 'Nam';
      if (no.includes('-PB/') || no.includes('PB/PR') || no.includes('PB\\PR')) return 'Bac';
      return 'Nam';
    };

    const source = activeEditable || emptyFree;
    const dom = sourceMode === 'contract' ? selectedContract?.domain_group || '' : 'Ngoài hệ thống';
    const payload = {
      contract_no: source.contract_no.trim() || null,
      certificate_no: source.certificate_no.trim() || null,
      organization_name: source.organization_name.trim() || null,
      effective_from: source.effective_from || null,
      effective_to: source.effective_to || null,
      tax_code: source.business_registration_no ? source.business_registration_no.replace(/\s+/g, '').trim() : null,
      brand_name: source.business_sign_name.trim() || null,
      address: source.address.trim() || null,
      usage_address: source.business_location.trim() || null,
      region: computeRegion(source.contract_no || ''),
      domain: dom || null,
      issue_date: source.certificate_issue_date || null,
    };

    setExtSendMsg('');
    const EXTENSION_INSTALL_MSG = 'Máy này chưa cài tiện ích QR Portal Assistant.\nVui lòng cài extension từ folder vcpmc-qr-helper-v2 (kèm theo bộ cài app) và bật trong chrome://extensions.';

    const requestId = `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', handler);
      setExtStatus('not_found');
      setExtSendMsg(EXTENSION_INSTALL_MSG);
      setExtSendMsgType('error');
    }, 3000);

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source !== 'VCPMC_QR_HELPER') return;
      if (data.type !== 'SAVE_QR_PAYLOAD_RESULT') return;
      if (data.requestId !== requestId) return;
      if (settled) return;
      settled = true;
      window.removeEventListener('message', handler);
      clearTimeout(timeout);
      if (data.ok) {
        setExtStatus('connected');
        setExtSendMsg(`Đã gửi: ${payload.contract_no || '-'} / ${payload.certificate_no || '-'}`);
        setExtSendMsgType('success');
      } else {
        setExtStatus('not_found');
        setExtSendMsg(EXTENSION_INSTALL_MSG);
        setExtSendMsgType('error');
      }
    };

    window.addEventListener('message', handler);
    window.postMessage(
      { source: 'VCPMC_APP', type: 'SAVE_QR_PAYLOAD', payload, requestId },
      window.location.origin
    );
    setTimeout(() => setExtSendMsg(''), 6000);
  };

  const handleOpenPortalQR = () => {
    window.open('http://14.241.251.220:7879/dashboard/content', '_blank');
  };

  const searchContracts = useCallback(async (q: string) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !q.trim()) {
      setContractResults([]);
      return;
    }
    setContractLoading(true);
    try {
      const res = await getContracts(token, { q, page: 1, page_size: 20 });
      const items: SimpleContractItem[] = res.items.map((c) => ({
        id: typeof c.id === 'string' ? parseInt(c.id, 10) : c.id,
        contract_no: c.contract_no || '',
        organization_name: c.customer_name || c.organization_name || '',
        business_sign_name: c.business_sign_name || '',
        domain_group: c.domain_group || c.domain || '',
      }));
      setContractResults(items.slice(0, 5));
    } catch (e: any) {
      showToast(String(e?.message || 'Lỗi tìm hợp đồng'), 'error');
    } finally {
      setContractLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sourceMode === 'contract' && contractSearch.trim().length >= 2) {
        searchContracts(contractSearch);
      } else {
        setContractResults([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [contractSearch, searchContracts, sourceMode]);

  const loadContractContext = useCallback(async (contractId: number) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setContractCtxLoading(true);
    setContractCtx(null);
    try {
      const res = await getCertificateContextDryRun(token, contractId);
      if (res.ok) {
        setContractCtx(res.context);
        setContractEditable(buildEditableFromCtx(res.context));
        setSourceMode('contract');
      } else {
        showToast(res.message || 'Lỗi tải context', 'error');
      }
    } catch (e: any) {
      showToast(String(e?.message || 'Lỗi tải context'), 'error');
    } finally {
      setContractCtxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialContractId) return;
    let cancelled = false;
    setSourceMode('contract');
    async function fetchAndSelect() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token || cancelled) return;
      try {
        const detail = await getContractDetail(token, initialContractId);
        if (cancelled) return;
        setSelectedContract({
          id: detail.id,
          contract_no: detail.contract_no || '',
          organization_name: detail.customer?.name || '',
          business_sign_name: detail.customer?.signage || '',
          domain_group: detail.domain?.domain_group || '',
        });
        setContractSearch('');
        setContractResults([]);
        await loadContractContext(initialContractId);
      } catch {
        /* ignore */
      }
    }
    fetchAndSelect();
    return () => {
      cancelled = true;
    };
  }, [initialContractId, loadContractContext]);

  const handleSelectContract = (contract: SimpleContractItem) => {
    setSelectedContract(contract);
    setContractResults([]);
    setContractSearch('');
    setContractEditable(null);
    setSavedCertId(null);
    loadContractContext(contract.id);
  };

  const updateExternalRow = useCallback((rowId: string, updater: (row: ExternalCertificateRow) => ExternalCertificateRow) => {
    setExternalRows((prev) => prev.map((row) => (row.id === rowId ? updater(row) : row)));
  }, []);

  const handleSelectExternalRow = (rowId: string) => {
    setSelectedExternalRowId(rowId);
    setSourceMode('external');
    setContractResults([]);
    setContractSearch('');
    setSelectedContract(null);
    setContractCtx(null);
    setContractEditable(null);
    setSavedCertId(null);
  };

  const handleApplyExternalPaste = () => {
    const parsedRows = parseExternalRows(externalPasteValue);
    if (parsedRows.length === 0) {
      showToast('Không tìm thấy dòng dữ liệu hợp lệ để nạp vào form.', 'error');
      setExternalIncompleteRowCount(0);
      return;
    }
    const matrix = parseExcelTsv(externalPasteValue);
    const headerRow = matrix[0] || [];
    const headerHasAliases = headerRow.some((cell) => EXTERNAL_HEADER_ALIASES[normalizeHeader(cell)]);
    const expectedCols = headerHasAliases ? headerRow.length : EXTERNAL_HEADERS.length;
    const dataRowsRaw = headerHasAliases ? matrix.slice(1) : matrix;
    const incompleteCount = dataRowsRaw.filter((cells) => cells.length < expectedCols && cells.some((c) => c.trim().length > 0)).length;
    setExternalIncompleteRowCount(incompleteCount);
    setExternalRows(parsedRows);
    setExternalPreviewRows(parsedRows.slice(0, 5));
    setSelectedExternalRowId(parsedRows[0].id);
    setSourceMode('external');
    showToast(`Đã nhận ${parsedRows.length} dòng dữ liệu Excel.`, 'success');
  };

  useEffect(() => {
    if (sourceMode !== 'external') return;
    const parsedRows = parseExternalRows(externalPasteValue);
    setExternalPreviewRows(parsedRows.slice(0, 5));
  }, [externalPasteValue, sourceMode]);

  const handleClearExternal = () => {
    setExternalPasteValue('');
    setExternalRows([]);
    setExternalPreviewRows([]);
    setExternalIncompleteRowCount(0);
    setSelectedExternalRowId(null);
    showToast('Đã xóa dữ liệu Excel tạm.', 'success');
  };

  const handleSaveCalibration = () => {
    const parsedX = Number(calibrationOffsetXInput);
    const parsedY = Number(calibrationOffsetYInput);
    if (!isFinite(parsedX) || !isFinite(parsedY)) {
      flashCalibrationMsg('Offset phải là số hợp lệ (mm).', 'error');
      return;
    }
    const updated = upsertProfile({
      ...(calibrationProfile || {}),
      name: calibrationNameInput.trim() || 'Default',
      paperType: calibrationProfile?.paperType || 'A4',
      templateType: calibrationProfile?.templateType || 'gcn-locked',
      offsetXmm: parsedX,
      offsetYmm: parsedY,
    });
    setCalibrationProfile(updated);
    flashCalibrationMsg(`Đã lưu cấu hình "${updated.name}" (X=${updated.offsetXmm}mm, Y=${updated.offsetYmm}mm).`, 'success');
  };

  const handleResetCalibration = () => {
    const reset = resetActiveProfileOffsets();
    setCalibrationProfile(reset);
    flashCalibrationMsg('Đã đưa offset về 0,0 mm.', 'info');
  };

  const calibrationProfileView: CalibrationProfileLike | null = calibrationProfile;

  const externalResults = useMemo(() => {
    if (!externalRows.length) return [];
    const keyword = externalSearch.trim().toLowerCase();
    if (!keyword) return externalRows.slice(0, 5);
    return externalRows.filter((row) => {
      const haystack = [row.organization_name, row.contract_no, row.business_sign_name, row.certificate_no]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    }).slice(0, 5);
  }, [externalRows, externalSearch]);

  const buildPreviewFromEditable = (editable: EditableCertData): CertificatePreviewData => {
    const dateRaw = editable.certificate_issue_date || '';
    let day = '';
    let month = '';
    let year = '';
    if (dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      [year, month, day] = dateRaw.split('-');
    } else if (dateRaw && dateRaw.includes('/')) {
      [day, month, year] = dateRaw.split('/');
    }
    const signName = (editable.business_sign_name || '').trim();
    return {
      certificate_no: editable.certificate_no,
      certificate_issue_date: editable.certificate_issue_date,
      certificate_issue_day: day,
      certificate_issue_month: month,
      certificate_issue_year: year,
      organization_name: editable.organization_name,
      business_registration_no: editable.business_registration_no,
      address: editable.address,
      business_sign_name: signName,
      business_location: editable.business_location,
      contract_no: editable.contract_no,
      effective_from: editable.effective_from || '',
      effective_to: editable.effective_to || '',
      gcn_scope_col_1_text: editable.gcn_scope_col_1_text,
      gcn_scope_col_2_text: editable.gcn_scope_col_2_text,
      gcn_scope_col_3_text: editable.gcn_scope_col_3_text,
      qr_image_data: editable.qr_image_data || '',
      offset_x_mm: editable.offset_x_mm,
      offset_y_mm: editable.offset_y_mm,
      fieldOffsets: editable.fieldOffsets,
      scopeColAlign: editable.scopeColAlign,
    };
  };

  const previewData = activeEditable ? buildPreviewFromEditable(activeEditable) : null;

  const updateFree = <K extends keyof FreeFormData>(key: K, value: FreeFormData[K]) => {
    setFreeForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateFreeFieldOffset = (key: string, dx: number, dy: number) => {
    setFreeForm((prev) => ({ ...prev, fieldOffsets: { ...prev.fieldOffsets, [key]: { dx, dy } } }));
  };
  const resetFreeFieldOffset = (key: string) => {
    setFreeForm((prev) => {
      const next = { ...prev.fieldOffsets };
      delete next[key];
      return { ...prev, fieldOffsets: next };
    });
  };
  const resetAllFreeFieldOffsets = () => setFreeForm((prev) => ({ ...prev, fieldOffsets: {} }));

  const buildPrintHtml = (printMode: 'official' | 'calibration', profileArg?: PrintCalibrationProfile | null) => {
    const paperEl = document.querySelector<HTMLElement>('.gcn-locked-paper');
    if (!paperEl) return null;
    const qrImg = paperEl.querySelector<HTMLImageElement>('.gcn-locked-qr-image');
    const qrSrc = qrImg?.src || '';
    const clonedPaper = paperEl.cloneNode(true) as HTMLElement;
    clonedPaper.classList.remove('gcn-locked-paper--screen', 'gcn-locked-paper--print');
    if (qrSrc) {
      const clonedQr = clonedPaper.querySelector<HTMLImageElement>('.gcn-locked-qr-image');
      if (clonedQr) clonedQr.src = qrSrc;
    }
    // Defensive: read profile from arg first, then alias, then null.
    const profile = profileArg !== undefined ? profileArg : calibrationProfileView;
    const offsetX = (profile && typeof profile.offsetXmm === 'number' && isFinite(profile.offsetXmm)) ? profile.offsetXmm : 0;
    const offsetY = (profile && typeof profile.offsetYmm === 'number' && isFinite(profile.offsetYmm)) ? profile.offsetYmm : 0;
    const marksHtml = printMode === 'calibration' ? `
      <div class="gcn-locked-calib-overlay" aria-hidden="true">
        <div class="gcn-locked-calib-mark" style="left:10mm;top:10mm;"><span class="gcn-locked-calib-mark-label">TL</span></div>
        <div class="gcn-locked-calib-mark" style="left:200mm;top:10mm;"><span class="gcn-locked-calib-mark-label">TR</span></div>
        <div class="gcn-locked-calib-mark" style="left:105mm;top:148.5mm;"><span class="gcn-locked-calib-mark-label">C</span></div>
        <div class="gcn-locked-calib-mark" style="left:10mm;top:287mm;"><span class="gcn-locked-calib-mark-label">BL</span></div>
        <div class="gcn-locked-calib-mark" style="left:200mm;top:287mm;"><span class="gcn-locked-calib-mark-label">BR</span></div>
        <div class="gcn-locked-calib-label">TEST / CANH GIẤY — profile: ${profile?.name || 'Default'}, X: ${offsetX}mm, Y: ${offsetY}mm</div>
      </div>
    ` : '';
    // For official prints we still want the profile offset applied to the
    // wrapper, but the existing @media print rule forces transform: none
    // on .gcn-locked-paper. We bypass it by wrapping the paper in a fresh
    // .gcn-locked-paper-calibrated node (inline transform) and using
    // body.gcn-print-mode-${printMode} to mark "official" vs "calibration".
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>In Giay Chung Nhan</title><style>@page { size: 209.6mm 296.6mm; margin: 0; } * { margin: 0; padding: 0; box-sizing: border-box; } html, body { width: 209.6mm; height: 296.6mm; overflow: hidden; background: #fff; font-family: "Times New Roman", serif; } .gcn-locked-paper-calibrated { position: relative; width: 209.6mm; height: 296.6mm; transform: translate(${offsetX}mm, ${offsetY}mm); transform-origin: top left; } .gcn-locked-paper { position: relative; width: 209.6mm; height: 296.6mm; background: #fff; overflow: hidden; color: #111; font-family: "Times New Roman", serif; } .gcn-locked-field { position: absolute; box-sizing: border-box; padding: 0; white-space: pre-wrap; overflow-wrap: anywhere; } .gcn-locked-bottom-anchor { position: absolute; box-sizing: border-box; display: block; padding: 0; font-size: 12.5pt; line-height: 1.15; overflow-wrap: anywhere; } .gcn-locked-qr-field { position: absolute; display: flex; align-items: center; justify-content: center; box-sizing: border-box; overflow: hidden; } .gcn-locked-qr-image { width: 100%; height: 100%; object-fit: contain; display: block; } .gcn-locked-qr-placeholder { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border: 1px dashed #999; color: #555; display: flex; align-items: center; justify-content: center; font: 7pt "Times New Roman", serif; } .gcn-locked-calib-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 10; } .gcn-locked-calib-mark { position: absolute; width: 0; height: 0; } .gcn-locked-calib-mark::before, .gcn-locked-calib-mark::after { content: ''; position: absolute; background: #111; } .gcn-locked-calib-mark::before { left: -4mm; top: -0.1mm; width: 8mm; height: 0.2mm; } .gcn-locked-calib-mark::after { left: -0.1mm; top: -4mm; width: 0.2mm; height: 8mm; } .gcn-locked-calib-mark-label { position: absolute; left: 1.2mm; top: 1.2mm; font: 6pt "Times New Roman", serif; color: #111; white-space: nowrap; line-height: 1; } .gcn-locked-calib-label { position: absolute; top: 144mm; left: 0; right: 0; text-align: center; font: 7pt "Times New Roman", serif; color: #b91c1c; letter-spacing: 0.2mm; } .text-left { text-align: left; } .text-center { text-align: center; } .text-right { text-align: right; } /* Official print: marks + label hidden, offset still applied. */ body.gcn-print-mode-official .gcn-locked-calib-overlay, body.gcn-print-mode-official .gcn-locked-calib-mark, body.gcn-print-mode-official .gcn-locked-calib-label { display: none !important; visibility: hidden !important; }</style></head><body class="gcn-print-mode-${printMode}"><div class="gcn-locked-paper-calibrated">${clonedPaper.outerHTML}${marksHtml}</div></body></html>`;
  };

  const handlePrint = () => {
    const printHtml = buildPrintHtml('official', calibrationProfileView);
    if (!printHtml) return;
    const popup = window.open('', '_blank', 'width=800,height=600,scrollbars=no,toolbar=no,location=no,status=no,menubar=no');
    if (!popup) {
      alert('Trình duyệt chặn popup.');
      return;
    }
    popup.document.write(printHtml);
    popup.document.close();
    const originalFreeOffsets = { ...freeForm.fieldOffsets };
    popup.onafterprint = () => {
      setFreeForm((prev) => ({ ...prev, fieldOffsets: originalFreeOffsets }));
      popup.close();
      onPrinted?.();
    };
    setTimeout(() => {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
    }, 60_000);
    popup.onload = () => {
      setTimeout(() => {
        popup.print();
      }, 800);
    };
  };

  const handleTestPrint = () => {
    const printHtml = buildPrintHtml('calibration', calibrationProfileView);
    if (!printHtml) {
      flashCalibrationMsg('Chưa có bản xem trước để in test. Hãy chọn nguồn dữ liệu trước.', 'error');
      return;
    }
    const popup = window.open('', '_blank', 'width=800,height=600,scrollbars=no,toolbar=no,location=no,status=no,menubar=no');
    if (!popup) {
      alert('Trình duyệt chặn popup.');
      return;
    }
    popup.document.write(printHtml);
    popup.document.close();
    setTimeout(() => {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
    }, 60_000);
    popup.onload = () => {
      setTimeout(() => {
        popup.print();
      }, 800);
    };
  };

  const handleSaveCertificate = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !selectedContract || !contractEditable || sourceMode !== 'contract') return;
    if (!contractEditable.certificate_no?.trim()) {
      showToast('Cần nhập Số GCN trước khi lưu GCN.', 'error');
      return;
    }
    try {
      let certId = savedCertId;
      if (!certId) {
        const createRes = await createCertificateDraft(token, selectedContract.id, {
          client_confirmation: { clone_only_certificate_draft_confirmed: true },
          client_certificate_no: contractEditable.certificate_no || null,
        });
        if (!createRes.ok) {
          const errMsg =
            createRes.errors?.[0]?.message ||
            createRes.warnings?.find((warning: any) => warning.field === 'certificate_no')?.message ||
            createRes.warnings?.find((warning: any) => warning.field === 'feature_flag')?.message ||
            createRes.message ||
            'Không xác định được lỗi.';
          showToast(errMsg, 'error');
          return;
        }
        certId = createRes.created?.certificate_id ?? null;
        if (!certId) {
          showToast('Không lấy được certificate_id.', 'error');
          return;
        }
        setSavedCertId(certId);
        if (createRes.created?.certificate_no) {
          setContractEditable((prev) => (prev ? { ...prev, certificate_no: createRes.created!.certificate_no! } : null));
        }
        showToast(
          createRes.mode === 'existing_draft_reused'
            ? `Đã dùng lại bản nháp GCN #${certId}.`
            : `Đã lưu GCN #${certId} thành công.`,
          'success',
        );
      }
      const payload: CertificateUpdatePayload = {
        certificate_no: contractEditable.certificate_no || null,
        certificate_issue_date: contractEditable.certificate_issue_date || null,
        organization_name: contractEditable.organization_name || null,
        business_registration_no: contractEditable.business_registration_no || null,
        address: contractEditable.address || null,
        business_sign_name: contractEditable.business_sign_name || null,
        business_location: contractEditable.business_location || null,
        contract_no: contractEditable.contract_no || null,
        effective_from: contractEditable.effective_from || null,
        effective_to: contractEditable.effective_to || null,
        gcn_scope_col_1_text: contractEditable.gcn_scope_col_1_text || null,
        gcn_scope_col_2_text: contractEditable.gcn_scope_col_2_text || null,
        gcn_scope_col_3_text: contractEditable.gcn_scope_col_3_text || null,
        qr_image_data: contractEditable.qr_image_data || null,
        offset_x_mm: contractEditable.offset_x_mm,
        offset_y_mm: contractEditable.offset_y_mm,
      };
      const updateRes: CertificateUpdateResponse = await updateCertificate(token, certId, payload);
      if (updateRes.ok) {
        if (savedCertId) {
          showToast(
            updateRes.write_performed
              ? `Đã cập nhật GCN #${certId}.`
              : 'Thông tin GCN đã được cập nhật (read-only).',
            'success',
          );
        }
      } else {
        const errList = updateRes.errors && updateRes.errors.length > 0 ? updateRes.errors.join('\n') : '';
        showToast(errList ? `Lỗi:\n${errList}` : updateRes.message || 'Lỗi khi cập nhật GCN', 'error');
      }
    } catch (err: any) {
      showToast(String(err?.message || 'Lỗi khi lưu GCN'), 'error');
    }
  };

  const currentCertNo = activeEditable?.certificate_no || '';
  const hasCertNo = !!currentCertNo.trim();
  const printDisabled = !previewData;
  const printTitle = !previewData
    ? 'Chọn nguồn dữ liệu hoặc điền thông tin trước khi in.'
    : !hasCertNo
      ? 'Chưa có Số GCN — in sẽ ra bản chưa cấp số.'
      : 'In chính thức';
  const saveDisabled = !contractEditable || !hasCertNo || sourceMode !== 'contract';
  const saveTitle = sourceMode !== 'contract'
    ? 'Chỉ dữ liệu từ hợp đồng mới có thao tác lưu hệ thống.'
    : !contractEditable
      ? 'Chọn hợp đồng trước.'
      : !hasCertNo
        ? 'Cần nhập Số GCN trước khi lưu.'
        : 'Lưu / cập nhật GCN';

  const statusPill = (() => {
    if (sourceMode === 'external') {
      return { label: 'Dữ liệu ngoài · Không ghi hệ thống', tone: 'bg-lime-50 text-lime-700 ring-1 ring-lime-200' };
    }
    if (sourceMode === 'manual') {
      return { label: 'Tự nhập', tone: 'bg-zinc-100 text-zinc-700' };
    }
    if (!selectedContract) return null;
    if (!contractCtx && !contractCtxLoading) return null;
    if (contractCtxLoading) return { label: 'Đang tải…', tone: 'bg-zinc-100 text-zinc-600' };
    if (!hasCertNo) return { label: 'Chưa cấp số', tone: 'bg-zinc-100 text-zinc-700' };
    if (savedCertId) return { label: 'Đã cấp số · Sẵn sàng in', tone: 'bg-lime-50 text-lime-700 ring-1 ring-lime-200' };
    return { label: 'Đã có số GCN', tone: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
  })();

  const selectedSummaryItems: CompactSummaryItem[] = sourceMode === 'contract'
    ? [
        { label: 'Số HĐ', value: selectedContract?.contract_no || '', mono: true },
        { label: 'Đơn vị', value: selectedContract?.organization_name || '' },
        { label: 'Bảng hiệu', value: selectedContract?.business_sign_name || '' },
        { label: 'Lĩnh vực', value: selectedContract?.domain_group || '' },
        { label: 'Hiệu lực', value: `${contractEditable?.effective_from || '—'} → ${contractEditable?.effective_to || '—'}` },
        { label: 'Số GCN', value: hasCertNo ? 'Có số' : 'Chưa cấp số' },
        { label: 'QR', value: activeEditable?.qr_image_data ? 'Có QR' : 'Chưa QR' },
      ]
    : [];

  const sourceTabs = [
    { key: 'contract' as const, label: 'Từ hợp đồng', icon: FileTextIcon },
    { key: 'manual' as const, label: 'Tự nhập', icon: AwardIcon },
    { key: 'external' as const, label: 'Dán Excel', icon: FileTextIcon },
  ];

  return (
    <div className={embedded ? 'gcn-page flex flex-col gap-4 min-h-0 overflow-hidden' : 'gcn-page flex flex-col flex-1 h-full min-h-0 overflow-hidden'}>
      {/* ── Command bar: back + title + status + source tabs + actions ── */}
      <header className="gcn-commandbar">
        <div className="gcn-commandbar__row">
          {!embedded && (
            <button
              type="button"
              onClick={() => onNavigate('contracts.list')}
              title="Quay lại danh sách hợp đồng"
              className="gcn-iconbtn"
              aria-label="Quay lại"
            >
              <ArrowLeftIcon className="h-4.5 w-4.5" />
            </button>
          )}
          {!embedded && (
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-[15px] font-bold tracking-tight" style={{ color: 'var(--text-primary, #1f1d1a)' }}>In giấy chứng nhận</h1>
                {statusPill && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPill.tone}`}>{statusPill.label}</span>}
              </div>
              <p className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--text-muted, #8a847c)' }}>
                Cột trái: nguồn dữ liệu &amp; hiệu chỉnh · Cột phải: bản xem trước A4
              </p>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {sourceMode === 'contract' && (
              <Button variant="secondary" size="sm" onClick={!saveDisabled ? handleSaveCertificate : undefined} disabled={saveDisabled} title={saveTitle}>
                Lưu GCN
              </Button>
            )}
            <Button variant="primary" size="sm" leftIcon={<PrinterIcon className="h-4 w-4" />} onClick={!printDisabled ? handlePrint : undefined} disabled={printDisabled} title={printTitle}>
              In chính thức
            </Button>
          </div>
        </div>

        <div className="gcn-segmented" role="tablist" aria-label="Nguồn dữ liệu GCN">
          {sourceTabs.map((t) => {
            const Icon = t.icon;
            const active = sourceMode === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSourceMode(t.key)}
                className={`gcn-segmented__btn ${active ? 'is-active' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm ${messageType === 'success' ? 'bg-lime-50 text-lime-700 ring-1 ring-lime-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>{message}</div>
      )}

      {previewData && !hasCertNo && (
        <div className="gcn-notice">
          <span className="gcn-notice__dot" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Chỉ đang xem trước — chưa lưu GCN</p>
            <p className="mt-0.5 text-[12px] opacity-80">Bản xem trước chưa tạo dòng GCN trong cơ sở dữ liệu và chưa cấp số GCN. Vẫn có thể in nháp; nên cấp số trước khi in chính thức.</p>
          </div>
        </div>
      )}

      <div className="gcn-grid flex-1 min-h-0">
        {/* Left panel: tools, scrollable */}
        <div className="gcn-tools min-w-0">
          {sourceMode === 'contract' ? (
            <ContractSourcePanel
              search={contractSearch}
              onSearchChange={setContractSearch}
              results={contractResults}
              loading={contractLoading}
              selected={selectedContract}
              onSelect={handleSelectContract}
              ctx={contractCtx}
              ctxLoading={contractCtxLoading}
              editable={contractEditable}
              onEditableChange={setContractEditable}
              selectedSummaryItems={selectedSummaryItems}
              extStatus={extStatus}
              extVersion={extVersion}
              extLastChecked={extLastChecked}
              extSendMsg={extSendMsg}
              extSendMsgType={extSendMsgType}
              handleSendToExtension={handleSendToExtension}
              handleOpenPortalQR={handleOpenPortalQR}
              buildEditableFromCtx={buildEditableFromCtx}
              typographyOverrides={typographyOverrides}
              onUpdateTypography={updateTypography}
              onResetTypography={resetTypography}
              onResetAllTypography={resetAllTypography}
            />
          ) : sourceMode === 'manual' ? (
            <ManualSourcePanel
              freeForm={freeForm}
              updateFree={updateFree}
              updateFreeFieldOffset={updateFreeFieldOffset}
              resetFreeFieldOffset={resetFreeFieldOffset}
              resetAllFreeFieldOffsets={resetAllFreeFieldOffsets}
              extStatus={extStatus}
              extVersion={extVersion}
              extLastChecked={extLastChecked}
              extSendMsg={extSendMsg}
              extSendMsgType={extSendMsgType}
              handleSendToExtension={handleSendToExtension}
              handleOpenPortalQR={handleOpenPortalQR}
              typographyOverrides={typographyOverrides}
              onUpdateTypography={updateTypography}
              onResetTypography={resetTypography}
              onResetAllTypography={resetAllTypography}
            />
          ) : (
            <ExternalSourcePanel
              pasteValue={externalPasteValue}
              onPasteValueChange={setExternalPasteValue}
              onDownloadExcelTemplate={downloadExcelTemplate}
              onApplyExternalPaste={handleApplyExternalPaste}
              onClearExternal={handleClearExternal}
              previewRows={externalPreviewRows}
              rows={externalResults}
              externalSearch={externalSearch}
              onExternalSearchChange={setExternalSearch}
              selectedExternalRowId={selectedExternalRowId}
              onSelectExternalRow={handleSelectExternalRow}
              onLoadFirstRow={() => {
                if (externalRows[0]) handleSelectExternalRow(externalRows[0].id);
              }}
              editable={currentExternalRow}
              onUpdateExternalRow={updateExternalRow}
              incompleteRowCount={externalIncompleteRowCount}
              extStatus={extStatus}
              extVersion={extVersion}
              extLastChecked={extLastChecked}
              extSendMsg={extSendMsg}
              extSendMsgType={extSendMsgType}
              handleSendToExtension={handleSendToExtension}
              handleOpenPortalQR={handleOpenPortalQR}
              typographyOverrides={typographyOverrides}
              onUpdateTypography={updateTypography}
              onResetTypography={resetTypography}
              onResetAllTypography={resetAllTypography}
            />
          )}
        </div>

        {/* Right column: preview stage */}
        <div className="gcn-stage min-w-0">
          <section className="gcn-stage__card">
            <div className="gcn-stage__toolbar">
              <div className="gcn-zoomgroup" role="group" aria-label="Chế độ hiển thị">
                <button type="button" onClick={() => setZoomMode('fit-height')} className={`gcn-zoombtn ${previewZoom.mode === 'fit-height' ? 'is-active' : ''}`} title="Co vừa chiều cao khung xem">Fit cao</button>
                <button type="button" onClick={() => setZoomMode('fit-width')} className={`gcn-zoombtn ${previewZoom.mode === 'fit-width' ? 'is-active' : ''}`} title="Co vừa chiều rộng khung xem">Fit rộng</button>
                <button type="button" onClick={() => setZoomMode('actual-100')} className={`gcn-zoombtn ${previewZoom.mode === 'actual-100' ? 'is-active' : ''}`} title="Hiển thị đúng kích thước A4 thật">100%</button>
              </div>
              <div className="gcn-zoomgroup" role="group" aria-label="Phóng to thu nhỏ">
                <button type="button" onClick={zoomOut} disabled={effectiveScale <= PREVIEW_ZOOM_MIN + 0.001} className="gcn-zoomstep" title="Thu nhỏ" aria-label="Zoom out">−</button>
                <span className="gcn-zoomvalue">{Math.round(effectiveScale * 100)}%</span>
                <button type="button" onClick={zoomIn} disabled={effectiveScale >= PREVIEW_ZOOM_MAX - 0.001} className="gcn-zoomstep" title="Phóng to" aria-label="Zoom in">+</button>
              </div>
              <label className="gcn-toggle">
                <input type="checkbox" checked={showSafeArea} onChange={(e) => setShowSafeArea(e.target.checked)} />
                Hiện khung canh
              </label>
              <span className="gcn-stage__meta">A4 · 210 × 297 mm</span>
            </div>

            <div className="gcn-stage__scroll">
              {previewData ? (
                <div ref={paperShellRef as React.RefObject<HTMLDivElement>} className="gcn-paper-shell-wrap flex justify-center p-6">
                  <CertificatePaperPreview certificate={previewData} showSafeArea={showSafeArea} typographyOverrides={typographyOverrides} calibrationMode={calibrationMode} activeProfile={calibrationProfileView} screenZoom={previewZoom} />
                </div>
              ) : (
                <div className="gcn-stage__empty">
                  <span className="gcn-stage__empty-icon"><PrinterIcon className="h-6 w-6" /></span>
                  <p className="text-[13px] font-semibold">Chưa có dữ liệu xem trước</p>
                  <p className="max-w-xs text-center text-[12px] opacity-75">Chọn nguồn dữ liệu ở cột trái rồi nhập hoặc nạp hợp đồng để dựng bản in.</p>
                </div>
              )}
            </div>

            <div className="gcn-stage__footer">
              <span>
                {sourceMode === 'external'
                  ? 'Dữ liệu Excel chỉ dùng trong bộ nhớ tạm, không lưu lịch sử.'
                  : sourceMode === 'manual'
                    ? 'Tự nhập không ghi hệ thống; chỉ dùng cho bản in hiện tại.'
                    : 'GCN từ hợp đồng sẽ lưu nháp/cập nhật khi bấm “Lưu GCN”.'}
              </span>
              <span className="gcn-stage__footer-hint">Phóng to / thu nhỏ chỉ ảnh hưởng màn hình, không ảnh hưởng bản in.</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

type FieldOffsetMap = Record<string, { dx: number; dy: number }>;
const FIELD_DEFS = [
  { key: 'organization_name', label: 'Tên đơn vị' },
  { key: 'business_registration_no', label: 'MST/ĐKKD' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'business_sign_name', label: 'Bảng hiệu' },
  { key: 'business_location', label: 'Địa điểm SD' },
  { key: 'gcn_scope_col_1_text', label: 'Cột 1' },
  { key: 'gcn_scope_col_2_text', label: 'Cột 2' },
  { key: 'gcn_scope_col_3_text', label: 'Cột 3' },
  { key: 'contract_no', label: 'Số HĐ' },
  { key: 'effective_from', label: 'Ngày bắt đầu' },
  { key: 'effective_to', label: 'Ngày kết thúc' },
  { key: 'certificate_no', label: 'Số GCN' },
] as const;

function NumberStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" onClick={() => onChange(value - 1)} className="flex h-6 w-5 items-center justify-center rounded bg-zinc-100 text-xs font-bold text-zinc-500 hover:bg-amber-100 hover:text-amber-700 transition-colors">−</button>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} className="w-10 rounded border border-zinc-200 bg-white text-center text-xs text-zinc-700 focus:border-amber-500 focus:outline-none" />
      <button type="button" onClick={() => onChange(value + 1)} className="flex h-6 w-5 items-center justify-center rounded bg-zinc-100 text-xs font-bold text-zinc-500 hover:bg-amber-100 hover:text-amber-700 transition-colors">+</button>
    </div>
  );
}

type FieldNudgePanelProps = {
  fieldOffsets: FieldOffsetMap;
  onUpdate: (key: string, dx: number, dy: number) => void;
  onReset: (key: string) => void;
  onResetAll: () => void;
  typographyOverrides: CertificateTypographyOverrides;
  onUpdateTypography: (key: string, patch: { fontSizePt?: number | null; bold?: boolean | null }) => void;
  onResetTypography: (key: string) => void;
  onResetAllTypography: () => void;
};

const FONT_SIZE_STEP = 0.5;
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 13;

function FieldNudgePanel({ fieldOffsets, onUpdate, onReset, onResetAll, typographyOverrides, onUpdateTypography, onResetTypography, onResetAllTypography }: FieldNudgePanelProps) {
  const [open, setOpen] = useState(false);
  const modifiedCount = useMemo(() => FIELD_DEFS.filter((field) => {
    const fieldOffset = fieldOffsets[field.key];
    return fieldOffset && (fieldOffset.dx !== 0 || fieldOffset.dy !== 0);
  }).length, [fieldOffsets]);

  const typographyCount = Object.keys(typographyOverrides).length;

  return (
    <section>
      <button type="button" onClick={() => setOpen((openState) => !openState)} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm transition-colors hover:bg-zinc-100">
        <span className="flex items-center gap-1.5 font-semibold text-zinc-700">
          Dịch từng trường
          {modifiedCount > 0 && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">{modifiedCount}/{FIELD_DEFS.length}</span>}
          {typographyCount > 0 && <span className="rounded bg-lime-100 px-1.5 py-0.5 text-xs font-medium text-lime-700">TY:{typographyCount}</span>}
        </span>
        <span className="flex items-center gap-1 text-xs text-zinc-400"><span>1px ≈ 0,35mm</span><span className="text-zinc-300">·</span><span>A4</span></span>
        <ChevronDownIcon className={`ml-2 h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-zinc-200 divide-y divide-zinc-100">
          <div className="grid grid-cols-2 divide-x divide-zinc-100">
            <div>
              {FIELD_DEFS.slice(0, Math.ceil(FIELD_DEFS.length / 2)).map(({ key, label }) => {
                const fieldOffset = fieldOffsets[key] ?? { dx: 0, dy: 0 };
                const modified = fieldOffset.dx !== 0 || fieldOffset.dy !== 0;
                const typo = typographyOverrides[key];
                const hasTypography = typo != null;
                const currentPt = typo?.fontSizePt;
                return (
                  <div key={key} className="flex items-center gap-1 px-3 py-1.5 hover:bg-zinc-50 border-b border-zinc-100 last:border-b-0">
                    <span className="w-14 shrink-0 truncate text-[10px] text-zinc-600">{label}</span>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-400 shrink-0">
                      <span className="w-3 shrink-0">X</span><NumberStepper value={fieldOffset.dx} onChange={(dx) => onUpdate(key, dx, fieldOffset.dy)} />
                      <span className="w-3 shrink-0">Y</span><NumberStepper value={fieldOffset.dy} onChange={(dy) => onUpdate(key, fieldOffset.dx, dy)} />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => onUpdateTypography(key, { fontSizePt: currentPt != null ? Math.max(FONT_SIZE_MIN, currentPt - FONT_SIZE_STEP) : null })} className="flex h-5 w-4 items-center justify-center rounded border border-zinc-200 bg-white text-[9px] text-zinc-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-colors">−</button>
                      <span className="w-7 text-center text-[9px] text-zinc-500 leading-5">{currentPt != null ? `${currentPt}pt` : '—'}</span>
                      <button type="button" onClick={() => onUpdateTypography(key, { fontSizePt: currentPt != null ? Math.min(FONT_SIZE_MAX, currentPt + FONT_SIZE_STEP) : null })} className="flex h-5 w-4 items-center justify-center rounded border border-zinc-200 bg-white text-[9px] text-zinc-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-colors">+</button>
                    </div>
                    <button type="button" onClick={() => onUpdateTypography(key, { bold: typo?.bold ? null : true })} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[9px] font-bold transition-colors ${typo?.bold ? 'border-amber-400 bg-amber-100 text-amber-700' : 'border-zinc-200 bg-white text-zinc-300'}`} title="Bold">B</button>
                    <button type="button" onClick={() => onReset(key)} className={`ml-auto shrink-0 text-[10px] transition-colors ${modified ? 'text-zinc-400 hover:text-rose-500' : 'text-zinc-200 cursor-default'}`} disabled={!modified}>↺</button>
                    <button type="button" onClick={() => onResetTypography(key)} disabled={!hasTypography} className={`shrink-0 text-[10px] transition-colors ${hasTypography ? 'text-zinc-300 hover:text-rose-500' : 'text-zinc-100 cursor-default'}`} title="Reset typography">↺</button>
                  </div>
                );
              })}
            </div>
            <div>
              {FIELD_DEFS.slice(Math.ceil(FIELD_DEFS.length / 2)).map(({ key, label }) => {
                const fieldOffset = fieldOffsets[key] ?? { dx: 0, dy: 0 };
                const modified = fieldOffset.dx !== 0 || fieldOffset.dy !== 0;
                const typo = typographyOverrides[key];
                const hasTypography = typo != null;
                const currentPt = typo?.fontSizePt;
                return (
                  <div key={key} className="flex items-center gap-1 px-3 py-1.5 hover:bg-zinc-50 border-b border-zinc-100 last:border-b-0">
                    <span className="w-14 shrink-0 truncate text-[10px] text-zinc-600">{label}</span>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-400 shrink-0">
                      <span className="w-3 shrink-0">X</span><NumberStepper value={fieldOffset.dx} onChange={(dx) => onUpdate(key, dx, fieldOffset.dy)} />
                      <span className="w-3 shrink-0">Y</span><NumberStepper value={fieldOffset.dy} onChange={(dy) => onUpdate(key, fieldOffset.dx, dy)} />
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => onUpdateTypography(key, { fontSizePt: currentPt != null ? Math.max(FONT_SIZE_MIN, currentPt - FONT_SIZE_STEP) : null })} className="flex h-5 w-4 items-center justify-center rounded border border-zinc-200 bg-white text-[9px] text-zinc-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-colors">−</button>
                      <span className="w-7 text-center text-[9px] text-zinc-500 leading-5">{currentPt != null ? `${currentPt}pt` : '—'}</span>
                      <button type="button" onClick={() => onUpdateTypography(key, { fontSizePt: currentPt != null ? Math.min(FONT_SIZE_MAX, currentPt + FONT_SIZE_STEP) : null })} className="flex h-5 w-4 items-center justify-center rounded border border-zinc-200 bg-white text-[9px] text-zinc-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-colors">+</button>
                    </div>
                    <button type="button" onClick={() => onUpdateTypography(key, { bold: typo?.bold ? null : true })} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[9px] font-bold transition-colors ${typo?.bold ? 'border-amber-400 bg-amber-100 text-amber-700' : 'border-zinc-200 bg-white text-zinc-300'}`} title="Bold">B</button>
                    <button type="button" onClick={() => onReset(key)} className={`ml-auto shrink-0 text-[10px] transition-colors ${modified ? 'text-zinc-400 hover:text-rose-500' : 'text-zinc-200 cursor-default'}`} disabled={!modified}>↺</button>
                    <button type="button" onClick={() => onResetTypography(key)} disabled={!hasTypography} className={`shrink-0 text-[10px] transition-colors ${hasTypography ? 'text-zinc-300 hover:text-rose-500' : 'text-zinc-100 cursor-default'}`} title="Reset typography">↺</button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-50 rounded-b-lg border-t border-zinc-100">
            <span className="text-xs text-zinc-500">Quy đổi tham khảo: 1px ≈ 0,35mm trên A4</span>
            <div className="flex items-center gap-3">
              {typographyCount > 0 && <button type="button" onClick={onResetAllTypography} className="text-xs font-medium text-lime-600 hover:text-lime-800 transition-colors">Reset kiểu chữ ({typographyCount})</button>}
              {modifiedCount > 0 && <button type="button" onClick={onResetAll} className="text-xs font-medium text-amber-600 hover:text-amber-800 transition-colors">Reset vị trí ({modifiedCount})</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type SharedFormProps = {
  editable: EditableCertData;
  onEditableChange: (editable: EditableCertData) => void;
  extStatus: 'checking' | 'connected' | 'not_found';
  extVersion: string | null;
  extLastChecked: number | null;
  extSendMsg: string;
  extSendMsgType: 'success' | 'error' | 'info';
  handleSendToExtension: () => void;
  handleOpenPortalQR: () => void;
  warnings?: string[];
  isExternal?: boolean;
  hasEditsHint?: boolean;
  typographyOverrides: CertificateTypographyOverrides;
  onUpdateTypography: (key: string, patch: { fontSizePt?: number | null; bold?: boolean | null }) => void;
  onResetTypography: (key: string) => void;
  onResetAllTypography: () => void;
};

function CertificateEditableForm({ editable, onEditableChange, extStatus, extVersion, extLastChecked, extSendMsg, extSendMsgType, handleSendToExtension, handleOpenPortalQR, warnings, isExternal, hasEditsHint, typographyOverrides, onUpdateTypography, onResetTypography, onResetAllTypography }: SharedFormProps) {
  const update = <K extends keyof EditableCertData>(key: K, value: EditableCertData[K]) => {
    onEditableChange({ ...editable, [key]: value });
  };
  const updateFieldOffset = (key: string, dx: number, dy: number) => {
    onEditableChange({ ...editable, fieldOffsets: { ...editable.fieldOffsets, [key]: { dx, dy } } });
  };
  const resetFieldOffset = (key: string) => {
    const next = { ...editable.fieldOffsets };
    delete next[key];
    onEditableChange({ ...editable, fieldOffsets: next });
  };
  const resetAllFieldOffsets = () => onEditableChange({ ...editable, fieldOffsets: {} });

  return (
    <ContentCard title="Thông tin GCN (chỉnh sửa trực tiếp)">
      {hasEditsHint && <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"><span>⚠️ Đã chỉnh sửa — bản xem trước sẽ cập nhật ngay.</span></div>}
      {isExternal && <div className="mb-4 rounded-lg bg-lime-50 px-3 py-2 text-xs text-lime-700">Dữ liệu Excel chỉ dùng trong bộ nhớ tạm. Không có thao tác ghi DB.</div>}
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700">Thông tin GCN</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Số GCN" value={editable.certificate_no} onChange={(event) => update('certificate_no', event.target.value)} />
            <Input label="Ngày cấp" type="date" value={editable.certificate_issue_date} onChange={(event) => update('certificate_issue_date', event.target.value)} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700">Thông tin đơn vị</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Input label="Tên đơn vị" value={editable.organization_name} onChange={(event) => update('organization_name', event.target.value)} /></div>
            <Input label="MST/CCCD" value={editable.business_registration_no} onChange={(event) => update('business_registration_no', event.target.value)} />
            <Input label="Bảng hiệu" value={editable.business_sign_name} onChange={(event) => update('business_sign_name', event.target.value)} />
            <div className="sm:col-span-2"><Textarea label="Địa chỉ" value={editable.address} onChange={(event) => update('address', event.target.value)} rows={2} /></div>
            <div className="sm:col-span-2"><Textarea label="Địa điểm kinh doanh" value={editable.business_location} onChange={(event) => update('business_location', event.target.value)} rows={2} /></div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700">Hợp đồng & Hiệu lực</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Input label="Số hợp đồng" value={editable.contract_no} onChange={(event) => update('contract_no', event.target.value)} /></div>
            <Input label="Ngày bắt đầu" type="date" value={editable.effective_from} onChange={(event) => update('effective_from', event.target.value)} />
            <Input label="Ngày kết thúc" type="date" value={editable.effective_to} onChange={(event) => update('effective_to', event.target.value)} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700">Phạm vi sử dụng</h3>
          <Textarea label="Cột 1" value={editable.gcn_scope_col_1_text} onChange={(event) => update('gcn_scope_col_1_text', event.target.value)} rows={4} placeholder="VD: Phòng 101&#10;Phòng 102&#10;Phòng 103" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Textarea label="Cột 2" value={editable.gcn_scope_col_2_text} onChange={(event) => update('gcn_scope_col_2_text', event.target.value)} rows={3} />
            <Textarea label="Cột 3" value={editable.gcn_scope_col_3_text} onChange={(event) => update('gcn_scope_col_3_text', event.target.value)} rows={3} />
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-700">Căn chỉnh cơ bản</h3>
          <div className="grid grid-cols-3 gap-2">
            {(['col1', 'col2', 'col3'] as const).map((column) => (
              <div key={column} className="rounded-lg border border-zinc-200 p-2">
                <p className="text-xs text-zinc-500 mb-1.5">Cột {column.replace('col', '')}</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button key={align} type="button" onClick={() => update('scopeColAlign', { ...editable.scopeColAlign, [column]: align })} className={`rounded py-1 text-xs font-medium transition-colors ${editable.scopeColAlign[column] === align ? 'bg-amber-700 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-amber-50'}`}>
                      {align === 'left' ? '⬅' : align === 'center' ? '⬜' : '➡'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-700">Dịch vị trí in (toàn trang)</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Dịch ngang (mm)" type="number" step={GCN_LOCKED_OFFSET.stepMm} value={String(editable.offset_x_mm)} onChange={(event) => update('offset_x_mm', Number(event.target.value) || 0)} />
            <Input label="Dịch dọc (mm)" type="number" step={GCN_LOCKED_OFFSET.stepMm} value={String(editable.offset_y_mm)} onChange={(event) => update('offset_y_mm', Number(event.target.value) || 0)} />
          </div>
          <p className="text-[11px] text-zinc-500">Offset ở đây chỉ áp dụng cho bản xem trước trên màn hình. Để canh giấy thật theo máy in, dùng bảng <b>Canh giấy theo máy in</b> bên dưới.</p>
        </section>

        <FieldNudgePanel
          fieldOffsets={editable.fieldOffsets}
          onUpdate={updateFieldOffset}
          onReset={resetFieldOffset}
          onResetAll={resetAllFieldOffsets}
          typographyOverrides={typographyOverrides}
          onUpdateTypography={onUpdateTypography}
          onResetTypography={onResetTypography}
          onResetAllTypography={onResetAllTypography}
        />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700">QR</h3>
          <QrUploadZone value={editable.qr_image_data} onChange={(data) => update('qr_image_data', data)} />
        </section>

        <QrHelperExtensionPanel extStatus={extStatus} extVersion={extVersion} extLastChecked={extLastChecked} extSendMsg={extSendMsg} extSendMsgType={extSendMsgType} handleSendToExtension={handleSendToExtension} handleOpenPortalQR={handleOpenPortalQR} />

        {warnings && warnings.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      </div>
    </ContentCard>
  );
}

type ContractSourcePanelProps = {
  search: string;
  onSearchChange: (value: string) => void;
  results: SimpleContractItem[];
  loading: boolean;
  selected: SimpleContractItem | null;
  onSelect: (contract: SimpleContractItem) => void;
  ctx: CertificatePreviewContext | null;
  ctxLoading: boolean;
  editable: EditableCertData | null;
  onEditableChange: (editable: EditableCertData | null) => void;
  selectedSummaryItems: CompactSummaryItem[];
  extStatus: 'checking' | 'connected' | 'not_found';
  extVersion: string | null;
  extLastChecked: number | null;
  extSendMsg: string;
  extSendMsgType: 'success' | 'error' | 'info';
  handleSendToExtension: () => void;
  handleOpenPortalQR: () => void;
  buildEditableFromCtx: (ctx: CertificatePreviewContext) => EditableCertData;
  typographyOverrides: CertificateTypographyOverrides;
  onUpdateTypography: (key: string, patch: { fontSizePt?: number | null; bold?: boolean | null }) => void;
  onResetTypography: (key: string) => void;
  onResetAllTypography: () => void;
};

function ContractSourcePanel({ search, onSearchChange, results, loading, selected, onSelect, ctx, ctxLoading, editable, onEditableChange, selectedSummaryItems, extStatus, extVersion, extLastChecked, extSendMsg, extSendMsgType, handleSendToExtension, handleOpenPortalQR, buildEditableFromCtx, typographyOverrides, onUpdateTypography, onResetTypography, onResetAllTypography }: ContractSourcePanelProps) {
  const hasEdits = editable && ctx && JSON.stringify(editable) !== JSON.stringify(buildEditableFromCtx(ctx));

  return (
    <div className="space-y-5">
      <ContentCard title="Tìm hợp đồng">
        <div className="space-y-3">
          <SearchBox value={search} onChange={onSearchChange} placeholder="Tìm số hợp đồng, tên đơn vị, bảng hiệu..." />
          {loading && <p className="text-sm text-zinc-500">Đang tìm...</p>}
          {results.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100 max-h-64 overflow-y-auto">
              {results.map((contract) => (
                <button key={contract.id} type="button" onClick={() => onSelect(contract)} className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition-colors">
                  <p className="text-[13px] font-medium text-zinc-900">{contract.organization_name || '(Chưa có tên)'}</p>
                  <p className="text-xs text-zinc-500">Số HĐ: {contract.contract_no || '—'} · Bảng hiệu: {contract.business_sign_name || '—'} · Chưa cấp số</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </ContentCard>

      {selected && (
        <ContentCard title="Hợp đồng đang chọn">
          <div className="space-y-0">
            {selectedSummaryItems.map((item) => <InfoRow key={item.label} label={item.label} value={item.value} mono={item.mono} />)}
          </div>
        </ContentCard>
      )}

      {ctxLoading && <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">Đang tải context GCN...</div>}

      {editable && (
        <CertificateEditableForm
          editable={editable}
          onEditableChange={(next) => onEditableChange(next)}
          extStatus={extStatus}
          extVersion={extVersion}
          extLastChecked={extLastChecked}
          extSendMsg={extSendMsg}
          extSendMsgType={extSendMsgType}
          handleSendToExtension={handleSendToExtension}
          handleOpenPortalQR={handleOpenPortalQR}
          warnings={ctx?.warnings}
          hasEditsHint={!!hasEdits}
          typographyOverrides={typographyOverrides}
          onUpdateTypography={onUpdateTypography}
          onResetTypography={onResetTypography}
          onResetAllTypography={onResetAllTypography}
        />
      )}
    </div>
  );
}

type ManualSourcePanelProps = {
  freeForm: FreeFormData;
  updateFree: <K extends keyof FreeFormData>(key: K, value: FreeFormData[K]) => void;
  updateFreeFieldOffset: (key: string, dx: number, dy: number) => void;
  resetFreeFieldOffset: (key: string) => void;
  resetAllFreeFieldOffsets: () => void;
  extStatus: 'checking' | 'connected' | 'not_found';
  extVersion: string | null;
  extLastChecked: number | null;
  extSendMsg: string;
  extSendMsgType: 'success' | 'error' | 'info';
  handleSendToExtension: () => void;
  handleOpenPortalQR: () => void;
  typographyOverrides: CertificateTypographyOverrides;
  onUpdateTypography: (key: string, patch: { fontSizePt?: number | null; bold?: boolean | null }) => void;
  onResetTypography: (key: string) => void;
  onResetAllTypography: () => void;
};

function ManualSourcePanel({ freeForm, updateFree, extStatus, extVersion, extLastChecked, extSendMsg, extSendMsgType, handleSendToExtension, handleOpenPortalQR, typographyOverrides, onUpdateTypography, onResetTypography, onResetAllTypography }: ManualSourcePanelProps) {
  return (
    <div className="space-y-5">
      <ContentCard title="Nguồn dữ liệu tự nhập">
        <p className="text-sm text-zinc-600">Nhập trực tiếp thông tin GCN, không tìm hợp đồng.</p>
      </ContentCard>
      <CertificateEditableForm
        editable={freeForm}
        onEditableChange={(next) => updateFree('certificate_no', next.certificate_no) || updateFree('certificate_issue_date', next.certificate_issue_date) || updateFree('organization_name', next.organization_name) || updateFree('business_registration_no', next.business_registration_no) || updateFree('address', next.address) || updateFree('business_sign_name', next.business_sign_name) || updateFree('business_location', next.business_location) || updateFree('contract_no', next.contract_no) || updateFree('effective_from', next.effective_from) || updateFree('effective_to', next.effective_to) || updateFree('gcn_scope_col_1_text', next.gcn_scope_col_1_text) || updateFree('gcn_scope_col_2_text', next.gcn_scope_col_2_text) || updateFree('gcn_scope_col_3_text', next.gcn_scope_col_3_text) || updateFree('qr_image_data', next.qr_image_data) || updateFree('offset_x_mm', next.offset_x_mm) || updateFree('offset_y_mm', next.offset_y_mm) || updateFree('fieldOffsets', next.fieldOffsets) || updateFree('scopeColAlign', next.scopeColAlign)}
        extStatus={extStatus}
        extVersion={extVersion}
        extLastChecked={extLastChecked}
        extSendMsg={extSendMsg}
        extSendMsgType={extSendMsgType}
        handleSendToExtension={handleSendToExtension}
        handleOpenPortalQR={handleOpenPortalQR}
        typographyOverrides={typographyOverrides}
        onUpdateTypography={onUpdateTypography}
        onResetTypography={onResetTypography}
        onResetAllTypography={onResetAllTypography}
      />
    </div>
  );
}

type ExternalSourcePanelProps = {
  pasteValue: string;
  onPasteValueChange: (value: string) => void;
  onDownloadExcelTemplate: () => void;
  onApplyExternalPaste: () => void;
  onClearExternal: () => void;
  previewRows: ExternalCertificateRow[];
  rows: ExternalCertificateRow[];
  externalSearch: string;
  onExternalSearchChange: (value: string) => void;
  selectedExternalRowId: string | null;
  onSelectExternalRow: (rowId: string) => void;
  onLoadFirstRow: () => void;
  editable: ExternalCertificateRow | null;
  onUpdateExternalRow: (rowId: string, updater: (row: ExternalCertificateRow) => ExternalCertificateRow) => void;
  extStatus: 'checking' | 'connected' | 'not_found';
  extVersion: string | null;
  extLastChecked: number | null;
  extSendMsg: string;
  extSendMsgType: 'success' | 'error' | 'info';
  handleSendToExtension: () => void;
  handleOpenPortalQR: () => void;
  typographyOverrides: CertificateTypographyOverrides;
  onUpdateTypography: (key: string, patch: { fontSizePt?: number | null; bold?: boolean | null }) => void;
  onResetTypography: (key: string) => void;
  onResetAllTypography: () => void;
  incompleteRowCount: number;
};

function ExternalSourcePanel({ pasteValue, onPasteValueChange, onDownloadExcelTemplate, onApplyExternalPaste, onClearExternal, previewRows, rows, externalSearch, onExternalSearchChange, selectedExternalRowId, onSelectExternalRow, onLoadFirstRow, editable, onUpdateExternalRow, extStatus, extVersion, extLastChecked, extSendMsg, extSendMsgType, handleSendToExtension, handleOpenPortalQR, typographyOverrides, onUpdateTypography, onResetTypography, onResetAllTypography, incompleteRowCount }: ExternalSourcePanelProps) {
  return (
    <div className="space-y-5">
      <ContentCard title="Dán dữ liệu Excel">
        <div className="space-y-3">
          <div className="rounded-lg bg-lime-50 px-3 py-2 text-xs text-lime-700">Dữ liệu ngoài — không ghi hệ thống.</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onDownloadExcelTemplate}>Tải mẫu Excel</Button>
            <Button variant="secondary" size="sm" onClick={onClearExternal}>Xóa</Button>
            <Button variant="primary" size="sm" onClick={onLoadFirstRow}>Nạp vào form</Button>
          </div>
          <Textarea
            label="Dữ liệu Excel"
            value={pasteValue}
            onChange={(event) => onPasteValueChange(event.target.value)}
            rows={10}
            placeholder="Copy dữ liệu từ file mẫu Excel rồi dán vào đây, gồm cả dòng tiêu đề."
          />
          {incompleteRowCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Một số dòng thiếu cột, vui lòng kiểm tra ({incompleteRowCount} dòng).
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={onApplyExternalPaste}>Nạp vào form</Button>
            <Button variant="secondary" size="sm" onClick={onDownloadExcelTemplate}>Tải mẫu Excel</Button>
          </div>
          {previewRows.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
              <div className="px-3 py-2 border-b border-zinc-100 text-xs font-medium text-zinc-600">Xem nhanh dữ liệu đã nhận</div>
              <div className="divide-y divide-zinc-100">
                {previewRows.map((row) => (
                  <div key={row.id} className="px-3 py-2 text-xs text-zinc-600">
                    <p className="font-medium text-zinc-800">{row.organization_name || row.sourceLabel}</p>
                    <p>Số HĐ: {row.contract_no || '—'} · Số GCN: {row.certificate_no || '—'} · Bảng hiệu: {row.business_sign_name || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ContentCard>

      {rows.length > 0 && (
        <ContentCard title="Chọn dòng đã dán">
          <div className="space-y-3">
            <SearchBox value={externalSearch} onChange={onExternalSearchChange} placeholder="Tìm trong dữ liệu Excel..." />
            <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100 max-h-56 overflow-y-auto">
              {rows.map((row) => (
                <button key={row.id} type="button" onClick={() => onSelectExternalRow(row.id)} className={`w-full px-3 py-2.5 text-left transition-colors ${selectedExternalRowId === row.id ? 'bg-lime-50' : 'hover:bg-lime-50/70'}`}>
                  <p className="text-[13px] font-medium text-zinc-900">{row.organization_name || row.sourceLabel}</p>
                  <p className="text-xs text-zinc-500">Số HĐ: {row.contract_no || '—'} · Bảng hiệu: {row.business_sign_name || '—'} · {row.certificate_no ? 'Có số' : 'Chưa cấp số'}</p>
                </button>
              ))}
            </div>
          </div>
        </ContentCard>
      )}

      {editable && (
        <CertificateEditableForm
          editable={editable}
          onEditableChange={(next) => onUpdateExternalRow(editable.id, () => ({ ...editable, ...next }))}
          extStatus={extStatus}
          extVersion={extVersion}
          extLastChecked={extLastChecked}
          extSendMsg={extSendMsg}
          extSendMsgType={extSendMsgType}
          handleSendToExtension={handleSendToExtension}
          handleOpenPortalQR={handleOpenPortalQR}
          isExternal
          typographyOverrides={typographyOverrides}
          onUpdateTypography={onUpdateTypography}
          onResetTypography={onResetTypography}
          onResetAllTypography={onResetAllTypography}
        />
      )}
    </div>
  );
}

function QrUploadZone({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);

  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPreview(dataUrl);
      onChange(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragging ? 'border-amber-500 bg-amber-50' : preview ? 'border-lime-300 bg-lime-50/50' : 'border-zinc-300 bg-zinc-50 hover:border-amber-300 hover:bg-amber-50/30'}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) processFile(file); }}>
        {preview ? (
          <div className="flex flex-col items-center gap-3">
            <img src={preview} alt="QR preview" className="h-24 w-24 object-contain rounded" />
            <button type="button" onClick={() => { setPreview(null); onChange(''); }} className="text-xs text-danger hover:text-danger/80 hover:underline">Xóa ảnh QR</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-zinc-500">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200"><svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
            <p className="font-medium text-zinc-700">Kéo & thả ảnh QR vào đây</p>
            <p>hoặc</p>
            <label className="cursor-pointer rounded-lg bg-amber-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-800">Chọn file<input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) processFile(file); }} /></label>
          </div>
        )}
      </div>
      {preview && <p className="text-xs text-lime-600 flex items-center gap-1"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Đã tải ảnh QR thành công</p>}
    </div>
  );
}

type QrHelperPanelProps = {
  extStatus: 'checking' | 'connected' | 'not_found';
  extVersion: string | null;
  extLastChecked: number | null;
  extSendMsg: string;
  extSendMsgType: 'success' | 'error' | 'info';
  handleSendToExtension: () => void;
  handleOpenPortalQR: () => void;
};

function QrHelperExtensionPanel({ extStatus, extVersion, extLastChecked, extSendMsg, extSendMsgType, handleSendToExtension, handleOpenPortalQR }: QrHelperPanelProps) {
  const isConnected = extStatus === 'connected';
  const isChecking = extStatus === 'checking';
  const isNotFound = extStatus === 'not_found';

  const handleOpenExtensions = () => { window.open('chrome://extensions', '_blank'); };
  const handleReloadPage = () => { window.location.reload(); };

  return (
    <div className="rounded-lg border border-lime-200 bg-lime-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-lime-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
        <p className="text-[13px] font-medium text-lime-800">QR Portal Assistant</p>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded ${
          isConnected ? 'bg-lime-100 text-lime-700' :
          isChecking ? 'bg-zinc-100 text-zinc-500' :
          'bg-amber-100 text-amber-700'
        }`}>
          {isConnected ? 'Đã kết nối' : isChecking ? 'Đang kiểm tra...' : 'Extension chưa kết nối'}
        </span>
      </div>

      {isConnected && extVersion && (
        <div className="flex items-center gap-2 text-[11px] text-lime-600">
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>Extension v{extVersion} đang hoạt động</span>
        </div>
      )}

      {!isConnected && !isChecking && (
        <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 space-y-1.5">
          <p className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            QR Portal dùng được. Extension tự gửi dữ liệu chưa kết nối.
          </p>
          <p className="text-amber-600">Có thể mở QR Portal và thao tác thủ công, hoặc cài extension để gửi tự động.</p>
        </div>
      )}

      {isNotFound && (
        <details className="rounded bg-zinc-100 border border-zinc-200 text-xs text-zinc-600">
          <summary className="px-3 py-2 cursor-pointer font-medium hover:bg-zinc-200 rounded">
            Hướng dẫn cài QR Portal Assistant
          </summary>
          <div className="px-3 py-2 space-y-1.5 border-t border-zinc-200">
            <p>1. Copy folder <code className="font-mono bg-zinc-200 px-1 rounded">vcpmc-qr-helper-v2</code> từ bộ cài app.</p>
            <p>2. Mở Chrome → <button type="button" onClick={handleOpenExtensions} className="font-mono bg-zinc-200 px-1 rounded hover:underline">chrome://extensions</button> → Bật <strong>Developer mode</strong></p>
            <p>3. Nhấn <strong>&quot;Load unpacked&quot;</strong> → Chọn folder <code className="font-mono bg-zinc-200 px-1 rounded">vcpmc-qr-helper-v2</code></p>
            <p>4. <button type="button" onClick={handleReloadPage} className="font-semibold hover:underline">Tải lại trang này</button> sau khi cài xong.</p>
          </div>
        </details>
      )}

      <div className="flex gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => handleSendToExtension?.()}
          disabled={isNotFound}
          className={`flex-1 rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
            isConnected
              ? 'bg-lime-600 text-white hover:bg-lime-700'
              : isChecking
                ? 'bg-lime-400 text-white hover:bg-lime-500'
                : 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
          }`}
          title={isNotFound ? 'Cần cài extension trước' : ''}
        >
          {isChecking ? 'Đang kết nối...' : 'Gửi dữ liệu sang QR Portal Assistant'}
        </button>
        <button type="button" onClick={() => handleOpenPortalQR?.()} className="rounded border border-lime-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-lime-700 hover:bg-lime-50 transition-colors">
          Mở QR Portal
        </button>
      </div>
      {extSendMsg && (
        <div className={`rounded px-2.5 py-1.5 text-xs ${
          extSendMsgType === 'success' ? 'bg-lime-100 text-lime-700' :
          extSendMsgType === 'error' ? 'bg-rose-100 text-rose-700' :
          'bg-lime-100 text-lime-700'
        }`}>
          {extSendMsg}
        </div>
      )}
    </div>
  );
}
function InfoRow({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="flex flex-row gap-3 py-1.5 text-[13px]">
      <span className="text-[11px] font-medium text-fg-muted shrink-0 w-[92px] min-w-[92px]">{label}</span>
      <span className={`font-medium min-w-0 break-words whitespace-normal ${mono ? 'font-mono tabular-nums' : ''} ${!value ? 'text-fg-muted italic' : 'text-fg-primary'}`}>{display}</span>
    </div>
  );
}

type CalibrationPanelProps = {
  mode: CalibrationMode;
  onModeChange: (next: CalibrationMode) => void;
  profile: PrintCalibrationProfile | null;
  nameInput: string;
  onNameInputChange: (value: string) => void;
  offsetXInput: string;
  onOffsetXInputChange: (value: string) => void;
  offsetYInput: string;
  onOffsetYInputChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
  onTestPrint: () => void;
  message: string;
  messageType: 'success' | 'error' | 'info';
};

function CalibrationPanel({
  mode,
  onModeChange,
  profile,
  nameInput,
  onNameInputChange,
  offsetXInput,
  onOffsetXInputChange,
  offsetYInput,
  onOffsetYInputChange,
  onSave,
  onReset,
  onTestPrint,
  message,
  messageType,
}: CalibrationPanelProps) {
  const offsetXTone = mode === 'on' ? 'text-amber-700' : 'text-zinc-500';
  return (
    <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-700">Canh giấy theo máy in</h3>
        <label className="flex items-center gap-2 text-[11px] font-medium text-zinc-600">
          <span>Chế độ canh giấy</span>
          <button
            type="button"
            role="switch"
            aria-checked={mode === 'on'}
            onClick={() => onModeChange(mode === 'on' ? 'off' : 'on')}
            className={`relative h-5 w-9 rounded-full transition-colors ${mode === 'on' ? 'bg-amber-600' : 'bg-zinc-300'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${mode === 'on' ? 'translate-x-4' : ''}`}
            />
          </button>
        </label>
      </div>

      <p className="text-[11px] text-zinc-500">
        Lưu offset theo máy in + trình duyệt. Bản in chính thức luôn dùng offset này, không bao giờ hiển thị dấu &quot;+&quot;. Bản in test sẽ in 5 dấu canh (TL, TR, C, BL, BR) và nhãn TEST.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Tên cấu hình" value={nameInput} onChange={(event) => onNameInputChange(event.target.value)} placeholder="VD: HP-LaserJet-Tầng-3" />
        <Input label="Offset X (mm)" type="number" step={0.1} value={offsetXInput} onChange={(event) => onOffsetXInputChange(event.target.value)} />
        <Input label="Offset Y (mm)" type="number" step={0.1} value={offsetYInput} onChange={(event) => onOffsetYInputChange(event.target.value)} />
      </div>

      <div className={`text-[11px] font-mono tabular-nums ${offsetXTone}`}>
        Offset hiện tại: X={profile?.offsetXmm ?? 0}mm · Y={profile?.offsetYmm ?? 0}mm · profile: {profile?.name || 'Default'} · paper: {profile?.paperType || 'A4'}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={onTestPrint}>
          In test có dấu +
        </Button>
        <Button variant="secondary" size="sm" onClick={onSave}>
          Lưu cấu hình
        </Button>
        <Button variant="secondary" size="sm" onClick={onReset}>
          Reset về 0
        </Button>
      </div>

      {message ? (
        <div
          className={`rounded-md px-2.5 py-1.5 text-[11px] ${
            messageType === 'success'
              ? 'bg-lime-100 text-lime-700'
              : messageType === 'error'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          {message}
        </div>
      ) : null}

      <ul className="text-[10.5px] text-zinc-500 list-disc pl-4 space-y-0.5">
        <li>Trước khi in test: tắt Scale của trình duyệt (đặt 100%), tắt &quot;Fit to page&quot; của driver, chọn khổ giấy đúng.</li>
        <li>Sau khi canh xong, nhớ tắt <b>Chế độ canh giấy</b> rồi mới bấm <b>In chính thức</b>.</li>
        <li>Mỗi máy in / trình duyệt cần một cấu hình riêng.</li>
      </ul>
    </section>
  );
}
