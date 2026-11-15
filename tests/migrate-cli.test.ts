/**
 * Direct CLI tests for the deploy-time migrator `scripts/migrate.mjs`
 * (node-postgres, runs on every `npm run build` via `db:migrate`).
 *
 * The module calls `main()` at import time and exits 0/1 at the top level, so
 * it must never be imported by a test — every case spawns it as a child process
 * with `spawnSync` (the pattern of `tests/with-app-env.test.ts`). No real
 * database is touched: the unreachable `DATABASE_URL` points at 127.0.0.1:1,
 * and the schema-less paths (`no migrations/ …`) run a *copy* of the script in
 * a temporary root with the repository `node_modules` symlinked in, so `pg`
 * still resolves while `migrations/` is missing or empty. The script's
 * behaviour is not changed by this file; the tests lock the current contract:
 *
 * - no `DATABASE_URL` → skip with exit 0 (the CI / local-preview path),
 * - unreachable `DATABASE_URL` with pending migrations → exit 1, never 0,
 * - no pending migrations → exit 0 *even with* an unreachable `DATABASE_URL`
 *   (the pool must not be opened before the pending check),
 * - the child env is fully controlled (a `.env` next to the script is not
 *   read) and CLI arguments never change the path.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'migrate.mjs');
const NODE = process.execPath;

/** Nothing listens on 127.0.0.1:1 — `pg` gets an instant ECONNREFUSED. */
const UNREACHABLE = 'postgres://127.0.0.1:1/db';

const SKIP_MESSAGE =
  '[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).';
const NO_DIR_MESSAGE = '[migrate] no migrations/ directory — nothing to do.';
const NO_MIGRATIONS_MESSAGE = '[migrate] no migrations — nothing to do.';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { force: true, recursive: true });
  }
});

/**
 * The child env is derived from `process.env` so `PATH`/`HOME` survive, but
 * `DATABASE_URL` is always deleted first and `NODE_OPTIONS` (which could
 * smuggle `--env-file` into the child) is never forwarded.
 */
function childEnv(databaseUrl?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DATABASE_URL;
  delete env.NODE_OPTIONS;
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  return env;
}

function runMigrate(
  script: string = SCRIPT,
  options: { args?: string[]; env?: NodeJS.ProcessEnv; cwd?: string } = {},
) {
  const result = spawnSync(NODE, [script, ...(options.args ?? [])], {
    encoding: 'utf8',
    env: options.env ?? childEnv(),
    cwd: options.cwd,
    timeout: 60_000,
  });
  assert.equal(result.error, undefined, 'the child process must start');
  return result;
}

/**
 * A copy of the migrator in `<tmp>/scripts/` with the repository
 * `node_modules` symlinked next to it: `pg` and `./migration-plan.mjs`
 * resolve exactly as in the repo, but the `migrations/` directory is looked
 * up relative to the copy, so the schema-less paths can be exercised.
 */
function makeStandaloneRoot(): { root: string; script: string } {
  const root = makeTempDir('migrate-cli-root-');
  mkdirSync(join(root, 'scripts'));
  copyFileSync(SCRIPT, join(root, 'scripts', 'migrate.mjs'));
  copyFileSync(
    join(ROOT, 'scripts', 'migration-plan.mjs'),
    join(root, 'scripts', 'migration-plan.mjs'),
  );
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
  return { root, script: join(root, 'scripts', 'migrate.mjs') };
}

describe('no DATABASE_URL — the skip path', () => {
  it('exits 0 with the exact skip message and nothing on stderr', () => {
    const result = runMigrate();

    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${SKIP_MESSAGE}\n`);
    assert.equal(result.stderr, '');
  });

  it('treats an empty DATABASE_URL exactly like an unset one', () => {
    const result = runMigrate(SCRIPT, { env: childEnv('') });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${SKIP_MESSAGE}\n`);
    assert.equal(result.stderr, '');
  });

  it('ignores CLI arguments — the skip still happens', () => {
    const result = runMigrate(SCRIPT, { args: ['--up', 'extra', '-x'] });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${SKIP_MESSAGE}\n`);
  });

  it('does not read a `.env` file sitting next to the script', () => {
    // A stray `process.loadEnvFile()` or wrapper import would pick this up.
    const { root, script } = makeStandaloneRoot();
    writeFileSync(join(root, '.env'), `DATABASE_URL=${UNREACHABLE}\n`);

    const result = runMigrate(script, { env: childEnv(), cwd: root });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${SKIP_MESSAGE}\n`);
    assert.equal(result.stderr, '');
  });
});

describe('unreachable DATABASE_URL — repository checkout (migrations pending)', () => {
  it('exits 1 with a `[migrate] failed:` line and never claims success', () => {
    // The repository migrations/ directory holds nine .sql files, so the
    // pending check passes and the pool is opened — and refused.
    const result = runMigrate(SCRIPT, { env: childEnv(UNREACHABLE) });

    assert.equal(result.status, 1);
    assert.ok(result.stderr.startsWith('[migrate] failed:'), result.stderr);
    assert.ok(result.stderr.includes('ECONNREFUSED'), result.stderr);
    assert.equal(result.stdout, '');
  });

  it('CLI arguments do not rescue the run', () => {
    const result = runMigrate(SCRIPT, {
      args: ['--force', 'whatever'],
      env: childEnv(UNREACHABLE),
    });

    assert.equal(result.status, 1);
    assert.ok(result.stderr.startsWith('[migrate] failed:'), result.stderr);
  });
});

describe('schema-less app — script copy in a temporary root', () => {
  it('missing migrations/ directory: exit 0 despite the unreachable DATABASE_URL', () => {
    const { root, script } = makeStandaloneRoot();

    const result = runMigrate(script, { env: childEnv(UNREACHABLE), cwd: root });

    // Exit 0 proves the pool was never opened before the pending check.
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${NO_DIR_MESSAGE}\n`);
    assert.equal(result.stderr, '');
  });

  it('migrations/ without .sql files: exit 0 despite the unreachable DATABASE_URL', () => {
    const { root, script } = makeStandaloneRoot();
    mkdirSync(join(root, 'migrations', 'auth'), { recursive: true });
    writeFileSync(join(root, 'migrations', 'README.md'), 'no schema here\n');

    const result = runMigrate(script, { env: childEnv(UNREACHABLE), cwd: root });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${NO_MIGRATIONS_MESSAGE}\n`);
    assert.equal(result.stderr, '');
  });

  it('a single pending .sql file does open the pool — and fails', () => {
    // The contrast that makes the two exit-0 cases above meaningful: with a
    // pending migration the unreachable URL is actually connected to.
    const { root, script } = makeStandaloneRoot();
    mkdirSync(join(root, 'migrations'));
    writeFileSync(join(root, 'migrations', '0001_init.sql'), 'select 1;\n');

    const result = runMigrate(script, { env: childEnv(UNREACHABLE), cwd: root });

    assert.equal(result.status, 1);
    assert.ok(result.stderr.startsWith('[migrate] failed:'), result.stderr);
    assert.ok(result.stderr.includes('ECONNREFUSED'), result.stderr);
  });
});

describe('static guards on scripts/migrate.mjs', () => {
  const source = readFileSync(SCRIPT, 'utf8');

  it('the DATABASE_URL skip (exit 0) precedes the main() call', () => {
    assert.ok(source.includes(SKIP_MESSAGE));
    const skipExit = source.indexOf('process.exit(0)');
    const mainCall = source.indexOf('main().catch');
    assert.notEqual(skipExit, -1);
    assert.notEqual(mainCall, -1);
    assert.ok(skipExit < mainCall);
  });

  it('the pending check gates the pool and there is no local basename logic', () => {
    const pendingCheck = source.indexOf('pendingMigrations(entries, [])');
    const pool = source.indexOf('new pg.Pool');
    assert.notEqual(pendingCheck, -1);
    assert.notEqual(pool, -1);
    assert.ok(pendingCheck < pool, 'the pool must be opened only after the pending check');
    // Basename bookkeeping belongs to ./migration-plan.mjs alone.
    assert.equal(source.includes(".split('/')"), false);
  });

  it('each migration runs inside BEGIN … INSERT INTO _migrations … COMMIT', () => {
    const begin = source.indexOf('"BEGIN"');
    const insert = source.indexOf('INSERT INTO _migrations');
    const commit = source.indexOf('"COMMIT"');
    const rollback = source.indexOf('ROLLBACK');
    assert.notEqual(begin, -1);
    assert.notEqual(insert, -1);
    assert.notEqual(commit, -1);
    assert.notEqual(rollback, -1);
    assert.ok(begin < insert);
    assert.ok(insert < commit);
    assert.ok(rollback > insert, 'ROLLBACK lives in the catch, after the bookkeeping write');
  });

  it('the error handler prints `[migrate] failed:` before exiting 1', () => {
    const failed = source.indexOf('[migrate] failed:');
    const exitOne = source.indexOf('process.exit(1)');
    assert.notEqual(failed, -1);
    assert.notEqual(exitOne, -1);
    assert.ok(failed < exitOne);
  });
});
