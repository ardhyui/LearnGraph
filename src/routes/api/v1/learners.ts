import { createFileRoute } from '@tanstack/react-router';

/** GET /api/v1/learners — the account's learners (see src/lib/api/v1.ts). */
export const Route = createFileRoute('/api/v1/learners')({
  server: {
    handlers: {
      GET: async ({ request }) => (await import('@/lib/api/v1')).apiLearners(request),
    },
  },
});
