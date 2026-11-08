/**
 * Roadmap M1 "Bukti belajar": mastery of a quiz-checked concept only comes
 * from a passed quiz (also through a direct graphCall), every answer and
 * review is logged as an event scoped to its account, and retention at review
 * time can be computed from those events.
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
import { evidenceMastery } from '../src/lib/evidence/scoring.ts';
import {
  gradeQuiz,
  pickQuestions,
  questionInput,
  quizStatePatch,
  shuffled,
  QuizAnswerError,
} from '../src/lib/evidence/quiz.ts';
import { dueReviewRetention } from '../src/lib/evidence/events.ts';
import { evidenceMode, masterySourceLabel, quizResultNotice, retentionLine } from '../src/lib/evidence/labels.ts';
import {
  EvidenceError,
  EvidenceRequiredError,
  guardGraphCall,
  listEvents,
  listQuestions,
  questionCounts,
  recordSelfReport,
  requiresEvidence,
  saveQuestion,
  seedDemoQuestions,
  startQuiz,
  submitQuiz,
} from '../src/lib/evidence/service.ts';
import { DEMO_QUESTIONS } from '../src/lib/evidence/demo-questions.ts';
import { demoConcepts } from '../src/lib/demo-data.ts';
import { parseGraphArgs } from '../src/lib/graph/rpc-schemas.ts';

const DAY = 86_400_000;
const random = { int: (n: number) => Math.floor(Math.random() * n), uuid: randomUUID };

describe('quiz helpers (pure)', () => {
  it('a single pass counts as mastered when reviews are quizzes; the strict policy still needs a delayed pass', () => {
    const pass = { at: '2026-11-03T00:00:00Z', correct: 3, total: 3, ids: ['a', 'b', 'c'] };
    assert.equal(evidenceMastery([pass], { delayedRetrieval: false }), 85);
    assert.equal(evidenceMastery([pass]), 70);
    assert.equal(evidenceMastery([pass, { ...pass, at: '2026-11-04T00:00:00Z', correct: 2 }], { delayedRetrieval: false }), 47);
    assert.equal(evidenceMastery([], { delayedRetrieval: false }), 0);
  });

  it('draws questions not seen in the previous attempt first, and shuffles without losing any', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    for (let i = 0; i < 20; i++) {
      const picked = pickQuestions(pool, ['a', 'b', 'c'], 3, random.int).map((q) => q.id);
      assert.equal(picked.length, 3);
      assert.ok(picked.includes('d') && picked.includes('e'), picked.join());
    }
    assert.deepEqual([...shuffled([1, 2, 3, 4], random.int)].sort(), [1, 2, 3, 4]);
    assert.equal(pickQuestions(pool.slice(0, 2), [], 3, random.int).length, 2);
  });

  it('grades only complete answers that are among the options', () => {
    const qs = [
      { id: 'q1', options: ['1', '2'], answer: '2' },
      { id: 'q2', options: ['x', 'y'], answer: 'x' },
    ];
    assert.deepEqual(gradeQuiz(qs, { q1: '2', q2: 'y' }).correct, 1);
    assert.throws(() => gradeQuiz(qs, { q1: '2' }), QuizAnswerError);
    assert.throws(() => gradeQuiz(qs, { q1: '2', q2: 'z' }), QuizAnswerError);
  });

  it('validates questions typed in the editor', () => {
    const ok = { conceptId: 'fractions', prompt: '1/2 + 1/2 = ?', options: ['1', '2'], answer: '1' };
    assert.equal(questionInput.safeParse(ok).success, true);
    assert.equal(questionInput.safeParse({ ...ok, answer: '3' }).success, false);
    assert.equal(questionInput.safeParse({ ...ok, options: ['1', '1'] }).success, false);
    assert.equal(questionInput.safeParse({ ...ok, options: ['1'] }).success, false);
    assert.equal(questionInput.safeParse({ ...ok, conceptId: 'a:b' }).success, false);
  });

  it('a quiz moves the review schedule like the one memory model, and early retakes never stretch it', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const pass = [{ at: now.toISOString(), correct: 3, total: 3, ids: ['a', 'b', 'c'] }];
    const fail = [{ at: now.toISOString(), correct: 1, total: 3, ids: ['a', 'b', 'c'] }];
    const first = quizStatePatch(null, pass, 3, now);
    assert.equal(first.patch.mastery, 85);
    assert.equal(first.patch.reviewCount, 0);
    assert.equal(first.patch.masterySource, 'quiz');
    assert.equal(first.wasDue, false);

    const learned = { mastery: 85, reviewCount: 2, retentionStrength: 0.8, lastReviewed: new Date(now.getTime() - 30 * DAY).toISOString() };
    const due = quizStatePatch(learned, pass, 3, now);
    assert.equal(due.wasDue, true);
    assert.equal(due.patch.reviewCount, 3);

    const fresh = { ...learned, lastReviewed: new Date(now.getTime() - DAY / 2).toISOString() };
    const early = quizStatePatch(fresh, pass, 3, now);
    assert.equal(early.wasDue, false);
    assert.equal(early.patch.reviewCount, undefined);
    assert.equal(early.patch.lastReviewed, undefined);

    const failed = quizStatePatch(learned, fail, 3, now);
    assert.equal(failed.patch.reviewCount, 0);
    assert.ok(failed.patch.mastery < 80);
  });

  it('retention at review time counts due quiz reviews and due self-reports separately', () => {
    const r = dueReviewRetention([
      { kind: 'quiz', outcome: 'passed', wasDue: true },
      { kind: 'quiz', outcome: 'failed', wasDue: true },
      { kind: 'quiz', outcome: 'passed', wasDue: false },
      { kind: 'review', outcome: 'remembered', wasDue: true },
      { kind: 'snooze', outcome: 'snoozed', wasDue: true },
    ]);
    assert.deepEqual(r.quiz, { answered: 2, correct: 1, rate: 0.5 });
    assert.deepEqual(r.selfReport, { answered: 1, correct: 1, rate: 1 });
    assert.equal(dueReviewRetention([]).quiz.rate, null);
  });

  it('labels where mastery came from and what a quiz result means', () => {
    assert.equal(masterySourceLabel('quiz'), 'From quizzes');
    assert.equal(masterySourceLabel('self_report'), 'Self-reported');
    assert.equal(masterySourceLabel(undefined), 'Not quiz-checked');
    assert.equal(evidenceMode({ conceptId: 'a' }, { a: 4 }), 'quiz');
    assert.equal(evidenceMode({ conceptId: 'jp', evidenceRequired: true }, {}), 'elsewhere');
    assert.equal(evidenceMode({ conceptId: 'b' }, { a: 4 }), 'self-report');
    const base = { conceptName: 'Fractions', correct: 3, total: 3, passed: true, wasDue: false, masteryBefore: 0, mastery: 85 };
    assert.match(quizResultNotice(base), /is mastered/);
    assert.match(quizResultNotice({ ...base, wasDue: true }), /longer break/);
    assert.match(quizResultNotice({ ...base, correct: 1, passed: false, mastery: 23 }), /not passed yet/);
    assert.equal(retentionLine({ answered: 4, correct: 3, rate: 0.75 }), '3 of 4 due reviews answered correctly (75%)');
    assert.equal(retentionLine({ answered: 0, correct: 0, rate: null }), null);
  });

  it('ships at least 3 valid questions for each of the 11 example concepts', () => {
    const ids = demoConcepts.map((c) => c.id.replace('concept:', ''));
    assert.equal(ids.length, 11);
    for (const id of ids) {
      const qs = DEMO_QUESTIONS.filter((q) => q.conceptId === id);
      assert.ok(qs.length >= 3, `${id}: ${qs.length} questions`);
      for (const q of qs) assert.equal(questionInput.safeParse(q).success, true, `${q.id} is invalid`);
    }
    assert.equal(new Set(DEMO_QUESTIONS.map((q) => q.id)).size, DEMO_QUESTIONS.length);
  });
});

describe('learning evidence on Postgres (PGlite)', () => {
  const DIR = path.join(os.tmpdir(), `learngraph-evidence-${process.pid}`);
  let ws: Awaited<ReturnType<typeof openTestWorkspaces>>;
  let alice: EducationGraphDB;
  let bob: EducationGraphDB;

  before(async () => {
    ws = await openTestWorkspaces(DIR, ['owner-alice', 'owner-bob']);
    alice = await ws.graphFor('owner-alice');
    bob = await ws.graphFor('owner-bob');
    for (const graph of [alice, bob]) {
      await graph.setLearnerProfile('sam', { name: 'Sam' });
      await graph.addConcept({ conceptId: 'fractions', name: 'Fractions', domain: 'mathematics' });
      await graph.addConcept({ conceptId: 'decimals', name: 'Decimals', domain: 'mathematics' });
    }
    for (const [i, answer] of ['1', '2', '3', '4'].entries()) {
      await saveQuestion(
        ws.db,
        alice,
        'owner-alice',
        { conceptId: 'fractions', prompt: `Question ${i}`, options: ['1', '2', '3', '4'], answer, explanation: `Because ${answer}.` },
        randomUUID,
      );
    }
  });
  after(async () => {
    await ws.close();
    fs.rmSync(DIR, { recursive: true, force: true });
  });

  async function quizWith(graph: EducationGraphDB, owner: string, right: boolean, now?: Date) {
    const started = await startQuiz(ws.db, graph, owner, { learnerId: 'sam', conceptId: 'fractions' }, random);
    const bank = await listQuestions(ws.db, owner, 'fractions');
    const answers = Object.fromEntries(
      started.questions.map((q) => {
        const key = bank.find((b) => b.id === q.id)!.answer;
        return [q.id, right ? key : q.options.find((o) => o !== key)!];
      }),
    );
    return { started, result: await submitQuiz(ws.db, graph, owner, { sessionId: started.sessionId, answers }, now) };
  }

  it('a concept with questions requires evidence; one without does not', async () => {
    assert.equal((await requiresEvidence(ws.db, alice, 'owner-alice', 'fractions')).required, true);
    assert.equal((await requiresEvidence(ws.db, alice, 'owner-alice', 'decimals')).required, false);
    // Bob has the same concept id but no questions in his own workspace.
    assert.equal((await requiresEvidence(ws.db, bob, 'owner-bob', 'fractions')).required, false);
    assert.deepEqual(await questionCounts(ws.db, 'owner-bob'), {});
    assert.deepEqual(await questionCounts(ws.db, 'owner-alice'), { fractions: 4 });
  });

  it('a direct graphCall cannot make a quiz-checked concept mastered, but may postpone its review', async () => {
    const call = async (patch: unknown) => {
      const args = parseGraphArgs('setKnowledgeState', ['sam', 'fractions', patch]);
      return guardGraphCall(ws.db, alice, 'owner-alice', 'setKnowledgeState', args);
    };
    await assert.rejects(call({ mastery: 100 }), EvidenceRequiredError);
    await assert.rejects(call({ reviewCount: 9, lastReviewed: new Date().toISOString() }), EvidenceRequiredError);
    // A forged source is stripped by the RPC schema before the guard sees it.
    await assert.rejects(call({ mastery: 90, masterySource: 'quiz' }), EvidenceRequiredError);
    const snooze = await call({ nextReview: new Date(Date.now() + DAY).toISOString() });
    assert.equal((snooze[2] as { mastery?: number }).mastery, undefined);
    // Concepts without questions keep working, recorded as a hand edit.
    const args = parseGraphArgs('setKnowledgeState', ['sam', 'decimals', { mastery: 90, masterySource: 'quiz' }]);
    const allowed = await guardGraphCall(ws.db, alice, 'owner-alice', 'setKnowledgeState', args);
    assert.equal((allowed[2] as { masterySource: string }).masterySource, 'manual');
  });

  it('a flagged concept (Japanese) requires evidence without questions in the bank', async () => {
    await alice.addConcept({ conceptId: 'jp-hiragana', name: 'Hiragana', domain: 'japanese', evidenceRequired: true });
    const args = parseGraphArgs('setKnowledgeState', ['sam', 'jp-hiragana', { mastery: 90 }]);
    await assert.rejects(guardGraphCall(ws.db, alice, 'owner-alice', 'setKnowledgeState', args), /Japanese page/);
    // addConcept through graphCall can't clear the flag (the RPC schema drops it, the engine merges).
    await alice.addConcept(parseGraphArgs('addConcept', [{ conceptId: 'jp-hiragana', evidenceRequired: false }])[0] as never);
    assert.equal((await alice.getConcept('jp-hiragana'))?.evidenceRequired, true);
  });

  it('self-reports are refused for quiz-checked concepts (D5) but still allowed elsewhere', async () => {
    await assert.rejects(
      recordSelfReport(ws.db, alice, 'owner-alice', { learnerId: 'sam', conceptId: 'fractions', outcome: 'got-it' }),
      EvidenceRequiredError,
    );
    const r = await recordSelfReport(ws.db, alice, 'owner-alice', { learnerId: 'sam', conceptId: 'decimals', outcome: 'got-it' });
    assert.equal(r.mastery, 85);
    assert.equal((await alice.getKnowledgeState('sam', 'decimals'))?.masterySource, 'self_report');
  });

  it('a quiz never sends the answer key, and only a passed quiz makes the concept mastered', async () => {
    const { started, result: failed } = await quizWith(alice, 'owner-alice', false);
    assert.equal(started.questions.length, 3);
    for (const q of started.questions) assert.deepEqual(Object.keys(q).sort(), ['id', 'options', 'prompt']);
    assert.equal(failed.passed, false);
    assert.ok(failed.mastery < 80);
    assert.equal((await alice.getKnowledgeState('sam', 'fractions'))?.masterySource, 'quiz');

    const { result: ok } = await quizWith(alice, 'owner-alice', true);
    assert.equal(ok.passed, true);
    assert.equal(ok.mastery, 85);
    assert.ok(ok.feedback.every((f) => f.correct && f.explanation.startsWith('Because')));
    const state = await alice.getKnowledgeState('sam', 'fractions');
    assert.equal(state?.mastery, 85);
    assert.equal(state?.masterySource, 'quiz');
  });

  it('a quiz is graded once, and only in its own workspace', async () => {
    const started = await startQuiz(ws.db, alice, 'owner-alice', { learnerId: 'sam', conceptId: 'fractions' }, random);
    const bank = await listQuestions(ws.db, 'owner-alice', 'fractions');
    const answers = Object.fromEntries(
      started.questions.map((q) => [q.id, q.options.find((o) => o !== bank.find((b) => b.id === q.id)!.answer)!]),
    );
    await assert.rejects(
      submitQuiz(ws.db, bob, 'owner-bob', { sessionId: started.sessionId, answers }),
      /not found/,
    );
    await submitQuiz(ws.db, alice, 'owner-alice', { sessionId: started.sessionId, answers });
    await assert.rejects(
      submitQuiz(ws.db, alice, 'owner-alice', { sessionId: started.sessionId, answers }),
      /already graded/,
    );
    await assert.rejects(
      startQuiz(ws.db, bob, 'owner-bob', { learnerId: 'sam', conceptId: 'fractions' }, random),
      EvidenceError,
    );
  });

  it('every answer and review is an event bound to its account', async () => {
    await recordSelfReport(ws.db, bob, 'owner-bob', { learnerId: 'sam', conceptId: 'decimals', outcome: 'started' });
    await recordSelfReport(ws.db, bob, 'owner-bob', { learnerId: 'sam', conceptId: 'decimals', outcome: 'snooze' });
    const aliceEvents = await listEvents(ws.db, 'owner-alice');
    const bobEvents = await listEvents(ws.db, 'owner-bob');
    assert.deepEqual(
      aliceEvents.map((e) => `${e.kind}:${e.outcome}`),
      ['study:got-it', 'quiz:failed', 'quiz:passed', 'quiz:failed'],
    );
    assert.deepEqual(bobEvents.map((e) => `${e.kind}:${e.outcome}`), ['study:started', 'snooze:snoozed']);
    const quiz = aliceEvents.find((e) => e.kind === 'quiz')!;
    assert.equal(quiz.total, 3);
    assert.equal((quiz.detail.answers as unknown[]).length, 3);
    // Append-only: rows can't be rewritten.
    await assert.rejects(sql`update learning_events set outcome = 'passed'`.execute(ws.db));
  });

  it('retention at review time is computed from due review events', async () => {
    // Make the review due (last reviewed long ago), then pass it by quiz.
    const past = new Date(Date.now() - 60 * DAY).toISOString();
    await alice.setKnowledgeState('sam', 'fractions', { mastery: 85, lastReviewed: past, reviewCount: 1 });
    const { result } = await quizWith(alice, 'owner-alice', true);
    assert.equal(result.wasDue, true);
    const retention = dueReviewRetention(await listEvents(ws.db, 'owner-alice', { learnerId: 'sam' }));
    assert.deepEqual(retention.quiz, { answered: 1, correct: 1, rate: 1 });
  });

  it('example questions are seeded once, only onto example concepts without a bank', async () => {
    const { seedDemoDataIfEmpty } = await import('../src/lib/graph/seed.ts');
    // A fresh workspace for this check.
    const owner = 'owner-carol';
    await sql`insert into "user" (id, name, email, "emailVerified") values (${owner}, 'c', 'c@example.test', false)`.execute(ws.db);
    const graph = await ws.graphFor(owner);
    assert.equal(await seedDemoDataIfEmpty(graph), true);
    await graph.addConcept({ conceptId: 'algorithms', name: 'My own algorithms', domain: 'my-course' });
    const added = await seedDemoQuestions(ws.db, graph, owner);
    const counts = await questionCounts(ws.db, owner);
    assert.equal(Object.keys(counts).length, 10, JSON.stringify(counts));
    assert.equal(counts.algorithms, undefined);
    assert.equal(added, 40);
    assert.equal(await seedDemoQuestions(ws.db, graph, owner), 0);
  });

  it('deleting a concept deletes its questions, so the id starts without a quiz', async () => {
    await alice.deleteConcept('fractions');
    assert.deepEqual(await questionCounts(ws.db, 'owner-alice'), {});
    await alice.addConcept({ conceptId: 'fractions', name: 'Fractions', domain: 'mathematics' });
    assert.equal((await requiresEvidence(ws.db, alice, 'owner-alice', 'fractions')).required, false);
  });
});
