/**
 * Per-account sign-in rate limit (docs/ROADMAP.md backlog P1 #7): 20 attempts
 * / 15 minutes per email, stored in the existing `rateLimit` table under a
 * SHA-256 key, running alongside Better Auth's per-IP rules (those stay
 * unchanged — see auth-rate-limit.test.ts). The wrapped handler below is the
 * exact code path of `/api/auth/*`.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Kysely } from 'kysely';
import { betterAuth } from 'better-auth';
import { applyMigrations, pgliteMigratable } from '../src/lib/migrations.ts';
import { pgliteDialect } from '../src/lib/pglite-dialect.ts';
import { authRateLimit } from '../src/lib/auth/rate-limit.ts';
import {
  ACCOUNT_SIGN_IN_LIMIT,
  accountRateLimitKey,
  accountRetryAfterSeconds,
  accountSignInBlocked,
  checkAccountSignInLimit,
  normalizeAccountEmail,
  recordAccountSignInAttempt,
  withAccountSignInLimit,
} from '../src/lib/auth/account-rate-limit.ts';

const migrationsDir = path.join(import.meta.dirname, '..', 'migrations');
const files = Object.fromEntries(
  fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    .map((f) => [`/migrations/${f}`, fs.readFileSync(path.join(migrationsDir, f), 'utf8')]),
);

async function makeDb() {
  const pg = new PGlite();
  await pg.waitReady;
  await applyMigrations(pgliteMigratable(pg), files);
  const db = new Kysely<any>({ dialect: pgliteDialect(() => pg) });
  return { pg, db };
}

async function makeAuth() {
  const { pg, db } = await makeDb();
  const auth = betterAuth({
    baseURL: 'http://localhost:8080',
    secret: 'test-secret-test-secret-test-secret-1234',
    database: { db, type: 'postgres' },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    rateLimit: authRateLimit,
  });
  return { pg, db, auth };
}

/** POST/GET to /api/auth through the per-account gate + Better Auth. */
function handle(
  h: Awaited<ReturnType<typeof makeAuth>>,
  p: string,
  body: unknown,
  ip: string,
  method: 'GET' | 'POST' = 'POST',
) {
  return withAccountSignInLimit(
    h.db,
    (req) => h.auth.handler(req),
    new Request(`http://localhost:8080/api/auth${p}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, origin: 'http://localhost:8080' },
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const accountRows = (pg: PGlite) =>
  pg.query<{ key: string }>(`select "key" from "rateLimit" where "key" like 'account-sign-in:%'`);

describe('per-account sign-in rate limit', () => {
  const cleanups: Array<() => Promise<unknown>> = [];
  after(async () => { for (const c of cleanups) await c(); });

  it('normalizes emails: trim + lowercase; empty, broken, too long, non-strings are not counted', () => {
    assert.equal(normalizeAccountEmail('  User@Example.TEST  '), 'user@example.test');
    assert.equal(normalizeAccountEmail('MiXeD@School.edu'), 'mixed@school.edu');
    assert.equal(normalizeAccountEmail('a@b'), 'a@b');
    assert.equal(normalizeAccountEmail(''), null);
    assert.equal(normalizeAccountEmail('   '), null);
    assert.equal(normalizeAccountEmail(undefined), null);
    assert.equal(normalizeAccountEmail(null), null);
    assert.equal(normalizeAccountEmail(42), null);
    assert.equal(normalizeAccountEmail('no-at-sign.test'), null);
    assert.equal(normalizeAccountEmail('a b@c.test'), null);
    assert.equal(normalizeAccountEmail('a@b@c'), null);
    assert.equal(normalizeAccountEmail('@b.test'), null);
    assert.equal(normalizeAccountEmail('a@'), null);
    assert.equal(normalizeAccountEmail(`${'x'.repeat(ACCOUNT_SIGN_IN_LIMIT.maxEmailLength)}@a.test`), null);
  });

  it('derives a stable SHA-256 counter key and never embeds the email', () => {
    const key = accountRateLimitKey('user@example.test');
    assert.match(key, /^account-sign-in:[0-9a-f]{64}$/);
    assert.equal(key, accountRateLimitKey(normalizeAccountEmail('  User@Example.TEST ') as string));
    assert.notEqual(key, accountRateLimitKey('other@example.test'));
    assert.equal(key.includes('example.test'), false);
  });

  it('counts atomically with a fixed window: over the limit blocks, blocked tries do not extend the window', async () => {
    const { pg, db } = await makeDb();
    cleanups.push(() => db.destroy(), () => pg.close());
    const key = accountRateLimitKey('clock@example.test');
    const t0 = 1_700_000_000_000;
    for (let i = 1; i <= ACCOUNT_SIGN_IN_LIMIT.max; i++) {
      const counter = await recordAccountSignInAttempt(db, key, t0 + i * 1000);
      assert.equal(accountSignInBlocked(counter), false, `attempt ${i} must be allowed`);
      assert.equal(counter.windowStartedAt, t0 + 1000);
    }
    const blocked = await recordAccountSignInAttempt(db, key, t0 + 30_000);
    assert.equal(accountSignInBlocked(blocked), true);
    assert.equal(blocked.count, ACCOUNT_SIGN_IN_LIMIT.max + 1);
    assert.equal(blocked.windowStartedAt, t0 + 1000);
    assert.ok(accountRetryAfterSeconds(blocked, t0 + 30_000) > 0);
    // A blocked retry ten minutes in is still blocked, with less time to wait.
    const still = await recordAccountSignInAttempt(db, key, t0 + 600_000);
    assert.equal(accountSignInBlocked(still), true);
    assert.equal(still.windowStartedAt, t0 + 1000);
    assert.ok(accountRetryAfterSeconds(still, t0 + 600_000) < accountRetryAfterSeconds(blocked, t0 + 30_000));
    // Exactly one window after the anchor, the counter restarts.
    const fresh = await recordAccountSignInAttempt(db, key, t0 + 1000 + ACCOUNT_SIGN_IN_LIMIT.windowMs);
    assert.equal(accountSignInBlocked(fresh), false);
    assert.equal(fresh.count, 1);
    assert.equal(fresh.windowStartedAt, t0 + 1000 + ACCOUNT_SIGN_IN_LIMIT.windowMs);
  });

  it('blocks the 21st attempt even from a fresh IP, without calling Better Auth', async () => {
    const h = await makeAuth();
    cleanups.push(() => h.db.destroy(), () => h.pg.close());
    const email = 'victim@example.test';
    const password = 'correct-password-1';
    assert.equal(
      (await handle(h, '/sign-up/email', { name: 'Victim', email, password }, '192.0.2.1')).status,
      200,
    );
    // 20 wrong passwords, each from a different IP: the per-IP limit never
    // fires, so only the per-account counter can explain a block.
    for (let i = 0; i < ACCOUNT_SIGN_IN_LIMIT.max; i++) {
      const res = await handle(h, '/sign-in/email', { email, password: 'wrong-password' }, `198.51.${i}.2`);
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    // Even the CORRECT password is refused before Better Auth runs.
    const blocked = await handle(h, '/sign-in/email', { email, password }, '203.0.113.77');
    assert.equal(blocked.status, 429);
    const retryAfter = Number(blocked.headers.get('x-retry-after'));
    assert.ok(retryAfter > 0 && retryAfter <= ACCOUNT_SIGN_IN_LIMIT.windowMs / 1000, `x-retry-after ${retryAfter}`);
    assert.ok((await blocked.text()).includes('Too many attempts'));
    assert.equal(blocked.headers.get('set-cookie'), null); // no session was created
    // The stored key is a SHA-256 digest; the raw email is never persisted.
    const rows = await accountRows(h.pg);
    assert.equal(rows.rows.length, 1);
    assert.match(rows.rows[0].key, /^account-sign-in:[0-9a-f]{64}$/);
  });

  it('does not block a different email, even from the same IPs', async () => {
    const h = await makeAuth();
    cleanups.push(() => h.db.destroy(), () => h.pg.close());
    for (let i = 0; i <= ACCOUNT_SIGN_IN_LIMIT.max; i++) {
      await handle(h, '/sign-in/email', { email: 'first@example.test', password: 'wrong' }, `198.51.${i}.2`);
    }
    const other = await handle(h, '/sign-in/email', { email: 'second@example.test', password: 'wrong' }, '198.51.0.2');
    assert.equal(other.status, 401); // invalid credentials, not the account limit
    // Each email has its own independent counter.
    const rows = await h.pg.query<{ key: string; count: number }>(
      `select "key", "count" from "rateLimit" where "key" like 'account-sign-in:%'`,
    );
    assert.equal(rows.rows.length, 2);
    assert.deepEqual(
      rows.rows.map((r) => r.count).sort((a, b) => a - b),
      [1, ACCOUNT_SIGN_IN_LIMIT.max + 1],
    );
  });

  it('a successful sign-in clears the counter, so success never locks the account', async () => {
    const h = await makeAuth();
    cleanups.push(() => h.db.destroy(), () => h.pg.close());
    const email = 'ok@example.test';
    const password = 'correct-password-1';
    assert.equal(
      (await handle(h, '/sign-up/email', { name: 'Ok', email, password }, '192.0.2.9')).status,
      200,
    );
    for (let i = 0; i < ACCOUNT_SIGN_IN_LIMIT.max - 1; i++) {
      const res = await handle(h, '/sign-in/email', { email, password: 'wrong-password' }, `198.51.${i}.3`);
      assert.equal(res.status, 401);
    }
    const success = await handle(h, '/sign-in/email', { email, password }, '203.0.113.9');
    assert.equal(success.status, 200);
    // The success deleted the counter row (this attempt was counted first).
    assert.equal((await accountRows(h.pg)).rows.length, 0);
    // Without that reset this would be attempt #21 → 429.
    const after = await handle(h, '/sign-in/email', { email, password: 'wrong-password' }, '203.0.113.10');
    assert.equal(after.status, 401);
  });

  it('leaves other auth paths untouched: no per-account counting outside sign-in', async () => {
    const h = await makeAuth();
    cleanups.push(() => h.db.destroy(), () => h.pg.close());
    assert.equal(
      (await handle(h, '/sign-up/email', { name: 'U', email: 'u@example.test', password: 'password-1234' }, '192.0.2.5')).status,
      200,
    );
    assert.equal((await handle(h, '/get-session', undefined, '192.0.2.5', 'GET')).status, 200);
    // Broken JSON or a missing email has no countable account: pass through.
    assert.notEqual((await handle(h, '/sign-in/email', '{not json', '192.0.2.5')).status, 429);
    assert.notEqual((await handle(h, '/sign-in/email', { password: 'password-1234' }, '192.0.2.5')).status, 429);
    assert.equal((await accountRows(h.pg)).rows.length, 0);
  });

  it('degrades to the per-IP limit when the counter table is unavailable', async () => {
    const { pg, db } = await makeDb();
    cleanups.push(() => db.destroy(), () => pg.close());
    await pg.exec('drop table "rateLimit"');
    const request = new Request('http://localhost:8080/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'down@example.test', password: 'wrong-password' }),
    });
    const check = await checkAccountSignInLimit(db, request);
    assert.equal(check.blocked, false); // storage failure must not refuse or crash sign-in
  });
});

describe('per-account sign-in limit wiring (static)', () => {
  const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  it('routes /api/auth through the per-account gate', () => {
    const route = read('src/routes/api/auth/$.ts');
    assert.ok(route.includes('withAccountSignInLimit('));
  });

  it('reads the body from a clone, hashes the email, and never logs', () => {
    const mod = read('src/lib/auth/account-rate-limit.ts');
    assert.ok(mod.includes('request.clone()'));
    assert.ok(mod.includes("createHash('sha256')"));
    assert.ok(mod.includes('handler(request)')); // Better Auth gets the original request
    assert.equal(/console\./.test(mod), false);
  });
});
