/**
 * "This account's workspace has already been set up in this browser."
 *
 * Every full page load used to wait for `seedDemoData` (a server round trip
 * that seeds an empty workspace and tops up example questions/lessons) before
 * any page could show its data — 3–7 s on a slow device (Roadmap P0 #3).
 * Once that has succeeded for an account, later loads in the same browser can
 * show the page straight away and run the same check in the background.
 *
 * Only the last account is remembered (one opaque id, no data). The value is a
 * hint, never a permission: it only decides whether the page waits; the
 * server still scopes every call to the signed-in account.
 */
export const WORKSPACE_READY_KEY = 'learngraph.workspaceReady';
const MAX_ID_LENGTH = 256;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** True when the workspace of `userId` was set up before in this browser. */
export function isWorkspaceKnownReady(userId: string | undefined, storage: KeyValueStorage | null = browserStorage()): boolean {
  if (!userId) return false;
  try {
    return storage?.getItem(WORKSPACE_READY_KEY) === userId;
  } catch {
    return false;
  }
}

/** Remember that `userId`'s workspace is set up (no-op when storage is unavailable). */
export function rememberWorkspaceReady(userId: string | undefined, storage: KeyValueStorage | null = browserStorage()): void {
  if (!userId || userId.length > MAX_ID_LENGTH) return;
  try {
    storage?.setItem(WORKSPACE_READY_KEY, userId);
  } catch {
    // Private mode / storage full: the next load simply waits again.
  }
}

/** Forget the hint (e.g. the set-up check failed), so the next load waits for it again. */
export function forgetWorkspaceReady(storage: KeyValueStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(WORKSPACE_READY_KEY);
  } catch {
    // ignore
  }
}
