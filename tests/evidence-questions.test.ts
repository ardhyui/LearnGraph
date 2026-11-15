/**
 * Direct unit tests for the quiz question bank in
 * `src/lib/evidence/service.ts` — `saveQuestion`, `deleteQuestion`,
 * `listQuestions` and `questionCounts`.
 *
 * Until now the bank was only exercised through `tests/learning-evidence.test.ts`
 * and the in-app flow (seeding, `requiresEvidence`), so the editor's save paths
 * (generated vs. explicit ids, in-place replacement, moving a question between
 * concepts, the 50-question cap) and the listing/counting queries (ordering,
 * owner isolation, jsonb normalization) were never locked down at the
 * service's own level. The module is not changed: one on-disk PGlite (same
 * migrations and dialect as the app) via `openTestWorkspaces`, with a `user`
 * row per owner because `owner_id` has a foreign key there.
 *
 * Each test owns its workspace (`owner_id`), so test order never matters.
 * `seedDemoQuestions` is not re-tested here: the demo bank is locked in
 * `tests/demo-questions.test.ts` and the seed's skip rules in
 * `tests/learning-evidence.test.ts`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { openTestWorkspaces } from './support/graph-db.ts';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { questionInput, type QuestionInput } from '../src/lib/evidence/quiz.ts';
import {
  deleteQuestion,
  EvidenceError,
  listQuestions,
  questionCounts,
  saveQuestion,
} from '../src/lib/evidence/service.ts';

type Draft = Parameters<typeof questionInput.parse>[0];

const DIR = join(tmpdir(), `learngraph-evidence-questions-${process.pid}`);

/** A `newId` that fails the test if the service generates an id on a replace. */
const noNewId = () => {
  throw new Error('newId must not be called');
};

describe('quiz question bank service on PGlite', () => {
  let ws: Awaited<ReturnType<typeof openTestWorkspaces>>;
  const graphs = new Map<string, EducationGraphDB>();

  const save = (owner: string, draft: Draft, newId: () => string = randomUUID) =>
    saveQuestion(ws.db, graphs.get(owner)!, owner, questionInput.parse(draft), newId);

  const concept = (owner: string, conceptId: string) =>
    graphs.get(owner)!.addConcept({ conceptId, name: conceptId, domain: 'mathematics' });

  before(async () => {
    ws = await openTestWorkspaces(DIR, [
      'owner-missing',
      'owner-generate',
      'owner-explicit',
      'owner-replace',
      'owner-cap',
      'owner-collision',
      'owner-delete',
      'owner-delete-other',
      'owner-order',
      'owner-order-other',
      'owner-shape',
      'owner-counts-empty',
      'owner-counts',
      'owner-counts-other',
    ]);
    for (const owner of [
      'owner-missing',
      'owner-generate',
      'owner-explicit',
      'owner-replace',
      'owner-cap',
      'owner-collision',
      'owner-delete',
      'owner-delete-other',
      'owner-order',
      'owner-order-other',
      'owner-shape',
      'owner-counts-empty',
      'owner-counts',
      'owner-counts-other',
    ]) {
      graphs.set(owner, await ws.graphFor(owner));
    }
  });

  after(async () => {
    await ws.close();
    rmSync(DIR, { recursive: true, force: true });
  });

  it('refuses to save onto a missing concept before generating an id or counting', async () => {
    let calls = 0;
    await assert.rejects(
      save(
        'owner-missing',
        { conceptId: 'absent', prompt: 'Nowhere', options: ['one', 'two'], answer: 'one' },
        () => {
          calls += 1;
          return 'never-used';
        },
      ),
      (error: unknown) =>
        error instanceof EvidenceError &&
        (error as Error).message === 'That concept no longer exists.',
    );
    assert.equal(calls, 0);
    assert.deepEqual(await questionCounts(ws.db, 'owner-missing'), {});
    assert.deepEqual(await listQuestions(ws.db, 'owner-missing'), []);
  });

  it('generates exactly one id when none is given and stores the normalized row', async () => {
    await concept('owner-generate', 'generated');
    let calls = 0;
    // The zod default supplies '', but the service makes the same guarantee for
    // a caller that passes no explanation at all.
    const withoutExplanation = {
      conceptId: 'generated',
      prompt: 'Generated question',
      options: ['one', 'two'],
      answer: 'two',
    } as QuestionInput;

    const saved = await saveQuestion(
      ws.db,
      graphs.get('owner-generate')!,
      'owner-generate',
      withoutExplanation,
      () => {
        calls += 1;
        return 'generated-id';
      },
    );

    assert.equal(calls, 1);
    assert.deepEqual(saved, {
      id: 'generated-id',
      conceptId: 'generated',
      prompt: 'Generated question',
      options: ['one', 'two'],
      answer: 'two',
      explanation: '',
    });
    assert.deepEqual(await listQuestions(ws.db, 'owner-generate', 'generated'), [saved]);
  });

  it('uses an explicit new id as it is, without generating one', async () => {
    await concept('owner-explicit', 'explicit');
    const saved = await save(
      'owner-explicit',
      { id: 'typed-id', conceptId: 'explicit', prompt: 'Typed', options: ['a', 'b'], answer: 'b' },
      noNewId,
    );
    assert.equal(saved.id, 'typed-id');
    assert.equal(saved.explanation, '');
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-explicit')).map((q) => [q.id, q.prompt]),
      [['typed-id', 'Typed']],
    );
  });

  it('replaces a question in place, and moving its concept moves the row', async () => {
    await concept('owner-replace', 'first');
    await concept('owner-replace', 'second');
    await save('owner-replace', {
      id: 'keep',
      conceptId: 'first',
      prompt: 'First version',
      options: ['a', 'b'],
      answer: 'a',
      explanation: 'old',
    });

    const updated = await save(
      'owner-replace',
      {
        id: 'keep',
        conceptId: 'first',
        prompt: 'Second version',
        options: ['x', 'y', 'z'],
        answer: 'z',
        explanation: 'new',
      },
      noNewId,
    );
    assert.deepEqual(updated, {
      id: 'keep',
      conceptId: 'first',
      prompt: 'Second version',
      options: ['x', 'y', 'z'],
      answer: 'z',
      explanation: 'new',
    });
    assert.deepEqual(await questionCounts(ws.db, 'owner-replace'), { first: 1 });
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-replace', 'first')).map((q) => [
        q.id,
        q.prompt,
        q.explanation,
      ]),
      [['keep', 'Second version', 'new']],
    );

    const moved = await save(
      'owner-replace',
      { id: 'keep', conceptId: 'second', prompt: 'Moved', options: ['m', 'n'], answer: 'n' },
      noNewId,
    );
    assert.equal(moved.conceptId, 'second');
    assert.deepEqual(await questionCounts(ws.db, 'owner-replace'), { second: 1 });
    assert.deepEqual(await listQuestions(ws.db, 'owner-replace', 'first'), []);
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-replace', 'second')).map((q) => q.id),
      ['keep'],
    );
  });

  it('caps only the create path at 50 questions per concept', async () => {
    await concept('owner-cap', 'full');
    await concept('owner-cap', 'other');
    for (let i = 0; i < 49; i += 1) {
      await save('owner-cap', {
        id: `full-${i}`,
        conceptId: 'full',
        prompt: `Question ${i}`,
        options: ['one', 'two'],
        answer: 'one',
      });
    }
    assert.equal((await questionCounts(ws.db, 'owner-cap')).full, 49);

    // The fiftieth is created through the generated-id path, so the cap counts
    // existing rows rather than trusting the caller.
    const fiftieth = await save(
      'owner-cap',
      { conceptId: 'full', prompt: 'The fiftieth', options: ['one', 'two'], answer: 'two' },
      () => 'full-49',
    );
    assert.equal(fiftieth.id, 'full-49');
    assert.deepEqual(await questionCounts(ws.db, 'owner-cap'), { full: 50 });

    await assert.rejects(
      save('owner-cap', {
        conceptId: 'full',
        prompt: 'One too many',
        options: ['one', 'two'],
        answer: 'one',
      }),
      (error: unknown) =>
        error instanceof EvidenceError &&
        (error as Error).message === 'A concept can have at most 50 questions.',
    );
    assert.deepEqual(await questionCounts(ws.db, 'owner-cap'), { full: 50 });
    assert.equal((await listQuestions(ws.db, 'owner-cap', 'full')).length, 50);

    // Rough edge, locked as it behaves today: a replacement is not an insert,
    // so an existing id may still be overwritten while the concept is full.
    const replaced = await save(
      'owner-cap',
      {
        id: 'full-0',
        conceptId: 'full',
        prompt: 'Replaced at 50',
        options: ['one', 'two'],
        answer: 'one',
      },
      noNewId,
    );
    assert.equal(replaced.prompt, 'Replaced at 50');
    assert.equal((await questionCounts(ws.db, 'owner-cap')).full, 50);

    // Same rough edge when the replacement moves a row into the full concept:
    // the concept ends up at 51 because only the create path checks the cap.
    await save('owner-cap', {
      id: 'elsewhere',
      conceptId: 'other',
      prompt: 'Elsewhere',
      options: ['one', 'two'],
      answer: 'one',
    });
    await save(
      'owner-cap',
      {
        id: 'elsewhere',
        conceptId: 'full',
        prompt: 'Moved into a full bank',
        options: ['one', 'two'],
        answer: 'two',
      },
      noNewId,
    );
    assert.deepEqual(await questionCounts(ws.db, 'owner-cap'), { full: 51 });
    assert.equal((await listQuestions(ws.db, 'owner-cap', 'full')).length, 51);
  });

  it('refuses a generated id that already exists without touching the old row', async () => {
    await concept('owner-collision', 'collision');
    await save('owner-collision', {
      id: 'taken',
      conceptId: 'collision',
      prompt: 'Original',
      options: ['one', 'two'],
      answer: 'one',
    });

    let calls = 0;
    await assert.rejects(
      save(
        'owner-collision',
        { conceptId: 'collision', prompt: 'Duplicate', options: ['one', 'two'], answer: 'two' },
        () => {
          calls += 1;
          return 'taken';
        },
      ),
      (error: unknown) =>
        error instanceof EvidenceError &&
        (error as Error).message === 'Could not create the question, please try again.',
    );
    assert.equal(calls, 1);
    assert.deepEqual(await questionCounts(ws.db, 'owner-collision'), { collision: 1 });
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-collision')).map((q) => [q.id, q.prompt]),
      [['taken', 'Original']],
    );
  });

  it('deletes exactly one owner row, keeps the other owner copy, and ignores an absent id', async () => {
    await concept('owner-delete', 'del');
    await concept('owner-delete', 'only');
    await concept('owner-delete-other', 'del');
    await save('owner-delete', {
      id: 'shared',
      conceptId: 'del',
      prompt: 'Work copy',
      options: ['one', 'two'],
      answer: 'one',
    });
    await save('owner-delete', {
      id: 'keep',
      conceptId: 'del',
      prompt: 'Kept',
      options: ['one', 'two'],
      answer: 'two',
    });
    await save('owner-delete', {
      id: 'solo',
      conceptId: 'only',
      prompt: 'Solo',
      options: ['one', 'two'],
      answer: 'one',
    });
    await save('owner-delete-other', {
      id: 'shared',
      conceptId: 'del',
      prompt: 'Other copy',
      options: ['one', 'two'],
      answer: 'one',
    });

    assert.equal(await deleteQuestion(ws.db, 'owner-delete', 'shared'), undefined);
    assert.deepEqual(await questionCounts(ws.db, 'owner-delete'), { del: 1, only: 1 });
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-delete', 'del')).map((q) => q.id),
      ['keep'],
    );
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-delete-other')).map((q) => [q.id, q.prompt]),
      [['shared', 'Other copy']],
    );

    await deleteQuestion(ws.db, 'owner-delete', 'solo');
    assert.deepEqual(await questionCounts(ws.db, 'owner-delete'), { del: 1 });

    await deleteQuestion(ws.db, 'owner-delete', 'absent');
    assert.deepEqual(await questionCounts(ws.db, 'owner-delete'), { del: 1 });
  });

  it('lists in concept, created_at, id order and filters by concept and owner', async () => {
    await concept('owner-order', 'aa');
    await concept('owner-order', 'bb');
    await concept('owner-order-other', 'aa');
    await save('owner-order', {
      id: 'z',
      conceptId: 'aa',
      prompt: 'Z',
      options: ['one', 'two'],
      answer: 'one',
    });
    await save('owner-order', {
      id: 'a',
      conceptId: 'aa',
      prompt: 'A',
      options: ['one', 'two'],
      answer: 'one',
    });
    await save('owner-order', {
      id: 'm',
      conceptId: 'aa',
      prompt: 'M',
      options: ['one', 'two'],
      answer: 'one',
    });
    await save('owner-order', {
      id: 'n',
      conceptId: 'bb',
      prompt: 'N',
      options: ['one', 'two'],
      answer: 'one',
    });
    await save('owner-order-other', {
      id: 'other',
      conceptId: 'aa',
      prompt: 'Other',
      options: ['one', 'two'],
      answer: 'one',
    });

    const rank = (id: string, at: string) =>
      sql`update quiz_questions set created_at = ${at} where owner_id = 'owner-order' and id = ${id}`.execute(
        ws.db,
      );
    // created_at deliberately disagrees with the insert order (z, a, m).
    await rank('a', '2026-01-01T00:00:01Z');
    await rank('m', '2026-01-01T00:00:02Z');
    await rank('z', '2026-01-01T00:00:03Z');

    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-order')).map((q) => [q.conceptId, q.id]),
      [
        ['aa', 'a'],
        ['aa', 'm'],
        ['aa', 'z'],
        ['bb', 'n'],
      ],
    );
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-order', 'aa')).map((q) => q.id),
      ['a', 'm', 'z'],
    );
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-order-other')).map((q) => q.id),
      ['other'],
    );
    assert.deepEqual(await listQuestions(ws.db, 'owner-order', 'zz'), []);

    // Equal timestamps fall back to the id, byte-wise.
    await sql`update quiz_questions set created_at = '2026-01-01T00:00:05Z' where owner_id = 'owner-order' and concept_id = 'aa'`.execute(
      ws.db,
    );
    assert.deepEqual(
      (await listQuestions(ws.db, 'owner-order', 'aa')).map((q) => q.id),
      ['a', 'm', 'z'],
    );
  });

  it('normalizes jsonb options to string arrays and always returns a string explanation', async () => {
    await concept('owner-shape', 'shape');
    await save('owner-shape', {
      id: 'normal',
      conceptId: 'shape',
      prompt: 'Normal',
      options: ['one', 'two'],
      answer: 'one',
      explanation: 'because',
    });
    await sql`insert into quiz_questions (owner_id, id, concept_id, prompt, options, answer)
      values ('owner-shape', 'mixed', 'shape', 'Mixed', '["one", 2, true]'::jsonb, 'one')`.execute(
      ws.db,
    );
    await sql`insert into quiz_questions (owner_id, id, concept_id, prompt, options, answer)
      values ('owner-shape', 'object', 'shape', 'Object', '{"kind":"not-an-array"}'::jsonb, 'one')`.execute(
      ws.db,
    );

    const rows = await listQuestions(ws.db, 'owner-shape', 'shape');
    assert.deepEqual(
      rows.map((q) => [q.id, q.options]),
      [
        ['normal', ['one', 'two']],
        ['mixed', ['one', '2', 'true']],
        ['object', []],
      ],
    );
    for (const row of rows) {
      assert.ok(Array.isArray(row.options));
      assert.ok(row.options.every((option) => typeof option === 'string'));
      assert.equal(typeof row.explanation, 'string');
    }
    assert.equal(rows[0].explanation, 'because');
    assert.equal(rows[1].explanation, '');
  });

  it('counts questions per concept, leaving empty concepts and workspaces out', async () => {
    assert.deepEqual(await questionCounts(ws.db, 'owner-counts-empty'), {});

    await concept('owner-counts', 'ca');
    await concept('owner-counts', 'cb');
    await concept('owner-counts', 'cc');
    await concept('owner-counts-other', 'ca');
    for (const [id, conceptId] of [
      ['ca-1', 'ca'],
      ['ca-2', 'ca'],
      ['cb-1', 'cb'],
    ] as const) {
      await save('owner-counts', {
        id,
        conceptId,
        prompt: id,
        options: ['one', 'two'],
        answer: 'one',
      });
    }
    await save('owner-counts-other', {
      id: 'other-ca',
      conceptId: 'ca',
      prompt: 'Other',
      options: ['one', 'two'],
      answer: 'one',
    });

    const counts = await questionCounts(ws.db, 'owner-counts');
    assert.deepEqual(counts, { ca: 2, cb: 1 });
    assert.deepEqual(Object.keys(counts), ['ca', 'cb']);
    assert.equal(Object.hasOwn(counts, 'cc'), false);
    assert.ok(Object.values(counts).every((n) => typeof n === 'number'));
    assert.deepEqual(await questionCounts(ws.db, 'owner-counts-other'), { ca: 1 });
  });

  it('keeps the query filters and upsert shape (static guard)', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'service.ts'),
      'utf8',
    );

    const listStart = source.indexOf('export async function listQuestions');
    const listEnd = source.indexOf('export async function questionCounts');
    assert.ok(listStart >= 0 && listEnd > listStart);
    const listSource = source.slice(listStart, listEnd);
    assert.match(listSource, /\.where\('owner_id', '=', owner\)/);
    assert.match(listSource, /\.orderBy\('concept_id'\)\.orderBy\('created_at'\)\.orderBy\('id'\)/);

    const saveStart = source.indexOf('export async function saveQuestion');
    const saveEnd = source.indexOf('export async function deleteQuestion');
    assert.ok(saveStart >= 0 && saveEnd > saveStart);
    const saveSource = source.slice(saveStart, saveEnd);
    // The concept exists first; the cap lives only in the create branch.
    const conceptCheck = saveSource.indexOf('graph.getConcept(input.conceptId)');
    const createdId = saveSource.indexOf('input.id ?? newId()');
    const createBranch = saveSource.indexOf('if (!existing)');
    const updateBranch = saveSource.indexOf('} else if (input.id === undefined)');
    const cap = saveSource.indexOf('MAX_QUESTIONS_PER_CONCEPT');
    assert.ok(conceptCheck >= 0 && conceptCheck < createdId);
    assert.ok(createBranch >= 0 && updateBranch > createBranch);
    assert.ok(cap > createBranch && cap < updateBranch);
    // Both the comparison and the message name the cap, and both live in the
    // create branch; the replace branch never consults it.
    const capMentions = [...saveSource.matchAll(/MAX_QUESTIONS_PER_CONCEPT/g)];
    assert.equal(capMentions.length, 2);
    for (const mention of capMentions) {
      assert.ok(mention.index! > createBranch && mention.index! < updateBranch);
    }
    assert.match(saveSource, /explanation: input\.explanation \?\? ''/);
    // One upsert for both create and replace, refreshing updated_at in SQL.
    assert.equal(saveSource.match(/insertInto\('quiz_questions'\)/g)?.length, 1);
    assert.match(saveSource, /\.onConflict\(/);
    assert.ok(saveSource.includes('doUpdateSet({ ...values, updated_at: sql`now()` })'));
    assert.doesNotMatch(saveSource, /updateTable/);

    const deleteStart = saveEnd;
    const deleteEnd = source.indexOf('export async function requiresEvidence');
    assert.ok(deleteEnd > deleteStart);
    const deleteSource = source.slice(deleteStart, deleteEnd);
    assert.match(deleteSource, /deleteFrom\('quiz_questions'\)/);
    assert.match(deleteSource, /\.where\('owner_id', '=', owner\)\.where\('id', '=', id\)/);
  });

  it('keeps the existing evidence-flow assertions untouched', () => {
    const source = readFileSync(join(import.meta.dirname, 'learning-evidence.test.ts'), 'utf8');
    for (const title of [
      'example questions are seeded once, only onto example concepts without a bank',
      'a concept with questions requires evidence; one without does not',
    ]) {
      assert.ok(source.includes(title), title);
    }
  });
});
