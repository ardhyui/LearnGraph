/**
 * The learner the user is studying as ("active learner"), shared by every
 * learner page — Today, Recommendations, Gap Analysis, Knowledge Graph and
 * My Profile. Picking a learner on one page carries over to the others, and
 * the choice is remembered in this browser, per signed-in account, so two
 * accounts sharing a browser keep a choice of their own.
 *
 * Only an id is stored, never learner data. A remembered id is used only when
 * it exists in the signed-in account's own learner list (which the server
 * already scopes per account), so a stale or foreign id falls back to the
 * first learner.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from './auth/client.ts';

/**
 * Storage key prefix for the per-account choice (`…:<userId>`). Also the old
 * pre-per-account key, still read (never written or removed) as a one-time
 * migration candidate — other accounts on this browser may still rely on it.
 */
export const ACTIVE_LEARNER_KEY = 'learngraph.activeLearner';
/** Longest id accepted from storage (server-side ids are 1–128 chars). */
const MAX_ID_LENGTH = 128;

/** The per-account storage key, or null when there is no signed-in account. */
export function activeLearnerKey(userId: string | null | undefined): string | null {
  if (!userId || userId.length > MAX_ID_LENGTH) return null;
  return `${ACTIVE_LEARNER_KEY}:${userId}`;
}

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

/**
 * What `useActiveLearner` shows once the learner list has loaded: a choice
 * the user made on this page wins while it exists; otherwise the account's
 * remembered choice, else the first learner. `picked` (not "current state")
 * is checked on purpose: before the session loads, the first learner shows as
 * a placeholder, and it must not override the remembered choice once the
 * account becomes known.
 */
export function nextActiveLearner(
  learnerIds: string[],
  picked: string | null | undefined,
  remembered: string | null | undefined,
): string | null {
  if (picked && learnerIds.includes(picked)) return picked;
  return resolveActiveLearner(learnerIds, null, remembered);
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The remembered learner id for this account, or null (no account, nothing
 * stored, storage disabled, or a malformed value). When this account has no
 * stored choice yet, the old shared key is read once as a migration candidate
 * (still validated by `resolveActiveLearner`, so a foreign id is ignored).
 */
export function readActiveLearner(userId: string | null | undefined): string | null {
  const key = activeLearnerKey(userId);
  if (!key) return null;
  try {
    const store = storage();
    const value = store?.getItem(key) ?? store?.getItem(ACTIVE_LEARNER_KEY) ?? null;
    if (!value || value.length > MAX_ID_LENGTH) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Remember the learner for the other pages of this account — never the old
 * shared key (no-op when storage is unavailable or there is no signed-in
 * account yet; the choice still applies on the page, it just isn't carried
 * across, exactly like when storage is disabled).
 */
export function rememberActiveLearner(userId: string | null | undefined, id: string): void {
  const key = activeLearnerKey(userId);
  if (!key || !id || id.length > MAX_ID_LENGTH) return;
  try {
    storage()?.setItem(key, id);
  } catch {
    // Private mode / storage disabled: the choice just isn't remembered.
  }
}

/**
 * Active learner for a page. `null` until the learner list has loaded (and on
 * the server, so SSR and hydration agree). The setter also remembers the
 * choice for the other pages, under the signed-in account's own key. The
 * session is fetched here so the pages don't each need it themselves.
 */
export function useActiveLearner(
  learnerIds: string[],
  loading: boolean,
): [string | null, (id: string) => void] {
  const [active, setActive] = useState<string | null>(null);
  /** The id the user picked on this page (wins over the remembered one while it exists). */
  const picked = useRef<string | null>(null);
  // Null while the session is loading or signed out: then storage is neither
  // read nor written, like the storage-disabled case.
  const { data: session } = useSession();
  const userId = session?.session?.userId ?? null;
  const idsKey = learnerIds.join('\n');

  useEffect(() => {
    if (loading) return;
    const ids = idsKey ? idsKey.split('\n') : [];
    setActive(nextActiveLearner(ids, picked.current, readActiveLearner(userId)));
  }, [idsKey, loading, userId]);

  const choose = useCallback(
    (id: string) => {
      picked.current = id;
      rememberActiveLearner(userId, id);
      setActive(id);
    },
    [userId],
  );

  return [active, choose];
}
