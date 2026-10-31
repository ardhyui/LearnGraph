/**
 * Spaced repetition: the due-review queue must contain concepts whose
 * interval since the last review has elapsed, and not freshly reviewed ones.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { expect } from './support/expect.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const TEST_DB_PATH = path.join(os.tmpdir(), `learngraph-review-queue-${process.pid}`);
const clean = () => fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });

describe('Review queue (spaced repetition)', () => {
  let db: EducationGraphDB;

  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(TEST_DB_PATH);
  });

  afterEach(async () => {
    await db.close();
    clean();
  });

  it('includes overdue concepts and excludes just-reviewed ones', async () => {
    for (const id of ['fresh', 'old']) {
      await db.addConcept({ conceptId: id, name: id, domain: 'testing', description: id });
    }
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.setKnowledgeState('u1', 'fresh', { mastery: 90, lastReviewed: new Date().toISOString() });
    await db.setKnowledgeState('u1', 'old', { mastery: 80, lastReviewed: old });

    const { queue, stats } = await db.getReviewQueue('u1');
    const ids = queue.map((q) => q.conceptId);
    expect(ids.includes('old')).toBe(true);
    expect(ids.includes('fresh')).toBe(false);
    expect(stats.overdue).toBe(1);
    const item = queue.find((q) => q.conceptId === 'old')!;
    expect(new Date(item.nextReviewDate).getTime() <= Date.now()).toBe(true);

    const all = await db.getReviewQueue('u1', { includeNotDue: true });
    const fresh = all.queue.find((q) => q.conceptId === 'fresh')!;
    expect(new Date(fresh.nextReviewDate).getTime() > Date.now()).toBe(true);
  });
});
