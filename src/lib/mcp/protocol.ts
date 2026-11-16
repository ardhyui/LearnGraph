/**
 * Minimal read-only Model Context Protocol server (Roadmap M4), pure and
 * transport-free: JSON-RPC 2.0 messages in, an HTTP status + JSON body out.
 * The route (`src/lib/mcp/route.ts`) owns auth and HTTP; the tool handlers
 * (`src/lib/mcp/tools.ts`) own the graph. No dependencies, no database.
 *
 * Supported: `initialize`, `ping`, `tools/list`, `tools/call`,
 * `resources/list`, `resources/read`, and notifications (202, no body).
 * Streamable HTTP is answered as plain `application/json`; there is no SSE
 * stream. JSON-RPC batches are rejected because this server has nothing to
 * batch (and clients can fall back).
 */

export const SERVER_NAME = 'learngraph';
export const SERVER_VERSION = '0.2.0';

/** Newest first. An unknown requested version falls back to the newest. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26'] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export interface McpToolResult {
  /** Plain text the assistant sees as the tool's answer. */
  text: string;
  /** Optional machine-readable copy (clients that understand it use this). */
  structuredContent?: unknown;
}

export interface McpToolHandlers {
  list_learners: () => Promise<McpToolResult>;
  get_tutor_context: (args: {
    learner?: string;
    concept?: string;
    query?: string;
  }) => Promise<McpToolResult>;
}

/** One read-only document advertised by `resources/list`. */
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType: 'text/markdown';
}

/** One document body returned by `resources/read`. */
export interface McpResourceContent {
  uri: string;
  mimeType: 'text/markdown';
  text: string;
}

/** Everything the transport needs: the two tools plus the resource surface. */
export interface McpHandlers extends McpToolHandlers {
  list_resources: () => Promise<McpResource[]>;
  /** `null` for a URI this account does not own (mapped to JSON-RPC -32002). */
  read_resource: (uri: string) => Promise<McpResourceContent | null>;
}

/** Longest URI `resources/read` accepts before it is invalid params. */
export const MAX_RESOURCE_URI_LENGTH = 512;

export interface McpHttpResponse {
  status: number;
  /** `undefined` means an empty body (notifications). */
  body?: unknown;
}

export const MCP_TOOLS = [
  {
    name: 'list_learners',
    description: 'List the learners in the account this API key belongs to. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_tutor_context',
    description:
      'Get a short tutor brief (at most 2000 tokens) about one learner: what they know, ' +
      'misconceptions, due reviews, and what to teach next. Read-only and free of raw scores.',
    inputSchema: {
      type: 'object',
      properties: {
        learner: {
          type: 'string',
          maxLength: 128,
          description: "Learner id from list_learners. Defaults to the account's own learner.",
        },
        concept: {
          type: 'string',
          maxLength: 200,
          description: 'Concept id or name to focus the brief on, e.g. "Fractions".',
        },
        query: {
          type: 'string',
          maxLength: 1000,
          description:
            'What the learner asked, so the brief can pick explain/practice/stuck/review/next/general.',
        },
      },
      additionalProperties: false,
    },
  },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const response = (id: unknown, result: unknown): McpHttpResponse => ({
  status: 200,
  body: { jsonrpc: '2.0', id, result },
});

const errorResponse = (id: unknown, code: number, message: string): McpHttpResponse => ({
  status: 200,
  body: { jsonrpc: '2.0', id, error: { code, message } },
});

/** The requested protocol version when supported, else the newest this server speaks. */
export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === 'string' &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

type ParsedArgs =
  | { ok: true; args: { learner?: string; concept?: string; query?: string } }
  | { ok: false; message: string };

/** Validate `tools/call` arguments against the tool's schema, without a library. */
export function parseToolArguments(name: string, raw: unknown): ParsedArgs {
  if (raw === undefined || raw === null) return { ok: true, args: {} };
  if (!isRecord(raw)) return { ok: false, message: 'Tool arguments must be an object.' };
  if (name === 'list_learners') return { ok: true, args: {} };
  const limits = { learner: 128, concept: 200, query: 1000 } as const;
  const args: { learner?: string; concept?: string; query?: string } = {};
  for (const key of ['learner', 'concept', 'query'] as const) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return { ok: false, message: `"${key}" must be a string.` };
    if (value.length > limits[key]) {
      return { ok: false, message: `"${key}" is longer than ${limits[key]} characters.` };
    }
    args[key] = value;
  }
  return { ok: true, args };
}

const toolContent = (result: McpToolResult) => ({
  content: [{ type: 'text', text: result.text }],
  ...(result.structuredContent === undefined
    ? {}
    : { structuredContent: result.structuredContent }),
});

type ParsedResourceRead = { ok: true; uri: string } | { ok: false; message: string };

/** Validate `resources/read` params: exactly one non-empty URI, at most 512 characters. */
export function parseResourceReadParams(raw: unknown): ParsedResourceRead {
  if (!isRecord(raw)) return { ok: false, message: 'expected an object.' };
  const uri = raw.uri;
  if (typeof uri !== 'string' || !uri) {
    return { ok: false, message: '"uri" must be a non-empty string.' };
  }
  if (uri.length > MAX_RESOURCE_URI_LENGTH) {
    return { ok: false, message: `"uri" is longer than ${MAX_RESOURCE_URI_LENGTH} characters.` };
  }
  return { ok: true, uri };
}

async function readResource(
  id: unknown,
  params: unknown,
  handlers: McpHandlers,
): Promise<McpHttpResponse> {
  const parsed = parseResourceReadParams(params);
  if (!parsed.ok) return errorResponse(id, -32602, `Invalid params: ${parsed.message}`);
  const content = await handlers.read_resource(parsed.uri);
  // A URI for another account and a URI that never existed look the same on
  // purpose: neither confirms what the account does not own.
  if (!content) return errorResponse(id, -32002, `Resource not found: ${parsed.uri}`);
  return response(id, { contents: [content] });
}

async function callTool(
  id: unknown,
  params: unknown,
  handlers: McpToolHandlers,
): Promise<McpHttpResponse> {
  if (!isRecord(params)) return errorResponse(id, -32602, 'Invalid params: expected an object.');
  const name = params.name;
  if (typeof name !== 'string' || !name) {
    return errorResponse(id, -32602, 'Invalid params: "name" must be a tool name.');
  }
  if (name !== 'list_learners' && name !== 'get_tutor_context') {
    return errorResponse(id, -32602, `Unknown tool: ${name}`);
  }
  const parsed = parseToolArguments(name, params.arguments);
  if (!parsed.ok) return errorResponse(id, -32602, `Invalid params: ${parsed.message}`);
  try {
    const result =
      name === 'list_learners'
        ? await handlers.list_learners()
        : await handlers.get_tutor_context(parsed.args);
    return response(id, toolContent(result));
  } catch (err) {
    // A fixable request (no such learner/concept) is a tool error, not a
    // protocol error, so assistants can show it and try another argument.
    const message = err instanceof Error && err.message ? err.message : 'The tool failed.';
    return response(id, { content: [{ type: 'text', text: message }], isError: true });
  }
}

/** Handle one JSON-RPC message. Bad JSON and invalid requests get JSON-RPC errors. */
export async function handleMcpMessage(
  raw: string,
  handlers: McpHandlers,
): Promise<McpHttpResponse> {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return errorResponse(null, -32700, 'Parse error: the body is not valid JSON.');
  }
  if (Array.isArray(message)) {
    return errorResponse(null, -32600, 'Batch requests are not supported; send one message.');
  }
  if (!isRecord(message)) return errorResponse(null, -32600, 'Invalid Request.');
  const method = message.method;
  if (typeof method !== 'string' || !method) return errorResponse(null, -32600, 'Invalid Request.');

  // JSON-RPC notifications never get a response body; MCP uses them for
  // `notifications/initialized` (and clients may send others).
  if (method.startsWith('notifications/') || !Object.hasOwn(message, 'id')) return { status: 202 };

  const id = message.id;
  if (typeof id !== 'string' && typeof id !== 'number') {
    return errorResponse(null, -32600, 'Invalid Request: "id" must be a string or number.');
  }

  switch (method) {
    case 'initialize': {
      const params = isRecord(message.params) ? message.params : {};
      return response(id, {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          'Read-only LearnGraph context for one account. Call list_learners, then ' +
          'get_tutor_context with the learner id (and optionally a concept and the question). ' +
          'resources/list and resources/read expose learner summaries and concept details.',
      });
    }
    case 'ping':
      return response(id, {});
    case 'tools/list':
      return response(id, { tools: MCP_TOOLS });
    case 'tools/call':
      return callTool(id, message.params, handlers);
    case 'resources/list':
      return response(id, { resources: await handlers.list_resources() });
    case 'resources/read':
      return readResource(id, message.params, handlers);
    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}
