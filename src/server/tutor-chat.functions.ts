/**
 * Built-in tutor chat (Roadmap M4) with the learner's own Anthropic API key
 * (decision D3's recommendation: no project LLM cost). The key is used for
 * this request only and never stored or logged on the server.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import { lookupId } from '@/lib/graph/rpc-schemas';

const apiKey = z
  .string()
  .trim()
  .regex(/^sk-ant-[A-Za-z0-9_-]{20,300}$/, 'Enter an Anthropic API key (it starts with sk-ant-).');

export const askTutorChat = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      learnerId: lookupId,
      conceptId: lookupId.optional(),
      question: z.string().trim().min(1, 'Write a question first.').max(2000),
      apiKey,
      compare: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const [{ graphForOwner }, { getDb }, { getRAGContext }, chat, { appendEvent }] = await Promise.all([
      import('@/lib/graph/server'),
      import('@/lib/db'),
      import('@/lib/tutor/service'),
      import('@/lib/tutor/chat'),
      import('@/lib/evidence/service'),
    ]);
    const graph = await graphForOwner(context.userId);
    const brief = await getRAGContext(graph, { learnerId: data.learnerId, conceptId: data.conceptId, query: data.question });
    if (!brief) throw new chat.TutorChatError('That learner no longer exists.');
    const client = chat.createTutorClient(data.apiKey);
    const withContext = chat.askTutorOnce(client, data.question, brief.text);
    const answers = data.compare
      ? await Promise.all([withContext, chat.askTutorOnce(client, data.question, null)]).then(([a, b]) => [
          { kind: 'context' as const, ...a },
          { kind: 'plain' as const, ...b },
        ])
      : [{ kind: 'context' as const, ...(await withContext) }];
    await appendEvent(getDb(), context.userId, {
      learnerId: data.learnerId,
      conceptId: data.conceptId ?? '',
      kind: 'tutor',
      outcome: data.compare ? 'asked-compare' : 'asked',
      detail: { queryType: brief.queryType, contextTokens: brief.tokens, model: answers[0].model },
    });
    // Blind comparison: the order says nothing about which answer knew the learner.
    if (answers.length === 2 && Math.random() < 0.5) answers.reverse();
    return { answers, queryType: brief.queryType };
  });

export const rateTutorComparison = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      learnerId: lookupId,
      conceptId: lookupId.optional(),
      preferred: z.enum(['context', 'plain', 'same']),
    }),
  )
  .handler(async ({ data, context }) => {
    const [{ getDb }, { appendEvent }] = await Promise.all([import('@/lib/db'), import('@/lib/evidence/service')]);
    await appendEvent(getDb(), context.userId, {
      learnerId: data.learnerId,
      conceptId: data.conceptId ?? '',
      kind: 'tutor',
      outcome: `prefer-${data.preferred}`,
    });
    return { saved: true };
  });
