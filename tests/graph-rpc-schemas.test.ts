/**
 * Server-side validation of graphCall arguments (src/lib/graph/rpc-schemas.ts).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GRAPH_METHOD_ARGS,
  InvalidGraphInputError,
  MAX_GRAPH_CALL_BYTES,
  assertGraphCallSize,
  parseGraphArgs,
} from '../src/lib/graph/rpc-schemas.ts';
import { REMOTE_GRAPH_METHODS, type RemoteGraphMethod } from '../src/lib/graph/methods.ts';
import { isExpectedError } from '../src/lib/errors.ts';
import { openTestGraphDB } from './support/graph-db.ts';
import { demoLearners } from '../src/lib/demo-data.ts';
import { ALL_DOMAIN_IDS, deriveLearningStyle, estimateCognitiveProfile } from '../src/lib/graph/psychometrics.ts';

/** Simulate the browser proxy: args are JSON round-tripped. */
const wire = (args: unknown[]) => JSON.parse(JSON.stringify(args));
const ok = (method: RemoteGraphMethod, args: unknown[]) => parseGraphArgs(method, wire(args));
const rejects = (method: RemoteGraphMethod, args: unknown[], pattern?: RegExp) =>
  assert.throws(
    () => parseGraphArgs(method, wire(args)),
    (err: unknown) => {
      assert.ok(err instanceof InvalidGraphInputError, `expected InvalidGraphInputError, got ${String(err)}`);
      assert.ok(err.message.startsWith(`Invalid input for ${method}`), err.message);
      if (pattern) assert.match(err.message, pattern);
      return true;
    },
  );

const now = new Date().toISOString();

describe('graph RPC schemas', () => {
  it('has a schema for every remotely callable method', () => {
    for (const m of REMOTE_GRAPH_METHODS) assert.ok(GRAPH_METHOD_ARGS[m], `missing schema for ${m}`);
    assert.equal(Object.keys(GRAPH_METHOD_ARGS).length, REMOTE_GRAPH_METHODS.length);
  });

  it('accepts the argument shapes the UI sends', () => {
    ok('setLearnerProfile', [crypto.randomUUID(), { name: 'Test User', email: 'test@example.com' }]);
    ok('setLearnerProfile', ['demo-alice', {
      name: 'Alice', email: undefined, tags: ['a'], notes: 'n', profileMode: 'manual',
      learningStyle: { primary: 'visual', socialPreference: undefined },
      cognitiveProfile: { workingMemoryCapacity: 'high' },
      psychometricScores: {
        openness: 0.85, // legacy demo shape: bare number
        big_five_openness: { score: 75, confidence: 0.9, lastUpdated: now, source: 'assessment_full',
          interpretation: 'High openness', answers: { q1: 4 } },
        legacy_no_score: { interpretation: 'x' },
      },
    }]);
    ok('updatePsychometricScores', ['u1', { big_five_openness: { score: 75, confidence: 0.8 } }]);
    ok('addConcept', [{
      conceptId: 'phase3-concept-a', name: 'Algebra Basics', domain: 'mathematics',
      description: 'Basic', difficulty: { absolute: 3, cognitiveLoad: 0.3, abstractness: 0.3 },
      bloomObjectives: { remember: ['Define variables'] }, subdomain: undefined, tags: ['x', ''],
      timeEstimates: { introduction: 30, basicMastery: 120, deepMastery: 240 },
    }]);
    ok('addEdge', [{ from: 'a', to: 'b', strength: 'required', reason: undefined }]);
    ok('setKnowledgeState', ['u1', 'c1', {
      mastery: 60, bloomLevel: 3, lastReviewed: now,
      misconceptions: [{ id: 'm1', description: 'Confuses X with Y', severity: 'moderate', identified: now }],
    }]);
    ok('computeZPD', ['u1']);
    ok('computeZPD', ['u1', undefined]); // → null on the wire
    ok('detectGaps', ['u1', { type: 'all', includeRecommendations: true }]);
    ok('getReviewQueue', ['u1', { includeNotDue: true }]);
    ok('generateRemediationPlan', ['u1', { maxSteps: 5, focusType: 'forgotten' }]);
    ok('generateLearningPath', ['u1', 10]);
    ok('getPrerequisiteChain', ['c1']);
    ok('listConceptsByDifficulty', [1, 5]);
    ok('listConceptsByBloomLevel', ['apply']);
    ok('searchConcepts', ['alg']);
    ok('listConcepts', []);
    ok('clear', []);
  });

  it('accepts the "Create Sample Users" payload (profile page)', () => {
    for (const learner of demoLearners) {
      ok('setLearnerProfile', [learner.userId, {
        name: learner.name, email: learner.email,
        psychometricScores: learner.psychometricScores, tags: learner.tags, notes: learner.notes,
      }]);
    }
  });

  it('accepts derived learning style / cognitive profile for any score mix (admin psychometrics)', () => {
    for (const value of [0, 5, 50, 95, 100]) {
      const scores = Object.fromEntries(
        ALL_DOMAIN_IDS.map((d, i) => [d, { score: (value + i * 7) % 101, confidence: 0.8, source: 'admin-ui', lastUpdated: now }]),
      );
      ok('setLearnerProfile', ['u1', {
        psychometricScores: scores,
        learningStyle: deriveLearningStyle(scores as never),
        cognitiveProfile: estimateCognitiveProfile(scores as never),
      }]);
    }
  });

  it('turns null optionals into undefined and strips unknown/server-owned fields', () => {
    assert.deepEqual(ok('computeZPD', ['u1', null]), ['u1', undefined]);
    const [, profile] = ok('setLearnerProfile', ['u1', { name: 'n', userId: 'other', createdAt: 'x', isAdmin: true }]);
    assert.deepEqual(profile, { name: 'n' });
    const [, , state] = ok('setKnowledgeState', ['u1', 'c1', { mastery: 10, userId: 'other', conceptId: 'x' }]);
    assert.deepEqual(state, { mastery: 10 });
  });

  it('rejects ids that would corrupt the key layout', () => {
    rejects('setKnowledgeState', ['a:b', 'c', {}], /argument 1: must not contain ":"/);
    rejects('setLearnerProfile', ['', {}], /must not be empty/);
    rejects('setLearnerProfile', [' padded', {}], /whitespace/);
    rejects('setLearnerProfile', ['x'.repeat(129), {}], /128/);
    rejects('setLearnerProfile', ['bad\nid', {}], /control characters/);
    rejects('addConcept', [{ conceptId: 'a:b' }], /conceptId/);
    rejects('addConcept', [{ conceptId: 'ok', domain: 'math:x' }], /domain/);
    rejects('addEdge', [{ from: 'a', to: 'a' }], /own prerequisite/);
    rejects('addRelatedEdge', ['a', 'b', 'rel:x']);
  });

  it('still allows reads/deletes of legacy ids', () => {
    ok('getConcept', ['legacy:id']);
    ok('deleteKnowledgeState', ['legacy:user', 'legacy:concept']);
    rejects('getConcept', ['']);
    rejects('getConcept', [{ $ne: 1 }]);
  });

  it('rejects wrong types, out-of-range numbers and bad enums', () => {
    rejects('setKnowledgeState', ['u', 'c', { mastery: 101 }], /mastery/);
    rejects('setKnowledgeState', ['u', 'c', { mastery: '50' }], /mastery/);
    rejects('setKnowledgeState', ['u', 'c', { bloomLevel: 'understand' }], /bloomLevel/);
    rejects('setKnowledgeState', ['u', 'c', { bloomLevel: 7 }]);
    rejects('setKnowledgeState', ['u', 'c', { lastReviewed: 'not a date' }], /ISO date/);
    rejects('setKnowledgeState', ['u', 'c', { misconceptions: [{ id: 'm', description: 'd', severity: 'huge', identified: now }] }]);
    rejects('addConcept', [{ conceptId: 'c', difficulty: { absolute: 50, cognitiveLoad: 0.5, abstractness: 0.5 } }]);
    rejects('addEdge', [{ from: 'a', to: 'b', strength: 'mandatory' }], /strength/);
    rejects('updatePsychometricScores', ['u', { openness: { score: 1e9 } }]);
    rejects('updatePsychometricScores', ['u', { 'bad key!': { score: 5 } }]);
    rejects('setLearnerProfile', ['u', { learningStyle: { primary: 'telepathic' } }]);
    rejects('setLearnerProfile', ['u', { psychometricScores: { openness: { score: 500 } } }]);
    rejects('setLearnerProfile', ['u', { name: 'x'.repeat(201) }]);
    rejects('detectGaps', ['u', { type: 'everything' }]);
    rejects('generateLearningPath', ['u', 1e9]);
    rejects('getStats', ['extra']);
    rejects('computeZPD', []);
  });

  it('caps the payload size', () => {
    assertGraphCallSize({ method: 'getStats', args: [] });
    assert.throws(
      () => assertGraphCallSize({ method: 'addConcept', args: [{ conceptId: 'c', description: 'x'.repeat(MAX_GRAPH_CALL_BYTES) }] }),
      /payload too large/,
    );
  });

  it('is classified as an expected (not logged) error', () => {
    try {
      parseGraphArgs('getConcept', [42]);
      assert.fail('should throw');
    } catch (err) {
      assert.equal(isExpectedError(err), true);
    }
  });
});

describe('graph RPC schemas + engine', () => {
  const DIR = path.join(os.tmpdir(), `learngraph-rpc-${process.pid}`);
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it('parsed args drive the engine exactly like the UI calls', async () => {
    const db = await openTestGraphDB(DIR, 'owner-rpc');
    const call = async (method: RemoteGraphMethod, args: unknown[]) => {
      const fn = (db as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
      return fn.apply(db, parseGraphArgs(method, wire(args)));
    };
    await call('setLearnerProfile', ['learner-1', { name: 'Ana', userId: 'spoofed' }]);
    await call('addConcept', [{ conceptId: 'algebra', name: 'Algebra', domain: 'math', description: '' }]);
    await call('setKnowledgeState', ['learner-1', 'algebra', { mastery: 85, bloomLevel: 3 }]);
    const profile = (await call('getLearnerProfile', ['learner-1'])) as { userId: string; name: string };
    assert.equal(profile.userId, 'learner-1');
    assert.equal(profile.name, 'Ana');
    const state = (await call('getKnowledgeState', ['learner-1', 'algebra'])) as { mastery: number };
    assert.equal(state.mastery, 85);
    const zpd = (await call('computeZPD', ['learner-1', null])) as { userId: string };
    assert.equal(zpd.userId, 'learner-1');
    await db.close();
  });
});
