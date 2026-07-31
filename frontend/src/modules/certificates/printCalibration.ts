/**
 * Print calibration — Phase 1.
 *
 * Stores per-(template, paper, printer) offset profiles in localStorage.
 * Profiles are machine/browser/driver specific, so they never go to DB.
 */

export type PrintCalibrationProfile = {
  id: string;
  name: string;
  printerName?: string;
  paperType: string;
  templateType: string;
  offsetXmm: number;
  offsetYmm: number;
  /** Phase 2 — always 1 in v1. */
  scaleX?: number;
  /** Phase 2 — always 1 in v1. */
  scaleY?: number;
  updatedAt: number;
};

export const PRINT_CALIBRATION_STORAGE_KEY = 'vcpmc.printCalibration.v1';
export const PRINT_CALIBRATION_ACTIVE_KEY = 'vcpmc.printCalibration.v1.active';
export const PRINT_CALIBRATION_MODE_KEY = 'vcpmc.printCalibration.v1.activeMode';

export const DEFAULT_PAPER_TYPE = 'A4';
export const DEFAULT_TEMPLATE_TYPE = 'gcn-locked';
export const DEFAULT_PROFILE_NAME = 'Default';

export const PAPER_DIMENSIONS_MM: Record<string, { width: number; height: number }> = {
  A4: { width: 209.6, height: 296.6 },
  'Certificate-209.6x296.6': { width: 209.6, height: 296.6 },
};

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && isFinite(n);

const sanitizeProfile = (raw: any): PrintCalibrationProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  const offsetXmm = isFiniteNumber(raw.offsetXmm) ? raw.offsetXmm : 0;
  const offsetYmm = isFiniteNumber(raw.offsetYmm) ? raw.offsetYmm : 0;
  return {
    id,
    name: String(raw.name || DEFAULT_PROFILE_NAME),
    printerName: raw.printerName ? String(raw.printerName) : undefined,
    paperType: String(raw.paperType || DEFAULT_PAPER_TYPE),
    templateType: String(raw.templateType || DEFAULT_TEMPLATE_TYPE),
    offsetXmm: Math.max(-50, Math.min(50, offsetXmm)),
    offsetYmm: Math.max(-50, Math.min(50, offsetYmm)),
    scaleX: isFiniteNumber(raw.scaleX) ? raw.scaleX : 1,
    scaleY: isFiniteNumber(raw.scaleY) ? raw.scaleY : 1,
    updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
};

export const readProfiles = (): PrintCalibrationProfile[] => {
  try {
    const raw = localStorage.getItem(PRINT_CALIBRATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeProfile).filter((p): p is PrintCalibrationProfile => p !== null);
  } catch {
    return [];
  }
};

export const writeProfiles = (profiles: PrintCalibrationProfile[]) => {
  try {
    localStorage.setItem(PRINT_CALIBRATION_STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
};

export const readActiveProfile = (): PrintCalibrationProfile | null => {
  const profiles = readProfiles();
  if (profiles.length === 0) return null;
  let activeId: string | null = null;
  try {
    const raw = localStorage.getItem(PRINT_CALIBRATION_ACTIVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
        activeId = parsed.id;
      }
    }
  } catch {
    /* ignore */
  }
  if (activeId) {
    const match = profiles.find((p) => p.id === activeId);
    if (match) return match;
  }
  return profiles[0];
};

export const setActiveProfileId = (id: string) => {
  try {
    localStorage.setItem(PRINT_CALIBRATION_ACTIVE_KEY, JSON.stringify({ id }));
  } catch {
    /* ignore */
  }
};

export const readCalibrationMode = (): boolean => {
  try {
    return localStorage.getItem(PRINT_CALIBRATION_MODE_KEY) === '1';
  } catch {
    return false;
  }
};

export const writeCalibrationMode = (on: boolean) => {
  try {
    localStorage.setItem(PRINT_CALIBRATION_MODE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
};

const generateId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `pcal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const upsertProfile = (
  profile: Partial<PrintCalibrationProfile> & { name?: string; paperType?: string; templateType?: string }
): PrintCalibrationProfile => {
  const profiles = readProfiles();
  const now = Date.now();
  const existingId = profile.id;
  const base: PrintCalibrationProfile = {
    id: existingId || generateId(),
    name: profile.name ?? DEFAULT_PROFILE_NAME,
    printerName: profile.printerName,
    paperType: profile.paperType ?? DEFAULT_PAPER_TYPE,
    templateType: profile.templateType ?? DEFAULT_TEMPLATE_TYPE,
    offsetXmm: isFiniteNumber(profile.offsetXmm) ? profile.offsetXmm : 0,
    offsetYmm: isFiniteNumber(profile.offsetYmm) ? profile.offsetYmm : 0,
    scaleX: isFiniteNumber(profile.scaleX) ? profile.scaleX : 1,
    scaleY: isFiniteNumber(profile.scaleY) ? profile.scaleY : 1,
    updatedAt: now,
  };
  const idx = profiles.findIndex((p) => p.id === base.id);
  if (idx >= 0) profiles[idx] = base;
  else profiles.push(base);
  writeProfiles(profiles);
  setActiveProfileId(base.id);
  return base;
};

export const ensureDefaultProfile = (): PrintCalibrationProfile => {
  const existing = readActiveProfile();
  if (existing) return existing;
  const created = upsertProfile({
    name: DEFAULT_PROFILE_NAME,
    paperType: DEFAULT_PAPER_TYPE,
    templateType: DEFAULT_TEMPLATE_TYPE,
    offsetXmm: 0,
    offsetYmm: 0,
  });
  return created;
};

export const resetActiveProfileOffsets = (): PrintCalibrationProfile => {
  const active = readActiveProfile();
  if (!active) {
    return ensureDefaultProfile();
  }
  return upsertProfile({
    ...active,
    offsetXmm: 0,
    offsetYmm: 0,
  });
};

/**
 * Registration "+" mark positions for the standard A4/certificate paper
 * (209.6 × 296.6 mm). Each mark is 10 mm inboard from the page corner.
 */
export const CALIB_MARK_POSITIONS = [
  { key: 'TL', label: 'TL', x: 10, y: 10 },
  { key: 'TR', label: 'TR', x: 200, y: 10 },
  { key: 'C', label: 'C', x: 105, y: 148.5 },
  { key: 'BL', label: 'BL', x: 10, y: 287 },
  { key: 'BR', label: 'BR', x: 200, y: 287 },
] as const;

export type CalibMarkKey = (typeof CALIB_MARK_POSITIONS)[number]['key'];
