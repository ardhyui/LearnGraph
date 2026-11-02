/**
 * One memory model: the review interval and the forgetting curve agree, and
 * intervals are bounded (a concept reviewed 12× was "due in 13 years" yet
 * "about 1% remembered" before).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import {
  MAX_INTERVAL_DAYS,
  RETENTION_AT_DUE,
  REVIEWABLE_MASTERY,
  daysSince,
  isReviewDue,
  predictRetention,
  reviewDueAt,
  reviewIntervalDays,
  stabilityForInterval,
} from '../src/lib/graph/spacing.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const DAY = 24 * 60 * 60 * 1000;

describe('reviewIntervalDays', () => {
  it('follows 1, 3, 7 days then grows, never beyond the cap', () => {
    assert.equal(reviewIntervalDays({ mastery: 90, reviewCount: 0 }), 1);
    assert.equal(reviewIntervalDays({ mastery: 90, reviewCount: 1 }), 3);
    assert.equal(reviewIntervalDays({ mastery: 90, reviewCount: 2 }), 7);
    let prev = 7;
    for (let n = 3; n <= 40; n++) {
      const d = reviewIntervalDays({ mastery: 90, reviewCount: n });
      assert.ok(d >= prev, `interval shrank at ${n}`);
      assert.ok(d <= MAX_INTERVAL_DAYS, `interval ${d} > cap at ${n}`);
      prev = d;
    }
    assert.equal(reviewIntervalDays({ mastery: 95, reviewCount: 12 }), MAX_INTERVAL_DAYS);
    assert.equal(reviewIntervalDays({ mastery: 95, reviewCount: 100_000 }), MAX_INTERVAL_DAYS);
  });

  it('brings weak, hard or badly-recalled concepts back sooner (min 1 day)', () => {
    const base = reviewIntervalDays({ mastery: 90, reviewCount: 4 });
    assert.ok(reviewIntervalDays({ mastery: 45, reviewCount: 4 }) < base);
    assert.ok(reviewIntervalDays({ mastery: 90, reviewCount: 4 }, 10) < base);
    assert.ok(reviewIntervalDays({ mastery: 90, reviewCount: 4 }, null, 'failed') < base);
    assert.ok(reviewIntervalDays({ mastery: 90, reviewCount: 4 }, null, 'easy') > base);
    assert.equal(reviewIntervalDays({ mastery: 10, reviewCount: 0 }, 10, 'failed'), 1);
  });

  it('treats broken input safely', () => {
    for (const s of [
      { mastery: NaN, reviewCount: NaN },
      { mastery: -5, reviewCount: -3 },
      { mastery: 500, reviewCount: null },
    ]) {
      const d = reviewIntervalDays(s, NaN, 'constructor' as never);
      assert.ok(Number.isInteger(d) && d >= 1 && d <= MAX_INTERVAL_DAYS);
    }
  });
});

describe('forgetting curve', () => {
  it('retains RETENTION_AT_DUE of mastery exactly at the due date', () => {
    for (const interval of [1, 7, 42, MAX_INTERVAL_DAYS]) {
      const r = predictRetention(90, interval, stabilityForInterval(interval));
      assert.ok(Math.abs(r - 90 * RETENTION_AT_DUE) < 1e-9);
    }
  });

  it('is bounded 0–100 and safe on bad dates', () => {
    assert.equal(predictRetention(90, 0, 10), 90);
    assert.ok(predictRetention(90, 10_000, 1) >= 0);
    assert.equal(predictRetention(NaN, 5, 5), 0);
    assert.equal(daysSince('not a date', new Date()), 0);
    assert.equal(daysSince(new Date(Date.now() + DAY).toISOString(), new Date()), 0);
  });
});

describe('isReviewDue / reviewDueAt', () => {
  const now = new Date('2026-11-02T14:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

  it('is due exactly when the interval since the last review has passed', () => {
    const s = { mastery: 70, reviewCount: 3 };
    const interval = reviewIntervalDays(s, 5);
    assert.equal(isReviewDue({ ...s, lastReviewed: ago(interval - 0.5) }, 5, now), false);
    assert.equal(isReviewDue({ ...s, lastReviewed: ago(interval) }, 5, now), true);
    assert.equal(reviewDueAt({ ...s, lastReviewed: ago(0) }, 5), now.getTime() + interval * DAY);
  });

  it('falls back to firstSeen, and is never due without a usable date or below the learned threshold', () => {
    assert.equal(isReviewDue({ mastery: 80, reviewCount: 0, firstSeen: ago(5) }, null, now), true);
    assert.equal(isReviewDue({ mastery: 80, reviewCount: 0, lastReviewed: 'garbage' }, null, now), false);
    assert.equal(isReviewDue({ mastery: 80, reviewCount: 0 }, null, now), false);
    assert.equal(isReviewDue({ mastery: REVIEWABLE_MASTERY - 1, lastReviewed: ago(400) }, null, now), false);
    assert.equal(isReviewDue({ mastery: NaN, lastReviewed: ago(400) }, null, now), false);
  });
});

const TEST_DB_PATH = path.join(os.tmpdir(), `learngraph-spacing-${process.pid}`);
const clean = () => fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });

describe('engine: schedule and decay agree', () => {
  let db: EducationGraphDB;
  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(TEST_DB_PATH);
  });
  afterEach(async () => {
    await db.close();
    clean();
  });

  it('a well-practised concept is neither "forgotten" nor due years away', async () => {
    await db.setLearnerProfile('u1', {});
    await db.addConcept({ conceptId: 'arith', name: 'Arithmetic', domain: 'math', description: 'x' });
    const reviewed = new Date(Date.now() - 30 * DAY).toISOString();
    await db.setKnowledgeState('u1', 'arith', { mastery: 95, reviewCount: 12, lastReviewed: reviewed });

    const state = (await db.getKnowledgeState('u1', 'arith'))!;
    const concept = (await db.getConcept('arith'))!;
    const decay = db.predictDecay(state, concept);
    const schedule = db.scheduleNextReview(state, concept);
    assert.ok(schedule.intervalDays <= MAX_INTERVAL_DAYS);
    // 30 days into a ~half-year interval: still mostly remembered.
    assert.ok(decay.predictedRetention > 85, `retention ${decay.predictedRetention}`);

    const gaps = await db.detectGaps('u1');
    assert.equal(gaps.forgotten.some((g) => g.conceptId === 'arith'), false);

    const { queue } = await db.getReviewQueue('u1', { includeNotDue: true });
    const item = queue.find((q) => q.conceptId === 'arith')!;
    const dueIn = (Date.parse(item.nextReviewDate) - Date.now()) / DAY;
    assert.ok(dueIn > 0 && dueIn <= MAX_INTERVAL_DAYS, `due in ${dueIn} days`);
  });

  it('when a review falls due, about RETENTION_AT_DUE of mastery is remembered', async () => {
    await db.addConcept({ conceptId: 'frac', name: 'Fractions', domain: 'math', description: 'x' });
    const concept = (await db.getConcept('frac'))!;
    const probe = { mastery: 80, reviewCount: 3 };
    const interval = reviewIntervalDays(probe, concept.difficulty?.absolute);
    const reviewed = new Date(Date.now() - interval * DAY).toISOString();
    await db.setKnowledgeState('u1', 'frac', { ...probe, lastReviewed: reviewed });
    const state = (await db.getKnowledgeState('u1', 'frac'))!;

    const decay = db.predictDecay(state, concept);
    assert.ok(Math.abs(decay.predictedRetention - 80 * RETENTION_AT_DUE) < 0.5, `retention ${decay.predictedRetention}`);
    const { queue } = await db.getReviewQueue('u1');
    assert.ok(queue.some((q) => q.conceptId === 'frac'), 'due item is in the queue');
  });

  it('the due date does not drift as time passes (interval ignores elapsed time)', async () => {
    await db.addConcept({ conceptId: 'dec', name: 'Decimals', domain: 'math', description: 'x' });
    const concept = (await db.getConcept('dec'))!;
    const intervals = [];
    for (const ago of [0, 5, 20, 100]) {
      await db.setKnowledgeState('u1', 'dec', {
        mastery: 70,
        reviewCount: 4,
        lastReviewed: new Date(Date.now() - ago * DAY).toISOString(),
      });
      const state = (await db.getKnowledgeState('u1', 'dec'))!;
      intervals.push(db.scheduleNextReview(state, concept).intervalDays);
    }
    assert.equal(new Set(intervals).size, 1, `intervals ${intervals.join(',')}`);
  });

  it('"Fading" on Gap Analysis is exactly the set of reviews that are due', async () => {
    await db.setLearnerProfile('u1', {});
    const cases: [string, number, number, number][] = [
      // id, mastery, reviewCount, days since last review (as fraction of interval)
      ['early-weak', 70, 3, 0.8], // was "Fading" before (retention < 60) though not due
      ['due-weak', 70, 3, 1.05],
      ['due-strong', 95, 2, 1.5],
      ['fresh', 90, 1, 0.1],
      ['not-learned', 30, 1, 5],
    ];
    for (const [id, mastery, reviewCount, frac] of cases) {
      await db.addConcept({ conceptId: id, name: id, domain: 'math', description: 'x' });
      const concept = (await db.getConcept(id))!;
      const interval = reviewIntervalDays({ mastery, reviewCount }, concept.difficulty?.absolute);
      await db.setKnowledgeState('u1', id, {
        mastery,
        reviewCount,
        lastReviewed: new Date(Date.now() - frac * interval * DAY).toISOString(),
      });
    }
    const gaps = await db.detectGaps('u1', { type: 'forgotten' });
    const fading = gaps.forgotten.map((g) => g.conceptId).sort();
    assert.deepEqual(fading, ['due-strong', 'due-weak']);
    const { queue, stats } = await db.getReviewQueue('u1');
    assert.deepEqual(queue.map((q) => q.conceptId).sort(), fading);
    assert.equal(stats.overdue, fading.length);
  });

  it('a never-reviewed concept counts days from when it was first studied', async () => {
    await db.setLearnerProfile('u1', {});
    await db.addConcept({ conceptId: 'new', name: 'New', domain: 'math', description: 'x' });
    const firstSeen = new Date(Date.now() - 5 * DAY).toISOString();
    await db.setKnowledgeState('u1', 'new', { mastery: 80, reviewCount: 0, firstSeen });
    const gaps = await db.detectGaps('u1', { type: 'forgotten' });
    const item = gaps.forgotten.find((g) => g.conceptId === 'new');
    assert.ok(item, 'due one day after first study, so it is fading');
    assert.ok(Math.abs(item.daysSinceReview - 5) < 0.1, `days ${item.daysSinceReview}`);
    assert.ok(item.predictedRetention < 80 * RETENTION_AT_DUE);
  });
});
