/**
 * Generic concept quizzes (Roadmap M1), lifted from the Japanese quiz: a bank
 * of multiple-choice questions per concept, short quizzes drawn from it, and
 * grading on the server. Pure helpers here (no I/O), unit-tested directly;
 * `service.ts` does the database work.
 */
import { z } from 'zod';
import type { KnowledgeState, MasterySource } from '../graph/types.ts';
import { REVIEWABLE_MASTERY, reviewDueAt } from '../graph/spacing.ts';
import { writeId } from '../graph/rpc-schemas.ts';
import { evidenceMastery, passed, type Attempt } from './scoring.ts';

/** Questions per quiz (fewer when the bank is smaller). */
export const QUIZ_LENGTH = 3;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_QUESTIONS_PER_CONCEPT = 50;

export interface QuizQuestion {
  id: string;
  conceptId: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

/** A question as the learner sees it while answering: no answer key. */
export interface QuizQuestionView {
  id: string;
  prompt: string;
  options: string[];
}

const line = (max: number) => z.string().trim().min(1, 'must not be empty').max(max);

/** A question typed in the admin editor (validated again on the server). */
export const questionInput = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid question id')
      .optional(),
    conceptId: writeId,
    prompt: line(500),
    options: z.array(line(200)).min(MIN_OPTIONS).max(MAX_OPTIONS),
    answer: line(200),
    explanation: z.string().trim().max(1000).default(''),
  })
  .refine((q) => new Set(q.options).size === q.options.length, {
    message: 'Each option must be different.',
    path: ['options'],
  })
  .refine((q) => q.options.includes(q.answer), {
    message: 'The correct answer must be one of the options.',
    path: ['answer'],
  });

export type QuestionInput = z.infer<typeof questionInput>;

/** `randomInt(n)` returns an integer in [0, n). */
export type RandomInt = (n: number) => number;

/** Fisher–Yates shuffle into a new array. */
export function shuffled<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draw `count` questions: shuffle first, then prefer questions that were not
 * in the previous attempt, so a retake asks something new when it can.
 */
export function pickQuestions<T extends { id: string }>(
  pool: readonly T[],
  previousIds: readonly string[],
  count: number,
  randomInt: RandomInt,
): T[] {
  const seen = new Set(previousIds);
  return shuffled(pool, randomInt)
    .sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)))
    .slice(0, Math.max(0, count));
}

/** An answer the learner must fix (missing or not one of the options). */
export class QuizAnswerError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'QuizAnswerError';
  }
}

export interface GradedAnswer {
  questionId: string;
  picked: string;
  correct: boolean;
}

/** Grade one attempt. Every question needs one of its own options as the answer. */
export function gradeQuiz(
  questions: readonly Pick<QuizQuestion, 'id' | 'options' | 'answer'>[],
  answers: Readonly<Record<string, string>>,
): { correct: number; total: number; results: GradedAnswer[] } {
  const results = questions.map((q) => {
    const picked = Object.hasOwn(answers, q.id) ? answers[q.id] : undefined;
    if (typeof picked !== 'string' || !q.options.includes(picked)) {
      throw new QuizAnswerError('Answer every question first.');
    }
    return { questionId: q.id, picked, correct: picked === q.answer };
  });
  return { correct: results.filter((r) => r.correct).length, total: questions.length, results };
}

type PriorState = Pick<
  KnowledgeState,
  'mastery' | 'reviewCount' | 'retentionStrength' | 'lastReviewed' | 'firstSeen' | 'nextReview'
>;

export type QuizStatePatch = Pick<KnowledgeState, 'mastery' | 'lastAssessed'> &
  Partial<Pick<KnowledgeState, 'lastReviewed' | 'reviewCount' | 'retentionStrength' | 'nextReview'>> & {
    masterySource: MasterySource;
  };

/**
 * Was a review of this concept due at `now` by its regular schedule? A snooze
 * ("Remind me tomorrow") is ignored: answering a snoozed review still counts
 * as answering a due one. Concepts not learned yet are never due.
 */
export function reviewWasDue(
  prior: PriorState | null | undefined,
  difficulty: number | null | undefined,
  now: Date,
): boolean {
  if (!prior || (prior.mastery ?? 0) < REVIEWABLE_MASTERY) return false;
  const due = reviewDueAt({ ...prior, nextReview: null }, difficulty);
  return due !== null && due <= now.getTime();
}

/**
 * How a graded quiz changes the knowledge state. Mastery comes only from the
 * attempts (a pass counts as mastered; the spaced reviews that follow are
 * quizzes too). The review schedule is the one memory model in `spacing.ts`:
 * - failed: the schedule restarts (due again tomorrow);
 * - first pass (not learned before): the schedule starts;
 * - pass while a review was due: the next interval grows;
 * - pass before it was due: the schedule is kept, so retaking a quiz early
 *   never stretches the interval.
 */
export function quizStatePatch(
  prior: PriorState | null | undefined,
  attempts: Attempt[],
  difficulty: number | null | undefined,
  now: Date,
): { patch: QuizStatePatch; wasDue: boolean } {
  const sorted = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = sorted.at(-1);
  const mastery = evidenceMastery(sorted, { delayedRetrieval: false });
  const iso = now.toISOString();
  const strength = clamp01(prior?.retentionStrength ?? 0.5);
  const learned = !!prior && (prior.mastery ?? 0) >= REVIEWABLE_MASTERY;
  const wasDue = reviewWasDue(prior, difficulty, now);
  const base = { mastery, masterySource: 'quiz' as const, lastAssessed: iso };
  if (!last || !passed(last)) {
    return {
      wasDue,
      patch: {
        ...base,
        lastReviewed: iso,
        reviewCount: 0,
        retentionStrength: round2(Math.max(0.1, strength - 0.2)),
        nextReview: iso,
      },
    };
  }
  if (!learned) {
    return { wasDue, patch: { ...base, lastReviewed: iso, reviewCount: 0, retentionStrength: 0.8, nextReview: iso } };
  }
  if (wasDue) {
    return {
      wasDue,
      patch: {
        ...base,
        lastReviewed: iso,
        reviewCount: (prior?.reviewCount ?? 0) + 1,
        retentionStrength: round2(Math.min(1, strength + 0.1)),
        nextReview: iso,
      },
    };
  }
  return { wasDue, patch: base };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
