/**
 * Dashboard study loop ("Today"): progress summary and how self-reports
 * update a knowledge state — pure rules, plus the round trip through the
 * engine (review queue / ZPD react to the saved patch).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { knowledgeStateInput } from '../src/lib/graph/rpc-schemas.ts';
import {
  applyReviewOutcome,
  applyStudyOutcome,
  pickActiveLearner,
  summarizeProgress,
  MASTERED_AT,
  REVIEWABLE_AT,
} from '../src/lib/study.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const NOW = new Date('2026-11-01T03:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('summarizeProgress', () => {
  it('counts mastered / in progress / not started over all concepts', () => {
    const concepts = ['a', 'b', 'c', 'd'].map((conceptId) => ({ conceptId }));
    const p = summarizeProgress(concepts, [
      { conceptId: 'a', mastery: 90 },
      { conceptId: 'b', mastery: 50 },
      { conceptId: 'c', mastery: 0 },
      { conceptId: 'gone', mastery: 100 }, // state for a deleted concept is ignored
    ]);
    assert.deepEqual(p, {
      total: 4,
      mastered: 1,
      learning: 1,
      notStarted: 2,
      percentMastered: 25,
      averageMastery: 35,
    });
  });

  it('handles an empty workspace and bad numbers', () => {
    assert.equal(summarizeProgress([], []).percentMastered, 0);
    const p = summarizeProgress([{ conceptId: 'a' }], [{ conceptId: 'a', mastery: Number.NaN }]);
    assert.equal(p.notStarted, 1);
  });
});

describe('applyStudyOutcome', () => {
  it('"got it" masters a new concept and starts its review schedule', () => {
    const patch = applyStudyOutcome(null, 'got-it', NOW);
    assert.ok(patch.mastery >= MASTERED_AT);
    assert.equal(patch.reviewCount, 0);
    assert.equal(patch.lastReviewed, NOW.toISOString());
  });

  it('"still learning" makes progress but never counts as mastered', () => {
    assert.equal(applyStudyOutcome(null, 'started', NOW).mastery, 50);
    assert.equal(applyStudyOutcome({ mastery: 70, reviewCount: 2, retentionStrength: 0.6 }, 'started', NOW).mastery, MASTERED_AT - 1);
    // already mastered stays mastered
    assert.equal(applyStudyOutcome({ mastery: 95, reviewCount: 4, retentionStrength: 0.9 }, 'started', NOW).mastery, 95);
  });

  it('"got it" on an already-mastered concept keeps its schedule', () => {
    const patch = applyStudyOutcome({ mastery: 92, reviewCount: 6, retentionStrength: 0.9 }, 'got-it', NOW);
    assert.equal(patch.mastery, 92);
    assert.equal(patch.reviewCount, 6);
  });
});

describe('applyReviewOutcome', () => {
  it('"remembered" lengthens the interval and nudges mastery up', () => {
    const patch = applyReviewOutcome({ mastery: 80, reviewCount: 2, retentionStrength: 0.5 }, 'remembered', NOW);
    assert.equal(patch.reviewCount, 3);
    assert.equal(patch.mastery, 85);
    assert.equal(patch.retentionStrength, 0.6);
    assert.equal(applyReviewOutcome({ mastery: 99, reviewCount: 0, retentionStrength: 1 }, 'remembered', NOW).mastery, 100);
  });

  it('"forgot" restarts the schedule but keeps the concept reviewable', () => {
    const patch = applyReviewOutcome({ mastery: 50, reviewCount: 5, retentionStrength: 0.2 }, 'forgot', NOW);
    assert.equal(patch.reviewCount, 0);
    assert.equal(patch.mastery, REVIEWABLE_AT);
    assert.equal(patch.retentionStrength, 0.1);
  });
});

it('every patch passes the server-side setKnowledgeState schema', () => {
  const priors = [null, { mastery: 0, reviewCount: 0, retentionStrength: 0 }, { mastery: 100, reviewCount: 99, retentionStrength: 1 }];
  for (const prior of priors) {
    for (const p of [
      applyStudyOutcome(prior, 'got-it', NOW),
      applyStudyOutcome(prior, 'started', NOW),
      applyReviewOutcome(prior, 'remembered', NOW),
      applyReviewOutcome(prior, 'forgot', NOW),
    ]) {
      assert.equal(knowledgeStateInput.safeParse(p).success, true, JSON.stringify(p));
    }
  }
});

it('pickActiveLearner prefers the remembered learner if it still exists', () => {
  assert.equal(pickActiveLearner(['a', 'b'], 'b'), 'b');
  assert.equal(pickActiveLearner(['a', 'b'], 'deleted'), 'a');
  assert.equal(pickActiveLearner([], 'b'), null);
});

const DIR = path.join(os.tmpdir(), `learngraph-study-${process.pid}`);
const clean = () => fs.rmSync(DIR, { recursive: true, force: true });

describe('study loop through the engine', () => {
  let db: EducationGraphDB;
  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(DIR);
    await db.setLearnerProfile('kid', { name: 'Kid' });
    await db.addConcept({ conceptId: 'add', name: 'Addition', domain: 'math', description: '' });
    await db.addConcept({ conceptId: 'mul', name: 'Multiplication', domain: 'math', description: '' });
    await db.addEdge({ from: 'add', to: 'mul', strength: 'required' });
  });
  afterEach(async () => {
    await db.close();
    clean();
  });

  it('a due review leaves the queue after "remembered" and after "forgot"', async () => {
    const old = new Date(Date.now() - 60 * DAY).toISOString();
    await db.setKnowledgeState('kid', 'add', { mastery: 85, reviewCount: 3, lastReviewed: old });
    assert.deepEqual((await db.getReviewQueue('kid')).queue.map((q) => q.conceptId), ['add']);

    for (const outcome of ['remembered', 'forgot'] as const) {
      await db.setKnowledgeState('kid', 'add', { lastReviewed: old });
      const prior = await db.getKnowledgeState('kid', 'add');
      await db.setKnowledgeState('kid', 'add', applyReviewOutcome(prior, outcome));
      assert.equal((await db.getReviewQueue('kid')).queue.length, 0, outcome);
      // …but it is still scheduled (comes back later)
      const later = await db.getReviewQueue('kid', { includeNotDue: true });
      assert.deepEqual(later.queue.map((q) => q.conceptId), ['add'], outcome);
    }
  });

  it('"got it" on the recommended concept unlocks the next one', async () => {
    const before = await db.computeZPD('kid', { limit: 3 });
    assert.deepEqual(before.recommendations.map((r) => r.concept.conceptId), ['add']);
    await db.setKnowledgeState('kid', 'add', applyStudyOutcome(null, 'got-it'));
    const after = await db.computeZPD('kid', { limit: 3 });
    assert.deepEqual(after.recommendations.map((r) => r.concept.conceptId), ['mul']);
    const states = await db.getLearnerKnowledgeStates('kid');
    assert.equal(summarizeProgress(await db.listConcepts(), states).mastered, 1);
  });
});
