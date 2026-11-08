/**
 * "Today's session" (Roadmap M2, from the "Sesi hari ini" pattern on
 * /japanese): due reviews first, then the next concepts to learn, fitted into
 * the time the learner has, with short breaks paced by the profile's
 * `attentionSpan` and `pacePreference`. Pure, unit-tested.
 */
import type { CognitiveProfile, LearningStyle } from './graph/types.ts';

/** A review is a short quiz (or a quick self-check). */
export const REVIEW_MINUTES = 3;
/** One sitting of a new lesson, whatever the whole concept takes to master. */
export const MIN_LESSON_MINUTES = 5;
export const MAX_LESSON_MINUTES = 20;
export const SESSION_LENGTHS = [15, 30, 45, 60] as const;

export type SessionStep =
  | { kind: 'review'; conceptId: string; name: string; minutes: number }
  | { kind: 'learn'; conceptId: string; name: string; minutes: number }
  | { kind: 'break'; minutes: number };

export interface SessionInput {
  /** Time the learner has (minutes). */
  minutes: number;
  /** Due reviews, most urgent first. */
  reviews: { conceptId: string; name: string }[];
  /** Concepts to learn next, best first, with the lesson's estimated minutes. */
  next: { conceptId: string; name: string; minutes?: number | null }[];
  pace?: LearningStyle['pacePreference'] | null;
  attentionSpan?: CognitiveProfile['attentionSpan'] | null;
}

export interface SessionPlan {
  steps: SessionStep[];
  /** Minutes of all steps, breaks included. */
  plannedMinutes: number;
  /** Focus time between breaks, from the profile. */
  focusMinutes: number;
  breakMinutes: number;
  /** What did not fit (for "more tomorrow"). */
  left: { reviews: number; next: number };
}

const FOCUS_BY_ATTENTION = { short: 15, medium: 25, long: 40 } as const;

/** Focus block and break length: shorter blocks for a short attention span, fewer breaks for intensive pace. */
export function sessionPacing(
  attentionSpan?: SessionInput['attentionSpan'],
  pace?: SessionInput['pace'],
): { focusMinutes: number; breakMinutes: number } {
  const focus = FOCUS_BY_ATTENTION[attentionSpan ?? 'medium'] ?? FOCUS_BY_ATTENTION.medium;
  if (pace === 'intensive') return { focusMinutes: Math.round(focus * 1.5), breakMinutes: 3 };
  return { focusMinutes: focus, breakMinutes: 5 };
}

export function lessonSitting(minutes: number | null | undefined): number {
  const m = typeof minutes === 'number' && Number.isFinite(minutes) ? Math.round(minutes) : 10;
  return Math.min(MAX_LESSON_MINUTES, Math.max(MIN_LESSON_MINUTES, m));
}

/**
 * Fit reviews (first: retrieval before new material) and lessons into the
 * time available. An item that does not fit is left for later, but the first
 * item is always planned so a short session still has something to do. A
 * break is suggested whenever the next step would run past the focus block.
 */
export function buildSessionPlan(input: SessionInput): SessionPlan {
  const budget = Math.max(0, Math.floor(input.minutes));
  const { focusMinutes, breakMinutes } = sessionPacing(input.attentionSpan, input.pace);
  const candidates: Exclude<SessionStep, { kind: 'break' }>[] = [
    ...input.reviews.map((r) => ({ kind: 'review' as const, conceptId: r.conceptId, name: r.name, minutes: REVIEW_MINUTES })),
    ...input.next.map((n) => ({ kind: 'learn' as const, conceptId: n.conceptId, name: n.name, minutes: lessonSitting(n.minutes) })),
  ];
  const steps: SessionStep[] = [];
  let used = 0;
  let sinceBreak = 0;
  const left = { reviews: 0, next: 0 };
  for (const item of candidates) {
    const needsBreak = sinceBreak > 0 && sinceBreak + item.minutes > focusMinutes;
    const cost = item.minutes + (needsBreak ? breakMinutes : 0);
    if (steps.length > 0 && used + cost > budget) {
      if (item.kind === 'review') left.reviews++;
      else left.next++;
      continue;
    }
    if (needsBreak) {
      steps.push({ kind: 'break', minutes: breakMinutes });
      used += breakMinutes;
      sinceBreak = 0;
    }
    steps.push(item);
    used += item.minutes;
    sinceBreak += item.minutes;
  }
  return { steps, plannedMinutes: used, focusMinutes, breakMinutes, left };
}
