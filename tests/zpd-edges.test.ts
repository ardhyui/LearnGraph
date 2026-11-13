/**
 * Roadmap M2: computeZPD and detectGaps load the prerequisite edges once
 * instead of once per concept. The results must not change: the "First
 * learn: A → B → C" chain built in memory equals getPrerequisiteChain.
 * P0.4: the "Missing N prerequisite(s)" reason carries concept names, not
 * raw ids.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openTestGraphDB } from './support/graph-db.ts';
import { seedDemoDataIfEmpty } from '../src/lib/graph/seed.ts';

const DIR = path.join(os.tmpdir(), `learngraph-zpd-edges-${process.pid}`);

/** A fresh subdirectory per test (PGlite does not create parents). */
function testDir(name: string): string {
  const dir = path.join(DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ZPD with edges loaded once', () => {
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it('recommends with the same prerequisite chains as getPrerequisiteChain', async () => {
    const db = await openTestGraphDB(testDir('chains'));
    try {
      await seedDemoDataIfEmpty(db);
      // A deeper chain than the demo data has, with a shared prerequisite.
      await db.addConcept({ conceptId: 'x1', name: 'X1', domain: 'mathematics' });
      await db.addConcept({ conceptId: 'x2', name: 'X2', domain: 'mathematics' });
      await db.addEdge({ from: 'quadratic-equations', to: 'x1' });
      await db.addEdge({ from: 'fractions', to: 'x1' });
      await db.addEdge({ from: 'x1', to: 'x2' });
      let compared = 0;
      for (const learner of ['demo-alice', 'demo-bob', 'demo-carol']) {
        const zpd = await db.computeZPD(learner, { limit: 50 });
        for (const rec of zpd.recommendations) {
          const chain = await db.getPrerequisiteChain(rec.concept.conceptId, 3);
          assert.deepEqual(rec.prerequisiteChain, chain.map((c) => c.concept.name), rec.concept.conceptId);
          compared++;
        }
        for (const zc of [...zpd.zpd, ...zpd.tooHard, ...zpd.tooEasy]) {
          const prereqs = await db.getPrerequisites(zc.concept.conceptId);
          const states = await db.getLearnerKnowledgeStates(learner);
          const missing = prereqs
            .filter((e) => (states.find((s) => s.conceptId === e.from)?.mastery ?? 0) < 80)
            .map((e) => e.from);
          assert.deepEqual(zc.missingPrerequisites, missing, zc.concept.conceptId);
        }
      }
      assert.ok(compared > 0, 'no recommendation was compared');
      // x2's chain reaches three levels: x1, then quadratic-equations and fractions, then their prerequisites.
      const chain = (await db.getPrerequisiteChain('x2', 3)).map((c) => c.concept.conceptId);
      assert.deepEqual(chain.slice(0, 3), ['x1', 'fractions', 'quadratic-equations']);
    } finally {
      await db.close();
    }
  });

  it('writes too-hard reasons with concept names, never raw ids', async () => {
    const db = await openTestGraphDB(testDir('reasons'));
    try {
      await seedDemoDataIfEmpty(db);
      // A learner with no progress yet, so every prerequisite is missing.
      await db.setLearnerProfile('fresh-learner', { name: 'Fresh Learner' });
      await db.addConcept({ conceptId: 'concept:foundations-a', name: 'Foundations A', domain: 'mathematics' });
      await db.addConcept({ conceptId: 'concept:foundations-b', name: '   ', domain: 'mathematics' });
      await db.addConcept({ conceptId: 'concept:bridge-topic', name: 'Bridge Topic', domain: 'mathematics' });
      await db.addEdge({ from: 'concept:foundations-a', to: 'concept:bridge-topic' });
      await db.addEdge({ from: 'concept:foundations-b', to: 'concept:bridge-topic' });
      // One mastered concept locks the too-easy wording (demo ids are seeded
      // without the "concept:" prefix).
      await db.setKnowledgeState('fresh-learner', 'arithmetic', { mastery: 95 });

      const zpd = await db.computeZPD('fresh-learner', { limit: 50 });

      // The bridge concept is too hard: both prerequisites are missing, and
      // the reason names them (readable fallback for the unnamed one).
      const bridge = [...zpd.tooHard, ...zpd.zpd, ...zpd.tooEasy].find(
        (zc) => zc.concept.conceptId === 'concept:bridge-topic'
      );
      assert.ok(bridge, 'bridge-topic is not in any zone');
      assert.equal(bridge.zone, 'too_hard');
      assert.deepEqual(bridge.missingPrerequisites, ['concept:foundations-a', 'concept:foundations-b']);
      assert.equal(bridge.reason, 'Missing 2 prerequisite(s): Foundations A, Foundations b');

      // No zone reason leaks a raw id.
      for (const zc of [...zpd.tooEasy, ...zpd.zpd, ...zpd.tooHard]) {
        assert.ok(!zc.reason.includes('concept:'), `${zc.concept.conceptId}: ${zc.reason}`);
      }

      // Other reasons and zones keep their exact wording and shape.
      const mastered = zpd.tooEasy.find((zc) => zc.concept.conceptId === 'arithmetic');
      assert.equal(mastered?.reason, 'Already mastered (95% mastery)');
      const ready = zpd.zpd.find((zc) => zc.concept.conceptId === 'concept:foundations-a');
      assert.equal(ready?.reason, 'All prerequisites mastered - ready to learn!');
      assert.deepEqual(
        new Set(Object.keys(zpd)),
        new Set(['userId', 'computedAt', 'computationTimeMs', 'tooEasy', 'zpd', 'tooHard', 'recommendations', 'psychometricAdjustments', 'suggestedPath']),
      );
    } finally {
      await db.close();
    }
  });
});
