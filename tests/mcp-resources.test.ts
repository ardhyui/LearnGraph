/**
 * Roadmap M4: read-only MCP resources (`src/lib/mcp/resources.ts` and the
 * `resources/list` / `resources/read` branches in `src/lib/mcp/protocol.ts`).
 * Pure node:test — no PGlite, no React, no HTTP. The end-to-end account
 * isolation checks live in `tests/mcp-api.test.ts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  handleMcpMessage,
  MAX_RESOURCE_URI_LENGTH,
  type McpHandlers,
  type McpHttpResponse,
} from '../src/lib/mcp/protocol.ts';
import {
  conceptResourceMarkdown,
  conceptResourceUri,
  CONCEPT_URI_PREFIX,
  learnerResourceMarkdown,
  learnerResourceUri,
  LEARNER_URI_PREFIX,
  parseResourceUri,
} from '../src/lib/mcp/resources.ts';
import type { ConceptNode, KnowledgeState } from '../src/lib/graph/types.ts';

const ROOT = join(import.meta.dirname, '..');
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const NOW = new Date('2026-11-16T12:00:00.000Z');

function concept(
  overrides: Partial<ConceptNode> & Pick<ConceptNode, 'conceptId' | 'name'>,
): ConceptNode {
  return {
    domain: 'math',
    description: '',
    difficulty: { absolute: 3, cognitiveLoad: 0.4, abstractness: 0.5 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function state(
  overrides: Partial<KnowledgeState> & Pick<KnowledgeState, 'conceptId'>,
): KnowledgeState {
  return {
    userId: 'me-sari',
    mastery: 0,
    bloomLevel: 1,
    retentionStrength: 0.5,
    reviewCount: 0,
    misconceptions: [],
    interactions: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const concepts: ConceptNode[] = [
  concept({ conceptId: 'c-whole', name: 'Whole numbers', description: 'Counting numbers' }),
  concept({
    conceptId: 'c-frac',
    name: 'Fractions',
    description: 'Parts of a whole',
    timeEstimates: { introduction: 10, basicMastery: 45, deepMastery: 120 },
  }),
];

describe('MCP resource URIs', () => {
  it('encodes ids in both URI shapes and round-trips them', () => {
    assert.equal(learnerResourceUri('me-sari'), 'learngraph://learner/me-sari');
    assert.equal(conceptResourceUri('c-frac'), 'learngraph://concept/c-frac');
    assert.equal(LEARNER_URI_PREFIX, 'learngraph://learner/');
    assert.equal(CONCEPT_URI_PREFIX, 'learngraph://concept/');

    const tricky = 'me/sari?x#1 & ünïcode';
    const learnerUri = learnerResourceUri(tricky);
    assert.ok(learnerUri.startsWith(LEARNER_URI_PREFIX));
    assert.ok(!learnerUri.slice(LEARNER_URI_PREFIX.length).includes('/'));
    assert.deepEqual(parseResourceUri(learnerUri), { kind: 'learner', id: tricky });

    const conceptUri = conceptResourceUri('concept:a b');
    assert.deepEqual(parseResourceUri(conceptUri), { kind: 'concept', id: 'concept:a b' });
  });

  it('rejects other shapes, empty ids and broken percent escapes', () => {
    for (const uri of [
      '',
      'learngraph://learner/',
      'learngraph://concept/',
      'https://example.test/learner/me-sari',
      'learngraph://lesson/x',
      'learngraph://learner/%E0%A4%A',
      'learngraph://concept/%',
    ]) {
      assert.equal(parseResourceUri(uri), null, uri);
    }
  });
});

describe('MCP learner resource', () => {
  it('lists mastery deterministically with its source and only the reviews due now', () => {
    const text = learnerResourceMarkdown({
      learner: { id: 'me-sari', name: '  Sari   Lazuardi ' },
      concepts,
      now: NOW,
      states: [
        state({
          conceptId: 'c-whole',
          mastery: 40.6,
          masterySource: 'self_report',
          nextReview: '2026-11-20T09:00:00.000Z',
        }),
        state({
          conceptId: 'c-frac',
          mastery: 90,
          masterySource: 'quiz',
          nextReview: '2026-11-10T09:00:00.000Z',
        }),
        // Deleted concept: the readable id fallback keeps "concept:" out of the text.
        state({ conceptId: 'decimals', mastery: 55 }),
      ],
    });

    assert.equal(
      text,
      [
        '# Sari Lazuardi',
        '',
        '## Mastery',
        '',
        '- Decimals — 55% (Not quiz-checked)',
        '- Fractions — 90% (From quizzes)',
        '- Whole numbers — 41% (Self-reported)',
        '',
        '## Reviews due now',
        '',
        '- Fractions — 2026-11-10',
      ].join('\n'),
    );
    assert.ok(!text.includes('concept:'));
    assert.ok(!text.includes('c-whole'));
  });

  it('says calmly when there is nothing learned and nothing due', () => {
    const empty = learnerResourceMarkdown({
      learner: { id: 'me-new' },
      concepts: [],
      states: [],
      now: NOW,
    });
    assert.equal(
      empty,
      [
        '# me-new',
        '',
        '## Mastery',
        '',
        'No concepts yet.',
        '',
        'A first lesson or quiz will add concepts here.',
        '',
        '## Reviews due now',
        '',
        'Nothing due right now.',
        '',
        'Reviews come back here when they are due.',
      ].join('\n'),
    );

    const learned = learnerResourceMarkdown({
      learner: { id: 'me-sari', name: 'Sari' },
      concepts,
      now: NOW,
      states: [state({ conceptId: 'c-frac', mastery: 90, nextReview: NOW.toISOString() })],
    });
    // Due at exactly `now` counts; an invalid or future date does not.
    assert.match(learned, /- Fractions — 2026-11-16/);
    const future = learnerResourceMarkdown({
      learner: { id: 'me-sari', name: 'Sari' },
      concepts,
      now: NOW,
      states: [
        state({ conceptId: 'c-frac', mastery: 90, nextReview: '2026-11-16T12:00:00.001Z' }),
        state({ conceptId: 'c-whole', mastery: 10, nextReview: 'not-a-date' }),
      ],
    });
    assert.match(future, /Nothing due right now\./);
    assert.ok(!future.includes('2026-11-16'));
  });

  it('clamps mastery and keeps the order independent of input order', () => {
    const forward = learnerResourceMarkdown({
      learner: { id: 'me-sari', name: 'Sari' },
      concepts,
      now: NOW,
      states: [
        state({ conceptId: 'c-whole', mastery: 250 }),
        state({ conceptId: 'c-frac', mastery: -10 }),
      ],
    });
    const reverse = learnerResourceMarkdown({
      learner: { id: 'me-sari', name: 'Sari' },
      concepts,
      now: NOW,
      states: [
        state({ conceptId: 'c-frac', mastery: -10 }),
        state({ conceptId: 'c-whole', mastery: 250 }),
      ],
    });
    assert.equal(forward, reverse);
    assert.match(forward, /- Fractions — 0% \(Not quiz-checked\)/);
    assert.match(forward, /- Whole numbers — 100% \(Not quiz-checked\)/);
  });
});

describe('MCP concept resource', () => {
  it('renders domain, description, time estimates and prerequisite names', () => {
    const text = conceptResourceMarkdown({
      concept: concepts[1],
      prerequisites: [
        { conceptId: 'c-whole', name: 'Whole numbers' },
        { conceptId: 'decimals', name: null },
        { conceptId: 'c-whole', name: 'Whole numbers' },
      ],
    });
    assert.equal(
      text,
      [
        '# Fractions',
        '',
        '- Domain: math',
        '- Description: Parts of a whole',
        '- Time estimate: 10 min introduction · 45 min to basic mastery · 120 min to deep mastery',
        '',
        '## Prerequisites',
        '',
        '- Decimals',
        '- Whole numbers',
      ].join('\n'),
    );
  });

  it('omits missing optional blocks and falls back to a readable name', () => {
    const text = conceptResourceMarkdown({
      concept: concept({ conceptId: 'concept:blank', name: '', domain: '  ' }),
      prerequisites: [],
    });
    assert.equal(text, ['# Blank', '', '- Domain: Unspecified'].join('\n'));
    assert.ok(!text.includes('Prerequisites'));
    assert.ok(!text.includes('concept:blank'));
  });

  it('ignores non-finite time estimates without dropping the rest', () => {
    const text = conceptResourceMarkdown({
      concept: concept({
        conceptId: 'c-x',
        name: 'X',
        timeEstimates: { introduction: Number.NaN, basicMastery: 30, deepMastery: Infinity },
      }),
      prerequisites: [],
    });
    assert.match(text, /- Time estimate: 30 min to basic mastery/);
  });
});

describe('MCP protocol: resources', () => {
  interface RpcBody {
    result?: {
      protocolVersion?: string;
      capabilities?: { tools?: unknown; resources?: unknown };
      resources?: Array<{ uri?: string; name?: string; mimeType?: string }>;
      contents?: Array<{ uri?: string; mimeType?: string; text?: string }>;
    };
    error?: { code?: number; message?: string };
  }
  const body = (res: McpHttpResponse) => res.body as RpcBody;

  function handlers(): McpHandlers & { reads: string[] } {
    const reads: string[] = [];
    return {
      reads,
      list_learners: async () => ({ text: '' }),
      get_tutor_context: async () => ({ text: '' }),
      get_prompt: async () => ({ description: '', messages: [] }),
      list_resources: async () => [
        { uri: 'learngraph://learner/me-sari', name: 'Sari', mimeType: 'text/markdown' },
        { uri: 'learngraph://concept/c-frac', name: 'Fractions', mimeType: 'text/markdown' },
      ],
      read_resource: async (uri) => {
        reads.push(uri);
        return uri === 'learngraph://learner/me-sari'
          ? { uri, mimeType: 'text/markdown', text: '# Sari' }
          : null;
      },
    };
  }

  it('advertises resources on initialize without changing the protocol version', async () => {
    const res = await handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26' },
      }),
      handlers(),
    );
    assert.equal(body(res).result?.protocolVersion, '2025-03-26');
    assert.deepEqual(body(res).result?.capabilities, { tools: {}, resources: {}, prompts: {} });
  });

  it('lists resources in learner-then-concept order as given by the handler', async () => {
    const res = await handleMcpMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/list' }),
      handlers(),
    );
    assert.deepEqual(
      body(res).result?.resources?.map((resource) => resource.uri),
      ['learngraph://learner/me-sari', 'learngraph://concept/c-frac'],
    );
  });

  it('returns one contents entry for a known URI and -32002 otherwise', async () => {
    const known = await handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/read',
        params: { uri: 'learngraph://learner/me-sari' },
      }),
      handlers(),
    );
    assert.deepEqual(body(known).result?.contents, [
      { uri: 'learngraph://learner/me-sari', mimeType: 'text/markdown', text: '# Sari' },
    ]);

    const unknown = await handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/read',
        params: { uri: 'learngraph://concept/nope' },
      }),
      handlers(),
    );
    assert.deepEqual(body(unknown).error, {
      code: -32002,
      message: 'Resource not found: learngraph://concept/nope',
    });
  });

  it('rejects invalid params with -32602', async () => {
    for (const params of [
      undefined,
      null,
      [],
      {},
      { uri: '' },
      { uri: 5 },
      { uri: 'x'.repeat(MAX_RESOURCE_URI_LENGTH + 1) },
    ]) {
      const res = await handleMcpMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'resources/read', params }),
        handlers(),
      );
      assert.equal(body(res).error?.code, -32602, JSON.stringify(params));
    }
  });

  it('keeps the existing surface intact', async () => {
    for (const method of ['ping', 'tools/list']) {
      const res = await handleMcpMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 6, method }),
        handlers(),
      );
      assert.equal(res.status, 200);
    }
    const notification = await handleMcpMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/resources/updated',
        params: { uri: 'x' },
      }),
      handlers(),
    );
    assert.equal(notification.status, 202);
    assert.equal('body' in notification, false);
  });
});

describe('MCP resources wiring', () => {
  it('adds no server function, graph call, dependency or migration path', () => {
    for (const path of [
      'src/lib/mcp/resources.ts',
      'src/lib/mcp/protocol.ts',
      'src/lib/mcp/tools.ts',
    ]) {
      const text = source(path);
      assert.ok(!text.includes('createServerFn'), path);
      assert.ok(!text.includes('graphCall'), path);
    }
    const resources = source('src/lib/mcp/resources.ts');
    assert.equal((resources.match(/^import /gm) ?? []).length, 3);
    assert.ok(!resources.includes('fetch('));
    assert.ok(!resources.includes("from '@electric-sql/pglite'"));
    assert.ok(!source('src/lib/mcp/route.ts').includes('resources'));
  });

  it('reads resources through the account-scoped graph only', () => {
    const tools = source('src/lib/mcp/tools.ts');
    assert.ok(tools.includes('graphFor(owner)'));
    assert.ok(!tools.includes('getDb('));
    assert.ok(tools.includes('parseResourceUri(uri)'));
    assert.ok(tools.includes('learnerResourceMarkdown'));
    assert.ok(tools.includes('conceptResourceMarkdown'));
  });
});
