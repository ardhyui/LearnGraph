/**
 * Daily learning streak for the Today panel: how many UTC calendar days in a row
 * the learner did something that counts as studying, counted from the
 * append-only event log. Pure functions; the server function reads the rows for
 * one learner. No table, column or RPC.
 */
import type { LearningEvent } from './events.ts';

const DAY = 86_400_000;

/** Kinds that count as studying; snoozes and tutor ratings do not. */
export const STUDY_KINDS: ReadonlySet<LearningEvent['kind']> = new Set([
  'quiz',
  'study',
  'review',
  'practice',
  'lesson',
]);

export interface LearningStreak {
  /** Consecutive study days counted back from today (or yesterday). */
  days: number;
  /** Whether the learner studied today; `false` means the streak is alive from yesterday. */
  activeToday: boolean;
}

type StreakEvent = Pick<LearningEvent, 'kind' | 'createdAt'>;

/** A UTC calendar day, so SSR and the server agree regardless of the browser's zone. */
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The UTC days on which the learner studied. Broken or future timestamps are
 * ignored rather than throwing. Shared by the current streak and the longer
 * "best streak" / weekly views, so every page counts study days the same way.
 */
export function studyDayKeys(
  events: readonly StreakEvent[],
  now: string | Date,
): Set<string> {
  const t = new Date(now).getTime();
  const studied = new Set<string>();
  if (!Number.isFinite(t)) return studied;
  for (const e of events) {
    if (!STUDY_KINDS.has(e.kind)) continue;
    const at = Date.parse(e.createdAt);
    if (!Number.isFinite(at) || at > t) continue;
    studied.add(dayKey(at));
  }
  return studied;
}

/**
 * The current streak from the event log, in whole UTC days. Broken or future
 * timestamps are ignored rather than throwing. Today anchors the streak when
 * the learner studied today; otherwise yesterday does, so a streak stays alive
 * until the day ends (`activeToday` says which case it is). No events on either
 * day means no streak — a gap of a whole day ends it.
 */
export function learningStreak(events: readonly StreakEvent[], now: string | Date): LearningStreak {
  const t = new Date(now).getTime();
  if (!Number.isFinite(t)) return { days: 0, activeToday: false };
  const studied = studyDayKeys(events, now);
  const today = Math.floor(t / DAY);
  let anchor = today;
  let activeToday = true;
  if (!studied.has(dayKey(today * DAY))) {
    anchor = today - 1;
    activeToday = false;
    if (!studied.has(dayKey(anchor * DAY))) return { days: 0, activeToday: false };
  }
  let days = 0;
  while (studied.has(dayKey((anchor - days) * DAY))) days++;
  return { days, activeToday };
}

/** The streak as the one line the panel shows, or `null` without a streak. */
export function streakLine(streak: LearningStreak): string | null {
  if (streak.days <= 0) return null;
  const line = `${streak.days}-day streak`;
  return streak.activeToday ? line : `${line} — study today to keep it going`;
}
