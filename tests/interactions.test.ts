/**
 * Interaction history on a knowledge state: pure sanitising for data saved
 * before interactions were written, and the self-report path that finally
 * records "I've got it" / "I remembered it" as a lesson or review entry.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import {
  MAX_INTERACTIONS,
  MAX_INTERACTION_NOTES,
  sanitizeInteractions,
} from '../src/lib/graph/interactions.ts';
import { knowledgeStateInput } from '../src/lib/graph/rpc-schemas.ts';
import type { KnowledgeState } from '../src/lib/graph/types.ts';
import { EvidenceRequiredError, recordSelfReport } from '../src/lib/evidence/service.ts';
import { applyReviewOutcome, applyStudyOutcome } from '../src/lib/study.ts';
import { openTestWorkspaces } from './support/graph-db.ts';

const TS = '2026-11-14T03:00:00.000Z';

describe('sanitizeInteractions', () => {
  it('keeps valid entries in order, strips unknown fields and trims long notes', () => {
    const input = [
      { timestamp: TS, type: 'lesson', duration: 12 },
      { timestamp: TS, type: 'quiz', duration: 0, score: 80, bloomLevel: 3, notes: 'x'.repeat(600), extra: 'drop' },
      { timestamp: '2026-11-13T00:00:00Z', type: 'practice', duration: 2 },
      { timestamp: '2026-11-12T00:00:00Z', type: 'review', duration: 1 },
    ];
    const out = sanitizeInteractions(input);
    assert.equal(out.length, 4);
    assert.deepEqual(out[0], { timestamp: TS, type: 'lesson', duration: 12 });
    assert.deepEqual(out[1], {
      timestamp: TS,
      type: 'quiz',
      duration: 0,
      score: 80,
      bloomLevel: 3,
      notes: 'x'.repeat(MAX_INTERACTION_NOTES),
    });
    assert.equal('extra' in out[1], false);
    assert.deepEqual(
      out.map((entry) => entry.type),
      ['lesson', 'quiz', 'practice', 'review'],
    );
  });

  it('returns an empty list for absent or non-array values', () => {
    for (const value of [undefined, null, 'interactions', 42, { timestamp: TS }, []]) {
      assert.deepEqual(sanitizeInteractions(value), [], String(value));
    }
  });

  it('drops entries with a broken required or optional field', () => {
    const base = { timestamp: TS, type: 'lesson', duration: 1 };
    const broken = [
      { ...base, timestamp: 'not a date' },
      { ...base, timestamp: 12 },
      { ...base, timestamp: null },
      { ...base, type: 'homework' },
      { ...base, type: 'constructor' },
      { ...base, type: 1 },
      { ...base, duration: -1 },
      { ...base, duration: Number.NaN },
      { ...base, duration: Number.POSITIVE_INFINITY },
      { ...base, duration: '1' },
      { ...base, score: 101 },
      { ...base, score: -1 },
      { ...base, score: Number.NaN },
      { ...base, score: '80' },
      { ...base, bloomLevel: 0 },
      { ...base, bloomLevel: 7 },
      { ...base, bloomLevel: 2.5 },
      { ...base, bloomLevel: '3' },
      { ...base, notes: 42 },
      { ...base, notes: null },
      null,
      [],
      'x',
    ];
    assert.deepEqual(sanitizeInteractions(broken), []);
  });

  it('accepts the field boundaries of the server schema', () => {
    const out = sanitizeInteractions([
      { timestamp: TS, type: 'quiz', duration: 0, score: 0, bloomLevel: 1, notes: '' },
      { timestamp: TS, type: 'practice', duration: 90, score: 100, bloomLevel: 6 },
    ]);
    assert.deepEqual(out, [
      { timestamp: TS, type: 'quiz', duration: 0, score: 0, bloomLevel: 1, notes: '' },
      { timestamp: TS, type: 'practice', duration: 90, score: 100, bloomLevel: 6 },
    ]);
    assert.equal(knowledgeStateInput.safeParse({ interactions: out }).success, true);
  });

  it('keeps only the last 1000 entries', () => {
    const start = Date.UTC(2026, 0, 1);
    const many = Array.from({ length: MAX_INTERACTIONS + 5 }, (_, i) => ({
      timestamp: new Date(start + i * 1000).toISOString(),
      type: 'lesson',
      duration: i,
    }));
    const out = sanitizeInteractions(many);
    assert.equal(out.length, MAX_INTERACTIONS);
    assert.equal(out[0].duration, 5);
    assert.equal(out.at(-1)?.duration, MAX_INTERACTIONS + 4);
    assert.equal(out.at(-1)?.timestamp, many.at(-1)?.timestamp);
  });
});

const DIR = path.join(os.tmpdir(), `learngraph-interactions-${process.pid}`);

describe('recordSelfReport interaction history (PGlite)', () => {
  let ws: Awaited<ReturnType<typeof openTestWorkspaces>>;
  let graph: EducationGraphDB;
  let now: Date;

  /** Drop this concept's state so each test starts from a known point. */
  async function fresh(conceptId: string, patch: Partial<KnowledgeState> = {}) {
    await graph.deleteKnowledgeState('kid', conceptId);
    if (Object.keys(patch).length > 0) await graph.setKnowledgeState('kid', conceptId, patch);
  }

  before(async () => {
    fs.rmSync(DIR, { recursive: true, force: true });
    ws = await openTestWorkspaces(DIR, ['owner-a', 'owner-b']);
    graph = await ws.graphFor('owner-a');
    const other = await ws.graphFor('owner-b');
    for (const g of [graph, other]) {
      await g.setLearnerProfile('kid', { name: 'Kid' });
      for (const conceptId of ['add', 'mul', 'sub', 'div', 'neg']) {
        await g.addConcept({ conceptId, name: conceptId.toUpperCase(), domain: 'math' });
      }
      await g.addConcept({ conceptId: 'jp', name: 'Japanese', domain: 'japanese', evidenceRequired: true });
    }
    now = new Date('2026-11-14T03:00:00.000Z');
  });

  after(async () => {
    await ws.close();
    fs.rmSync(DIR, { recursive: true, force: true });
  });

  it('"got it" appends one lesson entry and keeps mastery/schedule rules', async () => {
    await fresh('add');
    const result = await recordSelfReport(
      ws.db,
      graph,
      'owner-a',
      { learnerId: 'kid', conceptId: 'add', outcome: 'got-it' },
      now,
    );
    const state = await graph.getKnowledgeState('kid', 'add');
    const expected = applyStudyOutcome(null, 'got-it', now);
    assert.equal(result.mastery, expected.mastery);
    assert.equal(state?.mastery, expected.mastery);
    assert.equal(state?.lastReviewed, expected.lastReviewed);
    assert.equal(state?.masterySource, 'self_report');
    assert.deepEqual(state?.interactions, [{ timestamp: now.toISOString(), type: 'lesson', duration: 0 }]);
  });

  it('"remembered" and "forgot" append one review entry each', async () => {
    const learnedAt = '2026-10-01T00:00:00.000Z';
    for (const [conceptId, outcome] of [
      ['mul', 'remembered'],
      ['sub', 'forgot'],
    ] as const) {
      await fresh(conceptId, {
        mastery: 80,
        reviewCount: 2,
        retentionStrength: 0.6,
        lastReviewed: learnedAt,
      });
      const prior = await graph.getKnowledgeState('kid', conceptId);
      await recordSelfReport(ws.db, graph, 'owner-a', { learnerId: 'kid', conceptId, outcome }, now);
      const state = await graph.getKnowledgeState('kid', conceptId);
      const expected = applyReviewOutcome(prior, outcome, now);
      assert.equal(state?.mastery, expected.mastery, outcome);
      assert.equal(state?.reviewCount, expected.reviewCount, outcome);
      assert.deepEqual(state?.interactions, [{ timestamp: now.toISOString(), type: 'review', duration: 0 }]);
    }
  });

  it('"snooze" and "unsnooze" never add or rewrite interactions', async () => {
    const old = { timestamp: '2026-11-01T00:00:00.000Z', type: 'review' as const, duration: 5 };
    await fresh('div', {
      mastery: 60,
      reviewCount: 1,
      retentionStrength: 0.5,
      lastReviewed: '2026-10-01T00:00:00.000Z',
      interactions: [old],
    });
    await recordSelfReport(
      ws.db,
      graph,
      'owner-a',
      { learnerId: 'kid', conceptId: 'div', outcome: 'snooze' },
      now,
    );
    assert.deepEqual((await graph.getKnowledgeState('kid', 'div'))?.interactions, [old]);
    await recordSelfReport(
      ws.db,
      graph,
      'owner-a',
      { learnerId: 'kid', conceptId: 'div', outcome: 'unsnooze' },
      now,
    );
    assert.deepEqual((await graph.getKnowledgeState('kid', 'div'))?.interactions, [old]);
  });

  it('keeps valid old entries, drops broken ones, then appends the new report', async () => {
    const first = { timestamp: '2026-11-01T00:00:00.000Z', type: 'lesson' as const, duration: 10 };
    const last = {
      timestamp: '2026-11-10T00:00:00.000Z',
      type: 'practice' as const,
      duration: 3,
      score: 77,
      bloomLevel: 2 as const,
      notes: 'old note',
    };
    await fresh('neg', {
      interactions: [
        first,
        { timestamp: 'not a date', type: 'lesson', duration: 1 },
        null,
        { timestamp: '2026-11-05T00:00:00.000Z', type: 'quiz', duration: 1, score: 200 },
        last,
      ] as unknown as KnowledgeState['interactions'],
    });
    await recordSelfReport(
      ws.db,
      graph,
      'owner-a',
      { learnerId: 'kid', conceptId: 'neg', outcome: 'started' },
      now,
    );
    assert.deepEqual((await graph.getKnowledgeState('kid', 'neg'))?.interactions, [
      first,
      last,
      { timestamp: now.toISOString(), type: 'lesson', duration: 0 },
    ]);
  });

  it('still refuses a self-report on a quiz-checked concept (D5) without writing history', async () => {
    await fresh('jp');
    await assert.rejects(
      recordSelfReport(
        ws.db,
        graph,
        'owner-a',
        { learnerId: 'kid', conceptId: 'jp', outcome: 'got-it' },
        now,
      ),
      EvidenceRequiredError,
    );
    assert.equal(await graph.getKnowledgeState('kid', 'jp'), null);
  });
});
