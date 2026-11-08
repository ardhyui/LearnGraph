/**
 * Server functions for lessons (Roadmap M2): one lesson page per concept, the
 * lesson content editor, and the "lesson opened" event. Thin wrappers over
 * `src/lib/content/service.ts`; every call is scoped to the signed-in account.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import { lookupId } from '@/lib/graph/rpc-schemas';
import { CONTENT_KINDS, contentInput, FORMAT_PREFERENCES } from '@/lib/content/content';

async function services(owner: string) {
  const [{ graphForOwner }, { getDb }, content, evidence] = await Promise.all([
    import('@/lib/graph/server'),
    import('@/lib/db'),
    import('@/lib/content/service'),
    import('@/lib/evidence/service'),
  ]);
  return { graph: await graphForOwner(owner), db: getDb(), content, evidence };
}

/**
 * Everything the lesson page shows for one learner and concept: the content in
 * the learner's preferred order, prerequisites with their mastery, how the
 * concept is checked (quiz, own page, or self-report), and what comes next.
 */
export const getLesson = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ learnerId: lookupId, conceptId: lookupId }))
  .handler(async ({ data, context }) => {
    const { graph, db, content, evidence } = await services(context.userId);
    const { determinePresentationStrategy, orderContent } = await import('@/lib/content/content');
    const [concept, learner] = await Promise.all([graph.getConcept(data.conceptId), graph.getLearnerProfile(data.learnerId)]);
    if (!concept || !learner) return { found: false as const };
    const [items, states, prereqs, check] = await Promise.all([
      content.listContent(db, context.userId, data.conceptId),
      graph.getLearnerKnowledgeStates(data.learnerId),
      graph.getPrerequisites(data.conceptId),
      evidence.requiresEvidence(db, graph, context.userId, data.conceptId),
    ]);
    const strategy = determinePresentationStrategy(learner);
    const state = states.find((s) => s.conceptId === data.conceptId) ?? null;
    const names = new Map((await graph.listConcepts()).map((c) => [c.conceptId, c.name]));
    // What to open after this one: the best other concept in the learner's ZPD.
    const zpd = await graph.computeZPD(data.learnerId, { limit: 5 });
    const next = zpd.recommendations.find((r) => r.concept.conceptId !== data.conceptId)?.concept ?? null;
    return {
      found: true as const,
      learnerName: learner.name || learner.userId,
      concept: JSON.parse(JSON.stringify(concept)) as typeof concept,
      strategy,
      items: orderContent(items, strategy.preference),
      prerequisites: prereqs.map((e) => ({
        conceptId: e.from,
        name: names.get(e.from) ?? e.from,
        mastery: states.find((s) => s.conceptId === e.from)?.mastery ?? 0,
      })),
      mastery: state?.mastery ?? 0,
      masterySource: state?.masterySource ?? null,
      questionCount: check.questions,
      evidenceRequired: concept.evidenceRequired === true,
      next: next ? { conceptId: next.conceptId, name: next.name } : null,
    };
  });

export const logLessonOpened = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      learnerId: lookupId,
      conceptId: lookupId,
      strategy: z.object({
        preference: z.enum(FORMAT_PREFERENCES),
        source: z.enum(['chosen', 'suggested', 'default']),
      }),
      order: z.array(z.enum(CONTENT_KINDS)).max(50),
    }),
  )
  .handler(async ({ data, context }) => {
    const { graph, db, content } = await services(context.userId);
    await content.recordLessonOpened(db, graph, context.userId, data);
    return { logged: true };
  });

/** Minutes of lesson material per concept (concepts without a lesson are absent). */
export const getContentOverview = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { db, content } = await services(context.userId);
    return { minutes: await content.contentMinutes(db, context.userId) };
  });

export const listLessonContent = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ conceptId: lookupId.optional() }))
  .handler(async ({ data, context }) => {
    const { db, content } = await services(context.userId);
    return content.listContent(db, context.userId, data.conceptId);
  });

export const saveLessonContent = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(contentInput)
  .handler(async ({ data, context }) => {
    const { db, graph, content } = await services(context.userId);
    const { randomUUID } = await import('node:crypto');
    return content.saveContent(db, graph, context.userId, data, () => randomUUID());
  });

export const deleteLessonContent = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: lookupId }))
  .handler(async ({ data, context }) => {
    const { db, content } = await services(context.userId);
    await content.deleteContent(db, context.userId, data.id);
    return { deleted: true };
  });
