/**
 * Security response headers for every response served by the app (pages,
 * server functions, /api/auth). Applied by the global request middleware in
 * `src/start.ts`, so they work the same in `vite dev`, preview and on Vercel.
 *
 * Scripts (production): only files from this origin, scripts carrying this
 * request's nonce (TanStack Start puts it on its hydration scripts, via
 * `ssr.nonce` in `src/router.tsx`), and the theme no-flash script by its hash.
 * Inline scripts injected any other way do not run. In `vite dev` inline
 * scripts stay allowed, because Vite injects its own without a nonce.
 *
 * Styles still allow inline: components use `style` attributes, which a nonce
 * cannot cover. Everything else is locked to this origin; the app can't be
 * framed (clickjacking) and plugins/<base> hijacking are blocked.
 */

/** Hosts allowed for images besides this origin (decorative backgrounds). */
const IMG_HOSTS = ['https://framerusercontent.com'];

/**
 * SHA-256 of `NO_FLASH_SCRIPT` (src/lib/theme-script.ts). A unit test fails if
 * the script changes without this hash.
 */
export const NO_FLASH_SCRIPT_SHA256 = 'SuI8CBBy2MimOdSyZoKg8MOMYQDeOw/G2zMrwscLEjg=';

/** A fresh, unguessable nonce for one response (128 random bits, base64). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy({ dev = false, nonce }: { dev?: boolean; nonce?: string } = {}): string {
  const scripts = dev
    ? ["'self'", "'unsafe-inline'"]
    : ["'self'", ...(nonce ? [`'nonce-${nonce}'`] : []), `'sha256-${NO_FLASH_SCRIPT_SHA256}'`];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scripts,
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
  nonce,
}: { dev?: boolean; https?: boolean; nonce?: string } = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildContentSecurityPolicy({ dev, nonce }),
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
 * headers; those are copied into a new Response first. The copy reuses the
 * same body stream, so TanStack Start's response ownership is inherited and
 * the body is not cancelled.
 */
export function withSecurityHeaders(
  response: Response,
  opts: { dev?: boolean; https?: boolean; nonce?: string } = {},
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
