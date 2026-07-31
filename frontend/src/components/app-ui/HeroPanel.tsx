import React from 'react';
import { SparklesIcon } from 'lucide-react';
export function HeroPanel({
  eyebrow,
  title,
  description,
  actions,
  stats
}: {eyebrow?: string;title: React.ReactNode;description?: React.ReactNode;actions?: React.ReactNode;stats?: {label: string;value: string;}[];}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#e3d2b3] bg-gradient-to-br from-[#faf6ee] via-[#fcfaf5] to-[#f2ecd9] shadow-[0_20px_50px_-20px_rgba(200,153,104,0.18)]">
      {/* Decorative flowing lines — top right */}
      <div aria-hidden className="absolute top-0 right-0 w-1/2 h-full opacity-[0.10] pointer-events-none">
        <svg className="w-full h-full" viewBox="0 0 400 400" fill="none" preserveAspectRatio="xMidYMid slice">
          <path
            d="M0 100C150 50 250 150 400 100M0 200C150 150 250 250 400 200M0 300C150 250 350 350 400 300"
            stroke="#c89968"
            strokeWidth="1"
          />
        </svg>
      </div>
      {/* Soft gold glow — bottom left */}
      <div
        aria-hidden
        className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-[#c89968]/10"
        style={{ filter: 'blur(48px)' }}
      />

      <div className="relative px-6 sm:px-10 py-8 sm:py-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10">
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c89968]/10 border border-[#c89968]/25">
              <SparklesIcon className="h-3 w-3 text-[#9c6d3e]" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#9c6d3e] uppercase">
                {eyebrow}
              </span>
            </div>
          )}

          <h2 className="mt-4 text-2xl sm:text-3xl lg:text-[34px] font-bold text-[#2d2926] tracking-tight leading-[1.15]">
            {title}
          </h2>

          {description && (
            <p className="mt-3 max-w-2xl text-sm sm:text-[15px] text-[#6b6661] leading-relaxed">
              {description}
            </p>
          )}

          {stats && stats.length > 0 && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="group relative p-4 rounded-2xl bg-white/45 border border-white/70 backdrop-blur-md shadow-[0_4px_12px_-4px_rgba(200,153,104,0.12)] hover:border-[#c89968]/35 hover:bg-white/65 transition-all duration-300 overflow-hidden"
                >
                  <div className="text-[10px] font-bold tracking-[0.15em] text-[#9c6d3e]/70 uppercase mb-1.5">
                    {s.label}
                  </div>
                  <div className="text-2xl font-semibold text-[#2d2926] tabular-nums">
                    {s.value}
                  </div>
                  <div className="absolute bottom-0 left-0 w-0 h-[2px] bg-gradient-to-r from-[#c89968] to-[#9c6d3e] group-hover:w-full transition-all duration-500" />
                </div>
              ))}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
