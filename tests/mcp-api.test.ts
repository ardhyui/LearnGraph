/**
 * Roadmap M4: the MCP endpoint (`src/lib/mcp/route.ts`) driven as a real
 * handler on the app's own `getDb()` — the same PGlite-injection pattern as
 * `tests/api-v1.test.ts`. Locks authentication, the JSON-RPC surface, the two
 * tools, and account isolation; protocol edge cases live in
 * `tests/mcp-protocol.test.ts`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { type Kysely } from 'kysely';
import { applyMigrations, pgliteMigratable } from '../src/lib/migrations.ts';
import type { GraphDatabase } from '../src/lib/graph/store.ts';
import { GRAPH_TABLES } from '../src/lib/graph/store.ts';
import { createApiKey, revokeApiKey } from '../src/lib/api-keys.ts';
import { handleMcpPost, mcpMethodNotAllowed } from '../src/lib/mcp/route.ts';

delete process.env.DATABASE_URL;

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

interface RpcBody {
  jsonrpc?: string;
  id?: unknown;
  result?: {
    protocolVersion?: string;
    serverInfo?: { name?: string };
    tools?: Array<{ name?: string }>;
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: {
      learners?: Array<{ id: string; name: string; example: boolean }>;
      learner?: string;
      concept?: string | null;
      queryType?: string;
      tokens?: number;
    };
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

const rpc = (message: unknown, key?: string): Request =>
  new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: typeof message === 'string' ? message : JSON.stringify(message),
  });

const body = async <T>(res: Response): Promise<T> => (await res.json().catch(() => ({}))) as T;

describe('MCP endpoint (read-only, account-scoped)', () => {
  let pg: PGlite;
  let db: Kysely<GraphDatabase>;
  let keyA: string;
  let keyB: string;

  before(async () => {
    pg = new PGlite();
    await pg.waitReady;
    await applyMigrations(pgliteMigratable(pg), migrationFiles());
    for (const owner of ['mcp-a', 'mcp-b']) {
      await pg.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, false)`, [
        owner,
        owner,
        `${owner}@example.test`,
      ]);
    }
    const g = globalThis as typeof globalThis & { __learngraphPglite__?: Promise<PGlite> };
    g.__learngraphPglite__ = Promise.resolve(pg);
    const { getDb } = await import('../src/lib/db.ts');
    db = getDb();
    keyA = (await createApiKey(db, 'mcp-a', 'MCP assistant A')).secret;
    keyB = (await createApiKey(db, 'mcp-b', 'MCP assistant B')).secret;

    const { graphForOwner } = await import('../src/lib/graph/server.ts');
    const a = await graphForOwner('mcp-a');
    await a.setLearnerProfile('demo-alice', { name: 'Alice (example)' });
    await a.setLearnerProfile('me-sari', { name: 'Sari' });
    await a.addConcept({ conceptId: 'c-frac', name: 'Fractions', domain: 'math', description: 'Parts of a whole' });
    await a.setKnowledgeState('me-sari', 'c-frac', { mastery: 90, masterySource: 'quiz' });

    const b = await graphForOwner('mcp-b');
    await b.setLearnerProfile('me-budi', { name: 'Budi' });
    await b.addConcept({ conceptId: 'c-galois', name: 'Galois theory', domain: 'math', description: '' });
    await b.setKnowledgeState('me-budi', 'c-galois', { mastery: 95, masterySource: 'quiz' });
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

  it('refuses a missing key, a malformed key and a malformed body', async () => {
    const anon = await handleMcpPost(
      rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    );
    assert.equal(anon.status, 401);
    assert.equal(anon.headers.get('www-authenticate'), 'Bearer');
    assert.equal(anon.headers.get('cache-control'), 'no-store');

    const bad = await handleMcpPost(rpc('{"jsonrpc":', keyA));
    assert.equal(bad.status, 200);
    const parsed = await body<RpcBody>(bad);
    assert.equal(parsed.error?.code, -32700);
    assert.equal(parsed.id, null);
    assert.equal(bad.headers.get('content-type'), 'application/json; charset=utf-8');
  });

  it('answers GET with 405 and Allow: POST (no SSE stream)', async () => {
    const res = mcpMethodNotAllowed();
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await body<RpcBody>(res)).error?.code, -32600);
  });

  it('initializes and lists both tools with a read-only key', async () => {
    const init = await handleMcpPost(
      rpc(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
        },
        keyA,
      ),
    );
    const initBody = await body<RpcBody>(init);
    assert.equal(init.status, 200);
    assert.equal(initBody.result?.protocolVersion, '2025-06-18');
    assert.equal(initBody.result?.serverInfo?.name, 'learngraph');

    const list = await body<RpcBody>(
      await handleMcpPost(rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, keyA)),
    );
    assert.deepEqual(
      list.result?.tools?.map((tool) => tool.name),
      ['list_learners', 'get_tutor_context'],
    );
  });

  it('lists only the key account’s learners, with the REST shape', async () => {
    const res = await body<RpcBody>(
      await handleMcpPost(
        rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_learners' } }, keyA),
      ),
    );
    assert.deepEqual(res.result?.structuredContent?.learners, [
      { id: 'demo-alice', name: 'Alice (example)', example: true },
      { id: 'me-sari', name: 'Sari', example: false },
    ]);
    assert.match(res.result?.content?.[0]?.text ?? '', /Sari — learner id: me-sari/);
    assert.ok(!JSON.stringify(res).includes('Budi'));
  });

  it('returns the tutor brief for the account’s own learner by default', async () => {
    const res = await body<RpcBody>(
      await handleMcpPost(
        rpc(
          {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: {
              name: 'get_tutor_context',
              arguments: { concept: 'Fractions', query: 'explain adding fractions' },
            },
          },
          keyA,
        ),
      ),
    );
    assert.equal(res.error, undefined);
    assert.match(res.result?.content?.[0]?.text ?? '', /^You are tutoring one learner/);
    assert.deepEqual(res.result?.structuredContent, {
      learner: 'me-sari',
      concept: 'c-frac',
      queryType: 'explain',
      tokens: res.result?.structuredContent?.tokens,
    });
    assert.ok((res.result?.structuredContent?.tokens ?? 0) > 0);
  });

  it('never lets one account read another’s learner or concept', async () => {
    const foreignLearner = await body<RpcBody>(
      await handleMcpPost(
        rpc(
          {
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: { name: 'get_tutor_context', arguments: { learner: 'me-budi' } },
          },
          keyA,
        ),
      ),
    );
    assert.equal(foreignLearner.result?.isError, true);
    assert.match(foreignLearner.result?.content?.[0]?.text ?? '', /No learner "me-budi"/);

    const foreignConcept = await body<RpcBody>(
      await handleMcpPost(
        rpc(
          {
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: 'get_tutor_context', arguments: { concept: 'Galois theory' } },
          },
          keyA,
        ),
      ),
    );
    assert.equal(foreignConcept.result?.isError, true);
    assert.match(foreignConcept.result?.content?.[0]?.text ?? '', /No concept "Galois theory"/);

    const briefB = await body<RpcBody>(
      await handleMcpPost(
        rpc(
          {
            jsonrpc: '2.0',
            id: 8,
            method: 'tools/call',
            params: { name: 'get_tutor_context', arguments: { concept: 'Galois theory' } },
          },
          keyB,
        ),
      ),
    );
    assert.match(briefB.result?.content?.[0]?.text ?? '', /Galois theory/);
    assert.ok(!JSON.stringify(briefB).includes('Fractions'));
  });

  it('rejects unknown tools and methods with protocol errors', async () => {
    const tool = await body<RpcBody>(
      await handleMcpPost(
        rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'delete_everything' } }, keyA),
      ),
    );
    assert.equal(tool.error?.code, -32602);
    const method = await body<RpcBody>(
      await handleMcpPost(rpc({ jsonrpc: '2.0', id: 10, method: 'resources/list' }, keyA)),
    );
    assert.equal(method.error?.code, -32601);
  });

  it('stops serving a key the moment it is revoked', async () => {
    const created = await createApiKey(db, 'mcp-a', 'MCP key to revoke');
    const auth = created.secret;
    assert.equal(
      (await handleMcpPost(rpc({ jsonrpc: '2.0', id: 11, method: 'ping' }, auth))).status,
      200,
    );
    assert.equal(await revokeApiKey(db, 'mcp-a', created.id), true);
    const after = await handleMcpPost(rpc({ jsonrpc: '2.0', id: 12, method: 'ping' }, auth));
    assert.equal(after.status, 401);
  });

  it('leaves the graph tables untouched after a round of reads', async () => {
    const count = async (table: string) =>
      Number((await pg.query<{ n: number }>(`select count(*)::int as n from "${table}"`)).rows[0].n);
    const before = await Promise.all(GRAPH_TABLES.map(count));
    await handleMcpPost(
      rpc({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_tutor_context', arguments: { concept: 'Fractions' } } }, keyA),
    );
    await handleMcpPost(
      rpc({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'list_learners' } }, keyA),
    );
    const after = await Promise.all(GRAPH_TABLES.map(count));
    assert.deepEqual(after, before);
  });
});
