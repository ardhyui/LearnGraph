import { createServerFn } from '@tanstack/react-start';
import { serverErrorMiddleware } from '@/lib/auth/middleware';

/** The signed-in user for SSR / route guards (null when signed out). */
export const getCurrentUser = createServerFn({ method: 'GET' })
  .middleware([serverErrorMiddleware])
  .handler(async () => {
    const { getSessionUser } = await import('@/lib/auth/verify.server');
    return getSessionUser();
  });
