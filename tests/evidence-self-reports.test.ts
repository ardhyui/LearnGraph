/**
 * Direct unit tests for the self-reports in `src/lib/evidence/service.ts` —
 * `recordSelfReport`.
 *
 * Until now self-reports were only exercised through `tests/learning-evidence.test.ts`
 * (one refusal plus one event per account). Here the DB layer and orchestration
 * are locked down at the service's own level: the learner/concept and evidence
 * guards (D5) for every mastery-changing outcome, the exact state each of the
 * six outcomes writes (including `masterySource: 'self_report'`), the one
 * interaction appended per mastery-changing report (sanitised, capped at
 * `MAX_INTERACTIONS`), and the single event row per call with its `wasDue`
 * rule. `applyStudyOutcome`/`applyReviewOutcome`/`applySnooze`/`applyUnsnooze`
 * and `reviewWasDue` themselves are not re-tested: they are locked in
 * `tests/study.test.ts`, `tests/snooze.test.ts`, `tests/unsnooze.test.ts` and
 * `tests/review-priority.test.ts`.
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
import { PostgresGraphStore } from '../src/lib/graph/store.ts';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import type { ConceptNode, LearningInteraction } from '../src/lib/graph/types.ts';
import { MAX_INTERACTIONS } from '../src/lib/graph/interactions.ts';
import { SNOOZE_DAYS } from '../src/lib/graph/spacing.ts';
import {
  EvidenceError,
  EvidenceRequiredError,
  listEvents,
  recordSelfReport,
  requiresEvidence,
  saveQuestion,
  type SelfReportOutcome,
} from '../src/lib/evidence/service.ts';

const DIR = join(tmpdir(), `learngraph-evidence-self-reports-${process.pid}`);
const NOW = new Date('2026-11-10T09:00:00Z');
const DAY = 86_400_000;
/** `now` shifted by whole days, as an ISO string. */
const shifted = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const MASTERY_OUTCOMES = ['got-it', 'started', 'remembered', 'forgot'] as const;

const evidenceError = (message: string) => (error: unknown) => {
  assert.ok(error instanceof EvidenceError, `expected EvidenceError, got ${String(error)}`);
  assert.equal(error.message, message);
  return true;
};

const evidenceRequired = (message: string) => (error: unknown) => {
  assert.ok(error instanceof EvidenceRequiredError, `expected EvidenceRequiredError, got ${String(error)}`);
  assert.ok(error instanceof EvidenceError, 'EvidenceRequiredError is an EvidenceError');
  assert.equal(error.message, message);
  return true;
};

const isIso = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);

describe('self-reports service on PGlite', () => {
  let ws: Awaited<ReturnType<typeof openTestWorkspaces>>;
  const graphs = new Map<string, EducationGraphDB>();

  const graphFor = (owner: string) => graphs.get(owner)!;

  const learner = (owner: string, learnerId = 'sam', name = 'Sam') =>
    graphFor(owner).setLearnerProfile(learnerId, { name });

  const concept = (owner: string, conceptId: string, name = conceptId, extra: Partial<ConceptNode> = {}) =>
    graphFor(owner).addConcept({ conceptId, name, domain: 'mathematics', ...extra });

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

  const report = (owner: string, learnerId: string, conceptId: string, outcome: SelfReportOutcome) =>
    recordSelfReport(ws.db, graphFor(owner), owner, { learnerId, conceptId, outcome }, NOW);

  const eventCount = async (owner: string) =>
    Number(
      (
        await sql<{ n: number }>`select count(*)::int as n from learning_events where owner_id = ${owner}`.execute(
          ws.db,
        )
      ).rows[0].n,
    );

  const stateRowCount = async (owner: string) =>
    Number(
      (
        await sql<{ n: number }>`select count(*)::int as n from knowledge_states where owner_id = ${owner}`.execute(
          ws.db,
        )
      ).rows[0].n,
    );

  const lastEvent = (owner: string, learnerId = 'sam') =>
    listEvents(ws.db, owner, { learnerId }).then((events) => events.at(-1)!);

  const OWNERS = [
    'owner-report-missing',
    'owner-report-quiz',
    'owner-report-iso',
    'owner-report-iso-other',
    'owner-report-got',
    'owner-report-started',
    'owner-report-remembered',
    'owner-report-forgot',
    'owner-report-history',
    'owner-report-due',
    'owner-report-schedule',
  ];

  before(async () => {
    ws = await openTestWorkspaces(DIR, OWNERS);
    for (const owner of OWNERS) graphs.set(owner, await ws.graphFor(owner));
  });

  after(async () => {
    await ws.close();
    rmSync(DIR, { recursive: true, force: true });
  });

  it('refuses a missing learner or concept before anything is written', async () => {
    const owner = 'owner-report-missing';
    await learner(owner);
    await concept(owner, 'plain', 'Plain');

    // The learner/concept check comes first, for every outcome.
    for (const outcome of ['got-it', 'snooze'] as const) {
      await assert.rejects(report(owner, 'ghost', 'plain', outcome), evidenceError('That learner no longer exists.'));
    }
    await assert.rejects(report(owner, 'sam', 'absent', 'got-it'), evidenceError('That concept no longer exists.'));

    assert.equal(await graphFor(owner).getKnowledgeState('sam', 'plain'), null);
    assert.equal(await stateRowCount(owner), 0);
    assert.equal(await eventCount(owner), 0);
  });

  it('refuses mastery-changing reports for quiz-checked concepts, but snooze and unsnooze pass', async () => {
    const owner = 'owner-report-quiz';
    await learner(owner);
    await concept(owner, 'quizzy', 'Quizzy');
    await addQuestions(owner, 'quizzy', ['q1']);
    // A flagged concept needs evidence without any questions in the bank.
    await concept(owner, 'jp-topic', 'Hiragana', { domain: 'japanese', evidenceRequired: true });
    await concept(owner, 'free', 'Free');

    for (const outcome of MASTERY_OUTCOMES) {
      await assert.rejects(
        report(owner, 'sam', 'quizzy', outcome),
        evidenceRequired('“Quizzy” is quiz-checked: its mastery only changes through its quiz.'),
      );
      await assert.rejects(
        report(owner, 'sam', 'jp-topic', outcome),
        evidenceRequired('“Hiragana” is quiz-checked: its mastery only changes through the Japanese page.'),
      );
    }
    // Refused before writing: no state rows and no events.
    assert.equal(await stateRowCount(owner), 0);
    assert.equal(await eventCount(owner), 0);

    // Postponing is always allowed, even on a quiz-checked concept.
    await learner(owner, 'kim', 'Kim');
    await report(owner, 'sam', 'quizzy', 'snooze');
    await report(owner, 'kim', 'quizzy', 'unsnooze');
    assert.ok((await graphFor(owner).getKnowledgeState('sam', 'quizzy')) !== null);
    const events = await listEvents(ws.db, owner);
    assert.deepEqual(
      events.map((e) => `${e.kind}:${e.outcome}`),
      ['snooze:snoozed', 'unsnooze:unsnooze'],
    );
  });

  it('lets a report through when only another workspace has questions for the same concept id', async () => {
    const owner = 'owner-report-iso';
    const other = 'owner-report-iso-other';
    await learner(owner);
    await learner(other);
    await concept(owner, 'quizzy', 'Quizzy');
    await concept(other, 'quizzy', 'Other Quizzy');
    await addQuestions(other, 'quizzy', ['theirs']);

    assert.equal((await requiresEvidence(ws.db, graphFor(owner), owner, 'quizzy')).required, false);
    const result = await report(owner, 'sam', 'quizzy', 'got-it');
    assert.deepEqual(result, { mastery: 85 });
    assert.equal(await stateRowCount(other), 0);
    assert.equal(await eventCount(other), 0);
    assert.equal(await eventCount(owner), 1);
    assert.equal((await lastEvent(owner)).kind, 'study');
  });

  it('masters a concept from "got-it" on a fresh state and stamps it self_report', async () => {
    const owner = 'owner-report-got';
    await learner(owner);
    await concept(owner, 'fresh', 'Fresh');

    const result = await report(owner, 'sam', 'fresh', 'got-it');
    assert.deepEqual(Object.keys(result).sort(), ['mastery']);
    assert.equal(result.mastery, 85);

    const state = (await graphFor(owner).getKnowledgeState('sam', 'fresh'))!;
    assert.equal(state.mastery, 85);
    assert.equal(state.masterySource, 'self_report');
    assert.equal(state.retentionStrength, 0.8);
    assert.equal(state.reviewCount, 0);
    assert.equal(state.lastReviewed, NOW.toISOString());
    assert.equal(state.lastAssessed, NOW.toISOString());
    assert.equal(state.nextReview, NOW.toISOString());
    assert.deepEqual(state.interactions, [{ timestamp: NOW.toISOString(), type: 'lesson', duration: 0 }]);

    assert.equal(await eventCount(owner), 1);
    const event = await lastEvent(owner);
    assert.equal(typeof event.id, 'number');
    assert.equal(event.learnerId, 'sam');
    assert.equal(event.conceptId, 'fresh');
    assert.equal(event.kind, 'study');
    assert.equal(event.outcome, 'got-it');
    assert.equal(event.source, 'app');
    assert.equal(event.wasDue, false);
    assert.equal(event.correct, null);
    assert.equal(event.total, null);
    assert.equal(event.masteryBefore, 0);
    assert.equal(event.masteryAfter, 85);
    assert.deepEqual(event.detail, {});
    // The event timestamp comes from the DB default, not from `NOW`.
    assert.ok(isIso(event.createdAt));
  });

  it('keeps the review count of a mastered state and lifts it to 85 on "got-it"', async () => {
    const owner = 'owner-report-got';
    await learner(owner, 'kim', 'Kim');
    await concept(owner, 'mastered', 'Mastered');
    await graphFor(owner).setKnowledgeState('kim', 'mastered', {
      mastery: 80,
      reviewCount: 5,
      retentionStrength: 0.6,
      lastReviewed: shifted(-30),
      interactions: [{ timestamp: shifted(-29), type: 'review', duration: 3 }],
    });

    const result = await report(owner, 'kim', 'mastered', 'got-it');
    assert.equal(result.mastery, 85);

    const state = (await graphFor(owner).getKnowledgeState('kim', 'mastered'))!;
    assert.equal(state.mastery, 85);
    assert.equal(state.reviewCount, 5);
    assert.equal(state.retentionStrength, 0.8);
    assert.equal(state.masterySource, 'self_report');
    assert.deepEqual(state.interactions, [
      { timestamp: shifted(-29), type: 'review', duration: 3 },
      { timestamp: NOW.toISOString(), type: 'lesson', duration: 0 },
    ]);

    const event = await lastEvent(owner, 'kim');
    assert.equal(event.kind, 'study');
    assert.equal(event.outcome, 'got-it');
    assert.equal(event.masteryBefore, 80);
    assert.equal(event.masteryAfter, 85);
  });

  it('moves mastery into progress with "started" without ever counting it mastered', async () => {
    const owner = 'owner-report-started';
    await learner(owner);
    await concept(owner, 's0', 'S0');
    await concept(owner, 's59', 'S59');
    await concept(owner, 's79', 'S79');
    await concept(owner, 's80', 'S80');
    await concept(owner, 's85', 'S85');
    await graphFor(owner).setKnowledgeState('sam', 's59', {
      mastery: 59,
      reviewCount: 7,
      retentionStrength: 0.65,
      lastReviewed: shifted(-10),
    });
    await graphFor(owner).setKnowledgeState('sam', 's79', { mastery: 79 });
    await graphFor(owner).setKnowledgeState('sam', 's80', {
      mastery: 80,
      reviewCount: 2,
      retentionStrength: 0.4,
    });
    await graphFor(owner).setKnowledgeState('sam', 's85', { mastery: 85 });

    // Fresh state: 0 → 50 with the `?? 0` / `?? 0.5` defaults.
    const fresh = await report(owner, 'sam', 's0', 'started');
    assert.equal(fresh.mastery, 50);
    const freshState = (await graphFor(owner).getKnowledgeState('sam', 's0'))!;
    assert.equal(freshState.mastery, 50);
    assert.equal(freshState.reviewCount, 0);
    assert.equal(freshState.retentionStrength, 0.5);
    assert.equal(freshState.masterySource, 'self_report');

    const cases: [string, number, number | null, number | null][] = [
      ['s59', 79, 7, 0.65],
      ['s79', 79, 0, null],
      ['s80', 80, 2, 0.4],
      ['s85', 85, 0, null],
    ];
    for (const [conceptId, mastery, reviewCount, retention] of cases) {
      const result = await report(owner, 'sam', conceptId, 'started');
      assert.equal(result.mastery, mastery, conceptId);
      const state = (await graphFor(owner).getKnowledgeState('sam', conceptId))!;
      assert.equal(state.mastery, mastery, conceptId);
      assert.equal(state.masterySource, 'self_report', conceptId);
      assert.equal(state.lastReviewed, NOW.toISOString(), conceptId);
      assert.equal(state.lastAssessed, NOW.toISOString(), conceptId);
      assert.equal(state.nextReview, NOW.toISOString(), conceptId);
      if (reviewCount !== null) assert.equal(state.reviewCount, reviewCount, conceptId);
      if (retention !== null) assert.equal(state.retentionStrength, retention, conceptId);
      assert.deepEqual(
        state.interactions,
        [{ timestamp: NOW.toISOString(), type: 'lesson', duration: 0 }],
        conceptId,
      );
      const event = (await listEvents(ws.db, owner)).find((e) => e.conceptId === conceptId)!;
      assert.equal(event.kind, 'study');
      assert.equal(event.outcome, 'started');
    }
  });

  it('grows mastery, review count and retention with "remembered"', async () => {
    const owner = 'owner-report-remembered';
    await learner(owner);
    await concept(owner, 'r0', 'R0');
    await concept(owner, 'r85', 'R85');
    await concept(owner, 'r20', 'R20');
    await graphFor(owner).setKnowledgeState('sam', 'r85', {
      mastery: 85,
      reviewCount: 4,
      retentionStrength: 0.95,
      lastReviewed: shifted(-3),
    });
    await graphFor(owner).setKnowledgeState('sam', 'r20', {
      mastery: 20,
      reviewCount: 2,
      retentionStrength: 0.6,
    });

    // Fresh: clamp(max(0, 40) + 5) = 45, reviewCount 1, 0.5 → 0.6.
    const fresh = await report(owner, 'sam', 'r0', 'remembered');
    assert.equal(fresh.mastery, 45);
    const freshState = (await graphFor(owner).getKnowledgeState('sam', 'r0'))!;
    assert.equal(freshState.mastery, 45);
    assert.equal(freshState.reviewCount, 1);
    assert.equal(freshState.retentionStrength, 0.6);
    assert.equal(freshState.masterySource, 'self_report');
    assert.deepEqual(freshState.interactions, [{ timestamp: NOW.toISOString(), type: 'review', duration: 0 }]);

    const strong = await report(owner, 'sam', 'r85', 'remembered');
    assert.equal(strong.mastery, 90);
    const strongState = (await graphFor(owner).getKnowledgeState('sam', 'r85'))!;
    assert.equal(strongState.reviewCount, 5);
    assert.equal(strongState.retentionStrength, 1);

    const weak = await report(owner, 'sam', 'r20', 'remembered');
    assert.equal(weak.mastery, 45);
    const weakState = (await graphFor(owner).getKnowledgeState('sam', 'r20'))!;
    assert.equal(weakState.reviewCount, 3);
    assert.equal(weakState.retentionStrength, 0.7);

    const events = await listEvents(ws.db, owner);
    assert.deepEqual(
      events.map((e) => `${e.kind}:${e.outcome}:${e.masteryBefore}>${e.masteryAfter}`),
      ['review:remembered:0>45', 'review:remembered:85>90', 'review:remembered:20>45'],
    );
  });

  it('restarts the schedule with "forgot" without dropping below reviewable', async () => {
    const owner = 'owner-report-forgot';
    await learner(owner);
    await concept(owner, 'f0', 'F0');
    await concept(owner, 'f85', 'F85');
    await concept(owner, 'f50', 'F50');
    await graphFor(owner).setKnowledgeState('sam', 'f85', {
      mastery: 85,
      reviewCount: 6,
      retentionStrength: 0.6,
      lastReviewed: shifted(-5),
    });
    await graphFor(owner).setKnowledgeState('sam', 'f50', {
      mastery: 50,
      reviewCount: 3,
      retentionStrength: 0.15,
    });

    // Fresh: clamp(0 − 20, 40, 100) = 40, reviewCount 0, 0.5 → 0.3.
    const fresh = await report(owner, 'sam', 'f0', 'forgot');
    assert.equal(fresh.mastery, 40);
    const freshState = (await graphFor(owner).getKnowledgeState('sam', 'f0'))!;
    assert.equal(freshState.reviewCount, 0);
    assert.equal(freshState.retentionStrength, 0.3);
    assert.equal(freshState.masterySource, 'self_report');
    assert.deepEqual(freshState.interactions, [{ timestamp: NOW.toISOString(), type: 'review', duration: 0 }]);

    const strong = await report(owner, 'sam', 'f85', 'forgot');
    assert.equal(strong.mastery, 65);
    const strongState = (await graphFor(owner).getKnowledgeState('sam', 'f85'))!;
    assert.equal(strongState.reviewCount, 0);
    assert.equal(strongState.retentionStrength, 0.4);
    assert.equal(strongState.nextReview, NOW.toISOString());

    // 50 − 20 = 30 is clamped back up to the reviewable floor.
    const weak = await report(owner, 'sam', 'f50', 'forgot');
    assert.equal(weak.mastery, 40);
    const weakState = (await graphFor(owner).getKnowledgeState('sam', 'f50'))!;
    assert.equal(weakState.reviewCount, 0);
    assert.equal(weakState.retentionStrength, 0.1);

    const events = await listEvents(ws.db, owner);
    assert.deepEqual(
      events.map((e) => `${e.kind}:${e.outcome}:${e.masteryBefore}>${e.masteryAfter}`),
      ['review:forgot:0>40', 'review:forgot:85>65', 'review:forgot:50>40'],
    );
  });

  it('keeps valid interaction history in order, drops broken entries and caps at MAX_INTERACTIONS', async () => {
    const owner = 'owner-report-history';
    await learner(owner);
    assert.equal(MAX_INTERACTIONS, 1000);

    await concept(owner, 'mixed', 'Mixed');
    // Anything may sit in a stored `interactions` value; only valid entries survive.
    const messy: unknown[] = [
      { timestamp: '2026-10-01T08:00:00Z', type: 'lesson', duration: 12, score: 90, bloomLevel: 2, notes: 'read' },
      { timestamp: 'not-a-date', type: 'lesson', duration: 5 },
      { timestamp: '2026-10-02T08:00:00Z', type: 'webinar', duration: 5 },
      'string',
      42,
      null,
      { timestamp: '2026-10-03T08:00:00Z', type: 'quiz' },
      { timestamp: '2026-10-04T08:00:00Z', type: 'review', duration: -1 },
      { timestamp: '2026-10-05T08:00:00Z', type: 'practice', duration: 7 },
    ];
    await graphFor(owner).setKnowledgeState('sam', 'mixed', {
      mastery: 60,
      interactions: messy as LearningInteraction[],
    });
    await report(owner, 'sam', 'mixed', 'remembered');
    const mixed = (await graphFor(owner).getKnowledgeState('sam', 'mixed'))!;
    assert.deepEqual(mixed.interactions, [
      { timestamp: '2026-10-01T08:00:00Z', type: 'lesson', duration: 12, score: 90, bloomLevel: 2, notes: 'read' },
      { timestamp: '2026-10-05T08:00:00Z', type: 'practice', duration: 7 },
      { timestamp: NOW.toISOString(), type: 'review', duration: 0 },
    ]);

    // A legacy state without an `interactions` value still gets the new entry.
    await concept(owner, 'bare', 'Bare');
    const raw = new PostgresGraphStore(ws.db, owner);
    await raw.put('state:sam:bare', { userId: 'sam', conceptId: 'bare', mastery: 50, updatedAt: NOW.toISOString() });
    await report(owner, 'sam', 'bare', 'got-it');
    const bare = (await graphFor(owner).getKnowledgeState('sam', 'bare'))!;
    assert.deepEqual(bare.interactions, [{ timestamp: NOW.toISOString(), type: 'lesson', duration: 0 }]);

    // A full history plus the new entry keeps only the last MAX_INTERACTIONS.
    await concept(owner, 'cap', 'Cap');
    const many: LearningInteraction[] = Array.from({ length: MAX_INTERACTIONS }, (_, i) => ({
      timestamp: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 60_000).toISOString(),
      type: 'practice' as const,
      duration: i,
    }));
    await graphFor(owner).setKnowledgeState('sam', 'cap', { mastery: 70, interactions: many });
    await report(owner, 'sam', 'cap', 'forgot');
    const capped = (await graphFor(owner).getKnowledgeState('sam', 'cap'))!;
    assert.equal(capped.interactions.length, MAX_INTERACTIONS);
    assert.equal(capped.interactions[0].timestamp, many[1].timestamp);
    assert.deepEqual(capped.interactions.at(-1), { timestamp: NOW.toISOString(), type: 'review', duration: 0 });
  });

  it('marks review-type events due by the schedule, and never study reports', async () => {
    const owner = 'owner-report-due';
    // Default concept difficulty is absolute 5: with reviewCount 1 the review
    // falls due 3 days after the last one.
    await concept(owner, 'rev', 'Rev');
    const overdue = { mastery: 85, reviewCount: 1, retentionStrength: 0.8, lastReviewed: shifted(-40) };
    const recent = { mastery: 85, reviewCount: 1, retentionStrength: 0.8, lastReviewed: shifted(-1 / 24) };
    for (const learnerId of ['due-review', 'due-recent', 'due-snooze', 'due-unsnooze', 'due-got', 'due-start']) {
      await learner(owner, learnerId, learnerId);
    }
    await graphFor(owner).setKnowledgeState('due-review', 'rev', overdue);
    await graphFor(owner).setKnowledgeState('due-recent', 'rev', recent);
    await graphFor(owner).setKnowledgeState('due-snooze', 'rev', overdue);
    await graphFor(owner).setKnowledgeState('due-unsnooze', 'rev', overdue);
    await graphFor(owner).setKnowledgeState('due-got', 'rev', overdue);
    await graphFor(owner).setKnowledgeState('due-start', 'rev', overdue);

    await report(owner, 'due-review', 'rev', 'remembered');
    const dueReview = await lastEvent(owner, 'due-review');
    assert.equal(dueReview.wasDue, true);
    const grown = (await graphFor(owner).getKnowledgeState('due-review', 'rev'))!;
    assert.equal(grown.reviewCount, 2);
    assert.equal(grown.retentionStrength, 0.9);

    await report(owner, 'due-recent', 'rev', 'remembered');
    assert.equal((await lastEvent(owner, 'due-recent')).wasDue, false);

    await report(owner, 'due-snooze', 'rev', 'snooze');
    const snoozeEvent = await lastEvent(owner, 'due-snooze');
    assert.equal(`${snoozeEvent.kind}:${snoozeEvent.outcome}`, 'snooze:snoozed');
    assert.equal(snoozeEvent.wasDue, true);

    await report(owner, 'due-unsnooze', 'rev', 'unsnooze');
    const unsnoozeEvent = await lastEvent(owner, 'due-unsnooze');
    assert.equal(`${unsnoozeEvent.kind}:${unsnoozeEvent.outcome}`, 'unsnooze:unsnooze');
    assert.equal(unsnoozeEvent.wasDue, true);

    // Studying is never a due review, even on an overdue state.
    await report(owner, 'due-got', 'rev', 'got-it');
    assert.equal((await lastEvent(owner, 'due-got')).wasDue, false);
    await report(owner, 'due-start', 'rev', 'started');
    assert.equal((await lastEvent(owner, 'due-start')).wasDue, false);

    // Exactly one event row per call.
    assert.equal(await eventCount(owner), 6);
  });

  it('moves only nextReview for snooze and unsnooze', async () => {
    const owner = 'owner-report-schedule';
    assert.equal(SNOOZE_DAYS, 1);
    await learner(owner);
    await concept(owner, 'alpha', 'Alpha');
    for (const learnerId of ['kim', 'lee', 'max', 'nia', 'oli', 'pia']) {
      await learner(owner, learnerId, learnerId);
    }

    // Snooze on a fresh state creates it with only nextReview set beyond the defaults.
    await report(owner, 'sam', 'alpha', 'snooze');
    const fresh = (await graphFor(owner).getKnowledgeState('sam', 'alpha'))!;
    assert.equal(fresh.nextReview, shifted(SNOOZE_DAYS));
    assert.equal(fresh.mastery, 0);
    assert.equal(fresh.reviewCount, 0);
    assert.equal(fresh.masterySource, undefined);
    assert.equal(fresh.lastReviewed, undefined);
    assert.deepEqual(fresh.interactions, []);
    const freshEvent = await lastEvent(owner, 'sam');
    assert.equal(`${freshEvent.kind}:${freshEvent.outcome}`, 'snooze:snoozed');
    assert.equal(freshEvent.masteryBefore, 0);
    assert.equal(freshEvent.masteryAfter, 0);

    // Snooze on an existing state leaves everything but nextReview alone.
    await graphFor(owner).setKnowledgeState('kim', 'alpha', {
      mastery: 70,
      reviewCount: 2,
      retentionStrength: 0.7,
      lastReviewed: shifted(-30),
      masterySource: 'manual',
      interactions: [{ timestamp: shifted(-29), type: 'review', duration: 4 }],
    });
    await report(owner, 'kim', 'alpha', 'snooze');
    const kept = (await graphFor(owner).getKnowledgeState('kim', 'alpha'))!;
    assert.equal(kept.nextReview, shifted(SNOOZE_DAYS));
    assert.equal(kept.mastery, 70);
    assert.equal(kept.reviewCount, 2);
    assert.equal(kept.retentionStrength, 0.7);
    assert.equal(kept.lastReviewed, shifted(-30));
    assert.equal(kept.masterySource, 'manual');
    assert.deepEqual(kept.interactions, [{ timestamp: shifted(-29), type: 'review', duration: 4 }]);
    const keptEvent = await lastEvent(owner, 'kim');
    assert.equal(keptEvent.masteryBefore, 70);
    assert.equal(keptEvent.masteryAfter, 70);

    // Unsnooze goes back to the last review, or the first study, when they are past.
    await graphFor(owner).setKnowledgeState('lee', 'alpha', {
      mastery: 70,
      lastReviewed: '2026-11-01T09:00:00Z',
      firstSeen: '2026-10-01T09:00:00Z',
    });
    await report(owner, 'lee', 'alpha', 'unsnooze');
    // `applyUnsnooze` re-serialises the date it picks (ISO with milliseconds).
    const backToReview = (await graphFor(owner).getKnowledgeState('lee', 'alpha'))!;
    assert.equal(backToReview.nextReview, '2026-11-01T09:00:00.000Z');
    assert.equal(backToReview.mastery, 70);
    assert.equal(backToReview.lastReviewed, '2026-11-01T09:00:00Z');
    assert.deepEqual(backToReview.interactions, []);

    await graphFor(owner).setKnowledgeState('max', 'alpha', {
      mastery: 70,
      firstSeen: '2026-10-01T09:00:00Z',
    });
    await report(owner, 'max', 'alpha', 'unsnooze');
    assert.equal((await graphFor(owner).getKnowledgeState('max', 'alpha'))!.nextReview, '2026-10-01T09:00:00.000Z');

    // Without a usable date (missing, invalid or in the future) it falls back to now.
    await graphFor(owner).setKnowledgeState('nia', 'alpha', { mastery: 70, firstSeen: 'not-a-date' });
    await report(owner, 'nia', 'alpha', 'unsnooze');
    assert.equal((await graphFor(owner).getKnowledgeState('nia', 'alpha'))!.nextReview, NOW.toISOString());

    await graphFor(owner).setKnowledgeState('oli', 'alpha', {
      mastery: 70,
      lastReviewed: shifted(5),
      firstSeen: shifted(4),
    });
    await report(owner, 'oli', 'alpha', 'unsnooze');
    assert.equal((await graphFor(owner).getKnowledgeState('oli', 'alpha'))!.nextReview, NOW.toISOString());

    // Snoozing and unsnoozing returns the schedule to where it was.
    await graphFor(owner).setKnowledgeState('pia', 'alpha', {
      mastery: 85,
      lastReviewed: shifted(-30),
      nextReview: shifted(-20),
    });
    await report(owner, 'pia', 'alpha', 'snooze');
    assert.equal((await graphFor(owner).getKnowledgeState('pia', 'alpha'))!.nextReview, shifted(SNOOZE_DAYS));
    await report(owner, 'pia', 'alpha', 'unsnooze');
    assert.equal((await graphFor(owner).getKnowledgeState('pia', 'alpha'))!.nextReview, shifted(-30));
  });

  it('keeps the self-report guards and older evidence tests (static guard)', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'service.ts'),
      'utf8',
    );

    // SELF_REPORT_KIND maps all six outcomes.
    const kindIndex = source.indexOf('const SELF_REPORT_KIND');
    const kindEnd = source.indexOf('};', kindIndex);
    assert.ok(kindIndex >= 0 && kindEnd > kindIndex);
    const kindSource = source.slice(kindIndex, kindEnd + 2);
    assert.match(
      kindSource,
      /= \{\s*'got-it': 'study',\s*started: 'study',\s*remembered: 'review',\s*forgot: 'review',\s*snooze: 'snooze',\s*unsnooze: 'unsnooze',\s*\};$/,
    );

    const fnIndex = source.indexOf('export async function recordSelfReport');
    const fnEnd = source.indexOf('// graphCall guard');
    assert.ok(fnIndex >= 0 && fnEnd > fnIndex);
    const fn = source.slice(fnIndex, fnEnd);

    // The learner/concept check comes before the evidence gate and the state read.
    const learnerGuard = fn.indexOf('requireLearnerAndConcept(');
    const evidenceGuard = fn.indexOf('requiresEvidence(');
    const priorRead = fn.indexOf('getKnowledgeState(');
    assert.ok(learnerGuard >= 0 && learnerGuard < evidenceGuard && learnerGuard < priorRead);
    // The evidence gate runs before any state is written.
    const gate = fn.indexOf('changesMastery && (await requiresEvidence');
    const stateWrite = fn.indexOf('setKnowledgeState(');
    assert.ok(gate >= 0 && gate < stateWrite);

    // Snooze/unsnooze go through their own helpers; other outcomes through the
    // study/review ones, plus one interaction (sanitised, capped).
    assert.match(fn, /outcome === 'snooze'\) patch = applySnooze\(now\)/);
    assert.match(fn, /outcome === 'unsnooze'\) patch = applyUnsnooze\(prior, now\)/);
    assert.match(fn, /isReview \? applyReviewOutcome\(prior, outcome, now\) : applyStudyOutcome\(prior, outcome, now\)/);
    assert.match(fn, /masterySource: 'self_report'/);
    assert.match(fn, /sanitizeInteractions\(prior\?\.interactions\)/);
    assert.match(fn, /\.slice\(-MAX_INTERACTIONS\)/);

    // The state is saved before the event is appended.
    const eventWrite = fn.indexOf('appendEvent(');
    assert.ok(stateWrite >= 0 && stateWrite < eventWrite);
    assert.match(fn, /kind: SELF_REPORT_KIND\[outcome\]/);
    assert.match(fn, /outcome: outcome === 'snooze' \? 'snoozed' : outcome/);
    assert.match(fn, /wasDue: SELF_REPORT_KIND\[outcome\] === 'study' \? false : wasDue/);

    const older = readFileSync(join(import.meta.dirname, 'learning-evidence.test.ts'), 'utf8');
    for (const title of [
      'self-reports are refused for quiz-checked concepts (D5) but still allowed elsewhere',
      'every answer and review is an event bound to its account',
    ]) {
      assert.ok(older.includes(title), title);
    }
  });
});
