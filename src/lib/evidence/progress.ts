/**
 * Multi-week progress for the `/progress` page, counted from the append-only
 * learning event log (`learning_events`). Pure functions; the server function
 * reads the rows for one learner. No table, column or RPC.
 *
 * Weeks are UTC calendar weeks that start on Monday, so SSR, the server and
 * every browser agree on where a week begins. Empty weeks are kept, and only
 * events up to `now` are counted; broken or future timestamps are ignored
 * rather than throwing.
 */
import { dueReviewRetention, type LearningEvent, type RetentionStat } from './events.ts';
import { finishesConcept } from './measures.ts';
import { dayKey, STUDY_KINDS, studyDayKeys } from './streak.ts';

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** One Monday-to-Sunday bucket of the event log. */
export interface WeeklyBucket {
  /** Monday 00:00 UTC, inclusive. */
  startsAt: string;
  /** Next Monday 00:00 UTC, exclusive. */
  endsAt: string;
  /** Distinct UTC days with a study event (quiz, study, review, practice, lesson). */
  activeDays: number;
  /** Every event in the week, including snoozes and tutor ratings. */
  events: number;
  /** Due reviews answered (quiz or self-report). */
  reviewsDue: number;
  /** Of those, answered correctly (quiz passed / "I remembered it"). */
  reviewsCorrect: number;
  /** Quizzes passed. */
  quizzesPassed: number;
  /** Distinct concepts whose quiz passed or that got "I've got it" this week. */
  conceptsFinished: number;
  /** Lessons opened from the lesson page. */
  lessonsOpened: number;
}

/** Retention at review time for one week (`null` with no due review answered). */
export interface WeeklyRetention extends RetentionStat {
  startsAt: string;
  endsAt: string;
}

interface WeekWindow {
  startsAt: number;
  endsAt: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Monday 00:00 UTC of the week that contains `ms`. */
function startOfUtcWeek(ms: number): number {
  const day = Math.floor(ms / DAY);
  // getUTCDay: Sunday = 0 … Saturday = 6; count back to Monday.
  const sinceMonday = (new Date(day * DAY).getUTCDay() + 6) % 7;
  return (day - sinceMonday) * DAY;
}

/** The last `weeks` Monday-to-Sunday windows, oldest first, ending with the current week. */
function weekWindows(now: string | Date, weeks: number): WeekWindow[] {
  const t = new Date(now).getTime();
  const count = Math.max(0, Math.floor(weeks));
  if (!Number.isFinite(t) || count === 0) return [];
  const current = startOfUtcWeek(t);
  return Array.from({ length: count }, (_, index) => {
    const startsAt = current - (count - 1 - index) * WEEK;
    return { startsAt, endsAt: startsAt + WEEK };
  });
}

/** The window index that contains `at`, or -1 when it is outside every window. */
function windowIndex(windows: readonly WeekWindow[], at: number): number {
  return windows.findIndex((w) => at >= w.startsAt && at < w.endsAt);
}

/**
 * The last `weeks` weeks (default eight), oldest first, including empty ones.
 * Only events up to `now` count, and an event exactly at a Monday 00:00 UTC
 * belongs to the week that starts then. An invalid `now` or a non-positive
 * `weeks` returns an empty list.
 */
export function weeklyBuckets(
  events: readonly LearningEvent[],
  now: string | Date,
  weeks = 8,
): WeeklyBucket[] {
  const t = new Date(now).getTime();
  const windows = weekWindows(now, weeks);
  if (!Number.isFinite(t) || windows.length === 0) return [];
  const buckets: WeeklyBucket[] = windows.map((w) => ({
    startsAt: iso(w.startsAt),
    endsAt: iso(w.endsAt),
    activeDays: 0,
    events: 0,
    reviewsDue: 0,
    reviewsCorrect: 0,
    quizzesPassed: 0,
    conceptsFinished: 0,
    lessonsOpened: 0,
  }));
  const days = windows.map(() => new Set<string>());
  const finished = windows.map(() => new Set<string>());

  for (const e of events) {
    const at = Date.parse(e.createdAt);
    if (!Number.isFinite(at) || at > t) continue;
    const index = windowIndex(windows, at);
    if (index < 0) continue;
    const bucket = buckets[index];
    bucket.events++;
    if (e.kind === 'lesson') bucket.lessonsOpened++;
    if (e.kind === 'quiz' && e.outcome === 'passed') bucket.quizzesPassed++;
    if (finishesConcept(e)) finished[index].add(e.conceptId);
    if (e.wasDue === true && (e.kind === 'quiz' || e.kind === 'review')) {
      bucket.reviewsDue++;
      if (
        (e.kind === 'quiz' && e.outcome === 'passed') ||
        (e.kind === 'review' && e.outcome === 'remembered')
      ) {
        bucket.reviewsCorrect++;
      }
    }
    if (STUDY_KINDS.has(e.kind)) days[index].add(dayKey(at));
  }
  buckets.forEach((bucket, index) => {
    bucket.activeDays = days[index].size;
    bucket.conceptsFinished = finished[index].size;
  });
  return buckets;
}

/**
 * Due-review retention per week, aligned with `weeklyBuckets`. Quizzes and
 * self-reports are combined through the same `dueReviewRetention` definition
 * used by the other pages; weeks without a due review answered stay `null`
 * instead of showing a misleading 0%.
 */
export function retentionByWeek(
  events: readonly LearningEvent[],
  now: string | Date,
  weeks = 8,
): WeeklyRetention[] {
  const t = new Date(now).getTime();
  const windows = weekWindows(now, weeks);
  if (!Number.isFinite(t) || windows.length === 0) return [];
  const grouped = windows.map(
    () => [] as Pick<LearningEvent, 'kind' | 'outcome' | 'wasDue'>[],
  );
  for (const e of events) {
    const at = Date.parse(e.createdAt);
    if (!Number.isFinite(at) || at > t) continue;
    const index = windowIndex(windows, at);
    if (index >= 0) grouped[index].push(e);
  }
  return windows.map((w, index) => {
    const { quiz, selfReport } = dueReviewRetention(grouped[index]);
    const answered = quiz.answered + selfReport.answered;
    const correct = quiz.correct + selfReport.correct;
    return {
      startsAt: iso(w.startsAt),
      endsAt: iso(w.endsAt),
      answered,
      correct,
      rate: answered ? correct / answered : null,
    };
  });
}

/**
 * The longest run of consecutive study days in the whole log (not only the
 * last eight weeks), ignoring broken and future timestamps. A current streak
 * shorter than an earlier best does not hide the best.
 */
export function bestStreak(events: readonly LearningEvent[], now: string | Date): number {
  const days = [...studyDayKeys(events, now)]
    .map((key) => Date.parse(`${key}T00:00:00.000Z`) / DAY)
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    previous = day;
    if (run > best) best = run;
  }
  return best;
}

/** "Nov 16 – Nov 22": the inclusive Sunday end of a Monday-to-Sunday week, in English. */
export function weekRangeLabel(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(new Date(endsAt).getTime() - DAY);
  const format = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${format.format(start)} – ${format.format(end)}`;
}

/** A week's retention as "73%", or an em dash when no due review was answered. */
export function retentionPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** The supporting line under a week's dates, without noisy zero-only rows. */
export function weekDetailLine(bucket: WeeklyBucket): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    plural(bucket.activeDays, 'active day', 'active days'),
    ...(bucket.quizzesPassed > 0 ? [plural(bucket.quizzesPassed, 'quiz passed', 'quizzes passed')] : []),
    ...(bucket.conceptsFinished > 0
      ? [plural(bucket.conceptsFinished, 'concept finished', 'concepts finished')]
      : []),
    ...(bucket.lessonsOpened > 0
      ? [plural(bucket.lessonsOpened, 'lesson opened', 'lessons opened')]
      : []),
    ...(bucket.reviewsDue > 0
      ? [plural(bucket.reviewsDue, 'due review answered', 'due reviews answered')]
      : []),
  ];
  return parts.join(' · ');
}
