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

const SAMPLES = 50;
const WRITE_BUDGET_MS = 100;
const READ_BUDGET_MS = 30;

const DB_PATH = path.join(os.tmpdir(), `learngraph-perf-db-${process.pid}`);

async function medianMs(operation: (sample: number) => Promise<unknown>): Promise<number> {
  const timings: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample++) {
    const start = performance.now();
    await operation(sample);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  return timings[Math.floor(SAMPLES / 2)];
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
