/**
 * New-user onboarding: helpers that turn the welcome form into a learner
 * profile + starting knowledge, and the round trip through the server schema
 * and the engine (the plan then starts one step further for "I know the basics").
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { parseGraphArgs, writeId } from '../src/lib/graph/rpc-schemas.ts';
import {
  basicConcepts,
  cleanName,
  domainLabel,
  focusDomains,
  focusTags,
  inFocus,
  isDemoLearner,
  listDomains,
  makeLearnerId,
  needsOnboarding,
} from '../src/lib/onboarding.ts';
import { applyStudyOutcome } from '../src/lib/study.ts';
import { openTestGraphDB } from './support/graph-db.ts';

describe('needsOnboarding', () => {
  it('is true until the workspace has a learner that is not a demo learner', () => {
    assert.equal(needsOnboarding([]), true);
    assert.equal(needsOnboarding([{ userId: 'demo-alice' }, { userId: 'demo-bob' }]), true);
    assert.equal(needsOnboarding([{ userId: 'demo-alice' }, { userId: 'me-sari' }]), false);
    assert.equal(isDemoLearner({ userId: 'demolition' }), false);
  });
});

describe('cleanName / makeLearnerId', () => {
  it('cleans names and rejects blank ones', () => {
    assert.equal(cleanName('  Sari   Dewi \n'), 'Sari Dewi');
    assert.equal(cleanName('   '), null);
    assert.equal(cleanName('x'.repeat(300))!.length, 200);
  });

  it('makes a readable, unique id that the server accepts as a storage key', () => {
    assert.equal(makeLearnerId('Sari Dewi', []), 'me-sari-dewi');
    assert.equal(makeLearnerId('Sari Dewi', ['me-sari-dewi']), 'me-sari-dewi-2');
    assert.equal(makeLearnerId('Sari Dewi', ['me-sari-dewi', 'me-sari-dewi-2']), 'me-sari-dewi-3');
    assert.equal(makeLearnerId('Zoë Ñúñez', []), 'me-zoe-nunez');
    assert.equal(makeLearnerId('李雷', []), 'me-learner');
    assert.equal(makeLearnerId('a:b', []), 'me-a-b');
    for (const name of ['Sari Dewi', '李雷', 'a:b', ' x '.repeat(100), 'demo-alice']) {
      const id = makeLearnerId(name, []);
      assert.ok(writeId.safeParse(id).success, id);
      assert.ok(!isDemoLearner({ userId: id }), id);
    }
  });
});

describe('domains & focus', () => {
  const concepts = [
    { conceptId: 'a', domain: 'mathematics' },
    { conceptId: 'b', domain: 'mathematics' },
    { conceptId: 'c', domain: 'computer-science' },
    { conceptId: 'd', domain: '' },
  ];

  it('lists distinct domains with counts, sorted', () => {
    assert.deepEqual(listDomains(concepts), [
      { domain: 'computer-science', count: 1 },
      { domain: 'mathematics', count: 2 },
    ]);
    assert.equal(domainLabel('computer-science'), 'Computer science');
    assert.equal(domainLabel('math_101'), 'Math 101');
  });

  it('stores the chosen subjects as tags and reads them back', () => {
    const tags = focusTags(['mathematics', 'mathematics', 'x'.repeat(80)]);
    assert.deepEqual(tags, ['focus:mathematics']); // duplicates dropped, too-long skipped
    assert.deepEqual(focusDomains({ tags: [...tags, 'honors'] }), ['mathematics']);
    assert.deepEqual(focusDomains(null), []);
  });

  it('filters by focus, falling back to everything when the focus matches nothing', () => {
    const d = (c: { domain: string }) => c.domain;
    assert.deepEqual(inFocus(concepts, ['mathematics'], d).map((c) => c.conceptId), ['a', 'b']);
    assert.equal(inFocus(concepts, [], d).length, 4);
    assert.equal(inFocus(concepts, ['history'], d).length, 4);
  });

  it('basics = concepts of the chosen subjects without a prerequisite', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'gone', to: 'c' }, // edge from a deleted concept doesn't count
    ];
    assert.deepEqual(basicConcepts(concepts, edges, ['mathematics']), ['a']);
    assert.deepEqual(basicConcepts(concepts, edges, []), ['a', 'c', 'd']);
  });
});

const DIR = path.join(os.tmpdir(), `learngraph-onboarding-${process.pid}`);
const clean = () => fs.rmSync(DIR, { recursive: true, force: true });

describe('onboarding through the server schema and the engine', () => {
  let db: EducationGraphDB;
  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(DIR);
    await db.addConcept({ conceptId: 'count', name: 'Counting', domain: 'math', description: '' });
    await db.addConcept({ conceptId: 'add', name: 'Addition', domain: 'math', description: '' });
    await db.addConcept({ conceptId: 'vars', name: 'Variables', domain: 'cs', description: '' });
    await db.addEdge({ from: 'count', to: 'add', strength: 'required' });
  });
  afterEach(async () => {
    await db.close();
    clean();
  });

  it('"I know the basics" starts the plan one step further, in the chosen subject', async () => {
    const [concepts, edges] = [await db.listConcepts(), await db.listEdges()];
    const id = makeLearnerId('Sari', []);
    const profile = { name: 'Sari', tags: focusTags(['math']) };
    // exactly what the dashboard sends — must pass server validation
    assert.doesNotThrow(() => parseGraphArgs('setLearnerProfile', [id, profile]));
    await db.setLearnerProfile(id, profile);

    const basics = basicConcepts(concepts, edges, focusDomains(await db.getLearnerProfile(id)));
    assert.deepEqual(basics, ['count']);
    for (const conceptId of basics) {
      const patch = applyStudyOutcome(undefined, 'got-it');
      assert.doesNotThrow(() => parseGraphArgs('setKnowledgeState', [id, conceptId, patch]));
      await db.setKnowledgeState(id, conceptId, patch);
    }

    const zpd = await db.computeZPD(id, { limit: 10 });
    const next = inFocus(zpd.recommendations, ['math'], (r) => r.concept.domain).map((r) => r.concept.conceptId);
    assert.deepEqual(next, ['add']);
  });
});
