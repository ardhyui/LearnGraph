/**
 * Auth brute-force protection: Better Auth's rate limiter with the app's
 * rules and Postgres (PGlite) storage, exactly as configured in production.
 */
import { describe, it, after } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Kysely } from 'kysely';
import { betterAuth } from 'better-auth';
import { applyMigrations, pgliteMigratable } from '../src/lib/migrations.ts';
import { pgliteDialect } from '../src/lib/pglite-dialect.ts';
import { authRateLimit, AUTH_RATE_LIMIT_RULES, rateLimitMessage } from '../src/lib/auth/rate-limit.ts';
import { expect } from './support/expect.ts';

const migrationsDir = path.join(import.meta.dirname, '..', 'migrations');
const files = Object.fromEntries(
  fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    .map((f) => [`/migrations/${f}`, fs.readFileSync(path.join(migrationsDir, f), 'utf8')]),
);

async function makeAuth() {
  const pg = new PGlite();
  await pg.waitReady;
  await applyMigrations(pgliteMigratable(pg), files);
  const db = new Kysely<any>({ dialect: pgliteDialect(() => pg) });
  const auth = betterAuth({
    baseURL: 'http://localhost:8080',
    secret: 'test-secret-test-secret-test-secret-1234',
    database: { db, type: 'postgres' },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    rateLimit: authRateLimit,
  });
  return { auth, pg, db };
}

const post = (auth: Awaited<ReturnType<typeof makeAuth>>['auth'], p: string, body: unknown, ip: string) =>
  auth.handler(new Request(`http://localhost:8080/api/auth${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, origin: 'http://localhost:8080' },
    body: JSON.stringify(body),
  }));

describe('Auth rate limiting', () => {
  const cleanups: Array<() => Promise<unknown>> = [];
  after(async () => { for (const c of cleanups) await c(); });

  it('blocks repeated sign-in attempts per IP with 429, stored in Postgres', async () => {
    const { auth, pg, db } = await makeAuth();
    cleanups.push(() => db.destroy(), () => pg.close());
    const max = (AUTH_RATE_LIMIT_RULES['/sign-in/email'] as { max: number }).max;
    const body = { email: 'nobody@example.test', password: 'wrong-password' };
    for (let i = 0; i < max; i++) {
      expect((await post(auth, '/sign-in/email', body, '203.0.113.7')).status).toBe(401);
    }
    const blocked = await post(auth, '/sign-in/email', body, '203.0.113.7');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('X-Retry-After')) > 0).toBe(true);
    // Another client is unaffected.
    expect((await post(auth, '/sign-in/email', body, '198.51.100.9')).status).toBe(401);
    const rows = await pg.query<{ count: number }>('select "count" from "rateLimit"');
    expect(rows.rows.length >= 2).toBe(true);
  });

  it('limits sign-ups per IP', async () => {
    const { auth, pg, db } = await makeAuth();
    cleanups.push(() => db.destroy(), () => pg.close());
    const max = (AUTH_RATE_LIMIT_RULES['/sign-up/email'] as { max: number }).max;
    for (let i = 0; i < max; i++) {
      const res = await post(auth, '/sign-up/email',
        { name: `u${i}`, email: `u${i}@example.test`, password: 'password-1234' }, '203.0.113.8');
      expect(res.status).toBe(200);
    }
    const res = await post(auth, '/sign-up/email',
      { name: 'x', email: 'x@example.test', password: 'password-1234' }, '203.0.113.8');
    expect(res.status).toBe(429);
  });

  it('has a friendly message', () => {
    expect(rateLimitMessage().includes('Too many attempts')).toBe(true);
    expect(rateLimitMessage(30).includes('30 seconds')).toBe(true);
    expect(rateLimitMessage(600).includes('10 minutes')).toBe(true);
  });
});
