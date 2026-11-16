import { createFileRoute } from '@tanstack/react-router';

/** POST /api/mcp — read-only Model Context Protocol server for AI assistants (see src/lib/mcp/). */
export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: async () => (await import('@/lib/mcp/route')).mcpMethodNotAllowed(),
      POST: async ({ request }) => (await import('@/lib/mcp/route')).handleMcpPost(request),
    },
  },
});
