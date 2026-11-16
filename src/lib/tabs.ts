/**
 * Keyboard movement for a horizontal WAI-ARIA tab list.
 *
 * Pure (no React/DOM/clock): the page owns the active tab and the refs, this
 * helper only maps the pressed key to the index that should be focused and
 * selected. Out-of-range or broken input is normalised instead of throwing, so
 * a stale index or a cast that goes wrong at runtime cannot break the page.
 */
export function nextTabIndex(current: number, key: string, count: number): number | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  const size = Math.max(1, Math.floor(count));

  const start = typeof current === 'number' && Number.isFinite(current) ? Math.floor(current) : 0;
  // Positive modulo: -1 on three tabs is the last tab, 5 is the middle one.
  const index = ((start % size) + size) % size;

  switch (key) {
    case 'ArrowRight':
      return (index + 1) % size;
    case 'ArrowLeft':
      return (index - 1 + size) % size;
    case 'Home':
      return 0;
    case 'End':
      return size - 1;
    default:
      return null;
  }
}
