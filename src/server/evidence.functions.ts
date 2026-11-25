/**
 * Server functions for learning evidence (Roadmap M1): concept quizzes, the
 * question bank editor, self-reports and the event log. Thin wrappers over
 * `src/lib/evidence/service.ts`; every call is scoped to the signed-in account.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/middleware';
import { lookupId } from '@/lib/graph/rpc-schemas';
import { questionInput } from '@/lib/evidence/quiz';

async function services(owner: string) {
  const [{ graphForOwner }, { getDb }, service] = await Promise.all([
    import('@/lib/graph/server'),
    import('@/lib/db'),
    import('@/lib/evidence/service'),
  ]);
  return { graph: await graphForOwner(owner), db: getDb(), service };
}

async function random() {
  const { randomInt, randomUUID } = await import('node:crypto');
  return { int: (n: number) => randomInt(n), uuid: () => randomUUID() };
}

/** Question counts per concept: which concepts are quiz-checked. */
export const getQuizOverview = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { db, service } = await services(context.userId);
    return { counts: await service.questionCounts(db, context.userId) };
  });

/** The bank with answers, for the editor (the account owns its questions). */
export const listQuizQuestions = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ conceptId: lookupId.optional() }))
  .handler(async ({ data, context }) => {
    const { db, service } = await services(context.userId);
    return service.listQuestions(db, context.userId, data.conceptId);
  });

export const saveQuizQuestion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(questionInput)
  .handler(async ({ data, context }) => {
    const { db, graph, service } = await services(context.userId);
    const { uuid } = await random();
    return service.saveQuestion(db, graph, context.userId, data, uuid);
  });

export const deleteQuizQuestion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: lookupId }))
  .handler(async ({ data, context }) => {
    const { db, service } = await services(context.userId);
    await service.deleteQuestion(db, context.userId, data.id);
    return { deleted: true };
  });

export const startConceptQuiz = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ learnerId: lookupId, conceptId: lookupId }))
  .handler(async ({ data, context }) => {
    const { db, graph, service } = await services(context.userId);
    return service.startQuiz(db, graph, context.userId, data, await random());
  });

export const submitConceptQuiz = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      sessionId: z.string().uuid(),
      answers: z
        .record(z.string().max(100), z.string().max(200))
        .refine((a) => Object.keys(a).length <= 10, 'too many answers'),
    }),
  )
  .handler(async ({ data, context }) => {
    const { db, graph, service } = await services(context.userId);
    return service.submitQuiz(db, graph, context.userId, data);
  });

/** "I've got it", "Still learning", "I remembered it", "I forgot", snooze and un-snooze. */
export const recordStudyOutcome = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      learnerId: lookupId,
      conceptId: lookupId,
      outcome: z.enum(['got-it', 'started', 'remembered', 'forgot', 'snooze', 'unsnooze']),
    }),
  )
  .handler(async ({ data, context }) => {
    const { db, graph, service } = await services(context.userId);
    return service.recordSelfReport(db, graph, context.userId, data);
  });

/**
 * Retention at review time for one learner, plus the concepts they worked on
 * most this week, computed from a single read of the event log.
 */
export const getLearningStats = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ learnerId: lookupId }))
  .handler(async ({ data, context }) => {
    const { db, service } = await services(context.userId);
    const { dueReviewRetention } = await import('@/lib/evidence/events');
    const { weeklyBuckets, weeklyFocus } = await import('@/lib/evidence/progress');
    const events = await service.listEvents(db, context.userId, { learnerId: data.learnerId });
    const now = new Date().toISOString();
    const week = weeklyBuckets(events, now, 1)[0];
    return {
      events: events.length,
      retention: dueReviewRetention(events),
      focus: week
        ? { startsAt: week.startsAt, concepts: weeklyFocus(events, week, 3, now) }
        : null,
    };
  });

/** "Your week" for one learner: the last seven days, the concepts worked on
 * most and the current daily streak.
 */
export const getWeekRecap = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ learnerId: lookupId }))
  .handler(async ({ data, context }) => {
    const { db, service } = await services(context.userId);
    const [{ weekRecap, weekFocus }, { learningStreak }, { lastLesson }] = await Promise.all([
      import('@/lib/evidence/week'),
      import('@/lib/evidence/streak'),
      import('@/lib/evidence/last-lesson'),
    ]);
    const events = await service.listEvents(db, context.userId, { learnerId: data.learnerId });
    const now = new Date().toISOString();
    return {
      ...weekRecap(events, now),
      focus: weekFocus(events, now),
      streak: learningStreak(events, now),
      lastLesson: lastLesson(events),
    };
  });

/** The roadmap's measures of success for this workspace (all of its learners). */
export const getLearningMeasures = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const [{ db, service }, { learningMeasures }, { sql }] = await Promise.all([
      services(context.userId),
      import('@/lib/evidence/measures'),
      import('kysely'),
    ]);
    const [events, account] = await Promise.all([
      service.listEvents(db, context.userId),
      sql<{ createdAt: Date | string }>`select "createdAt" from "user" where id = ${context.userId}`.execute(db),
    ]);
    const created = account.rows[0]?.createdAt;
    return learningMeasures(events, created ? new Date(created).toISOString() : null, new Date());
  });

/** Eight weeks of progress for one learner: weekly activity, retention and streaks. */
export const getLearnerProgress = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ learnerId: lookupId }))
  .handler(async ({ data, context }) => {
    const { db, service } = await services(context.userId);
    const [{ weeklyBuckets, retentionByWeek, bestStreak, recentActivity, weeklyFocus }, { learningStreak }] =
      await Promise.all([
        import('@/lib/evidence/progress'),
        import('@/lib/evidence/streak'),
      ]);
    const events = await service.listEvents(db, context.userId, { learnerId: data.learnerId });
    const now = new Date().toISOString();
    const weeks = weeklyBuckets(events, now);
    return {
      weeks,
      retention: retentionByWeek(events, now),
      streak: learningStreak(events, now),
      bestStreak: bestStreak(events, now),
      recent: recentActivity(events, now),
      focus: weeks.map((week) => ({
        startsAt: week.startsAt,
        concepts: weeklyFocus(events, week, 3, now),
      })),
      totalEvents: events.length,
    };
  });
