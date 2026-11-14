/**
 * Direct unit tests for the embedded PGlite dialect used whenever
 * `DATABASE_URL` is empty (local dev and every PGlite test):
 * `src/lib/pglite-dialect.ts`.
 *
 * Until now the module was only used indirectly through other tests, so its
 * lazy client resolution, single-connection queue and transaction SQL were
 * never locked down. The module is not changed by this file. A tiny fake
 * client (`{ query }` returning configurable `{ rows, affectedRows }`) stands
 * in for a real PGlite instance, so nothing is spawned and no dependency is
 * added.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CompiledQuery,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Kysely,
} from 'kysely';
import { pgliteDialect } from '../src/lib/pglite-dialect.ts';

type QueryRecord = { sql: string; parameters: readonly unknown[] };
type QueryOutcome = { rows: unknown[]; affectedRows?: number };

/** Minimal PGlite stand-in: records every query and returns a set outcome. */
class FakeClient {
  readonly queries: QueryRecord[] = [];
  closeCalls = 0;
  outcome: QueryOutcome = { rows: [] };

  async query<T>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{
    rows: T[];
    affectedRows?: number;
  }> {
    this.queries.push({ sql, parameters: parameters ?? [] });
    return {
      rows: this.outcome.rows as T[],
      affectedRows: this.outcome.affectedRows,
    };
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

type Harness = {
  client: FakeClient;
  getClientCalls: () => number;
  dialect: ReturnType<typeof pgliteDialect>;
  driver: ReturnType<ReturnType<typeof pgliteDialect>['createDriver']>;
};

/** A dialect plus driver over one fake client that counts factory calls. */
function makeHarness(client = new FakeClient()): Harness {
  let calls = 0;
  const dialect = pgliteDialect(() => {
    calls += 1;
    return client as never;
  });
  return {
    client,
    getClientCalls: () => calls,
    dialect,
    driver: dialect.createDriver(),
  };
}

/** Let queued promise reactions run without resolving pending connections. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

async function acquire(harness: Harness): Promise<DatabaseConnection> {
  return harness.driver.acquireConnection();
}

/** Drain an async iterable into an array of yielded results. */
async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe('pgliteDialect', () => {
  it('builds Postgres adapter, compiler and introspector plus a lazy driver', () => {
    const { dialect, getClientCalls } = makeHarness();

    assert.ok(dialect.createAdapter() instanceof PostgresAdapter);
    assert.ok(dialect.createQueryCompiler() instanceof PostgresQueryCompiler);
    assert.ok(
      dialect.createIntrospector({} as unknown as Kysely<unknown>) instanceof PostgresIntrospector,
    );

    const driver = dialect.createDriver();
    for (const method of [
      'init',
      'acquireConnection',
      'releaseConnection',
      'beginTransaction',
      'commitTransaction',
      'rollbackTransaction',
      'destroy',
    ] as const) {
      assert.equal(typeof driver[method], 'function', method);
    }

    assert.equal(getClientCalls(), 0, 'the client factory stays untouched until first use');
  });

  it('resolves the client once in init() and reuses it for later acquires', async () => {
    const harness = makeHarness();

    await harness.driver.init();
    assert.equal(harness.getClientCalls(), 1);

    const connection = await acquire(harness);
    await harness.driver.releaseConnection(connection);
    await acquire(harness);

    assert.equal(harness.getClientCalls(), 1, 'acquire must not call the factory after init');
  });

  it('resolves the client once when acquireConnection() runs before init()', async () => {
    const harness = makeHarness();

    const first = await acquire(harness);
    assert.equal(harness.getClientCalls(), 1);

    await harness.driver.releaseConnection(first);
    await acquire(harness);

    assert.equal(harness.getClientCalls(), 1);
  });
});

describe('LazyPGliteDriver single connection queue', () => {
  it('holds a second acquire until the first connection is released', async () => {
    const harness = makeHarness();
    const first = await acquire(harness);

    let secondResolved = false;
    const secondPromise = acquire(harness).then((connection) => {
      secondResolved = true;
      return connection;
    });

    await flushMicrotasks();
    assert.equal(secondResolved, false, 'only one connection may be handed out at a time');

    await harness.driver.releaseConnection(first);
    const second = await secondPromise;

    assert.equal(secondResolved, true);
    assert.equal(second, first, 'the waiter receives the very same connection');
    assert.equal(harness.getClientCalls(), 1);
  });

  it('hands released connections to waiters in FIFO order', async () => {
    const harness = makeHarness();
    const first = await acquire(harness);

    const order: string[] = [];
    const secondPromise = acquire(harness).then((connection) => {
      order.push('second');
      return connection;
    });
    const thirdPromise = acquire(harness).then((connection) => {
      order.push('third');
      return connection;
    });

    await flushMicrotasks();
    assert.deepEqual(order, []);

    await harness.driver.releaseConnection(first);
    const second = await secondPromise;
    assert.deepEqual(order, ['second']);

    await harness.driver.releaseConnection(second);
    const third = await thirdPromise;
    assert.deepEqual(order, ['second', 'third']);

    assert.equal(second, first);
    assert.equal(third, first);
  });

  it('creates a fresh connection once the queue is empty again', async () => {
    const harness = makeHarness();
    const first = await acquire(harness);
    await harness.driver.releaseConnection(first);

    const next = await acquire(harness);

    assert.notEqual(next, first, 'a released connection is not reused when nobody waits');
    assert.equal(harness.getClientCalls(), 1, 'the same underlying client is reused');
  });

  it('rejects connections the driver does not own', async () => {
    const harness = makeHarness();

    await assert.rejects(
      harness.driver.releaseConnection({} as DatabaseConnection),
      /^Error: Invalid connection$/,
    );
  });
});

describe('LazyPGliteDriver transactions', () => {
  let harness: Harness;
  let connection: DatabaseConnection;

  beforeEach(async () => {
    harness = makeHarness();
    connection = await acquire(harness);
  });

  it('sends a bare begin when no isolation level is requested', async () => {
    await harness.driver.beginTransaction(connection, {});

    assert.deepEqual(harness.client.queries, [{ sql: 'begin', parameters: [] }]);
  });

  it('sends the requested isolation level and no parameters', async () => {
    await harness.driver.beginTransaction(connection, {
      isolationLevel: 'serializable',
    });

    assert.deepEqual(harness.client.queries, [
      { sql: 'start transaction isolation level serializable', parameters: [] },
    ]);
  });

  it('sends commit and rollback without parameters', async () => {
    await harness.driver.commitTransaction(connection);
    await harness.driver.rollbackTransaction(connection);

    assert.deepEqual(harness.client.queries, [
      { sql: 'commit', parameters: [] },
      { sql: 'rollback', parameters: [] },
    ]);
  });
});

describe('PGliteConnection.executeQuery', () => {
  it('forwards sql and parameters unchanged and returns the rows', async () => {
    const harness = makeHarness();
    const connection = await acquire(harness);
    harness.client.outcome = { rows: [{ id: 1 }, { id: 2 }] };

    const result = await connection.executeQuery(
      CompiledQuery.raw('select * from learners where id = $1 and name ilike $2', [7, '%sari%']),
    );

    assert.deepEqual(result, { rows: [{ id: 1 }, { id: 2 }] });
    assert.deepEqual(harness.client.queries, [
      {
        sql: 'select * from learners where id = $1 and name ilike $2',
        parameters: [7, '%sari%'],
      },
    ]);
  });

  it('adds numAffectedRows only when affectedRows is truthy', async () => {
    const harness = makeHarness();
    const connection = await acquire(harness);
    const query = CompiledQuery.raw('update learners set name = $1', ['Sari']);

    harness.client.outcome = { rows: [], affectedRows: 3 };
    assert.deepEqual(await connection.executeQuery(query), {
      numAffectedRows: 3n,
      rows: [],
    });

    harness.client.outcome = { rows: [{ ok: true }], affectedRows: 0 };
    const zero = await connection.executeQuery(query);
    assert.deepEqual(zero, { rows: [{ ok: true }] });
    assert.equal('numAffectedRows' in zero, false);

    harness.client.outcome = { rows: [] };
    const missing = await connection.executeQuery(query);
    assert.deepEqual(missing, { rows: [] });
    assert.equal('numAffectedRows' in missing, false);
  });
});

describe('PGliteConnection.streamQuery', () => {
  it('rejects a chunkSize that is not a positive integer without querying', async () => {
    const harness = makeHarness();
    const connection = await acquire(harness);

    for (const chunkSize of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const iterator = connection.streamQuery(CompiledQuery.raw('select 1'), chunkSize);
      await assert.rejects(
        iterator.next(),
        /^Error: chunkSize must be a positive integer$/,
        `chunkSize ${chunkSize}`,
      );
    }

    assert.deepEqual(harness.client.queries, []);
  });

  it('splits rows into consecutive chunks of chunkSize', async () => {
    const harness = makeHarness();
    const connection = await acquire(harness);
    harness.client.outcome = { rows: [1, 2, 3, 4, 5] };

    const chunks = await collect(connection.streamQuery(CompiledQuery.raw('select n'), 2));

    assert.deepEqual(chunks, [{ rows: [1, 2] }, { rows: [3, 4] }, { rows: [5] }]);
    assert.deepEqual(harness.client.queries, [{ sql: 'select n', parameters: [] }]);
  });

  it('yields a single chunk when chunkSize exceeds the row count', async () => {
    const harness = makeHarness();
    const connection = await acquire(harness);
    harness.client.outcome = { rows: ['a', 'b'] };

    const chunks = await collect(connection.streamQuery(CompiledQuery.raw('select $1', [1]), 100));

    assert.deepEqual(chunks, [{ rows: ['a', 'b'] }]);
    assert.deepEqual(harness.client.queries, [{ sql: 'select $1', parameters: [1] }]);
  });

  it('yields nothing for an empty result but still runs the query', async () => {
    const harness = makeHarness();
    const connection = await acquire(harness);

    const chunks = await collect(connection.streamQuery(CompiledQuery.raw('select 1'), 1));

    assert.deepEqual(chunks, []);
    assert.deepEqual(harness.client.queries, [{ sql: 'select 1', parameters: [] }]);
  });
});

describe('LazyPGliteDriver.destroy', () => {
  it('never closes the shared client and re-resolves it on the next acquire', async () => {
    const harness = makeHarness();
    const first = await acquire(harness);
    await harness.driver.releaseConnection(first);

    await harness.driver.destroy();
    assert.equal(harness.client.closeCalls, 0, 'the PGlite singleton belongs to its creator');

    await acquire(harness);
    assert.equal(harness.getClientCalls(), 2, 'destroy drops the local handle only');
  });
});
