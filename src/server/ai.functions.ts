/**
 * AI drafts for teachers (Roadmap M5): quiz questions and a curriculum from a
 * syllabus, drafted by Claude with the person's own Anthropic key, reviewed by
 * that person before anything is saved. Off until the account turns it on
 * (the roadmap's `assessmentsEnabled` toggle). Scoped to the signed-in account.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import { lookupId, writeId } from '@/lib/graph/rpc-schemas';
import { questionInput } from '@/lib/evidence/quiz';

const SETTINGS = 'settings:ai-drafts';
const apiKey = z.string().trim().regex(/^sk-ant-[A-Za-z0-9_-]{20,300}$/, 'Enter an Anthropic API key (it starts with sk-ant-).');

async function services(owner: string) {
  const [{ graphForOwner }, { getDb }] = await Promise.all([import('@/lib/graph/server'), import('@/lib/db')]);
  return { graph: await graphForOwner(owner), db: getDb() };
}

async function requireEnabled(graph: Awaited<ReturnType<typeof services>>['graph']) {
  const settings = await graph.getMeta<{ enabled?: boolean }>(SETTINGS);
  if (!settings?.enabled) {
    const { TutorChatError } = await import('@/lib/tutor/chat');
    throw new TutorChatError('AI drafts are turned off for this account.');
  }
}

export const getAiDraftSettings = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { graph, db } = await services(context.userId);
    const { draftApproval } = await import('@/lib/ai/reviews');
    const settings = await graph.getMeta<{ enabled?: boolean }>(SETTINGS);
    return {
      enabled: settings?.enabled === true,
      questions: await draftApproval(db, context.userId, 'question'),
      curriculum: await draftApproval(db, context.userId, 'curriculum'),
    };
  });

export const setAiDraftSettings = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { graph } = await services(context.userId);
    await graph.setMeta(SETTINGS, { enabled: data.enabled, at: new Date().toISOString() });
    return { enabled: data.enabled };
  });

export const draftQuizQuestions = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      conceptId: lookupId,
      kind: z.enum(['quick-check', 'mastery', 'misconception']),
      count: z.number().int().min(1).max(8),
      apiKey,
    }),
  )
  .handler(async ({ data, context }) => {
    const { graph, db } = await services(context.userId);
    await requireEnabled(graph);
    const [{ listQuestions }, { createTutorClient, TutorChatError }, ai, { cleanQuestionDrafts }] = await Promise.all([
      import('@/lib/evidence/service'),
      import('@/lib/tutor/chat'),
      import('@/lib/ai/service'),
      import('@/lib/ai/drafts'),
    ]);
    const concept = await graph.getConcept(data.conceptId);
    if (!concept) throw new TutorChatError('That concept no longer exists.');
    const existing = (await listQuestions(db, context.userId, data.conceptId)).map((q) => q.prompt);
    const drafts = await ai.draftQuestions(createTutorClient(data.apiKey), concept, data.kind, data.count, existing);
    return cleanQuestionDrafts(drafts, data.conceptId, existing);
  });

/** Approve (as is or edited) or discard one drafted question; approving saves it to the bank. */
export const reviewQuestionDraft = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      draft: questionInput,
      decision: z.enum(['approved', 'edited', 'discarded']),
      final: questionInput.optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { graph, db } = await services(context.userId);
    const [{ saveQuestion }, { recordDraftReview }, { randomUUID }] = await Promise.all([
      import('@/lib/evidence/service'),
      import('@/lib/ai/reviews'),
      import('node:crypto'),
    ]);
    const keep = data.decision === 'discarded' ? null : (data.final ?? data.draft);
    if (keep) await saveQuestion(db, graph, context.userId, { ...keep, id: undefined }, () => randomUUID());
    await recordDraftReview(db, context.userId, {
      kind: 'question',
      conceptId: data.draft.conceptId,
      decision: data.decision,
      draft: data.draft,
      final: keep ?? undefined,
    });
    return { saved: !!keep };
  });

export const draftCurriculumWithAI = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        subject: z.string().trim().min(1, 'Name the subject.').max(80),
        text: z.string().trim().max(20_000),
        // A PDF of the course (base64, at most ~8 MB of file).
        pdfBase64: z.string().max(11_000_000).regex(/^[A-Za-z0-9+/=]*$/, 'not a valid file').optional(),
        apiKey,
      })
      .refine((d) => d.text.length >= 20 || !!d.pdfBase64, 'Paste a longer course description or attach a PDF.'),
  )
  .handler(async ({ data, context }) => {
    const { graph } = await services(context.userId);
    await requireEnabled(graph);
    const [{ createTutorClient }, ai, { validateCurriculumDraft }] = await Promise.all([
      import('@/lib/tutor/chat'),
      import('@/lib/ai/service'),
      import('@/lib/ai/drafts'),
    ]);
    const draft = await ai.draftCurriculum(
      createTutorClient(data.apiKey),
      data.text,
      data.subject,
      data.pdfBase64 ? { base64: data.pdfBase64 } : undefined,
    );
    const [concepts, edges] = await Promise.all([graph.listConcepts(), graph.listEdges()]);
    return validateCurriculumDraft(draft, data.subject, { conceptIds: new Set(concepts.map((c) => c.conceptId)), edges });
  });

const planConcept = z.object({
  conceptId: writeId,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000),
  difficulty: z.number().int().min(1).max(10),
  bloomLevel: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']),
});
const planEdge = z.object({ from: writeId, to: writeId, reason: z.string().max(500) });

/** Save the reviewed plan in one transaction, and record what was kept. */
export const applyCurriculumDraft = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      subject: z.string().trim().min(1).max(80),
      proposed: z.object({ concepts: z.array(planConcept).max(60), edges: z.array(planEdge).max(200) }),
      kept: z.object({ concepts: z.array(planConcept).max(60), edges: z.array(planEdge).max(200) }),
    }),
  )
  .handler(async ({ data, context }) => {
    const { graph, db } = await services(context.userId);
    const [{ validateCurriculumDraft }, { recordDraftReview }] = await Promise.all([import('@/lib/ai/drafts'), import('@/lib/ai/reviews')]);
    const [concepts, edges] = await Promise.all([graph.listConcepts(), graph.listEdges()]);
    // Validate the kept plan again on the server (ids, loops, unknown concepts).
    const plan = validateCurriculumDraft(
      {
        concepts: data.kept.concepts.map((c) => ({ id: c.conceptId, name: c.name, description: c.description, difficulty: c.difficulty, bloomLevel: c.bloomLevel })),
        prerequisites: data.kept.edges,
      },
      data.subject,
      { conceptIds: new Set(concepts.map((c) => c.conceptId)), edges },
    );
    // Existing concepts are never overwritten by a draft; only new ones are added.
    const saved = await graph.addConceptsAndEdges(
      plan.concepts.filter((c) => !c.exists).map((c) => ({
        conceptId: c.conceptId,
        name: c.name,
        description: c.description,
        domain: c.domain,
        difficulty: { absolute: c.difficulty, cognitiveLoad: 0.5, abstractness: 0.5 },
        tags: [`bloom:${c.bloomLevel}`, 'ai-drafted'],
      })),
      plan.edges.map((e) => ({ from: e.from, to: e.to, strength: 'recommended' as const, reason: e.reason })),
    );
    const unchanged =
      data.kept.concepts.length === data.proposed.concepts.length && data.kept.edges.length === data.proposed.edges.length;
    await recordDraftReview(db, context.userId, {
      kind: 'curriculum',
      decision: unchanged ? 'approved' : 'edited',
      // Measured per proposed prerequisite edge (the roadmap's "80% of AI edges approved").
      proposed: data.proposed.edges.length,
      accepted: plan.edges.length,
      draft: data.proposed,
      final: { concepts: plan.concepts, edges: plan.edges },
    });
    return { ...saved, problems: plan.problems };
  });
