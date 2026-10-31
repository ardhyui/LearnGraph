import { createFileRoute } from '@tanstack/react-router';

/** Better Auth endpoints (`/api/auth/*`): sign-up, sign-in, session, sign-out. */
async function handle({ request }: { request: Request }) {
  const { auth } = await import('@/lib/auth/server');
  return auth.handler(request);
}

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handle, POST: handle } },
});
