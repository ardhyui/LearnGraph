/**
 * "Refresh example data" (Roadmap P0 #2): workspaces seeded before round #17
 * still carry the example progress of 2024, so every example concept looks
 * months overdue. This computes the date-only changes that move the demo
 * learners' progress back to "as of now", using the same shift as a fresh seed
 * (`shiftDemoDate`). Pure functions (no I/O); the caller applies the patches
 * through trusted, account-scoped server code.
 *
 * Only dates move. Mastery, review counts, mastery sources, misconceptions and
 * interactions are never part of a patch, and only learners from
 * `demoLearners` ever get one.
 */
import { DEMO_DATA_AS_OF, demoKnowledgeStates, demoLearners, shiftDemoDate } from './demo-data.ts';
import type { KnowledgeState } from './graph/types.ts';

/**
 * Example dates at or before this cutoff are the pre-#17 ones (written in
 * 2024). A date seeded after #17 is always later, even when it is intentionally
 * a few months old (the oldest example review keeps its 6-month gap). So this
 * separates "never refreshed" from "already relative to a newer date" without
 * ever treating an old-but-intended review as stale again.
 */
export const DEMO_REFRESH_CUTOFF = DEMO_DATA_AS_OF;

const CUTOFF_MS = Date.parse(DEMO_REFRESH_CUTOFF);

export interface DemoStateDatesPatch {
  userId: string;
  conceptId: string;
  firstSeen?: string;
  lastReviewed?: string;
  nextReview?: string;
}

const DEMO_LEARNER_IDS = new Set(demoLearners.map((l) => l.userId));

/** First-seen / last-reviewed dates the demo fixture was written with. */
const RAW_DATES = new Map<string, { firstSeen?: string; lastReviewed?: string }>();
for (const state of demoKnowledgeStates) {
  const raw = state as { learnerId?: string; conceptId?: string; createdAt?: string; lastReviewed?: string };
  const learnerId = raw.learnerId;
  const conceptId = (raw.conceptId ?? '').replace(/^concept:/, '');
  if (!learnerId || !conceptId) continue;
  RAW_DATES.set(`${learnerId}\u0000${conceptId}`, {
    firstSeen: raw.createdAt,
    lastReviewed: raw.lastReviewed,
  });
}

function parseMs(iso: unknown): number | null {
  const at = Date.parse(typeof iso === 'string' ? iso : '');
  return Number.isFinite(at) ? at : null;
}

function isStale(iso: unknown): boolean {
  const at = parseMs(iso);
  // A broken or missing date is refreshed rather than kept; any usable date
  // after the legacy cutoff is left exactly as it is (including intentional
  // months-old example reviews and future dates).
  return at === null || at <= CUTOFF_MS;
}

/**
 * The date changes to move example progress to "as of now", one patch per stale
 * example state. States already refreshed (last review after the legacy cutoff)
 * are skipped, so calling this twice in a row changes nothing the second time.
 * `lastReviewed` is the anchor: a state whose review is already current is left
 * alone even if it was first seen long ago (that is meant to stay historical).
 */
export function demoRefreshPlan(
  states: readonly (Pick<KnowledgeState, 'userId' | 'conceptId' | 'firstSeen' | 'lastReviewed' | 'nextReview'> | null | undefined)[],
  now: Date,
): DemoStateDatesPatch[] {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return [];

  const patches: DemoStateDatesPatch[] = [];
  const seen = new Set<string>();
  for (const state of states) {
    if (!state || typeof state.userId !== 'string' || typeof state.conceptId !== 'string') continue;
    if (!DEMO_LEARNER_IDS.has(state.userId) || !state.conceptId) continue;
    const key = `${state.userId}\u0000${state.conceptId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Never reviewed: use the first study as the anchor (same rule as spacing).
    const anchor = state.lastReviewed ?? state.firstSeen;
    if (!isStale(anchor)) continue;

    const raw = RAW_DATES.get(key);
    const lastSource = raw?.lastReviewed ?? state.lastReviewed ?? raw?.firstSeen ?? state.firstSeen;
    const firstSource = raw?.firstSeen ?? state.firstSeen ?? raw?.lastReviewed ?? state.lastReviewed;

    const lastReviewed = shiftDemoDate(lastSource, now);
    let firstSeen = shiftDemoDate(firstSource, now);
    if (Date.parse(firstSeen) > Date.parse(lastReviewed)) firstSeen = lastReviewed;

    const patch: DemoStateDatesPatch = { userId: state.userId, conceptId: state.conceptId };
    if (firstSource !== undefined) patch.firstSeen = firstSeen;
    if (lastSource !== undefined) patch.lastReviewed = lastReviewed;

    if (typeof state.nextReview === 'string') {
      const oldLast = parseMs(state.lastReviewed ?? state.firstSeen);
      const oldNext = parseMs(state.nextReview);
      if (oldLast !== null && oldNext !== null) {
        // Keep the learner's own snooze offset relative to the review date.
        const offset = Math.max(0, oldNext - oldLast);
        patch.nextReview = new Date(Math.min(Date.parse(lastReviewed) + offset, nowMs)).toISOString();
      } else {
        patch.nextReview = shiftDemoDate(state.nextReview, now);
      }
    }

    patches.push(patch);
  }
  return patches;
}
