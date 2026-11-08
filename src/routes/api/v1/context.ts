import { createFileRoute } from '@tanstack/react-router';

/** GET /api/v1/context — the tutor brief for an AI assistant (see src/lib/api/v1.ts). */
export const Route = createFileRoute('/api/v1/context')({
  server: {
    handlers: {
      GET: async ({ request }) => (await import('@/lib/api/v1')).apiContext(request),
    },
  },
});
