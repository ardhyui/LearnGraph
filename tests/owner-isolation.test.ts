/**
 * New with the Postgres migration: data is scoped to the signed-in account.
 */
import { describe, it, after } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect } from './support/expect.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const DIR = path.join(os.tmpdir(), `learngraph-isolation-${process.pid}`);

describe('Owner isolation', () => {
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it("never exposes one account's workspace to another", async () => {
    const alice = await openTestGraphDB(DIR, 'owner-alice');
    await alice.setLearnerProfile('learner-1', { name: 'Only Alice sees me' });
    await alice.addConcept({ conceptId: 'algebra', name: 'Algebra', domain: 'math', description: '' });
    await alice.close();

    const bob = await openTestGraphDB(DIR, 'owner-bob');
    expect(await bob.getLearnerProfile('learner-1')).toBeNull();
    expect((await bob.listConcepts()).length).toBe(0);
    await bob.clear();
    await bob.close();

    const alice2 = await openTestGraphDB(DIR, 'owner-alice');
    expect((await alice2.getLearnerProfile('learner-1'))?.name).toBe('Only Alice sees me');
    expect((await alice2.getStats()).conceptCount).toBe(1);
    await alice2.close();
  });
});
