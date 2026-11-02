/**
 * Snoozed reviews are shown, not hidden: Gap Analysis lists reviews postponed
 * with "Remind me tomorrow" ("Snoozed until tomorrow") and the Today panel
 * summarises them, without ever counting them as due.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isReviewDue, snoozedReviewUntil, snoozedReviews } from '../src/lib/graph/spacing.ts';
import { snoozeLabel, snoozedSummary } from '../src/lib/gaps.ts';
import { applyReviewOutcome, applySnooze } from '../src/lib/study.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 3, 15, 0); // 3 Nov 2026, 15:00 local
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

// reviewCount 2 → 7-day interval; last reviewed 10 days ago → 3 days overdue.
const overdue = { conceptId: 'c:overdue', mastery: 90, reviewCount: 2, retentionStrength: 0.8, lastReviewed: at(-10) };

describe('which reviews count as snoozed', () => {
  it('a snoozed overdue review is snoozed until the snooze ends — and never due meanwhile', () => {
    const snoozed = { ...overdue, ...applySnooze(NOW) };
    assert.equal(snoozedReviewUntil(snoozed, null, NOW), Date.parse(at(1)));
    assert.equal(isReviewDue(snoozed, null, NOW), false);
    // Once the snooze ends it is due again, and no longer "snoozed".
    const later = new Date(Date.parse(at(1)) + 1);
    assert.equal(snoozedReviewUntil(snoozed, null, later), null);
    assert.equal(isReviewDue(snoozed, null, later), true);
  });

  it('is not snoozed without a snooze, after answering, or when not learned yet', () => {
    assert.equal(snoozedReviewUntil(overdue, null, NOW), null);
    const snoozed = { ...overdue, ...applySnooze(NOW) };
    const answered = { ...snoozed, ...applyReviewOutcome(snoozed, 'remembered', NOW) };
    assert.equal(snoozedReviewUntil(answered, null, NOW), null);
    assert.equal(snoozedReviewUntil({ ...snoozed, mastery: 20 }, null, NOW), null);
    assert.equal(snoozedReviewUntil({ ...overdue, nextReview: 'garbage' }, null, NOW), null);
  });

  it('a "snooze" on a review that is not due yet is not shown as snoozed', () => {
    // Reviewed today: due in 7 days, so a 1-day nextReview changes nothing.
    const fresh = { conceptId: 'c:fresh', mastery: 90, reviewCount: 2, lastReviewed: NOW.toISOString(), nextReview: at(1) };
    assert.equal(snoozedReviewUntil(fresh, null, NOW), null);
  });

  it('lists snoozed reviews soonest back first, skipping the rest', () => {
    const a = { ...overdue, conceptId: 'c:a', nextReview: at(2) };
    const b = { ...overdue, conceptId: 'c:b', nextReview: at(1) };
    const c = { ...overdue, conceptId: 'c:c' }; // due, not snoozed
    const list = snoozedReviews([a, b, c], () => null, NOW);
    assert.deepEqual(list, [
      { conceptId: 'c:b', until: Date.parse(at(1)) },
      { conceptId: 'c:a', until: Date.parse(at(2)) },
    ]);
    assert.deepEqual(snoozedReviews([], () => null, NOW), []);
  });
});

describe('snooze wording', () => {
  it('says when the review comes back in plain words', () => {
    assert.equal(snoozeLabel(Date.parse(at(1)), NOW), 'Snoozed until tomorrow');
    assert.equal(snoozeLabel(new Date(2026, 10, 3, 20, 0), NOW), 'Snoozed until later today');
    assert.equal(snoozeLabel(new Date(2026, 10, 9, 9, 0), NOW), 'Snoozed until Mon, Nov 9');
    assert.equal(snoozeLabel('nope', NOW), 'Snoozed for now');
  });

  it('summarises them for the Today panel', () => {
    const tomorrow = Date.parse(at(1));
    assert.equal(snoozedSummary([], NOW), '');
    assert.equal(snoozedSummary([tomorrow], NOW), '1 review snoozed until tomorrow');
    assert.equal(snoozedSummary([tomorrow, tomorrow + 1000], NOW), '2 reviews snoozed until tomorrow');
    assert.equal(
      snoozedSummary([tomorrow, new Date(2026, 10, 9, 9).getTime()], NOW),
      '2 reviews snoozed — the first until tomorrow',
    );
  });
});
