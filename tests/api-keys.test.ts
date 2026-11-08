/**
 * Roadmap M4: read-only API keys for external AI assistants. Only a hash is
 * stored, a key works for its own account only, revoking is immediate, and a
 * key can never be used to revoke or read another account's keys.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sql } from 'kysely';
import { openTestWorkspaces } from './support/graph-db.ts';
import {
  allowApiRequest,
  ApiKeyError,
  bearerKey,
  createApiKey,
  hashApiKey,
  listApiKeys,
  MAX_ACTIVE_KEYS,
  revokeApiKey,
  verifyApiKey,
} from '../src/lib/api-keys.ts';

const DIR = path.join(os.tmpdir(), `learngraph-api-keys-${process.pid}`);

describe('API keys', () => {
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it('reads the bearer key and limits requests per key', () => {
    assert.equal(bearerKey(new Request('http://x', { headers: { authorization: 'Bearer lg_abc' } })), 'lg_abc');
    assert.equal(bearerKey(new Request('http://x', { headers: { authorization: 'Basic abc' } })), null);
    assert.equal(bearerKey(new Request('http://x')), null);
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) assert.equal(allowApiRequest('k', t), true);
    assert.equal(allowApiRequest('k', t + 1), false);
    assert.equal(allowApiRequest('other', t + 1), true);
    assert.equal(allowApiRequest('k', t + 60_000), true);
  });

  it('stores only a hash, verifies its own account, and stops working once revoked', async () => {
    const ws = await openTestWorkspaces(DIR, ['owner-a', 'owner-b']);
    try {
      const key = await createApiKey(ws.db, 'owner-a', '  My   assistant ');
      assert.match(key.secret, /^lg_[A-Za-z0-9_-]{43}$/);
      assert.equal(key.name, 'My assistant');
      const stored = (await sql<{ key_hash: string }>`select key_hash from api_keys`.execute(ws.db)).rows;
      assert.deepEqual(stored, [{ key_hash: hashApiKey(key.secret) }]);
      const all = JSON.stringify(await listApiKeys(ws.db, 'owner-a'));
      assert.ok(!all.includes(key.secret) && !all.includes(hashApiKey(key.secret)), 'list leaks the key');

      assert.equal(await verifyApiKey(ws.db, key.secret), 'owner-a');
      assert.equal(await verifyApiKey(ws.db, `${key.secret.slice(0, -1)}x`), null);
      assert.equal(await verifyApiKey(ws.db, 'not-a-key'), null);
      assert.equal(await verifyApiKey(ws.db, null), null);
      assert.ok((await listApiKeys(ws.db, 'owner-a'))[0].lastUsedAt, 'use is recorded');

      // Another account can neither see nor revoke it.
      assert.deepEqual(await listApiKeys(ws.db, 'owner-b'), []);
      assert.equal(await revokeApiKey(ws.db, 'owner-b', key.id), false);
      assert.equal(await verifyApiKey(ws.db, key.secret), 'owner-a');

      assert.equal(await revokeApiKey(ws.db, 'owner-a', key.id), true);
      assert.equal(await verifyApiKey(ws.db, key.secret), null);
      assert.deepEqual(await listApiKeys(ws.db, 'owner-a'), []);

      await assert.rejects(createApiKey(ws.db, 'owner-a', '   '), ApiKeyError);
      for (let i = 0; i < MAX_ACTIVE_KEYS; i++) await createApiKey(ws.db, 'owner-b', `key ${i}`);
      await assert.rejects(createApiKey(ws.db, 'owner-b', 'one too many'), /at most/);

      // Keys go away with the account.
      await sql`delete from "user" where id = 'owner-b'`.execute(ws.db);
      assert.equal(Number((await sql<{ n: number }>`select count(*)::int as n from api_keys where owner_id = 'owner-b'`.execute(ws.db)).rows[0].n), 0);
    } finally {
      await ws.close();
    }
  });
});
