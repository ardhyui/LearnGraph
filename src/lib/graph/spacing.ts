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

export type ReviewPriority = 'urgent' | 'normal' | 'low';

/** A due review becomes "Review first" once it is this many days late (at least). */
export const URGENT_MIN_LATE_DAYS = 2;

export interface PriorityInput extends DueInput {
  misconceptions?: readonly { resolved?: unknown }[] | null;
}

/** Has at least one misconception that is not marked resolved. */
export function hasOpenMisconception(state: PriorityInput): boolean {
  return Array.isArray(state.misconceptions) && state.misconceptions.some((m) => !m?.resolved);
}

/**
 * Days past the due date (negative = not due yet); `null` without a usable
 * date. Fractional.
 */
export function daysLate(state: DueInput, difficulty: number | null | undefined, now: Date): number | null {
  const due = reviewDueAt(state, difficulty);
  if (due === null) return null;
  return (now.getTime() - due) / DAY_MS;
}

/**
 * How urgent a review is, from how late it is rather than from mastery.
 *
 * Before, priority came from predicted retention (< 40 → urgent, < 60 →
 * normal), which mostly tracks mastery: a concept learned at 45% was "Review
 * first" the moment it was due, while a well-known concept due today was
 * "Can wait" — on a list of reviews that are all due.
 *
 * - `low` ("Can wait"): not due yet.
 * - `urgent` ("Review first"): an unresolved mix-up, or late by at least a
 *   whole review interval (and at least `URGENT_MIN_LATE_DAYS`) — memory is
 *   then well below the level the schedule aims for.
 * - `normal` ("Review soon"): due, not that late.
 */
export function reviewPriority(
  state: PriorityInput,
  difficulty: number | null | undefined,
  now: Date,
): ReviewPriority {
  if (hasOpenMisconception(state)) return 'urgent';
  const late = daysLate(state, difficulty, now);
  if (late === null || !isReviewDue(state, difficulty, now)) return 'low';
  const interval = reviewIntervalDays(state, difficulty);
  return late >= Math.max(URGENT_MIN_LATE_DAYS, interval) ? 'urgent' : 'normal';
}

/**
 * How overdue relative to its own interval (0 = due now, 1 = late by a whole
 * interval). Used to order the review queue: a 1-day item 3 days late comes
 * before a 90-day item 3 days late. Not-due/undated items return a negative
 * number or -Infinity.
 */
export function lateness(state: DueInput, difficulty: number | null | undefined, now: Date): number {
  const late = daysLate(state, difficulty, now);
  if (late === null) return -Infinity;
  return late / reviewIntervalDays(state, difficulty);
}
