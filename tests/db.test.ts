/**
 * Direct unit tests for the server-only database access module
 * `src/lib/db.ts` (`dbSource`, `getDb`, `ensureDbReady` and
 * `dumpLocalJapaneseDatabase`).
 *
 * Until now the module was only exercised indirectly through handlers and
 * engines, so the backend switch, the global memoization and the backup guard
 * were never locked down. The module is not changed by this file. A fake
 * PGlite is injected through the global the module already memoizes
 * (`__learngraphPglite__`) before the dynamic import, so the automatic
 * bootstrap awaits it instead of starting WASM (or `import.meta.glob`, which
 * only Vite provides). The Postgres selection is checked in a child process
 * because `dbSource` is fixed at module load time.
 */
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

const DB_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'db.ts');

// CI runs with DATABASE_URL empty; make the local run behave the same so the
// module picks the PGlite branch this file tests.
const originalDatabaseUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
// The backup helper must only run when the operator opts in.
const originalJapaneseLocalOrigin = process.env.JAPANESE_LOCAL_ORIGIN;
delete process.env.JAPANESE_LOCAL_ORIGIN;

type DbGlobals = typeof globalThis & {
  __learngraphKysely__?: unknown;
  __learngraphPglite__?: Promise<PGlite>;
};
const g = globalThis as DbGlobals;

/** PGlite stand-in: records `dumpDataDir` calls and returns a gzip-shaped blob. */
class FakePglite {
  dumpCalls: string[] = [];
  dumpBytes = new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0x03]);

  async dumpDataDir(kind: string): Promise<Blob> {
    this.dumpCalls.push(kind);
    return new Blob([this.dumpBytes]);
  }
}

/** Install a fresh fake bootstrap and clear the memoized Kysely instance. */
function installFakeBootstrap(): FakePglite {
  const fake = new FakePglite();
  g.__learngraphPglite__ = Promise.resolve(fake as unknown as PGlite);
  g.__learngraphKysely__ = undefined;
  return fake;
}

// Hand the first fake to the module-level bootstrap before evaluating db.ts.
installFakeBootstrap();
const { dbSource, ensureDbReady, getDb, dumpLocalJapaneseDatabase } =
  await import('../src/lib/db.ts');

after(() => {
  g.__learngraphKysely__ = undefined;
  g.__learngraphPglite__ = undefined;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalJapaneseLocalOrigin === undefined) delete process.env.JAPANESE_LOCAL_ORIGIN;
  else process.env.JAPANESE_LOCAL_ORIGIN = originalJapaneseLocalOrigin;
});

beforeEach(() => {
  installFakeBootstrap();
  delete process.env.JAPANESE_LOCAL_ORIGIN;
});

describe('dbSource', () => {
  it('is pglite when DATABASE_URL is empty (the CI setup)', () => {
    assert.equal(dbSource, 'pglite');
  });

  it('is postgres when DATABASE_URL is set, without opening a connection', () => {
    const script = `
      const mod = await import(${JSON.stringify(new URL(`file://${DB_FILE}`).href)});
      process.stdout.write(mod.dbSource);
    `;
    const output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script],
      {
        cwd: join(import.meta.dirname, '..'),
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/learngraph' },
      },
    );
    assert.equal(output.trim(), 'postgres');
  });

  it('is pglite when DATABASE_URL is only whitespace (the value is trimmed)', () => {
    // The fake global stops the automatic bootstrap from starting real WASM.
    const script = `
      globalThis.__learngraphPglite__ = Promise.resolve({});
      const mod = await import(${JSON.stringify(new URL(`file://${DB_FILE}`).href)});
      process.stdout.write(mod.dbSource);
    `;
    const output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script],
      {
        cwd: join(import.meta.dirname, '..'),
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: '   ' },
      },
    );
    assert.equal(output.trim(), 'pglite');
  });
});

describe('getDb', () => {
  it('refuses to run in the browser before creating or storing an instance', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true,
    });
    try {
      const fake = installFakeBootstrap();
      assert.throws(() => getDb(), {
        message: '@/lib/db is server-only — use it from a server function.',
      });
      assert.equal(g.__learngraphKysely__, undefined, 'no Kysely instance is memoized');
      assert.deepEqual(fake.dumpCalls, [], 'the database is never reached');
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it('memoizes one Kysely instance across calls on the server', () => {
    const first = getDb();
    const second = getDb();
    assert.equal(first, second);
    assert.equal(g.__learngraphKysely__, first, 'the shared instance lives on globalThis');
  });
});

describe('ensureDbReady', () => {
  it('waits for the already memoized PGlite promise without opening another one', async () => {
    let release!: (value: PGlite) => void;
    const pending = new Promise<PGlite>((resolve) => {
      release = resolve;
    });
    g.__learngraphPglite__ = pending;

    let settled = false;
    const ready = ensureDbReady().then(() => {
      settled = true;
    });
    await Promise.resolve();
    assert.equal(settled, false, 'it waits for the PGlite bootstrap');
    assert.equal(g.__learngraphPglite__, pending, 'it reuses the memoized promise');

    release(new FakePglite() as unknown as PGlite);
    await ready;
    assert.equal(settled, true);
    assert.equal(g.__learngraphPglite__, pending, 'the promise was not replaced');
    assert.equal(g.__learngraphKysely__, undefined, 'bootstrapping opens no Kysely instance');
  });
});

describe('dumpLocalJapaneseDatabase', () => {
  it('is disabled without JAPANESE_LOCAL_ORIGIN and never touches the database', async () => {
    const fake = installFakeBootstrap();
    await assert.rejects(dumpLocalJapaneseDatabase(), {
      message: 'Local backup is disabled.',
    });
    assert.deepEqual(fake.dumpCalls, []);
  });

  it('returns the gzip bytes from dumpDataDir as a Uint8Array', async () => {
    process.env.JAPANESE_LOCAL_ORIGIN = 'http://localhost:3000';
    const fake = installFakeBootstrap();

    const dump = await dumpLocalJapaneseDatabase();

    assert.ok(dump instanceof Uint8Array, 'the caller gets bytes, not a Blob');
    assert.ok(!(dump instanceof Blob));
    assert.deepEqual([...dump], [...fake.dumpBytes]);
    assert.deepEqual(fake.dumpCalls, ['gzip'], 'dumpDataDir is called once with gzip');
  });
});

describe('static wiring guards', () => {
  const source = readFileSync(DB_FILE, 'utf8');

  it('stays a documented server-only module', () => {
    assert.ok(source.startsWith('/**\n * Server-only database access (Kysely).'));
  });

  it('derives dbSource from a trimmed DATABASE_URL', () => {
    assert.match(
      source,
      /const value = typeof process !== 'undefined' \? process\.env\[key\]\?\.trim\(\) : undefined;/,
    );
    assert.match(source, /const databaseUrl = env\('DATABASE_URL'\);/);
    assert.match(source, /export const dbSource: DbSource = databaseUrl \? 'postgres' : 'pglite';/);
  });

  it('bootstraps automatically only on the server with PGlite', () => {
    assert.match(
      source,
      /if \(typeof window === 'undefined' && dbSource === 'pglite'\) \{\n {2}void ensureDbReady\(\)\.catch/,
    );
    assert.match(source, /if \(dbSource === 'pglite'\) await getPglite\(\);/);
  });

  it('checks for the browser before memoizing a Kysely instance', () => {
    const windowCheck = source.indexOf("if (typeof window !== 'undefined')");
    const memoization = source.indexOf('__learngraphKysely__ ??=');
    assert.ok(windowCheck >= 0 && memoization > windowCheck);
  });

  it('guards the backup before opening the data directory', () => {
    const guard = source.indexOf('!process.env.JAPANESE_LOCAL_ORIGIN');
    const dump = source.indexOf("dumpDataDir('gzip')");
    assert.ok(guard >= 0 && dump > guard);
  });
});
