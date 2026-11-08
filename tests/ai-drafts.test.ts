/**
 * Roadmap M5: AI drafts are validated before a person sees them, never saved
 * on their own, saved atomically once approved, and every decision is kept
 * to measure the share of AI drafts approved. No model is called here.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cleanQuestionDrafts, questionPrompt, slugId, validateCurriculumDraft } from '../src/lib/ai/drafts.ts';
import { draftApproval, recordDraftReview } from '../src/lib/ai/reviews.ts';
import { draftCurriculum, draftQuestions, type DraftClient } from '../src/lib/ai/service.ts';
import { openTestWorkspaces } from './support/graph-db.ts';

describe('AI drafts (pure)', () => {
  it('keeps only valid, new questions', () => {
    const { valid, rejected } = cleanQuestionDrafts(
      [
        { prompt: 'What is 1/2 + 1/4?', options: ['3/4', '2/6', '1/6'], answer: '3/4', explanation: 'Common denominator.' },
        { prompt: 'Answer not among options', options: ['a', 'b'], answer: 'c', explanation: '' },
        { prompt: 'Only one option', options: ['a'], answer: 'a', explanation: '' },
        { prompt: 'What is 1/2 + 1/4?', options: ['3/4', '1'], answer: '3/4', explanation: '' },
        { prompt: 'An existing question', options: ['x', 'y'], answer: 'x', explanation: '' },
      ],
      'fractions',
      ['An existing question'],
    );
    assert.deepEqual(valid.map((q) => q.prompt), ['What is 1/2 + 1/4?']);
    assert.equal(valid[0].conceptId, 'fractions');
    assert.equal(rejected, 4);
    assert.match(questionPrompt({ name: 'Fractions', description: 'Parts of a whole', domain: 'mathematics' }, 'misconception', 4, ['An existing question']), /misconceptions[\s\S]*An existing question/);
  });

  it('cleans curriculum ids, drops unknown links and loops, and never claims existing concepts', () => {
    const plan = validateCurriculumDraft(
      {
        concepts: [
          { id: 'Mean & Median', name: 'Mean and median', description: 'Averages', difficulty: 2.4, bloomLevel: 'understand' },
          { id: 'variance', name: 'Variance', description: '', difficulty: 14, bloomLevel: 'apply' },
          { id: 'variance', name: 'Variance again', description: '', difficulty: 3, bloomLevel: 'apply' },
          { id: 'fractions', name: 'Fractions', description: '', difficulty: 2, bloomLevel: 'remember' },
        ],
        prerequisites: [
          { from: 'Mean & Median', to: 'variance', reason: 'Variance uses the mean.' },
          { from: 'variance', to: 'Mean & Median', reason: 'loop' },
          { from: 'fractions', to: 'Mean & Median', reason: 'ok' },
          { from: 'ghost', to: 'variance', reason: 'unknown' },
        ],
      },
      'Statistics 101',
      { conceptIds: new Set(['fractions']), edges: [] },
    );
    assert.equal(slugId('Mean & Median'), 'mean-median');
    assert.deepEqual(plan.concepts.map((c) => [c.conceptId, c.difficulty, c.exists, c.domain]), [
      ['mean-median', 2, false, 'statistics-101'],
      ['variance', 10, false, 'statistics-101'],
      ['fractions', 2, true, 'statistics-101'],
    ]);
    assert.deepEqual(plan.edges.map((e) => `${e.from}>${e.to}`), ['mean-median>variance', 'fractions>mean-median']);
    assert.equal(plan.problems.length, 3, plan.problems.join(' | '));
  });

  it('asks the model for structured drafts with refusal fallback (stand-in client)', async () => {
    const seen: any[] = [];
    const client: DraftClient = {
      beta: { messages: { parse: (async (params: unknown) => {
        seen.push(params);
        return { stop_reason: 'end_turn', parsed_output: { questions: [{ prompt: 'p', options: ['a', 'b'], answer: 'a', explanation: 'e' }] } };
      }) as never } },
    };
    const drafts = await draftQuestions(client, { name: 'Fractions', description: '', domain: 'mathematics' }, 'quick-check', 4, []);
    assert.equal(drafts.length, 1);
    assert.equal(seen[0].model, 'claude-opus-5-5');
    assert.equal(seen[0].fallbacks, 'default');
    assert.equal(seen[0].output_config.format.type, 'json_schema');
    // A course PDF goes along as a document block, before the instructions.
    await draftCurriculum(
      { beta: { messages: { parse: (async (params: unknown) => {
        seen.push(params);
        return { stop_reason: 'end_turn', parsed_output: { concepts: [], prerequisites: [] } };
      }) as never } } },
      '',
      'Statistics',
      { base64: 'JVBERi0x' },
    );
    const content = seen[1].messages[0].content;
    assert.equal(content[0].type, 'document');
    assert.equal(content[0].source.media_type, 'application/pdf');
    assert.equal(content[1].type, 'text');
    const refusing: DraftClient = { beta: { messages: { parse: (async () => ({ stop_reason: 'refusal', parsed_output: null })) as never } } };
    await assert.rejects(draftQuestions(refusing, { name: 'x', description: '', domain: 'd' }, 'mastery', 2, []), /declined/);
  });
});

describe('AI drafts on PGlite', () => {
  const DIR = path.join(os.tmpdir(), `learngraph-ai-drafts-${process.pid}`);
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it('saves a reviewed curriculum in one go and measures what was kept', async () => {
    const ws = await openTestWorkspaces(DIR, ['owner-a', 'owner-b']);
    try {
      const graph = await ws.graphFor('owner-a');
      const saved = await graph.addConceptsAndEdges(
        [
          { conceptId: 'mean', name: 'Mean', domain: 'statistics' },
          { conceptId: 'variance', name: 'Variance', domain: 'statistics' },
        ],
        [{ from: 'mean', to: 'variance', reason: 'Variance uses the mean.' }],
      );
      assert.deepEqual(saved, { concepts: 2, edges: 1 });
      assert.deepEqual((await graph.listConceptsByDomain('statistics')).map((c) => c.conceptId).sort(), ['mean', 'variance']);
      assert.equal((await graph.getPrerequisites('variance'))[0].from, 'mean');

      await recordDraftReview(ws.db, 'owner-a', { kind: 'question', decision: 'approved', draft: { prompt: 'a' } });
      await recordDraftReview(ws.db, 'owner-a', { kind: 'question', decision: 'edited', draft: { prompt: 'b' }, final: { prompt: 'b2' } });
      await recordDraftReview(ws.db, 'owner-a', { kind: 'question', decision: 'discarded', draft: { prompt: 'c' } });
      await recordDraftReview(ws.db, 'owner-a', { kind: 'curriculum', decision: 'edited', proposed: 5, accepted: 4, draft: {} });
      assert.deepEqual(await draftApproval(ws.db, 'owner-a', 'question'), { proposed: 3, accepted: 2, unchanged: 1, rate: 2 / 3 });
      assert.deepEqual(await draftApproval(ws.db, 'owner-a', 'curriculum'), { proposed: 5, accepted: 4, unchanged: 0, rate: 0.8 });
      assert.equal((await draftApproval(ws.db, 'owner-b', 'question')).proposed, 0);
    } finally {
      await ws.close();
    }
  });
});
