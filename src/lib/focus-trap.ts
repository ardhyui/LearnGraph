/**
 * Keep Tab inside a modal dialog (Roadmap, cross-milestone accessibility):
 * from the last focusable element Tab wraps to the first, and Shift+Tab from
 * the first wraps to the last, so keyboard users can't wander behind it.
 * Call from the dialog's onKeyDown. Browser-only.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapTabKey(
  e: { key: string; shiftKey: boolean; preventDefault: () => void },
  container: HTMLElement | null,
): void {
  if (e.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
  if (items.length === 0) {
    e.preventDefault();
    container.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && container.contains(active);
  if (e.shiftKey && (!inside || active === first || active === container)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
  }
}
