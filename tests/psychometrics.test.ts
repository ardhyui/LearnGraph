/**
 * The 39-domain psychometric registry feeds My Profile, the admin editor and
 * the study plan. This test locks the registry itself (ids, metadata and
 * category partition) plus the two derived outputs that are pure functions of
 * it: `estimateCognitiveProfile` and `getLearningStyleDescription`.
 *
 * `hasLearningStyleInputs`, `deriveLearningStyle` and
 * `derivedProfilesFromScores` are already covered by
 * `tests/profile-traits.test.ts` and `tests/admin-derived-profiles.test.ts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_DOMAIN_IDS,
  DOMAIN_CATEGORIES,
  DOMAIN_METADATA,
  PSYCHOMETRIC_DOMAINS,
  estimateCognitiveProfile,
  getDomainMetadata,
  getDomainsByCategory,
  getLearningStyleDescription,
} from '../src/lib/graph/psychometrics.ts';
import type { CognitiveProfile, LearningModality, LearningStyle } from '../src/lib/graph/types.ts';

const s = (score: number) => ({
  score,
  confidence: 0.7,
  lastUpdated: '2026-11-15T00:00:00.000Z',
});

/** Explicit copy: adding, removing or renaming a domain must show up in the diff. */
const EXPECTED_DOMAIN_IDS = [
  'big_five_openness',
  'big_five_conscientiousness',
  'big_five_extraversion',
  'big_five_agreeableness',
  'big_five_neuroticism',
  'dark_triad_narcissism',
  'dark_triad_machiavellianism',
  'dark_triad_psychopathy',
  'emotional_empathy',
  'emotional_intelligence',
  'attachment_style',
  'love_languages',
  'communication_style',
  'social_support',
  'risk_tolerance',
  'decision_style',
  'time_orientation',
  'locus_of_control',
  'achievement_motivation',
  'self_efficacy',
  'growth_mindset',
  'authenticity',
  'personal_values',
  'interests',
  'life_satisfaction',
  'stress_coping',
  'cognitive_abilities',
  'creativity',
  'learning_styles',
  'information_processing',
  'metacognition',
  'executive_functions',
  'social_cognition',
  'political_ideology',
  'cultural_values',
  'moral_reasoning',
  'work_career_style',
  'sensory_processing',
  'aesthetic_preferences',
];

const EMPTY_PROFILE: CognitiveProfile = {
  workingMemoryCapacity: 'medium',
  attentionSpan: 'medium',
  processingSpeed: 'medium',
  abstractThinking: 'mixed',
};

const style = (
  primary: LearningModality,
  socialPreference: LearningStyle['socialPreference'],
  pacePreference: LearningStyle['pacePreference'],
  overrides: Partial<LearningStyle> = {},
): LearningStyle => ({
  primary,
  socialPreference,
  pacePreference,
  feedbackPreference: 'on-request',
  ...overrides,
});

describe('psychometric domain registry', () => {
  it('lists exactly the 39 domains in source order', () => {
    assert.equal(ALL_DOMAIN_IDS.length, 39);
    assert.deepEqual(ALL_DOMAIN_IDS, EXPECTED_DOMAIN_IDS);
    assert.deepEqual(ALL_DOMAIN_IDS, Object.values(PSYCHOMETRIC_DOMAINS));
    assert.equal(new Set(ALL_DOMAIN_IDS).size, 39, 'domain ids stay unique');
  });

  it('maps every constant to the same lowercase id', () => {
    const keys = Object.keys(PSYCHOMETRIC_DOMAINS);
    assert.equal(keys.length, 39);
    assert.equal(new Set(keys).size, 39, 'constant names stay unique');
    for (const [key, value] of Object.entries(PSYCHOMETRIC_DOMAINS)) {
      assert.equal(value, key.toLowerCase(), key);
      assert.ok(value.length > 0, key);
    }
  });

  it('has exactly one metadata entry per domain, with no stranger keys', () => {
    assert.deepEqual(Object.keys(DOMAIN_METADATA).sort(), [...ALL_DOMAIN_IDS].sort());
    for (const id of ALL_DOMAIN_IDS) {
      assert.equal(DOMAIN_METADATA[id].id, id);
    }
  });
});

describe('domain metadata', () => {
  it('fills in every field the profile pages render', () => {
    const categories = new Set<string>(DOMAIN_CATEGORIES);
    for (const id of ALL_DOMAIN_IDS) {
      const entry = DOMAIN_METADATA[id];
      assert.equal(entry.id, id);
      for (const field of ['name', 'description', 'educationalRelevance'] as const) {
        assert.equal(typeof entry[field], 'string', `${id}.${field}`);
        assert.ok(entry[field].trim().length > 0, `${id}.${field} is not empty`);
      }
      assert.ok(categories.has(entry.category), `${id} has a known category: ${entry.category}`);
      for (const band of ['low', 'mid', 'high'] as const) {
        assert.equal(typeof entry.scoreInterpretation[band], 'string', `${id}.${band}`);
        assert.ok(entry.scoreInterpretation[band].trim().length > 0, `${id}.${band} is not empty`);
      }
    }
  });
});

describe('domain categories', () => {
  it('partitions all 39 domains into the 12 categories', () => {
    assert.equal(DOMAIN_CATEGORIES.length, 12);
    assert.equal(new Set(DOMAIN_CATEGORIES).size, 12, 'categories stay unique');

    const combined = DOMAIN_CATEGORIES.flatMap((category) => getDomainsByCategory(category));
    assert.equal(combined.length, 39, 'every domain lands in exactly one category');
    assert.equal(new Set(combined).size, 39, 'no domain is listed twice');
    assert.deepEqual([...combined].sort(), [...ALL_DOMAIN_IDS].sort());
    for (const category of DOMAIN_CATEGORIES) {
      assert.ok(getDomainsByCategory(category).length > 0, `${category} is used`);
    }
  });

  it('filters in registry order', () => {
    for (const category of DOMAIN_CATEGORIES) {
      const expected = ALL_DOMAIN_IDS.filter((id) => DOMAIN_METADATA[id].category === category);
      assert.deepEqual(getDomainsByCategory(category), expected, category);
    }
  });

  it('treats an unknown category as empty and returns the registry object itself', () => {
    assert.deepEqual(getDomainsByCategory('Not A Category' as never), []);
    for (const id of ALL_DOMAIN_IDS) {
      assert.equal(getDomainMetadata(id), DOMAIN_METADATA[id], id);
    }
  });
});

describe('estimateCognitiveProfile', () => {
  it('falls back to the neutral profile for empty scores', () => {
    assert.deepEqual(estimateCognitiveProfile({}), EMPTY_PROFILE);
    assert.deepEqual(Object.keys(estimateCognitiveProfile({})).sort(), [
      'abstractThinking',
      'attentionSpan',
      'processingSpeed',
      'workingMemoryCapacity',
    ]);
  });

  it('treats both window edges as inclusive and keeps the middle neutral', () => {
    const all = (score: number) => ({
      executive_functions: s(score),
      cognitive_abilities: s(score),
      big_five_conscientiousness: s(score),
      metacognition: s(score),
      big_five_openness: s(score),
      information_processing: s(score),
    });

    assert.deepEqual(estimateCognitiveProfile(all(65)), {
      workingMemoryCapacity: 'high',
      attentionSpan: 'long',
      processingSpeed: 'fast',
      abstractThinking: 'abstract',
    });
    assert.deepEqual(estimateCognitiveProfile(all(35)), {
      workingMemoryCapacity: 'low',
      attentionSpan: 'short',
      processingSpeed: 'slow',
      abstractThinking: 'concrete',
    });
    assert.deepEqual(estimateCognitiveProfile(all(64)), EMPTY_PROFILE);
    assert.deepEqual(estimateCognitiveProfile(all(36)), EMPTY_PROFILE);
  });

  it('reads each dimension from its own pair of scores', () => {
    // working memory = executive_functions + cognitive_abilities
    assert.deepEqual(estimateCognitiveProfile({ executive_functions: s(90) }), {
      workingMemoryCapacity: 'high',
      attentionSpan: 'long', // executive_functions also feeds attention
      processingSpeed: 'medium',
      abstractThinking: 'mixed',
    });
    assert.deepEqual(estimateCognitiveProfile({ cognitive_abilities: s(90) }), {
      workingMemoryCapacity: 'high',
      attentionSpan: 'medium',
      processingSpeed: 'fast', // cognitive_abilities also feeds speed
      abstractThinking: 'mixed',
    });

    // attention = executive_functions + big_five_conscientiousness
    assert.deepEqual(estimateCognitiveProfile({ big_five_conscientiousness: s(90) }), {
      workingMemoryCapacity: 'medium',
      attentionSpan: 'long',
      processingSpeed: 'medium',
      abstractThinking: 'mixed',
    });

    // processing speed = cognitive_abilities + metacognition
    assert.deepEqual(estimateCognitiveProfile({ metacognition: s(90) }), {
      workingMemoryCapacity: 'medium',
      attentionSpan: 'medium',
      processingSpeed: 'fast',
      abstractThinking: 'mixed',
    });

    // abstract thinking = big_five_openness + information_processing
    for (const domain of ['big_five_openness', 'information_processing'] as const) {
      assert.deepEqual(estimateCognitiveProfile({ [domain]: s(90) }), {
        workingMemoryCapacity: 'medium',
        attentionSpan: 'medium',
        processingSpeed: 'medium',
        abstractThinking: 'abstract',
      });
    }
  });

  it('ignores missing, bare legacy numbers and non-object entries', () => {
    const bare = estimateCognitiveProfile({
      executive_functions: 0.9,
      cognitive_abilities: 0.1,
      big_five_conscientiousness: 0.9,
      metacognition: 0.1,
      big_five_openness: 0.9,
      information_processing: 0.1,
    } as never);
    assert.deepEqual(bare, EMPTY_PROFILE, 'legacy 0–1 numbers are not 0–100 answers');

    for (const bad of ['90', null, true, 90, []]) {
      const profile = estimateCognitiveProfile({ executive_functions: bad } as never);
      assert.equal(profile.workingMemoryCapacity, 'medium', JSON.stringify(bad));
      assert.equal(profile.attentionSpan, 'medium', JSON.stringify(bad));
    }

    // A NaN score is not validated away: the average is NaN, so neither
    // threshold matches and the neutral fallback wins.
    const nan = estimateCognitiveProfile({ executive_functions: { score: Number.NaN } } as never);
    assert.equal(nan.workingMemoryCapacity, 'medium');
    assert.equal(nan.attentionSpan, 'medium');
  });
});

describe('getLearningStyleDescription', () => {
  const modalityPhrases: Record<LearningModality, string> = {
    visual: 'visual learner who prefers diagrams, charts, and videos',
    auditory: 'auditory learner who benefits from lectures and discussions',
    kinesthetic: 'hands-on learner who learns by doing and experimenting',
    reading: 'reading/writing learner who prefers text-based materials',
  };

  it('describes every modality with the source phrasing', () => {
    for (const [primary, phrase] of Object.entries(modalityPhrases) as [LearningModality, string][]) {
      assert.equal(
        getLearningStyleDescription(style(primary, 'mixed', 'structured')),
        `You're a ${phrase} who flexible between solo and group work and learns best with clear schedules and deadlines.`,
        primary,
      );
    }
  });

  it('describes every social and pace preference with the source phrasing', () => {
    const socialPhrases = {
      solo: 'prefers independent study',
      collaborative: 'thrives in group settings',
      mixed: 'flexible between solo and group work',
    } as const;
    const pacePhrases = {
      'self-paced': 'at your own pace',
      structured: 'with clear schedules and deadlines',
      intensive: 'in focused, intensive sessions',
    } as const;

    for (const [socialPreference, phrase] of Object.entries(socialPhrases)) {
      assert.equal(
        getLearningStyleDescription(
          style('visual', socialPreference as LearningStyle['socialPreference'], 'self-paced'),
        ),
        `You're a visual learner who prefers diagrams, charts, and videos who ${phrase} and learns best at your own pace.`,
        socialPreference,
      );
    }
    for (const [pacePreference, phrase] of Object.entries(pacePhrases)) {
      assert.equal(
        getLearningStyleDescription(
          style('visual', 'solo', pacePreference as LearningStyle['pacePreference']),
        ),
        `You're a visual learner who prefers diagrams, charts, and videos who prefers independent study and learns best ${phrase}.`,
        pacePreference,
      );
    }
  });

  it('does not let secondary modality or feedback preference change the text', () => {
    const a = getLearningStyleDescription(
      style('auditory', 'solo', 'intensive', { secondary: 'visual', feedbackPreference: 'immediate' }),
    );
    const b = getLearningStyleDescription(
      style('auditory', 'solo', 'intensive', { secondary: 'kinesthetic', feedbackPreference: 'delayed' }),
    );
    const c = getLearningStyleDescription(style('auditory', 'solo', 'intensive', { feedbackPreference: 'on-request' }));
    assert.equal(a, b);
    assert.equal(a, c);
    assert.equal(
      a,
      "You're a auditory learner who benefits from lectures and discussions who prefers independent study and learns best in focused, intensive sessions.",
    );
  });
});
