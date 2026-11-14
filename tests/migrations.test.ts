/**
 * Direct unit tests for the PGlite/preview migration applier
 * `src/lib/migrations.ts` (`applyMigrations` + `pgliteMigratable`), used by
 * `src/lib/db.ts` when `DATABASE_URL` is empty and by every PGlite test.
 *
 * Until now the module was only used indirectly, so apply order, `_migrations`
 * bookkeeping and transaction wrapping were never locked down. The module is not
 * changed by this file: a fake `MigratableDb` records `exec`/`query`/
 * `transaction` (SQL, parameters and a transaction marker) and a PGlite-shaped
 * fake stands in for a real instance, so nothing is spawned and no dependency is
 * added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { applyMigrations, pgliteMigratable, type MigratableDb } from '../src/lib/migrations.ts';

const CREATE_TABLE =
  'create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())';
const SELECT_APPLIED = 'select name from _migrations';
const INSERT_APPLIED = 'insert into _migrations (name) values ($1)';

type Call = {
  source: 'db' | 'tx';
  kind: 'exec' | 'query';
  sql: string;
  params: unknown[];
};

/** Fake database that records every call and hands out one fake tx per migration. */
class FakeDb implements MigratableDb {
  readonly calls: Call[] = [];
  readonly applied: string[];
  readonly txIds: number[] = [];
  /** Return an error to make `tx.exec` throw for that SQL text. */
  failExec?: (sql: string) => Error | undefined;
  /** Return an error to make the `_migrations` insert throw for that name. */
  failInsert?: (name: string) => Error | undefined;

  constructor(applied: string[] = []) {
    this.applied = applied;
  }

  async exec(sql: string): Promise<unknown> {
    this.calls.push({ source: 'db', kind: 'exec', sql, params: [] });
    return { ok: true };
  }

  async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ source: 'db', kind: 'query', sql, params: params ?? [] });
    if (sql === SELECT_APPLIED) {
      return { rows: this.applied.map((name) => ({ name })) as T[] };
    }
    return { rows: [] };
  }

  async transaction<T>(fn: (tx: MigratableDb) => Promise<T>): Promise<T> {
    const id = this.txIds.length + 1;
    this.txIds.push(id);
    return fn(new FakeTx(this, id));
  }
}

class FakeTx implements MigratableDb {
  readonly db: FakeDb;
  readonly id: number;

  constructor(db: FakeDb, id: number) {
    this.db = db;
    this.id = id;
  }

  async exec(sql: string): Promise<unknown> {
    this.db.calls.push({ source: 'tx', kind: 'exec', sql, params: [] });
    const failure = this.db.failExec?.(sql);
    if (failure) throw failure;
    return { ok: true, tx: this.id };
  }

  async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    this.db.calls.push({ source: 'tx', kind: 'query', sql, params: params ?? [] });
    if (sql === INSERT_APPLIED) {
      const failure = this.db.failInsert?.(String(params?.[0]));
      if (failure) throw failure;
    }
    return { rows: [] };
  }

  async transaction<T>(): Promise<T> {
    throw new Error('applyMigrations must not nest transactions');
  }
}

/** Calls grouped as SQL + params, for order assertions. */
const appliedCalls = (db: FakeDb) =>
  db.calls.map(({ source, kind, sql, params }) => ({ source, kind, sql, params }));

describe('applyMigrations', () => {
  it('creates the bookkeeping table and reads applied names first, even with no files', async () => {
    const db = new FakeDb();

    assert.equal(await applyMigrations(db, {}), undefined);

    assert.deepEqual(appliedCalls(db), [
      { source: 'db', kind: 'exec', sql: CREATE_TABLE, params: [] },
      { source: 'db', kind: 'query', sql: SELECT_APPLIED, params: [] },
    ]);
    assert.deepEqual(db.txIds, []);
  });

  it('applies only .sql files in basename order, one transaction each, with basename bookkeeping', async () => {
    const db = new FakeDb();
    const files = {
      'migrations/0010_last.sql': 'sql ten',
      'migrations/0002_beta.sql': 'sql two beta',
      'migrations/auth/0001_auth.sql': 'sql one',
      'migrations/0002_Alpha.sql': 'sql two Alpha',
      'migrations/README.md': 'not sql',
      'migrations/auth': 'not sql',
    };

    await applyMigrations(db, files);

    assert.deepEqual(appliedCalls(db), [
      { source: 'db', kind: 'exec', sql: CREATE_TABLE, params: [] },
      { source: 'db', kind: 'query', sql: SELECT_APPLIED, params: [] },
      { source: 'tx', kind: 'exec', sql: 'sql one', params: [] },
      { source: 'tx', kind: 'query', sql: INSERT_APPLIED, params: ['0001_auth.sql'] },
      { source: 'tx', kind: 'exec', sql: 'sql two Alpha', params: [] },
      { source: 'tx', kind: 'query', sql: INSERT_APPLIED, params: ['0002_Alpha.sql'] },
      { source: 'tx', kind: 'exec', sql: 'sql two beta', params: [] },
      { source: 'tx', kind: 'query', sql: INSERT_APPLIED, params: ['0002_beta.sql'] },
      { source: 'tx', kind: 'exec', sql: 'sql ten', params: [] },
      { source: 'tx', kind: 'query', sql: INSERT_APPLIED, params: ['0010_last.sql'] },
    ]);
    assert.deepEqual(db.txIds, [1, 2, 3, 4]);
  });

  it('skips migrations already recorded in _migrations by basename, including subdirectory paths', async () => {
    const db = new FakeDb(['0001_auth.sql', '0003_done.sql']);
    const files = {
      'migrations/auth/0001_auth.sql': 'sql one',
      'migrations/0002_new.sql': 'sql two',
      'migrations/0003_done.sql': 'sql three',
    };

    await applyMigrations(db, files);

    assert.deepEqual(
      db.calls.filter((c) => c.source === 'tx'),
      [
        { source: 'tx', kind: 'exec', sql: 'sql two', params: [] },
        { source: 'tx', kind: 'query', sql: INSERT_APPLIED, params: ['0002_new.sql'] },
      ],
    );
    assert.deepEqual(db.txIds, [1]);
  });

  it('does not record bookkeeping for skipped migrations', async () => {
    const db = new FakeDb(['0001_a.sql', '0002_b.sql']);
    const files = {
      'migrations/0001_a.sql': 'a',
      'migrations/0002_b.sql': 'b',
    };

    await applyMigrations(db, files);

    assert.deepEqual(
      db.calls.map((c) => c.source),
      ['db', 'db'],
    );
    assert.deepEqual(db.txIds, []);
  });

  it('propagates an exec failure and does not attempt later migrations', async () => {
    const boom = new Error('exec failed');
    const db = new FakeDb();
    db.failExec = (sql) => (sql === 'sql two' ? boom : undefined);
    const files = {
      'migrations/0001_one.sql': 'sql one',
      'migrations/0002_two.sql': 'sql two',
      'migrations/0003_three.sql': 'sql three',
    };

    await assert.rejects(applyMigrations(db, files), (error) => error === boom);

    assert.deepEqual(
      db.calls.filter((c) => c.source === 'tx'),
      [
        { source: 'tx', kind: 'exec', sql: 'sql one', params: [] },
        { source: 'tx', kind: 'query', sql: INSERT_APPLIED, params: ['0001_one.sql'] },
        { source: 'tx', kind: 'exec', sql: 'sql two', params: [] },
      ],
    );
    assert.deepEqual(db.txIds, [1, 2]);
    assert.equal(
      db.calls.some((c) => c.sql === 'sql three'),
      false,
    );
  });

  it('propagates an insert failure and does not attempt later migrations', async () => {
    const boom = new Error('insert failed');
    const db = new FakeDb();
    db.failInsert = (name) => (name === '0002_two.sql' ? boom : undefined);
    const files = {
      'migrations/0001_one.sql': 'sql one',
      'migrations/0002_two.sql': 'sql two',
      'migrations/0003_three.sql': 'sql three',
    };

    await assert.rejects(applyMigrations(db, files), (error) => error === boom);

    assert.deepEqual(appliedCalls(db).slice(2), [
      { source: 'tx', kind: 'exec', sql: 'sql one', params: [] },
      { source: 'tx', kind: 'query', sql: INSERT_APPLIED, params: ['0001_one.sql'] },
      { source: 'tx', kind: 'exec', sql: 'sql two', params: [] },
      { source: 'tx', kind: 'query', sql: INSERT_APPLIED, params: ['0002_two.sql'] },
    ]);
    assert.deepEqual(db.txIds, [1, 2]);
    assert.equal(
      db.calls.some((c) => c.sql === 'sql three'),
      false,
    );
  });
});

/** Calls (not results) recorded by the PGlite-shaped fake. */
type PgCall = { source: 'pg' | 'tx'; kind: 'exec' | 'query'; text: string; params?: unknown[] };

/**
 * Minimal PGlite stand-in: outer `exec`/`query` and a distinct transaction
 * object both record calls, and `query` returns a full PGlite-style result so
 * the adapter can be checked for narrowing it to `{ rows }`.
 */
class FakePglite {
  readonly calls: PgCall[] = [];
  transactionCalls = 0;
  readonly execResult = { ok: true };
  readonly queryResult = { rows: [{ value: 1 }], affectedRows: 9, fields: [] };

  async exec(text: string): Promise<unknown> {
    this.calls.push({ source: 'pg', kind: 'exec', text });
    return this.execResult;
  }

  async query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ source: 'pg', kind: 'query', text, params });
    return this.queryResult as unknown as { rows: T[] };
  }

  readonly tx = {
    exec: async (text: string) => {
      this.calls.push({ source: 'tx', kind: 'exec', text });
      return { ok: true };
    },
    query: async <T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> => {
      this.calls.push({ source: 'tx', kind: 'query', text, params });
      return this.queryResult as unknown as { rows: T[] };
    },
  };

  async transaction<T>(fn: (tx: typeof this.tx) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    return fn(this.tx);
  }
}

describe('pgliteMigratable', () => {
  it('forwards exec text unchanged and passes its result through', async () => {
    const pg = new FakePglite();
    const db = pgliteMigratable(pg as unknown as PGlite);
    const text = '  create table x (\n  id int\n);\n';

    assert.equal(await db.exec(text), pg.execResult);

    assert.deepEqual(pg.calls, [{ source: 'pg', kind: 'exec', text }]);
  });

  it('forwards query text and parameters and returns only { rows }', async () => {
    const pg = new FakePglite();
    const db = pgliteMigratable(pg as unknown as PGlite);

    assert.deepEqual(await db.query('select $1::int as value', [7]), {
      rows: [{ value: 1 }],
    });

    assert.deepEqual(pg.calls, [
      { source: 'pg', kind: 'query', text: 'select $1::int as value', params: [7] },
    ]);
  });

  it('forwards an omitted parameter list as undefined', async () => {
    const pg = new FakePglite();
    const db = pgliteMigratable(pg as unknown as PGlite);

    await db.query('select now()');

    assert.deepEqual(pg.calls, [
      { source: 'pg', kind: 'query', text: 'select now()', params: undefined },
    ]);
  });

  it('calls pg.transaction exactly once and returns the callback value', async () => {
    const pg = new FakePglite();
    const db = pgliteMigratable(pg as unknown as PGlite);

    const result = await db.transaction(async () => 'callback result');

    assert.equal(result, 'callback result');
    assert.equal(pg.transactionCalls, 1);
    assert.deepEqual(pg.calls, []);
  });

  it('uses the transaction object for exec and query inside the callback', async () => {
    const pg = new FakePglite();
    const db = pgliteMigratable(pg as unknown as PGlite);

    await db.transaction(async (tx) => {
      await tx.exec('begin-ish sql');
      assert.deepEqual(await tx.query('select inside_tx', [3]), { rows: [{ value: 1 }] });
    });

    assert.equal(pg.transactionCalls, 1);
    assert.deepEqual(pg.calls, [
      { source: 'tx', kind: 'exec', text: 'begin-ish sql' },
      { source: 'tx', kind: 'query', text: 'select inside_tx', params: [3] },
    ]);
    assert.equal(
      pg.calls.some((c) => c.source === 'pg'),
      false,
    );
  });
});
