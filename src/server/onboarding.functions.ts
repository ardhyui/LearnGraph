/**
 * The "explore the example learners first" choice (Roadmap P0 #2): kept in the
 * account's graph meta so it follows the person to every device, instead of
 * only the browser that made the choice. No new table, column, RPC method or
 * migration — `graphForOwner` already scopes the read and the write to the
 * signed-in account.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import {
  ONBOARDING_SKIPPED_META,
  onboardingSkippedMeta,
  readOnboardingSkipped,
} from '@/lib/onboarding';

async function graphFor(owner: string) {
  const { graphForOwner } = await import('@/lib/graph/server');
  return graphForOwner(owner);
}

/** Whether this account chose to explore the examples (works on any device). */
export const getOnboardingSkipped = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const graph = await graphFor(context.userId);
    return { skipped: readOnboardingSkipped(await graph.getMeta(ONBOARDING_SKIPPED_META)) };
  });

/** Remember the choice for this account; the browser copy stays the fast path. */
export const setOnboardingSkipped = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ skipped: z.boolean() }))
  .handler(async ({ data, context }) => {
    const graph = await graphFor(context.userId);
    await graph.setMeta(ONBOARDING_SKIPPED_META, onboardingSkippedMeta(data.skipped));
    return { skipped: data.skipped };
  });
