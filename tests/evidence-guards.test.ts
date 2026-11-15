/**
 * Direct unit tests for the remaining guards of `src/lib/evidence/service.ts` —
 * `requiresEvidence`, `guardGraphCall` and `seedDemoQuestions`.
 *
 * Until now these were only exercised through `tests/learning-evidence.test.ts`
 * (one refusal each) and indirectly through the quiz and self-report paths.
 * Here every answer of the three functions is locked at the service's own
 * level: which concepts count as quiz-checked (own bank or the
 * `evidenceRequired` flag, per workspace), which `setKnowledgeState` patches
 * pass untouched (other methods, the two scheduling-only fields, empty or
 * undefined-only patches), the exact refusal message per concept domain, the
 * `masterySource: 'manual'` stamp on free concepts, and every skip and
 * conflict rule of the one-time example seeding.
 *
 * The module is not changed: one on-disk PGlite (same migrations and dialect
 * as the app) via `openTestWorkspaces`, with a `user` row per owner because
 * `owner_id` has a foreign key there. Each test owns its workspace
 * (`owner_id`), so test order never matters.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTestWorkspaces } from './support/graph-db.ts';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import type { ConceptNode, KnowledgeState } from '../src/lib/graph/types.ts';
import { demoConcepts } from '../src/lib/demo-data.ts';
import { DEMO_QUESTIONS } from '../src/lib/evidence/demo-questions.ts';
import {
  DEMO_QUESTIONS_FLAG,
  EvidenceRequiredError,
  guardGraphCall,
  listQuestions,
  questionCounts,
  requiresEvidence,
  saveQuestion,
  seedDemoQuestions,
} from '../src/lib/evidence/service.ts';

const DIR = join(tmpdir(), `learngraph-evidence-guards-${process.pid}`);
const DAY = 86_400_000;
const isIso = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
const demoId = (demo: (typeof demoConcepts)[number]) => demo.id.replace('concept:', '');
const ALL_DEMO_IDS = demoConcepts.map(demoId);
const allFour = () => Object.fromEntries(ALL_DEMO_IDS.map((id): [string, number] => [id, 4]));

describe('evidence guards on PGlite', () => {
  let ws: Awaited<ReturnType<typeof openTestWorkspaces>>;
  const graphs = new Map<string, EducationGraphDB>();

  const graphFor = (owner: string) => graphs.get(owner)!;

  const concept = (
    owner: string,
    conceptId: string,
    name = conceptId,
    extra: Partial<ConceptNode> = {},
  ) => graphFor(owner).addConcept({ conceptId, name, domain: 'mathematics', ...extra });

  async function addQuestions(owner: string, conceptId: string, ids: string[]) {
    for (const id of ids) {
      await saveQuestion(
        ws.db,
        graphFor(owner),
        owner,
        {
          id,
          conceptId,
          prompt: `Question ${id}`,
          options: ['1', '2'],
          answer: '1',
          explanation: '',
        },
        () => id,
      );
    }
  }

  const guard = (owner: string, method: string, args: unknown[]) =>
    guardGraphCall(ws.db, graphFor(owner), owner, method, args);

  const evidenceRequired = (message: string) => (error: unknown) => {
    assert.ok(
      error instanceof EvidenceRequiredError,
      `expected EvidenceRequiredError, got ${String(error)}`,
    );
    assert.equal(error.message, message);
    return true;
  };

  const OWNERS = [
    'owner-guard-req',
    'owner-guard-req-iso',
    'owner-guard-req-peer',
    'owner-guard-passthru',
    'owner-guard-refuse',
    'owner-guard-manual',
    'owner-guard-seed-flag',
    'owner-guard-seed-full',
    'owner-guard-seed-peer',
    'owner-guard-seed-skip',
    'owner-guard-seed-conflict',
  ];

  before(async () => {
    ws = await openTestWorkspaces(DIR, OWNERS);
    for (const owner of OWNERS) graphs.set(owner, await ws.graphFor(owner));
  });

  after(async () => {
    await ws.close();
    rmSync(DIR, { recursive: true, force: true });
  });

  it('requiresEvidence reports the bank size, the flag and the concept itself', async () => {
    const owner = 'owner-guard-req';
    await concept(owner, 'plain', 'Plain');
    await concept(owner, 'quizzy', 'Quizzy');
    await addQuestions(owner, 'quizzy', ['q1', 'q2']);
    await concept(owner, 'jp-topic', 'Hiragana', { domain: 'japanese', evidenceRequired: true });

    // No questions and no flag: nothing required, but the concept is still returned.
    const plain = await requiresEvidence(ws.db, graphFor(owner), owner, 'plain');
    assert.equal(plain.required, false);
    assert.equal(plain.questions, 0);
    assert.deepEqual(plain.concept, await graphFor(owner).getConcept('plain'));

    // Questions make the concept quiz-checked, and the count is this bank's size.
    const quizzy = await requiresEvidence(ws.db, graphFor(owner), owner, 'quizzy');
    assert.equal(quizzy.required, true);
    assert.equal(quizzy.questions, 2);
    assert.deepEqual(quizzy.concept, await graphFor(owner).getConcept('quizzy'));

    // The flag alone is enough, with an empty bank.
    const flagged = await requiresEvidence(ws.db, graphFor(owner), owner, 'jp-topic');
    assert.equal(flagged.required, true);
    assert.equal(flagged.questions, 0);
    assert.deepEqual(flagged.concept, await graphFor(owner).getConcept('jp-topic'));

    // A missing concept is never required (and reports no concept).
    assert.deepEqual(await requiresEvidence(ws.db, graphFor(owner), owner, 'ghost'), {
      required: false,
      concept: null,
      questions: 0,
    });
  });

  it('requiresEvidence counts only the asking workspace', async () => {
    const owner = 'owner-guard-req-iso';
    const peer = 'owner-guard-req-peer';
    await concept(owner, 'shared', 'Mine');
    await concept(peer, 'shared', 'Theirs');
    await addQuestions(peer, 'shared', ['p1', 'p2', 'p3']);

    const mine = await requiresEvidence(ws.db, graphFor(owner), owner, 'shared');
    assert.equal(mine.required, false);
    assert.equal(mine.questions, 0);
    assert.equal(mine.concept?.name, 'Mine');

    const theirs = await requiresEvidence(ws.db, graphFor(peer), peer, 'shared');
    assert.equal(theirs.required, true);
    assert.equal(theirs.questions, 3);
    assert.equal(theirs.concept?.name, 'Theirs');
  });

  it('guardGraphCall passes other methods, and scheduling-only patches, through untouched', async () => {
    const owner = 'owner-guard-passthru';
    await concept(owner, 'quizzy', 'Quizzy');
    await addQuestions(owner, 'quizzy', ['q1']);

    // Any other method runs as validated: the same array, by identity.
    for (const method of ['addConcept', 'deleteConcept', 'setLearnerProfile']) {
      const args: unknown[] = [{ conceptId: 'quizzy' }, 'extra'];
      assert.equal(await guard(owner, method, args), args);
    }

    // Postponing a review (or noting misconceptions) never claims knowledge,
    // even on a quiz-checked concept — the args come back untouched.
    const scheduling: unknown[] = [
      'sam',
      'quizzy',
      { nextReview: new Date(Date.now() + DAY).toISOString() },
    ];
    assert.equal(await guard(owner, 'setKnowledgeState', scheduling), scheduling);
    const notes: unknown[] = ['sam', 'quizzy', { misconceptions: ['signs'] }];
    assert.equal(await guard(owner, 'setKnowledgeState', notes), notes);
    const both: unknown[] = [
      'sam',
      'quizzy',
      { nextReview: '2026-11-20T09:00:00.000Z', misconceptions: [] },
    ];
    assert.equal(await guard(owner, 'setKnowledgeState', both), both);

    // Empty patches and undefined-only values claim nothing either (rough edge
    // kept on purpose: an undefined mastery is allowed without a manual stamp).
    for (const patch of [{}, { mastery: undefined }, null]) {
      const args: unknown[] = ['sam', 'quizzy', patch];
      assert.equal(await guard(owner, 'setKnowledgeState', args), args);
    }
  });

  it('guardGraphCall refuses evidence patches on quiz-checked concepts, per domain', async () => {
    const owner = 'owner-guard-refuse';
    await concept(owner, 'quizzy', 'Quizzy');
    await addQuestions(owner, 'quizzy', ['q1']);
    await concept(owner, 'jp-flag', 'Hiragana', { domain: 'japanese', evidenceRequired: true });
    await concept(owner, 'jp-quiz', 'Katakana', { domain: 'japanese' });
    await addQuestions(owner, 'jp-quiz', ['jq1']);

    // Every patch that claims knowledge or history is refused on a banked concept.
    const patches: Partial<KnowledgeState>[] = [
      { mastery: 100 },
      { reviewCount: 9, lastReviewed: '2026-11-01T09:00:00.000Z' },
      { retentionStrength: 0.9 },
      { lastAssessed: '2026-11-01T09:00:00.000Z' },
      { interactions: [] },
    ];
    for (const patch of patches) {
      await assert.rejects(
        guard(owner, 'setKnowledgeState', ['sam', 'quizzy', patch]),
        evidenceRequired('“Quizzy” is quiz-checked: its mastery only changes through its quiz.'),
      );
    }

    // The flag alone (Japanese topics) is refused with the Japanese wording …
    await assert.rejects(
      guard(owner, 'setKnowledgeState', ['sam', 'jp-flag', { mastery: 90 }]),
      evidenceRequired(
        '“Hiragana” is quiz-checked: its mastery only changes through the Japanese page.',
      ),
    );
    // … and so is a banked Japanese concept without the flag: the wording
    // follows the concept's domain, not why it is quiz-checked.
    await assert.rejects(
      guard(owner, 'setKnowledgeState', ['sam', 'jp-quiz', { mastery: 90 }]),
      evidenceRequired(
        '“Katakana” is quiz-checked: its mastery only changes through the Japanese page.',
      ),
    );
  });

  it('guardGraphCall stamps hand-written mastery as manual, leaving other patches alone', async () => {
    const owner = 'owner-guard-manual';
    await concept(owner, 'free', 'Free');

    // Without mastery there is nothing to stamp: the args come back untouched.
    const untouched: unknown[] = [
      'sam',
      'free',
      { reviewCount: 3, lastReviewed: '2026-11-01T09:00:00.000Z' },
    ];
    assert.equal(await guard(owner, 'setKnowledgeState', untouched), untouched);

    // A mastery written this way is recorded as a hand edit, and a forged
    // source does not survive the stamp.
    const args: unknown[] = ['sam', 'free', { mastery: 70, masterySource: 'quiz', reviewCount: 2 }];
    const stamped = await guard(owner, 'setKnowledgeState', args);
    assert.notEqual(stamped, args);
    assert.equal(stamped[0], 'sam');
    assert.equal(stamped[1], 'free');
    assert.deepEqual(stamped[2], { mastery: 70, masterySource: 'manual', reviewCount: 2 });
    // The caller's patch object is not mutated.
    assert.deepEqual(args[2], { mastery: 70, masterySource: 'quiz', reviewCount: 2 });

    // The guard only asks for evidence — a concept that is gone passes (the
    // state write itself will fail later), still stamped when it claims mastery.
    const ghost = await guard(owner, 'setKnowledgeState', ['sam', 'ghost', { mastery: 10 }]);
    assert.deepEqual(ghost[2], { mastery: 10, masterySource: 'manual' });
  });

  it('seeding returns 0 without writing when the flag is already set', async () => {
    const owner = 'owner-guard-seed-flag';
    assert.equal(DEMO_QUESTIONS_FLAG, 'seed:demo-questions');
    for (const demo of demoConcepts) {
      await graphFor(owner).addConcept({
        conceptId: demoId(demo),
        name: demo.name,
        domain: demo.domain,
      });
    }
    await graphFor(owner).setMeta(DEMO_QUESTIONS_FLAG, {
      at: '2026-01-01T00:00:00.000Z',
      added: 0,
    });

    assert.equal(await seedDemoQuestions(ws.db, graphFor(owner), owner), 0);
    assert.deepEqual(await questionCounts(ws.db, owner), {});
    // The existing flag is kept exactly as it was.
    assert.deepEqual(await graphFor(owner).getMeta(DEMO_QUESTIONS_FLAG), {
      at: '2026-01-01T00:00:00.000Z',
      added: 0,
    });
  });

  it('seeding fills every fresh example concept once, writes the flag, and stays per workspace', async () => {
    const owner = 'owner-guard-seed-full';
    const peer = 'owner-guard-seed-peer';
    for (const workspace of [owner, peer]) {
      for (const demo of demoConcepts) {
        await graphFor(workspace).addConcept({
          conceptId: demoId(demo),
          name: demo.name,
          domain: demo.domain,
        });
      }
    }

    const startedAt = Date.now();
    assert.equal(await seedDemoQuestions(ws.db, graphFor(owner), owner), 44);
    assert.deepEqual(await questionCounts(ws.db, owner), allFour());
    // The bank holds the example questions themselves, in id order.
    assert.deepEqual(
      await listQuestions(ws.db, owner, 'arithmetic'),
      DEMO_QUESTIONS.filter((q) => q.conceptId === 'arithmetic').sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    );

    // The flag records the wall clock and the count, so a second call adds nothing.
    const flag = (await graphFor(owner).getMeta<{ at: string; added: number }>(
      DEMO_QUESTIONS_FLAG,
    ))!;
    assert.deepEqual(Object.keys(flag).sort(), ['added', 'at']);
    assert.ok(isIso(flag.at));
    assert.ok(Date.parse(flag.at) >= startedAt);
    assert.equal(flag.added, 44);
    assert.equal(await seedDemoQuestions(ws.db, graphFor(owner), owner), 0);

    // Seeding one workspace leaves the other alone, and the other can still
    // seed its own copy of the same example questions.
    assert.deepEqual(await questionCounts(ws.db, peer), {});
    assert.equal(await seedDemoQuestions(ws.db, graphFor(peer), peer), 44);
    assert.deepEqual(await questionCounts(ws.db, owner), allFour());
  });

  it('seeding skips changed, banked and missing example concepts', async () => {
    const owner = 'owner-guard-seed-skip';
    // The editor moved this example concept to their own subject.
    await concept(owner, 'arithmetic', 'Basic Arithmetic', { domain: 'my-course' });
    // This one already has a bank of its own — emptied on purpose or not.
    await concept(owner, 'fractions', 'Fractions');
    await addQuestions(owner, 'fractions', ['my-own-1']);
    // Missing (deleted) example concepts are simply skipped, while fresh
    // examples with their original subject are filled.
    await concept(owner, 'pre-algebra', 'Pre-Algebra');
    await concept(owner, 'linear-equations', 'Linear Equations');
    // A concept that is not an example never gets example questions.
    await concept(owner, 'my-topic', 'My Topic');
    await addQuestions(owner, 'my-topic', ['mine-1']);

    assert.equal(await seedDemoQuestions(ws.db, graphFor(owner), owner), 8);
    assert.deepEqual(await questionCounts(ws.db, owner), {
      fractions: 1,
      'linear-equations': 4,
      'my-topic': 1,
      'pre-algebra': 4,
    });
    // The banked example keeps its own question only — no demo ids were added.
    assert.deepEqual(
      (await listQuestions(ws.db, owner, 'fractions')).map((q) => q.id),
      ['my-own-1'],
    );

    const flag = (await graphFor(owner).getMeta<{ at: string; added: number }>(
      DEMO_QUESTIONS_FLAG,
    ))!;
    assert.equal(flag.added, 8);
    assert.equal(await seedDemoQuestions(ws.db, graphFor(owner), owner), 0);
  });

  it('seeding counts a blocked example id as not added and keeps the blocking row', async () => {
    const owner = 'owner-guard-seed-conflict';
    for (const demo of demoConcepts) {
      await graphFor(owner).addConcept({
        conceptId: demoId(demo),
        name: demo.name,
        domain: demo.domain,
      });
    }
    // A question of the owner's own already uses the id the example bank wants
    // for arithmetic — on another concept, so arithmetic itself looks fresh.
    await concept(owner, 'extra', 'Extra');
    await addQuestions(owner, 'extra', ['demo-arithmetic-1']);

    assert.equal(await seedDemoQuestions(ws.db, graphFor(owner), owner), 43);
    const expected = Object.fromEntries(
      ALL_DEMO_IDS.map((id): [string, number] => [id, id === 'arithmetic' ? 3 : 4]),
    );
    expected['extra'] = 1;
    assert.deepEqual(await questionCounts(ws.db, owner), expected);
    // Arithmetic got its other three questions …
    assert.deepEqual(
      (await listQuestions(ws.db, owner, 'arithmetic')).map((q) => q.id),
      ['demo-arithmetic-2', 'demo-arithmetic-3', 'demo-arithmetic-4'],
    );
    // … and the blocking row is untouched: still on its own concept, with its own prompt.
    const blocker = (await listQuestions(ws.db, owner, 'extra'))[0];
    assert.equal(blocker.id, 'demo-arithmetic-1');
    assert.equal(blocker.conceptId, 'extra');
    assert.equal(blocker.prompt, 'Question demo-arithmetic-1');
  });

  it('keeps the guard and seeding wiring, and the older evidence tests (static guard)', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'service.ts'),
      'utf8',
    );

    // requiresEvidence: the bank is scoped to this workspace and this concept,
    // and either way of being quiz-checked counts.
    const reqIndex = source.indexOf('export async function requiresEvidence');
    const reqEnd = source.indexOf('/** Meta flag', reqIndex);
    assert.ok(reqIndex >= 0 && reqEnd > reqIndex);
    const req = source.slice(reqIndex, reqEnd);
    assert.match(req, /\.where\('owner_id', '=', owner\)/);
    assert.match(req, /\.where\('concept_id', '=', conceptId\)/);
    assert.match(req, /concept\?\.evidenceRequired === true \|\| questions > 0/);

    // seedDemoQuestions: the flag check comes first, the counts are read
    // before the loop, every example concept is checked (still an example,
    // no bank) before its questions are inserted with a silent conflict, and
    // the flag is written after the loop with what was really added.
    const seedIndex = source.indexOf('export async function seedDemoQuestions');
    const seedEnd = source.indexOf('\n// Event log', seedIndex);
    assert.ok(seedIndex >= 0 && seedEnd > seedIndex);
    const seed = source.slice(seedIndex, seedEnd);
    const flagCheck = seed.indexOf('if (await graph.getMeta(DEMO_QUESTIONS_FLAG)) return 0;');
    const countsRead = seed.indexOf('const counts = await questionCounts(db, owner);');
    const loop = seed.indexOf('for (const demo of demoConcepts)');
    assert.ok(flagCheck >= 0 && flagCheck < countsRead && countsRead < loop);
    assert.match(seed, /const conceptId = demo\.id\.replace\('concept:', ''\)/);
    assert.match(
      seed,
      /if \(!concept \|\| concept\.domain !== demo\.domain \|\| counts\[conceptId\]\) continue;/,
    );
    assert.match(seed, /DEMO_QUESTIONS\.filter\(\(q\) => q\.conceptId === conceptId\)/);
    assert.match(
      seed,
      /onConflict\(\(oc\) => oc\.columns\(\['owner_id', 'id'\]\)\.doNothing\(\)\)/,
    );
    assert.ok(seed.includes(".returning('id')"));
    const addedUp = seed.indexOf('added += inserted.length;');
    const flagWrite = seed.indexOf('setMeta(DEMO_QUESTIONS_FLAG,');
    assert.ok(addedUp >= 0 && addedUp > loop && flagWrite > addedUp);
    assert.match(
      seed,
      /setMeta\(DEMO_QUESTIONS_FLAG, \{ at: new Date\(\)\.toISOString\(\), added \}\)/,
    );

    // guardGraphCall: other methods first, undefined fields filtered out, only
    // the two scheduling fields pass freely, then the evidence refusal, and
    // the final manual stamp for mastery patches on free concepts.
    const guardIndex = source.indexOf('export async function guardGraphCall');
    assert.ok(guardIndex >= 0);
    const guard = source.slice(guardIndex);
    assert.match(guard, /if \(method !== 'setKnowledgeState'\) return args;/);
    const otherMethod = guard.indexOf("method !== 'setKnowledgeState'");
    const undefFilter = guard.indexOf(
      'filter((k) => (patch as Record<string, unknown>)[k] !== undefined)',
    );
    const freePass = guard.indexOf('fields.every((k) => NON_EVIDENCE_FIELDS.has(k))');
    const evidenceCall = guard.indexOf('requiresEvidence(db, graph, owner, conceptId)');
    assert.ok(
      otherMethod >= 0 &&
        otherMethod < undefFilter &&
        undefFilter < freePass &&
        freePass < evidenceCall,
    );
    assert.match(guard, /if \(required\) throw new EvidenceRequiredError\(concept, conceptId\);/);
    assert.match(
      guard,
      /return patch\.mastery === undefined \? args : \[learnerId, conceptId, \{ \.\.\.patch, masterySource: 'manual' }\];/,
    );
    // Exactly the two scheduling fields are free.
    assert.ok(
      source.includes("const NON_EVIDENCE_FIELDS = new Set(['nextReview', 'misconceptions']);"),
    );

    // The older end-to-end evidence tests stay as they are.
    const older = readFileSync(join(import.meta.dirname, 'learning-evidence.test.ts'), 'utf8');
    for (const title of [
      'a concept with questions requires evidence; one without does not',
      'a direct graphCall cannot make a quiz-checked concept mastered, but may postpone its review',
      'a flagged concept (Japanese) requires evidence without questions in the bank',
      'example questions are seeded once, only onto example concepts without a bank',
    ]) {
      assert.ok(older.includes(title), title);
    }
  });
});
