/**
 * Better Auth for LearnGraph (server-only) — same setup family as michi:
 * self-hosted at `/api/auth/*`, persisted in the app's Postgres (or the PGlite
 * dev fallback) through the shared Kysely instance, TanStack Start cookie
 * bridge last. Sign-in method: email + password.
 *
 * Env:
 *   BETTER_AUTH_SECRET  required in production (>= 32 random chars)
 *   BETTER_AUTH_URL     public base URL in production (e.g. https://learngraph.vercel.app)
 *
 * NEVER import this from client code. The client uses `./client`; server
 * functions get a verified user id via `./middleware`.
 */
import { betterAuth } from 'better-auth';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import { getDb } from '../db';

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Dev-only secret, stable across HMR re-evaluations of this module (sessions
 * would otherwise be invalidated mid-dev). Production refuses to start
 * without BETTER_AUTH_SECRET.
 */
const globalAuthRef = globalThis as typeof globalThis & { __learngraphDevAuthSecret__?: string };
function authSecret(): string {
  const configured = env('BETTER_AUTH_SECRET');
  if (configured) return configured;
  if (isProduction && env('DATABASE_URL')) {
    throw new Error('[auth] BETTER_AUTH_SECRET must be set in production.');
  }
  globalAuthRef.__learngraphDevAuthSecret__ ??= randomBytes(32).toString('hex');
  return globalAuthRef.__learngraphDevAuthSecret__;
}

const explicitBaseURL = env('BETTER_AUTH_URL');

const LOCAL_DEV_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://[::1]:8080',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
];

const baseURL = explicitBaseURL ?? {
  allowedHosts: ['localhost', '127.0.0.1', '[::1]', 'localhost:*', '127.0.0.1:*'],
  protocol: 'auto' as const,
  fallback: 'http://localhost:8080',
};

const extraOrigins = (env('BETTER_AUTH_TRUSTED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const trustedOrigins = [
  ...(explicitBaseURL ? [explicitBaseURL] : []),
  ...extraOrigins,
  ...(isProduction && explicitBaseURL ? [] : LOCAL_DEV_ORIGINS),
];

export const auth = betterAuth({
  appName: 'LearnGraph',
  baseURL,
  secret: authSecret(),
  database: { db: getDb() as unknown as Kysely<any>, type: 'postgres' },
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  // Bridges Better Auth's Set-Cookie into TanStack Start responses. Keep last.
  plugins: [tanstackStartCookies()],
});
