import { createServerFn } from '@tanstack/react-start';
import { authMiddleware } from '@/lib/auth/middleware';
export const getMichiEvidence = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const [{ getRequest }, { permitsLocalUser }, { readMichiFeed }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('@/lib/auth/local-access'),
      import('@/lib/michi/feed.server'),
    ]);
    const request = getRequest();
    const permitted =
      !process.env.DATABASE_URL?.trim() &&
      !!request &&
      permitsLocalUser(request, process.env.JAPANESE_LOCAL_ORIGIN);
    return readMichiFeed(context.userId, permitted);
  });
