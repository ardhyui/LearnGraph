/**
 * Server-only database access (Kysely).
 *
 * - `DATABASE_URL` set (production / Vercel, or a local Postgres): real
 *   Postgres through node-postgres (`pg`). Schema is applied by
 *   `npm run db:migrate` (run automatically by `npm run build`).
 * - `DATABASE_URL` unset (local dev): embedded **PGlite** (Postgres compiled
 *   to WASM). `migrations/*.sql` are applied automatically on startup.
 *   In-memory by default; set `PGLITE_DATA_DIR=.data/pglite` to keep data
 *   across restarts.
 *
 * The same Kysely instance backs both Better Auth and the LearnGraph tables,
 * so the dev fallback behaves exactly like production.
 */
import { Kysely, PostgresDialect } from 'kysely';
import type { PGlite } from '@electric-sql/pglite';
import { applyMigrations, pgliteMigratable } from './migrations.ts';
import { pgliteDialect } from './pglite-dialect.ts';
import type { GraphDatabase } from './graph/store.ts';

export type DbSource = 'postgres' | 'pglite';

const env = (key: string): string | undefined => {
  const value = typeof process !== 'undefined' ? process.env[key]?.trim() : undefined;
  return value ? value : undefined;
};

const databaseUrl = env('DATABASE_URL');

/** Active backend: Postgres when `DATABASE_URL` is set, otherwise PGlite. */
export const dbSource: DbSource = databaseUrl ? 'postgres' : 'pglite';

// Init state lives on globalThis: dev HMR re-evaluates this module, and two
// instances must never open a second pool or race two migration passes.
const globalRef = globalThis as typeof globalThis & {
  __learngraphKysely__?: Kysely<GraphDatabase>;
  __learngraphPglite__?: Promise<PGlite>;
  __learngraphPgPool__?: import('pg').Pool;
};

function migrationFiles(): Record<string, string> {
  // Inlined by Vite at build time (no runtime fs needed on serverless).
  return import.meta.glob('/migrations/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
}

function getPglite(): Promise<PGlite> {
  globalRef.__learngraphPglite__ ??= (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const dataDir = env('PGLITE_DATA_DIR');
    const pg = new PGlite(dataDir);
    await pg.waitReady;
    await applyMigrations(pgliteMigratable(pg), migrationFiles());
    return pg;
  })().catch((err) => {
    globalRef.__learngraphPglite__ = undefined;
    throw err;
  });
  return globalRef.__learngraphPglite__;
}

function getPgPool(): import('pg').Pool {
  if (!globalRef.__learngraphPgPool__) {
    throw new Error('Postgres pool not initialised');
  }
  return globalRef.__learngraphPgPool__;
}

async function createPgPool(): Promise<void> {
  if (globalRef.__learngraphPgPool__) return;
  const pg = await import('pg');
  const max = Number(env('DATABASE_POOL_MAX') ?? '') || undefined;
  globalRef.__learngraphPgPool__ = new pg.default.Pool({ connectionString: databaseUrl, max });
}

/**
 * The shared server-only Kysely instance. Typed for the LearnGraph tables;
 * Better Auth talks to the same database through its own adapter.
 */
export function getDb(): Kysely<GraphDatabase> {
  if (typeof window !== 'undefined') {
    throw new Error('@/lib/db is server-only — use it from a server function.');
  }
  globalRef.__learngraphKysely__ ??=
    dbSource === 'postgres'
      ? new Kysely<GraphDatabase>({
          dialect: new PostgresDialect({
            pool: async () => {
              await createPgPool();
              return getPgPool();
            },
          }),
        })
      : new Kysely<GraphDatabase>({ dialect: pgliteDialect(() => getPglite()) });
  return globalRef.__learngraphKysely__;
}

/**
 * Finish DB bootstrap before serving traffic. PGlite: open + migrate.
 * Postgres: no-op (migrations run at deploy time via `npm run db:migrate`).
 */
export async function ensureDbReady(): Promise<void> {
  if (dbSource === 'pglite') await getPglite();
}

if (typeof window === 'undefined' && dbSource === 'pglite') {
  void ensureDbReady().catch((err) => console.error('[db] PGlite bootstrap failed:', err));
}
