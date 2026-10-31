import { createServerFn } from '@tanstack/react-start';

/** The signed-in user for SSR / route guards (null when signed out). */
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const { getSessionUser } = await import('@/lib/auth/verify.server');
  return getSessionUser();
});
