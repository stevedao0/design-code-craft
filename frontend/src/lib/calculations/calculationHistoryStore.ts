/**
 * Local registry of confirmed calculation snapshots used by the
 * "Lịch sử bảng tính" page.
 *
 * The calculator page confirms a snapshot by calling
 * `recordSnapshot(snapshot)` from calculationSnapshotAdapter. Snapshots are
 * stored in localStorage so that the history view can show them after the
 * user closes/reopens the tab. Excel-export events are timestamped here.
 *
 * This is frontend persistence only — the Word/DOCX export flow remains
 * the source of truth for confirmed numbers.
 */

import type { CalculationSnapshot } from '../../components/calculations/calculationTypes';

const STORAGE_KEY = 'vcpmc:royalty-calculation-history:v1';

function readRaw(): unknown {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRaw(value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

export function loadSnapshots(): CalculationSnapshot[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCalculationSnapshotShape);
}

function isCalculationSnapshotShape(v: unknown): v is CalculationSnapshot {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.calculationCode === 'string' &&
    typeof obj.createdAtIso === 'string' &&
    typeof obj.legalEntityName === 'string' &&
    Array.isArray(obj.locations)
  );
}

export function recordSnapshot(snapshot: CalculationSnapshot): void {
  const all = loadSnapshots();
  const idx = all.findIndex((s) => s.id === snapshot.id);
  if (idx >= 0) all[idx] = snapshot;
  else all.unshift(snapshot);
  // Cap registry at 200 entries.
  const trimmed = all.slice(0, 200);
  writeRaw(trimmed);
}

export function dropSnapshot(snapshotId: string): void {
  const all = loadSnapshots();
  const next = all.filter((s) => s.id !== snapshotId);
  writeRaw(next);
}

export function markExcelExported(snapshotId: string): void {
  const all = loadSnapshots();
  const idx = all.findIndex((s) => s.id === snapshotId);
  if (idx < 0) return;
  const target = all[idx];
  all[idx] = {
    ...target,
    excelExportedAt: new Date().toISOString(),
  };
  writeRaw(all);
}

export function updateVerification(
  snapshotId: string,
  status: 'confirmed' | 'review_required'
): void {
  const all = loadSnapshots();
  const idx = all.findIndex((s) => s.id === snapshotId);
  if (idx < 0) return;
  const target = all[idx];
  all[idx] = { ...target, verificationStatus: status };
  writeRaw(all);
}
