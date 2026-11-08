import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start';
import { createNonce, isHttpsRequest, withSecurityHeaders } from '@/lib/security-headers';

/**
 * Server functions are same-origin RPC endpoints: reject cross-site calls.
 * (Defining a start instance replaces TanStack's default CSRF middleware, so it
 * must be listed explicitly.)
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

/**
 * CSP, anti-framing and friends on every response — see src/lib/security-headers.ts.
 * Each response gets its own script nonce; the router reads it from this
 * context (`cspNonce`) and puts it on the scripts it renders.
 */
const securityHeadersMiddleware = createMiddleware().server(async ({ request, next }) => {
  const nonce = createNonce();
  const result = await next({ context: { cspNonce: nonce } });
  result.response = withSecurityHeaders(result.response, {
    dev: process.env.NODE_ENV === 'development',
    https: isHttpsRequest(request),
    nonce,
  });
  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
}));
