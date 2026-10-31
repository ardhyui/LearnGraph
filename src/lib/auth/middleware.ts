import { createMiddleware } from '@tanstack/react-start';
import { isNotFound, isRedirect } from '@tanstack/react-router';
import { logError, toClientError } from '@/lib/errors';

/**
 * Log an error thrown inside a server function once (single JSON line, see
 * `@/lib/errors`) and return what may be re-thrown to the client: in
 * production unexpected errors become a generic `InternalServerError` carrying
 * only the log `ref` (no message, stack, SQL or driver fields); expected errors
 * (401/403/429/validation) keep their message but lose the server stack.
 * Redirects / notFound pass through untouched.
 */
function handleServerFnError(err: unknown, userId?: string): unknown {
  if (isRedirect(err) || isNotFound(err)) return err;
  const ref = logError('serverFn', err, userId ? { userId } : {});
  return toClientError(err, { isDev: import.meta.env.DEV, ref });
}

/** For server functions without auth (e.g. `getCurrentUser`): error sanitizing only. */
export const serverErrorMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (err) {
      throw handleServerFnError(err);
    }
  },
);

/**
 * Auth middleware for server functions: rejects scripted cross-site requests,
 * then resolves the verified session user id into `context.userId`.
 * Every server function touching LearnGraph data uses it and scopes queries by
 * `context.userId` (never a client-sent id).
 *
 * Every error (including session lookup / DB failures before the handler
 * runs) goes through `handleServerFnError`.
 */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    let userId: string | undefined;
    try {
      // Only `*.server` modules here so Vite never ships them to the browser.
      const { assertSameSiteRequest } = await import('./isolation.server');
      const { requireUserId } = await import('./verify.server');
      assertSameSiteRequest();
      userId = await requireUserId();
      return await next({ context: { userId } });
    } catch (err) {
      throw handleServerFnError(err, userId);
    }
  },
);
