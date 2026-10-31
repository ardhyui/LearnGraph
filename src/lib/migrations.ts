/**
 * Apply `migrations/*.sql` to a database that exposes `exec` + `query` and a
 * transaction helper — shared by the PGlite fallback (`src/lib/db.ts`) and the
 * tests. Deploys use `scripts/migrate.mjs` (same `_migrations` bookkeeping).
 */
import type { PGlite } from '@electric-sql/pglite';
import { pendingMigrations } from '../../scripts/migration-plan.mjs';

export interface MigratableDb {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: MigratableDb) => Promise<T>): Promise<T>;
}

/** @param files map of migration path -> SQL text */
export async function applyMigrations(db: MigratableDb, files: Record<string, string>): Promise<void> {
  await db.exec(
    'create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const done = (await db.query<{ name: string }>('select name from _migrations')).rows.map(
    (r) => r.name,
  );
  for (const { name, path } of pendingMigrations(Object.keys(files), done) as Array<{
    name: string;
    path: string;
  }>) {
    await db.transaction(async (tx) => {
      await tx.exec(files[path]);
      await tx.query('insert into _migrations (name) values ($1)', [name]);
    });
  }
}

/** Adapt a PGlite instance to `MigratableDb`. */
export function pgliteMigratable(pg: PGlite): MigratableDb {
  const wrap = (c: Pick<PGlite, 'exec' | 'query'>): MigratableDb => ({
    exec: (text) => c.exec(text),
    query: async <T>(text: string, params?: unknown[]) => ({
      rows: (await c.query<T>(text, params)).rows,
    }),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
  });
  return wrap(pg);
}
