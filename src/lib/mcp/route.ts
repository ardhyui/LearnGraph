/**
 * `POST /api/mcp` (Roadmap M4): the read-only Model Context Protocol server,
 * authenticated with the same `Authorization: Bearer lg_…` key as the REST
 * API and scoped to that key's account. Streamable HTTP is answered as plain
 * JSON (no SSE); `GET` is a 405 with `Allow: POST`. Server-only.
 */
import { authenticateApiRequest } from '../api/v1.ts';
import { handleMcpMessage } from './protocol.ts';
import { mcpToolHandlersFor } from './tools.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function mcpMethodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Use POST with JSON-RPC 2.0; this endpoint has no SSE stream.' },
    }),
    { status: 405, headers: { ...JSON_HEADERS, allow: 'POST' } },
  );
}

export async function handleMcpPost(request: Request): Promise<Response> {
  try {
    const auth = await authenticateApiRequest(request);
    if (auth instanceof Response) return auth;
    const raw = await request.text();
    const out = await handleMcpMessage(raw, mcpToolHandlersFor(auth.owner));
    if (out.body === undefined) return new Response(null, { status: out.status });
    return new Response(JSON.stringify(out.body), { status: out.status, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[api/mcp]', err);
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Something went wrong on our side.' },
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }
}
