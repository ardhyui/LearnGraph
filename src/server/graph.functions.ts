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
    const graph = await graphForOwner(context.userId);
    const fn = graph[data.method] as (...args: unknown[]) => unknown;
    const result = await fn.apply(graph, data.args);
    // JSON round-trip keeps the wire format identical to what the UI saw
    // from the old JSON-encoded store (undefined dropped, plain objects).
    return (result === undefined ? null : JSON.parse(JSON.stringify(result))) as any;
  });

/** Seed the demo dataset into the caller's workspace if it is empty. */
export const seedDemoData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { graphForOwner } = await import('@/lib/graph/server');
    const { seedDemoDataIfEmpty, repairDemoKnowledgeStates } = await import('@/lib/graph/seed');
    const graph = await graphForOwner(context.userId);
    const seeded = await seedDemoDataIfEmpty(graph);
    // Older workspaces: attach demo progress to the demo learners (no-op once done).
    if (!seeded) await repairDemoKnowledgeStates(graph);
    return { seeded };
  });
