/**
 * Direct unit tests for the shared migration bookkeeping helper
 * `scripts/migration-plan.mjs` (`migrationName`, `isMigrationFile` and
 * `pendingMigrations`).
 *
 * The helper is used by both appliers — `scripts/migrate.mjs` (deploy) and
 * `src/lib/migrations.ts` (the PGlite path) — so a change here can silently
 * change when a migration runs twice or not at all. Until now it was only
 * exercised indirectly through those appliers. The module is not changed by
 * this file: the tests import the `.mjs` directly, need no database and lock
 * the current basename-keyed contract (including its rough edges).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isMigrationFile,
  migrationName,
  pendingMigrations,
} from '../scripts/migration-plan.mjs';

const ROOT = join(import.meta.dirname, '..');
const PLAN_FILE = join(ROOT, 'scripts', 'migration-plan.mjs');
const DEPLOY_APPLIER = join(ROOT, 'scripts', 'migrate.mjs');
const PGLITE_APPLIER = join(ROOT, 'src', 'lib', 'migrations.ts');

describe('migrationName', () => {
  it('returns the POSIX basename of a migration path', () => {
    assert.equal(migrationName('migrations/0001_users.sql'), '0001_users.sql');
    assert.equal(migrationName('migrations/auth/0002_auth.sql'), '0002_auth.sql');
    assert.equal(migrationName('migrations/nested/deeper/0003_x.sql'), '0003_x.sql');
  });

  it('returns a name without a folder unchanged', () => {
    assert.equal(migrationName('0004_standalone.sql'), '0004_standalone.sql');
    assert.equal(migrationName('README.md'), 'README.md');
  });

  it('returns an empty string for empty paths (current `split/pop` behaviour)', () => {
    // `''.split('/')` is `['']`, so `pop()` is `''` — not `undefined`, which
    // means the `?? path` fallback never kicks in.
    assert.equal(migrationName(''), '');
    assert.equal(migrationName('migrations/'), '');
    assert.equal(migrationName('/'), '');
  });

  it('does not treat a backslash as a separator', () => {
    // Locked as current behaviour, not as a claim of Windows support: both
    // appliers join with POSIX paths and only copy files up one level.
    assert.equal(migrationName('migrations\\0003_x.sql'), 'migrations\\0003_x.sql');
  });
});

describe('isMigrationFile', () => {
  it('accepts only names ending in exactly `.sql`', () => {
    assert.equal(isMigrationFile('0001_users.sql'), true);
    assert.equal(isMigrationFile('migrations/auth/0002_auth.sql'), true);
    assert.equal(isMigrationFile('.sql'), true);
  });

  it('rejects other suffixes, case variants and directory entries', () => {
    assert.equal(isMigrationFile('0001_users.SQL'), false);
    assert.equal(isMigrationFile('0001_users.sql.bak'), false);
    assert.equal(isMigrationFile('0001_users.sqlite'), false);
    assert.equal(isMigrationFile('migrations/auth'), false);
    assert.equal(isMigrationFile('README.md'), false);
    assert.equal(isMigrationFile(''), false);
  });
});

describe('pendingMigrations', () => {
  it('returns an empty array for no input', () => {
    assert.deepEqual(pendingMigrations([], []), []);
    assert.deepEqual(pendingMigrations(new Set<string>(), new Set<string>()), []);
  });

  it('drops non-.sql entries and keeps the original path next to the basename name', () => {
    const result = pendingMigrations(
      [
        'migrations/auth',
        'migrations/README.md',
        'migrations/0002_b.sql',
        'migrations/auth/0001_auth.sql',
        'migrations/0003_c.SQL',
      ],
      [],
    );

    assert.deepEqual(result, [
      { name: '0001_auth.sql', path: 'migrations/auth/0001_auth.sql' },
      { name: '0002_b.sql', path: 'migrations/0002_b.sql' },
    ]);
  });

  it('sorts by basename rather than by input order', () => {
    const result = pendingMigrations(
      ['migrations/0003_c.sql', 'migrations/0001_a.sql', 'migrations/0002_b.sql'],
      [],
    );

    assert.deepEqual(
      result.map(({ name }) => name),
      ['0001_a.sql', '0002_b.sql', '0003_c.sql'],
    );
  });

  it('skips only names already applied and ignores foreign applied entries', () => {
    const paths = ['migrations/0001_a.sql', 'migrations/0002_b.sql'];
    assert.deepEqual(
      pendingMigrations(paths, ['9999_unknown.sql']).map(({ name }) => name),
      ['0001_a.sql', '0002_b.sql'],
    );
    assert.deepEqual(
      pendingMigrations(paths, ['0002_b.sql']).map(({ name }) => name),
      ['0001_a.sql'],
    );
  });

  it('keys membership by basename so a copied auth migration runs once', () => {
    // The auth schema is copied from `migrations/auth/` into `migrations/`;
    // a database that already applied `0001_auth.sql` must not run the copy.
    assert.deepEqual(
      pendingMigrations(['migrations/0001_auth.sql'], ['0001_auth.sql']),
      [],
    );
    // A path-shaped `applied` value does not match: only basenames are stored.
    assert.deepEqual(
      pendingMigrations(['migrations/0001_auth.sql'], ['auth/0001_auth.sql']),
      [{ name: '0001_auth.sql', path: 'migrations/0001_auth.sql' }],
    );
  });

  it('returns both entries when two paths share a basename (current behaviour)', () => {
    // Neither applier descends into subdirectories in practice, but the helper
    // does not deduplicate. Locked so a future dedupe is a deliberate change.
    assert.deepEqual(
      pendingMigrations(['migrations/0001_auth.sql', 'migrations/auth/0001_auth.sql'], []),
      [
        { name: '0001_auth.sql', path: 'migrations/0001_auth.sql' },
        { name: '0001_auth.sql', path: 'migrations/auth/0001_auth.sql' },
      ],
    );
  });

  it('accepts any iterable without consuming or mutating the input', () => {
    const paths = ['migrations/0002_b.sql', 'migrations/0001_a.sql'];
    const snapshot = [...paths];
    const applied = new Set(['0000_done.sql']);

    assert.deepEqual(
      pendingMigrations(paths, applied).map(({ name }) => name),
      ['0001_a.sql', '0002_b.sql'],
    );
    assert.deepEqual(paths, snapshot);
    assert.deepEqual([...applied], ['0000_done.sql']);

    function* generate(): Generator<string> {
      yield 'migrations/0002_b.sql';
      yield 'migrations/0001_a.sql';
    }
    assert.deepEqual(
      pendingMigrations(generate(), applied).map(({ name }) => name),
      ['0001_a.sql', '0002_b.sql'],
    );
  });

  it('applies the skip after sorting so the result order is deterministic', () => {
    const fromAppliedOrderA = pendingMigrations(
      ['migrations/0001_a.sql', 'migrations/0002_b.sql', 'migrations/0003_c.sql'],
      ['0002_b.sql'],
    );
    const fromAppliedOrderB = pendingMigrations(
      ['migrations/0003_c.sql', 'migrations/0002_b.sql', 'migrations/0001_a.sql'],
      ['0002_b.sql', '0002_b.sql', '0000_unknown.sql'],
    );

    assert.deepEqual(
      fromAppliedOrderA.map(({ name }) => name),
      ['0001_a.sql', '0003_c.sql'],
    );
    assert.deepEqual(fromAppliedOrderB, fromAppliedOrderA);
  });
});

describe('single source of truth', () => {
  it('both appliers import pendingMigrations from this module', () => {
    const deploy = readFileSync(DEPLOY_APPLIER, 'utf8');
    const pglite = readFileSync(PGLITE_APPLIER, 'utf8');

    assert.match(deploy, /import \{ pendingMigrations \} from ["']\.\/migration-plan\.mjs["'];/);
    assert.match(
      pglite,
      /import \{ pendingMigrations \} from ["']\.\.\/\.\.\/scripts\/migration-plan\.mjs["'];/,
    );
  });

  it('neither applier keeps its own basename logic', () => {
    for (const file of [DEPLOY_APPLIER, PGLITE_APPLIER]) {
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes(".split('/').pop()"), false, file);
    }
  });

  it('the helper stays dependency-free so either runtime can import it', () => {
    const source = readFileSync(PLAN_FILE, 'utf8');
    assert.equal(/^\s*import\s/m.test(source), false);
  });
});
