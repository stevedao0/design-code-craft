import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';

export type LayoutMode = 'command-center' | 'sidebar';

const STORAGE_PREFIX = 'vcpmc.layoutMode.v1';

function storageKey(userId: string | null | undefined): string {
  // Per-user namespace so switching accounts in the same browser does not
  // leak one user's layout preference onto another.
  return userId ? `${STORAGE_PREFIX}.${userId}` : `${STORAGE_PREFIX}.anon`;
}

const VALID_MODES: LayoutMode[] = ['command-center', 'sidebar'];

function readStored(key: string): LayoutMode {
  if (typeof window === 'undefined') return 'command-center';
  const raw = window.localStorage.getItem(key);
  if (raw && (VALID_MODES as string[]).includes(raw)) {
    return raw as LayoutMode;
  }
  return 'command-center';
}

/**
 * useLayoutMode — reads/writes the current shell layout mode.
 *
 * Default is 'command-center'. Persists in localStorage under
 * 'vcpmc.layoutMode.v1.<userId>'. Each authenticated user has their own slot,
 * so logout/login as another account never inherits the previous user's
 * preference. Survives reloads.
 */
export function useLayoutMode(): [LayoutMode, (m: LayoutMode) => void] {
  const { currentUser } = useAuth();
  const key = storageKey(currentUser?.id ?? currentUser?.email ?? null);
  const [mode, setMode] = useState<LayoutMode>(() => readStored(key));

  // Reload when the active user changes so logout/login as another account
  // does not flash the previous user's preference.
  useEffect(() => {
    setMode(readStored(key));
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, mode);
    } catch {
      // ignore quota / private-mode errors
    }
  }, [mode, key]);

  return [mode, setMode];
}

export const LAYOUT_MODE_STORAGE_KEY = STORAGE_PREFIX;
