import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'vcpmc_search_history';
const MAX_HISTORY = 10;

export type SearchHistoryItem = {
  query: string;
  timestamp: number;
};

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const initialized = useRef(false);

  // Load history on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, MAX_HISTORY));
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save to localStorage whenever history changes
  const saveHistory = useCallback((items: SearchHistoryItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const addToHistory = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    
    setHistory(prev => {
      // Remove duplicates (case-insensitive)
      const filtered = prev.filter(item => item.query.toLowerCase() !== trimmed.toLowerCase());
      // Add new item at the beginning
      const newItem: SearchHistoryItem = {
        query: trimmed,
        timestamp: Date.now(),
      };
      const updated = [newItem, ...filtered].slice(0, MAX_HISTORY);
      saveHistory(updated);
      return updated;
    });
  }, [saveHistory]);

  const removeFromHistory = useCallback((query: string) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.query !== query);
      saveHistory(updated);
      return updated;
    });
  }, [saveHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
