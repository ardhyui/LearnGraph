/**
 * Keyboard focus after deleting a row in an admin list (Roadmap,
 * cross-milestone accessibility). The deleted row disappears together with
 * its focused Delete button, which drops focus to <body>. Instead, focus moves
 * to the same button in the row that took its place (or the new last row),
 * or to the page heading when the list is empty. Browser-only.
 */
export interface RowFocusMemo {
  row: Element;
  list: Element;
  rowIndex: number;
  buttonIndex: number;
}

/** Call with the clicked button before deleting. */
export function rememberRowFocus(button: HTMLElement | null | undefined): RowFocusMemo | null {
  const row = button?.closest('tr, li, [data-row]');
  const list = row?.parentElement;
  if (!button || !row || !list) return null;
  return {
    row,
    list,
    rowIndex: Array.from(list.children).indexOf(row),
    buttonIndex: Array.from(row.querySelectorAll('button')).indexOf(button as HTMLButtonElement),
  };
}

function focusHeading() {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
}

/**
 * Call after the delete succeeded. Waits (up to ~2 s) for the deleted row to
 * leave the page — lists may animate it out — then moves focus.
 */
export function restoreRowFocus(memo: RowFocusMemo | null): void {
  if (!memo || typeof window === 'undefined') return;
  const started = performance.now();
  const step = () => {
    if (memo.row.isConnected && performance.now() - started < 2000) {
      requestAnimationFrame(step);
      return;
    }
    // Don't steal focus if the user already moved on.
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const rows = memo.list.isConnected ? Array.from(memo.list.children).filter((r) => r !== memo.row) : [];
    const row = rows[Math.min(memo.rowIndex, rows.length - 1)];
    const buttons = row ? Array.from(row.querySelectorAll<HTMLButtonElement>('button:not([disabled])')) : [];
    const target = buttons[Math.min(Math.max(0, memo.buttonIndex), buttons.length - 1)];
    if (target) target.focus();
    else focusHeading();
  };
  requestAnimationFrame(step);
}
