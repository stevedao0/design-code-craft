import React, { useEffect, useState } from 'react';
import { TargetIcon, EditIcon, CheckIcon, XIcon } from 'lucide-react';
import { formatCurrency } from '../../lib/format';

const KEY = 'reports.revenueTarget.v1';

function readTarget(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Vòng tiến độ doanh thu so với mục tiêu user tự đặt.
 * Tự lưu vào localStorage. Không cần backend.
 */
export function GoalProgressCard({
  current,
  year,
}: {
  current: number; // VND
  year: number;
}) {
  const [target, setTarget] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setTarget(readTarget());
  }, []);

  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);

  const save = () => {
    const billions = Number(draft);
    if (!Number.isFinite(billions) || billions <= 0) return;
    const value = billions * 1_000_000_000;
    localStorage.setItem(KEY, String(value));
    setTarget(value);
    setEditing(false);
  };

  // Ring math
  const size = 120;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  const tone =
    pct >= 100
      ? { ring: '#059669', glow: 'rgba(16,185,129,0.35)', label: 'Đã đạt!' }
      : pct >= 75
        ? { ring: '#c89968', glow: 'rgba(200,153,104,0.40)', label: 'Sắp đạt' }
        : pct >= 40
          ? { ring: '#e6c79a', glow: 'rgba(230,199,154,0.40)', label: 'Đang tiến triển' }
          : { ring: '#b8302b', glow: 'rgba(184,48,43,0.30)', label: 'Cần đẩy mạnh' };

  return (
    <div className="group relative bg-gradient-to-br from-amber-50/60 via-white to-amber-50/30 rounded-2xl ring-1 ring-amber-700/15 shadow-[0_1px_2px_rgba(15,15,25,0.04),0_2px_6px_rgba(15,15,25,0.03)] hover:shadow-[0_0_0_1px_rgba(200,153,104,0.5),0_14px_30px_-10px_rgba(156,109,62,0.25)] hover:-translate-y-0.5 transition-all duration-200 p-5 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-50 blur-2xl"
        style={{ background: `radial-gradient(circle, ${tone.glow} 0%, transparent 65%)` }}
      />

      <div className="relative flex items-start justify-between mb-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-800">
            <TargetIcon className="h-3 w-3" />
            Mục tiêu doanh thu {year}
          </span>
          <p className="mt-1 text-[11px] text-zinc-500">
            {target > 0
              ? `${tone.label} · còn ${formatCurrency(remaining)}`
              : 'Chưa đặt mục tiêu — click "Đặt mục tiêu" bên dưới'}
          </p>
        </div>
        {!editing && target > 0 && (
          <button
            type="button"
            onClick={() => {
              setDraft(String(target / 1_000_000_000));
              setEditing(true);
            }}
            className="text-[11px] text-amber-800 hover:text-amber-900 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <EditIcon className="h-3 w-3" />
            Sửa
          </button>
        )}
      </div>

      <div className="relative flex items-center gap-5">
        {/* Ring */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#f0e4d0"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={tone.ring}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-[22px] font-bold tabular-nums tracking-tight text-zinc-900">
              {target > 0 ? `${pct.toFixed(0)}%` : '—'}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">
              hoàn thành
            </span>
          </div>
        </div>

        {/* Stats / Editor */}
        <div className="flex-1 min-w-0 space-y-2">
          {editing || target === 0 ? (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                Mục tiêu (tỷ VND)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="number"
                  step="0.1"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save();
                    if (e.key === 'Escape') {
                      setEditing(false);
                      setDraft('');
                    }
                  }}
                  placeholder="VD: 50"
                  className="flex-1 min-w-0 text-sm font-semibold tabular-nums px-2.5 py-1.5 rounded-lg ring-1 ring-amber-700/30 bg-white focus:ring-2 focus:ring-amber-600 outline-none"
                />
                <span className="text-[11px] text-zinc-500">tỷ</span>
                <button
                  type="button"
                  onClick={save}
                  className="p-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors">
                  <CheckIcon className="h-3.5 w-3.5" />
                </button>
                {target > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setDraft('');
                    }}
                    className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100">
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {!editing && target === 0 && (
                <button
                  type="button"
                  onClick={save}
                  className="text-[11px] font-semibold text-amber-800 hover:text-amber-900">
                  Đặt mục tiêu
                </button>
              )}
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  Hiện tại
                </p>
                <p className="text-base font-bold tabular-nums text-zinc-900">
                  {formatCurrency(current)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  Mục tiêu
                </p>
                <p className="text-sm font-semibold tabular-nums text-amber-800">
                  {formatCurrency(target)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
