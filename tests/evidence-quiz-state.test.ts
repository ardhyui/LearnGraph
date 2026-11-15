/**
 * Direct unit tests for the review-schedule half of the generic quiz helpers
 * in `src/lib/evidence/quiz.ts`: `reviewWasDue` and `quizStatePatch`.
 *
 * `tests/learning-evidence.test.ts` only touched them through the quiz service,
 * and `tests/evidence-quiz.test.ts` (PR #90) already locks the bank/grading
 * helpers. This file imports the module directly (node:test, no PGlite or DOM)
 * and pins the exact branches: which prior states are reviewable, how the
 * difficulty shortens the interval, how a snooze is ignored, and the four
 * patches a graded quiz can produce. The module itself is not changed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quizStatePatch, reviewWasDue } from '../src/lib/evidence/quiz.ts';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-11-16T12:00:00.000Z');
const ISO_NOW = NOW.toISOString();

type Prior = Parameters<typeof quizStatePatch>[0];
type Attempt = Parameters<typeof quizStatePatch>[1][number];

/** A reviewable prior: learned, due one day after `lastReviewed` by default. */
function prior(overrides: Partial<NonNullable<Prior>> = {}): NonNullable<Prior> {
  return {
    mastery: 85,
    reviewCount: 0,
    retentionStrength: 0.5,
    lastReviewed: ago(2),
    ...overrides,
  };
}

function ago(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function attempt(at: string, correct: number, total: number, ids: string[] = []): Attempt {
  return { at, correct, total, ids };
}

const FAIL_PATCH = {
  masterySource: 'quiz',
  lastAssessed: ISO_NOW,
  lastReviewed: ISO_NOW,
  reviewCount: 0,
  nextReview: ISO_NOW,
};

describe('reviewWasDue', () => {
  it('is never due for a missing or not-yet-learned prior', () => {
    assert.equal(reviewWasDue(null, undefined, NOW), false);
    assert.equal(reviewWasDue(undefined, 5, NOW), false);
    // No mastery and no dates at all.
    assert.equal(reviewWasDue({} as Prior, undefined, NOW), false);
    // Mastery below the reviewable threshold stays out, however overdue.
    assert.equal(
      reviewWasDue({ mastery: 39, lastReviewed: ago(100) } as Prior, undefined, NOW),
      false,
    );
    assert.equal(reviewWasDue({ mastery: 0, firstSeen: ago(100) } as Prior, 10, NOW), false);
    // Learned but without any usable date: no schedule to be late for.
    assert.equal(reviewWasDue({ mastery: 85 } as Prior, undefined, NOW), false);
  });

  it('counts from lastReviewed (else firstSeen) and ignores a snooze', () => {
    // firstSeen starts the clock before the first review; one day later is due.
    assert.equal(reviewWasDue({ mastery: 40, firstSeen: ago(2) } as Prior, undefined, NOW), true);
    // lastReviewed wins over an earlier or later firstSeen.
    assert.equal(
      reviewWasDue(
        { mastery: 85, reviewCount: 1, lastReviewed: ago(4), firstSeen: ago(1) } as Prior,
        0,
        NOW,
      ),
      true,
    );
    assert.equal(
      reviewWasDue(
        { mastery: 85, reviewCount: 1, lastReviewed: ago(1), firstSeen: ago(4) } as Prior,
        0,
        NOW,
      ),
      false,
    );
    // A snooze ("Remind me tomorrow") is ignored: the regular schedule decides.
    assert.equal(
      reviewWasDue(
        prior({ lastReviewed: ago(4), nextReview: new Date(NOW.getTime() + DAY_MS).toISOString() }),
        undefined,
        NOW,
      ),
      true,
    );
  });

  it('shortens the interval with difficulty and is due exactly from the due instant', () => {
    // Review count 1 gives a three-day base interval; difficulty 10 cuts it to two.
    assert.equal(reviewWasDue(prior({ reviewCount: 1, lastReviewed: ago(2) }), 0, NOW), false);
    assert.equal(reviewWasDue(prior({ reviewCount: 1, lastReviewed: ago(2) }), 10, NOW), true);
    // null/undefined difficulty means 0, not the hardest value.
    assert.equal(reviewWasDue(prior({ reviewCount: 1, lastReviewed: ago(2) }), null, NOW), false);
    assert.equal(
      reviewWasDue(prior({ reviewCount: 1, lastReviewed: ago(2) }), undefined, NOW),
      false,
    );
    assert.equal(reviewWasDue(prior({ reviewCount: 1, lastReviewed: ago(1) }), 0, NOW), false);
    assert.equal(reviewWasDue(prior({ reviewCount: 1, lastReviewed: ago(3) }), 10, NOW), true);
    // First review: one day, true on the due millisecond and false a millisecond earlier.
    const learned = { mastery: 40, reviewCount: 0 };
    assert.equal(reviewWasDue({ ...learned, lastReviewed: ago(2) } as Prior, 0, NOW), true);
    const justBefore = new Date(NOW.getTime() - DAY_MS + 1).toISOString();
    assert.equal(reviewWasDue({ ...learned, lastReviewed: justBefore } as Prior, 0, NOW), false);
    const exactlyDue = new Date(NOW.getTime() - DAY_MS).toISOString();
    assert.equal(reviewWasDue({ ...learned, lastReviewed: exactlyDue } as Prior, 0, NOW), true);
  });
});

describe('quizStatePatch', () => {
  it('treats an empty attempt list as a failure and restarts the schedule', () => {
    const { patch, wasDue } = quizStatePatch(null, [], undefined, NOW);
    assert.equal(wasDue, false);
    assert.deepEqual(patch, {
      mastery: 0,
      ...FAIL_PATCH,
      retentionStrength: 0.3,
    });
    // The prior strength still shrinks, but never below 0.1.
    const weak = quizStatePatch(prior({ retentionStrength: 0.3 }), [], undefined, NOW);
    assert.equal(weak.patch.retentionStrength, 0.1);
  });

  it('derives failed-last mastery from its accuracy, ignoring an earlier pass', () => {
    const attempts = [attempt(ago(3), 4, 4, ['a']), attempt(ago(1), 2, 4, ['b'])];
    const { patch, wasDue } = quizStatePatch(
      prior({ retentionStrength: 0.3 }),
      attempts,
      undefined,
      NOW,
    );
    assert.equal(wasDue, true);
    assert.deepEqual(patch, {
      mastery: 35,
      ...FAIL_PATCH,
      retentionStrength: 0.1,
    });
    // 3/4 and 0/0 round to 53 and 0; reviewCount restarts even after five reviews.
    assert.equal(quizStatePatch(null, [attempt(ago(1), 3, 4)], undefined, NOW).patch.mastery, 53);
    const zero = quizStatePatch(prior({ reviewCount: 5 }), [attempt(ago(1), 0, 0)], undefined, NOW);
    assert.equal(zero.patch.mastery, 0);
    assert.equal(zero.patch.reviewCount, 0);
    assert.equal(zero.patch.nextReview, ISO_NOW);
  });

  it('orders attempts by their timestamp, not by array order, without mutating them', () => {
    const olderPass = attempt(ago(3), 4, 4, ['a']);
    const newerFail = attempt(ago(1), 1, 4, ['b']);
    const forwards = [olderPass, newerFail];
    const backwards = [newerFail, olderPass];
    const snapshot = structuredClone(forwards);
    const before = structuredClone(prior());

    const a = quizStatePatch(prior(), forwards, undefined, NOW);
    const b = quizStatePatch(prior(), backwards, undefined, NOW);

    // The later attempt (1/4) is graded, even when it comes first in the array.
    assert.equal(a.patch.mastery, 18);
    assert.deepEqual(b, a);
    assert.deepEqual(forwards, snapshot);
    assert.deepEqual(prior(), before);
  });

  it('starts the schedule for a first pass and ignores distinct-id requirements', () => {
    const expected = {
      mastery: 85,
      masterySource: 'quiz',
      lastAssessed: ISO_NOW,
      lastReviewed: ISO_NOW,
      reviewCount: 0,
      retentionStrength: 0.8,
      nextReview: ISO_NOW,
    };
    const fresh = quizStatePatch(null, [attempt(ago(1), 4, 5)], undefined, NOW);
    assert.equal(fresh.wasDue, false);
    assert.deepEqual(fresh.patch, expected);
    // A prior below the reviewable threshold counts as not learned; its strength is replaced.
    const almost = quizStatePatch(
      prior({ mastery: 39, retentionStrength: 0.2, lastReviewed: ago(100) }),
      [attempt(ago(1), 4, 5, [])],
      undefined,
      NOW,
    );
    assert.equal(almost.wasDue, false);
    assert.deepEqual(almost.patch, expected);
    // Rough edge: 1/0 passes because 1 / max(1, 0) = 1.
    assert.equal(quizStatePatch(null, [attempt(ago(1), 1, 0)], undefined, NOW).patch.mastery, 85);
  });

  it('grows the interval when a learned concept passes a due review', () => {
    const { patch, wasDue } = quizStatePatch(
      prior({ reviewCount: 1, lastReviewed: ago(5), retentionStrength: 0.95 }),
      [attempt(ago(1), 3, 3)],
      undefined,
      NOW,
    );
    assert.equal(wasDue, true);
    assert.deepEqual(patch, {
      mastery: 85,
      masterySource: 'quiz',
      lastAssessed: ISO_NOW,
      lastReviewed: ISO_NOW,
      reviewCount: 2,
      retentionStrength: 1,
      nextReview: ISO_NOW,
    });
    // A missing or null reviewCount counts as zero, so this becomes the first review.
    const absent = quizStatePatch(
      prior({
        mastery: 60,
        reviewCount: null as unknown as number,
        lastReviewed: ago(50),
        retentionStrength: 0.2,
      }),
      [attempt(ago(1), 3, 3)],
      undefined,
      NOW,
    );
    assert.equal(absent.patch.reviewCount, 1);
    assert.equal(absent.patch.retentionStrength, 0.3);
    const nulled = quizStatePatch(
      prior({ mastery: 60, reviewCount: undefined, lastReviewed: ago(50), retentionStrength: 0.2 }),
      [attempt(ago(1), 3, 3)],
      undefined,
      NOW,
    );
    assert.equal(nulled.patch.reviewCount, 1);
  });

  it('keeps the schedule untouched when a learned concept passes before it is due', () => {
    const { patch, wasDue } = quizStatePatch(
      prior({ reviewCount: 2, lastReviewed: ago(1), retentionStrength: 0.5 }),
      [attempt(ago(1), 3, 3)],
      undefined,
      NOW,
    );
    assert.equal(wasDue, false);
    // Only the base fields: an early retake never stretches the interval.
    assert.deepEqual(patch, {
      mastery: 85,
      masterySource: 'quiz',
      lastAssessed: ISO_NOW,
    });
  });

  it('clamps the prior retention strength to 0..1 and defaults non-finite values', () => {
    const duePrior = (retentionStrength: number) =>
      prior({ reviewCount: 1, lastReviewed: ago(10), retentionStrength });
    const pass = [attempt(ago(1), 3, 3)];
    const fail = [attempt(ago(1), 1, 4)];

    assert.equal(
      quizStatePatch(prior({ retentionStrength: Infinity }), fail, undefined, NOW).patch
        .retentionStrength,
      0.3,
    );
    assert.equal(
      quizStatePatch(prior({ retentionStrength: NaN }), fail, undefined, NOW).patch
        .retentionStrength,
      0.3,
    );
    assert.equal(
      quizStatePatch(prior({ retentionStrength: -3 }), fail, undefined, NOW).patch
        .retentionStrength,
      0.1,
    );
    assert.equal(
      quizStatePatch(prior({ retentionStrength: 4 }), fail, undefined, NOW).patch.retentionStrength,
      0.8,
    );
    assert.equal(
      quizStatePatch(prior({ retentionStrength: Infinity }), pass, undefined, NOW).patch
        .retentionStrength,
      0.6,
    );
    assert.equal(
      quizStatePatch(duePrior(Infinity), pass, undefined, NOW).patch.retentionStrength,
      0.6,
    );
    assert.equal(quizStatePatch(duePrior(4), pass, undefined, NOW).patch.retentionStrength, 1);
    assert.equal(quizStatePatch(duePrior(-3), pass, undefined, NOW).patch.retentionStrength, 0.1);
    // An absent strength behaves like 0.5.
    assert.equal(
      quizStatePatch(prior({ retentionStrength: undefined }), fail, undefined, NOW).patch
        .retentionStrength,
      0.3,
    );
    const missing = prior({ reviewCount: 1, lastReviewed: ago(10) });
    delete (missing as { retentionStrength?: number }).retentionStrength;
    assert.equal(quizStatePatch(missing, pass, undefined, NOW).patch.retentionStrength, 0.6);
  });

  it('always stamps quiz as the source and now as the assessment, matching reviewWasDue', () => {
    const cases: Array<[string, Prior, Attempt[], number | null | undefined]> = [
      ['empty', null, [], undefined],
      ['failed', prior(), [attempt(ago(1), 1, 4)], 0],
      ['first pass', null, [attempt(ago(1), 3, 3)], null],
      ['due pass', prior({ reviewCount: 1, lastReviewed: ago(5) }), [attempt(ago(1), 3, 3)], 0],
      ['early pass', prior({ reviewCount: 2, lastReviewed: ago(1) }), [attempt(ago(1), 3, 3)], 10],
    ];
    for (const [label, state, attempts, difficulty] of cases) {
      const result = quizStatePatch(state, attempts, difficulty, NOW);
      assert.equal(result.wasDue, reviewWasDue(state, difficulty, NOW), label);
      assert.equal(result.patch.masterySource, 'quiz', label);
      assert.equal(result.patch.lastAssessed, ISO_NOW, label);
    }
  });
});
