/**
 * Security response headers for every response served by the app (pages,
 * server functions, /api/auth). Applied by the global request middleware in
 * `src/start.ts`, so they work the same in `vite dev`, preview and on Vercel.
 *
 * The CSP still allows inline scripts/styles: TanStack Start inlines its
 * hydration data and the theme no-flash script, and components use inline
 * `style` attributes. Everything else is locked to this origin; the app can't
 * be framed (clickjacking) and plugins/<base> hijacking are blocked.
 */

/** Hosts allowed for images besides this origin (decorative backgrounds). */
const IMG_HOSTS = ['https://framerusercontent.com'];

export function buildContentSecurityPolicy({ dev = false }: { dev?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...IMG_HOSTS],
    'font-src': ["'self'", 'data:'],
    // Dev: Vite's HMR websocket.
    'connect-src': ["'self'", ...(dev ? ['ws:', 'wss:'] : [])],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export function securityHeaders({
  dev = false,
  https = false,
}: { dev?: boolean; https?: boolean } = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildContentSecurityPolicy({ dev }),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  // HSTS only means something over HTTPS; never send it for local http dev.
  if (https && !dev) headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  return headers;
}

/**
 * Returns a response carrying the security headers. Headers already set by a
 * handler are kept. Some responses (e.g. `Response.redirect`) have immutable
 * headers; those are copied into a new Response first.
 */
export function withSecurityHeaders(
  response: Response,
  opts: { dev?: boolean; https?: boolean } = {},
): Response {
  const entries = Object.entries(securityHeaders(opts));
  try {
    for (const [k, v] of entries) if (!response.headers.has(k)) response.headers.set(k, v);
    return response;
  } catch {
    const copy = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
    for (const [k, v] of entries) if (!copy.headers.has(k)) copy.headers.set(k, v);
    return copy;
  }
}

/** True when the original request reached us over HTTPS (directly or via a proxy). */
export function isHttpsRequest(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (proto) return proto === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}
