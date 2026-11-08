/**
 * Mastery from graded quiz attempts. First written for the Japanese page
 * (`src/lib/japanese/evidence.ts` re-exports it unchanged); the generic quiz
 * module uses the same rules. Pure functions, unit-tested directly.
 */

/** One graded attempt: when, how many correct out of how many, which questions. */
export type Attempt = { at: string; correct: number; total: number; ids: string[] };

/** Share of correct answers needed to pass a quiz. */
export const PASS_RATIO = 0.8;

const DAY_MS = 86_400_000;

export function passed(attempt: Pick<Attempt, 'correct' | 'total'>): boolean {
  return attempt.correct / Math.max(1, attempt.total) >= PASS_RATIO;
}

export interface EvidenceOptions {
  /**
   * Mastered only after a second pass at least a day later, with enough
   * distinct questions across the two (default, used by the Japanese page).
   * Without it a single pass counts as mastered, and the spaced reviews that
   * follow check retention (the generic quizzes, where reviews are quizzes).
   */
  delayedRetrieval?: boolean;
  /** Distinct questions the two passes must cover together (default 4). */
  distinctQuestions?: number;
}

/**
 * Mastery (0–100) shown by the attempts. A formative signal, never an official
 * score. A failed last attempt gives at most 55, so the concept stays in the plan.
 */
export function evidenceMastery(attempts: Attempt[], options: EvidenceOptions = {}): number {
  if (!attempts.length) return 0;
  const { delayedRetrieval = true, distinctQuestions = 4 } = options;
  const sorted = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = sorted.at(-1)!;
  const accuracy = last.correct / Math.max(1, last.total);
  if (accuracy < PASS_RATIO) return Math.round(accuracy * 70);
  if (!delayedRetrieval) return 85;
  const spaced = sorted.some(
    (a) =>
      passed(a) &&
      Date.parse(last.at) - Date.parse(a.at) >= DAY_MS &&
      new Set([...a.ids, ...last.ids]).size >= distinctQuestions,
  );
  return spaced ? 85 : 70;
}

/** Early repeats and failures never increase the earned review interval. */
export function nextQuizReview(attempts: Attempt[]): string | null {
  if (!attempts.length) return null;
  const sorted = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = sorted.at(-1)!;
  if (!passed(last)) return new Date(Date.parse(last.at) + 600000).toISOString();
  let earned = 0;
  let previous = -Infinity;
  for (const a of sorted) {
    const at = Date.parse(a.at);
    if (!passed(a)) {
      earned = 0;
      previous = -Infinity;
      continue;
    }
    if (at - previous >= DAY_MS) {
      earned++;
      previous = at;
    }
  }
  return new Date(
    Date.parse(last.at) + Math.min(30, 2 ** Math.min(5, Math.max(0, earned - 1))) * DAY_MS,
  ).toISOString();
}
