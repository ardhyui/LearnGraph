/**
 * Roadmap M4: the read-only public API handlers (`src/lib/api/v1.ts`) —
 * `GET /api/v1/learners` and `GET /api/v1/context` — driven as real handler
 * functions on the app's own `getDb()`. The test injects one PGlite through
 * the global the module memoizes (`__learngraphPglite__`), so keys, workspaces
 * and requests all share a single database exactly like the running server —
 * that is what makes the account-isolation checks meaningful. A small resolve
 * hook maps the handlers' Vite-style extensionless dynamic imports (`../db`)
 * to `.ts` for plain Node; node:test runs each file in its own process, so the
 * hook never leaks.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { sql, type Kysely } from 'kysely';
import { applyMigrations, pgliteMigratable } from '../src/lib/migrations.ts';
import { GRAPH_TABLES, type GraphDatabase } from '../src/lib/graph/store.ts';
import { apiContext, apiLearners } from '../src/lib/api/v1.ts';
import { createApiKey, revokeApiKey } from '../src/lib/api-keys.ts';

// The handlers run on the embedded-PGlite fallback, like CI (DATABASE_URL empty).
delete process.env.DATABASE_URL;

// Vite resolves `import('../db')` without an extension; plain Node does not.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch {
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

function migrationFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (name.endsWith('.sql')) files[name] = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
  }
  return files;
}

interface LearnersBody {
  error?: string;
  learners?: Array<{ id: string; name: string; example: boolean }>;
}
interface ContextBody {
  error?: string;
  learner?: string | null;
  concept?: string | null;
  queryType?: string;
  tokens?: number;
  context?: string;
}

const get = (path: string, authorization?: string): Request =>
  new Request(`http://localhost${path}`, authorization ? { headers: { authorization } } : {});
const contextUrl = (params: Record<string, string>): string =>
  `/api/v1/context?${new URLSearchParams(params)}`;
const body = async <T>(res: Response): Promise<T> => (await res.json().catch(() => ({}))) as T;

describe('API v1 handlers (read-only, account-scoped)', () => {
  let pg: PGlite;
  let db: Kysely<GraphDatabase>;
  // owner-a: Sari (named), me-noname (profile without a name), demo-alice.
  let keyA: string;
  // owner-b: Budi + "Galois theory" — the account A must never see.
  let keyB: string;
  // owner-empty: no learners yet; owner-demo-only: only a demo learner.
  let keyEmpty: string;
  let keyDemo: string;
  // A dedicated key so the 60-request probe never touches the other tests.
  let keyRate: string;

  before(async () => {
    pg = new PGlite(); // in-memory, like CI
    await pg.waitReady;
    await applyMigrations(pgliteMigratable(pg), migrationFiles());
    for (const owner of ['owner-a', 'owner-b', 'owner-empty', 'owner-demo-only']) {
      await pg.query(
        `insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, false)`,
        [owner, owner, `${owner}@example.test`],
      );
    }
    // Hand this PGlite to the app's own getDb() — the global it memoizes.
    const g = globalThis as typeof globalThis & { __learngraphPglite__?: Promise<PGlite> };
    g.__learngraphPglite__ = Promise.resolve(pg);
    const { getDb } = await import('../src/lib/db.ts');
    db = getDb();
    keyA = (await createApiKey(db, 'owner-a', 'Assistant A')).secret;
    keyB = (await createApiKey(db, 'owner-b', 'Assistant B')).secret;
    keyEmpty = (await createApiKey(db, 'owner-empty', 'Assistant C')).secret;
    keyDemo = (await createApiKey(db, 'owner-demo-only', 'Assistant D')).secret;
    keyRate = (await createApiKey(db, 'owner-a', 'Rate probe')).secret;

    // Seed through the same path the handlers use (graphForOwner → getDb()).
    const { graphForOwner } = await import('../src/lib/graph/server.ts');
    const a = await graphForOwner('owner-a');
    await a.setLearnerProfile('demo-alice', { name: 'Alice (example)' });
    await a.setLearnerProfile('me-sari', { name: 'Sari' });
    await a.setLearnerProfile('me-noname', {}); // a profile without a name
    await a.addConcept({
      conceptId: 'c-frac',
      name: 'Fractions',
      domain: 'math',
      description: 'Parts of a whole',
    });
    await a.addConcept({ conceptId: 'c-dec', name: 'Adding Decimals', domain: 'math', description: '' });
    await a.addEdge({ from: 'c-frac', to: 'c-dec', strength: 'required' });
    await a.setKnowledgeState('me-sari', 'c-frac', {
      mastery: 90,
      masterySource: 'quiz',
      reviewCount: 2,
    });
    const b = await graphForOwner('owner-b');
    await b.setLearnerProfile('me-budi', { name: 'Budi' });
    await b.addConcept({ conceptId: 'c-galois', name: 'Galois theory', domain: 'math', description: '' });
    await b.setKnowledgeState('me-budi', 'c-galois', { mastery: 95, masterySource: 'quiz' });
    const d = await graphForOwner('owner-demo-only');
    await d.setLearnerProfile('demo-zoe', { name: 'Zoe (example)' });
  });

  after(async () => {
    const g = globalThis as typeof globalThis & {
      __learngraphPglite__?: Promise<PGlite>;
      __learngraphKysely__?: unknown;
    };
    g.__learngraphPglite__ = undefined;
    g.__learngraphKysely__ = undefined;
    await db?.destroy();
    await pg?.close();
  });

  it('refuses requests without a usable Authorization header (both endpoints)', async () => {
    for (const res of [
      await apiLearners(get('/api/v1/learners')),
      await apiContext(get('/api/v1/context')),
    ]) {
      assert.equal(res.status, 401);
      assert.equal(res.headers.get('www-authenticate'), 'Bearer');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.ok((await body<{ error?: string }>(res)).error, 'the body explains the error');
    }
    // Not a Bearer header, and a Bearer key that does not exist: still no data.
    for (const authorization of ['Basic abc', `Bearer lg_${'0'.repeat(43)}`]) {
      const res = await apiLearners(get('/api/v1/learners', authorization));
      assert.equal(res.status, 401);
      assert.ok((await body<{ error?: string }>(res)).error);
    }
  });

  it('stops serving a key the moment it is revoked', async () => {
    const created = await createApiKey(db, 'owner-a', 'To revoke');
    const auth = `Bearer ${created.secret}`;
    assert.equal((await apiLearners(get('/api/v1/learners', auth))).status, 200);
    assert.equal(await revokeApiKey(db, 'owner-a', created.id), true);
    const after = await apiContext(get(contextUrl({ concept: 'Fractions' }), auth));
    assert.equal(after.status, 401);
  });

  it("never lets one account see another's learners or concepts", async () => {
    const mine = await body<LearnersBody>(await apiLearners(get('/api/v1/learners', `Bearer ${keyA}`)));
    assert.deepEqual(
      mine.learners?.map((l) => l.id),
      ['demo-alice', 'me-noname', 'me-sari'],
    );
    const theirs = await body<LearnersBody>(
      await apiLearners(get('/api/v1/learners', `Bearer ${keyB}`)),
    );
    assert.deepEqual(
      theirs.learners?.map((l) => l.id),
      ['me-budi'],
    );
    // B's learner and concept are simply unknown to A, and vice versa.
    assert.equal(
      (await apiContext(get(contextUrl({ learner: 'me-budi' }), `Bearer ${keyA}`))).status,
      404,
    );
    assert.equal(
      (await apiContext(get(contextUrl({ concept: 'Galois theory' }), `Bearer ${keyA}`))).status,
      404,
    );
    assert.equal(
      (await apiContext(get(contextUrl({ concept: 'Fractions' }), `Bearer ${keyB}`))).status,
      404,
    );
    // The brief itself stays scoped to the key's own account.
    const briefB = await body<ContextBody>(
      await apiContext(get(contextUrl({ concept: 'Galois theory' }), `Bearer ${keyB}`)),
    );
    assert.match(briefB.context ?? '', /Galois theory/);
    assert.ok(!JSON.stringify(briefB).includes('Fractions'), "A's concepts never leak into B's brief");
    const briefA = await body<ContextBody>(
      await apiContext(get(contextUrl({ learner: 'me-sari' }), `Bearer ${keyA}`)),
    );
    assert.ok(!JSON.stringify(briefA).includes('Budi') && !briefA.context?.includes('Galois'));
  });

  it('returns the documented learners shape (example flags, name fallback)', async () => {
    const res = await apiLearners(get('/api/v1/learners', `Bearer ${keyA}`));
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), {
      learners: [
        { id: 'demo-alice', name: 'Alice (example)', example: true },
        { id: 'me-noname', name: 'me-noname', example: false }, // no name → the id
        { id: 'me-sari', name: 'Sari', example: false },
      ],
    });
  });

  it('answers for the first own (non-example) learner by default', async () => {
    const res = await apiContext(get('/api/v1/context', `Bearer ${keyA}`));
    assert.equal(res.status, 200);
    const ctx = await body<ContextBody>(res);
    assert.equal(ctx.learner, 'me-noname'); // demo-alice sorts first, but is an example
    assert.equal(ctx.concept, null);
    assert.equal(ctx.queryType, 'general');
    assert.ok(typeof ctx.tokens === 'number' && (ctx.tokens ?? 0) > 0);
    assert.match(ctx.context ?? '', /^You are tutoring one learner/);
  });

  it('falls back to the example learner when it is the only one', async () => {
    const ctx = await body<ContextBody>(await apiContext(get('/api/v1/context', `Bearer ${keyDemo}`)));
    assert.equal(ctx.learner, 'demo-zoe');
  });

  it('explains when the account has no learners yet', async () => {
    const res = await apiContext(get('/api/v1/context', `Bearer ${keyEmpty}`));
    assert.equal(res.status, 404);
    assert.match((await body<ContextBody>(res)).error ?? '', /no learners/i);
  });

  it('accepts a concept by id or by name, whatever the case', async () => {
    for (const concept of ['c-frac', 'Fractions', 'FRACTIONS']) {
      const res = await apiContext(
        get(contextUrl({ learner: 'me-sari', concept }), `Bearer ${keyA}`),
      );
      assert.equal(res.status, 200, concept);
      const ctx = await body<ContextBody>(res);
      assert.equal(ctx.concept, 'c-frac');
      assert.match(ctx.context ?? '', /Topic: Fractions/);
      assert.match(ctx.context ?? '', /90% mastered/); // Sari's quiz result, in her own brief
    }
    // By name, with a prerequisite to build on.
    const res = await apiContext(get(contextUrl({ concept: 'adding decimals' }), `Bearer ${keyA}`));
    const ctx = await body<ContextBody>(res);
    assert.equal(ctx.concept, 'c-dec');
    assert.match(ctx.context ?? '', /Builds on: Fractions/);
  });

  it('says 404 for an unknown learner or concept', async () => {
    const noConcept = await apiContext(get(contextUrl({ concept: 'Quantum foam' }), `Bearer ${keyA}`));
    assert.equal(noConcept.status, 404);
    assert.match((await body<ContextBody>(noConcept)).error ?? '', /No concept "Quantum foam"/);
    const noLearner = await apiContext(get(contextUrl({ learner: 'ghost' }), `Bearer ${keyA}`));
    assert.equal(noLearner.status, 404);
    assert.match((await body<ContextBody>(noLearner)).error ?? '', /No learner "ghost"/);
  });

  it('rejects over-long learner and concept parameters at the documented limits', async () => {
    const auth = `Bearer ${keyA}`;
    assert.equal((await apiContext(get(contextUrl({ learner: 'x'.repeat(129) }), auth))).status, 400);
    assert.equal((await apiContext(get(contextUrl({ concept: 'y'.repeat(201) }), auth))).status, 400);
    // Exactly at the limit is still a valid request — it just finds nothing.
    assert.equal((await apiContext(get(contextUrl({ learner: 'x'.repeat(128) }), auth))).status, 404);
    assert.equal((await apiContext(get(contextUrl({ concept: 'y'.repeat(200) }), auth))).status, 404);
  });

  it('cuts q at 1000 characters', async () => {
    const auth = `Bearer ${keyA}`;
    const inside = await body<ContextBody>(
      await apiContext(get(contextUrl({ q: 'please explain fractions' }), auth)),
    );
    assert.equal(inside.queryType, 'explain');
    // "explain" past character 1000 is cut away, so it reads as a general question.
    const outside = await body<ContextBody>(
      await apiContext(get(contextUrl({ q: `${'z'.repeat(1000)} explain` }), auth)),
    );
    assert.equal(outside.queryType, 'general');
  });

  it('writes nothing to the graph tables', async () => {
    const counts = async (): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      for (const table of GRAPH_TABLES) {
        const r = await sql<{ n: number }>`select count(*)::int as n from ${sql.table(table)}`.execute(
          db,
        );
        out[table] = Number(r.rows[0]?.n ?? 0);
      }
      return out;
    };
    const before = await counts();
    await apiLearners(get('/api/v1/learners', `Bearer ${keyA}`));
    await apiContext(get('/api/v1/context', `Bearer ${keyA}`));
    await apiContext(
      get(contextUrl({ learner: 'me-sari', concept: 'Fractions', q: 'quiz me' }), `Bearer ${keyA}`),
    );
    await apiContext(get(contextUrl({ learner: 'ghost' }), `Bearer ${keyA}`));
    await apiContext(get(contextUrl({ concept: 'nope' }), `Bearer ${keyB}`));
    assert.deepEqual(await counts(), before);
  });

  it('allows 60 requests a minute per key, then answers 429', async () => {
    const auth = `Bearer ${keyRate}`;
    for (let i = 0; i < 60; i++) {
      assert.equal((await apiLearners(get('/api/v1/learners', auth))).status, 200);
    }
    const blocked = await apiLearners(get('/api/v1/learners', auth));
    assert.equal(blocked.status, 429);
    assert.match((await body<{ error?: string }>(blocked)).error ?? '', /minute/i);
    assert.equal(blocked.headers.get('cache-control'), 'no-store');
    // The limit is per key — and shared by both endpoints.
    assert.equal((await apiLearners(get('/api/v1/learners', `Bearer ${keyB}`))).status, 200);
    assert.equal((await apiContext(get('/api/v1/context', auth))).status, 429);
  });
});
