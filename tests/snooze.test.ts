/**
 * "Remind me tomorrow": a due review can be postponed by a day without being
 * answered. The snooze moves the due date (so Today, "Fading" on Gap Analysis
 * and the graph agree), leaves mastery/schedule untouched, and ends as soon as
 * the concept is reviewed or studied again.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { knowledgeStateInput } from '../src/lib/graph/rpc-schemas.ts';
import { SNOOZE_DAYS, isReviewDue, reviewDueAt, reviewPriority, snoozedUntil } from '../src/lib/graph/spacing.ts';
import { applyReviewOutcome, applySnooze, applyStudyOutcome } from '../src/lib/study.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-02T12:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

// reviewCount 2 → 7-day interval; last reviewed 10 days ago → 3 days overdue.
const overdue = { mastery: 90, reviewCount: 2, retentionStrength: 0.8, lastReviewed: at(-10) };

describe('snooze rule', () => {
  it('applySnooze postpones by SNOOZE_DAYS and passes the server schema', () => {
    const patch = applySnooze(NOW);
    assert.equal(SNOOZE_DAYS, 1);
    assert.equal(patch.nextReview, at(1));
    assert.deepEqual(Object.keys(patch), ['nextReview']);
    assert.equal(knowledgeStateInput.safeParse(patch).success, true);
  });

  it('a snoozed review is not due until the snooze ends, then due again', () => {
    assert.equal(isReviewDue(overdue, null, NOW), true);
    const snoozed = { ...overdue, ...applySnooze(NOW) };
    assert.equal(isReviewDue(snoozed, null, NOW), false);
    assert.equal(reviewPriority(snoozed, null, NOW), 'low');
    assert.equal(reviewDueAt(snoozed, null), Date.parse(at(1)));
    assert.equal(isReviewDue(snoozed, null, new Date(Date.parse(at(1)) + 1)), true);
  });

  it('never makes a review due earlier than its schedule', () => {
    // Fresh review (due in 7 days); a 1-day snooze must not pull it forward.
    const fresh = { mastery: 90, reviewCount: 2, lastReviewed: NOW.toISOString(), nextReview: at(1) };
    assert.equal(reviewDueAt(fresh, null), Date.parse(at(7)));
  });

  it('ends with the next review or study (nextReview no later than lastReviewed)', () => {
    const snoozed = { ...overdue, ...applySnooze(NOW) };
    for (const patch of [
      applyReviewOutcome(snoozed, 'remembered', NOW),
      applyReviewOutcome(snoozed, 'forgot', NOW),
      applyStudyOutcome(snoozed, 'started', NOW),
    ]) {
      const after = { ...snoozed, ...patch };
      assert.equal(after.nextReview, after.lastReviewed);
      assert.equal(snoozedUntil(after), null);
    }
    // An old nextReview (before the last review) is ignored too.
    assert.equal(snoozedUntil({ ...overdue, nextReview: at(-20) }), null);
  });

  it('ignores missing or broken dates', () => {
    assert.equal(snoozedUntil({ mastery: 90, lastReviewed: at(-1) }), null);
    assert.equal(snoozedUntil({ mastery: 90, lastReviewed: at(-1), nextReview: 'not a date' }), null);
    assert.equal(reviewDueAt({ mastery: 90, nextReview: at(1) }, null), null);
  });
});

const DIR = path.join(os.tmpdir(), `learngraph-snooze-${process.pid}`);
const clean = () => fs.rmSync(DIR, { recursive: true, force: true });

describe('snooze through the engine', () => {
  let db: EducationGraphDB;
  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(DIR);
    await db.setLearnerProfile('kid', { name: 'Kid' });
    await db.addConcept({ conceptId: 'add', name: 'Addition', domain: 'math', description: '' });
    await db.addConcept({ conceptId: 'sub', name: 'Subtraction', domain: 'math', description: '' });
  });
  afterEach(async () => {
    await db.close();
    clean();
  });

  it('a snoozed review leaves the queue and "Fading", keeps its progress, and comes back after a review', async () => {
    const old = new Date(Date.now() - 60 * DAY).toISOString();
    await db.setKnowledgeState('kid', 'add', { mastery: 85, reviewCount: 3, lastReviewed: old });
    await db.setKnowledgeState('kid', 'sub', { mastery: 85, reviewCount: 3, lastReviewed: old });
    assert.deepEqual((await db.getReviewQueue('kid')).queue.map((q) => q.conceptId), ['add', 'sub']);

    const before = await db.getKnowledgeState('kid', 'add');
    await db.setKnowledgeState('kid', 'add', applySnooze());
    const after = await db.getKnowledgeState('kid', 'add');
    assert.equal(after?.mastery, before?.mastery);
    assert.equal(after?.reviewCount, before?.reviewCount);
    assert.equal(after?.lastReviewed, before?.lastReviewed);

    const queue = await db.getReviewQueue('kid');
    assert.deepEqual(queue.queue.map((q) => q.conceptId), ['sub']);
    assert.equal(queue.stats.overdue, 1);
    const gaps = await db.detectGaps('kid');
    const fading = gaps.forgotten.map((g) => g.conceptId);
    assert.deepEqual(fading, ['sub']);
    // Still scheduled: shows as "comes back tomorrow".
    const all = await db.getReviewQueue('kid', { includeNotDue: true });
    const snoozed = all.queue.find((q) => q.conceptId === 'add');
    assert.ok(snoozed);
    const inDays = (Date.parse(snoozed.nextReviewDate) - Date.now()) / DAY;
    assert.ok(inDays > 0.99 && inDays <= 1, String(inDays));

    // Answering it later (e.g. tomorrow) grows the interval as usual and clears the snooze.
    const prior = await db.getKnowledgeState('kid', 'add');
    await db.setKnowledgeState('kid', 'add', applyReviewOutcome(prior, 'remembered'));
    const reviewed = await db.getKnowledgeState('kid', 'add');
    assert.equal(reviewed?.reviewCount, 4);
    assert.equal(snoozedUntil(reviewed!), null);
  });
});
