/**
 * The learning event log (`learning_events`, append-only): one row per quiz
 * result, self-report, review, snooze or practice note. Pure types and
 * measures here; `service.ts` writes and reads the rows.
 */

export type LearningEventKind = 'quiz' | 'study' | 'review' | 'snooze' | 'unsnooze' | 'practice' | 'lesson' | 'tutor';

/** Which part of the app wrote the event. */
export type LearningEventSource = 'app' | 'japanese';

export interface LearningEventInput {
  learnerId: string;
  conceptId: string;
  kind: LearningEventKind;
  /** e.g. `passed`/`failed`, `got-it`/`started`, `remembered`/`forgot`, `snoozed`. */
  outcome: string;
  source?: LearningEventSource;
  /** Answered while a review was due (by the regular schedule). */
  wasDue?: boolean | null;
  correct?: number | null;
  total?: number | null;
  masteryBefore?: number | null;
  masteryAfter?: number | null;
  detail?: Record<string, unknown>;
}

export interface LearningEvent extends Required<Omit<LearningEventInput, 'detail' | 'source'>> {
  id: number;
  source: LearningEventSource;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface RetentionStat {
  /** Due reviews answered. */
  answered: number;
  /** Of those, answered correctly (quiz passed / "I remembered it"). */
  correct: number;
  /** correct / answered, or `null` with nothing answered yet. */
  rate: number | null;
}

function stat(answered: number, correct: number): RetentionStat {
  return { answered, correct, rate: answered ? correct / answered : null };
}

/**
 * Retention at review time (Roadmap "Ukuran keberhasilan"): the share of due
 * reviews answered correctly, from quizzes and from self-reports separately,
 * so the two can be compared (self-report calibration).
 */
export function dueReviewRetention(
  events: readonly Pick<LearningEvent, 'kind' | 'outcome' | 'wasDue'>[],
): { quiz: RetentionStat; selfReport: RetentionStat } {
  let quiz = 0;
  let quizCorrect = 0;
  let self = 0;
  let selfCorrect = 0;
  for (const e of events) {
    if (e.wasDue !== true) continue;
    if (e.kind === 'quiz') {
      quiz++;
      if (e.outcome === 'passed') quizCorrect++;
    } else if (e.kind === 'review') {
      self++;
      if (e.outcome === 'remembered') selfCorrect++;
    }
  }
  return { quiz: stat(quiz, quizCorrect), selfReport: stat(self, selfCorrect) };
}

/**
 * Personalisation effect from the tutor comparison (Roadmap M4/M2 measure):
 * how often the answer that knew the learner was preferred over one that did not.
 */
export function tutorPreference(events: readonly Pick<LearningEvent, 'kind' | 'outcome'>[]): {
  compared: number;
  preferContext: number;
  preferPlain: number;
  same: number;
} {
  const rated = events.filter((e) => e.kind === 'tutor' && e.outcome.startsWith('prefer-'));
  const count = (o: string) => rated.filter((e) => e.outcome === o).length;
  return {
    compared: rated.length,
    preferContext: count('prefer-context'),
    preferPlain: count('prefer-plain'),
    same: count('prefer-same'),
  };
}
