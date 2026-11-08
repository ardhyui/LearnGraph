/**
 * Backup restore check (scripts/compare-databases.mjs, docs/BACKUP-RESTORE.md):
 * a restored copy must have every table and migration of its source, and no
 * table that has rows in the source may come back empty.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations, pgliteMigratable } from '../src/lib/migrations.ts';

const { compareSnapshots, snapshot } = await import('../scripts/compare-databases.mjs');

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');
const migrationFiles = () =>
  Object.fromEntries(
    readdirSync(MIGRATIONS_DIR)
      .filter((n) => n.endsWith('.sql'))
      .map((n) => [n, readFileSync(join(MIGRATIONS_DIR, n), 'utf8')]),
  );

describe('compareSnapshots', () => {
  it('fails on a missing table, a missing migration, or a table restored empty', () => {
    const source = { tables: { user: 2, learning_events: 5, _migrations: 2 }, migrations: ['0001_a', '0002_b'] };
    assert.deepEqual(compareSnapshots(source, source), { problems: [], notes: [] });

    const { problems } = compareSnapshots(source, {
      tables: { user: 0, _migrations: 1 },
      migrations: ['0001_a'],
    });
    assert.deepEqual(problems, [
      'table user is empty (source has 2 rows)',
      'table learning_events is missing',
      'migration 0002_b is missing',
    ]);
  });

  it('only notes counts that moved on since the backup, and extra tables', () => {
    const source = { tables: { user: 3, learning_events: 9 }, migrations: [] };
    const restored = { tables: { user: 2, learning_events: 9, leftover: 1 }, migrations: [] };
    assert.deepEqual(compareSnapshots(source, restored), {
      problems: [],
      notes: ['table user: 2 rows (source now 3)', 'table leftover exists only in the restored copy'],
    });
  });
});

describe('snapshot on a real database (PGlite)', () => {
  it('reads every table, its row count and the applied migrations', async () => {
    const source = new PGlite();
    const restored = new PGlite();
    try {
      const files = migrationFiles();
      await applyMigrations(pgliteMigratable(source), files);
      await applyMigrations(pgliteMigratable(restored), files);
      const insertUser = `insert into "user" (id, name, email, "emailVerified") values ('u1', 'Sari', 'sari@example.test', false)`;
      await source.query(insertUser);

      const query = (db: PGlite) => (text: string) => db.query<Record<string, unknown>>(text);
      const a = await snapshot(query(source));
      const b = await snapshot(query(restored));
      assert.equal(a.tables.user, 1);
      assert.ok('learning_events' in a.tables && '_migrations' in a.tables);
      assert.deepEqual([...a.migrations].sort(), Object.keys(files).sort());
      assert.deepEqual(compareSnapshots(a, b).problems, ['table user is empty (source has 1 rows)']);

      await restored.query(insertUser);
      assert.deepEqual(compareSnapshots(a, await snapshot(query(restored))), { problems: [], notes: [] });
    } finally {
      await source.close();
      await restored.close();
    }
  });
});
