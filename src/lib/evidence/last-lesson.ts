/**
 * "Continue your last lesson" for the Today panel: the concept the learner
 * touched most recently, read from the append-only event log. Pure function;
 * the server function reads the rows for one learner. No table, column or RPC.
 */
import type { LearningEvent } from './events.ts';

/** Kinds that mean the learner actually worked on a concept (reviews come back on their own). */
const LESSON_KINDS = new Set<LearningEvent['kind']>(['study', 'quiz', 'practice', 'lesson']);

export interface LastLesson {
  conceptId: string;
  /** The event's own ISO timestamp, unchanged. */
  at: string;
}

type LessonEvent = Pick<LearningEvent, 'kind' | 'conceptId' | 'source' | 'createdAt'>;

/**
 * The most recent concept the learner studied, or `null` when the log has no
 * usable rows. Only `app` events count, so the link always opens a lesson page
 * inside the app (Japanese practice keeps its own page). Rows with an empty
 * concept id or a broken timestamp are skipped without throwing, array order
 * does not matter, and on a tie the last occurrence in the array wins.
 */
export function lastLesson(events: readonly LessonEvent[]): LastLesson | null {
  let best: LastLesson | null = null;
  let bestAt = -Infinity;
  for (const e of events) {
    if (!LESSON_KINDS.has(e.kind)) continue;
    if (e.source !== 'app') continue;
    if (!e.conceptId) continue;
    const at = Date.parse(e.createdAt);
    if (!Number.isFinite(at)) continue;
    if (at >= bestAt) {
      bestAt = at;
      best = { conceptId: e.conceptId, at: e.createdAt };
    }
  }
  return best;
}
