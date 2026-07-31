import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavHistory } from '../../lib/navHistory';

/**
 * Shared hero artwork for every page header. Served from `public/brand` so it
 * works in the self-hosted build (backend-served static files) as well as in
 * the dev server — CDN pointer URLs are not available in those environments.
 */
const PAGE_HERO_BANNER = '/brand/vcpmc-page-hero.jpg';

/**
 * WorkspaceFrame — the single outer layout wrapper for every page in the app.
 *
 * Rules enforced here (do not duplicate in pages):
 *  - All pages have the same outer width, the same horizontal gutter, the same
 *    vertical block, and the same flex direction. Pages must not set their own
 *    max-width, mx-auto, or padding-inline.
 *  - The workspace-frame uses CSS variables (`--workspace-gutter`,
 *    `--workspace-block`, `--workspace-max`) so every screen aligns to the
 *    same rhythm: 16px gutter on mobile (320–430px), 24px tablet, 32px desktop,
 *    capped at a readable content width on wide screens.
 *  - Container queries (`container-type: inline-size`) let page internals adapt
 *    to the workspace width without JS or ResizeObserver.
 *  - `min-width: 0` so tables/grids inside can shrink correctly.
 *  - The page chrome (PageHeader) stays inside the page content; this wrapper
 *    only owns the frame, not the header.
 *  - `embedded` mode is reserved for the full-screen workflow sheet, where the
 *    workspace frame must fill the sheet's own padded surface rather than
 *    introduce additional outer padding. It still uses the same single wrapper
 *    rule (no extra max-width or mx-auto) so alignment is consistent.
 */
export function Page({ children, embedded }: { children: React.ReactNode; embedded?: boolean }) {
  return (
    <div className={embedded ? 'flex flex-col min-h-0 min-w-0 w-full' : 'workspace-frame flex flex-col min-h-0 min-w-0 w-full'}>
      {children}
    </div>
  );
}

/**
 * PageHeader — normalized chrome for every page.
 *
 *  - Title is graphite, eyebrow is deep teal-blue (brand), description is muted
 *    stone — no indigo, no purple.
 *  - Actions slot is right-aligned on desktop and stacked below the title on
 *    mobile. The primary action can be flagged with `primaryAction` so it
 *    comes first in the mobile stacking order.
 *  - On phones, secondary actions become icon-only / overflow-friendly via the
 *    `responsiveActions` flag — pages are still free to use Buttons, but they
 *    should respect this ordering by passing children in priority order.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  eyebrow,
  primaryAction,
  onBack,
  backLabel = 'Quay lại',
  hideBack = false,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: string;
  eyebrow?: React.ReactNode;
  /** Mark the most important action so it leads on mobile. */
  primaryAction?: React.ReactNode;
  /** Custom back handler. Defaults to the app-wide navigation history. */
  onBack?: () => void;
  backLabel?: string;
  /** Opt out on true landing pages that have nowhere to go back to. */
  hideBack?: boolean;
}) {
  const { canGoBack, goBack } = useNavHistory();
  const handleBack = onBack ?? (canGoBack ? goBack : undefined);
  const showBack = !hideBack && Boolean(handleBack);
  return (
    <header className="page-header page-header--banner">
      <img
        src={PAGE_HERO_BANNER}
        alt=""
        aria-hidden="true"
        className="page-header__banner-image"
        loading="lazy"
      />
      <div className="page-header__content min-w-0 flex-1">
        {showBack && (
          <button type="button" className="page-header__back" onClick={handleBack}>
            <ArrowLeft aria-hidden />
            {backLabel}
          </button>
        )}
        {eyebrow && (
          <p className="page-header__eyebrow text-[10.5px] font-bold uppercase mb-1.5">
            {eyebrow}
          </p>
        )}
        {breadcrumb && (
          <p className="page-header__breadcrumb text-xs font-medium mb-1.5">{breadcrumb}</p>
        )}
        <h1 className="page-header__title text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">
          {title}
        </h1>
        {description && <p className="page-header__description text-sm mt-1.5">{description}</p>}
      </div>
      {actions && (
        <div className="page-header__actions flex items-center gap-2 shrink-0 flex-wrap">
          {primaryAction}
          {actions}
        </div>
      )}
    </header>
  );
}

/**
 * Section — vertical rhythm container for one logical block of content.
 * Uses --section-gap so mobile and desktop share the same vertical spacing.
 */
export function Section({
  children,
  className = '',
  gap,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  /** Override the default --section-gap rhythm for tightly related children. */
  gap?: 'tight' | 'normal' | 'loose';
  ariaLabel?: string;
}) {
  const gapClass =
    gap === 'tight' ? 'gap-3' : gap === 'loose' ? 'gap-7' : 'gap-5';
  return (
    <section
      aria-label={ariaLabel}
      className={`flex flex-col ${gapClass} min-w-0 ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * ContentCard — one consistent card composition used everywhere.
 *
 *  - 12px radius, 1px warm border, near-flat shadow by default.
 *  - Strong shadow only when `elevated` (used by dialogs, menus, floating
 *    surfaces).
 *  - Optional header / body / footer slots so the same primitive handles
 *    panel, table-card, and side-card use cases.
 */
export function ContentCard({
  header,
  footer,
  children,
  className = '',
  elevated = false,
  padded = true,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
  padded?: boolean;
}) {
  return (
    <article
      className={`content-card ds-card overflow-hidden flex flex-col min-w-0 ${
        elevated ? 'content-card--elevated' : ''
      } ${className}`}
    >
      {header && (
        <header className="content-card__header px-4 py-3 sm:px-5 sm:py-3.5">
          {header}
        </header>
      )}
      <div className={`content-card__body flex-1 min-w-0 ${padded ? 'px-4 py-3 sm:px-5 sm:py-4' : ''}`}>
        {children}
      </div>
      {footer && (
        <footer className="content-card__footer px-4 py-2.5 sm:px-5 sm:py-3 border-t border-subtle bg-surface-muted/40">
          {footer}
        </footer>
      )}
    </article>
  );
}