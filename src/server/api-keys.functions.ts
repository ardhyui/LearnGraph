/**
 * Managing read-only API keys from My Profile (Roadmap M4). Every call is
 * scoped to the signed-in account; secrets are returned only once, on create.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';

export const listMyApiKeys = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const [{ getDb }, keys] = await Promise.all([import('@/lib/db'), import('@/lib/api-keys')]);
    return keys.listApiKeys(getDb(), context.userId);
  });

export const createMyApiKey = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ name: z.string().max(100) }))
  .handler(async ({ data, context }) => {
    const [{ getDb }, keys] = await Promise.all([import('@/lib/db'), import('@/lib/api-keys')]);
    return keys.createApiKey(getDb(), context.userId, data.name);
  });

export const revokeMyApiKey = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const [{ getDb }, keys] = await Promise.all([import('@/lib/db'), import('@/lib/api-keys')]);
    return { revoked: await keys.revokeApiKey(getDb(), context.userId, data.id) };
  });
