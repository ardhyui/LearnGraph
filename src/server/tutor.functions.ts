/**
 * "Copy context for AI tutor" (Roadmap M4): the tutor brief for one learner,
 * built on the server from the caller's own workspace. Nothing is sent to an
 * LLM; the learner sees the text and copies it themselves.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import { lookupId } from '@/lib/graph/rpc-schemas';

export const getTutorContext = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ learnerId: lookupId, conceptId: lookupId.optional(), query: z.string().max(1000).optional() }))
  .handler(async ({ data, context }) => {
    const { graphForOwner } = await import('@/lib/graph/server');
    const { getRAGContext } = await import('@/lib/tutor/service');
    const result = await getRAGContext(await graphForOwner(context.userId), data);
    if (!result) throw Object.assign(new Error('That learner no longer exists.'), { status: 404 });
    return result;
  });
