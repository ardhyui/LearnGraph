/**
 * Browser-tab titles, one per page ("Gap Analysis · LearnGraph").
 *
 * Every page used to share "LearnGraph - Adaptive Education", so tabs,
 * history, bookmarks and screen readers (which read the title when a page
 * opens — WCAG 2.4.2) could not tell pages apart. Labels come from the
 * sidebar menu so the tab says exactly what the menu says. Pure data +
 * helpers (no React) so it is unit-tested.
 */
import { NAV_SECTIONS } from './navigation.ts';

export const APP_NAME = 'LearnGraph';

/** Pages that are not in the sidebar menu. */
const EXTRA_LABELS: Record<string, string> = {
  '/sign-in': 'Sign in',
};

export const PAGE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(NAV_SECTIONS.flatMap((s) => s.items.map((i) => [i.href, i.label]))),
  ...EXTRA_LABELS,
});

/** "Label · LearnGraph", or just "LearnGraph" when there is no label. */
export function pageTitle(label?: string | null): string {
  const clean = (label ?? '').replace(/\s+/g, ' ').trim();
  return clean ? `${clean} · ${APP_NAME}` : APP_NAME;
}

/** Title for a pathname; unknown paths fall back to the app name. */
export function titleForPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return pageTitle(Object.hasOwn(PAGE_LABELS, path) ? PAGE_LABELS[path] : null);
}

/** Route `head` option: `head: () => pageHead('/gaps')`. */
export function pageHead(pathname: string) {
  return { meta: [{ title: titleForPath(pathname) }] };
}

export const NOT_FOUND_TITLE = pageTitle('Page not found');
export const ERROR_TITLE = pageTitle('Something went wrong');

/**
 * What the route announcer says after an in-app navigation. Screen readers
 * announce nothing when a single-page app swaps content, so a polite live
 * region reads the new page's title instead.
 */
export function navigationAnnouncement(pathname: string): string {
  return titleForPath(pathname);
}
