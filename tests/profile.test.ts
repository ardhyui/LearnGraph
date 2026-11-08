/**
 * My Profile for learners: everyday copy for the optional learning-style
 * modes, progress wording, and the "what next" step back to the dashboard.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  PROFILE_MODES,
  PROFILE_MODE_COPY,
  masteredLine,
  profileModeLabel,
  profileModeOptions,
  profileNextStep,
  UNBUILT_PROFILE_MODES,
  hasMoreTopicsConsent,
  offeredDomainIds,
  withMoreTopicsConsent,
} from '../src/lib/profile.ts';
import { summarizeProgress } from '../src/lib/study.ts';
import { focusDomains, inFocus, withFocus } from '../src/lib/onboarding.ts';

describe('profile mode copy', () => {
  it('every mode has short, non-technical copy', () => {
    for (const mode of Object.keys(PROFILE_MODE_COPY) as (keyof typeof PROFILE_MODE_COPY)[]) {
      const c = PROFILE_MODE_COPY[mode];
      assert.ok(c.label.length > 0 && c.label.length <= 16, `${mode} label "${c.label}"`);
      assert.ok(c.description.length <= 140, `${mode} description too long`);
      const text = `${c.label} ${c.title} ${c.description}`;
      assert.doesNotMatch(text, /psychometric|Option [A-D]|PERMANENT|scientifically/i, mode);
    }
  });

  it('does not offer the modes whose inference is not built, unless the profile already chose one', () => {
    assert.deepEqual(PROFILE_MODES, ['view', 'manual', 'assessment']);
    assert.deepEqual(profileModeOptions(undefined), ['view', 'manual', 'assessment']);
    assert.deepEqual(profileModeOptions('manual'), ['view', 'manual', 'assessment']);
    assert.deepEqual(profileModeOptions('auto'), ['view', 'auto', 'manual', 'assessment']);
    assert.deepEqual(profileModeOptions('adaptive'), ['view', 'manual', 'adaptive', 'assessment']);
    assert.deepEqual(profileModeOptions('constructor'), ['view', 'manual', 'assessment']);
    for (const mode of UNBUILT_PROFILE_MODES) {
      assert.match(PROFILE_MODE_COPY[mode].description, /not built yet/, mode);
    }
  });

  it('D4: only the topics the plan uses are offered until the learner agrees to see the rest', () => {
    const categories = [
      { id: 'dark_personality', domains: ['dark_triad_narcissism'] },
      { id: 'core_personality', domains: [{ id: 'big_five_openness' }] },
      { id: 'social_cultural', domains: ['political_ideology'] },
      { id: 'cognitive_learning', domains: ['learning_styles'] },
    ];
    assert.deepEqual(offeredDomainIds(categories, false), ['learning_styles', 'big_five_openness']);
    assert.deepEqual(offeredDomainIds(categories, true), [
      'learning_styles',
      'big_five_openness',
      'political_ideology',
      'dark_triad_narcissism',
    ]);
    assert.equal(hasMoreTopicsConsent({ tags: ['focus:mathematics'] }), false);
    const tags = withMoreTopicsConsent(['focus:mathematics'], true);
    assert.equal(hasMoreTopicsConsent({ tags }), true);
    assert.deepEqual(withMoreTopicsConsent(tags, false), ['focus:mathematics']);
    assert.equal(hasMoreTopicsConsent(null), false);
  });

  it('labels the stored mode, ignoring unknown or "view"', () => {
    assert.equal(profileModeLabel('manual'), 'Set it myself');
    assert.equal(profileModeLabel('assessment'), 'Take quizzes');
    assert.equal(profileModeLabel('view'), null);
    assert.equal(profileModeLabel(undefined), null);
    assert.equal(profileModeLabel('constructor'), null);
    assert.equal(profileModeLabel('<script>'), null);
  });
});

describe('progress wording', () => {
  it('counts with the right plural and a friendly empty case', () => {
    assert.equal(masteredLine({ mastered: 3, total: 12 }), '3 of 12 concepts mastered');
    assert.equal(masteredLine({ mastered: 0, total: 1 }), '0 of 1 concept mastered');
    assert.equal(masteredLine({ mastered: 0, total: 0 }), 'No concepts in your subjects yet');
  });
});

describe('next step', () => {
  const p = (mastered: number, learning: number, notStarted: number) => ({
    total: mastered + learning + notStarted,
    mastered,
    learning,
    notStarted,
  });

  it('reviews come first', () => {
    assert.equal(profileNextStep(p(2, 1, 3), 4).label, 'Do your 4 reviews');
    assert.equal(profileNextStep(p(2, 1, 3), 1).label, 'Do your 1 review');
  });

  it('then continue, start, or celebrate', () => {
    assert.equal(profileNextStep(p(2, 1, 3), 0).label, 'Keep learning');
    assert.equal(profileNextStep(p(0, 0, 5), 0).label, 'Start learning');
    assert.match(profileNextStep(p(5, 0, 0), 0).hint, /mastered everything/);
    assert.match(profileNextStep(p(0, 0, 0), 0).hint, /Choose subjects/);
  });

  it('ignores nonsense review counts', () => {
    assert.equal(profileNextStep(p(0, 1, 0), -3).label, 'Keep learning');
    assert.equal(profileNextStep(p(0, 1, 0), 2.7).label, 'Do your 2 reviews');
  });
});

describe('profile progress follows the chosen subjects', () => {
  it('counts only concepts in the focus subjects (same rule as Today)', () => {
    const concepts = [
      { conceptId: 'a', domain: 'mathematics' },
      { conceptId: 'b', domain: 'mathematics' },
      { conceptId: 'c', domain: 'computer-science' },
    ];
    const states = [
      { conceptId: 'a', mastery: 95 },
      { conceptId: 'c', mastery: 40 },
    ];
    const learner = { tags: withFocus(['class:7b'], ['mathematics']) };
    const progress = summarizeProgress(inFocus(concepts, focusDomains(learner), (c) => c.domain), states);
    assert.equal(masteredLine(progress), '1 of 2 concepts mastered');
    assert.equal(progress.notStarted, 1);
    assert.deepEqual(learner.tags.filter((t) => !t.startsWith('focus:')), ['class:7b']);
  });
});

describe('profile page', () => {
  const page = fs.readFileSync('src/routes/profile.tsx', 'utf8');
  it('leads with My Profile and the learning overview, not psychometric jargon', () => {
    assert.match(page, />\s*My Profile\s*</);
    assert.match(page, /<LearningOverview /);
    assert.doesNotMatch(page, /Psychometric Profile|Profile Configuration Mode|Select ONE|Lock This Mode/);
    assert.ok(page.indexOf('<LearningOverview ') < page.indexOf('How do you want to fill it in?'));
  });

  it('no longer seeds demo learners from the profile page', () => {
    assert.doesNotMatch(page, /demoLearners|Create Sample Users/);
  });
});
