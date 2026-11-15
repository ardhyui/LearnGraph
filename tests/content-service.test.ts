/**
 * Direct unit tests for the server-side lesson content service
 * `src/lib/content/service.ts` — the content store, the example-content seed,
 * and the "lesson opened" event.
 *
 * Until now the service was only exercised through `tests/learn-in-app.test.ts`
 * (the happy path of the whole in-app lesson flow), so the seed's skip rules,
 * the per-kind normalization, the 50-item cap, the owner isolation of deletes
 * and the ordering/minutes aggregation were never locked down at the service's
 * own level. The module is not changed: one on-disk PGlite (same migrations and
 * dialect as the app) via `openTestWorkspaces`, with a `user` row per owner
 * because `owner_id` has a foreign key there. `tests/demo-content.test.ts`
 * already guards that `service.ts` is the only consumer of `DEMO_CONTENT`, so
 * that scan is deliberately not duplicated here.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTestWorkspaces } from './support/graph-db.ts';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { contentInput } from '../src/lib/content/content.ts';
import {
  contentCounts,
  contentMinutes,
  deleteContent,
  DEMO_CONTENT_FLAG,
  listContent,
  recordLessonOpened,
  saveContent,
  seedDemoContent,
} from '../src/lib/content/service.ts';
import { EvidenceError, listEvents } from '../src/lib/evidence/service.ts';
import { seedDemoDataIfEmpty } from '../src/lib/graph/seed.ts';

type Draft = Parameters<typeof contentInput.parse>[0];

const DIR = join(tmpdir(), `learngraph-content-service-${process.pid}`);
const WORK = 'owner-work';
const OTHER = 'owner-other';
const LIST = 'owner-list';

/** A `newId` that fails the test if the service generates an id for an update. */
const noNewId = () => {
  throw new Error('newId must not be called when input.id is set');
};

describe('lesson content service on PGlite', () => {
  let ws: Awaited<ReturnType<typeof openTestWorkspaces>>;
  let skip: EducationGraphDB;
  let conflict: EducationGraphDB;
  let work: EducationGraphDB;
  let other: EducationGraphDB;
  let list: EducationGraphDB;

  const save = (graph: EducationGraphDB, owner: string, draft: Draft) =>
    saveContent(ws.db, graph, owner, contentInput.parse(draft), randomUUID);

  before(async () => {
    ws = await openTestWorkspaces(DIR, ['owner-skip', 'owner-conflict', WORK, OTHER, LIST]);
    skip = await ws.graphFor('owner-skip');
    conflict = await ws.graphFor('owner-conflict');
    work = await ws.graphFor(WORK);
    other = await ws.graphFor(OTHER);
    list = await ws.graphFor(LIST);
    for (const graph of [skip, conflict]) await seedDemoDataIfEmpty(graph);
    for (const [graph, conceptId] of [
      [work, 'fractions'],
      [work, 'algebra'],
      [work, 'extra'],
      [work, 'limit'],
      [other, 'fractions'],
      [conflict, 'extra'],
      [list, 'aa'],
      [list, 'bb'],
      [list, 'mm'],
    ] as const) {
      await graph.addConcept({ conceptId, name: conceptId, domain: 'mathematics' });
    }
    await work.setLearnerProfile('learner-work', { name: 'Work Learner' });
  });

  after(async () => {
    await ws.close();
    rmSync(DIR, { recursive: true, force: true });
  });

  it('seeds only the example concepts that still qualify, once per workspace', async () => {
    // Three skip reasons: deleted, edited domain, already has its own content.
    await skip.deleteConcept('decimals');
    await skip.addConcept({ conceptId: 'fractions', domain: 'computer-science' });
    await save(skip, 'owner-skip', {
      conceptId: 'arithmetic',
      kind: 'text',
      title: 'My own explanation',
      body: 'Written by the editor.',
    });

    assert.equal(await seedDemoContent(ws.db, skip, 'owner-skip'), 9);
    assert.deepEqual(await contentCounts(ws.db, 'owner-skip'), {
      arithmetic: 1,
      'pre-algebra': 3,
      'linear-equations': 3,
      'quadratic-equations': 3,
    });
    // A skipped concept gets no demo rows at all.
    assert.deepEqual(await listContent(ws.db, 'owner-skip', 'decimals'), []);
    assert.deepEqual(await listContent(ws.db, 'owner-skip', 'fractions'), []);

    // The once-per-workspace flag is written even when concepts were skipped.
    const flag = await skip.getMeta<{ at: string; added: number }>(DEMO_CONTENT_FLAG);
    assert.equal(flag?.added, 9);
    assert.equal(Number.isNaN(Date.parse(flag!.at)), false);
    assert.equal(await seedDemoContent(ws.db, skip, 'owner-skip'), 0);
    assert.equal(
      Object.values(await contentCounts(ws.db, 'owner-skip')).reduce((sum, n) => sum + n, 0),
      10,
    );
  });

  it('returns the number of rows actually inserted (on conflict do nothing)', async () => {
    // An id collision outside the demo concepts: arithmetic has no content of
    // its own, so seeding is attempted, but the demo text row cannot be added.
    await save(conflict, 'owner-conflict', {
      id: 'demo-arithmetic-text',
      conceptId: 'extra',
      kind: 'text',
      title: 'Collision',
      body: 'Kept as it is.',
    });

    assert.equal(await seedDemoContent(ws.db, conflict, 'owner-conflict'), 17);
    assert.equal((await contentCounts(ws.db, 'owner-conflict')).arithmetic, 2);
    assert.deepEqual(
      (await listContent(ws.db, 'owner-conflict', 'arithmetic')).map((c) => c.id),
      ['demo-arithmetic-example', 'demo-arithmetic-exercise'],
    );
    // `do nothing` leaves the existing row (and its concept) untouched.
    const extra = await listContent(ws.db, 'owner-conflict', 'extra');
    assert.equal(extra.length, 1);
    assert.equal(extra[0].id, 'demo-arithmetic-text');
    assert.equal(extra[0].conceptId, 'extra');
    assert.equal((await conflict.getMeta<{ added: number }>(DEMO_CONTENT_FLAG))?.added, 17);
  });

  it('replaces an item saved with the same id instead of duplicating it', async () => {
    const first = await save(work, WORK, {
      id: 'work-item',
      conceptId: 'fractions',
      kind: 'text',
      title: 'First version',
      body: 'One.',
      position: 1,
    });
    const updated = await saveContent(
      ws.db,
      work,
      WORK,
      contentInput.parse({
        id: 'work-item',
        conceptId: 'fractions',
        kind: 'text',
        title: 'Second version',
        body: 'Two.',
        minutes: 7,
        position: 4,
      }),
      noNewId,
    );

    assert.equal(updated.id, first.id);
    assert.equal(updated.title, 'Second version');
    assert.equal(updated.minutes, 7);
    assert.equal(updated.position, 4);
    assert.equal((await contentCounts(ws.db, WORK)).fractions, 1);
    assert.deepEqual(
      (await listContent(ws.db, WORK, 'fractions')).map((c) => [c.id, c.title, c.body]),
      [['work-item', 'Second version', 'Two.']],
    );
  });

  it('normalizes solution and url per kind before writing', async () => {
    const text = await save(work, WORK, {
      id: 'n1-text',
      conceptId: 'algebra',
      kind: 'text',
      title: 'Explanation',
      body: 'The body.',
      solution: 'must be dropped',
      url: 'https://example.org/ignored',
    });
    assert.equal(text.solution, '');
    assert.equal(text.url, null);

    const exercise = await save(work, WORK, {
      id: 'n2-exercise',
      conceptId: 'algebra',
      kind: 'exercise',
      title: 'Practice',
      body: 'Try it.',
      solution: 'The answer.',
      url: 'https://example.org/also-ignored',
    });
    assert.equal(exercise.solution, 'The answer.');
    assert.equal(exercise.url, null);

    const link = await save(work, WORK, {
      id: 'n3-link',
      conceptId: 'algebra',
      kind: 'link',
      title: 'Further reading',
      url: 'https://example.org/reading',
      solution: 'must be dropped',
    });
    assert.equal(link.url, 'https://example.org/reading');
    assert.equal(link.solution, '');

    const video = await save(work, WORK, {
      id: 'n4-video',
      conceptId: 'algebra',
      kind: 'video',
      title: 'A video',
      url: 'https://example.org/video',
    });
    assert.equal(video.url, 'https://example.org/video');
    assert.equal(video.solution, '');

    // What was returned is what was stored.
    const stored = await listContent(ws.db, WORK, 'algebra');
    assert.deepEqual(
      stored.map((c) => [c.kind, c.solution, c.url]),
      [
        ['text', '', null],
        ['exercise', 'The answer.', null],
        ['link', '', 'https://example.org/reading'],
        ['video', '', 'https://example.org/video'],
      ],
    );
  });

  it('caps a concept at 50 items but still allows replacing an existing one', async () => {
    for (let i = 0; i < 49; i += 1) {
      await save(work, WORK, {
        id: `limit-${i}`,
        conceptId: 'limit',
        kind: 'text',
        title: `Item ${i}`,
        body: 'Body.',
      });
    }
    assert.equal((await contentCounts(ws.db, WORK)).limit, 49);

    const fiftieth = await save(work, WORK, {
      conceptId: 'limit',
      kind: 'text',
      title: 'The fiftieth',
      body: 'Body.',
    });
    assert.equal((await contentCounts(ws.db, WORK)).limit, 50);

    await assert.rejects(
      save(work, WORK, {
        conceptId: 'limit',
        kind: 'text',
        title: 'One too many',
        body: 'Body.',
      }),
      (error: unknown) =>
        error instanceof EvidenceError && /at most 50/.test((error as Error).message),
    );
    assert.equal((await contentCounts(ws.db, WORK)).limit, 50);

    // Replacing an item of the full concept is not adding a new one.
    const replaced = await saveContent(
      ws.db,
      work,
      WORK,
      contentInput.parse({
        id: fiftieth.id,
        conceptId: 'limit',
        kind: 'text',
        title: 'Replaced at 50',
        body: 'Body.',
      }),
      noNewId,
    );
    assert.equal(replaced.id, fiftieth.id);
    assert.equal(replaced.title, 'Replaced at 50');
    assert.equal((await contentCounts(ws.db, WORK)).limit, 50);
  });

  it('deletes exactly one item of the owner', async () => {
    await save(work, WORK, {
      id: 'shared',
      conceptId: 'extra',
      kind: 'text',
      title: 'Work copy',
      body: 'Work.',
    });
    await save(other, OTHER, {
      id: 'shared',
      conceptId: 'fractions',
      kind: 'text',
      title: 'Other copy',
      body: 'Other.',
    });

    await deleteContent(ws.db, WORK, 'shared');
    assert.deepEqual(await listContent(ws.db, WORK, 'extra'), []);
    const otherCopy = await listContent(ws.db, OTHER, 'fractions');
    assert.equal(otherCopy.length, 1);
    assert.equal(otherCopy[0].id, 'shared');
    assert.equal(otherCopy[0].title, 'Other copy');
  });

  it('lists content in concept, position, id order and filters by concept', async () => {
    await save(list, LIST, { id: 'n', conceptId: 'bb', kind: 'text', title: 'B', body: 'B.' });
    await save(list, LIST, {
      id: 'z',
      conceptId: 'aa',
      kind: 'text',
      title: 'Z',
      body: 'Z.',
      position: 2,
    });
    await save(list, LIST, {
      id: 'a',
      conceptId: 'aa',
      kind: 'text',
      title: 'A',
      body: 'A.',
      position: 2,
    });
    await save(list, LIST, {
      id: 'm',
      conceptId: 'aa',
      kind: 'text',
      title: 'M',
      body: 'M.',
      position: 0,
    });

    assert.deepEqual(
      (await listContent(ws.db, LIST)).map((c) => [c.conceptId, c.position, c.id]),
      [
        ['aa', 0, 'm'],
        ['aa', 2, 'a'],
        ['aa', 2, 'z'],
        ['bb', 0, 'n'],
      ],
    );
    assert.deepEqual(
      (await listContent(ws.db, LIST, 'aa')).map((c) => c.id),
      ['m', 'a', 'z'],
    );
    assert.deepEqual(await listContent(ws.db, LIST, 'zz'), []);
  });

  it('sums explicit minutes with the per-kind fallback', async () => {
    await save(list, LIST, {
      id: 'mm-text',
      conceptId: 'mm',
      kind: 'text',
      title: 'Five minutes',
      body: 'Text.',
      minutes: 5,
    });
    await save(list, LIST, {
      id: 'mm-example',
      conceptId: 'mm',
      kind: 'example',
      title: 'Fallback example',
      body: 'Example.',
    });
    await save(list, LIST, {
      id: 'mm-link',
      conceptId: 'mm',
      kind: 'link',
      title: 'Link without minutes',
      url: 'https://example.org/link',
    });
    await save(list, LIST, {
      id: 'mm-video',
      conceptId: 'mm',
      kind: 'video',
      title: 'Video without minutes',
      url: 'https://example.org/video',
    });
    await save(list, LIST, {
      id: 'mm-exercise',
      conceptId: 'mm',
      kind: 'exercise',
      title: 'Fallback exercise',
      body: 'Exercise.',
      solution: 'Answer.',
    });
    await save(list, LIST, {
      id: 'mm-link-minutes',
      conceptId: 'mm',
      kind: 'link',
      title: 'Link with minutes',
      url: 'https://example.org/link-2',
      minutes: 4,
    });

    const minutes = await contentMinutes(ws.db, LIST);
    // 5 explicit + 2 fallback example + 0 fallback link + 2 fallback video
    // + 2 fallback exercise + 4 explicit link.
    assert.equal(minutes.mm, 15);
    assert.equal(minutes.zz, undefined);
    // The four order-test texts have no minutes: three on aa, one on bb.
    assert.equal(minutes.aa, 6);
    assert.equal(minutes.bb, 2);
  });

  it('refuses to log a lesson when the learner or concept is gone', async () => {
    const strategy = { preference: 'explain-first' as const, source: 'default' as const };
    await assert.rejects(
      recordLessonOpened(ws.db, work, WORK, {
        learnerId: 'missing-learner',
        conceptId: 'fractions',
        strategy,
        order: ['text'],
      }),
      (error: unknown) =>
        error instanceof EvidenceError && /no longer exists/.test((error as Error).message),
    );
    assert.deepEqual(await listEvents(ws.db, WORK), []);

    await assert.rejects(
      recordLessonOpened(ws.db, work, WORK, {
        learnerId: 'learner-work',
        conceptId: 'missing-concept',
        strategy,
        order: ['text'],
      }),
      (error: unknown) =>
        error instanceof EvidenceError && /no longer exists/.test((error as Error).message),
    );
    assert.deepEqual(await listEvents(ws.db, WORK), []);
  });

  it('writes normalized values through a single values object (static guard)', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'src', 'lib', 'content', 'service.ts'),
      'utf8',
    );
    const start = source.indexOf('export async function saveContent');
    const end = source.indexOf('export async function deleteContent');
    assert.ok(start >= 0 && end > start);
    const saveSource = source.slice(start, end);

    assert.match(saveSource, /const values = \{/);
    assert.equal(saveSource.match(/\bsolution:/g)?.length, 1);
    assert.equal(saveSource.match(/\burl:/g)?.length, 1);
    assert.match(saveSource, /solution: input\.kind === 'exercise'/);
    assert.match(saveSource, /url: input\.kind === 'link' \|\| input\.kind === 'video'/);
    // One insert statement with the same object for insert, conflict update and
    // the returned value — no separate SQL branch per kind.
    assert.equal(saveSource.match(/insertInto\('content_items'\)/g)?.length, 1);
    assert.equal(saveSource.match(/\.\.\.values/g)?.length, 3);
    assert.doesNotMatch(saveSource, /updateTable/);
  });

  it('keeps the existing in-app flow tests untouched', () => {
    // The four service assertions of the whole-flow suite stay in place; this
    // file adds direct coverage, it does not move them.
    const source = readFileSync(join(import.meta.dirname, 'learn-in-app.test.ts'), 'utf8');
    for (const title of [
      'seeds the example lessons once, per workspace',
      'saves content only for an existing concept of the same account',
      'logs the presentation used when a lesson is opened',
      'deleting a concept deletes its lesson content',
    ]) {
      assert.ok(source.includes(title), title);
    }
  });
});
