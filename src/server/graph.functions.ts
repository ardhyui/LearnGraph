import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import { REMOTE_GRAPH_METHODS } from '@/lib/graph/methods';
import { assertGraphCallSize, parseGraphArgs } from '@/lib/graph/rpc-schemas';

const graphCallInput = z.object({
  method: z.enum(REMOTE_GRAPH_METHODS),
  args: z.array(z.unknown()).max(8),
});

/**
 * Single RPC entry point for the graph engine (replaces the old in-browser
 * LevelDB). Always scoped to the verified session user — never a client id.
 */
export const graphCall = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((data: unknown) => {
    // 1) payload size cap, 2) method allow-list, 3) per-method argument schema
    // (ids, ranges, lengths — see rpc-schemas.ts). Only parsed args reach the engine.
    assertGraphCallSize(data);
    const { method, args } = graphCallInput.parse(data);
    return { method, args: parseGraphArgs(method, args) };
  })
  .handler(async ({ data, context }) => {
    const { graphForOwner } = await import('@/lib/graph/server');
    const { getDb } = await import('@/lib/db');
    const { guardGraphCall } = await import('@/lib/evidence/service');
    const graph = await graphForOwner(context.userId);
    // Quiz-checked concepts: no self-reported or hand-typed mastery (Roadmap M1, D5).
    const args = await guardGraphCall(getDb(), graph, context.userId, data.method, data.args);
    const fn = graph[data.method] as (...args: unknown[]) => unknown;
    const result = await fn.apply(graph, args);
    // JSON round-trip keeps the wire format identical to what the UI saw
    // from the old JSON-encoded store (undefined dropped, plain objects).
    return (result === undefined ? null : JSON.parse(JSON.stringify(result))) as any;
  });

/** Seed the demo dataset into the caller's workspace if it is empty. */
export const seedDemoData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { graphForOwner } = await import('@/lib/graph/server');
    const { seedDemoDataIfEmpty, repairDemoKnowledgeStates, DEMO_DECLINED_FLAG } = await import('@/lib/graph/seed');
    const { getDb } = await import('@/lib/db');
    const { seedDemoQuestions } = await import('@/lib/evidence/service');
    const { seedDemoContent } = await import('@/lib/content/service');
    const graph = await graphForOwner(context.userId);
    // "Start with an empty workspace" was chosen: never bring the examples back.
    if (await graph.getMeta(DEMO_DECLINED_FLAG)) return { seeded: false };
    const seeded = await seedDemoDataIfEmpty(graph);
    // Older workspaces: attach demo progress to the demo learners (no-op once done).
    if (!seeded) await repairDemoKnowledgeStates(graph);
    // Example concepts get their quiz questions and lessons once, in new and existing workspaces.
    await seedDemoQuestions(getDb(), graph, context.userId);
    await seedDemoContent(getDb(), graph, context.userId);
    return { seeded };
  });

/**
 * "Refresh example data" (Roadmap P0 #2): move this account's example progress
 * to "as of now". No arguments and no client-supplied ids or dates; only the
 * demo learners' dates change (see refreshDemoStateDates in seed.ts).
 */
export const refreshExampleData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { graphForOwner } = await import('@/lib/graph/server');
    const { refreshDemoStateDates } = await import('@/lib/graph/seed');
    return refreshDemoStateDates(await graphForOwner(context.userId));
  });

/** "Start with an empty workspace": remove the example data for good (Roadmap M3). */
export const removeExampleData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { graphForOwner } = await import('@/lib/graph/server');
    const { removeDemoData } = await import('@/lib/graph/seed');
    return removeDemoData(await graphForOwner(context.userId));
  });
