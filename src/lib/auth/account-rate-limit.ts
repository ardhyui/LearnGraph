/**
 * Per-account sign-in rate limit (docs/ROADMAP.md backlog P1 #7).
 *
 * Better Auth's limiter (./rate-limit.ts) counts per IP: a whole school
 * behind one NAT shares the sign-in budget, while an attacker trying many
 * accounts from one IP gets a fresh budget for each account. This gate adds a
 * per-email counter for POST /sign-in/email — 20 attempts / 15 minutes —
 * running alongside the per-IP rules, which keep applying exactly as before.
 *
 * Counters live in the existing `rateLimit` table (migrations/0003) under
 * `account-sign-in:<sha256(email)>`, so the raw email is never persisted. Each
 * attempt is one atomic INSERT … ON CONFLICT … DO UPDATE … RETURNING, so the
 * count stays correct across serverless instances. A successful sign-in
 * deletes the counter — a legitimate user is never kept out by succeeding —
 * while failures (401) keep counting. Any error while reading or writing the
 * counter degrades to the per-IP limit only: sign-in itself must not fail,
 * and this module never logs (so the email can never leak into logs).
 */
import { createHash, randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
// `.ts` extension: this module is imported directly by the node:test suite,
// which (unlike Vite) needs the real file name to resolve.
import { rateLimitMessage } from './rate-limit.ts';

type AnyDb = Kysely<any>;

export const ACCOUNT_SIGN_IN_LIMIT = {
  /** Counting window, fixed from the first counted attempt of a burst. */
  windowMs: 15 * 60 * 1000,
  /** Attempts allowed per email per window. */
  max: 20,
  /** Longest email worth a counter (RFC 5321 caps an address at 254 chars). */
  maxEmailLength: 254,
} as const;

/** Cheap "email-like" check: non-empty local part and domain, no whitespace. */
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+$/;

/**
 * Normalize a sign-in email for counting — trim + lowercase — or null when the
 * value is not worth a counter (not a string, empty, not email-like, or too
 * long). Better Auth still validates the real credential either way.
 */
export function normalizeAccountEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length < 3 || email.length > ACCOUNT_SIGN_IN_LIMIT.maxEmailLength) return null;
  return EMAIL_LIKE.test(email) ? email : null;
}

/** Counter key: namespaced SHA-256 of the normalized email, never the raw email. */
export function accountRateLimitKey(email: string): string {
  return `account-sign-in:${createHash('sha256').update(email).digest('hex')}`;
}

/** Counter state after recording an attempt. */
export interface AccountSignInCounter {
  count: number;
  /** Unix ms when the current counting window opened. */
  windowStartedAt: number;
}

// `count` is a Postgres integer; cap the increment so a flood of blocked
// attempts can never overflow it (the window reset bounds real counts).
const MAX_INT32 = 2147483647;

/**
 * Record one attempt and report the counter after it — a single upsert, so
 * parallel instances can neither lose counts nor double-insert. `lastRequest`
 * stores the window anchor: attempts inside the window keep counting but never
 * push the anchor forward, so the block always lifts `windowMs` after the
 * first counted attempt, even while the blocked client keeps trying.
 */
export async function recordAccountSignInAttempt(
  db: AnyDb,
  key: string,
  now: number = Date.now(),
): Promise<AccountSignInCounter> {
  const { windowMs } = ACCOUNT_SIGN_IN_LIMIT;
  const result = await sql<{ count: number; lastRequest: string | number | bigint }>`
    insert into "rateLimit" ("id", "key", "count", "lastRequest")
    values (${randomUUID()}, ${key}, 1, ${now}::bigint)
    on conflict ("key") do update set
      "count" = case
        when ${now}::bigint - "rateLimit"."lastRequest" >= ${windowMs}::bigint then 1
        else least("rateLimit"."count" + 1, ${MAX_INT32})
      end,
      "lastRequest" = case
        when ${now}::bigint - "rateLimit"."lastRequest" >= ${windowMs}::bigint then ${now}::bigint
        else "rateLimit"."lastRequest"
      end
    returning "count", "lastRequest"
  `.execute(db);
  const row = result.rows[0];
  return { count: Number(row.count), windowStartedAt: Number(row.lastRequest) };
}

/** True when the counter has passed the per-account allowance. */
export function accountSignInBlocked(counter: AccountSignInCounter): boolean {
  return counter.count > ACCOUNT_SIGN_IN_LIMIT.max;
}

/** Whole seconds until the window ages out (≥ 1 for a blocked counter). */
export function accountRetryAfterSeconds(
  counter: AccountSignInCounter,
  now: number = Date.now(),
): number {
  const remainingMs = counter.windowStartedAt + ACCOUNT_SIGN_IN_LIMIT.windowMs - now;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

/** Forget the counter after a successful sign-in. */
export async function clearAccountSignInAttempts(db: AnyDb, key: string): Promise<void> {
  await sql`delete from "rateLimit" where "key" = ${key}`.execute(db);
}

type SignInCheck = { blocked: true; response: Response } | { blocked: false; key: string | null };

function isEmailSignIn(request: Request): boolean {
  return request.method === 'POST' && new URL(request.url).pathname.endsWith('/sign-in/email');
}

/**
 * Pre-check one auth request against the per-account sign-in limit. The body is
 * read from a clone, leaving the original request intact for Better Auth.
 * Blocked requests get a 429 with the same friendly message the per-IP limit
 * uses, plus `x-retry-after`. Any storage error degrades to "not blocked".
 */
export async function checkAccountSignInLimit(db: AnyDb, request: Request): Promise<SignInCheck> {
  if (!isEmailSignIn(request)) return { blocked: false, key: null };
  try {
    const body: unknown = await request.clone().json().catch(() => null);
    const email =
      body && typeof body === 'object'
        ? normalizeAccountEmail((body as { email?: unknown }).email)
        : null;
    if (!email) return { blocked: false, key: null };
    const key = accountRateLimitKey(email);
    const counter = await recordAccountSignInAttempt(db, key);
    if (accountSignInBlocked(counter)) {
      const retryAfter = accountRetryAfterSeconds(counter);
      return {
        blocked: true,
        response: new Response(JSON.stringify({ message: rateLimitMessage(retryAfter) }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'x-retry-after': String(retryAfter) },
        }),
      };
    }
    return { blocked: false, key };
  } catch {
    // Counter storage failed: fall back to the per-IP limit only. Never log —
    // a log line here could carry the email.
    return { blocked: false, key: null };
  }
}

/**
 * Wrap Better Auth's handler with the per-account gate — the exact code path
 * of `/api/auth/*`: refuse before Better Auth runs (no session can be created),
 * and clear the counter after a successful sign-in. Clearing must never break
 * an already-successful response.
 */
export async function withAccountSignInLimit(
  db: AnyDb,
  handler: (request: Request) => Response | Promise<Response>,
  request: Request,
): Promise<Response> {
  const check = await checkAccountSignInLimit(db, request);
  if (check.blocked) return check.response;
  const response = await handler(request);
  if (check.key && response.ok) await clearAccountSignInAttempts(db, check.key).catch(() => undefined);
  return response;
}
