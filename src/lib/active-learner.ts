/**
 * The learner the user is studying as ("active learner"), shared by every
 * learner page — Today, Recommendations, Gap Analysis, Knowledge Graph and
 * My Profile. Picking a learner on one page carries over to the others, and
 * the choice is remembered in this browser.
 *
 * Only an id is stored, never learner data. A remembered id is used only when
 * it exists in the signed-in account's own learner list (which the server
 * already scopes per account), so a stale or foreign id falls back to the
 * first learner.
 */
import { useCallback, useEffect, useState } from 'react';

export const ACTIVE_LEARNER_KEY = 'learngraph.activeLearner';
/** Longest id accepted from storage (server-side ids are 1–128 chars). */
const MAX_ID_LENGTH = 128;

/** Pick the learner to show: the current one if it still exists, else the remembered one, else the first. */
export function resolveActiveLearner(
  learnerIds: string[],
  current: string | null | undefined,
  remembered: string | null | undefined,
): string | null {
  if (current && learnerIds.includes(current)) return current;
  if (remembered && learnerIds.includes(remembered)) return remembered;
  return learnerIds[0] ?? null;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The remembered learner id, or null (nothing stored, storage disabled, or a malformed value). */
export function readActiveLearner(): string | null {
  try {
    const value = storage()?.getItem(ACTIVE_LEARNER_KEY) ?? null;
    if (!value || value.length > MAX_ID_LENGTH) return null;
    return value;
  } catch {
    return null;
  }
}

/** Remember the learner for the other pages (no-op when storage is unavailable). */
export function rememberActiveLearner(id: string): void {
  if (!id || id.length > MAX_ID_LENGTH) return;
  try {
    storage()?.setItem(ACTIVE_LEARNER_KEY, id);
  } catch {
    // Private mode / storage disabled: the choice just isn't remembered.
  }
}

/**
 * Active learner for a page. `null` until the learner list has loaded (and on
 * the server, so SSR and hydration agree). The setter also remembers the
 * choice for the other pages.
 */
export function useActiveLearner(
  learnerIds: string[],
  loading: boolean,
): [string | null, (id: string) => void] {
  const [active, setActive] = useState<string | null>(null);
  const idsKey = learnerIds.join('\n');

  useEffect(() => {
    if (loading) return;
    const ids = idsKey ? idsKey.split('\n') : [];
    setActive((current) => resolveActiveLearner(ids, current, readActiveLearner()));
  }, [idsKey, loading]);

  const choose = useCallback((id: string) => {
    rememberActiveLearner(id);
    setActive(id);
  }, []);

  return [active, choose];
}
