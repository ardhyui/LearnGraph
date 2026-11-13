/**
 * Snoozed reviews are shown, not hidden: Gap Analysis lists reviews postponed
 * with "Remind me tomorrow" ("Snoozed until tomorrow") and the Today panel
 * summarises them, without ever counting them as due.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { isReviewDue, snoozedReviewUntil, snoozedReviews } from '../src/lib/graph/spacing.ts';
import { conceptNameMap, namedSnoozedReviews, snoozeLabel, snoozedSummary } from '../src/lib/gaps.ts';
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

describe('snoozed reviews per item on Today', () => {
  it('pairs every snoozed review with a learner-facing name, in the same order', () => {
    const names = conceptNameMap([
      { conceptId: 'concept:fractions', name: 'Fractions' },
      { conceptId: 'concept:decimals', name: '  ' },
    ]);
    assert.deepEqual(
      namedSnoozedReviews(
        [
          { conceptId: 'concept:fractions', until: 100 },
          { conceptId: 'concept:decimals', until: 200 },
          { conceptId: 'concept:deleted-topic', until: 300 },
        ],
        names,
      ),
      [
        { conceptId: 'concept:fractions', name: 'Fractions', until: 100 },
        { conceptId: 'concept:decimals', name: 'Decimals', until: 200 },
        { conceptId: 'concept:deleted-topic', name: 'Deleted topic', until: 300 },
      ],
    );
    assert.deepEqual(namedSnoozedReviews([], names), []);
  });

  it('offers one "Review it now" per item and keeps the all-at-once action', () => {
    const src = fs.readFileSync(new URL('../src/components/StudyToday.tsx', import.meta.url), 'utf8');
    assert.ok(src.includes('const unsnoozeOne = async'));
    assert.ok(src.includes("outcome: 'unsnooze'"));
    assert.ok(src.includes('aria-label={`Review it now: ${item.name}`}'));
    assert.ok(src.includes('aria-label="Snoozed reviews"'));
    assert.ok(src.includes('Review them now'));
    assert.ok(src.includes('onClick={unsnoozeAll}'));
    // Per-item saves use the item's own concept id as the busy marker.
    assert.ok(src.includes('setBusy(item.conceptId)'));
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
