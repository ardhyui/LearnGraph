/**
 * "Your week" recap for the Today panel: what the learner finished in the last
 * seven days and which concepts they worked on most, counted from the
 * append-only event log. Pure functions; the server function reads the rows for
 * one learner. No table, column or RPC.
 */
import type { LearningEvent } from './events.ts';
import { weeklyFocus, type WeeklyFocusConcept } from './progress.ts';

const DAY = 86_400_000;

export interface WeekRecap {
  /** Reviews answered with a self-report ("remembered" or "forgot"). */
  reviews: number;
  /** Quizzes passed. */
  quizzesPassed: number;
  /** Concepts whose first event falls inside the window (not touched before). */
  newConcepts: number;
  /** Whether any of the three counts happened at all. */
  active: boolean;
}

type WeekEvent = Pick<LearningEvent, 'kind' | 'outcome' | 'conceptId' | 'createdAt'>;

/**
 * The last seven days (inclusive on both ends) from the event log. Broken or
 * future timestamps are ignored rather than throwing; a concept is only "new"
 * when its earliest valid event falls inside the window, whatever order the
 * rows arrive in.
 */
export function weekRecap(events: readonly WeekEvent[], now: string | Date): WeekRecap {
  const t = new Date(now).getTime();
  const from = t - 7 * DAY;
  const inWindow = (at: number) => at >= from && at <= t;
  let reviews = 0;
  let quizzesPassed = 0;
  const firstSeen = new Map<string, number>();
  for (const e of events) {
    const at = Date.parse(e.createdAt);
    if (!Number.isFinite(at) || at > t) continue;
    const first = firstSeen.get(e.conceptId);
    if (first === undefined || at < first) firstSeen.set(e.conceptId, at);
    if (!inWindow(at)) continue;
    if (e.kind === 'review') reviews++;
    else if (e.kind === 'quiz' && e.outcome === 'passed') quizzesPassed++;
  }
  let newConcepts = 0;
  for (const at of firstSeen.values()) if (inWindow(at)) newConcepts++;
  return {
    reviews,
    quizzesPassed,
    newConcepts,
    active: reviews + quizzesPassed + newConcepts > 0,
  };
}

/** The recap as the short lines the panel shows, without noisy zero rows. */
export function weekRecapLines(recap: WeekRecap): string[] {
  const lines: string[] = [];
  if (recap.reviews > 0) {
    lines.push(`${recap.reviews} ${recap.reviews === 1 ? 'review' : 'reviews'} completed`);
  }
  if (recap.quizzesPassed > 0) {
    lines.push(`${recap.quizzesPassed} ${recap.quizzesPassed === 1 ? 'quiz' : 'quizzes'} passed`);
  }
  if (recap.newConcepts > 0) {
    lines.push(`${recap.newConcepts} ${recap.newConcepts === 1 ? 'new concept' : 'new concepts'}`);
  }
  return lines;
}

/**
 * The concepts the learner worked on most in the same rolling seven-day window
 * as `weekRecap` — `[now - 7 days, now]`, both ends included, not a calendar
 * week — so the recap counts and the "Most reviewed" chips always agree. It
 * delegates to `weeklyFocus`: only study events count, broken or future
 * timestamps are ignored without throwing, ties break by `conceptId`, and a
 * non-positive or invalid `limit` (or `now`) returns no concepts.
 */
export function weekFocus(
  events: readonly WeekEvent[],
  now: string | Date,
  limit = 3,
): WeeklyFocusConcept[] {
  const t = new Date(now).getTime();
  if (!Number.isFinite(t)) return [];
  // `weeklyFocus` is half-open (`[startsAt, endsAt)`), so the exclusive end is
  // one millisecond past `now` to keep an event exactly at `now` in — the same
  // instant `weekRecap` still counts, at millisecond timestamp resolution.
  return weeklyFocus(
    events,
    { startsAt: new Date(t - 7 * DAY).toISOString(), endsAt: new Date(t + 1).toISOString() },
    limit,
    now,
  );
}
