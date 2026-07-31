/**
 * Production source-deterrence guards.
 *
 * IMPORTANT — this is NOT a security boundary. It is a UX-level friction
 * that discourages casual right-click / dev-tool inspection of the shipped
 * bundle. The real protection is backend authorization, no published
 * source maps, and no frontend secrets. Any user can still open the
 * Network tab, view the JS bundle, or use browser menu → Tools → DevTools;
 * this guard only blocks the most common shortcuts and the right-click
 * context menu on the main document.
 *
 * Behavior:
 *   - In dev (import.meta.env.DEV === true): no-op. Right-click and the
 *     standard browser shortcuts keep working for normal debugging.
 *   - In production build:
 *       * preventDefault on `contextmenu` (with the single exception of
 *         `<input>` / `<textarea>` / contentEditable, so paste menus keep
 *         working when we are not handling them).
 *       * Block F12 and the developer shortcuts on Windows/Linux and macOS,
 *         but allow Ctrl/Cmd+C/V/X/A/Z, Tab, Escape.
 *
 * The guard installs its listeners exactly once via `installProductionGuards`.
 * It exposes a `uninstall` function that removes every listener it added so
 * HMR, route changes, or test teardown cannot leave dangling handlers.
 *
 * A tiny inline toast (no external dependency) is used to surface the
 * message without spamming the screen — only one toast at a time, only
 * when the previous one has already faded out.
 */

// Vite sets `import.meta.env.DEV` at build time. In raw Node/tsx the object
// is absent; the guard short-circuits to "dev mode" in that case (safe
// default — debug stays enabled outside the bundle).
function isProductionBuild(): boolean {
  const env = (import.meta as { env?: { DEV?: boolean; PROD?: boolean } })?.env;
  if (!env) return false;
  if (typeof env.DEV === 'boolean') return env.DEV === false;
  if (typeof env.PROD === 'boolean') return env.PROD === true;
  return false;
}

const BLOCKED_KEYS: ReadonlySet<string> = new Set(['F12']);
const BLOCKED_COMBOS_WIN: ReadonlyArray<string> = [
  'Ctrl+U',
  'Ctrl+Shift+I',
  'Ctrl+Shift+J',
  'Ctrl+Shift+C',
  'Ctrl+Shift+K',
];
const BLOCKED_COMBOS_MAC: ReadonlyArray<string> = [
  'Meta+U',
  'Meta+Alt+I',
  'Meta+Alt+J',
  'Meta+Alt+C',
  'Meta+Alt+K',
];
const ALWAYS_ALLOWED: ReadonlySet<string> = new Set([
  'Ctrl+C',
  'Ctrl+V',
  'Ctrl+X',
  'Ctrl+A',
  'Ctrl+Z',
  'Ctrl+Y',
  'Meta+C',
  'Meta+V',
  'Meta+X',
  'Meta+A',
  'Meta+Z',
  'Tab',
  'Escape',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function formatCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join('+');
}

let toastTimer: number | null = null;
let toastEl: HTMLDivElement | null = null;

function showRateLimitedToast(message: string, ms = 1400): void {
  if (typeof document === 'undefined') return;
  if (toastEl && toastEl.isConnected) return;
  if (toastTimer != null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastEl = document.createElement('div');
  toastEl.textContent = message;
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  toastEl.style.position = 'fixed';
  toastEl.style.right = '16px';
  toastEl.style.bottom = '16px';
  toastEl.style.padding = '8px 12px';
  toastEl.style.borderRadius = '10px';
  toastEl.style.background = 'rgba(74, 114, 2, 0.92)';
  toastEl.style.color = '#FFFFFF';
  toastEl.style.fontSize = '12.5px';
  toastEl.style.fontWeight = '500';
  toastEl.style.letterSpacing = '0.01em';
  toastEl.style.boxShadow = '0 6px 18px rgba(15, 17, 21, 0.18)';
  toastEl.style.zIndex = '2147483646';
  toastEl.style.pointerEvents = 'none';
  toastEl.style.transition = 'opacity 200ms ease';
  document.body.appendChild(toastEl);
  toastTimer = window.setTimeout(() => {
    if (toastEl) {
      toastEl.style.opacity = '0';
      window.setTimeout(() => {
        toastEl?.remove();
        toastEl = null;
      }, 220);
    }
    toastTimer = null;
  }, ms);
}

export interface ProductionGuardsHandle {
  uninstall: () => void;
}

/**
 * Install the production source-deterrence guards. Returns a handle whose
 * `uninstall` removes every listener installed here. No-op in dev.
 */
export function installProductionGuards(): ProductionGuardsHandle | null {
  if (!isProductionBuild()) {
    // Development: do not block anything — debugging is the whole point.
    return null;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const handleContextMenu = (e: MouseEvent): void => {
    // Allow the native menu when the user is interacting with a real input so
    // spell-check / paste / etc. keep working — the spec only asked us to block
    // casual right-clicks on the application surface.
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    showRateLimitedToast('Menu chuột phải đã bị tắt trong ứng dụng.');
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    // Never swallow keys that the user is typing into a form field.
    if (isEditableTarget(e.target)) return;
    const combo = formatCombo(e);
    if (ALWAYS_ALLOWED.has(combo)) return;
    if (BLOCKED_KEYS.has(e.key)) {
      e.preventDefault();
      showRateLimitedToast('Phím tắt nhà phát triển đã bị tắt trong ứng dụng.');
      return;
    }
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const blocked = isMac ? BLOCKED_COMBOS_MAC : BLOCKED_COMBOS_WIN;
    if (blocked.includes(combo)) {
      e.preventDefault();
      showRateLimitedToast('Phím tắt nhà phát triển đã bị tắt trong ứng dụng.');
    }
  };

  document.addEventListener('contextmenu', handleContextMenu, { capture: true });
  window.addEventListener('keydown', handleKeyDown, { capture: true });

  return {
    uninstall() {
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as EventListenerOptions);
    },
  };
}