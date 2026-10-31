import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start';
import { isHttpsRequest, withSecurityHeaders } from '@/lib/security-headers';

/**
 * Server functions are same-origin RPC endpoints: reject cross-site calls.
 * (Defining a start instance replaces TanStack's default CSRF middleware, so it
 * must be listed explicitly.)
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

/** CSP, anti-framing and friends on every response — see src/lib/security-headers.ts. */
const securityHeadersMiddleware = createMiddleware().server(async ({ request, next }) => {
  const result = await next();
  result.response = withSecurityHeaders(result.response, {
    dev: process.env.NODE_ENV === 'development',
    https: isHttpsRequest(request),
  });
  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
}));
