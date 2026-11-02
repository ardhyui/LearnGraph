/**
 * "Review it now": a review postponed with "Remind me tomorrow" can be brought
 * back early (from the Snoozed list on Gap Analysis or the Today summary). It
 * is due again right away — exactly as due as before snoozing — and nothing
 * else about the learner's progress changes.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { knowledgeStateInput } from '../src/lib/graph/rpc-schemas.ts';
import { isReviewDue, reviewDueAt, reviewPriority, snoozedReviewUntil, snoozedReviews, snoozedUntil } from '../src/lib/graph/spacing.ts';
import { applySnooze, applyUnsnooze, focusAfterAnswer } from '../src/lib/study.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-03T08:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

// reviewCount 2 → 7-day interval; last reviewed 10 days ago → 3 days overdue.
const overdue = { conceptId: 'c:overdue', mastery: 90, reviewCount: 2, retentionStrength: 0.8, lastReviewed: at(-10) };

describe('applyUnsnooze', () => {
  it('only writes nextReview, and passes the server schema', () => {
    const patch = applyUnsnooze(overdue, NOW);
    assert.deepEqual(Object.keys(patch), ['nextReview']);
    assert.equal(patch.nextReview, overdue.lastReviewed);
    assert.equal(knowledgeStateInput.safeParse(patch).success, true);
  });

  it('makes a snoozed review due again right away — as due and as urgent as before snoozing', () => {
    const snoozed = { ...overdue, ...applySnooze(NOW) };
    assert.equal(isReviewDue(snoozed, null, NOW), false);
    assert.notEqual(snoozedReviewUntil(snoozed, null, NOW), null);

    const back = { ...snoozed, ...applyUnsnooze(snoozed, NOW) };
    assert.equal(snoozedUntil(back), null);
    assert.equal(snoozedReviewUntil(back, null, NOW), null);
    assert.equal(isReviewDue(back, null, NOW), true);
    assert.equal(reviewDueAt(back, null), reviewDueAt(overdue, null));
    assert.equal(reviewPriority(back, null, NOW), reviewPriority(overdue, null, NOW));
    assert.deepEqual(snoozedReviews([back], () => null, NOW), []);
  });

  it('falls back to the first study, then to now, when the last review date is missing, broken or in the future', () => {
    const studied = { mastery: 60, firstSeen: at(-5) };
    assert.equal(applyUnsnooze(studied, NOW).nextReview, at(-5));
    assert.equal(applyUnsnooze({ lastReviewed: 'garbage', firstSeen: at(-5) }, NOW).nextReview, at(-5));
    assert.equal(applyUnsnooze({ lastReviewed: at(2) }, NOW).nextReview, NOW.toISOString());
    assert.equal(applyUnsnooze(null, NOW).nextReview, NOW.toISOString());
    // Even the "now" fallback is never a snooze any more once that moment has passed.
    const fallback = { mastery: 90, reviewCount: 2, lastReviewed: at(-10), ...applyUnsnooze(null, NOW) };
    assert.equal(isReviewDue(fallback, null, NOW), true);
  });

  it('keyboard focus moves to the next snoozed review, or the heading when none are left', () => {
    assert.deepEqual(focusAfterAnswer(['a', 'b', 'c'], 'b', ['a', 'c']), { kind: 'item', conceptId: 'c' });
    assert.deepEqual(focusAfterAnswer(['a', 'b'], 'b', ['a']), { kind: 'item', conceptId: 'a' });
    assert.deepEqual(focusAfterAnswer(['a'], 'a', []), { kind: 'heading' });
  });
});

const DIR = path.join(os.tmpdir(), `learngraph-unsnooze-${process.pid}`);
const clean = () => fs.rmSync(DIR, { recursive: true, force: true });

describe('"Review it now" through the engine', () => {
  let db: EducationGraphDB;
  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(DIR, 'owner-alice');
    await db.setLearnerProfile('kid', { name: 'Kid' });
    await db.addConcept({ conceptId: 'add', name: 'Addition', domain: 'math', description: '' });
    await db.addConcept({ conceptId: 'sub', name: 'Subtraction', domain: 'math', description: '' });
    const old = new Date(Date.now() - 60 * DAY).toISOString();
    await db.setKnowledgeState('kid', 'add', { mastery: 85, reviewCount: 3, lastReviewed: old });
    await db.setKnowledgeState('kid', 'sub', { mastery: 85, reviewCount: 3, lastReviewed: old });
    await db.setKnowledgeState('kid', 'add', applySnooze());
  });
  afterEach(async () => {
    await db.close();
    clean();
  });

  it('brings the review back to the queue and "Fading" with its progress unchanged', async () => {
    assert.deepEqual((await db.getReviewQueue('kid')).queue.map((q) => q.conceptId), ['sub']);
    const before = await db.getKnowledgeState('kid', 'add');
    await db.setKnowledgeState('kid', 'add', applyUnsnooze(before));
    const after = await db.getKnowledgeState('kid', 'add');
    assert.equal(after?.mastery, before?.mastery);
    assert.equal(after?.reviewCount, before?.reviewCount);
    assert.equal(after?.retentionStrength, before?.retentionStrength);
    assert.equal(after?.lastReviewed, before?.lastReviewed);
    assert.equal(snoozedUntil(after!), null);

    const queue = await db.getReviewQueue('kid');
    assert.deepEqual(queue.queue.map((q) => q.conceptId).sort(), ['add', 'sub']);
    assert.equal(queue.stats.overdue, 2);
    const fading = (await db.detectGaps('kid')).forgotten.map((g) => g.conceptId).sort();
    assert.deepEqual(fading, ['add', 'sub']);
    assert.deepEqual(snoozedReviews(await db.getLearnerKnowledgeStates('kid'), () => null, new Date()), []);
  });

  it("another account can't end this account's snooze", async () => {
    await db.close();
    const other = await openTestGraphDB(DIR, 'owner-bob');
    // Same learner and concept ids, but in Bob's own workspace.
    await other.setKnowledgeState('kid', 'add', applyUnsnooze({ lastReviewed: new Date(Date.now() - 60 * DAY).toISOString() }));
    await other.close();
    db = await openTestGraphDB(DIR, 'owner-alice');
    const mine = await db.getKnowledgeState('kid', 'add');
    assert.ok((snoozedUntil(mine!) ?? 0) > Date.now());
    assert.deepEqual((await db.getReviewQueue('kid')).queue.map((q) => q.conceptId), ['sub']);
  });
});
