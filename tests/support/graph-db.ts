/**
 * Test helper: an EducationGraphDB on a real (embedded) Postgres — PGlite with
 * an on-disk data directory, so "close and reopen" really exercises
 * persistence. Uses the same migrations/ files and Kysely dialect as the app.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Kysely } from 'kysely';
import { EducationGraphDB } from '../../src/lib/graph/education-graph-db.ts';
import { PostgresGraphStore, type GraphDatabase } from '../../src/lib/graph/store.ts';
import { applyMigrations, pgliteMigratable } from '../../src/lib/migrations.ts';
import { pgliteDialect } from '../../src/lib/pglite-dialect.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'migrations');

export const TEST_OWNER_ID = 'test-owner';

function migrationFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (name.endsWith('.sql')) files[name] = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
  }
  return files;
}

/** Open (or reopen) the test database at `dataDir`; `close()` shuts it all down. */
export async function openTestGraphDB(
  dataDir: string,
  ownerId: string = TEST_OWNER_ID,
): Promise<EducationGraphDB> {
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  await applyMigrations(pgliteMigratable(pg), migrationFiles());
  // Workspace owner = a Better Auth user row (owner_id has a FK to "user").
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, false)
     on conflict (id) do nothing`,
    [ownerId, 'Test Owner', `${ownerId}@example.test`],
  );
  const db = new Kysely<GraphDatabase>({ dialect: pgliteDialect(() => pg) });
  const store = new PostgresGraphStore(db, ownerId, {
    onClose: async () => {
      await db.destroy();
      await pg.close();
    },
  });
  // Warm up PGlite's query paths (first statement per table pays a one-off
  // planning/WASM cost, like opening a LevelDB) so the latency tests measure
  // steady-state reads/writes. Scratch keys are removed again.
  for (const key of ['learner:__warmup__', 'concept:__warmup__', 'index:domain:__warmup__:x']) {
    await store.put(key, { warmup: true });
    await store.get(key);
    await store.del(key);
  }
  const graph = new EducationGraphDB(store);
  await graph.open();
  return graph;
}
