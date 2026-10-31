/**
 * Server-side input validation for every `graphCall` RPC (isomorphic, Zod only).
 *
 * The browser proxy (`createRemoteGraphDB`) forwards `db.method(...args)` as
 * `{ method, args }`. Before any EducationGraphDB method runs, its `args` tuple
 * is parsed here, so a crafted request can only write well-formed, bounded
 * data into the caller's own workspace:
 *
 * - IDs written as storage keys (learner / concept ids, concept domain) are
 *   1–128 chars with no `:` and no control characters. `:` is the key
 *   separator (`state:<userId>:<conceptId>`), so an id like `a:b` could make
 *   prefix scans of learner `a` pick up rows of learner `a:b`.
 * - Read/delete calls accept any short non-empty string, so legacy rows
 *   created before this check can still be opened and removed.
 * - Numbers must be finite and inside the documented ranges (mastery 0–100,
 *   psychometric score 0–100, confidence 0–1, Bloom level 1–6, …).
 * - Strings, arrays and records have upper bounds; the whole payload is capped
 *   by `MAX_GRAPH_CALL_BYTES`.
 * - Unknown fields on stored objects are dropped (Zod's default strip), except
 *   on psychometric score entries, which legitimately carry UI extras
 *   (`interpretation`, `answers`).
 *
 * Optional trailing arguments accept `null` because the client JSON-encodes
 * `args` (an `undefined` slot in an array becomes `null`).
 */
import { z } from 'zod';
import type { RemoteGraphMethod } from './methods.ts';

/** Max JSON size of one graphCall payload (`{ method, args }`). */
export const MAX_GRAPH_CALL_BYTES = 256 * 1024;

/** True if `s` contains an ASCII control character (U+0000–U+001F, U+007F). */
const hasControlChars = (s: string) =>
  [...s].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);

/** Id that becomes part of a storage key (writes). */
export const writeId = z
  .string()
  .min(1, 'must not be empty')
  .max(128, 'must be at most 128 characters')
  .refine((s) => !s.includes(':'), 'must not contain ":"')
  .refine((s) => !hasControlChars(s), 'must not contain control characters')
  .refine((s) => s.trim() === s, 'must not start or end with whitespace');

/** Id used to look up / delete existing rows (lenient for legacy data). */
export const lookupId = z.string().min(1, 'must not be empty').max(512);

const text = (max: number) => z.string().max(max);
const isoDate = z
  .string()
  .max(64)
  .refine((s) => Number.isFinite(Date.parse(s)), 'must be an ISO date');
const finite = z.number().finite();
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const tags = z.array(text(64)).max(50);

/** Trailing optional argument: `null`/`undefined` → `undefined`. */
const opt = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === null ? undefined : v), schema.optional());

// ---------------------------------------------------------------------------
// Learner profile
// ---------------------------------------------------------------------------

/** Psychometric domain key, e.g. `big_five_openness`. */
const psychometricDomain = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,64}$/, 'invalid psychometric domain id');

/**
 * One stored score. Usually `{ score, confidence, lastUpdated, source }` plus
 * UI extras; legacy demo data stores a bare number.
 */
const psychometricScoreEntry = z.union([
  finite.min(0).max(100),
  z.looseObject({
    score: finite.min(0).max(100).optional(),
    confidence: finite.min(0).max(1).optional(),
    lastUpdated: isoDate.optional(),
    source: text(100).optional(),
    interpretation: text(4000).optional(),
    answers: z.record(z.string().max(100), finite).optional(),
  }),
]);

const psychometricScores = z
  .record(psychometricDomain, psychometricScoreEntry)
  .refine((r) => Object.keys(r).length <= 200, 'too many psychometric domains');

const modality = z.enum(['visual', 'auditory', 'kinesthetic', 'reading']);

const learningStyle = z.object({
  primary: modality,
  secondary: modality.optional(),
  socialPreference: z.enum(['solo', 'collaborative', 'mixed']).optional(),
  pacePreference: z.enum(['self-paced', 'structured', 'intensive']).optional(),
  feedbackPreference: z.enum(['immediate', 'delayed', 'on-request']).optional(),
});

const cognitiveProfile = z.object({
  workingMemoryCapacity: z.enum(['low', 'medium', 'high']).optional(),
  attentionSpan: z.enum(['short', 'medium', 'long']).optional(),
  processingSpeed: z.enum(['slow', 'medium', 'fast']).optional(),
  abstractThinking: z.enum(['concrete', 'mixed', 'abstract']).optional(),
});

/** Partial<LearnerProfile> accepted by `setLearnerProfile` (userId/timestamps come from the server). */
export const learnerProfileInput = z.object({
  name: text(200).optional(),
  email: text(320).optional(),
  psychometricScores: psychometricScores.optional(),
  learningStyle: learningStyle.optional(),
  cognitiveProfile: cognitiveProfile.optional(),
  profileMode: z.enum(['auto', 'manual', 'adaptive', 'assessment']).optional(),
  tags: tags.optional(),
  notes: text(5000).optional(),
});

const scoreUpdate = z.object({
  score: finite.min(0).max(100),
  confidence: finite.min(0).max(1).optional(),
  source: text(100).optional(),
});

// ---------------------------------------------------------------------------
// Concepts & edges
// ---------------------------------------------------------------------------

const bloomObjectives = z.object(
  Object.fromEntries(
    (['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const).map((k) => [
      k,
      z.array(text(500)).max(50).optional(),
    ]),
  ) as Record<'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create', z.ZodOptional<z.ZodArray<z.ZodString>>>,
);

/** Partial<ConceptNode> & { conceptId } accepted by `addConcept`. */
export const conceptInput = z.object({
  conceptId: writeId,
  name: text(200).optional(),
  domain: writeId.optional(),
  subdomain: text(128).optional(),
  description: text(5000).optional(),
  difficulty: z
    .object({
      absolute: finite.min(1).max(10),
      cognitiveLoad: finite.min(0).max(1),
      abstractness: finite.min(0).max(1),
    })
    .optional(),
  bloomObjectives: bloomObjectives.optional(),
  timeEstimates: z
    .object({
      introduction: finite.min(0).max(100_000),
      basicMastery: finite.min(0).max(100_000),
      deepMastery: finite.min(0).max(100_000),
    })
    .optional(),
  tags: tags.optional(),
});

export const edgeStrength = z.enum(['required', 'recommended', 'helpful']);

const edgeInput = z
  .object({
    from: writeId,
    to: writeId,
    strength: edgeStrength.optional(),
    reason: text(1000).optional(),
  })
  .refine((e) => e.from !== e.to, 'a concept cannot be its own prerequisite');

// ---------------------------------------------------------------------------
// Knowledge states
// ---------------------------------------------------------------------------

const bloomLevel = int(1, 6);
const severity = z.enum(['minor', 'moderate', 'major']);

const misconception = z.object({
  id: text(128).min(1),
  description: text(2000),
  severity,
  identified: isoDate,
  resolved: isoDate.optional(),
});

const interaction = z.object({
  timestamp: isoDate,
  type: z.enum(['lesson', 'quiz', 'practice', 'review']),
  duration: finite.min(0).max(100_000),
  score: finite.min(0).max(100).optional(),
  bloomLevel: bloomLevel.optional(),
  notes: text(2000).optional(),
});

/** Partial<KnowledgeState> accepted by `setKnowledgeState` (ids/timestamps come from the server). */
export const knowledgeStateInput = z.object({
  mastery: finite.min(0).max(100).optional(),
  bloomLevel: bloomLevel.optional(),
  firstSeen: isoDate.optional(),
  lastAssessed: isoDate.optional(),
  lastReviewed: isoDate.optional(),
  nextReview: isoDate.optional(),
  retentionStrength: finite.min(0).max(1).optional(),
  reviewCount: int(0, 100_000).optional(),
  misconceptions: z.array(misconception).max(100).optional(),
  interactions: z.array(interaction).max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Pure compute helpers that take whole objects (no writes)
// ---------------------------------------------------------------------------

const profileArg = z.looseObject({
  userId: lookupId,
  psychometricScores: z.record(z.string().max(100), z.unknown()),
});
const stateArg = z.looseObject({
  mastery: finite,
  reviewCount: finite.optional(),
  updatedAt: z.string().max(64),
});
const conceptArg = z.looseObject({
  conceptId: lookupId,
  difficulty: z.looseObject({ absolute: finite }),
});

const limitOpts = z.object({ limit: opt(int(1, 1000)) });
const gapType = z.enum(['missing', 'partial', 'forgotten', 'misconceptions']);
const maxDepth = opt(int(1, 50));

// ---------------------------------------------------------------------------
// Per-method argument tuples
// ---------------------------------------------------------------------------

export const GRAPH_METHOD_ARGS = {
  // Learners
  setLearnerProfile: z.tuple([writeId, learnerProfileInput]),
  getLearnerProfile: z.tuple([lookupId]),
  deleteLearnerProfile: z.tuple([lookupId]),
  listLearnerProfiles: z.tuple([]),
  updatePsychometricScore: z.tuple([
    lookupId,
    psychometricDomain,
    finite.min(0).max(100),
    opt(finite.min(0).max(1)),
    opt(text(100)),
  ]),
  updatePsychometricScores: z.tuple([
    lookupId,
    z
      .record(psychometricDomain, scoreUpdate)
      .refine((r) => Object.keys(r).length <= 200, 'too many psychometric domains'),
  ]),
  computeAndStoreLearningStyle: z.tuple([lookupId]),
  computeAndStoreCognitiveProfile: z.tuple([lookupId]),
  computeAndStoreDerivedProfiles: z.tuple([lookupId]),
  getPsychometricScores: z.tuple([lookupId]),

  // Concepts
  addConcept: z.tuple([conceptInput]),
  getConcept: z.tuple([lookupId]),
  deleteConcept: z.tuple([lookupId]),
  listConcepts: z.tuple([]),
  listConceptsByDomain: z.tuple([lookupId]),
  searchConcepts: z.tuple([text(200), opt(limitOpts)]),
  listConceptsByDifficulty: z.tuple([opt(finite.min(0).max(10)), opt(finite.min(0).max(10))]),
  listConceptsByBloomLevel: z.tuple([
    z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']),
  ]),

  // Prerequisite edges
  addEdge: z.tuple([edgeInput]),
  getEdge: z.tuple([lookupId, lookupId]),
  deleteEdge: z.tuple([lookupId, lookupId]),
  getPrerequisites: z.tuple([lookupId]),
  getDependents: z.tuple([lookupId]),
  listEdges: z.tuple([]),
  getPrerequisiteChain: z.tuple([lookupId, maxDepth]),
  getDependentChain: z.tuple([lookupId, maxDepth]),

  // Related edges
  addRelatedEdge: z.tuple([writeId, writeId, writeId, opt(z.boolean())]),
  getRelatedEdges: z.tuple([lookupId]),
  deleteRelatedEdge: z.tuple([lookupId]),
  listRelatedEdges: z.tuple([]),

  // Knowledge states
  setKnowledgeState: z.tuple([writeId, writeId, knowledgeStateInput]),
  getKnowledgeState: z.tuple([lookupId, lookupId]),
  deleteKnowledgeState: z.tuple([lookupId, lookupId]),
  getLearnerKnowledgeStates: z.tuple([lookupId]),
  addMisconception: z.tuple([lookupId, lookupId, text(2000).min(1), opt(severity)]),

  // Stats / maintenance (own workspace only)
  getStats: z.tuple([]),
  clear: z.tuple([]),

  // Engines (read-only)
  computeZPD: z.tuple([lookupId, opt(limitOpts)]),
  generateLearningPath: z.tuple([lookupId, opt(int(1, 1000))]),
  detectGaps: z.tuple([
    lookupId,
    opt(
      z.object({
        type: opt(z.union([gapType, z.literal('all')])),
        includeRecommendations: opt(z.boolean()),
      }),
    ),
  ]),
  getReviewQueue: z.tuple([
    lookupId,
    opt(z.object({ limit: opt(int(1, 1000)), includeNotDue: opt(z.boolean()) })),
  ]),
  generateRemediationPlan: z.tuple([
    lookupId,
    opt(z.object({ maxSteps: opt(int(1, 1000)), focusType: opt(gapType) })),
  ]),
  adjustForPsychometrics: z.tuple([profileArg]),
  selectScaffoldingStrategies: z.tuple([profileArg]),
  predictDecay: z.tuple([stateArg, conceptArg]),
  scheduleNextReview: z.tuple([
    stateArg,
    conceptArg,
    opt(z.enum(['failed', 'difficult', 'good', 'easy'])),
  ]),
} satisfies Record<RemoteGraphMethod, z.ZodType<unknown[]>>;

/** Bad RPC input: a 400-style expected error (not logged), with a readable message. */
export class InvalidGraphInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGraphInputError';
  }
}

function describeIssues(method: string, err: z.ZodError): string {
  const parts = err.issues.slice(0, 5).map((issue) => {
    const [index, ...rest] = issue.path;
    const where = [`argument ${typeof index === 'number' ? index + 1 : '?'}`, ...rest.map(String)].join('.');
    return issue.path.length ? `${where}: ${issue.message}` : issue.message;
  });
  return `Invalid input for ${method}: ${parts.join('; ')}`;
}

/**
 * Validate the args of one graph RPC. Returns the parsed tuple (unknown
 * fields stripped, `null` optionals → `undefined`); throws
 * `InvalidGraphInputError` (expected 400, not logged as a server error).
 */
export function parseGraphArgs(method: RemoteGraphMethod, args: unknown): unknown[] {
  const schema = GRAPH_METHOD_ARGS[method] as unknown as z.ZodTuple<[]>;
  if (!Array.isArray(args)) throw new InvalidGraphInputError(`Invalid input for ${method}: args must be an array`);
  // Drop trailing null/undefined slots beyond the method's arity (JSON-encoded optionals).
  const list = [...args];
  const arity = schema.def.items.length;
  while (list.length > arity && (list[list.length - 1] === null || list[list.length - 1] === undefined)) {
    list.pop();
  }
  const result = schema.safeParse(list);
  if (!result.success) throw new InvalidGraphInputError(describeIssues(method, result.error));
  return result.data as unknown[];
}

/** Reject oversized payloads before any per-method parsing. */
export function assertGraphCallSize(data: unknown): void {
  let size: number;
  try {
    size = JSON.stringify(data)?.length ?? 0;
  } catch {
    throw new InvalidGraphInputError('Invalid input: payload is not JSON-serializable');
  }
  if (size > MAX_GRAPH_CALL_BYTES) {
    throw new InvalidGraphInputError(
      `Invalid input: payload too large (${Math.ceil(size / 1024)} KB, max ${MAX_GRAPH_CALL_BYTES / 1024} KB)`,
    );
  }
}
