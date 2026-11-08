/**
 * Roadmap M4 (no LLM cost): `getRAGContext` builds a ≤ 2000-token brief for
 * any AI tutor from what LearnGraph knows, picks instructions by question
 * type, and never lets a sensitive psychometric domain into the text.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildTutorContext,
  detectQueryType,
  MAX_CONTEXT_TOKENS,
  SENSITIVE_DOMAINS,
} from '../src/lib/tutor/context.ts';
import { getRAGContext } from '../src/lib/tutor/service.ts';
import { ALL_DOMAIN_IDS, DOMAIN_METADATA } from '../src/lib/graph/psychometrics.ts';
import { openTestGraphDB } from './support/graph-db.ts';
import { seedDemoDataIfEmpty } from '../src/lib/graph/seed.ts';
import type { ConceptNode, KnowledgeState } from '../src/lib/graph/types.ts';

const concept = (id: string, name = id): ConceptNode => ({
  conceptId: id,
  name,
  domain: 'mathematics',
  description: `About ${name}`,
  difficulty: { absolute: 3, cognitiveLoad: 0.5, abstractness: 0.5 },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});
const state = (id: string, mastery: number, extra: Partial<KnowledgeState> = {}): KnowledgeState => ({
  userId: 'sam',
  conceptId: id,
  mastery,
  bloomLevel: 1,
  retentionStrength: 0.8,
  reviewCount: 1,
  misconceptions: [],
  interactions: [],
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('tutor context (pure)', () => {
  it('detects the kind of question, in English and Indonesian', () => {
    assert.equal(detectQueryType('Can you explain linear equations?'), 'explain');
    assert.equal(detectQueryType("I'm stuck moving terms across the equals sign"), 'stuck');
    assert.equal(detectQueryType('Give me practice problems'), 'practice');
    assert.equal(detectQueryType('Saya lupa cara menyederhanakan pecahan'), 'review');
    assert.equal(detectQueryType('What should I learn next?'), 'next');
    assert.equal(detectQueryType('jelaskan pecahan'), 'explain');
    assert.equal(detectQueryType(''), 'general');
  });

  it('describes the topic, what it builds on, misconceptions and where mastery came from', () => {
    const ctx = buildTutorContext(
      {
        learner: { learningStyle: { primary: 'visual', socialPreference: 'solo', pacePreference: 'structured', feedbackPreference: 'immediate' } },
        concept: concept('linear', 'Linear Equations'),
        prerequisites: ['pre'],
        concepts: [concept('linear', 'Linear Equations'), concept('pre', 'Pre-Algebra')],
        states: [
          state('pre', 85, { masterySource: 'quiz' }),
          state('linear', 45, {
            masterySource: 'self_report',
            misconceptions: [{ id: 'm1', description: 'moves terms without changing the sign', severity: 'moderate', identified: '2026-01-01T00:00:00Z' }],
          }),
        ],
        next: [{ conceptId: 'linear' }],
        dueReviews: [],
        strategies: ['worked_example', 'chunking'],
        formatPreference: 'example-first',
      },
      "I'm stuck on 2x + 3 = 11",
    );
    assert.equal(ctx.queryType, 'stuck');
    assert.match(ctx.text, /Topic: Linear Equations/);
    assert.match(ctx.text, /Learner: 45% mastered \(self-reported\)/);
    assert.match(ctx.text, /Pre-Algebra: 85% mastered \(from quizzes\)/);
    assert.match(ctx.text, /moves terms without changing the sign/);
    assert.match(ctx.text, /show a worked example/);
    assert.match(ctx.text, /prefers lessons with examples first/);
    assert.match(ctx.text, /hint before the full solution/);
  });

  it('never contains a sensitive domain, even when every domain has a score', () => {
    const scores = Object.fromEntries(ALL_DOMAIN_IDS.map((id, i) => [id, { score: 90 - i, confidence: 0.9, lastUpdated: '2026-01-01', source: 'assessment' }]));
    const ctx = buildTutorContext(
      {
        learner: { psychometricScores: scores, tags: ['focus:mathematics'] } as never,
        concepts: [concept('a', 'Fractions')],
        states: [state('a', 90)],
        next: [],
        dueReviews: [],
        strategies: ['hints', 'repetition', 'analogy', 'visual_aids', 'peer_discussion', 'guided_practice'],
      },
      'explain fractions',
    );
    const lower = ctx.text.toLowerCase();
    for (const id of SENSITIVE_DOMAINS) {
      assert.ok(!lower.includes(id.replaceAll('_', ' ')) && !lower.includes(id), id);
      const label = DOMAIN_METADATA[id].name.toLowerCase();
      assert.ok(!lower.includes(label), `${id} label "${label}"`);
    }
    for (const word of ['narciss', 'machiavell', 'psychopath', 'politic', 'neurotic', 'anxiety', 'attachment', 'ideology', 'moral']) {
      assert.ok(!lower.includes(word), word);
    }
    // No raw score values either.
    assert.doesNotMatch(ctx.text, /\b(9\d|8\d|7\d|6\d|5\d)\b(?!%)/);
  });

  it(`stays within ${MAX_CONTEXT_TOKENS} tokens for a large workspace`, () => {
    const concepts = Array.from({ length: 600 }, (_, i) => concept(`c${i}`, `A fairly long concept name number ${i}`));
    const states = concepts.map((c) =>
      state(c.conceptId, 95, {
        misconceptions: [{ id: c.conceptId, description: 'x'.repeat(1500), severity: 'major', identified: '2026-01-01T00:00:00Z' }],
      }),
    );
    const ctx = buildTutorContext(
      {
        learner: {},
        concept: { ...concepts[0], description: 'y'.repeat(4000) },
        prerequisites: concepts.slice(1, 50).map((c) => c.conceptId),
        concepts,
        states,
        next: concepts.map((c) => ({ conceptId: c.conceptId })),
        dueReviews: concepts.map((c) => ({ conceptId: c.conceptId })),
        strategies: [],
      },
      'help',
    );
    assert.ok(ctx.tokens <= MAX_CONTEXT_TOKENS, `${ctx.tokens} tokens`);
    assert.match(ctx.text, /^You are tutoring one learner/);
    // A huge description is shortened, not allowed to drop the topic.
    assert.match(ctx.text, /Topic: A fairly long concept name number 0 — y+…/);
  });
});

describe('getRAGContext on PGlite', () => {
  const DIR = path.join(os.tmpdir(), `learngraph-tutor-${process.pid}`);
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it('builds the brief for a seeded learner', async () => {
    const graph = await openTestGraphDB(DIR);
    try {
      await seedDemoDataIfEmpty(graph);
      const ctx = await getRAGContext(graph, { learnerId: 'demo-alice', conceptId: 'linear-equations', query: 'why does this work?' });
      assert.ok(ctx);
      assert.equal(ctx.queryType, 'explain');
      assert.match(ctx.text, /Topic: Linear Equations/);
      assert.match(ctx.text, /Builds on: Pre-Algebra/);
      assert.ok(ctx.tokens <= MAX_CONTEXT_TOKENS);
      assert.equal(await getRAGContext(graph, { learnerId: 'nobody' }), null);
    } finally {
      await graph.close();
    }
  });
});
