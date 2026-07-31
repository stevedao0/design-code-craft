import React from 'react';
export function ContentCard({
  title,
  description,
  actions,
  children,
  padded = true,
  className = '',
  accent = false,
}: {
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={`ds-card ds-card-panel group/card relative rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 ${accent ? 'ds-card-accent ' : ''}${className}`}
    >
      <div className="relative">
        {(title || actions) && (
          <header className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="min-w-0">
              {title && (
                <h2 className="text-sm font-semibold text-fg-primary tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-xs text-fg-muted mt-0.5">{description}</p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2 shrink-0">{actions}</div>
            )}
          </header>
        )}
        <div className={`relative flex flex-col min-h-0 flex-1 ${padded ? 'p-[var(--card-padding)]' : ''}`}>{children}</div>
      </div>
    </section>
  );
}
