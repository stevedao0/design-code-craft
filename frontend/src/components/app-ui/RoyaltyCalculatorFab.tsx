/**
 * Royalty Calculator popup — restrained Cream & Marine editorial skin.
 *
 * Roles:
 *   1) Global floating popup (default `controlledOpen`) — opens from the
 *      shared header action, free-form calculator on every page.
 *   2) Anchored workspace popup — used by CreateContractPage to compute a
 *      PricingSnapshot for a specific domain (currently: Karaoke) and
 *      apply it back to the contract form.
 *
 * The trigger button itself is intentionally NOT rendered by this component:
 * the visual chrome lives in the shared `CommandRibbon` header action.
 * Use `variant="anchored"` + `anchorRef` for the in-page pricing popup.
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { CalculatorIcon, XIcon } from 'lucide-react';
import { RoyaltyCalculatorPage } from '../../pages/RoyaltyCalculatorPage';
import {
  KaraokePricingWorkspace,
  type KaraokeWorkspaceContext,
} from '../pricing/KaraokePricingWorkspace';
import { QuotePreviewDialog } from '../pricing/QuotePreviewDialog';
import type { PricingSnapshot } from '../../lib/pricingSnapshot';

const NAVY = '#4A7202';
const GREEN = '#76B400';
const CREAM = '#FFFFFF';
const LINE = '#E7EDE1';
const SERIF: React.CSSProperties = { fontFamily: '"Inter", system-ui, sans-serif', letterSpacing: '-0.015em' };

export type RoyaltyCalculatorFabProps = {
  /** Hide the floating trigger button (always true now; kept for back-compat). */
  hideTrigger?: boolean;
  /** Controlled open state (driven by the shared header action). */
  controlledOpen?: boolean;
  /** Controlled onClose callback. */
  onClose?: () => void;
  /** When set, opens directly into a domain-specific pricing workspace. */
  mode?: 'general' | 'karaoke';
  /** Karaoke context (rooms, months, VAT…) prefilled from the form. */
  karaokeContext?: KaraokeWorkspaceContext;
  /** Called when user confirms "Áp dụng vào hợp đồng". */
  onApply?: (snapshot: PricingSnapshot) => void;
  /**
   * Popup variant:
   *   "floating" — centered popup (default)
   *   "anchored" — positioned relative to the anchorRef button
   */
  variant?: 'floating' | 'anchored';
  /** Button element to anchor the popup near (used with variant="anchored"). */
  anchorRef?: React.RefObject<HTMLElement>;
};

const ANCHORED_POPUP_WIDTH = Math.min(1180, typeof window !== 'undefined' ? window.innerWidth - 64 : 1180);
const ANCHORED_POPUP_MAX_HEIGHT = Math.min(820, typeof window !== 'undefined' ? window.innerHeight - 64 : 820);

/** Computes a fixed position above or below the anchor button. */
function getAnchoredStyle(anchorEl: HTMLElement, popupW: number, popupH: number): React.CSSProperties {
  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const GAP = 12;

  let left: number;
  let top: number;

  // Prefer opening ABOVE the button, right-aligned to the button
  top = rect.top - popupH - GAP;

  if (top < 24) {
    // Not enough space above → open BELOW the button
    top = rect.bottom + GAP;
  }

  // Align left edge to button's left edge, but clamp
  left = rect.left;
  if (left + popupW > vw - 24) {
    left = vw - popupW - 24;
  }
  if (left < 24) left = 24;

  // Vertical clamp
  if (top + popupH > vh - 24) {
    top = vh - popupH - 24;
  }
  if (top < 24) top = 24;

  return { top, left };
}

export function RoyaltyCalculatorFab(props: RoyaltyCalculatorFabProps = {}) {
  const {
    hideTrigger = true,
    controlledOpen = false,
    onClose,
    mode = 'general',
    karaokeContext,
    onApply,
    variant = 'floating',
    anchorRef,
  } = props;

  const [quoteSnapshot, setQuoteSnapshot] = useState<PricingSnapshot | null>(null);
  const open = controlledOpen;
  const closeAll = () => {
    setQuoteSnapshot(null);
    onClose?.();
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isWorkspace = mode === 'karaoke';
  const isAnchored = variant === 'anchored' && !!anchorRef?.current;
  const title = isWorkspace ? 'Tính tiền bản quyền Karaoke' : 'Tính tiền bản quyền âm nhạc';

  // Anchored position is measured synchronously before paint so the popup never
  // shows a first frame at the wrong spot (that jump reads as "lag").
  const [anchoredStyle, setAnchoredStyle] = useState<React.CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open || !isAnchored) {
      setAnchoredStyle(undefined);
      return;
    }
    const measure = () => {
      const el = anchorRef?.current;
      if (!el) return;
      setAnchoredStyle(getAnchoredStyle(el, ANCHORED_POPUP_WIDTH, ANCHORED_POPUP_MAX_HEIGHT));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAnchored]);

  // Determine dialog dimensions based on variant
  const dialogWidth = isAnchored ? ANCHORED_POPUP_WIDTH : undefined;
  const dialogMaxWidth = isAnchored ? ANCHORED_POPUP_WIDTH : 1200;
  const dialogHeight = isAnchored ? ANCHORED_POPUP_MAX_HEIGHT : undefined;
  const dialogMaxHeight = isAnchored ? ANCHORED_POPUP_MAX_HEIGHT : '88vh';

  return (
    <>
      {open && (
        <div
          className="vcpmc-calc-popup fixed inset-0 z-[60]"
          style={
            isAnchored
              ? anchoredStyle
                ? { ...anchoredStyle, position: 'fixed' }
                : { visibility: 'hidden' }
              : undefined
          }
          aria-hidden={!isAnchored}
        >
          {/* Click-outside backdrop */}
          <div
            onClick={closeAll}
            className="absolute inset-0 fab-backdrop"
            style={{ background: isAnchored ? 'rgba(15,23,42,0.12)' : 'rgba(15,23,42,0.45)' }}
          />

          {/* Dialog card */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fab-dialog absolute overflow-hidden flex flex-col"
            style={isAnchored ? {
              top: 0,
              left: 0,
              width: dialogWidth,
              maxWidth: dialogWidth,
              height: dialogHeight,
              maxHeight: dialogMaxHeight,
              background: CREAM,
              border: `1px solid ${LINE}`,
              borderRadius: 18,
              boxShadow: '0 40px 100px -20px rgba(0,56,77,0.4), 0 0 0 1px rgba(0,0,0,0.04)',
            } : {
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              margin: 'auto',
              width: '100%',
              maxWidth: dialogMaxWidth,
              maxHeight: dialogMaxHeight,
              height: dialogHeight,
              background: CREAM,
              border: `1px solid ${LINE}`,
              borderRadius: 14,
              boxShadow: '0 40px 100px -20px rgba(0,56,77,0.35)',
            }}
          >
            <header
              className="relative flex items-center justify-between px-5 sm:px-6 py-4 shrink-0"
              style={{ background: '#fff', borderBottom: `1px solid ${LINE}` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-10 w-10 flex items-center justify-center rounded shrink-0"
                  style={{ background: GREEN, color: '#fff' }}
                >
                  <CalculatorIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: NAVY }}>
                    VCPMC · {isWorkspace ? 'Không gian tính tiền hợp đồng' : 'Bộ công cụ tính tiền'}
                  </div>
                  <h2 className="text-[18px] font-bold leading-tight mt-1 truncate" style={{ ...SERIF, color: NAVY }}>
                    {title}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                <div className="hidden md:block text-right">
                  <div className="text-[9.5px] uppercase tracking-widest font-semibold" style={{ color: '#8C877E' }}>
                    Căn cứ pháp lý
                  </div>
                  <div className="text-[12px] font-semibold" style={{ color: NAVY }}>
                    NĐ 17/2023 · MLCS NĐ 161/2026
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeAll}
                  aria-label="Đóng"
                  className="h-9 w-9 flex items-center justify-center rounded transition-colors"
                  style={{ border: `1px solid ${LINE}`, color: '#6B665F' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#B91C1C'; e.currentTarget.style.borderColor = '#FCA5A5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B665F'; e.currentTarget.style.borderColor = LINE; }}
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div
              className="relative flex-1 overflow-y-auto fab-scroll"
              style={{ background: CREAM }}
            >
              {isWorkspace ? (
                <KaraokePricingWorkspace
                  context={karaokeContext ?? {}}
                  onApply={(snap) => {
                    onApply?.(snap);
                    closeAll();
                  }}
                  onOpenQuote={(snap) => setQuoteSnapshot(snap)}
                />
              ) : (
                <RoyaltyCalculatorPage />
              )}
            </div>
          </div>

          <style>{`
            @keyframes fabBackdropIn {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            @keyframes fabDialogIn {
              from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.97); }
              to   { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
            }
            .fab-backdrop {
              animation: fabBackdropIn 220ms cubic-bezier(0.4, 0, 0.2, 1) both;
              will-change: opacity;
            }
            .fab-dialog {
              animation: fabDialogIn 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
              transform-origin: center bottom;
              will-change: opacity, transform;
              backface-visibility: hidden;
            }
            .fab-scroll { contain: paint; scroll-behavior: smooth; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
            .fab-scroll::-webkit-scrollbar { width: 10px; }
            .fab-scroll::-webkit-scrollbar-track { background: ${CREAM}; }
            .fab-scroll::-webkit-scrollbar-thumb {
              background: ${LINE};
              border-radius: 9999px;
              border: 2px solid ${CREAM};
            }
            .fab-scroll::-webkit-scrollbar-thumb:hover { background: #B8B1A4; }
            @media (prefers-reduced-motion: reduce) {
              .fab-backdrop, .fab-dialog { animation: none !important; }
            }
          `}</style>
        </div>
      )}

      {open && quoteSnapshot && (
        <QuotePreviewDialog
          snapshot={quoteSnapshot}
          customerName={karaokeContext?.customerName}
          signboard={karaokeContext?.signboard}
          onClose={() => setQuoteSnapshot(null)}
        />
      )}
    </>
  );
}
