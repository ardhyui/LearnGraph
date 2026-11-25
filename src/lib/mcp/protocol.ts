/**
 * Minimal read-only Model Context Protocol server (Roadmap M4), pure and
 * transport-free: JSON-RPC 2.0 messages in, an HTTP status + JSON body out.
 * The route (`src/lib/mcp/route.ts`) owns auth and HTTP; the tool handlers
 * (`src/lib/mcp/tools.ts`) own the graph. No dependencies, no database.
 *
 * Supported: `initialize`, `ping`, `tools/list`, `tools/call`,
 * `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, and
 * notifications (202, no body). Streamable HTTP is answered as plain
 * `application/json`; there is no SSE stream. JSON-RPC batches are rejected
 * because this server has nothing to batch (and clients can fall back).
 */

export const SERVER_NAME = 'learngraph';
export const SERVER_VERSION = '0.3.0';

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

/** One argument a ready-made prompt accepts (MCP uses this shape, not a JSON schema). */
export interface McpPromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

/** One ready-made request advertised by `prompts/list`. */
export interface McpPrompt {
  name: string;
  description: string;
  arguments?: readonly McpPromptArgument[];
}

export type McpPromptName = 'next_topic' | 'review_due' | 'explain_concept';

/** Arguments `prompts/get` accepts, already validated and defaulted. */
export interface McpPromptArguments {
  learner?: string;
  concept?: string;
  count?: number;
}

/** One user turn returned by `prompts/get`. */
export interface McpPromptMessage {
  role: 'user';
  content: { type: 'text'; text: string };
}

export interface McpPromptResult {
  description: string;
  messages: McpPromptMessage[];
}

export interface McpPromptHandlers {
  get_prompt: (name: McpPromptName, args: McpPromptArguments) => Promise<McpPromptResult>;
}

/** Everything the transport needs: the tools, the resource surface and the prompts. */
export interface McpHandlers extends McpToolHandlers, McpPromptHandlers {
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

/**
 * Ready-made requests a client can offer before the learner types anything.
 * Each one is built from the same tutor brief as `get_tutor_context`, so the
 * assistant starts with the account's own context instead of asking for it.
 */
export const MCP_PROMPTS = [
  {
    name: 'next_topic',
    description: 'Ask the tutor what this learner should learn next, using their graph.',
    arguments: [
      {
        name: 'learner',
        description: "Learner id from list_learners. Defaults to the account's own learner.",
        required: false,
      },
    ],
  },
  {
    name: 'review_due',
    description: 'Quiz this learner on the concepts that are due for review now.',
    arguments: [
      {
        name: 'learner',
        description: "Learner id from list_learners. Defaults to the account's own learner.",
        required: false,
      },
      {
        name: 'count',
        description: 'How many questions to ask (1–10). Defaults to 5.',
        required: false,
      },
    ],
  },
  {
    name: 'explain_concept',
    description: 'Explain one concept at this learner’s level, with a quick check.',
    arguments: [
      {
        name: 'concept',
        description: 'Concept id or name to explain, e.g. "Fractions".',
        required: true,
      },
      {
        name: 'learner',
        description: "Learner id from list_learners. Defaults to the account's own learner.",
        required: false,
      },
    ],
  },
] as const satisfies readonly McpPrompt[];

/** Which arguments each prompt accepts; anything else is invalid params. */
const PROMPT_ARGUMENT_KEYS: Record<McpPromptName, readonly string[]> = {
  next_topic: ['learner'],
  review_due: ['learner', 'count'],
  explain_concept: ['learner', 'concept'],
};

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

type ParsedPromptGet =
  | { ok: true; name: McpPromptName; args: McpPromptArguments }
  | { ok: false; message: string };

/**
 * Validate `prompts/get` params: a known prompt name and only the arguments
 * that prompt declares. `count` is defaulted here so the handler always sees
 * how many questions to ask; `concept` is required only for `explain_concept`.
 */
export function parsePromptGetParams(raw: unknown): ParsedPromptGet {
  if (!isRecord(raw)) return { ok: false, message: 'expected an object.' };
  const requested = raw.name;
  if (typeof requested !== 'string' || !requested) {
    return { ok: false, message: '"name" must be a prompt name.' };
  }
  if (!Object.hasOwn(PROMPT_ARGUMENT_KEYS, requested)) {
    return { ok: false, message: `Unknown prompt: ${requested}` };
  }
  const name = requested as McpPromptName;

  const rawArgs = raw.arguments;
  if (rawArgs !== undefined && rawArgs !== null && !isRecord(rawArgs)) {
    return { ok: false, message: 'Prompt arguments must be an object.' };
  }
  const given = isRecord(rawArgs) ? rawArgs : {};
  for (const key of Object.keys(given)) {
    if (!PROMPT_ARGUMENT_KEYS[name].includes(key)) {
      return { ok: false, message: `Unknown argument "${key}" for prompt "${name}".` };
    }
  }

  const args: McpPromptArguments = {};
  const learner = given.learner;
  if (learner !== undefined && learner !== null) {
    if (typeof learner !== 'string') return { ok: false, message: '"learner" must be a string.' };
    if (learner.length > 128) {
      return { ok: false, message: '"learner" is longer than 128 characters.' };
    }
    args.learner = learner;
  }

  if (name === 'explain_concept') {
    const concept = given.concept;
    if (typeof concept !== 'string' || !concept.trim()) {
      return { ok: false, message: '"concept" is required for prompt "explain_concept".' };
    }
    if (concept.length > 200) {
      return { ok: false, message: '"concept" is longer than 200 characters.' };
    }
    args.concept = concept;
  }

  if (name === 'review_due') {
    const count = given.count;
    if (count === undefined || count === null) {
      args.count = 5;
    } else if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10) {
      return { ok: false, message: '"count" must be a whole number from 1 to 10.' };
    } else {
      args.count = count;
    }
  }

  return { ok: true, name, args };
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

async function getPrompt(
  id: unknown,
  params: unknown,
  handlers: McpHandlers,
): Promise<McpHttpResponse> {
  const parsed = parsePromptGetParams(params);
  if (!parsed.ok) return errorResponse(id, -32602, `Invalid params: ${parsed.message}`);
  try {
    const result = await handlers.get_prompt(parsed.name, parsed.args);
    return response(id, result);
  } catch (err) {
    // No such learner/concept is a fixable request, so it stays a params error
    // with the handler's own explanation instead of an internal failure.
    const message = err instanceof Error && err.message ? err.message : 'The prompt failed.';
    return errorResponse(id, -32602, message);
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
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          'Read-only LearnGraph context for one account. Call list_learners, then ' +
          'get_tutor_context with the learner id (and optionally a concept and the question). ' +
          'resources/list and resources/read expose learner summaries and concept details. ' +
          'prompts/list offers ready-made requests such as next_topic and explain_concept.',
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
    case 'prompts/list':
      return response(id, { prompts: MCP_PROMPTS });
    case 'prompts/get':
      return getPrompt(id, message.params, handlers);
    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}
