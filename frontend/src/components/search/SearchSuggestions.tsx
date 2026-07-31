import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SearchIcon, FileTextIcon, ClockIcon, XIcon, Trash2Icon } from 'lucide-react';
import { SearchHistoryItem } from '../../hooks/useSearchHistory';

interface SuggestionItem {
  id: string;
  type: 'history' | 'contract' | 'partner';
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface SearchSuggestionsProps {
  query: string;
  suggestions: SuggestionItem[];
  history: SearchHistoryItem[];
  onSelectSuggestion: (suggestion: SuggestionItem) => void;
  onSelectHistory: (query: string) => void;
  onClearHistory: () => void;
  onRemoveHistory: (query: string) => void;
  visible: boolean;
  loading?: boolean;
}

export function SearchSuggestions({
  query,
  suggestions,
  history,
  onSelectSuggestion,
  onSelectHistory,
  onClearHistory,
  onRemoveHistory,
  visible,
  loading,
}: SearchSuggestionsProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const showHistory = !query && history.length > 0;
  const showSuggestions = query.length >= 2 && suggestions.length > 0;

  const allItems: SuggestionItem[] = showHistory
    ? history.map((h) => ({
        id: `history-${h.query}`,
        type: 'history' as const,
        label: h.query,
        icon: <ClockIcon className="h-4 w-4" />,
      }))
    : suggestions;

  const totalItems = allItems.length;

  // Reset highlight when query changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
      const item = allItems[highlightedIndex];
      const element = itemRefs.current.get(item.id);
      element?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, allItems, totalItems]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!visible) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
            const item = allItems[highlightedIndex];
            if (item.type === 'history') {
              onSelectHistory(item.label);
            } else {
              onSelectSuggestion(item);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          // Parent should handle closing
          break;
      }
    },
    [visible, highlightedIndex, totalItems, allItems, onSelectSuggestion, onSelectHistory]
  );

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-zinc-200 shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
      onKeyDown={handleKeyDown}
    >
      {/* Loading indicator */}
      {loading && (
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-4 w-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          Đang gợi ý...
        </div>
      )}

      {/* History section */}
      {showHistory && (
        <div className="py-1.5">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Tìm kiếm gần đây
            </span>
            <button
              type="button"
              onClick={onClearHistory}
              className="text-[11px] text-zinc-400 hover:text-rose-500 transition-colors"
            >
              Xóa tất cả
            </button>
          </div>
          {history.map((item, index) => {
            const suggestion: SuggestionItem = {
              id: `history-${item.query}`,
              type: 'history',
              label: item.query,
              icon: <ClockIcon className="h-4 w-4" />,
            };
            const isHighlighted = highlightedIndex === index;
            return (
              <button
                key={item.query}
                ref={(el) => {
                  if (el) itemRefs.current.set(suggestion.id, el);
                  else itemRefs.current.delete(suggestion.id);
                }}
                type="button"
                onClick={() => onSelectHistory(item.query)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isHighlighted ? 'bg-amber-50 text-amber-900' : 'hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <span className={`shrink-0 ${isHighlighted ? 'text-amber-600' : 'text-zinc-400'}`}>
                  {suggestion.icon}
                </span>
                <span className="flex-1 truncate text-[13px]">{item.query}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveHistory(item.query);
                  }}
                  className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </button>
            );
          })}
        </div>
      )}

      {/* Suggestions section */}
      {showSuggestions && (
        <div className="py-1.5 border-t border-zinc-100">
          <div className="px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Gợi ý
            </span>
          </div>
          {suggestions.map((suggestion, index) => {
            const isHighlighted = highlightedIndex === (showHistory ? history.length + index : index);
            return (
              <button
                key={suggestion.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(suggestion.id, el);
                  else itemRefs.current.delete(suggestion.id);
                }}
                type="button"
                onClick={() => onSelectSuggestion(suggestion)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isHighlighted ? 'bg-amber-50 text-amber-900' : 'hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <span className={`shrink-0 ${isHighlighted ? 'text-amber-600' : 'text-zinc-400'}`}>
                  {suggestion.icon || <SearchIcon className="h-4 w-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-[13px]">{suggestion.label}</span>
                  {suggestion.sublabel && (
                    <span className="block truncate text-[11px] text-zinc-400">{suggestion.sublabel}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No results */}
      {query.length >= 2 && !loading && suggestions.length === 0 && !showHistory && (
        <div className="px-4 py-6 text-center text-sm text-zinc-400">
          Không có gợi ý phù hợp
        </div>
      )}
    </div>
  );
}
