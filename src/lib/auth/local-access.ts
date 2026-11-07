/** Explicit workstation-only mode. Its service MUST bind to loopback. No proxy deployment. */
export function permitsLocalUser(request: Request, configuredOrigin: string | undefined): boolean {
  if (!configuredOrigin) return false;
  try {
    const url = new URL(request.url);
    const expected = new URL(configuredOrigin);
    if (expected.protocol !== 'http:' || expected.hostname !== '127.0.0.1') return false;
    if (url.origin !== expected.origin) return false;
    if (
      request.headers.has('forwarded') ||
      request.headers.has('x-forwarded-host') ||
      request.headers.has('x-forwarded-for') ||
      request.headers.has('x-forwarded-proto')
    )
      return false;
    const origin = request.headers.get('origin');
    if (origin && origin !== expected.origin) return false;
    const site = request.headers.get('sec-fetch-site');
    if (site && !['same-origin', 'none'].includes(site)) return false;
    return true;
  } catch {
    return false;
  }
}
