/**
 * Roadmap M4: the read-only MCP server's protocol layer (`src/lib/mcp/protocol.ts`).
 * Pure JSON-RPC 2.0 messages with fake tool handlers — no database, no React,
 * no HTTP. The wiring checks at the end keep the route and the shared REST/MCP
 * payload helpers from drifting apart.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  handleMcpMessage,
  LATEST_PROTOCOL_VERSION,
  MCP_TOOLS,
  negotiateProtocolVersion,
  parseToolArguments,
  SERVER_NAME,
  SERVER_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type McpHttpResponse,
  type McpToolHandlers,
} from '../src/lib/mcp/protocol.ts';

const ROOT = join(import.meta.dirname, '..');
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

interface JsonRpcBody {
  jsonrpc?: string;
  id?: unknown;
  result?: {
    protocolVersion?: string;
    capabilities?: { tools?: unknown };
    serverInfo?: { name?: string; version?: string };
    instructions?: string;
    tools?: Array<{
      name?: string;
      description?: string;
      inputSchema?: { type?: string; properties?: Record<string, unknown> };
    }>;
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

const body = (res: McpHttpResponse) => res.body as JsonRpcBody;

function fakeHandlers(): McpToolHandlers & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    list_learners: async () => ({
      text: 'Sari — learner id: me-sari',
      structuredContent: { learners: [{ id: 'me-sari', name: 'Sari', example: false }] },
    }),
    get_tutor_context: async (args) => {
      calls.push(args);
      return {
        text: 'You are tutoring one learner. Sari is practising Fractions.',
        structuredContent: { learner: 'me-sari', concept: 'c-frac', queryType: 'explain', tokens: 42 },
      };
    },
  };
}

const initialize = (id: unknown, protocolVersion?: unknown) =>
  handleMcpMessage(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    }),
    fakeHandlers(),
  );

describe('MCP protocol: initialize and notifications', () => {
  it('echoes a supported protocol version and advertises the tools capability', async () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      const res = await initialize(7, version);
      assert.equal(res.status, 200);
      assert.equal(body(res).jsonrpc, '2.0');
      assert.equal(body(res).id, 7);
      assert.equal(body(res).result?.protocolVersion, version);
      assert.deepEqual(body(res).result?.capabilities, { tools: {} });
      assert.equal(body(res).result?.serverInfo?.name, SERVER_NAME);
      assert.equal(body(res).result?.serverInfo?.version, SERVER_VERSION);
      assert.match(body(res).result?.instructions ?? '', /list_learners/);
    }
  });

  it('falls back to the newest supported version for unknown or missing requests', async () => {
    assert.equal(body(await initialize(1, '1999-01-01')).result?.protocolVersion, LATEST_PROTOCOL_VERSION);
    assert.equal(body(await initialize(2, 42 as unknown)).result?.protocolVersion, LATEST_PROTOCOL_VERSION);
    const noParams = await handleMcpMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'initialize' }),
      fakeHandlers(),
    );
    assert.equal(body(noParams).result?.protocolVersion, LATEST_PROTOCOL_VERSION);
    assert.equal(LATEST_PROTOCOL_VERSION, '2025-06-18');
    assert.deepEqual([...SUPPORTED_PROTOCOL_VERSIONS], ['2025-06-18', '2025-03-26']);
  });

  it('answers notifications with 202 and no body', async () => {
    for (const method of ['notifications/initialized', 'notifications/cancelled']) {
      const res = await handleMcpMessage(
        JSON.stringify({ jsonrpc: '2.0', method, params: {} }),
        fakeHandlers(),
      );
      assert.equal(res.status, 202);
      assert.equal('body' in res, false);
    }
    // A message without an id is a JSON-RPC notification, whatever its method.
    const noId = await handleMcpMessage(
      JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
      fakeHandlers(),
    );
    assert.equal(noId.status, 202);
    assert.equal('body' in noId, false);
  });

  it('answers ping with an empty result', async () => {
    const res = await handleMcpMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 'p1', method: 'ping' }),
      fakeHandlers(),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(body(res), { jsonrpc: '2.0', id: 'p1', result: {} });
  });
});

describe('MCP protocol: tools/list', () => {
  it('lists the two read-only tools with input schemas', async () => {
    const res = await handleMcpMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/list' }),
      fakeHandlers(),
    );
    const tools = body(res).result?.tools ?? [];
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ['list_learners', 'get_tutor_context'],
    );
    assert.equal(MCP_TOOLS.length, 2);
    for (const tool of tools) {
      assert.equal(tool.inputSchema?.type, 'object');
      assert.ok((tool.description ?? '').length > 20);
    }
    assert.deepEqual(tools[0].inputSchema?.properties, {});
    assert.deepEqual(Object.keys(tools[1].inputSchema?.properties ?? {}), ['learner', 'concept', 'query']);
  });
});

describe('MCP protocol: tools/call', () => {
  const call = (id: unknown, name: unknown, args?: unknown) =>
    handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, ...(args === undefined ? {} : { arguments: args }) },
      }),
      fakeHandlers(),
    );

  it('wraps list_learners as MCP text plus structured content', async () => {
    const res = await call(20, 'list_learners');
    assert.equal(res.status, 200);
    assert.deepEqual(body(res).result?.content, [
      { type: 'text', text: 'Sari — learner id: me-sari' },
    ]);
    assert.deepEqual(body(res).result?.structuredContent, {
      learners: [{ id: 'me-sari', name: 'Sari', example: false }],
    });
    assert.equal(body(res).result?.isError, undefined);
  });

  it('passes learner, concept and query to get_tutor_context and returns its text', async () => {
    const handlers = fakeHandlers();
    const res = await handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'get_tutor_context',
          arguments: { learner: 'me-sari', concept: 'Fractions', query: 'explain adding fractions' },
        },
      }),
      handlers,
    );
    assert.deepEqual(handlers.calls, [
      { learner: 'me-sari', concept: 'Fractions', query: 'explain adding fractions' },
    ]);
    assert.deepEqual(body(res).result?.content, [
      { type: 'text', text: 'You are tutoring one learner. Sari is practising Fractions.' },
    ]);
    assert.deepEqual(body(res).result?.structuredContent, {
      learner: 'me-sari',
      concept: 'c-frac',
      queryType: 'explain',
      tokens: 42,
    });
  });

  it('treats missing arguments and null fields as omitted', async () => {
    const handlers = fakeHandlers();
    await handleMcpMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'get_tutor_context' } }),
      handlers,
    );
    await handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 23,
        method: 'tools/call',
        params: { name: 'get_tutor_context', arguments: { learner: null, concept: null, query: null } },
      }),
      handlers,
    );
    assert.deepEqual(handlers.calls, [{}, {}]);
  });

  it('rejects unknown tools with JSON-RPC -32602', async () => {
    const res = await call(30, 'delete_everything');
    assert.equal(body(res).error?.code, -32602);
    assert.match(body(res).error?.message ?? '', /Unknown tool: delete_everything/);
    const noName = await call(31, null);
    assert.equal(body(noName).error?.code, -32602);
  });

  it('rejects malformed arguments with -32602 and never calls the handler', async () => {
    const handlers = fakeHandlers();
    const cases: Array<[unknown, RegExp]> = [
      ['not-an-object', /must be an object/],
      [[], /must be an object/],
      [{ query: 42 }, /"query" must be a string/],
      [{ learner: { id: 'x' } }, /"learner" must be a string/],
      [{ query: 'x'.repeat(1001) }, /"query" is longer than 1000/],
      [{ learner: 'x'.repeat(129) }, /"learner" is longer than 128/],
      [{ concept: 'x'.repeat(201) }, /"concept" is longer than 200/],
    ];
    for (const [args, message] of cases) {
      const res = await handleMcpMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 32, method: 'tools/call', params: { name: 'get_tutor_context', arguments: args } }),
        handlers,
      );
      assert.equal(body(res).error?.code, -32602, JSON.stringify(args));
      assert.match(body(res).error?.message ?? '', message);
    }
    assert.deepEqual(handlers.calls, []);
  });

  it('accepts the exact length limits', () => {
    assert.equal(parseToolArguments('get_tutor_context', { query: 'x'.repeat(1000) }).ok, true);
    assert.equal(parseToolArguments('get_tutor_context', { learner: 'x'.repeat(128) }).ok, true);
    assert.equal(parseToolArguments('get_tutor_context', { concept: 'x'.repeat(200) }).ok, true);
    assert.equal(parseToolArguments('list_learners', { ignored: true }).ok, true);
  });

  it('turns a tool failure into an isError result instead of a protocol error', async () => {
    const res = await handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 40,
        method: 'tools/call',
        params: { name: 'get_tutor_context', arguments: { concept: 'Nope' } },
      }),
      {
        ...fakeHandlers(),
        get_tutor_context: async () => {
          throw new Error('No concept "Nope" in this account.');
        },
      },
    );
    assert.equal(body(res).error, undefined);
    assert.deepEqual(body(res).result?.content, [
      { type: 'text', text: 'No concept "Nope" in this account.' },
    ]);
    assert.equal(body(res).result?.isError, true);
  });
});

describe('MCP protocol: bad input', () => {
  it('answers broken JSON with -32700 and a null id', async () => {
    const res = await handleMcpMessage('{"jsonrpc":', fakeHandlers());
    assert.equal(body(res).id, null);
    assert.equal(body(res).error?.code, -32700);
    assert.match(body(res).error?.message ?? '', /Parse error/);
  });

  it('rejects batches, non-objects and messages without a method with -32600', async () => {
    const cases = [
      '[{"jsonrpc":"2.0","id":1,"method":"ping"}]',
      '"hello"',
      'null',
      '42',
      JSON.stringify({ jsonrpc: '2.0', id: 1 }),
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 7 }),
      JSON.stringify({ jsonrpc: '2.0', id: { nested: true }, method: 'ping' }),
    ];
    for (const raw of cases) {
      const res = await handleMcpMessage(raw, fakeHandlers());
      assert.equal(body(res).error?.code, -32600, raw);
      assert.equal(body(res).jsonrpc, '2.0');
    }
    const batch = await handleMcpMessage(cases[0], fakeHandlers());
    assert.match(body(batch).error?.message ?? '', /Batch requests are not supported/);
  });

  it('answers unknown methods with -32601', async () => {
    const res = await handleMcpMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 50, method: 'resources/list' }),
      fakeHandlers(),
    );
    assert.equal(body(res).error?.code, -32601);
    assert.match(body(res).error?.message ?? '', /resources\/list/);
  });

  it('negotiates only known versions', () => {
    assert.equal(negotiateProtocolVersion('2025-03-26'), '2025-03-26');
    assert.equal(negotiateProtocolVersion('2024-11-05'), '2025-06-18');
    assert.equal(negotiateProtocolVersion(undefined), '2025-06-18');
  });
});

describe('MCP wiring', () => {
  it('registers POST and GET handlers on /api/mcp', () => {
    const route = source('src/routes/api/mcp.ts');
    assert.ok(route.includes("createFileRoute('/api/mcp')"));
    assert.ok(route.includes('POST: async'));
    assert.ok(route.includes('GET: async'));
    assert.ok(route.includes("import('@/lib/mcp/route')"));
  });

  it('uses the shared REST payload helpers for both tools', () => {
    const tools = source('src/lib/mcp/tools.ts');
    assert.ok(tools.includes('learnersPayload'));
    assert.ok(tools.includes('contextPayload'));
    const v1 = source('src/lib/api/v1.ts');
    assert.ok(v1.includes('export async function learnersPayload'));
    assert.ok(v1.includes('export async function contextPayload'));
    assert.ok(v1.includes('export async function authenticateApiRequest'));
    assert.ok(source('src/lib/mcp/route.ts').includes('authenticateApiRequest'));
  });

  it('keeps the endpoint read-only, without database or dependency changes', () => {
    const protocol = source('src/lib/mcp/protocol.ts');
    assert.equal((protocol.match(/^import /gm) ?? []).length, 0);
    assert.ok(!protocol.includes('fetch('));
    assert.ok(!source('src/lib/mcp/route.ts').includes('insertInto'));
  });
});
