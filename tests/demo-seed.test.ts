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
});
