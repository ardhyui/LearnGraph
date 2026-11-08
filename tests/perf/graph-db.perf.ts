/**
 * Graph store latency guard, run with `npm run test:perf`.
 *
 * Wall-clock results depend on the machine and its load, so this suite stays
 * outside `npm test` and `npm run ci`. It compares the median of many samples
 * to a budget in order to catch order-of-magnitude regressions. It measures
 * on-disk PGlite and says nothing about a remote Postgres, where the network
 * dominates.
 */

import { after, before, describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../../src/lib/graph/education-graph-db.ts';
import { expect } from '../support/expect.ts';
import { openTestGraphDB } from '../support/graph-db.ts';
import { getRAGContext } from '../../src/lib/tutor/service.ts';

const SAMPLES = 50;
const WRITE_BUDGET_MS = 100;
const READ_BUDGET_MS = 30;
/** Roadmap M2: "computeZPD < 200 ms di Postgres dengan 200 konsep". */
const ZPD_CONCEPTS = 200;
const ZPD_BUDGET_MS = 200;
/** Roadmap M4: "getRAGContext … < 150 ms". */
const RAG_BUDGET_MS = 150;

const DB_PATH = path.join(os.tmpdir(), `learngraph-perf-db-${process.pid}`);

async function medianMs(operation: (sample: number) => Promise<unknown>, samples = SAMPLES): Promise<number> {
  const timings: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    await operation(sample);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  return timings[Math.floor(samples / 2)];
}

describe('Graph store latency (on-disk PGlite)', () => {
  let db: EducationGraphDB;

  before(async () => {
    fs.rmSync(DB_PATH, { recursive: true, force: true });
    db = await openTestGraphDB(DB_PATH);
    await db.setLearnerProfile('perf-read', { name: 'Performance Test' });
    await db.addConcept({
      conceptId: 'perf-read',
      name: 'Performance Concept',
      domain: 'test',
      description: 'Testing performance',
    });
  });

  after(async () => {
    await db.close();
    fs.rmSync(DB_PATH, { recursive: true, force: true });
  });

  it(`writes a learner profile within ${WRITE_BUDGET_MS}ms (median)`, async () => {
    const median = await medianMs((i) => db.setLearnerProfile(`perf-${i}`, { name: 'Performance Test' }));
    console.log(`Learner write median: ${median.toFixed(2)}ms`);
    expect(median).toBeLessThan(WRITE_BUDGET_MS);
  });

  it(`reads a learner profile within ${READ_BUDGET_MS}ms (median)`, async () => {
    const median = await medianMs(() => db.getLearnerProfile('perf-read'));
    console.log(`Learner read median: ${median.toFixed(2)}ms`);
    expect(median).toBeLessThan(READ_BUDGET_MS);
  });

  it(`writes a concept within ${WRITE_BUDGET_MS}ms (median)`, async () => {
    const median = await medianMs((i) =>
      db.addConcept({
        conceptId: `perf-${i}`,
        name: 'Performance Concept',
        domain: 'test',
        description: 'Testing performance',
      }),
    );
    console.log(`Concept write median: ${median.toFixed(2)}ms`);
    expect(median).toBeLessThan(WRITE_BUDGET_MS);
  });

  it(`reads a concept within ${READ_BUDGET_MS}ms (median)`, async () => {
    const median = await medianMs(() => db.getConcept('perf-read'));
    console.log(`Concept read median: ${median.toFixed(2)}ms`);
    expect(median).toBeLessThan(READ_BUDGET_MS);
  });
});

describe(`ZPD on a ${ZPD_CONCEPTS}-concept curriculum (on-disk PGlite)`, () => {
  const ZPD_PATH = `${DB_PATH}-zpd`;
  let db: EducationGraphDB;

  before(async () => {
    fs.rmSync(ZPD_PATH, { recursive: true, force: true });
    db = await openTestGraphDB(ZPD_PATH);
    await db.setLearnerProfile('zpd-learner', { name: 'ZPD Learner' });
    // 10 subjects of 20 concepts: a chain inside each subject, plus a link from
    // every fifth concept to the next subject (about 230 edges).
    for (let i = 0; i < ZPD_CONCEPTS; i++) {
      const subject = Math.floor(i / 20);
      await db.addConcept({
        conceptId: `c-${i}`,
        name: `Concept ${i}`,
        domain: `subject-${subject}`,
        difficulty: { absolute: 1 + (i % 10), cognitiveLoad: 0.5, abstractness: 0.5 },
      });
      if (i % 20 > 0) await db.addEdge({ from: `c-${i - 1}`, to: `c-${i}`, strength: 'required' });
      if (subject > 0 && i % 5 === 0) await db.addEdge({ from: `c-${i - 20}`, to: `c-${i}`, strength: 'helpful' });
      // The first 8 of every subject are learned.
      if (i % 20 < 8) await db.setKnowledgeState('zpd-learner', `c-${i}`, { mastery: 90, lastReviewed: new Date().toISOString() });
    }
  });

  after(async () => {
    await db.close();
    fs.rmSync(ZPD_PATH, { recursive: true, force: true });
  });

  it(`computes the ZPD within ${ZPD_BUDGET_MS}ms (median)`, async () => {
    const zpd = await db.computeZPD('zpd-learner', { limit: 8 });
    expect(zpd.recommendations.length).toBe(8);
    const median = await medianMs(() => db.computeZPD('zpd-learner', { limit: 8 }), 10);
    console.log(`computeZPD median (${ZPD_CONCEPTS} concepts): ${median.toFixed(1)}ms`);
    expect(median).toBeLessThan(ZPD_BUDGET_MS);
  });

  it(`builds the tutor context within ${RAG_BUDGET_MS}ms (median)`, async () => {
    const ctx = await getRAGContext(db, { learnerId: 'zpd-learner', conceptId: 'c-50', query: 'explain this' });
    expect(ctx?.text.includes('Topic: Concept 50')).toBe(true);
    const median = await medianMs(() => getRAGContext(db, { learnerId: 'zpd-learner', conceptId: 'c-50', query: 'explain this' }), 10);
    console.log(`getRAGContext median (${ZPD_CONCEPTS} concepts): ${median.toFixed(1)}ms`);
    expect(median).toBeLessThan(RAG_BUDGET_MS);
  });

  it(`detects gaps within ${ZPD_BUDGET_MS}ms (median)`, async () => {
    const median = await medianMs(() => db.detectGaps('zpd-learner'), 10);
    console.log(`detectGaps median (${ZPD_CONCEPTS} concepts): ${median.toFixed(1)}ms`);
    expect(median).toBeLessThan(ZPD_BUDGET_MS);
  });
});
