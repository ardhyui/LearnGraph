/**
 * Pure Fetch-Metadata decision for sibling/cross-site request isolation.
 *
 * No framework imports here (plain strings in, boolean out) so the decision
 * table is directly unit-testable in Node — `isolation.server.ts` is the
 * server-only wrapper that reads the live request via `getRequest()` and
 * throws `CrossSiteRequestError` when this returns false.
 *
 * Apps hosted on a shared parent domain (e.g. `*.vercel.app`) are "same-site"
 * to each other but MUTUALLY UNTRUSTED, and a `SameSite=Lax` session cookie IS
 * sent on same-site subrequests. We allow only: same-origin requests (this
 * app's own client), non-browser requests (SSR / server-to-server, which send
 * no `Sec-Fetch-Site`), direct address-bar/bookmark loads (`none`), and
 * top-level GET navigations (how the OAuth callback and normal page loads
 * arrive). Everything else — scripted fetch/XHR/form-POST from a sibling or
 * another site, and pages framed as `object`/`embed` — is rejected.
 */
export function sameSiteAllowed(
  site: string | null,
  dest: string | null,
  mode: string | null,
  method: string,
): boolean {
  // Non-browser client (no header), the app's own origin, or a direct
  // (address-bar/bookmark) load are all fine.
  if (!site || site === 'same-origin' || site === 'none') return true;
  // A top-level GET navigation (e.g. an OAuth callback redirect) is fine even
  // when it's cross-site; scripted requests never set navigate mode.
  const isTopLevelGet =
    mode === 'navigate' &&
    method === 'GET' &&
    dest !== 'object' &&
    dest !== 'embed';
  return isTopLevelGet;
}
