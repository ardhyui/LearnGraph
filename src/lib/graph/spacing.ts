/**
 * One memory model for both "when is the next review?" and "how much is
 * still remembered?".
 *
 * Before, the review interval (SM-2 style, 2^(n-1) × EF, unbounded) and the
 * forgetting curve (Ebbinghaus with a stability of ~7–14 days) were two
 * unrelated formulas: a concept reviewed 12 times was due in ~13 years while
 * the curve said "about 1% remembered" after a few weeks. Now the curve's
 * stability is derived from the review interval, so retention at the due date
 * is always `RETENTION_AT_DUE` of the mastery at the last review, and the
 * interval is capped so nothing waits longer than `MAX_INTERVAL_DAYS`.
 */

export type ReviewPerformance = 'failed' | 'difficult' | 'good' | 'easy';

/** Longest gap between two reviews (days). */
export const MAX_INTERVAL_DAYS = 180;

/** Fraction of mastery still remembered when a review falls due. */
export const RETENTION_AT_DUE = 0.8;

const DAY_MS = 24 * 60 * 60 * 1000;

const PERFORMANCE_MULTIPLIER: Record<ReviewPerformance, number> = {
  failed: 0.25,
  difficult: 0.5,
  good: 1,
  easy: 1.5,
};

export interface SpacingInput {
  mastery: number;
  reviewCount?: number | null;
}

function finite(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * Days between the last review and the next one: 1, 3, 7, then growing
 * exponentially, capped at `MAX_INTERVAL_DAYS`. Weak mastery (< 50) and
 * harder concepts come back sooner. Depends only on the state at the last
 * review, so the due date does not drift as time passes.
 */
export function reviewIntervalDays(
  state: SpacingInput,
  difficulty?: number | null,
  performance?: ReviewPerformance,
): number {
  const mastery = Math.min(100, Math.max(0, finite(state.mastery, 0)));
  const reviews = Math.max(0, Math.floor(finite(state.reviewCount, 0)));

  let base: number;
  if (reviews === 0) base = 1;
  else if (reviews === 1) base = 3;
  else if (reviews === 2) base = 7;
  else {
    const easiness = 1.5 + mastery / 100;
    // Exponent bounded so huge review counts can't overflow to Infinity.
    base = Math.pow(2, Math.min(reviews, 20) - 1) * easiness;
  }

  let multiplier =
    performance && Object.hasOwn(PERFORMANCE_MULTIPLIER, performance) ? PERFORMANCE_MULTIPLIER[performance] : 1;
  if (mastery < 50) multiplier *= 0.5;
  // Difficulty 1–10: the hardest concepts come back ~20% sooner.
  const d = Math.min(10, Math.max(0, finite(difficulty, 0)));
  multiplier *= 1 - 0.2 * (d / 10);

  const days = Math.min(MAX_INTERVAL_DAYS, base) * multiplier;
  return Math.max(1, Math.min(MAX_INTERVAL_DAYS, Math.round(days)));
}

/** Forgetting-curve stability (days) matching an interval: R(interval) = RETENTION_AT_DUE. */
export function stabilityForInterval(intervalDays: number): number {
  return Math.max(1, intervalDays) / Math.log(1 / RETENTION_AT_DUE);
}

/** Retention (0–100) after `daysSince` days: mastery × e^(−t/S). */
export function predictRetention(mastery: number, daysSince: number, stabilityDays: number): number {
  const m = Math.min(100, Math.max(0, finite(mastery, 0)));
  const t = Math.max(0, finite(daysSince, 0));
  const s = Math.max(1, finite(stabilityDays, 1));
  return Math.max(0, Math.min(100, m * Math.exp(-t / s)));
}

/** Whole days since `iso` (fractional), never negative; 0 for invalid dates. */
export function daysSince(iso: string | null | undefined, now: Date): number {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now.getTime() - t) / DAY_MS);
}

export interface DueInput extends SpacingInput {
  lastReviewed?: string | null;
  firstSeen?: string | null;
}

/**
 * When the next review falls due (ms since epoch): `reviewIntervalDays` after
 * the last review (or first study if never reviewed). `null` when there is no
 * usable date.
 */
export function reviewDueAt(state: DueInput, difficulty?: number | null): number | null {
  const from = Date.parse(state.lastReviewed ?? state.firstSeen ?? '');
  if (!Number.isFinite(from)) return null;
  return from + reviewIntervalDays(state, difficulty) * DAY_MS;
}

/** Minimum mastery for a concept to count as "learned" (and so reviewable). */
export const REVIEWABLE_MASTERY = 40;

/**
 * Is this concept due (or overdue) for a review? The single rule behind the
 * Today review queue, "Fading" on Gap Analysis and "Needs review" on the
 * Knowledge Graph, so the three never disagree.
 */
export function isReviewDue(state: DueInput, difficulty: number | null | undefined, now: Date): boolean {
  if (finite(state.mastery, 0) < REVIEWABLE_MASTERY) return false;
  const due = reviewDueAt(state, difficulty);
  return due !== null && due <= now.getTime();
}
