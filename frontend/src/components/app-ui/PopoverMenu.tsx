import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * PopoverMenu — shared floating dropdown primitive.
 *
 * Renders a button (or any element) as a trigger and a floating panel
 * positioned next to it. The panel is rendered through a React Portal
 * directly under <body> so it is never clipped by stacking contexts,
 * `overflow: hidden`, `border-radius`, or `transform` on the trigger's
 * ancestors.
 *
 * Features:
 *  - Click trigger toggles the menu (open / close).
 *  - The trigger's existing onClick is preserved and runs first; the
 *    menu only toggles if the original handler does not call
 *    event.preventDefault() and the trigger is not disabled.
 *  - Click-outside and Escape close the menu.
 *  - aria-haspopup="menu" and aria-expanded are wired on the trigger.
 *  - Auto-aligns to the trigger's right edge (`align="end"`) with a
 *    configurable offset (default 8px). On narrow viewports the panel
 *    is clamped inside the viewport so it never escapes the screen.
 *  - Re-positions on scroll, resize, and trigger / panel layout
 *    changes via ResizeObserver (no re-render storm).
 */
export interface PopoverMenuProps {
  /**
   * The trigger element. Must be a single React element (typically a
   * <button>) that accepts onClick. The original onClick is preserved;
   * if it calls event.preventDefault() the menu will not toggle.
   * If the trigger is `disabled` (or aria-disabled) the menu will not
   * open.
   */
  trigger: React.ReactElement;
  /** Children render inside the floating panel. */
  children: (close: () => void) => React.ReactNode;
  /** Optional class for the panel container. */
  panelClassName?: string;
  /** Whether the menu is open (controlled). */
  open?: boolean;
  /** Default open state (uncontrolled). */
  defaultOpen?: boolean;
  /** Callback fired when the menu opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Vertical gap between the trigger and the panel. */
  sideOffset?: number;
  /** Horizontal alignment. Default `end` (right edge aligned with trigger). */
  align?: 'start' | 'end' | 'center';
  /** When true, the menu is closed on outside click (default true). */
  closeOnOutside?: boolean;
  /** When true, the menu is closed on Escape (default true). */
  closeOnEscape?: boolean;
  /** Class for the trigger wrapper. */
  triggerClassName?: string;
}

interface Position {
  top: number;
  left: number;
  /** Width of the panel after measurement. */
  width: number;
}

type TriggerProps = React.HTMLAttributes<HTMLElement> & {
  disabled?: boolean;
  'aria-disabled'?: boolean | 'true' | 'false';
  onClick?: React.MouseEventHandler<HTMLElement>;
};

function isDisabledTrigger(props: TriggerProps): boolean {
  if (props.disabled) return true;
  if (props['aria-disabled'] === true || props['aria-disabled'] === 'true') return true;
  return false;
}

export function PopoverMenu({
  trigger,
  children,
  panelClassName = '',
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  sideOffset = 8,
  align = 'end',
  closeOnOutside = true,
  closeOnEscape = true,
  triggerClassName = '',
}: PopoverMenuProps) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth || 220;
    const viewportWidth = window.innerWidth;
    const margin = 8;

    let left = rect.right - panelWidth;
    if (align === 'start') left = rect.left;
    else if (align === 'center') left = rect.left + rect.width / 2 - panelWidth / 2;

    // Clamp into viewport so the panel never escapes the screen.
    const minLeft = margin;
    const maxLeft = viewportWidth - panelWidth - margin;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    const top = rect.bottom + sideOffset;
    setPosition({ top, left, width: panelWidth });
  }, [align, sideOffset]);

  // Position the panel when it opens or when its layout inputs change,
  // and re-position while it is open via a ResizeObserver. ResizeObserver
  // is connected only while `open` is true and is disconnected on close
  // or unmount, so we never feed setPosition on every render.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();

    if (typeof ResizeObserver === 'undefined') return;
    const triggerEl = triggerRef.current;
    const panelEl = panelRef.current;
    if (!triggerEl) return;
    const ro = new ResizeObserver(() => updatePosition());
    ro.observe(triggerEl);
    if (panelEl) ro.observe(panelEl);
    return () => ro.disconnect();
  }, [open, updatePosition]);

  // While open: track outside clicks.
  useEffect(() => {
    if (!open || !closeOnOutside) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, closeOnOutside, setOpen]);

  // While open: track Escape key.
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeOnEscape, setOpen]);

  // While open: re-position on scroll / window resize.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePosition]);

  // Build a wired-up trigger. We use the functional setState form so we
  // don't capture a stale `open` value, and we delegate toggle decisions
  // to the runtime values of the original click + disabled flags.
  const triggerProps = (trigger.props ?? {}) as TriggerProps;
  const originalOnClick = triggerProps.onClick;
  const triggerDisabled = isDisabledTrigger(triggerProps);

  const wiredOnClick = useCallback<React.MouseEventHandler<HTMLElement>>(
    (event) => {
      originalOnClick?.(event);
      if (event.defaultPrevented) return;
      const target = event.currentTarget as HTMLButtonElement | null;
      if (target?.disabled) return;
      if (
        target?.getAttribute('aria-disabled') === 'true'
      ) return;
      setOpen((current) => !current);
    },
    [originalOnClick, setOpen]
  );

  const wiredTrigger = React.cloneElement(
    trigger as React.ReactElement<TriggerProps>,
    {
      onClick: wiredOnClick,
      'aria-haspopup': 'menu' as const,
      'aria-expanded': open,
    }
  );

  // Suppress an unused-binding warning when callers build disabled
  // triggers — we use the flag to keep the wired props honest.
  void triggerDisabled;

  return (
    <>
      <div ref={triggerRef} className={triggerClassName}>
        {wiredTrigger}
      </div>
      {open && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            tabIndex={-1}
            className={panelClassName}
            style={{
              position: 'fixed',
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              zIndex: 60,
              minWidth: 200,
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body
        )}
    </>
  );
}