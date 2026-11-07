import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/api/japanese-backup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { permitsLocalUser } = await import('@/lib/auth/local-access');
        if (!permitsLocalUser(request, process.env.JAPANESE_LOCAL_ORIGIN))
          return new Response('Forbidden', { status: 403 });
        const { dumpLocalJapaneseDatabase } = await import('@/lib/db');
        const data = await dumpLocalJapaneseDatabase();
        return new Response(new Uint8Array(data).buffer, {
          headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-store' },
        });
      },
    },
  },
});
