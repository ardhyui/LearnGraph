import { createMiddleware } from '@tanstack/react-start';
import { isNotFound, isRedirect } from '@tanstack/react-router';
import { logError } from '@/lib/errors';

/**
 * Auth middleware for server functions: rejects scripted cross-site requests,
 * then resolves the verified session user id into `context.userId`.
 * Every server function touching LearnGraph data uses it and scopes queries by
 * `context.userId` (never a client-sent id).
 *
 * Unexpected errors thrown by the handler are logged once, as a single JSON
 * line (see `@/lib/errors`), then re-thrown unchanged to the client.
 */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    // Only `*.server` modules here so Vite never ships them to the browser.
    const { assertSameSiteRequest } = await import('./isolation.server');
    const { requireUserId } = await import('./verify.server');
    assertSameSiteRequest();
    const userId = await requireUserId();
    try {
      return await next({ context: { userId } });
    } catch (err) {
      if (!isRedirect(err) && !isNotFound(err)) logError('serverFn', err, { userId });
      throw err;
    }
  },
);
