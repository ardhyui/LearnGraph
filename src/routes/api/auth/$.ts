import { createFileRoute } from '@tanstack/react-router';

/** Better Auth endpoints (`/api/auth/*`): sign-up, sign-in, session, sign-out. */
async function handle({ request }: { request: Request }) {
  const [{ auth }, { getDb }, { withAccountSignInLimit }] = await Promise.all([
    import('@/lib/auth/server'),
    import('@/lib/db'),
    import('@/lib/auth/account-rate-limit'),
  ]);
  // Per-account sign-in limit (P1 #7) on top of Better Auth's per-IP rules.
  return withAccountSignInLimit(getDb(), (req) => auth.handler(req), request);
}

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handle, POST: handle } },
});
