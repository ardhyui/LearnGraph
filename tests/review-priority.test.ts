/**
 * Review priority comes from how late a review is, not from mastery: a
 * low-mastery concept is not "Review first" the moment it is due, and a due
 * well-known concept is never "Can wait".
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import {
  URGENT_MIN_LATE_DAYS,
  daysLate,
  hasOpenMisconception,
  lateness,
  reviewIntervalDays,
  reviewPriority,
} from '../src/lib/graph/spacing.ts';
import { priorityLabel, reviewSummary } from '../src/lib/gaps.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-02T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe('reviewPriority', () => {
  it('is "low" before the due date, "normal" when just due, "urgent" when a whole interval late', () => {
    // reviewCount 2 → 7-day interval (mastery ≥ 50, no difficulty).
    const base = { mastery: 90, reviewCount: 2 };
    assert.equal(reviewIntervalDays(base), 7);
    assert.equal(reviewPriority({ ...base, lastReviewed: ago(3) }, null, NOW), 'low');
    assert.equal(reviewPriority({ ...base, lastReviewed: ago(7) }, null, NOW), 'normal');
    assert.equal(reviewPriority({ ...base, lastReviewed: ago(13) }, null, NOW), 'normal');
    assert.equal(reviewPriority({ ...base, lastReviewed: ago(14) }, null, NOW), 'urgent');
  });

  it('does not depend on mastery: a weak concept just due is not "Review first", a strong one is not "Can wait"', () => {
    // Old rule: retention < 40 → urgent (any mastery < 50 at its due date), ≥ 60 → low.
    const weak = { mastery: 45, reviewCount: 0, lastReviewed: ago(1) };
    const strong = { mastery: 100, reviewCount: 0, lastReviewed: ago(1) };
    assert.equal(reviewPriority(weak, null, NOW), 'normal');
    assert.equal(reviewPriority(strong, null, NOW), 'normal');
  });

  it('needs at least URGENT_MIN_LATE_DAYS for short intervals', () => {
    // 1-day interval: 1 day late is not yet urgent, 2 days late is.
    const s = { mastery: 80, reviewCount: 0 };
    assert.equal(reviewPriority({ ...s, lastReviewed: ago(2) }, null, NOW), 'normal');
    assert.equal(reviewPriority({ ...s, lastReviewed: ago(1 + URGENT_MIN_LATE_DAYS) }, null, NOW), 'urgent');
  });

  it('only unresolved mix-ups make a review urgent', () => {
    const s = { mastery: 80, reviewCount: 2, lastReviewed: ago(1) };
    assert.equal(reviewPriority({ ...s, misconceptions: [{ resolved: '2026-10-01' }] }, null, NOW), 'low');
    assert.equal(reviewPriority({ ...s, misconceptions: [{ resolved: '2026-10-01' }, {}] }, null, NOW), 'urgent');
    assert.equal(hasOpenMisconception({ mastery: 1, misconceptions: null }), false);
  });

  it('is safe with missing/invalid dates and low mastery', () => {
    assert.equal(reviewPriority({ mastery: 90, lastReviewed: 'not a date' }, null, NOW), 'low');
    assert.equal(reviewPriority({ mastery: 90 }, null, NOW), 'low');
    assert.equal(reviewPriority({ mastery: 10, lastReviewed: ago(400) }, null, NOW), 'low');
    assert.equal(daysLate({ mastery: 90 }, null, NOW), null);
    assert.equal(lateness({ mastery: 90 }, null, NOW), -Infinity);
  });

  it('lateness is relative to the interval', () => {
    const shortLate = lateness({ mastery: 80, reviewCount: 0, lastReviewed: ago(4) }, null, NOW); // 1-day interval, 3 late
    const longLate = lateness({ mastery: 80, reviewCount: 2, lastReviewed: ago(10) }, null, NOW); // 7-day interval, 3 late
    assert.ok(Math.abs(shortLate - 3) < 1e-9);
    assert.ok(Math.abs(longLate - 3 / 7) < 1e-9);
  });
});

describe('review copy', () => {
  it('reviewSummary uses the due phrase and a clamped rounded percentage', () => {
    const now = new Date(2026, 10, 2, 12);
    assert.equal(reviewSummary(new Date(2026, 10, 2, 8), 79.6, now), 'Due today · about 80% remembered');
    assert.equal(reviewSummary(new Date(2026, 9, 30, 8), 150, now), 'Overdue by 3 days · about 100% remembered');
    assert.equal(reviewSummary('nope', Number.NaN, now), 'Review date unknown · about 0% remembered');
    assert.equal(priorityLabel('urgent'), 'Review first');
  });
});

const TEST_DB_PATH = path.join(os.tmpdir(), `learngraph-review-priority-${process.pid}`);
const clean = () => fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });

describe('getReviewQueue priority & order', () => {
  let db: EducationGraphDB;

  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(TEST_DB_PATH);
  });

  afterEach(async () => {
    await db.close();
    clean();
  });

  it('lists very late reviews first, labels by lateness, and agrees with the critical count', async () => {
    for (const id of ['weak-just-due', 'strong-very-late', 'strong-just-due', 'mixup', 'not-due']) {
      await db.addConcept({ conceptId: id, name: id, domain: 'testing', description: id });
    }
    await db.setLearnerProfile('u1', {});
    const now = Date.now();
    const at = (days: number) => new Date(now - days * DAY).toISOString();
    // 7-day interval items (reviewCount 2, mastery ≥ 50); weak one has a 1-day interval (mastery < 50 halves 1 → 1).
    await db.setKnowledgeState('u1', 'weak-just-due', { mastery: 45, reviewCount: 0, lastReviewed: at(1.8) });
    await db.setKnowledgeState('u1', 'strong-very-late', { mastery: 95, reviewCount: 2, lastReviewed: at(30) });
    await db.setKnowledgeState('u1', 'strong-just-due', { mastery: 95, reviewCount: 2, lastReviewed: at(7.5) });
    await db.setKnowledgeState('u1', 'mixup', {
      mastery: 70,
      reviewCount: 2,
      lastReviewed: at(8),
      misconceptions: [{ id: 'm1', description: 'x', identified: at(8), severity: 'minor' }],
    });
    await db.setKnowledgeState('u1', 'not-due', { mastery: 95, reviewCount: 2, lastReviewed: at(1) });

    const { queue, stats } = await db.getReviewQueue('u1');
    const byId = Object.fromEntries(queue.map((q) => [q.conceptId, q.priority]));
    assert.deepEqual(byId, {
      'weak-just-due': 'normal',
      'strong-very-late': 'urgent',
      'strong-just-due': 'normal',
      mixup: 'urgent',
    });
    // Urgent first; within "Review soon" the more overdue (relative to its interval) first.
    assert.deepEqual(queue.slice(0, 2).map((q) => q.priority), ['urgent', 'urgent']);
    assert.equal(queue[0].conceptId, 'strong-very-late');
    assert.deepEqual(queue.slice(2).map((q) => q.conceptId), ['weak-just-due', 'strong-just-due']);
    assert.equal(stats.urgent, 2);
    assert.equal(stats.low, 0);
    assert.ok(!queue.some((q) => 'rank' in q || 'lateness' in q || 'sortScore' in q), 'internal sort fields leaked');

    const gaps = await db.detectGaps('u1');
    // strong-very-late (late) + mixup (minor mix-up isn't "major", but its review is urgent) → 2.
    assert.equal(gaps.summary.critical, 2);
  });
});
