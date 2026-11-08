/**
 * Roadmap M2: computeZPD and detectGaps load the prerequisite edges once
 * instead of once per concept. The results must not change: the "First
 * learn: A → B → C" chain built in memory equals getPrerequisiteChain.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openTestGraphDB } from './support/graph-db.ts';
import { seedDemoDataIfEmpty } from '../src/lib/graph/seed.ts';

const DIR = path.join(os.tmpdir(), `learngraph-zpd-edges-${process.pid}`);

describe('ZPD with edges loaded once', () => {
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it('recommends with the same prerequisite chains as getPrerequisiteChain', async () => {
    const db = await openTestGraphDB(DIR);
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
});
