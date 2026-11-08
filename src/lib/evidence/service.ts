/**
 * Server-side evidence work (Roadmap M1): the quiz bank, quiz sessions graded
 * on the server, self-reports, the append-only event log, and the guard that
 * keeps self-reports and hand edits away from quiz-checked concepts.
 *
 * Every function takes the database and the owner's graph explicitly, so the
 * server functions stay thin and the tests run the same code on PGlite.
 */
import { sql, type ColumnType, type Generated, type Kysely } from 'kysely';
import type { EducationGraphDB } from '../graph/education-graph-db.ts';
import type { ConceptNode, KnowledgeState } from '../graph/types.ts';
import {
  applyReviewOutcome,
  applySnooze,
  applyStudyOutcome,
  applyUnsnooze,
  type ReviewOutcome,
  type StudyOutcome,
} from '../study.ts';
import {
  gradeQuiz,
  MAX_QUESTIONS_PER_CONCEPT,
  pickQuestions,
  QUIZ_LENGTH,
  quizStatePatch,
  reviewWasDue,
  shuffled,
  type GradedAnswer,
  type QuestionInput,
  type QuizQuestion,
  type QuizQuestionView,
  type RandomInt,
} from './quiz.ts';
import { passed, type Attempt } from './scoring.ts';
import type { LearningEvent, LearningEventInput, LearningEventKind } from './events.ts';
import { DEMO_QUESTIONS } from './demo-questions.ts';
import { demoConcepts } from '../demo-data.ts';

type Json = ColumnType<unknown, unknown, unknown>;
type Timestamp = ColumnType<Date | string, Date | string | undefined, Date | string>;

interface QuizQuestionTable {
  owner_id: string;
  id: string;
  concept_id: string;
  concept_key: ColumnType<string, never, never>;
  prompt: string;
  options: Json;
  answer: string;
  explanation: string;
  created_at: Generated<Date | string>;
  updated_at: Timestamp;
}

interface QuizSessionTable {
  id: string;
  owner_id: string;
  learner_id: string;
  concept_id: string;
  questions: Json;
  created_at: Generated<Date | string>;
  completed_at: ColumnType<Date | string | null, never, Date | string>;
  answers: Json;
  correct: number | null;
  total: number;
}

interface LearningEventTable {
  id: Generated<number>;
  owner_id: string;
  learner_id: string;
  concept_id: string;
  kind: LearningEventKind;
  outcome: string;
  source: string;
  was_due: boolean | null;
  correct: number | null;
  total: number | null;
  mastery_before: number | null;
  mastery_after: number | null;
  detail: Json;
  created_at: Generated<Date | string>;
}

/** Kysely schema for migrations/0005_learning_evidence.sql. */
export interface EvidenceDatabase {
  quiz_questions: QuizQuestionTable;
  quiz_sessions: QuizSessionTable;
  learning_events: LearningEventTable;
}

/** Accepts the app's Kysely instance (typed for the graph tables) or a test one. */
type AnyDb = Kysely<any>;
const typed = (db: AnyDb) => db as Kysely<EvidenceDatabase>;
const jsonb = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
const iso = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;

/** A request the learner or editor can fix: shown as is, not logged as a server error. */
export class EvidenceError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceError';
  }
}

/** Self-report or hand edit of a quiz-checked concept. */
export class EvidenceRequiredError extends EvidenceError {
  constructor(concept: Pick<ConceptNode, 'name' | 'domain'> | null, conceptId: string) {
    const name = concept?.name || conceptId;
    const where = concept?.domain === 'japanese' ? 'the Japanese page' : 'its quiz';
    super(`“${name}” is quiz-checked: its mastery only changes through ${where}.`);
    this.name = 'EvidenceRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

function toQuestion(row: {
  id: string;
  concept_id: string;
  prompt: string;
  options: unknown;
  answer: string;
  explanation: string;
}): QuizQuestion {
  return {
    id: row.id,
    conceptId: row.concept_id,
    prompt: row.prompt,
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    answer: row.answer,
    explanation: row.explanation,
  };
}

/** The bank (with answers) for one concept, or the whole workspace. */
export async function listQuestions(db: AnyDb, owner: string, conceptId?: string): Promise<QuizQuestion[]> {
  let q = typed(db)
    .selectFrom('quiz_questions')
    .select(['id', 'concept_id', 'prompt', 'options', 'answer', 'explanation'])
    .where('owner_id', '=', owner);
  if (conceptId !== undefined) q = q.where('concept_id', '=', conceptId);
  const rows = await q.orderBy('concept_id').orderBy('created_at').orderBy('id').execute();
  return rows.map(toQuestion);
}

/** Number of questions per concept id (concepts without questions are absent). */
export async function questionCounts(db: AnyDb, owner: string): Promise<Record<string, number>> {
  const rows = await typed(db)
    .selectFrom('quiz_questions')
    .select(['concept_id', (eb) => eb.fn.countAll<number | string>().as('n')])
    .where('owner_id', '=', owner)
    .groupBy('concept_id')
    .execute();
  return Object.fromEntries(rows.map((r) => [r.concept_id, Number(r.n)]));
}

/** Add a question, or replace the one with `input.id`. */
export async function saveQuestion(
  db: AnyDb,
  graph: EducationGraphDB,
  owner: string,
  input: QuestionInput,
  newId: () => string,
): Promise<QuizQuestion> {
  if (!(await graph.getConcept(input.conceptId))) throw new EvidenceError('That concept no longer exists.');
  const id = input.id ?? newId();
  const existing = await typed(db)
    .selectFrom('quiz_questions')
    .select('id')
    .where('owner_id', '=', owner)
    .where('id', '=', id)
    .executeTakeFirst();
  if (!existing) {
    const count = (await questionCounts(db, owner))[input.conceptId] ?? 0;
    if (count >= MAX_QUESTIONS_PER_CONCEPT) {
      throw new EvidenceError(`A concept can have at most ${MAX_QUESTIONS_PER_CONCEPT} questions.`);
    }
  } else if (input.id === undefined) {
    throw new EvidenceError('Could not create the question, please try again.');
  }
  const values = {
    concept_id: input.conceptId,
    prompt: input.prompt,
    options: jsonb(input.options),
    answer: input.answer,
    explanation: input.explanation ?? '',
  };
  await typed(db)
    .insertInto('quiz_questions')
    .values({ owner_id: owner, id, ...values })
    .onConflict((oc) => oc.columns(['owner_id', 'id']).doUpdateSet({ ...values, updated_at: sql`now()` }))
    .execute();
  return { id, conceptId: input.conceptId, prompt: input.prompt, options: input.options, answer: input.answer, explanation: values.explanation };
}

export async function deleteQuestion(db: AnyDb, owner: string, id: string): Promise<void> {
  await typed(db).deleteFrom('quiz_questions').where('owner_id', '=', owner).where('id', '=', id).execute();
}

/**
 * Must mastery of this concept come from evidence? Yes when it has questions
 * in its bank, or when it is flagged (`evidenceRequired`, e.g. Japanese topics
 * whose evidence lives on their own page).
 */
export async function requiresEvidence(
  db: AnyDb,
  graph: EducationGraphDB,
  owner: string,
  conceptId: string,
): Promise<{ required: boolean; concept: ConceptNode | null; questions: number }> {
  const concept = await graph.getConcept(conceptId);
  const row = await typed(db)
    .selectFrom('quiz_questions')
    .select((eb) => eb.fn.countAll<number | string>().as('n'))
    .where('owner_id', '=', owner)
    .where('concept_id', '=', conceptId)
    .executeTakeFirst();
  const questions = Number(row?.n ?? 0);
  return { required: concept?.evidenceRequired === true || questions > 0, concept, questions };
}

/** Meta flag: the example questions were offered to this workspace once. */
export const DEMO_QUESTIONS_FLAG = 'seed:demo-questions';

/**
 * Give the example concepts their quiz questions, once per workspace (new and
 * existing ones). Only example concepts that still look like the example
 * (same id and subject) and have no questions of their own get them, so a
 * user's own concept, or a bank they emptied on purpose, is left alone.
 * Returns the number of questions added.
 */
export async function seedDemoQuestions(db: AnyDb, graph: EducationGraphDB, owner: string): Promise<number> {
  if (await graph.getMeta(DEMO_QUESTIONS_FLAG)) return 0;
  const counts = await questionCounts(db, owner);
  let added = 0;
  for (const demo of demoConcepts) {
    const conceptId = demo.id.replace('concept:', '');
    const concept = await graph.getConcept(conceptId);
    if (!concept || concept.domain !== demo.domain || counts[conceptId]) continue;
    const questions = DEMO_QUESTIONS.filter((q) => q.conceptId === conceptId);
    const inserted = await typed(db)
      .insertInto('quiz_questions')
      .values(
        questions.map((q) => ({
          owner_id: owner,
          id: q.id,
          concept_id: q.conceptId,
          prompt: q.prompt,
          options: jsonb(q.options),
          answer: q.answer,
          explanation: q.explanation,
        })),
      )
      .onConflict((oc) => oc.columns(['owner_id', 'id']).doNothing())
      .returning('id')
      .execute();
    added += inserted.length;
  }
  await graph.setMeta(DEMO_QUESTIONS_FLAG, { at: new Date().toISOString(), added });
  return added;
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

export async function appendEvent(db: AnyDb, owner: string, e: LearningEventInput): Promise<void> {
  await typed(db)
    .insertInto('learning_events')
    .values({
      owner_id: owner,
      learner_id: e.learnerId,
      concept_id: e.conceptId,
      kind: e.kind,
      outcome: e.outcome,
      source: e.source ?? 'app',
      was_due: e.wasDue ?? null,
      correct: e.correct ?? null,
      total: e.total ?? null,
      mastery_before: e.masteryBefore ?? null,
      mastery_after: e.masteryAfter ?? null,
      detail: jsonb(e.detail ?? {}),
    })
    .execute();
}

/** Events of this workspace, oldest first (optionally for one learner). */
export async function listEvents(
  db: AnyDb,
  owner: string,
  options: { learnerId?: string; limit?: number } = {},
): Promise<LearningEvent[]> {
  let q = typed(db).selectFrom('learning_events').selectAll().where('owner_id', '=', owner);
  if (options.learnerId !== undefined) q = q.where('learner_id', '=', options.learnerId);
  const rows = await q.orderBy('id', 'desc').limit(options.limit ?? 10_000).execute();
  return rows.reverse().map((r) => ({
    id: Number(r.id),
    learnerId: r.learner_id,
    conceptId: r.concept_id,
    kind: r.kind,
    outcome: r.outcome,
    source: r.source === 'japanese' ? 'japanese' : 'app',
    wasDue: r.was_due,
    correct: r.correct,
    total: r.total,
    masteryBefore: r.mastery_before,
    masteryAfter: r.mastery_after,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    createdAt: iso(r.created_at) ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

interface SessionQuestion extends QuizQuestionView {
  answer: string;
  explanation: string;
}

export interface StartedQuiz {
  sessionId: string;
  conceptId: string;
  conceptName: string;
  questions: QuizQuestionView[];
}

async function requireLearnerAndConcept(graph: EducationGraphDB, learnerId: string, conceptId: string) {
  const [learner, concept] = await Promise.all([graph.getLearnerProfile(learnerId), graph.getConcept(conceptId)]);
  if (!learner) throw new EvidenceError('That learner no longer exists.');
  if (!concept) throw new EvidenceError('That concept no longer exists.');
  return concept;
}

async function completedAttempts(db: AnyDb, owner: string, learnerId: string, conceptId: string) {
  const rows = await typed(db)
    .selectFrom('quiz_sessions')
    .select(['completed_at', 'correct', 'total', 'questions'])
    .where('owner_id', '=', owner)
    .where('learner_id', '=', learnerId)
    .where('concept_id', '=', conceptId)
    .where('completed_at', 'is not', null)
    .orderBy('completed_at')
    .execute();
  return rows.map(
    (r): Attempt => ({
      at: iso(r.completed_at)!,
      correct: r.correct ?? 0,
      total: r.total,
      ids: ((r.questions as SessionQuestion[]) ?? []).map((q) => q.id),
    }),
  );
}

/** Start a quiz: draw questions, snapshot them, return them without answers. */
export async function startQuiz(
  db: AnyDb,
  graph: EducationGraphDB,
  owner: string,
  input: { learnerId: string; conceptId: string },
  random: { int: RandomInt; uuid: () => string },
): Promise<StartedQuiz> {
  const concept = await requireLearnerAndConcept(graph, input.learnerId, input.conceptId);
  const pool = await listQuestions(db, owner, input.conceptId);
  if (pool.length === 0) throw new EvidenceError(`“${concept.name}” has no quiz questions yet.`);
  const previous = (await completedAttempts(db, owner, input.learnerId, input.conceptId)).at(-1);
  const questions: SessionQuestion[] = pickQuestions(pool, previous?.ids ?? [], QUIZ_LENGTH, random.int).map(
    (q) => ({
      id: q.id,
      prompt: q.prompt,
      options: shuffled(q.options, random.int),
      answer: q.answer,
      explanation: q.explanation,
    }),
  );
  const sessionId = random.uuid();
  await typed(db)
    .insertInto('quiz_sessions')
    .values({
      id: sessionId,
      owner_id: owner,
      learner_id: input.learnerId,
      concept_id: input.conceptId,
      questions: jsonb(questions),
      answers: null,
      correct: null,
      total: questions.length,
    })
    .execute();
  return {
    sessionId,
    conceptId: concept.conceptId,
    conceptName: concept.name,
    questions: questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
  };
}

export interface QuizResult {
  conceptId: string;
  conceptName: string;
  correct: number;
  total: number;
  passed: boolean;
  wasDue: boolean;
  masteryBefore: number;
  mastery: number;
  feedback: (GradedAnswer & { prompt: string; answer: string; explanation: string })[];
}

/** Grade a started quiz once, update the knowledge state, and log the result. */
export async function submitQuiz(
  db: AnyDb,
  graph: EducationGraphDB,
  owner: string,
  input: { sessionId: string; answers: Record<string, string> },
  now: Date = new Date(),
): Promise<QuizResult> {
  const session = await typed(db)
    .selectFrom('quiz_sessions')
    .selectAll()
    .where('owner_id', '=', owner)
    .where('id', '=', input.sessionId)
    .executeTakeFirst();
  if (!session) throw new EvidenceError('This quiz was not found. Start a new one.');
  if (session.completed_at) throw new EvidenceError('This quiz is already graded. Start a new one.');
  const questions = (session.questions as SessionQuestion[]) ?? [];
  const graded = gradeQuiz(questions, input.answers);
  const done = await typed(db)
    .updateTable('quiz_sessions')
    .set({
      answers: jsonb(input.answers),
      correct: graded.correct,
      completed_at: now.toISOString(),
    })
    .where('owner_id', '=', owner)
    .where('id', '=', session.id)
    .where('completed_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (!done) throw new EvidenceError('This quiz is already graded. Start a new one.');

  const { learner_id: learnerId, concept_id: conceptId } = session;
  const [concept, prior] = await Promise.all([
    graph.getConcept(conceptId),
    graph.getKnowledgeState(learnerId, conceptId),
  ]);
  const attempts = await completedAttempts(db, owner, learnerId, conceptId);
  const { patch, wasDue } = quizStatePatch(prior, attempts, concept?.difficulty?.absolute, now);
  const state = await graph.setKnowledgeState(learnerId, conceptId, patch);
  const ok = passed(graded);
  await appendEvent(db, owner, {
    learnerId,
    conceptId,
    kind: 'quiz',
    outcome: ok ? 'passed' : 'failed',
    wasDue,
    correct: graded.correct,
    total: graded.total,
    masteryBefore: prior?.mastery ?? 0,
    masteryAfter: state.mastery,
    detail: { sessionId: session.id, answers: graded.results },
  });
  return {
    conceptId,
    conceptName: concept?.name ?? conceptId,
    correct: graded.correct,
    total: graded.total,
    passed: ok,
    wasDue,
    masteryBefore: prior?.mastery ?? 0,
    mastery: state.mastery,
    feedback: graded.results.map((r) => {
      const q = questions.find((x) => x.id === r.questionId)!;
      return { ...r, prompt: q.prompt, answer: q.answer, explanation: q.explanation };
    }),
  };
}

// ---------------------------------------------------------------------------
// Self-reports (Today panel, onboarding, Gap Analysis)
// ---------------------------------------------------------------------------

export type SelfReportOutcome = StudyOutcome | ReviewOutcome | 'snooze' | 'unsnooze';

const SELF_REPORT_KIND: Record<SelfReportOutcome, LearningEventKind> = {
  'got-it': 'study',
  started: 'study',
  remembered: 'review',
  forgot: 'review',
  snooze: 'snooze',
  unsnooze: 'unsnooze',
};

/**
 * Save a learner's own report about a concept. Reports that change mastery
 * ("I've got it", "Still learning", "I remembered it", "I forgot") are only
 * accepted for concepts without quiz evidence (decision D5); postponing a
 * review is always allowed.
 */
export async function recordSelfReport(
  db: AnyDb,
  graph: EducationGraphDB,
  owner: string,
  input: { learnerId: string; conceptId: string; outcome: SelfReportOutcome },
  now: Date = new Date(),
): Promise<{ mastery: number }> {
  const concept = await requireLearnerAndConcept(graph, input.learnerId, input.conceptId);
  const { outcome } = input;
  const changesMastery = outcome !== 'snooze' && outcome !== 'unsnooze';
  if (changesMastery && (await requiresEvidence(db, graph, owner, input.conceptId)).required) {
    throw new EvidenceRequiredError(concept, input.conceptId);
  }
  const prior = await graph.getKnowledgeState(input.learnerId, input.conceptId);
  const wasDue = reviewWasDue(prior, concept.difficulty?.absolute, now);
  let patch: Partial<KnowledgeState>;
  if (outcome === 'snooze') patch = applySnooze(now);
  else if (outcome === 'unsnooze') patch = applyUnsnooze(prior, now);
  else if (outcome === 'remembered' || outcome === 'forgot')
    patch = { ...applyReviewOutcome(prior, outcome, now), masterySource: 'self_report' };
  else patch = { ...applyStudyOutcome(prior, outcome, now), masterySource: 'self_report' };
  const state = await graph.setKnowledgeState(input.learnerId, input.conceptId, patch);
  await appendEvent(db, owner, {
    learnerId: input.learnerId,
    conceptId: input.conceptId,
    kind: SELF_REPORT_KIND[outcome],
    outcome: outcome === 'snooze' ? 'snoozed' : outcome,
    // Studying something new is never a due review.
    wasDue: SELF_REPORT_KIND[outcome] === 'study' ? false : wasDue,
    masteryBefore: prior?.mastery ?? 0,
    masteryAfter: state.mastery,
  });
  return { mastery: state.mastery };
}

// ---------------------------------------------------------------------------
// graphCall guard
// ---------------------------------------------------------------------------

/** Fields of a state patch that never claim knowledge (scheduling, notes on errors). */
const NON_EVIDENCE_FIELDS = new Set(['nextReview', 'misconceptions']);

/**
 * Check one validated graphCall before it runs. `setKnowledgeState` may not
 * change mastery, the review schedule or history of a quiz-checked concept
 * (only postpone a review); on other concepts a mastery written this way is
 * recorded as a hand edit (`masterySource: 'manual'`). Returns the args to run.
 */
export async function guardGraphCall(
  db: AnyDb,
  graph: EducationGraphDB,
  owner: string,
  method: string,
  args: unknown[],
): Promise<unknown[]> {
  if (method !== 'setKnowledgeState') return args;
  const [learnerId, conceptId, patch] = args as [string, string, Partial<KnowledgeState>];
  const fields = Object.keys(patch ?? {}).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
  if (fields.every((k) => NON_EVIDENCE_FIELDS.has(k))) return args;
  const { required, concept } = await requiresEvidence(db, graph, owner, conceptId);
  if (required) throw new EvidenceRequiredError(concept, conceptId);
  return patch.mastery === undefined ? args : [learnerId, conceptId, { ...patch, masterySource: 'manual' }];
}
