/**
 * Roadmap M2 "Belajar di dalam aplikasi": lesson content per concept, the
 * learner's format preference (Phase 6A: "Start session → content matches
 * your style"), safe text rendering, and today's session plan.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sql } from 'kysely';
import { openTestWorkspaces } from './support/graph-db.ts';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import {
  contentInput,
  determinePresentationStrategy,
  lessonMinutes,
  orderContent,
  parseRichText,
  withFormatPreference,
  type ContentItem,
} from '../src/lib/content/content.ts';
import { DEMO_CONTENT } from '../src/lib/content/demo-content.ts';
import {
  contentCounts,
  listContent,
  recordLessonOpened,
  saveContent,
  seedDemoContent,
} from '../src/lib/content/service.ts';
import { listEvents } from '../src/lib/evidence/service.ts';
import { buildSessionPlan, lessonSitting, sessionPacing } from '../src/lib/session.ts';
import { demoConcepts } from '../src/lib/demo-data.ts';
import { seedDemoDataIfEmpty } from '../src/lib/graph/seed.ts';

const item = (id: string, kind: ContentItem['kind'], position = 0) => ({ id, kind, position });

describe('lesson content (pure)', () => {
  it('accepts lesson items and only https links', () => {
    const base = { conceptId: 'fractions', kind: 'text', title: 'Intro', body: 'Halves and quarters.' };
    assert.equal(contentInput.safeParse(base).success, true);
    assert.equal(contentInput.safeParse({ ...base, body: '  ' }).success, false);
    const link = { conceptId: 'fractions', kind: 'link', title: 'More', url: 'https://example.org/fractions' };
    assert.equal(contentInput.safeParse(link).success, true);
    for (const url of ['http://example.org', 'javascript:alert(1)', 'data:text/html,x', '']) {
      assert.equal(contentInput.safeParse({ ...link, url }).success, false, url);
    }
    assert.equal(contentInput.safeParse({ ...base, conceptId: 'a:b' }).success, false);
    assert.equal(contentInput.safeParse({ ...base, minutes: 0 }).success, false);
  });

  it('Phase 6A: a session leads with the format the learner chose, else the one their profile suggests', () => {
    const items = [item('t', 'text'), item('e', 'example'), item('x', 'exercise'), item('l', 'link')];
    const chosen = determinePresentationStrategy({ tags: ['focus:mathematics', 'format:practice-first'] });
    assert.deepEqual(chosen, { preference: 'practice-first', source: 'chosen' });
    assert.deepEqual(orderContent(items, chosen.preference).map((i) => i.kind), ['exercise', 'example', 'text', 'link']);
    const visual = determinePresentationStrategy({
      learningStyle: { primary: 'visual', socialPreference: 'solo', pacePreference: 'structured', feedbackPreference: 'immediate' },
    });
    assert.deepEqual(visual, { preference: 'example-first', source: 'suggested' });
    assert.equal(orderContent(items, visual.preference)[0].kind, 'example');
    assert.deepEqual(determinePresentationStrategy(null), { preference: 'explain-first', source: 'default' });
    // A bogus tag is ignored; the editor's order breaks ties.
    assert.equal(determinePresentationStrategy({ tags: ['format:nonsense'] }).source, 'default');
    assert.deepEqual(orderContent([item('b', 'text', 2), item('a', 'text', 1)], 'explain-first').map((i) => i.id), ['a', 'b']);
  });

  it('stores the format choice as a tag without touching other tags', () => {
    assert.deepEqual(withFormatPreference(['focus:mathematics', 'format:explain-first'], 'example-first'), [
      'focus:mathematics',
      'format:example-first',
    ]);
    assert.deepEqual(withFormatPreference(['focus:mathematics', 'format:explain-first'], null), ['focus:mathematics']);
  });

  it('turns the text markup into blocks and leaves HTML as plain text', () => {
    const blocks = parseRichText('First **bold** and `code`.\n\n- one\n- two <b>x</b>\nAfter list\n\n<script>alert(1)</script>');
    assert.deepEqual(blocks[0], {
      type: 'p',
      parts: [{ text: 'First ' }, { text: 'bold', bold: true }, { text: ' and ' }, { text: 'code', code: true }, { text: '.' }],
    });
    assert.deepEqual(blocks[1], { type: 'ul', items: [[{ text: 'one' }], [{ text: 'two <b>x</b>' }]] });
    assert.deepEqual(blocks[2], { type: 'p', parts: [{ text: 'After list' }] });
    assert.deepEqual(blocks[3], { type: 'p', parts: [{ text: '<script>alert(1)</script>' }] });
    assert.deepEqual(parseRichText('  \n\n '), []);
  });

  it('ships a complete example subject: every mathematics concept has an explanation, an example and practice', () => {
    const math = demoConcepts.filter((c) => c.domain === 'mathematics').map((c) => c.id.replace('concept:', ''));
    assert.equal(math.length, 6);
    for (const id of math) {
      const kinds = DEMO_CONTENT.filter((c) => c.conceptId === id).map((c) => c.kind).sort();
      assert.deepEqual(kinds, ['example', 'exercise', 'text'], id);
    }
    for (const c of DEMO_CONTENT) {
      assert.equal(contentInput.safeParse(c).success, true, c.id);
      if (c.kind === 'exercise') assert.ok(c.solution.trim(), `${c.id} has no solution`);
    }
    assert.equal(new Set(DEMO_CONTENT.map((c) => c.id)).size, DEMO_CONTENT.length);
    // A new learner gets through a lesson in a few minutes (Roadmap M2: < 5 min to a first concept with its quiz).
    assert.ok(lessonMinutes(DEMO_CONTENT.filter((c) => c.conceptId === 'arithmetic' && c.kind !== 'exercise')) <= 5);
  });
});

describe("today's session plan", () => {
  const reviews = ['r1', 'r2', 'r3'].map((id) => ({ conceptId: id, name: id }));
  const next = [
    { conceptId: 'n1', name: 'n1', minutes: 30 },
    { conceptId: 'n2', name: 'n2', minutes: 8 },
  ];

  it('puts due reviews before new lessons and fits the time available', () => {
    // 3 reviews (9 min); n1's 20-minute sitting would need a break and run past
    // 30 minutes, so the shorter n2 fits instead and n1 waits for later.
    const plan = buildSessionPlan({ minutes: 30, reviews, next });
    assert.deepEqual(plan.steps.map((s) => (s.kind === 'break' ? 'break' : s.conceptId)), ['r1', 'r2', 'r3', 'n2']);
    assert.ok(plan.plannedMinutes <= 30, `${plan.plannedMinutes}`);
    assert.deepEqual(plan.left, { reviews: 0, next: 1 });
    const longer = buildSessionPlan({ minutes: 45, reviews, next });
    assert.deepEqual(longer.steps.map((s) => (s.kind === 'break' ? 'break' : s.conceptId)), ['r1', 'r2', 'r3', 'break', 'n1']);
    assert.equal(lessonSitting(30), 20);
    assert.equal(lessonSitting(null), 10);
  });

  it('suggests breaks from attention span and pace', () => {
    assert.deepEqual(sessionPacing('short', 'structured'), { focusMinutes: 15, breakMinutes: 5 });
    assert.deepEqual(sessionPacing(undefined, 'intensive'), { focusMinutes: 38, breakMinutes: 3 });
    const short = buildSessionPlan({ minutes: 60, reviews, next, attentionSpan: 'short' });
    assert.ok(short.steps.some((s) => s.kind === 'break'), JSON.stringify(short.steps));
    // No break before the first step or after the last one.
    assert.notEqual(short.steps[0].kind, 'break');
    assert.notEqual(short.steps.at(-1)!.kind, 'break');
    const long = buildSessionPlan({ minutes: 60, reviews, next, attentionSpan: 'long' });
    assert.equal(long.steps.filter((s) => s.kind === 'break').length, 0);
  });

  it('always plans the first step, even when the session is shorter', () => {
    const plan = buildSessionPlan({ minutes: 5, reviews: [], next });
    assert.equal(plan.steps.length, 1);
    assert.equal(buildSessionPlan({ minutes: 30, reviews: [], next: [] }).steps.length, 0);
  });
});

describe('lesson content on Postgres (PGlite)', () => {
  const DIR = path.join(os.tmpdir(), `learngraph-content-${process.pid}`);
  let ws: Awaited<ReturnType<typeof openTestWorkspaces>>;
  let alice: EducationGraphDB;
  let bob: EducationGraphDB;

  before(async () => {
    ws = await openTestWorkspaces(DIR, ['owner-alice', 'owner-bob']);
    alice = await ws.graphFor('owner-alice');
    bob = await ws.graphFor('owner-bob');
    await seedDemoDataIfEmpty(alice);
    await bob.addConcept({ conceptId: 'fractions', name: 'Fractions', domain: 'mathematics' });
  });
  after(async () => {
    await ws.close();
    fs.rmSync(DIR, { recursive: true, force: true });
  });

  it('seeds the example lessons once, per workspace', async () => {
    assert.equal(await seedDemoContent(ws.db, alice, 'owner-alice'), 18);
    assert.equal(await seedDemoContent(ws.db, alice, 'owner-alice'), 0);
    assert.equal(Object.keys(await contentCounts(ws.db, 'owner-alice')).length, 6);
    assert.deepEqual(await listContent(ws.db, 'owner-bob'), []);
  });

  it('saves content only for an existing concept of the same account', async () => {
    const input = contentInput.parse({ conceptId: 'fractions', kind: 'text', title: 'Mine', body: 'Bob writes this.' });
    const saved = await saveContent(ws.db, bob, 'owner-bob', input, randomUUID);
    assert.equal((await listContent(ws.db, 'owner-bob', 'fractions'))[0].id, saved.id);
    assert.equal((await listContent(ws.db, 'owner-alice', 'fractions')).some((c) => c.id === saved.id), false);
    await assert.rejects(
      saveContent(ws.db, bob, 'owner-bob', { ...input, conceptId: 'algebra' }, randomUUID),
      /no longer exists/,
    );
    // The database refuses non-https links even past the validator.
    await assert.rejects(
      sql`insert into content_items (owner_id, id, concept_id, kind, title, url) values ('owner-bob', 'x', 'fractions', 'link', 't', 'javascript:alert(1)')`.execute(ws.db),
    );
  });

  it('logs the presentation used when a lesson is opened', async () => {
    await recordLessonOpened(ws.db, alice, 'owner-alice', {
      learnerId: 'demo-alice',
      conceptId: 'fractions',
      strategy: { preference: 'example-first', source: 'chosen' },
      order: ['example', 'text', 'exercise'],
    });
    const events = await listEvents(ws.db, 'owner-alice', { learnerId: 'demo-alice' });
    const lesson = events.find((e) => e.kind === 'lesson')!;
    assert.equal(lesson.outcome, 'opened');
    assert.deepEqual(lesson.detail, { format: 'example-first', formatSource: 'chosen', order: ['example', 'text', 'exercise'] });
    assert.deepEqual(await listEvents(ws.db, 'owner-bob'), []);
  });

  it('deleting a concept deletes its lesson content', async () => {
    await alice.deleteConcept('decimals');
    assert.equal((await contentCounts(ws.db, 'owner-alice')).decimals, undefined);
  });
});
