/**
 * The roadmap's measures of success ("Ukuran keberhasilan" in Roadmap.md),
 * computed for one workspace from its own event log. Nothing is sent to an
 * analytics service. Pure functions; `getLearningMeasures` reads the rows.
 *
 * Not measurable from the log yet: session completion (starting and finishing
 * a study session is not recorded) and quiz results with and without
 * personalisation (needs a comparison group). The tutor comparison is the one
 * personalisation measure the log has.
 */
import { dueReviewRetention, tutorPreference, type LearningEvent, type RetentionStat } from './events.ts';

const DAY = 86_400_000;

/** Events where someone learned something (not postponing, not asking the tutor). */
const LEARNING_KINDS: ReadonlySet<string> = new Set(['quiz', 'study', 'review', 'practice', 'lesson']);

type MeasureEvent = Pick<LearningEvent, 'kind' | 'outcome' | 'wasDue' | 'learnerId' | 'createdAt'>;

export interface ReturnStat {
  /** Learners who learned something 8 to 14 days ago. */
  activeBefore: number;
  /** Of those, learners who learned something again in the last 7 days. */
  returned: number;
  /** returned / activeBefore, or `null` when nobody was active the week before. */
  rate: number | null;
}

/**
 * "Kembali belajar": of the learners who learned something in the week before
 * last (from 14 up to 7 days ago), the share who learned again in the last 7 days.
 */
export function returningLearners(events: readonly MeasureEvent[], now: Date): ReturnStat {
  const t = now.getTime();
  const before = new Set<string>();
  const recent = new Set<string>();
  for (const e of events) {
    if (!LEARNING_KINDS.has(e.kind)) continue;
    const at = Date.parse(e.createdAt);
    if (!Number.isFinite(at) || at > t) continue;
    if (at > t - 7 * DAY) recent.add(e.learnerId);
    else if (at > t - 14 * DAY) before.add(e.learnerId);
  }
  const returned = [...before].filter((id) => recent.has(id)).length;
  return { activeBefore: before.size, returned, rate: before.size ? returned / before.size : null };
}

/** A concept finished: a quiz passed, or "I've got it" on a concept without a quiz. */
export function finishesConcept(e: Pick<LearningEvent, 'kind' | 'outcome'>): boolean {
  return (e.kind === 'quiz' && e.outcome === 'passed') || (e.kind === 'study' && e.outcome === 'got-it');
}

export interface ActivationStat {
  /** When the first concept was finished, or `null` if none yet. */
  firstFinishedAt: string | null;
  /** Minutes from creating the account to that moment (`null` if none yet). */
  minutes: number | null;
}

/** "Aktivasi": time from creating the account to finishing the first concept. */
export function activationTime(accountCreatedAt: string | null, events: readonly MeasureEvent[]): ActivationStat {
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  let first: number | null = null;
  for (const e of events) {
    if (!finishesConcept(e)) continue;
    const at = Date.parse(e.createdAt);
    if (Number.isFinite(at) && (first === null || at < first)) first = at;
  }
  if (first === null) return { firstFinishedAt: null, minutes: null };
  return {
    firstFinishedAt: new Date(first).toISOString(),
    minutes: Number.isFinite(created) ? Math.max(0, Math.round((first - created) / 60_000)) : null,
  };
}

export interface LearningMeasures {
  /** Events in the log that these measures were computed from. */
  events: number;
  /** Retention at review time, from quizzes and from self-reports. */
  retention: { quiz: RetentionStat; selfReport: RetentionStat };
  /**
   * "Kalibrasi laporan diri": self-reported minus quiz-checked retention, in
   * percentage points (positive = learners rate themselves higher than quizzes
   * do). `null` until both have been answered.
   */
  calibrationGap: number | null;
  returning: ReturnStat;
  activation: ActivationStat;
  /** How often the tutor answer that knew the learner was preferred (blind comparison). */
  tutor: ReturnType<typeof tutorPreference>;
}

export interface MeasureRow {
  id: 'retention' | 'calibration' | 'returning' | 'activation' | 'session' | 'personalisation';
  label: string;
  /** What the log says, in plain words. */
  value: string;
  /** The first target from Roadmap.md. */
  target: string;
}

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function duration(minutes: number): string {
  if (minutes < 60) return plural(minutes, 'minute', 'minutes');
  if (minutes < 48 * 60) return plural(Math.round(minutes / 60), 'hour', 'hours');
  return plural(Math.round(minutes / (24 * 60)), 'day', 'days');
}

/** The measures as rows for the Status page, in the order of the roadmap table. */
export function measureRows(m: LearningMeasures): MeasureRow[] {
  const { quiz, selfReport } = m.retention;
  const retentionParts = [
    quiz.rate !== null ? `quizzes ${pct(quiz.rate)} of ${quiz.answered}` : null,
    selfReport.rate !== null ? `self-reports ${pct(selfReport.rate)} of ${selfReport.answered}` : null,
  ].filter(Boolean);
  const gap = m.calibrationGap;
  const { tutor } = m;
  return [
    {
      id: 'retention',
      label: 'Remembered at review time',
      value: retentionParts.length ? `Due reviews answered correctly: ${retentionParts.join(', ')}` : 'No due reviews answered yet',
      target: 'Close to what the review schedule predicts',
    },
    {
      id: 'calibration',
      label: 'Self-reports compared with quizzes',
      value:
        gap === null
          ? 'Needs due reviews answered both ways'
          : gap === 0
            ? 'Self-reports match quiz results'
            : `Self-reports are ${plural(Math.abs(gap), 'point', 'points')} ${gap > 0 ? 'higher' : 'lower'} than quiz results`,
      target: 'Watched; the basis for reviewing decision D5',
    },
    {
      id: 'returning',
      label: 'Came back the next week',
      value:
        m.returning.rate === null
          ? 'No learner was active 8–14 days ago'
          : `${m.returning.returned} of ${plural(m.returning.activeBefore, 'learner', 'learners')} active 8–14 days ago learned again in the last 7 days (${pct(m.returning.rate)})`,
      target: 'Set after 4 weeks of data',
    },
    {
      id: 'activation',
      label: 'First concept finished',
      value:
        m.activation.minutes === null
          ? m.activation.firstFinishedAt
            ? 'Finished, but the account’s start date is unknown'
            : 'No concept finished yet'
          : `${duration(m.activation.minutes)} after the account was created`,
      target: 'Under 5 minutes',
    },
    {
      id: 'session',
      label: 'Study sessions finished',
      value: 'Not recorded yet: starting and finishing a session is not logged',
      target: '80%',
    },
    {
      id: 'personalisation',
      label: 'Personalisation (tutor comparison)',
      value: tutor.compared
        ? `The answer that knew the learner was preferred in ${tutor.preferContext} of ${plural(tutor.compared, 'comparison', 'comparisons')} (the other: ${tutor.preferPlain}, no difference: ${tutor.same})`
        : 'No blind comparisons yet',
      target: 'Better with personalisation; if not, simplify it',
    },
  ];
}

export function learningMeasures(
  events: readonly MeasureEvent[],
  accountCreatedAt: string | null,
  now: Date,
): LearningMeasures {
  const retention = dueReviewRetention(events);
  const { quiz, selfReport } = retention;
  return {
    events: events.length,
    retention,
    calibrationGap:
      quiz.rate !== null && selfReport.rate !== null ? Math.round((selfReport.rate - quiz.rate) * 100) : null,
    returning: returningLearners(events, now),
    activation: activationTime(accountCreatedAt, events),
    tutor: tutorPreference(events),
  };
}
