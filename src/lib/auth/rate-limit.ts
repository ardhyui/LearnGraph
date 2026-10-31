/**
 * Brute-force protection for the auth endpoints (Better Auth's built-in rate
 * limiter). Counters live in the `rateLimit` table (migrations/0003) so the
 * limit is shared by every server instance in production. Keys are
 * client IP + path; Vercel sets `x-forwarded-for`.
 */
export const AUTH_RATE_LIMIT_RULES = {
  // Password guessing: 10 attempts per minute per IP (leaves room for a
  // classroom behind one NAT while still making brute force impractical).
  '/sign-in/email': { window: 60, max: 10 },
  // Account spam: 5 sign-ups per 10 minutes per IP.
  '/sign-up/email': { window: 600, max: 5 },
  // Called on every page load: not a brute-force target, and limiting it
  // would cost a DB write per request and could lock out shared networks.
  '/get-session': false,
} as const;

export const authRateLimit = {
  enabled: true,
  storage: 'database' as const,
  window: 60,
  max: 100,
  customRules: AUTH_RATE_LIMIT_RULES,
};

/** Friendly UI message for a rate-limited (HTTP 429) auth attempt. */
export function rateLimitMessage(retryAfterSeconds?: number | null): string {
  const wait =
    retryAfterSeconds && retryAfterSeconds > 0
      ? retryAfterSeconds >= 120
        ? `about ${Math.ceil(retryAfterSeconds / 60)} minutes`
        : `${retryAfterSeconds} seconds`
      : 'a minute';
  return `Too many attempts. For your security, please wait ${wait} and try again.`;
}
