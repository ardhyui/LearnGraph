/**
 * "Ways to learn it" must say where each suggestion comes from: the universal
 * worked example is always suggested, while visual aids, chunking, analogies,
 * peer discussion and the like only appear because of the learner's answers.
 * The marker is additive: strategy list, order, priorities and reasons stay as
 * they were, and a profile with no answers still gets only the general one.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { adjustForPsychometrics, selectScaffoldingStrategies } from '../src/lib/graph/scaffolding.ts';
import type { LearnerProfile } from '../src/lib/graph/types.ts';

const s = (score: number) => ({ score, confidence: 0.7, lastUpdated: '2026-11-02T00:00:00.000Z' });

const profile = (extra: Partial<LearnerProfile> = {}): LearnerProfile => ({
  userId: 'x',
  createdAt: '',
  updatedAt: '',
  psychometricScores: {},
  ...extra,
});

const sources = (strategies: { type: string; source?: string }[]) =>
  Object.fromEntries(strategies.map((st) => [st.type, st.source]));

describe('scaffolding strategy source', () => {
  it('a profile with no answers only gets the general worked example', () => {
    const strategies = selectScaffoldingStrategies(profile());
    assert.deepEqual(strategies, [
      {
        type: 'worked_example',
        reason: 'Universal foundation for learning new concepts',
        priority: 8,
        source: 'general',
      },
    ]);
  });

  it('marks style, trait and cognitive-profile suggestions as "profile"', () => {
    // The stored style is what My Profile derives once the key topics are filled in.
    const strategies = selectScaffoldingStrategies(
      profile({
        psychometricScores: {
          learning_styles: s(85),
          big_five_extraversion: s(90),
          big_five_openness: s(20),
          big_five_neuroticism: s(20),
          big_five_conscientiousness: s(50),
        },
        learningStyle: {
          primary: 'visual',
          socialPreference: 'collaborative',
          pacePreference: 'structured',
          feedbackPreference: 'immediate',
        },
      }),
    );

    // Same order as before: priority descending.
    assert.deepEqual(
      strategies.map((st) => [st.type, st.priority, st.source]),
      [
        ['visual_aids', 9, 'profile'],
        ['worked_example', 8, 'general'],
        ['analogy', 7, 'profile'],
        ['peer_discussion', 6, 'profile'],
      ],
    );
  });

  it('marks chunking from a low working memory and repetition from a short attention span', () => {
    const strategies = selectScaffoldingStrategies(
      profile({
        cognitiveProfile: {
          workingMemoryCapacity: 'low',
          attentionSpan: 'short',
          processingSpeed: 'medium',
          abstractThinking: 'mixed',
        },
      }),
    );
    assert.deepEqual(
      strategies.map((st) => st.type),
      ['chunking', 'worked_example', 'repetition'],
    );
    assert.deepEqual(sources(strategies), {
      chunking: 'profile',
      worked_example: 'general',
      repetition: 'profile',
    });
  });

  it('an anxious or kinesthetic profile keeps its suggestions marked as profile', () => {
    const anxious = selectScaffoldingStrategies(
      profile({
        psychometricScores: { big_five_neuroticism: s(80) },
      }),
    );
    assert.equal(sources(anxious).guided_practice, 'profile');
    assert.equal(sources(anxious).hints, 'profile');
    assert.equal(sources(anxious).worked_example, 'general');

    const handsOn = selectScaffoldingStrategies(
      profile({
        learningStyle: {
          primary: 'kinesthetic',
          socialPreference: 'solo',
          pacePreference: 'self-paced',
          feedbackPreference: 'on-request',
        },
      }),
    );
    assert.equal(sources(handsOn).guided_practice, 'profile');
  });

  it('adjustForPsychometrics passes the sources through untouched', () => {
    const adjustments = adjustForPsychometrics(
      profile({
        psychometricScores: { big_five_extraversion: s(90) },
      }),
    );
    assert.deepEqual(sources(adjustments.scaffoldingStrategies), {
      peer_discussion: 'profile',
      worked_example: 'general',
    });
  });

  it('the Recommendations page shows the source in readable text, not only a tooltip', () => {
    const pageSrc = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'routes', 'recommendations.tsx'),
      'utf8',
    );
    assert.match(pageSrc, /source\?: 'general' \| 'profile'/);
    assert.match(pageSrc, /general: 'Always suggested'/);
    assert.match(pageSrc, /profile: 'From your profile'/);
    assert.match(pageSrc, /strategy\.source &&/);
    assert.match(pageSrc, /SCAFFOLDING_SOURCE_LABELS\[strategy\.source\]/);
    // The reason stays available as a hover tooltip.
    assert.match(pageSrc, /title=\{strategy\.reason\}/);
  });
});
