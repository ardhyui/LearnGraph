/**
 * Direct unit tests for the psychometric scaffolding module
 * `src/lib/graph/scaffolding.ts` (`adjustForPsychometrics`,
 * `selectScaffoldingStrategies`, `calculatePsychometricMatch`).
 *
 * Until now the module was only touched indirectly: PR #45 tested the
 * `source` labels and the ZPD engine exercises it end-to-end, but the
 * decision tables themselves (thresholds, deltas, consideration texts,
 * score-reading rules) were never locked. These tests pin the current
 * behavior so accidental changes fail loudly.
 *
 * The clamp `Math.max(-0.5, Math.min(0.5, …))` on `difficultyModifier` is
 * guarded statically: with today's traits the reachable range is only
 * −0.3…+0.2, so the clamp cannot be exercised through the public API.
 *
 * The module is not changed by this file — tests only, plus static guards
 * for the engine delegation in `education-graph-db.ts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  adjustForPsychometrics,
  calculatePsychometricMatch,
  selectScaffoldingStrategies,
} from '../src/lib/graph/scaffolding.ts';
import type {
  ConceptNode,
  LearnerProfile,
  LearningStyle,
  PsychometricAdjustments,
} from '../src/lib/graph/types.ts';

const score = (value: number) => ({ score: value, confidence: 0.8, lastUpdated: '2026-11-15T00:00:00.000Z' });

/** Small helper: a LearnerProfile built from scores, style and cognitive profile. */
const learner = (parts: {
  scores?: Record<string, unknown>;
  learningStyle?: LearningStyle;
  cognitiveProfile?: LearnerProfile['cognitiveProfile'];
} = {}): LearnerProfile => ({
  userId: 'learner-1',
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
  psychometricScores: (parts.scores ?? {}) as LearnerProfile['psychometricScores'],
  ...(parts.learningStyle ? { learningStyle: parts.learningStyle } : {}),
  ...(parts.cognitiveProfile ? { cognitiveProfile: parts.cognitiveProfile } : {}),
});

const style = (primary: LearningStyle['primary']): LearningStyle => ({
  primary,
  socialPreference: 'mixed',
  pacePreference: 'self-paced',
  feedbackPreference: 'immediate',
});

const lowMemoryShortAttention = {
  workingMemoryCapacity: 'low',
  attentionSpan: 'short',
  processingSpeed: 'medium',
  abstractThinking: 'mixed',
} as const;

/** A concept with neutral load/abstractness unless overridden. */
const concept = (parts: { absolute: number; cognitiveLoad?: number; abstractness?: number }): ConceptNode => ({
  conceptId: 'concept-1',
  name: 'Test concept',
  domain: 'math',
  description: 'Concept used only by these tests',
  difficulty: {
    absolute: parts.absolute,
    cognitiveLoad: parts.cognitiveLoad ?? 0.2,
    abstractness: parts.abstractness ?? 0.2,
  },
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
});

/** Minimal adjustments; only the difficulty modifier matters for the match. */
const adj = (difficultyModifier: number): PsychometricAdjustments => ({
  difficultyModifier,
  paceRecommendation: 'normal',
  attentionConsiderations: [],
  scaffoldingStrategies: [],
  presentationStyle: 'mixed',
});

const typesWithPriority = (strategies: { type: string; priority: number }[]) =>
  strategies.map((s) => [s.type, s.priority]);

/** Compare floating-point results by epsilon: the decision table is locked,
 * not the exact bit pattern of accumulated deltas. */
const assertClose = (actual: number, expected: number, message = 'value') => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ~${expected}, got ${actual}`);
};

describe('adjustForPsychometrics', () => {
  it('an empty profile keeps every default', () => {
    const a = adjustForPsychometrics(learner());
    assert.equal(a.difficultyModifier, 0);
    assert.equal(a.paceRecommendation, 'normal');
    assert.deepEqual(a.attentionConsiderations, []);
    assert.equal(a.presentationStyle, 'mixed');
  });

  it('openness beyond 70 adds 0.2, below 30 subtracts 0.1, mid stays 0', () => {
    assertClose(adjustForPsychometrics(learner({ scores: { big_five_openness: score(80) } })).difficultyModifier, 0.2);
    assertClose(adjustForPsychometrics(learner({ scores: { big_five_openness: score(71) } })).difficultyModifier, 0.2);
    assertClose(adjustForPsychometrics(learner({ scores: { big_five_openness: score(20) } })).difficultyModifier, -0.1);
    assertClose(adjustForPsychometrics(learner({ scores: { big_five_openness: score(29) } })).difficultyModifier, -0.1);
    assert.equal(adjustForPsychometrics(learner({ scores: { big_five_openness: score(50) } })).difficultyModifier, 0);
    assert.equal(adjustForPsychometrics(learner({ scores: { big_five_openness: score(70) } })).difficultyModifier, 0);
    assert.equal(adjustForPsychometrics(learner({ scores: { big_five_openness: score(30) } })).difficultyModifier, 0);
  });

  it('conscientiousness beyond 70 speeds the pace, below 30 slows it with a structure consideration', () => {
    const faster = adjustForPsychometrics(learner({ scores: { big_five_conscientiousness: score(80) } }));
    assert.equal(faster.paceRecommendation, 'faster');
    assert.deepEqual(faster.attentionConsiderations, []);

    const slower = adjustForPsychometrics(learner({ scores: { big_five_conscientiousness: score(20) } }));
    assert.equal(slower.paceRecommendation, 'slower');
    assert.deepEqual(slower.attentionConsiderations, ['May need more structure and checkpoints']);

    const mid = adjustForPsychometrics(learner({ scores: { big_five_conscientiousness: score(50) } }));
    assert.equal(mid.paceRecommendation, 'normal');
    assert.deepEqual(mid.attentionConsiderations, []);
  });

  it('neuroticism beyond 70 eases difficulty and asks for encouragement', () => {
    const a = adjustForPsychometrics(learner({ scores: { big_five_neuroticism: score(80) } }));
    assertClose(a.difficultyModifier, -0.2);
    assert.deepEqual(a.attentionConsiderations, ['Keep encouragement high, minimize failure scenarios']);
    // The boundary is strict: exactly 70 does nothing.
    const atBoundary = adjustForPsychometrics(learner({ scores: { big_five_neuroticism: score(70) } }));
    assert.equal(atBoundary.difficultyModifier, 0);
    assert.deepEqual(atBoundary.attentionConsiderations, []);
  });

  it('extraversion beyond 70 suggests collaboration, below 30 solo study', () => {
    const social = adjustForPsychometrics(learner({ scores: { big_five_extraversion: score(80) } }));
    assert.equal(social.difficultyModifier, 0);
    assert.deepEqual(social.attentionConsiderations, ['Benefits from collaborative learning']);

    const solo = adjustForPsychometrics(learner({ scores: { big_five_extraversion: score(20) } }));
    assert.deepEqual(solo.attentionConsiderations, ['Prefers solo study, may be overwhelmed by group work']);

    const mid = adjustForPsychometrics(learner({ scores: { big_five_extraversion: score(50) } }));
    assert.deepEqual(mid.attentionConsiderations, []);
  });

  it('all low traits combine: modifier -0.3, slower pace, considerations in trait order', () => {
    const a = adjustForPsychometrics(
      learner({
        scores: {
          big_five_openness: score(20),
          big_five_conscientiousness: score(20),
          big_five_neuroticism: score(80),
          big_five_extraversion: score(20),
        },
      }),
    );
    // Reachable extremes today: -0.3 (openness -0.1 + neuroticism -0.2) and
    // +0.2 (openness alone). The [−0.5, 0.5] clamp is guarded statically.
    assertClose(a.difficultyModifier, -0.3, 'combined modifier');
    assertClose(
      adjustForPsychometrics(learner({ scores: { big_five_openness: score(80) } })).difficultyModifier,
      0.2,
      'max modifier',
    );
    assert.equal(a.paceRecommendation, 'slower');
    assert.deepEqual(a.attentionConsiderations, [
      'May need more structure and checkpoints',
      'Keep encouragement high, minimize failure scenarios',
      'Prefers solo study, may be overwhelmed by group work',
    ]);
  });

  it('presentation style follows the primary learning modality', () => {
    assert.equal(adjustForPsychometrics(learner({ learningStyle: style('visual') })).presentationStyle, 'visual');
    assert.equal(adjustForPsychometrics(learner({ learningStyle: style('auditory') })).presentationStyle, 'verbal');
    assert.equal(adjustForPsychometrics(learner({ learningStyle: style('kinesthetic') })).presentationStyle, 'hands_on');
    // 'reading' and no style at all fall back to mixed.
    assert.equal(adjustForPsychometrics(learner({ learningStyle: style('reading') })).presentationStyle, 'mixed');
    assert.equal(adjustForPsychometrics(learner()).presentationStyle, 'mixed');
  });

  it('exposes exactly the strategies selectScaffoldingStrategies returns for the same profile', () => {
    const rich = learner({
      scores: {
        big_five_neuroticism: score(80),
        big_five_extraversion: score(80),
        big_five_openness: score(20),
      },
      learningStyle: style('kinesthetic'),
      cognitiveProfile: lowMemoryShortAttention,
    });
    assert.deepEqual(
      adjustForPsychometrics(rich).scaffoldingStrategies,
      selectScaffoldingStrategies(rich),
    );
  });

  it('reads traits through traitScore: canonical ids, legacy aliases, and junk entries', () => {
    // Canonical id and legacy alias both reach the decision table.
    assert.deepEqual(
      adjustForPsychometrics(learner({ scores: { neuroticism: score(80) } })).attentionConsiderations,
      ['Keep encouragement high, minimize failure scenarios'],
    );
    assertClose(
      adjustForPsychometrics(learner({ scores: { openness_to_experience: score(80) } })).difficultyModifier,
      0.2,
      'legacy alias read',
    );
    // Old demo data stores bare 0–1 numbers; entries without a usable score are
    // ignored, and the canonical id wins over the legacy alias.
    const junk = learner({
      scores: {
        neuroticism: 0.9,
        openness: 0.85,
        big_five_extraversion: { confidence: 0.9, lastUpdated: '2026-11-15T00:00:00.000Z' },
      },
    });
    const junkAdjustments = adjustForPsychometrics(junk);
    assert.equal(junkAdjustments.difficultyModifier, 0);
    assert.deepEqual(junkAdjustments.attentionConsiderations, []);
    const canonicalFirst = adjustForPsychometrics(
      learner({ scores: { big_five_openness: score(80), openness_to_experience: score(20) } }),
    );
    assertClose(canonicalFirst.difficultyModifier, 0.2, 'canonical id wins');
  });
});

describe('selectScaffoldingStrategies', () => {
  it('an empty profile gets exactly the general worked example', () => {
    assert.deepEqual(selectScaffoldingStrategies(learner()), [
      {
        type: 'worked_example',
        reason: 'Universal foundation for learning new concepts',
        priority: 8,
        source: 'general',
      },
    ]);
  });

  it('each profile condition adds its own strategy', () => {
    const cases: { label: string; profile: LearnerProfile; type: string; priority: number }[] = [
      {
        label: 'visual learning style',
        profile: learner({ learningStyle: style('visual') }),
        type: 'visual_aids',
        priority: 9,
      },
      {
        label: 'high neuroticism',
        profile: learner({ scores: { big_five_neuroticism: score(80) } }),
        type: 'guided_practice',
        priority: 8,
      },
      {
        label: 'high neuroticism (hints)',
        profile: learner({ scores: { big_five_neuroticism: score(80) } }),
        type: 'hints',
        priority: 7,
      },
      {
        label: 'low working memory',
        profile: learner({ cognitiveProfile: lowMemoryShortAttention }),
        type: 'chunking',
        priority: 9,
      },
      {
        label: 'high extraversion',
        profile: learner({ scores: { big_five_extraversion: score(80) } }),
        type: 'peer_discussion',
        priority: 6,
      },
      {
        label: 'low openness',
        profile: learner({ scores: { big_five_openness: score(20) } }),
        type: 'analogy',
        priority: 7,
      },
      {
        label: 'short attention span',
        profile: learner({ cognitiveProfile: lowMemoryShortAttention }),
        type: 'repetition',
        priority: 7,
      },
      {
        label: 'kinesthetic learning style',
        profile: learner({ learningStyle: style('kinesthetic') }),
        type: 'guided_practice',
        priority: 9,
      },
    ];
    for (const { label, profile, type, priority } of cases) {
      const strategies = selectScaffoldingStrategies(profile);
      const found = strategies.filter((s) => s.type === type);
      assert.equal(found.length, 1, `${label}: exactly one ${type}`);
      assert.equal(found[0].priority, priority, `${label}: priority ${priority}`);
      assert.equal(found[0].source, 'profile', `${label}: marked as profile`);
      // Every condition keeps the universal worked example around.
      assert.ok(
        strategies.some((s) => s.type === 'worked_example' && s.source === 'general'),
        `${label}: worked example stays`,
      );
    }
  });

  it('a profile hitting every condition at once stays sorted by priority descending', () => {
    const strategies = selectScaffoldingStrategies(
      learner({
        scores: {
          big_five_neuroticism: score(80),
          big_five_extraversion: score(80),
          big_five_openness: score(20),
        },
        learningStyle: style('kinesthetic'),
        cognitiveProfile: lowMemoryShortAttention,
      }),
    );
    assert.deepEqual(typesWithPriority(strategies), [
      ['chunking', 9],
      ['guided_practice', 9], // kinesthetic: pushed after chunking, stable sort keeps it second
      ['worked_example', 8],
      ['guided_practice', 8], // high neuroticism
      ['hints', 7],
      ['analogy', 7],
      ['repetition', 7],
      ['peer_discussion', 6],
    ]);
    const priorities = strategies.map((s) => s.priority);
    assert.deepEqual([...priorities].sort((a, b) => b - a), priorities);
  });

  it('thresholds are strict, tested exactly at the boundary', () => {
    const neurotic = (value: number) =>
      selectScaffoldingStrategies(learner({ scores: { big_five_neuroticism: score(value) } }));
    assert.equal(neurotic(60).length, 1); // only the worked example
    assert.deepEqual(typesWithPriority(neurotic(61)), [['worked_example', 8], ['guided_practice', 8], ['hints', 7]]);

    const extraverted = (value: number) =>
      selectScaffoldingStrategies(learner({ scores: { big_five_extraversion: score(value) } }));
    assert.equal(extraverted(70).length, 1);
    assert.deepEqual(typesWithPriority(extraverted(71)), [['worked_example', 8], ['peer_discussion', 6]]);

    const closed = (value: number) =>
      selectScaffoldingStrategies(learner({ scores: { big_five_openness: score(value) } }));
    assert.equal(closed(40).length, 1);
    assert.deepEqual(typesWithPriority(closed(39)), [['worked_example', 8], ['analogy', 7]]);
  });

  it('reads scores through traitScore, so junk entries stay inert', () => {
    // Legacy bare 0–1 numbers and entries without a score must not trigger
    // conditions (a bare 0.9 must not read as neuroticism 0.9% or similar).
    const junk = learner({
      scores: {
        neuroticism: 0.9,
        extraversion: 0.85,
        openness: 0.2,
        big_five_conscientiousness: { confidence: 0.9, lastUpdated: '2026-11-15T00:00:00.000Z' },
      },
    });
    assert.deepEqual(typesWithPriority(selectScaffoldingStrategies(junk)), [['worked_example', 8]]);

    // Canonical ids and legacy aliases both reach the conditions.
    assert.deepEqual(
      typesWithPriority(selectScaffoldingStrategies(learner({ scores: { neuroticism: score(80) } }))),
      [['worked_example', 8], ['guided_practice', 8], ['hints', 7]],
    );
    assert.deepEqual(
      typesWithPriority(selectScaffoldingStrategies(learner({ scores: { openness_to_experience: score(20) } }))),
      [['worked_example', 8], ['analogy', 7]],
    );
  });
});

describe('calculatePsychometricMatch', () => {
  it('a neutral concept and profile match at the 0.5 base', () => {
    // Difficulty 8 with no modifier sits outside the optimal [4, 7] window.
    assert.equal(calculatePsychometricMatch(concept({ absolute: 8 }), learner(), adj(0)), 0.5);
    assert.equal(calculatePsychometricMatch(concept({ absolute: 3 }), learner(), adj(0)), 0.5);
  });

  it('abstract concepts reward openness and punish closedness', () => {
    const abstract = { absolute: 8, abstractness: 0.8 };
    assertClose(
      calculatePsychometricMatch(concept(abstract), learner({ scores: { big_five_openness: score(80) } }), adj(0)),
      0.7,
    );
    assertClose(
      calculatePsychometricMatch(concept(abstract), learner({ scores: { big_five_openness: score(61) } }), adj(0)),
      0.7,
    );
    assertClose(
      calculatePsychometricMatch(concept(abstract), learner({ scores: { big_five_openness: score(20) } }), adj(0)),
      0.3,
    );
    // Mid openness and a concrete concept stay neutral; the abstractness
    // boundary is strict at 0.7.
    assertClose(
      calculatePsychometricMatch(concept(abstract), learner({ scores: { big_five_openness: score(50) } }), adj(0)),
      0.5,
    );
    assertClose(
      calculatePsychometricMatch(
        concept({ absolute: 8, abstractness: 0.7 }),
        learner({ scores: { big_five_openness: score(80) } }),
        adj(0),
      ),
      0.5,
    );
    assertClose(
      calculatePsychometricMatch(concept({ absolute: 8 }), learner({ scores: { big_five_openness: score(80) } }), adj(0)),
      0.5,
    );
  });

  it('high cognitive load rewards working memory and punishes low capacity', () => {
    const loaded = { absolute: 8, cognitiveLoad: 0.8 };
    const highMemory = learner({ cognitiveProfile: { ...lowMemoryShortAttention, workingMemoryCapacity: 'high' } });
    const lowMemory = learner({ cognitiveProfile: lowMemoryShortAttention });
    assertClose(calculatePsychometricMatch(concept(loaded), highMemory, adj(0)), 0.65);
    assertClose(calculatePsychometricMatch(concept(loaded), lowMemory, adj(0)), 0.35);
    // Medium capacity and no cognitive profile stay neutral; the cognitive
    // load boundary is strict at 0.7.
    const mediumMemory = learner({ cognitiveProfile: { ...lowMemoryShortAttention, workingMemoryCapacity: 'medium' } });
    assertClose(calculatePsychometricMatch(concept(loaded), mediumMemory, adj(0)), 0.5);
    assertClose(calculatePsychometricMatch(concept(loaded), learner(), adj(0)), 0.5);
    assertClose(
      calculatePsychometricMatch(concept({ absolute: 8, cognitiveLoad: 0.7 }), highMemory, adj(0)),
      0.5,
    );
  });

  it('an adjusted difficulty inside [4, 7] adds 0.1, inclusive at both ends', () => {
    assertClose(calculatePsychometricMatch(concept({ absolute: 4 }), learner(), adj(0)), 0.6);
    assertClose(calculatePsychometricMatch(concept({ absolute: 7 }), learner(), adj(0)), 0.6);
    assertClose(calculatePsychometricMatch(concept({ absolute: 5 }), learner(), adj(0)), 0.6);
    assertClose(calculatePsychometricMatch(concept({ absolute: 8 }), learner(), adj(0)), 0.5);
    assertClose(calculatePsychometricMatch(concept({ absolute: 3 }), learner(), adj(0)), 0.5);
    // adjustedDifficulty = absolute + modifier × 10: 5 + 0.2×10 = 7 → yes,
    // 5 − 0.2×10 = 3 → no.
    assertClose(calculatePsychometricMatch(concept({ absolute: 5 }), learner(), adj(0.2)), 0.6);
    assertClose(calculatePsychometricMatch(concept({ absolute: 5 }), learner(), adj(-0.2)), 0.5);
  });

  it('reaches at most 0.95 and at least 0.15', () => {
    const max = calculatePsychometricMatch(
      concept({ absolute: 5, cognitiveLoad: 0.9, abstractness: 0.9 }),
      learner({
        scores: { big_five_openness: score(80) },
        cognitiveProfile: { ...lowMemoryShortAttention, workingMemoryCapacity: 'high' },
      }),
      adj(0),
    );
    assertClose(max, 0.95, 'max reachable match');
    const min = calculatePsychometricMatch(
      concept({ absolute: 8, cognitiveLoad: 0.9, abstractness: 0.9 }),
      learner({
        scores: { big_five_openness: score(20) },
        cognitiveProfile: lowMemoryShortAttention,
      }),
      adj(0),
    );
    assertClose(min, 0.15, 'min reachable match');
  });

  it('uses the modifier from adjustForPsychometrics directly as the third argument', () => {
    const conceptMid = concept({ absolute: 5 });
    const anxious = learner({ scores: { big_five_neuroticism: score(80) } });
    const adjustments = adjustForPsychometrics(anxious);
    assertClose(adjustments.difficultyModifier, -0.2);
    // 5 − 0.2×10 = 3 → outside the window, so the +0.1 bonus is gone.
    assertClose(calculatePsychometricMatch(conceptMid, anxious, adjustments), 0.5);
    assertClose(calculatePsychometricMatch(conceptMid, learner(), adj(0)), 0.6);
  });
});

describe('static guards', () => {
  const scaffoldingSrc = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'lib', 'graph', 'scaffolding.ts'),
    'utf8',
  );
  const engineSrc = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'lib', 'graph', 'education-graph-db.ts'),
    'utf8',
  );

  it('the difficulty modifier clamp is still in adjustForPsychometrics', () => {
    // Reachable extremes today are −0.3/+0.2, so the clamp can only be
    // guarded by keeping the line in the source.
    assert.match(scaffoldingSrc, /Math\.max\(-0\.5, Math\.min\(0\.5, difficultyModifier\)\);/);
  });

  it('scaffolding reads traits through traitScore', () => {
    assert.match(scaffoldingSrc, /import \{ traitScore \} from '\.\/trait-scores\.ts';/);
  });

  it('the engine delegates the three same-named calls to the scaffolding module', () => {
    assert.match(engineSrc, /import \* as scaffolding from '\.\/scaffolding\.ts';/);
    assert.match(engineSrc, /return scaffolding\.adjustForPsychometrics\(profile\);/);
    assert.match(engineSrc, /return scaffolding\.selectScaffoldingStrategies\(profile\);/);
    assert.match(engineSrc, /scaffolding\.calculatePsychometricMatch\(concept, profile, adjustments\);/);
  });
});
