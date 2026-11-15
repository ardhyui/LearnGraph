/**
 * Direct unit tests for the quiz sessions in `src/lib/evidence/service.ts` —
 * `startQuiz` and `submitQuiz`.
 *
 * Until now sessions were only exercised through `tests/learning-evidence.test.ts`
 * (one happy path plus the grading guards). Here the DB layer and orchestration
 * are locked down at the service's own level: the draw (unseen questions first,
 * the `QUIZ_LENGTH` cap, options shuffled), the snapshot that keeps the answer
 * key on the server, the exact result shape, the state patch and the event row.
 * `pickQuestions`/`gradeQuiz`/`quizStatePatch` themselves are not re-tested:
 * they are locked in `tests/learning-evidence.test.ts` and `tests/quiz.test.ts`.
 *
 * The module is not changed: one on-disk PGlite (same migrations and dialect as
 * the app) via `openTestWorkspaces`, with a `user` row per owner because
 * `owner_id` has a foreign key there. Each test owns its workspace (`owner_id`),
 * so test order never matters.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { openTestWorkspaces } from './support/graph-db.ts';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import { QUIZ_LENGTH, QuizAnswerError } from '../src/lib/evidence/quiz.ts';
import {
  EvidenceError,
  listEvents,
  listQuestions,
  saveQuestion,
  startQuiz,
  submitQuiz,
  type QuizResult,
  type StartedQuiz,
} from '../src/lib/evidence/service.ts';

const DIR = join(tmpdir(), `learngraph-evidence-quiz-sessions-${process.pid}`);
const NOW = new Date('2026-11-10T09:00:00Z');

interface SnapshotQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

interface RawSession {
  id: string;
  owner_id: string;
  learner_id: string;
  concept_id: string;
  questions: SnapshotQuestion[];
  created_at: string | Date;
  completed_at: string | Date | null;
  answers: Record<string, string> | null;
  correct: number | null;
  total: number;
}

interface QuestionDraft {
  id: string;
  answer: string;
  options?: string[];
  prompt?: string;
  explanation?: string;
}

const evidenceError = (message: string) => (error: unknown) => {
  assert.ok(error instanceof EvidenceError, `expected EvidenceError, got ${String(error)}`);
  assert.equal(error.message, message);
  return true;
};

const answerError = (message: string) => (error: unknown) => {
  assert.ok(error instanceof QuizAnswerError, `expected QuizAnswerError, got ${String(error)}`);
  assert.equal(error.message, message);
  return true;
};

const isoOf = (value: string | Date): string => new Date(value).toISOString();
const isIso = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);

describe('quiz sessions service on PGlite', () => {
  let ws: Awaited<ReturnType<typeof openTestWorkspaces>>;
  const graphs = new Map<string, EducationGraphDB>();

  const graphFor = (owner: string) => graphs.get(owner)!;

  const learner = (owner: string, learnerId = 'sam', name = 'Sam') =>
    graphFor(owner).setLearnerProfile(learnerId, { name });

  const concept = (owner: string, conceptId: string, name = conceptId) =>
    graphFor(owner).addConcept({ conceptId, name, domain: 'mathematics' });

  /** Add a batch of questions, with the same upsert path the editor uses. */
  async function addQuestions(owner: string, conceptId: string, drafts: QuestionDraft[]) {
    for (const draft of drafts) {
      await saveQuestion(
        ws.db,
        graphFor(owner),
        owner,
        {
          id: draft.id,
          conceptId,
          prompt: draft.prompt ?? `Question ${draft.id}`,
          options: draft.options ?? ['1', '2', '3', '4'],
          answer: draft.answer,
          explanation: draft.explanation ?? '',
        },
        () => draft.id,
      );
    }
  }

  /** Start a quiz with a deterministic draw: `int` always 0, one stable uuid. */
  async function start(owner: string, conceptId: string, sessionId: string, learnerId = 'sam') {
    const counter = { uuid: 0, ints: [] as number[] };
    const started = await startQuiz(
      ws.db,
      graphFor(owner),
      owner,
      { learnerId, conceptId },
      {
        int: (n) => {
          counter.ints.push(n);
          return 0;
        },
        uuid: () => {
          counter.uuid += 1;
          return sessionId;
        },
      },
    );
    return { started, counter };
  }

  const rawSession = async (id: string) => {
    const { rows } = await sql<RawSession>`select * from quiz_sessions where id = ${id}`.execute(
      ws.db,
    );
    return rows[0];
  };

  const sessionCount = async (owner: string) =>
    Number(
      (
        await sql<{
          n: number;
        }>`select count(*)::int as n from quiz_sessions where owner_id = ${owner}`.execute(ws.db)
      ).rows[0].n,
    );

  const eventCount = async (owner: string) =>
    Number(
      (
        await sql<{
          n: number;
        }>`select count(*)::int as n from learning_events where owner_id = ${owner}`.execute(ws.db)
      ).rows[0].n,
    );

  /** The correct answers for a started quiz, read from this owner's bank. */
  async function correctAnswers(owner: string, conceptId: string, started: StartedQuiz) {
    const bank = await listQuestions(ws.db, owner, conceptId);
    return Object.fromEntries(
      started.questions.map((q) => [q.id, bank.find((b) => b.id === q.id)!.answer]),
    );
  }

  async function insertCompletedSession(
    owner: string,
    sessionId: string,
    conceptId: string,
    ids: string[],
    learnerId = 'sam',
  ) {
    const snapshot = ids.map((id) => ({
      id,
      prompt: id,
      options: ['1', '2'],
      answer: '1',
      explanation: '',
    }));
    await sql`insert into quiz_sessions
        (id, owner_id, learner_id, concept_id, questions, completed_at, answers, correct, total)
      values (${sessionId}, ${owner}, ${learnerId}, ${conceptId}, ${JSON.stringify(snapshot)}::jsonb,
        now(), '{}'::jsonb, 0, ${ids.length})`.execute(ws.db);
  }

  const OWNERS = [
    'owner-start-errors',
    'owner-start-bank',
    'owner-start-other',
    'owner-start-short',
    'owner-start-retake',
    'owner-submit-guards',
    'owner-submit-other',
    'owner-submit-pass',
    'owner-submit-fail',
    'owner-submit-due',
    'owner-submit-deleted',
  ];

  before(async () => {
    ws = await openTestWorkspaces(DIR, OWNERS);
    for (const owner of OWNERS) graphs.set(owner, await ws.graphFor(owner));
  });

  after(async () => {
    await ws.close();
    rmSync(DIR, { recursive: true, force: true });
  });

  it('refuses a missing learner, a missing concept or an empty bank without writing a session', async () => {
    await learner('owner-start-errors');
    await concept('owner-start-errors', 'empty', 'Nothing Here');

    /** Every refusal happens before drawing and before the session id is made. */
    const attempt = async (learnerId: string, conceptId: string, expected: string) => {
      let uuidCalls = 0;
      await assert.rejects(
        startQuiz(
          ws.db,
          graphFor('owner-start-errors'),
          'owner-start-errors',
          { learnerId, conceptId },
          {
            int: () => 0,
            uuid: () => {
              uuidCalls += 1;
              return 'never-used';
            },
          },
        ),
        (error: unknown) => {
          assert.ok(error instanceof EvidenceError, `expected EvidenceError, got ${String(error)}`);
          assert.equal(error.message, expected);
          return true;
        },
      );
      assert.equal(uuidCalls, 0);
    };

    await attempt('ghost', 'empty', 'That learner no longer exists.');
    await attempt('sam', 'absent', 'That concept no longer exists.');
    await attempt('sam', 'empty', '“Nothing Here” has no quiz questions yet.');
    assert.equal(await sessionCount('owner-start-errors'), 0);
  });

  it('draws only from its own concept bank and owner, hides the answer key, and snapshots it', async () => {
    await learner('owner-start-bank');
    await learner('owner-start-other');
    await concept('owner-start-bank', 'current', 'Current');
    await concept('owner-start-bank', 'side', 'Side');
    await concept('owner-start-other', 'current', 'Other Current');
    await addQuestions(
      'owner-start-bank',
      'current',
      ['q0', 'q1', 'q2', 'q3'].map((id, i) => ({ id, answer: String(i + 1) })),
    );
    await addQuestions('owner-start-bank', 'side', [
      { id: 'side-0', answer: '1' },
      { id: 'side-1', answer: '2' },
    ]);
    await addQuestions('owner-start-other', 'current', [
      { id: 'other-0', answer: '1' },
      { id: 'other-1', answer: '2' },
    ]);

    const { started, counter } = await start('owner-start-bank', 'current', 'session-bank');

    assert.deepEqual(Object.keys(started).sort(), [
      'conceptId',
      'conceptName',
      'questions',
      'sessionId',
    ]);
    assert.equal(started.sessionId, 'session-bank');
    assert.equal(started.conceptId, 'current');
    assert.equal(started.conceptName, 'Current');
    assert.equal(counter.uuid, 1);
    assert.equal(started.questions.length, QUIZ_LENGTH);
    assert.deepEqual(
      started.questions.map((q) => q.id),
      ['q1', 'q2', 'q3'],
    );
    for (const question of started.questions) {
      assert.deepEqual(Object.keys(question).sort(), ['id', 'options', 'prompt']);
      // int = 0 rotates the four options left by one; the bank keeps its order.
      assert.deepEqual(question.options, ['2', '3', '4', '1']);
    }

    const bank = await listQuestions(ws.db, 'owner-start-bank', 'current');
    assert.deepEqual(
      bank.map((q) => q.options),
      Array.from({ length: 4 }, () => ['1', '2', '3', '4']),
    );

    const raw = await rawSession('session-bank');
    assert.equal(raw.owner_id, 'owner-start-bank');
    assert.equal(raw.learner_id, 'sam');
    assert.equal(raw.concept_id, 'current');
    assert.equal(raw.answers, null);
    assert.equal(raw.correct, null);
    assert.equal(raw.completed_at, null);
    assert.equal(raw.total, QUIZ_LENGTH);
    assert.ok(isIso(isoOf(raw.created_at)));
    assert.deepEqual(
      raw.questions.map((q) => Object.keys(q).sort()),
      Array.from({ length: 3 }, () => ['answer', 'explanation', 'id', 'options', 'prompt']),
    );
    assert.deepEqual(
      raw.questions.map((q) => q.id),
      ['q1', 'q2', 'q3'],
    );
    assert.deepEqual(
      raw.questions.map((q) => q.answer),
      ['2', '3', '4'],
    );
    assert.deepEqual(
      raw.questions.map((q) => q.explanation),
      ['', '', ''],
    );
    assert.deepEqual(
      raw.questions.map((q) => q.options),
      Array.from({ length: 3 }, () => ['2', '3', '4', '1']),
    );
    assert.equal(await sessionCount('owner-start-bank'), 1);
    assert.equal(await sessionCount('owner-start-other'), 0);
  });

  it('uses the whole bank when it has fewer questions than QUIZ_LENGTH', async () => {
    await learner('owner-start-short');
    await concept('owner-start-short', 'short', 'Short');
    await addQuestions('owner-start-short', 'short', [
      { id: 'two-0', answer: '1', options: ['1', '2'] },
      { id: 'two-1', answer: '2', options: ['1', '2'] },
    ]);

    const { started, counter } = await start('owner-start-short', 'short', 'short-session');
    assert.equal(counter.uuid, 1);
    assert.deepEqual(
      started.questions.map((q) => q.id),
      ['two-1', 'two-0'],
    );
    assert.equal(started.questions.length, 2);

    const raw = await rawSession('short-session');
    assert.equal(raw.total, 2);
    assert.equal(raw.questions.length, 2);
  });

  it('prefers questions that were not in the previous completed attempt', async () => {
    await learner('owner-start-retake');
    await concept('owner-start-retake', 'six', 'Six');
    await concept('owner-start-retake', 'five', 'Five');
    for (const [conceptId, count] of [
      ['six', 6],
      ['five', 5],
    ] as const) {
      await addQuestions(
        'owner-start-retake',
        conceptId,
        Array.from({ length: count }, (_, i) => ({ id: `${conceptId}-${i}`, answer: '1' })),
      );
      // The previous attempt saw the first three ids. A retake must ask the
      // unseen ones first; with a bank of five it can only find two new ones.
      await insertCompletedSession('owner-start-retake', `${conceptId}-previous`, conceptId, [
        `${conceptId}-0`,
        `${conceptId}-1`,
        `${conceptId}-2`,
      ]);
    }

    const six = await start('owner-start-retake', 'six', 'six-session');
    assert.deepEqual(
      six.started.questions.map((q) => q.id),
      ['six-3', 'six-4', 'six-5'],
    );

    const five = await start('owner-start-retake', 'five', 'five-session');
    assert.deepEqual(
      five.started.questions.map((q) => q.id),
      ['five-3', 'five-4', 'five-1'],
    );
    // Two inserted previous attempts, plus the two retakes above.
    assert.equal(await sessionCount('owner-start-retake'), 4);
  });

  it('refuses an unknown session or one from another workspace, then grades once', async () => {
    await learner('owner-submit-guards');
    await learner('owner-submit-other');
    await concept('owner-submit-guards', 'guards', 'Guards');
    await addQuestions('owner-submit-guards', 'guards', [
      { id: 'g0', answer: '1', options: ['1', '2'] },
      { id: 'g1', answer: '2', options: ['1', '2'] },
      { id: 'g2', answer: '2', options: ['1', '2'] },
    ]);

    const { started } = await start('owner-submit-guards', 'guards', 'guard-session');
    const answers = await correctAnswers('owner-submit-guards', 'guards', started);

    await assert.rejects(
      submitQuiz(
        ws.db,
        graphFor('owner-submit-other'),
        'owner-submit-other',
        { sessionId: started.sessionId, answers },
        NOW,
      ),
      evidenceError('This quiz was not found. Start a new one.'),
    );
    await assert.rejects(
      submitQuiz(
        ws.db,
        graphFor('owner-submit-guards'),
        'owner-submit-guards',
        { sessionId: 'no-such-session', answers },
        NOW,
      ),
      evidenceError('This quiz was not found. Start a new one.'),
    );
    assert.equal((await rawSession('guard-session')).completed_at, null);
    assert.equal(await eventCount('owner-submit-other'), 0);
    assert.equal(await graphFor('owner-submit-other').getKnowledgeState('sam', 'guards'), null);

    // Incomplete and invalid answers never grade or touch the state.
    await assert.rejects(
      submitQuiz(
        ws.db,
        graphFor('owner-submit-guards'),
        'owner-submit-guards',
        { sessionId: started.sessionId, answers: {} },
        NOW,
      ),
      answerError('Answer every question first.'),
    );
    await assert.rejects(
      submitQuiz(
        ws.db,
        graphFor('owner-submit-guards'),
        'owner-submit-guards',
        {
          sessionId: started.sessionId,
          answers: Object.fromEntries(started.questions.map((q) => [q.id, 'not-an-option'])),
        },
        NOW,
      ),
      answerError('Answer every question first.'),
    );
    const untouched = await rawSession('guard-session');
    assert.equal(untouched.completed_at, null);
    assert.equal(untouched.answers, null);
    assert.equal(untouched.correct, null);
    assert.equal(await graphFor('owner-submit-guards').getKnowledgeState('sam', 'guards'), null);
    assert.equal(await eventCount('owner-submit-guards'), 0);

    const first = await submitQuiz(
      ws.db,
      graphFor('owner-submit-guards'),
      'owner-submit-guards',
      { sessionId: started.sessionId, answers },
      NOW,
    );
    assert.equal(first.passed, true);

    await assert.rejects(
      submitQuiz(
        ws.db,
        graphFor('owner-submit-guards'),
        'owner-submit-guards',
        { sessionId: started.sessionId, answers },
        NOW,
      ),
      evidenceError('This quiz is already graded. Start a new one.'),
    );
    assert.equal(await eventCount('owner-submit-guards'), 1);
    assert.equal((await rawSession('guard-session')).correct, 3);
    assert.equal(await sessionCount('owner-submit-guards'), 1);
  });

  it('returns the exact pass result, updates the session, state and event log', async () => {
    await learner('owner-submit-pass');
    await concept('owner-submit-pass', 'fractions', 'Fractions');
    await addQuestions(
      'owner-submit-pass',
      'fractions',
      ['q0', 'q1', 'q2', 'q3'].map((id, i) => ({
        id,
        answer: String(i + 1),
        explanation: `Because ${i + 1}.`,
      })),
    );

    const { started } = await start('owner-submit-pass', 'fractions', 'pass-session');
    const answers = await correctAnswers('owner-submit-pass', 'fractions', started);
    const snapshot = (await rawSession('pass-session')).questions;

    const result = await submitQuiz(
      ws.db,
      graphFor('owner-submit-pass'),
      'owner-submit-pass',
      { sessionId: started.sessionId, answers },
      NOW,
    );

    assert.deepEqual(Object.keys(result).sort(), [
      'conceptId',
      'conceptName',
      'correct',
      'feedback',
      'mastery',
      'masteryBefore',
      'passed',
      'total',
      'wasDue',
    ]);
    const expected: QuizResult = {
      conceptId: 'fractions',
      conceptName: 'Fractions',
      correct: 3,
      total: 3,
      passed: true,
      wasDue: false,
      masteryBefore: 0,
      mastery: 85,
      feedback: snapshot.map((q) => ({
        questionId: q.id,
        picked: q.answer,
        correct: true,
        prompt: q.prompt,
        answer: q.answer,
        explanation: q.explanation,
      })),
    };
    assert.deepEqual(result, expected);
    for (const item of result.feedback) {
      assert.deepEqual(Object.keys(item).sort(), [
        'answer',
        'correct',
        'explanation',
        'picked',
        'prompt',
        'questionId',
      ]);
    }

    const session = await rawSession('pass-session');
    assert.deepEqual(session.answers, answers);
    assert.equal(session.correct, 3);
    assert.equal(session.total, 3);
    assert.equal(isoOf(session.completed_at!), NOW.toISOString());

    const state = (await graphFor('owner-submit-pass').getKnowledgeState('sam', 'fractions'))!;
    assert.equal(state.mastery, 85);
    assert.equal(state.masterySource, 'quiz');
    assert.equal(state.retentionStrength, 0.8);
    assert.equal(state.reviewCount, 0);
    assert.equal(state.lastReviewed, NOW.toISOString());
    assert.equal(state.lastAssessed, NOW.toISOString());
    assert.equal(state.nextReview, NOW.toISOString());

    const events = await listEvents(ws.db, 'owner-submit-pass', { learnerId: 'sam' });
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(typeof event.id, 'number');
    assert.equal(event.learnerId, 'sam');
    assert.equal(event.conceptId, 'fractions');
    assert.equal(event.kind, 'quiz');
    assert.equal(event.outcome, 'passed');
    assert.equal(event.source, 'app');
    assert.equal(event.wasDue, false);
    assert.equal(event.correct, 3);
    assert.equal(event.total, 3);
    assert.equal(event.masteryBefore, 0);
    assert.equal(event.masteryAfter, 85);
    assert.deepEqual(event.detail, {
      sessionId: 'pass-session',
      answers: snapshot.map((q) => ({ questionId: q.id, picked: q.answer, correct: true })),
    });
    // Rough edge: the event timestamp comes from the DB default, not `NOW`.
    assert.ok(isIso(event.createdAt));
  });

  it('maps a failed quiz to round(accuracy × 70), keeping the schedule restarted', async () => {
    await learner('owner-submit-fail');
    const cases = [
      { conceptId: 'fail-2', wrong: 1, correct: 2, mastery: 47 },
      { conceptId: 'fail-1', wrong: 2, correct: 1, mastery: 23 },
      { conceptId: 'fail-0', wrong: 3, correct: 0, mastery: 0 },
    ];

    for (const { conceptId, wrong, correct, mastery } of cases) {
      await concept('owner-submit-fail', conceptId, conceptId);
      await addQuestions('owner-submit-fail', conceptId, [
        { id: `${conceptId}-a`, answer: 'a', options: ['a', 'wrong-a'] },
        { id: `${conceptId}-b`, answer: 'b', options: ['b', 'wrong-b'] },
        { id: `${conceptId}-c`, answer: 'c', options: ['c', 'wrong-c'] },
      ]);

      const { started } = await start('owner-submit-fail', conceptId, `${conceptId}-session`);
      const bank = await listQuestions(ws.db, 'owner-submit-fail', conceptId);
      const answers = Object.fromEntries(
        started.questions.map((q, i) => {
          const answer = bank.find((b) => b.id === q.id)!.answer;
          return [q.id, i < wrong ? q.options.find((option) => option !== answer)! : answer];
        }),
      );

      const result = await submitQuiz(
        ws.db,
        graphFor('owner-submit-fail'),
        'owner-submit-fail',
        { sessionId: started.sessionId, answers },
        NOW,
      );
      assert.equal(result.correct, correct);
      assert.equal(result.total, 3);
      assert.equal(result.passed, false);
      assert.equal(result.wasDue, false);
      assert.equal(result.masteryBefore, 0);
      assert.equal(result.mastery, mastery);
      assert.deepEqual(
        result.feedback.map((item) => item.correct),
        started.questions.map((_, i) => i >= wrong),
      );

      const state = (await graphFor('owner-submit-fail').getKnowledgeState('sam', conceptId))!;
      assert.equal(state.mastery, mastery);
      assert.equal(state.masterySource, 'quiz');
      assert.equal(state.reviewCount, 0);
      assert.equal(state.retentionStrength, 0.3);
      assert.equal(state.lastReviewed, NOW.toISOString());
      assert.equal(state.lastAssessed, NOW.toISOString());
      assert.equal(state.nextReview, NOW.toISOString());

      const events = await listEvents(ws.db, 'owner-submit-fail', { learnerId: 'sam' });
      const event = events.find((e) => e.conceptId === conceptId)!;
      assert.equal(event.outcome, 'failed');
      assert.equal(event.correct, correct);
      assert.equal(event.total, 3);
      assert.equal(event.masteryBefore, 0);
      assert.equal(event.masteryAfter, mastery);
      assert.equal(event.wasDue, false);
    }
  });

  it('reports a due review and grows the interval only for a due pass', async () => {
    await learner('owner-submit-due', 'sam', 'Sam');
    await learner('owner-submit-due', 'kim', 'Kim');
    await concept('owner-submit-due', 'fractions', 'Fractions');
    await addQuestions(
      'owner-submit-due',
      'fractions',
      ['q0', 'q1', 'q2', 'q3'].map((id, i) => ({ id, answer: String(i + 1) })),
    );

    const longAgo = new Date(NOW.getTime() - 40 * 86_400_000).toISOString();
    await graphFor('owner-submit-due').setKnowledgeState('sam', 'fractions', {
      mastery: 85,
      reviewCount: 1,
      retentionStrength: 0.8,
      lastReviewed: longAgo,
    });
    const due = await start('owner-submit-due', 'fractions', 'due-session');
    const dueResult = await submitQuiz(
      ws.db,
      graphFor('owner-submit-due'),
      'owner-submit-due',
      {
        sessionId: due.started.sessionId,
        answers: await correctAnswers('owner-submit-due', 'fractions', due.started),
      },
      NOW,
    );
    assert.equal(dueResult.wasDue, true);
    assert.equal(dueResult.masteryBefore, 85);
    assert.equal(dueResult.mastery, 85);

    const dueState = (await graphFor('owner-submit-due').getKnowledgeState('sam', 'fractions'))!;
    assert.equal(dueState.reviewCount, 2);
    assert.equal(dueState.retentionStrength, 0.9);
    assert.equal(dueState.lastReviewed, NOW.toISOString());
    assert.equal(dueState.lastAssessed, NOW.toISOString());
    assert.equal(dueState.nextReview, NOW.toISOString());
    const dueEvent = (await listEvents(ws.db, 'owner-submit-due', { learnerId: 'sam' })).at(-1)!;
    assert.equal(dueEvent.wasDue, true);

    const recent = new Date(NOW.getTime() - 3_600_000).toISOString();
    await graphFor('owner-submit-due').setKnowledgeState('kim', 'fractions', {
      mastery: 85,
      reviewCount: 2,
      retentionStrength: 0.8,
      lastReviewed: recent,
    });
    const early = await start('owner-submit-due', 'fractions', 'not-due-session', 'kim');
    const earlyResult = await submitQuiz(
      ws.db,
      graphFor('owner-submit-due'),
      'owner-submit-due',
      {
        sessionId: early.started.sessionId,
        answers: await correctAnswers('owner-submit-due', 'fractions', early.started),
      },
      NOW,
    );
    assert.equal(earlyResult.wasDue, false);
    assert.equal(earlyResult.masteryBefore, 85);
    assert.equal(earlyResult.mastery, 85);

    const earlyState = (await graphFor('owner-submit-due').getKnowledgeState('kim', 'fractions'))!;
    // An early retake keeps the existing schedule untouched.
    assert.equal(earlyState.reviewCount, 2);
    assert.equal(earlyState.retentionStrength, 0.8);
    assert.equal(earlyState.lastReviewed, recent);
    assert.equal(earlyState.lastAssessed, NOW.toISOString());
    assert.equal(earlyState.nextReview, undefined);
    const earlyEvent = (await listEvents(ws.db, 'owner-submit-due', { learnerId: 'kim' })).at(-1)!;
    assert.equal(earlyEvent.wasDue, false);
  });

  it('grades a session whose concept was deleted after it started', async () => {
    await learner('owner-submit-deleted');
    await concept('owner-submit-deleted', 'gone', 'Gone');
    await addQuestions('owner-submit-deleted', 'gone', [
      { id: 'gone-0', answer: 'a', options: ['a', 'b'] },
      { id: 'gone-1', answer: 'b', options: ['a', 'b'] },
    ]);

    const { started } = await start('owner-submit-deleted', 'gone', 'gone-session');
    const answers = await correctAnswers('owner-submit-deleted', 'gone', started);
    await graphFor('owner-submit-deleted').deleteConcept('gone');
    assert.deepEqual(await listQuestions(ws.db, 'owner-submit-deleted', 'gone'), []);

    const result = await submitQuiz(
      ws.db,
      graphFor('owner-submit-deleted'),
      'owner-submit-deleted',
      { sessionId: started.sessionId, answers },
      NOW,
    );
    assert.equal(result.conceptId, 'gone');
    assert.equal(result.conceptName, 'gone');
    assert.equal(result.correct, 2);
    assert.equal(result.total, 2);
    assert.equal(result.passed, true);
    assert.equal(result.mastery, 85);

    const state = (await graphFor('owner-submit-deleted').getKnowledgeState('sam', 'gone'))!;
    assert.equal(state.mastery, 85);
    assert.equal(state.masterySource, 'quiz');

    const events = await listEvents(ws.db, 'owner-submit-deleted', { learnerId: 'sam' });
    assert.equal(events.length, 1);
    assert.equal(events[0].conceptId, 'gone');
    assert.equal(events[0].kind, 'quiz');
    assert.equal(events[0].outcome, 'passed');
  });

  it('keeps the session queries, guards and older evidence tests (static guard)', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'service.ts'),
      'utf8',
    );

    const startIndex = source.indexOf('export async function startQuiz');
    const startEnd = source.indexOf('export interface QuizResult');
    assert.ok(startIndex >= 0 && startEnd > startIndex);
    const startSource = source.slice(startIndex, startEnd);
    // The learner/concept check comes first, then the bank, then the draw.
    assert.ok(
      startSource.indexOf('requireLearnerAndConcept(') < startSource.indexOf('listQuestions('),
    );
    assert.ok(startSource.indexOf('completedAttempts(') < startSource.indexOf('pickQuestions('));
    assert.match(startSource, /QUIZ_LENGTH/);
    assert.match(startSource, /random\.int/);
    assert.equal([...startSource.matchAll(/random\.uuid\(\)/g)].length, 1);
    // The full snapshot keeps the answer key; the returned view drops it.
    assert.match(startSource, /answer: q\.answer/);
    assert.match(startSource, /explanation: q\.explanation/);
    assert.match(startSource, /options: shuffled\(q\.options, random\.int\)/);
    assert.match(startSource, /questions: jsonb\(questions\)/);
    assert.match(
      startSource,
      /questions\.map\(\(\{ id, prompt, options \}\) => \(\{ id, prompt, options \}\)\)/,
    );

    const submitIndex = source.indexOf('export async function submitQuiz');
    const submitEnd = source.indexOf('// Self-reports');
    assert.ok(submitIndex >= 0 && submitEnd > submitIndex);
    const submitSource = source.slice(submitIndex, submitEnd);
    assert.match(
      submitSource,
      /\.selectFrom\('quiz_sessions'\)[\s\S]*?\.where\('owner_id', '=', owner\)[\s\S]*?\.where\('id', '=', input\.sessionId\)/,
    );
    const completedGuard = submitSource.indexOf('if (session.completed_at)');
    const grading = submitSource.indexOf('gradeQuiz(');
    assert.ok(completedGuard >= 0 && completedGuard < grading);
    assert.equal(submitSource.match(/updateTable\('quiz_sessions'\)/g)?.length, 1);
    const updateGuard = submitSource.indexOf(".where('completed_at', 'is', null)");
    const returnedId = submitSource.indexOf(".returning('id')");
    const doneGuard = submitSource.indexOf('if (!done)');
    const patchCall = submitSource.indexOf('quizStatePatch(');
    const eventCall = submitSource.indexOf('appendEvent(');
    assert.ok(updateGuard >= 0 && returnedId > updateGuard);
    assert.ok(doneGuard > returnedId && doneGuard < patchCall);
    assert.ok(patchCall > doneGuard && eventCall > patchCall);

    const older = readFileSync(join(import.meta.dirname, 'learning-evidence.test.ts'), 'utf8');
    for (const title of [
      'a quiz never sends the answer key, and only a passed quiz makes the concept mastered',
      'a quiz is graded once, and only in its own workspace',
      'every answer and review is an event bound to its account',
    ]) {
      assert.ok(older.includes(title), title);
    }
  });
});
