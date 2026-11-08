/** Import a learner from a JSON export (Roadmap M3), into the caller's own workspace. */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import { MAX_IMPORT_BYTES } from '@/lib/learner-import';

export const importLearner = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ text: z.string().max(MAX_IMPORT_BYTES) }))
  .handler(async ({ data, context }) => {
    const [{ graphForOwner }, { getDb }, { importLearnerFile }] = await Promise.all([
      import('@/lib/graph/server'),
      import('@/lib/db'),
      import('@/lib/learner-import-apply'),
    ]);
    return importLearnerFile(getDb(), await graphForOwner(context.userId), context.userId, data.text);
  });
