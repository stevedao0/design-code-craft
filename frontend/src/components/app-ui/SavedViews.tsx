import React, { useEffect, useState } from 'react';
import { BookmarkIcon, PlusIcon, XIcon, StarIcon } from 'lucide-react';

export type ViewState = Record<string, string>;

type SavedView = {
  id: string;
  name: string;
  state: ViewState;
  pinned?: boolean;
};

const KEY = 'reports.savedViews.v1';

function readStore(scope: string): SavedView[] {
  try {
    const raw = localStorage.getItem(`${KEY}.${scope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeStore(scope: string, list: SavedView[]) {
  try {
    localStorage.setItem(`${KEY}.${scope}`, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function SavedViews({
  scope,
  current,
  onApply,
  isActive,
}: {
  /** Namespace cho localStorage (vd: "reports") */
  scope: string;
  /** State hiện tại (filter values) — dùng khi lưu */
  current: ViewState;
  /** Khi user click 1 view */
  onApply: (state: ViewState) => void;
  /** So sánh xem 1 view có đang được áp dụng không */
  isActive?: (state: ViewState) => boolean;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    setViews(readStore(scope));
  }, [scope]);

  const persist = (next: SavedView[]) => {
    setViews(next);
    writeStore(scope, next);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next: SavedView[] = [
      ...views,
      { id: `v-${Date.now()}`, name: trimmed, state: current },
    ];
    persist(next);
    setName('');
    setAdding(false);
  };

  const remove = (id: string) => persist(views.filter((v) => v.id !== id));
  const togglePin = (id: string) =>
    persist(
      views.map((v) => (v.id === id ? { ...v, pinned: !v.pinned } : v)).sort(
        (a, b) => Number(!!b.pinned) - Number(!!a.pinned)
      )
    );

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        <BookmarkIcon className="h-3.5 w-3.5 text-amber-700" />
        Góc nhìn đã lưu
      </span>

      {views.length === 0 && !adding && (
        <span className="text-[12px] text-zinc-400 italic">
          Chưa lưu bộ lọc nào
        </span>
      )}

      {views.map((v) => {
        const active = isActive?.(v.state);
        return (
          <span
            key={v.id}
            className={`group inline-flex items-center gap-1 rounded-full text-[12px] font-medium ring-1 ring-inset transition-all ${
              active
                ? 'bg-amber-100 text-amber-900 ring-amber-700/30 shadow-[0_0_0_3px_rgba(200,153,104,0.10)]'
                : 'bg-white text-zinc-700 ring-zinc-900/10 hover:bg-amber-50 hover:ring-amber-700/20'
            }`}>
            <button
              type="button"
              onClick={() => onApply(v.state)}
              className="pl-2.5 pr-1 py-1 inline-flex items-center gap-1">
              {v.pinned && (
                <StarIcon className="h-3 w-3 fill-amber-500 text-amber-500" />
              )}
              {v.name}
            </button>
            <button
              type="button"
              onClick={() => togglePin(v.id)}
              title={v.pinned ? 'Bỏ ghim' : 'Ghim'}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-amber-700">
              <StarIcon
                className={`h-3 w-3 ${v.pinned ? 'fill-amber-500 text-amber-500' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={() => remove(v.id)}
              title="Xóa"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 pr-1.5 hover:text-rose-600">
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      {adding ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-white ring-1 ring-amber-700/30 pl-2.5 pr-1 py-0.5 shadow-[0_0_0_3px_rgba(200,153,104,0.10)]">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setAdding(false);
                setName('');
              }
            }}
            placeholder="Tên góc nhìn…"
            className="w-36 text-[12px] outline-none bg-transparent placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={save}
            className="text-[11px] font-semibold text-amber-800 hover:text-amber-900 px-1.5 py-0.5">
            Lưu
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setName('');
            }}
            className="text-zinc-400 hover:text-zinc-700 p-0.5">
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full bg-white ring-1 ring-dashed ring-zinc-300 px-2.5 py-1 text-[12px] font-medium text-zinc-600 hover:ring-amber-700/40 hover:text-amber-800 transition-all">
          <PlusIcon className="h-3 w-3" />
          Lưu góc nhìn hiện tại
        </button>
      )}
    </div>
  );
}
