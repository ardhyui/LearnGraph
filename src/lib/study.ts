/**
 * Core study loop for the dashboard ("Today"): progress summary, and how a
 * learner's self-report after studying or reviewing a concept updates their
 * knowledge state. Pure functions (no I/O) so they are unit-tested directly;
 * the dashboard sends the returned patch through `setKnowledgeState`.
 */
import type { ConceptNode, KnowledgeState } from './graph/types.ts';

/** Same thresholds as the engine (EducationGraphDB.MASTERY_THRESHOLD etc.). */
export const MASTERED_AT = 80;
/** Below this the review queue ignores a concept (not really learned yet). */
export const REVIEWABLE_AT = 40;

export interface ProgressSummary {
  total: number;
  mastered: number;
  learning: number;
  notStarted: number;
  /** 0–100, share of concepts mastered. */
  percentMastered: number;
  /** 0–100, mean mastery over all concepts (not-started counts as 0). */
  averageMastery: number;
}

export function summarizeProgress(
  concepts: Pick<ConceptNode, 'conceptId'>[],
  states: Pick<KnowledgeState, 'conceptId' | 'mastery'>[],
): ProgressSummary {
  const masteryById = new Map(states.map((s) => [s.conceptId, clamp(s.mastery, 0, 100)]));
  let mastered = 0;
  let learning = 0;
  let sum = 0;
  for (const c of concepts) {
    const m = masteryById.get(c.conceptId) ?? 0;
    sum += m;
    if (m >= MASTERED_AT) mastered++;
    else if (m > 0) learning++;
  }
  const total = concepts.length;
  return {
    total,
    mastered,
    learning,
    notStarted: total - mastered - learning,
    percentMastered: total ? Math.round((mastered / total) * 100) : 0,
    averageMastery: total ? Math.round(sum / total) : 0,
  };
}

/** Self-report after studying a new/in-progress concept. */
export type StudyOutcome = 'started' | 'got-it';
/** Self-report after a spaced-repetition review. */
export type ReviewOutcome = 'remembered' | 'forgot';

/**
 * Fields the dashboard writes back; all accepted by the server schema.
 * Interaction history / misconceptions are deliberately not touched (the
 * engine merges the patch into the stored state, so they are preserved).
 */
export type StatePatch = Pick<
  KnowledgeState,
  'mastery' | 'lastReviewed' | 'lastAssessed' | 'reviewCount' | 'retentionStrength'
>;

type PriorState = Pick<KnowledgeState, 'mastery' | 'reviewCount' | 'retentionStrength'> | null | undefined;

/**
 * "I studied this": `started` moves the concept into progress (never counts as
 * mastered); `got-it` marks it mastered and starts its review schedule (first
 * review due in a day — the engine's interval for reviewCount 0).
 */
export function applyStudyOutcome(prior: PriorState, outcome: StudyOutcome, now: Date = new Date()): StatePatch {
  const current = clamp(prior?.mastery ?? 0, 0, 100);
  const mastery =
    outcome === 'got-it'
      ? Math.max(current, 85)
      : current >= MASTERED_AT
        ? current
        : clamp(Math.max(current + 20, 50), 0, MASTERED_AT - 1);
  const iso = now.toISOString();
  return {
    mastery,
    lastReviewed: iso,
    lastAssessed: iso,
    // Already-mastered concepts keep their schedule; newly mastered ones start it.
    reviewCount: outcome === 'got-it' && current < MASTERED_AT ? 0 : (prior?.reviewCount ?? 0),
    retentionStrength: outcome === 'got-it' ? 0.8 : clamp(prior?.retentionStrength ?? 0.5, 0, 1),
  };
}

/**
 * Review result: `remembered` grows the next interval (reviewCount + 1) and
 * nudges mastery up; `forgot` restarts the schedule (due again tomorrow) and
 * lowers mastery, but keeps it reviewable so it stays in the review queue.
 */
export function applyReviewOutcome(prior: PriorState, outcome: ReviewOutcome, now: Date = new Date()): StatePatch {
  const current = clamp(prior?.mastery ?? 0, 0, 100);
  const strength = clamp(prior?.retentionStrength ?? 0.5, 0, 1);
  const mastery =
    outcome === 'remembered'
      ? clamp(Math.max(current, REVIEWABLE_AT) + 5, 0, 100)
      : clamp(current - 20, REVIEWABLE_AT, 100);
  const iso = now.toISOString();
  return {
    mastery,
    lastReviewed: iso,
    lastAssessed: iso,
    reviewCount: outcome === 'remembered' ? (prior?.reviewCount ?? 0) + 1 : 0,
    retentionStrength: round2(outcome === 'remembered' ? Math.min(1, strength + 0.1) : Math.max(0.1, strength - 0.2)),
  };
}

/** Pick the learner to show: the remembered one if it still exists, else the first. */
export function pickActiveLearner(learnerIds: string[], remembered: string | null | undefined): string | null {
  if (remembered && learnerIds.includes(remembered)) return remembered;
  return learnerIds[0] ?? null;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
