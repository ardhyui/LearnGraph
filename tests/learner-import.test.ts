/**
 * Roadmap M3: importing a learner from a JSON export (the format of PR #29's
 * "Download my data"). Always a new learner, only known concepts, validated,
 * and a file can't make a quiz-checked concept "mastered".
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ImportError, parseLearnerExport, planLearnerImport } from '../src/lib/learner-import.ts';
import { importLearnerFile } from '../src/lib/learner-import-apply.ts';
import { openTestWorkspaces } from './support/graph-db.ts';
import { saveQuestion } from '../src/lib/evidence/service.ts';

const exportOf = (states: unknown[], profile: Record<string, unknown> = { userId: 'me-sari', name: 'Sari', tags: ['focus:mathematics'] }) =>
  JSON.stringify({
    format: 'learngraph.learner-export',
    version: 1,
    exportedAt: '2026-11-03T00:00:00.000Z',
    learner: { id: 'me-sari', name: 'Sari', subjects: ['mathematics'], profile },
    summary: {},
    progress: [],
    knowledgeStates: states,
  });

describe('learner import (pure)', () => {
  it('refuses files that are not a LearnGraph export', () => {
    assert.throws(() => parseLearnerExport('not json'), ImportError);
    assert.throws(() => parseLearnerExport('{"format":"other","version":1}'), /not a LearnGraph learner export/);
    assert.throws(() => parseLearnerExport(JSON.stringify({ format: 'learngraph.learner-export', version: 2, learner: { profile: {} }, knowledgeStates: [] })), ImportError);
  });

  it('plans a new learner, keeps known concepts only, and caps quiz-checked mastery', () => {
    const file = parseLearnerExport(
      exportOf([
        { userId: 'me-sari', conceptId: 'fractions', mastery: 95, reviewCount: 3, lastReviewed: '2026-11-01T00:00:00.000Z', masterySource: 'quiz' },
        { userId: 'me-sari', conceptId: 'decimals', mastery: 60 },
        { userId: 'me-sari', conceptId: 'unknown-topic', mastery: 90 },
        { userId: 'me-sari', conceptId: 'decimals', mastery: 10 },
        { userId: 'me-sari', conceptId: 'bad:id', mastery: 500 },
      ]),
    );
    const plan = planLearnerImport(file, {
      learnerIds: ['me-sari'],
      conceptIds: new Set(['fractions', 'decimals', 'bad:id']),
      evidenceRequired: (id) => id === 'fractions',
    });
    assert.equal(plan.learnerId, 'me-sari-2');
    assert.equal(plan.name, 'Sari');
    assert.deepEqual(plan.profile.tags, ['focus:mathematics']);
    assert.deepEqual(plan.states.map((s) => s.conceptId), ['fractions', 'decimals']);
    const fractions = plan.states[0].patch;
    assert.equal(fractions.mastery, 79);
    assert.equal(fractions.masterySource, 'manual');
    assert.equal(fractions.reviewCount, 3);
    assert.equal(plan.states[1].patch.mastery, 60);
    assert.deepEqual(plan.capped, ['fractions']);
    assert.deepEqual(plan.skippedConcepts, ['bad:id', 'unknown-topic']);
  });
});

describe('learner import on PGlite', () => {
  const DIR = path.join(os.tmpdir(), `learngraph-import-${process.pid}`);
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it('imports into the caller’s workspace as a new learner and never overwrites', async () => {
    const ws = await openTestWorkspaces(DIR, ['owner-a']);
    try {
      const graph = await ws.graphFor('owner-a');
      await graph.addConcept({ conceptId: 'fractions', name: 'Fractions', domain: 'mathematics' });
      await graph.addConcept({ conceptId: 'decimals', name: 'Decimals', domain: 'mathematics' });
      await saveQuestion(ws.db, graph, 'owner-a', { conceptId: 'fractions', prompt: 'p', options: ['1', '2'], answer: '1', explanation: '' }, randomUUID);
      await graph.setLearnerProfile('me-sari', { name: 'Someone else' });
      const text = exportOf([
        { userId: 'me-sari', conceptId: 'fractions', mastery: 95 },
        { userId: 'me-sari', conceptId: 'decimals', mastery: 85 },
      ]);
      const result = await importLearnerFile(ws.db, graph, 'owner-a', text);
      assert.equal(result.learnerId, 'me-sari-2');
      assert.equal(result.imported, 2);
      assert.deepEqual(result.capped, ['fractions']);
      assert.equal((await graph.getLearnerProfile('me-sari'))?.name, 'Someone else');
      assert.equal((await graph.getKnowledgeState('me-sari-2', 'fractions'))?.mastery, 79);
      assert.equal((await graph.getKnowledgeState('me-sari-2', 'decimals'))?.mastery, 85);
      assert.equal((await graph.getKnowledgeState('me-sari-2', 'decimals'))?.masterySource, 'manual');
      // Importing the same file again makes yet another learner.
      assert.equal((await importLearnerFile(ws.db, graph, 'owner-a', text)).learnerId, 'me-sari-3');
    } finally {
      await ws.close();
    }
  });
});
