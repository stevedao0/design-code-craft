import React from 'react';
import {
  AlertTriangleIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  SparklesIcon,
  InfoIcon } from
'lucide-react';
type Tone = 'rose' | 'amber' | 'indigo' | 'violet' | 'emerald';
const toneClass: Record<
  Tone,
  {
    bg: string;
    ring: string;
    iconBg: string;
    iconText: string;
    text: string;
  }> =
{
  rose: {
    bg: 'bg-gradient-to-br from-rose-100/90 via-rose-50/60 to-white',
    ring: 'ring-1 ring-rose-400/50',
    iconBg: 'bg-rose-600',
    iconText: 'text-white',
    text: 'text-rose-900'
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30',
    ring: 'ring-amber-600/10',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    text: 'text-amber-900'
  },
  indigo: {
    bg: 'bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30',
    ring: 'ring-amber-700/10',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-800',
    text: 'text-amber-950'
  },
  violet: {
    bg: 'bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30',
    ring: 'ring-amber-700/10',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-800',
    text: 'text-amber-950'
  },
  emerald: {
    bg: 'bg-gradient-to-br from-lime-50/70 via-white to-lime-50/30',
    ring: 'ring-lime-600/10',
    iconBg: 'bg-lime-100',
    iconText: 'text-lime-700',
    text: 'text-lime-900'
  }
};
const toneIcon: Record<Tone, React.ReactNode> = {
  rose: <AlertCircleIcon className="h-4 w-4" />,
  amber: <AlertTriangleIcon className="h-4 w-4" />,
  indigo: <InfoIcon className="h-4 w-4" />,
  violet: <SparklesIcon className="h-4 w-4" />,
  emerald: <TrendingUpIcon className="h-4 w-4" />
};
export function InsightCard({
  tone = 'indigo',
  title,
  description




}: {tone?: Tone;title: string;description: string;}) {
  const c = toneClass[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-xl ${c.ring} ${c.bg} p-4 shadow-[0_2px_8px_-2px_rgba(244,63,94,0.12)]`}>
      {tone === 'rose' && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700"
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full opacity-40"
        style={{
          background:
          tone === 'rose' ?
          'radial-gradient(circle, rgba(244,63,94,0.15) 0%, transparent 65%)' :
          tone === 'amber' ?
          'radial-gradient(circle, rgba(245,158,11,0.18) 0%, transparent 65%)' :
          tone === 'emerald' ?
          'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 65%)' :
          tone === 'violet' ?
          'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)' :
          'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 65%)',
          filter: 'blur(8px)'
        }} />

      <div className={`relative flex items-start gap-3 ${tone === 'rose' ? 'pl-2' : ''}`}>
        <span
          className={`h-8 w-8 rounded-lg ${c.iconBg} ${c.iconText} ring-1 ring-inset ring-white/40 inline-flex items-center justify-center shrink-0 ${tone === 'rose' ? 'shadow-[0_0_0_3px_rgba(244,63,94,0.18)] animate-pulse' : ''}`}>
          {toneIcon[tone]}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${c.text} leading-snug flex items-center gap-2`}>
            {tone === 'rose' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-600 text-white">
                Khẩn cấp
              </span>
            )}
            {title}
          </p>
          <p className="mt-1 text-xs text-zinc-700 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>);

}