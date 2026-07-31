import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RouteKey } from '../data/routes';

/**
 * NavHistory — a tiny in-app navigation stack so every page can offer a
 * consistent "Quay lại" affordance (the app navigates by RouteKey, not by a
 * real router, so browser history alone is not enough).
 *
 * Presentation-only: it records where the user came from and hands back the
 * previous RouteKey. It never mutates business state.
 */
interface NavHistoryValue {
  canGoBack: boolean;
  previous: RouteKey | null;
  goBack: () => void;
  /** Called by the shell whenever the active route changes. */
  record: (next: RouteKey) => void;
}

const NavHistoryContext = createContext<NavHistoryValue | null>(null);

export function NavHistoryProvider({
  current,
  onNavigate,
  children,
}: {
  current: RouteKey;
  onNavigate: (k: RouteKey) => void;
  children: React.ReactNode;
}) {
  const [stack, setStack] = useState<RouteKey[]>([]);
  const lastRef = useRef<RouteKey>(current);
  const poppingRef = useRef(false);

  const record = useCallback((next: RouteKey) => {
    const prev = lastRef.current;
    lastRef.current = next;
    if (prev === next) return;
    if (poppingRef.current) {
      poppingRef.current = false;
      return;
    }
    setStack((s) => [...s.slice(-19), prev]);
  }, []);

  useEffect(() => {
    record(current);
  }, [current, record]);

  const goBack = useCallback(() => {
    setStack((s) => {
      if (s.length === 0) return s;
      const target = s[s.length - 1];
      poppingRef.current = true;
      onNavigate(target);
      return s.slice(0, -1);
    });
  }, [onNavigate]);

  const value = useMemo<NavHistoryValue>(
    () => ({
      canGoBack: stack.length > 0,
      previous: stack.length > 0 ? stack[stack.length - 1] : null,
      goBack,
      record,
    }),
    [stack, goBack, record],
  );

  return <NavHistoryContext.Provider value={value}>{children}</NavHistoryContext.Provider>;
}

export function useNavHistory(): NavHistoryValue {
  return (
    useContext(NavHistoryContext) ?? {
      canGoBack: false,
      previous: null,
      goBack: () => {},
      record: () => {},
    }
  );
}