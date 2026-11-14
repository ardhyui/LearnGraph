/**
 * Direct unit tests for the browser-callable method allow-list
 * `src/lib/graph/methods.ts` (`REMOTE_GRAPH_METHODS`).
 *
 * The list is the security boundary of the `graphCall` RPC:
 * `src/server/graph.functions.ts` validates `method` with
 * `z.enum(REMOTE_GRAPH_METHODS)` and then runs that method on the caller's own
 * `EducationGraphDB`. Until now only Zod schema completeness was tested
 * (tests/graph-rpc-schemas.test.ts); the exact list itself was never locked,
 * so a new or dangerous method could be exposed without a failing test.
 *
 * The module is not changed by this file — tests only, plus static guards for
 * the wiring that must keep using the list (server validation, browser proxy,
 * engine method names).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { REMOTE_GRAPH_METHODS } from '../src/lib/graph/methods.ts';

const methods = [...REMOTE_GRAPH_METHODS];

/**
 * Explicit frozen copy of the list (2026-11-15, in source order). Exposing,
 * renaming, removing or reordering a method must be a deliberate, reviewable
 * edit of this snapshot.
 */
const EXPECTED_METHODS = [
  'addConcept',
  'addEdge',
  'addMisconception',
  'addRelatedEdge',
  'adjustForPsychometrics',
  'clear',
  'computeAndStoreCognitiveProfile',
  'computeAndStoreDerivedProfiles',
  'computeAndStoreLearningStyle',
  'computeZPD',
  'deleteConcept',
  'deleteEdge',
  'deleteKnowledgeState',
  'deleteLearnerProfile',
  'deleteRelatedEdge',
  'detectGaps',
  'generateLearningPath',
  'generateRemediationPlan',
  'getConcept',
  'getDependentChain',
  'getDependents',
  'getEdge',
  'getKnowledgeState',
  'getLearnerKnowledgeStates',
  'getLearnerProfile',
  'getPrerequisiteChain',
  'getPrerequisites',
  'getPsychometricScores',
  'getRelatedEdges',
  'getReviewQueue',
  'getStats',
  'listConcepts',
  'listConceptsByBloomLevel',
  'listConceptsByDifficulty',
  'listConceptsByDomain',
  'listEdges',
  'listLearnerProfiles',
  'listRelatedEdges',
  'predictDecay',
  'scheduleNextReview',
  'searchConcepts',
  'selectScaffoldingStrategies',
  'setKnowledgeState',
  'setLearnerProfile',
  'updatePsychometricScore',
  'updatePsychometricScores',
] as const;

/** Must never be remotely callable: store lifecycle, raw batch, server-only path. */
const FORBIDDEN_METHODS = ['open', 'close', 'batch', 'addConceptsAndEdges'];

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const methodsSource = read('src/lib/graph/methods.ts');
const engineSource = read('src/lib/graph/education-graph-db.ts');
const functionsSource = read('src/server/graph.functions.ts');
const dbContextSource = read('src/lib/DBContext.tsx');

/** A class-body method declaration on EducationGraphDB, async or sync. */
const methodDeclaration = (name: string) => new RegExp(`^\\s+(?:async\\s+)?${name}\\(`, 'm');

describe('REMOTE_GRAPH_METHODS allow-list', () => {
  it('exposes exactly the 46 expected methods, in source order', () => {
    assert.equal(methods.length, 46);
    assert.deepEqual(methods, [...EXPECTED_METHODS]);
  });

  it('contains only unique non-empty strings', () => {
    assert.ok(methods.every((m) => typeof m === 'string' && m.length > 0));
    assert.equal(new Set(methods).size, methods.length);
  });

  it('never exposes store lifecycle, raw batch, or server-only methods', () => {
    for (const name of FORBIDDEN_METHODS) {
      assert.equal(methods.includes(name), false, `${name} must not be remotely callable`);
      // Keeps the lock meaningful: these exist on the engine but stay private.
      assert.match(engineSource, methodDeclaration(name), `${name} should still exist on EducationGraphDB`);
    }
  });

  it('only lists methods declared on EducationGraphDB, async or sync', () => {
    for (const name of methods) {
      assert.match(engineSource, methodDeclaration(name), `${name} must be declared as a method`);
    }
    // Sync methods are legitimate (the proxy wraps them as async) — the guard
    // above must not implicitly require `async`.
    for (const name of ['predictDecay', 'scheduleNextReview', 'adjustForPsychometrics', 'selectScaffoldingStrategies']) {
      assert.match(engineSource, new RegExp(`^\\s+${name}\\(`, 'm'), `${name} is declared without async`);
    }
  });
});

describe('graph method wiring (static)', () => {
  it('methods.ts stays free of runtime imports (safe in the browser bundle)', () => {
    const importLines = methodsSource.split('\n').filter((line) => line.trimStart().startsWith('import'));
    assert.ok(importLines.length >= 1, 'expected the type-only EducationGraphDB import');
    for (const line of importLines) {
      assert.match(line.trim(), /^import\s+type\b/, 'only type-only imports are allowed');
    }
  });

  it('graph.functions.ts validates the method against the allow-list and scopes to the owner', () => {
    assert.ok(functionsSource.includes('method: z.enum(REMOTE_GRAPH_METHODS)'));
    assert.equal(/method:\s*z\.string\(\)/.test(functionsSource), false);
    assert.ok(functionsSource.includes('graphForOwner(context.userId)'));
  });

  it('createRemoteGraphDB forwards exactly the allow-listed methods', () => {
    const start = dbContextSource.indexOf('export function createRemoteGraphDB');
    assert.ok(start >= 0, 'createRemoteGraphDB must stay in DBContext.tsx');
    const end = dbContextSource.indexOf('\n}', start);
    assert.ok(end > start, 'createRemoteGraphDB must be a top-level function');
    const fnSource = dbContextSource.slice(start, end);
    assert.ok(
      fnSource.includes('for (const method of REMOTE_GRAPH_METHODS)'),
      'the proxy must be built by iterating the allow-list',
    );
    assert.ok(
      fnSource.includes('graphCall({ data: { method, args: JSON.parse(JSON.stringify(args ?? [])) } })'),
      'calls must forward { method, args } through the JSON round-trip',
    );
    // No method name may be hardcoded in the proxy builder.
    for (const name of [...methods, ...FORBIDDEN_METHODS]) {
      assert.equal(fnSource.includes(`'${name}'`), false, `hardcoded '${name}'`);
      assert.equal(fnSource.includes(`"${name}"`), false, `hardcoded "${name}"`);
    }
  });
});
