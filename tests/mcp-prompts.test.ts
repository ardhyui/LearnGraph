/**
 * Roadmap M4: MCP prompts (`src/lib/mcp/protocol.ts` + `src/lib/mcp/prompts.ts`).
 * Pure JSON-RPC messages with fake handlers — no database, no React, no HTTP.
 * The prompts reuse the same tutor brief as `get_tutor_context`; these checks
 * keep their names, arguments, wording and the untouched tools/resources.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  handleMcpMessage,
  MCP_PROMPTS,
  parsePromptGetParams,
  type McpHandlers,
  type McpHttpResponse,
  type McpPromptArguments,
  type McpPromptName,
} from '../src/lib/mcp/protocol.ts';
import { buildPromptMessages } from '../src/lib/mcp/prompts.ts';

const ROOT = join(import.meta.dirname, '..');
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const BRIEF = 'BRIEF: Sari is practising Fractions and has two reviews due.';

interface JsonRpcBody {
  jsonrpc?: string;
  id?: unknown;
  result?: {
    capabilities?: { tools?: unknown; resources?: unknown; prompts?: unknown };
    instructions?: string;
    prompts?: Array<{
      name?: string;
      description?: string;
      arguments?: Array<{ name?: string; description?: string; required?: boolean }>;
      inputSchema?: unknown;
    }>;
    description?: string;
    messages?: Array<{
      role?: string;
      content?: { type?: string; text?: string };
    }>;
    tools?: Array<{ name?: string }>;
    resources?: Array<{ uri?: string }>;
  };
  error?: { code?: number; message?: string };
}

const body = (res: McpHttpResponse) => res.body as JsonRpcBody;

function fakeHandlers(): McpHandlers & {
  calls: Array<{ name: McpPromptName; args: McpPromptArguments }>;
} {
  const calls: Array<{ name: McpPromptName; args: McpPromptArguments }> = [];
  return {
    calls,
    list_learners: async () => ({ text: 'Sari — learner id: me-sari' }),
    get_tutor_context: async () => ({ text: BRIEF }),
    get_prompt: async (name, args) => {
      calls.push({ name, args });
      const prompt = MCP_PROMPTS.find((candidate) => candidate.name === name);
      return {
        description: prompt?.description ?? '',
        messages: buildPromptMessages(name, args, BRIEF),
      };
    },
    list_resources: async () => [],
    read_resource: async () => null,
  };
}

const request = (id: unknown, method: string, params?: unknown, handlers = fakeHandlers()) =>
  handleMcpMessage(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    }),
    handlers,
  );

const getPrompt = (
  id: unknown,
  name: unknown,
  args?: unknown,
  handlers = fakeHandlers(),
) =>
  request(
    id,
    'prompts/get',
    { name, ...(args === undefined ? {} : { arguments: args }) },
    handlers,
  );

describe('MCP prompts: initialize and prompts/list', () => {
  it('advertises the prompts capability and names prompts/list in the instructions', async () => {
    const res = await request(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(body(res).result?.capabilities, {
      tools: {},
      resources: {},
      prompts: {},
    });
    assert.match(body(res).result?.instructions ?? '', /prompts\/list/);
    assert.match(body(res).result?.instructions ?? '', /resources\/read/);
  });

  it('lists exactly the three ready-made prompts in order, with arguments not input schemas', async () => {
    const res = await request(2, 'prompts/list');
    assert.equal(res.status, 200);
    const prompts = body(res).result?.prompts ?? [];
    assert.deepEqual(
      prompts.map((prompt) => prompt.name),
      ['next_topic', 'review_due', 'explain_concept'],
    );
    assert.deepEqual(
      MCP_PROMPTS.map((prompt) => prompt.name),
      ['next_topic', 'review_due', 'explain_concept'],
    );
    for (const prompt of prompts) {
      assert.ok((prompt.description ?? '').length > 20, prompt.name);
      assert.ok(Array.isArray(prompt.arguments), prompt.name);
      assert.equal('inputSchema' in prompt, false, prompt.name);
      for (const argument of prompt.arguments ?? []) {
        assert.ok((argument.name ?? '').length > 0, prompt.name);
        assert.ok((argument.description ?? '').length > 10, prompt.name);
        assert.equal(typeof argument.required, 'boolean', prompt.name);
      }
    }
    assert.deepEqual(
      prompts[0].arguments?.map((argument) => argument.name),
      ['learner'],
    );
    assert.deepEqual(
      prompts[1].arguments?.map((argument) => argument.name),
      ['learner', 'count'],
    );
    assert.deepEqual(
      prompts[2].arguments?.map((argument) => argument.name),
      ['concept', 'learner'],
    );
    assert.equal(
      prompts[2].arguments?.find((argument) => argument.name === 'concept')?.required,
      true,
    );
    assert.equal(
      prompts[0].arguments?.every((argument) => argument.required === false),
      true,
    );
  });
});

describe('MCP prompts: prompts/get', () => {
  it('builds next_topic from the tutor brief with no arguments', async () => {
    const handlers = fakeHandlers();
    const res = await getPrompt(10, 'next_topic', undefined, handlers);
    assert.equal(res.status, 200);
    assert.equal(body(res).error, undefined);
    assert.deepEqual(handlers.calls, [{ name: 'next_topic', args: {} }]);
    assert.equal(body(res).result?.description, MCP_PROMPTS[0].description);
    const messages = body(res).result?.messages ?? [];
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, 'user');
    assert.equal(messages[0].content?.type, 'text');
    const text = messages[0].content?.text ?? '';
    assert.match(text, /recommend the one concept/);
    assert.ok(text.includes(BRIEF));
    assert.ok(text.indexOf(BRIEF) > text.indexOf('recommend the one concept'));
  });

  it('passes learner through unchanged and defaults review_due to five questions', async () => {
    const handlers = fakeHandlers();
    const res = await getPrompt(11, 'review_due', { learner: 'me-sari' }, handlers);
    assert.deepEqual(handlers.calls, [{ name: 'review_due', args: { learner: 'me-sari', count: 5 } }]);
    const text = body(res).result?.messages?.[0]?.content?.text ?? '';
    assert.match(text, /Ask 5 short questions/);
    assert.ok(text.includes(BRIEF));
    assert.ok(!text.includes('Budi'));
  });

  it('passes explain_concept and learner as-is into the instruction and brief', async () => {
    const handlers = fakeHandlers();
    const res = await getPrompt(
      12,
      'explain_concept',
      { concept: 'Fractions', learner: 'me-sari' },
      handlers,
    );
    assert.deepEqual(handlers.calls, [
      { name: 'explain_concept', args: { concept: 'Fractions', learner: 'me-sari' } },
    ]);
    const text = body(res).result?.messages?.[0]?.content?.text ?? '';
    assert.match(text, /explain "Fractions" at this learner's level/);
    assert.ok(text.includes(BRIEF));
  });

  it('accepts count 1 and 10 and rejects everything outside 1–10 without calling the handler', async () => {
    for (const count of [1, 10]) {
      const handlers = fakeHandlers();
      const res = await getPrompt(20, 'review_due', { count }, handlers);
      assert.equal(body(res).error, undefined, String(count));
      assert.deepEqual(handlers.calls, [{ name: 'review_due', args: { count } }]);
      assert.match(
        body(res).result?.messages?.[0]?.content?.text ?? '',
        new RegExp(`Ask ${count} short questions`),
      );
    }

    const handlers = fakeHandlers();
    for (const count of [0, 11, 1.5, '5' as unknown, -1]) {
      const res = await getPrompt(21, 'review_due', { count }, handlers);
      assert.equal(body(res).error?.code, -32602, String(count));
      assert.match(body(res).error?.message ?? '', /"count" must be a whole number from 1 to 10/);
    }
    assert.deepEqual(handlers.calls, []);
  });

  it('rejects unknown prompts and unknown or missing arguments with -32602 and no handler call', async () => {
    for (const params of [undefined, 'not-an-object', [] as unknown[]]) {
      const res = await request(29, 'prompts/get', params);
      assert.equal(body(res).error?.code, -32602, JSON.stringify(params));
      assert.match(body(res).error?.message ?? '', /expected an object/);
    }

    const handlers = fakeHandlers();
    const cases: Array<[unknown, unknown, RegExp]> = [
      ['', undefined, /"name" must be a prompt name/],
      ['delete_everything', undefined, /Unknown prompt: delete_everything/],
      ['next_topic', 'not-an-object', /Prompt arguments must be an object/],
      ['next_topic', { concept: 'Fractions' }, /Unknown argument "concept" for prompt "next_topic"/],
      ['next_topic', { count: 3 }, /Unknown argument "count" for prompt "next_topic"/],
      ['next_topic', { learner: 42 }, /"learner" must be a string/],
      ['next_topic', { learner: 'x'.repeat(129) }, /"learner" is longer than 128/],
      ['review_due', { concept: 'Fractions' }, /Unknown argument "concept"/],
      ['explain_concept', {}, /"concept" is required/],
      ['explain_concept', { concept: '' }, /"concept" is required/],
      ['explain_concept', { concept: '   ' }, /"concept" is required/],
      ['explain_concept', { concept: 'x'.repeat(201) }, /"concept" is longer than 200/],
      ['explain_concept', { concept: 42 }, /"concept" is required/],
    ];
    for (const [name, args, message] of cases) {
      const res = await getPrompt(30, name, args, handlers);
      assert.equal(body(res).error?.code, -32602, JSON.stringify({ name, args }));
      assert.match(body(res).error?.message ?? '', message);
    }
    assert.deepEqual(handlers.calls, []);
  });

  it('accepts the exact length limits and trims nothing when forwarding', () => {
    const learner = 'x'.repeat(128);
    const concept = 'y'.repeat(200);
    const nextTopic = parsePromptGetParams({
      name: 'next_topic',
      arguments: { learner },
    });
    assert.equal(nextTopic.ok, true);
    if (nextTopic.ok) assert.deepEqual(nextTopic.args, { learner });

    const explain = parsePromptGetParams({
      name: 'explain_concept',
      arguments: { concept, learner },
    });
    assert.equal(explain.ok, true);
    if (explain.ok) assert.deepEqual(explain.args, { concept, learner });

    const spaced = parsePromptGetParams({
      name: 'explain_concept',
      arguments: { concept: ' Fractions ' },
    });
    assert.equal(spaced.ok, true);
    if (spaced.ok) assert.equal(spaced.args.concept, ' Fractions ');
  });

  it('turns a missing learner or concept into a clear params error, not an internal one', async () => {
    const res = await handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 40,
        method: 'prompts/get',
        params: { name: 'explain_concept', arguments: { concept: 'Nope' } },
      }),
      {
        ...fakeHandlers(),
        get_prompt: async () => {
          throw new Error('No concept "Nope" in this account.');
        },
      },
    );
    assert.equal(body(res).error?.code, -32602);
    assert.equal(body(res).error?.message, 'No concept "Nope" in this account.');
    assert.equal(body(res).result, undefined);
  });
});

describe('MCP prompts: the rest of the surface is unchanged', () => {
  it('still lists the two tools and answers notifications without a body', async () => {
    const tools = await request(50, 'tools/list');
    assert.deepEqual(
      (body(tools).result?.tools ?? []).map((tool) => tool.name),
      ['list_learners', 'get_tutor_context'],
    );

    const note = await handleMcpMessage(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/prompts/list_changed' }),
      fakeHandlers(),
    );
    assert.equal(note.status, 202);
    assert.equal('body' in note, false);
  });

  it('still routes resources and unknown methods as before', async () => {
    const resources = await request(51, 'resources/list');
    assert.deepEqual(body(resources).result?.resources, []);
    const unknown = await request(52, 'logging/setLevel');
    assert.equal(body(unknown).error?.code, -32601);
    assert.match(body(unknown).error?.message ?? '', /logging\/setLevel/);
  });

  it('builds every prompt as one user turn with the brief last', () => {
    for (const name of ['next_topic', 'review_due', 'explain_concept'] as const) {
      const messages = buildPromptMessages(
        name,
        name === 'explain_concept' ? { concept: 'Fractions' } : { count: 5 },
        `  ${BRIEF}  `,
      );
      assert.equal(messages.length, 1, name);
      assert.equal(messages[0].role, 'user', name);
      assert.equal(messages[0].content.type, 'text', name);
      assert.ok(messages[0].content.text.endsWith(BRIEF), name);
      assert.match(messages[0].content.text, /\n\n---\n\n/, name);
    }
  });

  it('keeps the definitions and the handler account-scoped and dependency-free', () => {
    const protocol = source('src/lib/mcp/protocol.ts');
    const prompts = source('src/lib/mcp/prompts.ts');
    const tools = source('src/lib/mcp/tools.ts');
    assert.ok(protocol.includes('export const MCP_PROMPTS'));
    assert.ok(protocol.includes("case 'prompts/list'"));
    assert.ok(protocol.includes("case 'prompts/get'"));
    assert.ok(prompts.includes('export function buildPromptMessages'));
    assert.ok(tools.includes('get_prompt'));
    assert.ok(tools.includes('contextPayload(owner, args)'));
    assert.ok(tools.includes('buildPromptMessages'));
    for (const text of [protocol, prompts, tools]) {
      assert.ok(!text.includes('createServerFn'));
      assert.ok(!text.includes('graphCall'));
      assert.ok(!text.includes('fetch('));
    }
    assert.ok(!prompts.includes('owner'));
  });
});
