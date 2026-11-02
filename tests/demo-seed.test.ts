/**
 * Demo data: the seeded progress must belong to the seeded demo learners
 * (`demo-alice` …). Before 2026-11-01 it was stored under `alice` …, so the
 * demo learners showed no progress; repairDemoKnowledgeStates fixes older
 * workspaces additively.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { repairDemoKnowledgeStates, seedDemoDataIfEmpty } from '../src/lib/graph/seed.ts';
import { DEMO_DATA_AS_OF, demoKnowledgeStates, shiftDemoDate } from '../src/lib/demo-data.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const DIR = path.join(os.tmpdir(), `learngraph-demo-seed-${process.pid}`);
const clean = () => fs.rmSync(DIR, { recursive: true, force: true });

describe('demo seed', () => {
  let db: EducationGraphDB;
  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(DIR);
  });
  afterEach(async () => {
    await db.close();
    clean();
  });

  it('attaches demo progress to the demo learners', async () => {
    assert.equal(await seedDemoDataIfEmpty(db), true);
    const alice = await db.getLearnerKnowledgeStates('demo-alice');
    assert.equal(alice.length, 6);
    assert.ok(alice.every((s) => s.userId === 'demo-alice'));
    assert.equal((await db.getLearnerKnowledgeStates('alice')).length, 0);
    // nothing to repair on a fresh workspace
    assert.equal(await repairDemoKnowledgeStates(db), 0);
  });

  it('repairs a workspace seeded with the old (orphaned) ids, once', async () => {
    await seedDemoDataIfEmpty(db);
    // Recreate the pre-fix layout: states under `alice`, none on `demo-alice`.
    for (const s of await db.getLearnerKnowledgeStates('demo-alice')) {
      const { userId: _u, conceptId, ...rest } = s;
      await db.setKnowledgeState('alice', conceptId, rest);
      await db.deleteKnowledgeState('demo-alice', conceptId);
    }
    const orphan = await db.getKnowledgeState('alice', 'fractions');
    assert.equal(orphan?.mastery, 88);

    assert.equal(await repairDemoKnowledgeStates(db), 6);
    const fixed = await db.getKnowledgeState('demo-alice', 'fractions');
    assert.equal(fixed?.userId, 'demo-alice');
    assert.equal(fixed?.mastery, 88);
    assert.equal(fixed?.reviewCount, orphan?.reviewCount);
    assert.equal(fixed?.lastReviewed, orphan?.lastReviewed);
    // additive: the old rows are untouched; idempotent: second run is a no-op
    assert.equal((await db.getLearnerKnowledgeStates('alice')).length, 6);
    assert.equal(await repairDemoKnowledgeStates(db), 0);
    // runs once: if the user later resets the demo learner, it stays reset
    for (const s of await db.getLearnerKnowledgeStates('demo-alice')) {
      await db.deleteKnowledgeState('demo-alice', s.conceptId);
    }
    assert.equal(await repairDemoKnowledgeStates(db), 0);
    assert.equal((await db.getLearnerKnowledgeStates('demo-alice')).length, 0);
    // the flag is bookkeeping only: not counted as data
    assert.equal((await db.getStats()).learnerCount, 3);
  });

  it('leaves real learners alone', async () => {
    await seedDemoDataIfEmpty(db);
    for (const s of await db.getLearnerKnowledgeStates('demo-bob')) {
      await db.deleteKnowledgeState('demo-bob', s.conceptId);
    }
    // A real learner who happens to be called `bob`: not an orphan.
    await db.setLearnerProfile('bob', { name: 'Real Bob' });
    await db.setKnowledgeState('bob', 'arithmetic', { mastery: 10 });
    assert.equal(await repairDemoKnowledgeStates(db), 0);
    assert.equal((await db.getLearnerKnowledgeStates('demo-bob')).length, 0);
  });

  it('dates demo progress relative to now: recent, never in the future, a mix of due and upcoming reviews', async () => {
    const now = new Date();
    assert.equal(await seedDemoDataIfEmpty(db, now), true);
    const DAY = 24 * 60 * 60 * 1000;
    let latest = 0;
    for (const learner of ['demo-alice', 'demo-bob', 'demo-carol']) {
      for (const s of await db.getLearnerKnowledgeStates(learner)) {
        const reviewed = Date.parse(s.lastReviewed ?? '');
        assert.ok(reviewed <= now.getTime(), `${learner}/${s.conceptId} reviewed in the future`);
        assert.ok(Date.parse(s.firstSeen ?? '') <= reviewed, `${learner}/${s.conceptId} first seen after last review`);
        latest = Math.max(latest, reviewed);
      }
    }
    // the most recent demo review was about a day ago, not in 2024
    assert.ok(now.getTime() - latest <= 2 * DAY, `latest demo review ${new Date(latest).toISOString()}`);

    // Alice (the first example learner) has something to review today, but
    // not everything is due, and nothing is overdue by months.
    const all = await db.getReviewQueue('demo-alice', { includeNotDue: true, limit: 50 });
    const due = all.queue.filter((q) => Date.parse(q.nextReviewDate) <= now.getTime());
    assert.ok(due.length >= 1, 'at least one review due');
    assert.ok(due.length < all.queue.length, `${due.length} of ${all.queue.length} due`);
    for (const learner of ['demo-alice', 'demo-bob', 'demo-carol']) {
      const queue = await db.getReviewQueue(learner, { includeNotDue: true, limit: 50 });
      for (const q of queue.queue) {
        const overdueDays = (now.getTime() - Date.parse(q.nextReviewDate)) / DAY;
        assert.ok(overdueDays < 60, `${learner}/${q.conceptId} overdue by ${Math.round(overdueDays)} days`);
      }
    }
  });
});

describe('shiftDemoDate', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  it('keeps the distance to the demo "as of" date, measured from now', () => {
    const dayBefore = new Date(Date.parse(DEMO_DATA_AS_OF) - DAY).toISOString();
    assert.equal(shiftDemoDate(dayBefore, now), new Date(now.getTime() - DAY).toISOString());
    const a = Date.parse(shiftDemoDate('2024-10-01T00:00:00.000Z', now));
    const b = Date.parse(shiftDemoDate('2024-11-15T00:00:00.000Z', now));
    assert.equal(b - a, 45 * DAY);
  });

  it('never returns a future date and falls back to now for bad input', () => {
    assert.equal(shiftDemoDate('2030-01-01T00:00:00.000Z', now), now.toISOString());
    assert.equal(shiftDemoDate('not a date', now), now.toISOString());
    assert.equal(shiftDemoDate(undefined, now), now.toISOString());
  });

  it('every demo date lies before the "as of" date', () => {
    for (const s of demoKnowledgeStates) {
      assert.ok(Date.parse(s.lastReviewed) < Date.parse(DEMO_DATA_AS_OF), s.id);
      assert.ok(Date.parse(s.createdAt) <= Date.parse(s.lastReviewed), s.id);
    }
  });
});
