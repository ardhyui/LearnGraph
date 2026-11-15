/**
 * Direct unit tests for the demo dataset `src/lib/demo-data.ts` — the data
 * seeded into every new account's workspace. Until now the dataset's shape was
 * only locked indirectly through the seed engine flow (tests/demo-seed.test.ts
 * exercises `seedDemoDataIfEmpty`/`repairDemoKnowledgeStates` and
 * `shiftDemoDate`); the constants themselves were never checked, and the
 * seeder drops bad rows silently (a state whose `learnerId`/`conceptId` does
 * not resolve is skipped without an error), so a wrong id would quietly
 * shrink the demo.
 *
 * The invariants mirror what `src/lib/graph/seed.ts` actually consumes:
 * `userId`/`name`/`email`/`learningStyle`/`cognitiveProfile`/
 * `psychometricScores`/`tags`/`notes` per learner; `id` (minus the
 * `concept:` prefix), `name`, `domain`, `description`, `difficulty` and
 * `estimatedMinutes` per concept; `from`/`to`/`weight` per edge (weight maps
 * to required ≥0.9 / recommended ≥0.7 / helpful); `learnerId`, `conceptId`,
 * `mastery`, `confidence`, `lastReviewed`, `createdAt` and `reviewCount` per
 * knowledge state, with both dates shifted by `shiftDemoDate` at seed time.
 *
 * The module is not changed by this file — tests only. `shiftDemoDate` stays
 * covered by its own direct tests in tests/demo-seed.test.ts (not duplicated
 * here).
 */
import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_DATA_AS_OF,
  demoConcepts,
  demoEdges,
  demoKnowledgeStates,
  demoLearners,
  isServerlessEnvironment,
} from '../src/lib/demo-data.ts';
import { traitScore, type Trait } from '../src/lib/graph/trait-scores.ts';

// Frozen copies of the enums in src/lib/graph/types.ts. Editing a value here
// or in the dataset must be a deliberate, reviewable change.
const LEARNING_MODALITIES: readonly string[] = ['visual', 'auditory', 'kinesthetic', 'reading'];
const SOCIAL_PREFERENCES: readonly string[] = ['solo', 'collaborative', 'mixed'];
const PACE_PREFERENCES: readonly string[] = ['self-paced', 'structured', 'intensive'];
const FEEDBACK_PREFERENCES: readonly string[] = ['immediate', 'delayed', 'on-request'];
const WORKING_MEMORY_CAPACITIES: readonly string[] = ['low', 'medium', 'high'];
const ATTENTION_SPANS: readonly string[] = ['short', 'medium', 'long'];
const PROCESSING_SPEEDS: readonly string[] = ['slow', 'medium', 'fast'];
const ABSTRACT_THINKING: readonly string[] = ['concrete', 'mixed', 'abstract'];
const BLOOM_LEVEL_NAMES: readonly string[] = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
];

const TRAITS: readonly Trait[] = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
];

/**
 * Explicit frozen copy of how many progress records each example learner has.
 * Adding or removing demo progress must be visible in this diff — the counts
 * shape the demo story (Alice advanced, Bob intermediate, Carol both domains).
 */
const STATES_PER_LEARNER: Readonly<Record<string, number>> = {
  'demo-alice': 6,
  'demo-bob': 3,
  'demo-carol': 9,
};

const isIso = (value: unknown): boolean =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const isWholeInRange = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

const allUnique = (values: string[]): boolean => new Set(values).size === values.length;

describe('demoLearners', () => {
  it('has exactly three learners with unique learner:demo-* ids and demo-* userIds', () => {
    assert.equal(demoLearners.length, 3);
    const ids = demoLearners.map((learner) => learner.id);
    const userIds = demoLearners.map((learner) => learner.userId);
    for (const id of ids) assert.match(id, /^learner:demo-.+$/);
    for (const id of userIds) assert.match(id, /^demo-.+$/);
    assert.ok(allUnique(ids), 'learner ids must be unique');
    assert.ok(allUnique(userIds), 'userIds must be unique');
  });

  it('fills in a name and an @demo.learngraph.dev email for every learner', () => {
    for (const learner of demoLearners) {
      assert.ok(typeof learner.name === 'string' && learner.name.trim().length > 0, learner.id);
      assert.ok(
        typeof learner.email === 'string' && learner.email.endsWith('@demo.learngraph.dev'),
        `${learner.id} email must use the demo domain`,
      );
    }
  });

  it('stores valid ISO createdAt/updatedAt with createdAt <= updatedAt', () => {
    for (const learner of demoLearners) {
      assert.ok(isIso(learner.createdAt), `${learner.id} createdAt`);
      assert.ok(isIso(learner.updatedAt), `${learner.id} updatedAt`);
      assert.ok(
        Date.parse(learner.createdAt) <= Date.parse(learner.updatedAt),
        `${learner.id} createdAt must not be after updatedAt`,
      );
    }
  });

  it('uses only valid enum values in learningStyle', () => {
    for (const learner of demoLearners) {
      const style = learner.learningStyle;
      assert.ok(LEARNING_MODALITIES.includes(style.primary), `${learner.id} primary`);
      assert.ok(
        SOCIAL_PREFERENCES.includes(style.socialPreference),
        `${learner.id} socialPreference`,
      );
      assert.ok(PACE_PREFERENCES.includes(style.pacePreference), `${learner.id} pacePreference`);
      assert.ok(
        FEEDBACK_PREFERENCES.includes(style.feedbackPreference),
        `${learner.id} feedbackPreference`,
      );
      if (style.secondary !== undefined) {
        assert.ok(LEARNING_MODALITIES.includes(style.secondary), `${learner.id} secondary`);
      }
    }
  });

  it('uses only valid enum values in cognitiveProfile', () => {
    for (const learner of demoLearners) {
      const profile = learner.cognitiveProfile;
      assert.ok(
        WORKING_MEMORY_CAPACITIES.includes(profile.workingMemoryCapacity),
        `${learner.id} workingMemoryCapacity`,
      );
      assert.ok(ATTENTION_SPANS.includes(profile.attentionSpan), `${learner.id} attentionSpan`);
      assert.ok(
        PROCESSING_SPEEDS.includes(profile.processingSpeed),
        `${learner.id} processingSpeed`,
      );
      assert.ok(
        ABSTRACT_THINKING.includes(profile.abstractThinking),
        `${learner.id} abstractThinking`,
      );
    }
  });

  it('keeps psychometricScores as legacy bare 0-1 numbers, so the engine ignores them', () => {
    for (const learner of demoLearners) {
      const entries = Object.entries(learner.psychometricScores);
      assert.ok(entries.length > 0, `${learner.id} should list some scores`);
      for (const [key, value] of entries) {
        assert.ok(typeof key === 'string' && key.length > 0, `${learner.id} score key`);
        assert.equal(typeof value, 'number', `${learner.id} ${key} must stay a bare number`);
        assert.ok(
          Number.isFinite(value) && value >= 0 && value <= 1,
          `${learner.id} ${key}=${String(value)} must stay within 0-1 (a stray 0-100 number would be silently ignored too)`,
        );
      }
      // `traitScore` only reads `{ score }` 0-100 entries, so the demo must
      // stay psychometrically neutral for every trait it lists.
      for (const trait of TRAITS) {
        assert.equal(
          traitScore(learner.psychometricScores, trait),
          undefined,
          `${learner.id} ${trait} must not be picked up by the engine`,
        );
      }
    }
  });

  it('tags every learner with an array of non-empty strings', () => {
    for (const learner of demoLearners) {
      assert.ok(Array.isArray(learner.tags), `${learner.id} tags must be an array`);
      for (const tag of learner.tags) {
        assert.equal(typeof tag, 'string', `${learner.id} tag must be a string`);
        assert.ok(tag.length > 0, `${learner.id} tag must not be empty`);
      }
    }
  });
});

describe('demoConcepts', () => {
  it('has exactly 11 concepts with unique concept:* ids', () => {
    assert.equal(demoConcepts.length, 11);
    const ids = demoConcepts.map((concept) => concept.id);
    for (const id of ids) assert.match(id, /^concept:.+$/);
    assert.ok(allUnique(ids), 'concept ids must be unique');
  });

  it('fills in name, domain and description for every concept', () => {
    for (const concept of demoConcepts) {
      assert.ok(typeof concept.name === 'string' && concept.name.trim().length > 0, concept.id);
      assert.ok(typeof concept.domain === 'string' && concept.domain.trim().length > 0, concept.id);
      assert.ok(
        typeof concept.description === 'string' && concept.description.trim().length > 0,
        concept.id,
      );
    }
  });

  it('stores difficulty as a whole number 1-10', () => {
    for (const concept of demoConcepts) {
      assert.ok(
        isWholeInRange(concept.difficulty, 1, 10),
        `${concept.id} difficulty=${String(concept.difficulty)}`,
      );
    }
  });

  it('uses one of the six Bloom level names', () => {
    for (const concept of demoConcepts) {
      assert.ok(
        BLOOM_LEVEL_NAMES.includes(concept.bloomLevel),
        `${concept.id} bloomLevel=${String(concept.bloomLevel)}`,
      );
    }
  });

  it('estimates a positive number of minutes and a valid ISO createdAt', () => {
    for (const concept of demoConcepts) {
      assert.ok(
        typeof concept.estimatedMinutes === 'number' && concept.estimatedMinutes > 0,
        `${concept.id} estimatedMinutes must be > 0`,
      );
      assert.ok(isIso(concept.createdAt), `${concept.id} createdAt`);
    }
  });
});

describe('demoEdges', () => {
  it('has exactly 11 edges with unique ids', () => {
    assert.equal(demoEdges.length, 11);
    assert.ok(allUnique(demoEdges.map((edge) => edge.id)), 'edge ids must be unique');
  });

  it('only connects concepts that exist, never a concept to itself', () => {
    const conceptIds = new Set(demoConcepts.map((concept) => concept.id));
    for (const edge of demoEdges) {
      assert.ok(conceptIds.has(edge.from), `${edge.id}: ${edge.from} is not in demoConcepts`);
      assert.ok(conceptIds.has(edge.to), `${edge.id}: ${edge.to} is not in demoConcepts`);
      assert.notEqual(edge.from, edge.to, `${edge.id} must not loop to itself`);
    }
  });

  it('weights every edge 0-1 with a valid ISO createdAt', () => {
    for (const edge of demoEdges) {
      assert.ok(
        typeof edge.weight === 'number' &&
          Number.isFinite(edge.weight) &&
          edge.weight >= 0 &&
          edge.weight <= 1,
        `${edge.id} weight=${String(edge.weight)} must stay within 0-1`,
      );
      assert.ok(isIso(edge.createdAt), `${edge.id} createdAt`);
    }
  });

  it('forms an acyclic prerequisite graph', () => {
    const outgoing = new Map<string, string[]>(demoConcepts.map((concept) => [concept.id, []]));
    for (const edge of demoEdges) {
      const list = outgoing.get(edge.from);
      if (list) list.push(edge.to);
    }
    const mark = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string, path: string[]): void => {
      if (mark.get(id) === 'done') return;
      assert.ok(
        !path.includes(id),
        `cycle in the demo prerequisites: ${[...path, id].join(' -> ')}`,
      );
      mark.set(id, 'visiting');
      for (const next of outgoing.get(id) ?? []) visit(next, [...path, id]);
      mark.set(id, 'done');
    };
    for (const concept of demoConcepts) visit(concept.id, []);
    assert.equal(mark.size, demoConcepts.length, 'every concept should be reachable');
  });
});

describe('demoKnowledgeStates', () => {
  it('has exactly 18 states: 6 for Alice, 3 for Bob, 9 for Carol (explicit copy)', () => {
    assert.equal(demoKnowledgeStates.length, 18);
    const perLearner = new Map<string, number>(demoLearners.map((learner) => [learner.userId, 0]));
    for (const state of demoKnowledgeStates) {
      const seen = perLearner.get(state.learnerId);
      assert.ok(seen !== undefined, `${state.learnerId} is not a demo learner userId`);
      perLearner.set(state.learnerId, seen + 1);
    }
    assert.deepEqual(Object.fromEntries(perLearner), { ...STATES_PER_LEARNER });
  });

  it('references only existing demo learners and concepts', () => {
    const userIds = new Set(demoLearners.map((learner) => learner.userId));
    const conceptIds = new Set(demoConcepts.map((concept) => concept.id));
    for (const state of demoKnowledgeStates) {
      assert.ok(userIds.has(state.learnerId), `${state.id} -> ${state.learnerId}`);
      assert.ok(conceptIds.has(state.conceptId), `${state.id} -> ${state.conceptId}`);
    }
  });

  it('has unique ids and unique (learnerId, conceptId) pairs', () => {
    assert.ok(allUnique(demoKnowledgeStates.map((state) => state.id)), 'state ids must be unique');
    assert.ok(
      allUnique(demoKnowledgeStates.map((state) => `${state.learnerId}\u0000${state.conceptId}`)),
      'a duplicate (learner, concept) pair would silently overwrite in the seed',
    );
  });

  it('stores whole-number mastery 0-100, confidence 0-1 and reviewCount >= 0', () => {
    for (const state of demoKnowledgeStates) {
      assert.ok(isWholeInRange(state.mastery, 0, 100), `${state.id} mastery`);
      assert.ok(
        typeof state.confidence === 'number' &&
          Number.isFinite(state.confidence) &&
          state.confidence >= 0 &&
          state.confidence <= 1,
        `${state.id} confidence`,
      );
      assert.ok(
        typeof state.reviewCount === 'number' &&
          Number.isInteger(state.reviewCount) &&
          state.reviewCount >= 0,
        `${state.id} reviewCount`,
      );
    }
  });

  it('keeps createdAt <= lastReviewed < DEMO_DATA_AS_OF (pre-#17 dates only)', () => {
    const asOf = Date.parse(DEMO_DATA_AS_OF);
    assert.ok(Number.isFinite(asOf), 'DEMO_DATA_AS_OF must be a valid ISO date');
    for (const state of demoKnowledgeStates) {
      assert.ok(isIso(state.createdAt), `${state.id} createdAt`);
      assert.ok(isIso(state.lastReviewed), `${state.id} lastReviewed`);
      assert.ok(
        Date.parse(state.createdAt) <= Date.parse(state.lastReviewed),
        `${state.id} createdAt must not be after lastReviewed`,
      );
      assert.ok(
        Date.parse(state.lastReviewed) < asOf,
        `${state.id} lastReviewed must predate DEMO_DATA_AS_OF (a newer date would hide the Refresh example data button)`,
      );
    }
  });
});

describe('isServerlessEnvironment', () => {
  const ENV_KEYS = ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'DEMO_MODE'] as const;
  type EnvKey = (typeof ENV_KEYS)[number];
  const originalEnv = new Map<EnvKey, string | undefined>(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  /** Start from a clean slate, then set only the given markers. */
  const setEnv = (values: Partial<Record<EnvKey, string>> = {}): void => {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) process.env[key] = value;
    }
  };

  after(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(() => {
    setEnv();
  });

  it('is false when none of the markers is set', () => {
    assert.equal(isServerlessEnvironment(), false);
  });

  it('is true only when VERCEL is exactly "1"', () => {
    setEnv({ VERCEL: '1' });
    assert.equal(isServerlessEnvironment(), true);
    setEnv({ VERCEL: '0' });
    assert.equal(isServerlessEnvironment(), false);
  });

  it('is true when AWS_LAMBDA_FUNCTION_NAME is set to a non-empty value', () => {
    setEnv({ AWS_LAMBDA_FUNCTION_NAME: 'learngraph-handler' });
    assert.equal(isServerlessEnvironment(), true);
    setEnv({ AWS_LAMBDA_FUNCTION_NAME: '' });
    assert.equal(isServerlessEnvironment(), false);
  });

  it('is true only when DEMO_MODE is exactly "true"', () => {
    setEnv({ DEMO_MODE: 'true' });
    assert.equal(isServerlessEnvironment(), true);
    setEnv({ DEMO_MODE: 'false' });
    assert.equal(isServerlessEnvironment(), false);
  });
});
