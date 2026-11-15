/**
 * Direct unit tests for the Postgres key-value store `src/lib/graph/store.ts`
 * (`PostgresGraphStore` + `tableForKey`) — the ordered key-value contract the
 * graph engine (`EducationGraphDB`) is written against. Until now the store was
 * only exercised indirectly through the engine (tests/support/graph-db.ts,
 * owner isolation, demo seed, api-v1, …), so the prefix→table routing, the
 * LevelDB-style JSON round-trip semantics, the extracted id columns per table,
 * the collate "C" prefix scans and `batch`/`clear` were never locked down at
 * the store's own level. The module is not changed: one in-memory PGlite (like
 * CI) gets the real migrations/ files, Kysely uses the app's PGlite dialect,
 * and every owner under test gets a `user` row first because `owner_id` has a
 * foreign key there. Extraction columns are verified with raw SQL against the
 * tables, never through the engine.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Kysely } from 'kysely';
import { applyMigrations, pgliteMigratable } from '../src/lib/migrations.ts';
import { pgliteDialect } from '../src/lib/pglite-dialect.ts';
import {
  GRAPH_TABLES,
  PostgresGraphStore,
  tableForKey,
  type GraphDatabase,
} from '../src/lib/graph/store.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');
const OWNER_A = 'store-owner-a';
const OWNER_B = 'store-owner-b';

function migrationFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (name.endsWith('.sql')) files[name] = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
  }
  return files;
}

describe('tableForKey / GRAPH_TABLES (pure routing)', () => {
  it('maps each key prefix to exactly its table', () => {
    assert.equal(tableForKey('learner:l1'), 'learners');
    assert.equal(tableForKey('concept:c1'), 'concepts');
    assert.equal(tableForKey('edge:prereq:c-from:c-to'), 'prerequisite_edges');
    assert.equal(tableForKey('edge:related:r1'), 'related_edges');
    assert.equal(tableForKey('state:u1:c1'), 'knowledge_states');
    assert.equal(tableForKey('index:domain:math'), 'graph_indexes');
    // A bare prefix routes too — scans resolve their own table.
    assert.equal(tableForKey('learner:'), 'learners');
    assert.equal(tableForKey('concept:'), 'concepts');
    assert.equal(tableForKey('edge:prereq:'), 'prerequisite_edges');
    assert.equal(tableForKey('edge:related:'), 'related_edges');
    assert.equal(tableForKey('state:'), 'knowledge_states');
    assert.equal(tableForKey('index:'), 'graph_indexes');
  });

  it('throws the exact error for unknown prefixes', () => {
    assert.throws(() => tableForKey('bogus:x'), {
      message: 'Unknown LearnGraph key prefix: bogus:x',
    });
    assert.throws(() => tableForKey(''), { message: 'Unknown LearnGraph key prefix: ' });
    // "edge" alone is not a table — only its two concrete prefixes are.
    assert.throws(() => tableForKey('edge:'), {
      message: 'Unknown LearnGraph key prefix: edge:',
    });
    assert.throws(() => tableForKey('edge:other:x'), {
      message: 'Unknown LearnGraph key prefix: edge:other:x',
    });
    assert.throws(() => tableForKey('learners'), {
      message: 'Unknown LearnGraph key prefix: learners',
    });
  });

  it('GRAPH_TABLES is exactly the six graph tables', () => {
    assert.deepEqual(GRAPH_TABLES, [
      'learners',
      'concepts',
      'prerequisite_edges',
      'related_edges',
      'knowledge_states',
      'graph_indexes',
    ]);
  });
});

describe('PostgresGraphStore on in-memory PGlite', () => {
  let pg: PGlite;
  let db: Kysely<GraphDatabase>;
  let storeA: PostgresGraphStore;
  let storeB: PostgresGraphStore;

  /** First row of a raw SQL query — used to check columns, bypassing the engine. */
  async function row(sql: string, params: unknown[]): Promise<any> {
    const result = await pg.query(sql, params);
    return result.rows[0];
  }

  before(async () => {
    pg = new PGlite(); // in-memory, like CI
    await pg.waitReady;
    await applyMigrations(pgliteMigratable(pg), migrationFiles());
    // owner_id has a FK to "user", so each test owner needs a user row.
    for (const owner of [OWNER_A, OWNER_B]) {
      await pg.query(
        `insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, false)`,
        [owner, owner, `${owner}@example.test`],
      );
    }
    db = new Kysely<GraphDatabase>({ dialect: pgliteDialect(() => pg) });
    storeA = new PostgresGraphStore(db, OWNER_A);
    storeB = new PostgresGraphStore(db, OWNER_B);
  });

  after(async () => {
    await db.destroy();
    await pg.close();
  });

  it('rejects an empty ownerId', () => {
    assert.throws(() => new PostgresGraphStore(db, ''), {
      message: 'PostgresGraphStore requires an ownerId',
    });
  });

  it('get/put/del/exists follow the key-value contract', async () => {
    assert.equal(await storeA.get('index:absent'), null);
    assert.equal(await storeA.exists('index:absent'), false);

    await storeA.put('learner:l1', { userId: 'l1', name: 'Ayu' });
    assert.deepEqual(await storeA.get('learner:l1'), { userId: 'l1', name: 'Ayu' });
    assert.equal(await storeA.exists('learner:l1'), true);

    // put overwrites via the (owner_id, key) conflict — the new value wins.
    await storeA.put('learner:l1', { userId: 'l1', name: 'Ayu II' });
    assert.deepEqual(await storeA.get('learner:l1'), { userId: 'l1', name: 'Ayu II' });

    await storeA.del('learner:l1');
    assert.equal(await storeA.get('learner:l1'), null);
    assert.equal(await storeA.exists('learner:l1'), false);

    // Deleting an absent key is not an error.
    await storeA.del('index:never-there');
  });

  it('stores values with LevelDB JSON semantics (undefined dropped, Date -> ISO)', async () => {
    await storeA.put('index:roundtrip', {
      keep: 1,
      drop: undefined,
      nested: {
        at: new Date('2026-11-15T10:00:00.000Z'),
        list: [1, 'two', null, true],
        gone: undefined,
      },
    });
    const value = await storeA.get<Record<string, any>>('index:roundtrip');
    assert.ok(value);
    assert.equal('drop' in value, false);
    assert.equal('gone' in value.nested, false);
    assert.deepEqual(value, {
      keep: 1,
      nested: { at: '2026-11-15T10:00:00.000Z', list: [1, 'two', null, true] },
    });
  });

  it('extracts the per-table id columns (raw SQL, not the engine)', async () => {
    // learner:{id} -> user_id from the key.
    await storeA.put('learner:l-col', { userId: 'l-col', name: 'Rian' });
    let r = await row('select user_id from learners where owner_id = $1 and key = $2', [
      OWNER_A,
      'learner:l-col',
    ]);
    assert.equal(r.user_id, 'l-col');

    // concept:{id} -> concept_id from the key, domain from the value.
    await storeA.put('concept:c-col', { conceptId: 'c-col', domain: 'math', name: 'Fractions' });
    let c = await row('select concept_id, domain from concepts where owner_id = $1 and key = $2', [
      OWNER_A,
      'concept:c-col',
    ]);
    assert.equal(c.concept_id, 'c-col');
    assert.equal(c.domain, 'math');
    // Missing or non-string domain -> null column, while the JSON keeps it.
    await storeA.put('concept:c-nodom', { conceptId: 'c-nodom' });
    c = await row('select domain from concepts where owner_id = $1 and key = $2', [
      OWNER_A,
      'concept:c-nodom',
    ]);
    assert.equal(c.domain, null);
    await storeA.put('concept:c-baddom', { conceptId: 'c-baddom', domain: 7 });
    c = await row('select domain from concepts where owner_id = $1 and key = $2', [
      OWNER_A,
      'concept:c-baddom',
    ]);
    assert.equal(c.domain, null);
    assert.deepEqual(await storeA.get('concept:c-baddom'), { conceptId: 'c-baddom', domain: 7 });

    // edge:prereq:{...} -> from_concept/to_concept from value.from/value.to.
    await storeA.put('edge:prereq:c-from:c-to', {
      from: 'c-from',
      to: 'c-to',
      strength: 'required',
    });
    let e = await row(
      'select from_concept, to_concept from prerequisite_edges where owner_id = $1 and key = $2',
      [OWNER_A, 'edge:prereq:c-from:c-to'],
    );
    assert.equal(e.from_concept, 'c-from');
    assert.equal(e.to_concept, 'c-to');
    // Overwriting the key updates the extracted columns along with the data.
    await storeA.put('edge:prereq:c-from:c-to', { from: 'c-x', to: 'c-y', strength: 'helpful' });
    e = await row(
      'select from_concept, to_concept from prerequisite_edges where owner_id = $1 and key = $2',
      [OWNER_A, 'edge:prereq:c-from:c-to'],
    );
    assert.equal(e.from_concept, 'c-x');
    assert.equal(e.to_concept, 'c-y');
    // Missing from/to -> null columns.
    await storeA.put('edge:prereq:lonely', {});
    e = await row(
      'select from_concept, to_concept from prerequisite_edges where owner_id = $1 and key = $2',
      [OWNER_A, 'edge:prereq:lonely'],
    );
    assert.equal(e.from_concept, null);
    assert.equal(e.to_concept, null);

    // edge:related:{id} -> edge_id from the key.
    await storeA.put('edge:related:r-col', { edgeId: 'r-col', relationship: 'similar' });
    r = await row('select edge_id from related_edges where owner_id = $1 and key = $2', [
      OWNER_A,
      'edge:related:r-col',
    ]);
    assert.equal(r.edge_id, 'r-col');

    // state:{...} -> learner_id/concept_id from value.userId/value.conceptId.
    await storeA.put('state:u-col:c-col', {
      userId: 'u-col',
      conceptId: 'c-col',
      mastery: 10,
    });
    let s = await row(
      'select learner_id, concept_id from knowledge_states where owner_id = $1 and key = $2',
      [OWNER_A, 'state:u-col:c-col'],
    );
    assert.equal(s.learner_id, 'u-col');
    assert.equal(s.concept_id, 'c-col');
    await storeA.put('state:lonely', {});
    s = await row(
      'select learner_id, concept_id from knowledge_states where owner_id = $1 and key = $2',
      [OWNER_A, 'state:lonely'],
    );
    assert.equal(s.learner_id, null);
    assert.equal(s.concept_id, null);

    // index: keys carry no extra columns at all.
    await storeA.put('index:no-extras', { any: 'thing' });
    const full = await row('select * from graph_indexes where owner_id = $1 and key = $2', [
      OWNER_A,
      'index:no-extras',
    ]);
    assert.deepEqual(Object.keys(full).sort(), ['data', 'key', 'owner_id']);
  });

  it('prefix scans return only the range, in collate "C" byte order', async () => {
    for (const key of ['concept:a', 'concept:a:1', 'concept:ab', 'concept:b', 'concept:A']) {
      await storeA.put(key, { key });
    }
    // ':' (0x3a) sorts before 'b' (0x62); a key sorts before its own extensions.
    assert.deepEqual(await storeA.listKeys('concept:a'), ['concept:a', 'concept:a:1', 'concept:ab']);
    // Byte order is case-sensitive: 'A' (0x41) never matches the 'concept:a' range.
    assert.deepEqual(await storeA.listKeys('concept:A'), ['concept:A']);

    for (const key of ['index:ord:2', 'index:ord:10', 'index:ord:1']) {
      await storeA.put(key, { key });
    }
    // Byte order, not natural sort: '1' < '10' < '2'.
    assert.deepEqual(await storeA.listKeys('index:ord:'), [
      'index:ord:1',
      'index:ord:10',
      'index:ord:2',
    ]);
    assert.deepEqual(await storeA.listKeys('index:ord:', { reverse: true }), [
      'index:ord:2',
      'index:ord:10',
      'index:ord:1',
    ]);
    assert.deepEqual(await storeA.listKeys('index:ord:', { limit: 2 }), [
      'index:ord:1',
      'index:ord:10',
    ]);
    assert.deepEqual(await storeA.listKeys('index:ord:', { reverse: true, limit: 2 }), [
      'index:ord:2',
      'index:ord:10',
    ]);
    assert.deepEqual(await storeA.listEntries('index:ord:', { limit: 1 }), [
      { key: 'index:ord:1', value: { key: 'index:ord:1' } },
    ]);
  });

  it('scopes every operation to its owner (store-level isolation)', async () => {
    await storeA.put('learner:iso', { userId: 'iso', name: 'A' });
    await storeB.put('learner:iso', { userId: 'iso', name: 'B' });
    await storeB.put('learner:iso-b', { userId: 'iso-b', name: 'B2' });

    // Same key, two rows — B's put must not overwrite A's row.
    assert.deepEqual(await storeA.get('learner:iso'), { userId: 'iso', name: 'A' });
    assert.deepEqual(await storeB.get('learner:iso'), { userId: 'iso', name: 'B' });
    const counted = await row('select count(*)::int as n from learners where key = $1', [
      'learner:iso',
    ]);
    assert.equal(counted.n, 2);

    // Scans only ever see the calling owner's keys.
    assert.deepEqual(await storeA.listKeys('learner:iso'), ['learner:iso']);
    assert.deepEqual(await storeB.listKeys('learner:iso'), ['learner:iso', 'learner:iso-b']);
    assert.equal(await storeA.exists('learner:iso-b'), false);
    assert.equal(await storeA.get('learner:iso-b'), null);

    // Deleting in one owner leaves the other untouched.
    await storeB.del('learner:iso');
    assert.deepEqual(await storeA.get('learner:iso'), { userId: 'iso', name: 'A' });
  });

  it('batch applies puts and dels in order inside one transaction', async () => {
    // Empty batch: resolves with no effect.
    await storeA.put('index:batch:keep', { n: 7 });
    await storeA.batch([]);
    assert.deepEqual(await storeA.get('index:batch:keep'), { n: 7 });

    // Ops apply in order: a put followed by a del on the same key leaves nothing.
    await storeA.batch([
      { type: 'put', key: 'index:batch:a', value: { n: 1 } },
      { type: 'put', key: 'index:batch:keep', value: { n: 2 } },
      { type: 'del', key: 'index:batch:keep' },
    ]);
    assert.deepEqual(await storeA.get('index:batch:a'), { n: 1 });
    assert.equal(await storeA.get('index:batch:keep'), null);

    // …and a del followed by a put resurrects the key with the new value.
    await storeA.batch([
      { type: 'del', key: 'index:batch:a' },
      { type: 'put', key: 'index:batch:a', value: { n: 3 } },
    ]);
    assert.deepEqual(await storeA.get('index:batch:a'), { n: 3 });

    // A put with value === undefined is skipped entirely: no write, no delete.
    await storeA.batch([
      { type: 'put', key: 'index:batch:keep2', value: { n: 4 } },
      { type: 'put', key: 'index:batch:keep2', value: undefined },
      { type: 'put', key: 'index:batch:never', value: undefined },
    ]);
    assert.deepEqual(await storeA.get('index:batch:keep2'), { n: 4 });
    assert.equal(await storeA.exists('index:batch:never'), false);

    // One failing op rolls the whole batch back — nothing stays written.
    await assert.rejects(
      storeA.batch([
        { type: 'put', key: 'index:batch:rollback', value: { n: 1 } },
        { type: 'put', key: 'bogus:x', value: { n: 1 } },
      ]),
      { message: 'Unknown LearnGraph key prefix: bogus:x' },
    );
    assert.equal(await storeA.exists('index:batch:rollback'), false);
  });

  it('clear removes only this owner across all six tables; close calls onClose once', async () => {
    for (const key of [
      'learner:clr',
      'concept:clr',
      'edge:prereq:clr:clr',
      'edge:related:clr',
      'state:clr:clr',
      'index:clr',
    ]) {
      await storeA.put(key, { tag: 'a' });
    }
    await storeB.put('concept:clr', { tag: 'b' });

    await storeA.clear();
    for (const table of GRAPH_TABLES) {
      const counted = await row(`select count(*)::int as n from ${table} where owner_id = $1`, [
        OWNER_A,
      ]);
      assert.equal(counted.n, 0, `${table} should be empty for ${OWNER_A}`);
    }
    // The other owner keeps every row.
    assert.deepEqual(await storeB.get('concept:clr'), { tag: 'b' });
    const bCount = await row('select count(*)::int as n from concepts where owner_id = $1', [
      OWNER_B,
    ]);
    assert.equal(bCount.n, 1);

    let closes = 0;
    const closing = new PostgresGraphStore(db, OWNER_A, {
      onClose: async () => {
        closes += 1;
      },
    });
    await closing.close();
    assert.equal(closes, 1);
  });
});
