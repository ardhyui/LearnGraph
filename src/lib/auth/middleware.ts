import { createMiddleware } from '@tanstack/react-start';

/**
 * Auth middleware for server functions: rejects scripted cross-site requests,
 * then resolves the verified session user id into `context.userId`.
 * Every server function touching LearnGraph data uses it and scopes queries by
 * `context.userId` (never a client-sent id).
 */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    // Only `*.server` modules here so Vite never ships them to the browser.
    const { assertSameSiteRequest } = await import('./isolation.server');
    const { requireUserId } = await import('./verify.server');
    assertSameSiteRequest();
    const userId = await requireUserId();
    return next({ context: { userId } });
  },
);
