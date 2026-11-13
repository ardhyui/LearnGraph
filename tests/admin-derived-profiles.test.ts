/**
 * The admin psychometric editor must follow the same rule as My Profile: a
 * learning style only exists once all five key topics are filled in, while the
 * cognitive profile is always refreshed. A partial profile must not overwrite
 * a learning style that was set by hand.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  PSYCHOMETRIC_DOMAINS,
  deriveLearningStyle,
  derivedProfilesFromScores,
  estimateCognitiveProfile,
} from '../src/lib/graph/psychometrics.ts';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import type { LearnerProfile } from '../src/lib/graph/types.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const s = (score: number, source = 'admin-ui') => ({
  score,
  confidence: 0.8,
  source,
  lastUpdated: '2026-11-13T00:00:00.000Z',
});

const KEY_SCORES = {
  learning_styles: s(85),
  big_five_openness: s(80),
  big_five_extraversion: s(20),
  big_five_conscientiousness: s(20),
  big_five_neuroticism: s(20),
};

describe('derivedProfilesFromScores', () => {
  it('does not invent a learning style from empty scores', () => {
    const derived = derivedProfilesFromScores({});
    assert.equal(derived.learningStyle, undefined);
    assert.deepEqual(derived.cognitiveProfile, {
      workingMemoryCapacity: 'medium',
      attentionSpan: 'medium',
      processingSpeed: 'medium',
      abstractThinking: 'mixed',
    });
  });

  it('keeps the cognitive profile while the key topics are partial', () => {
    for (const partial of [
      { learning_styles: s(85) },
      { learning_styles: s(85), big_five_openness: s(80), big_five_neuroticism: { score: '80' } },
    ]) {
      const derived = derivedProfilesFromScores(partial as never);
      assert.equal(derived.learningStyle, undefined, JSON.stringify(partial));
      assert.ok(derived.cognitiveProfile, 'the cognitive profile is always estimated');
    }
  });

  it('does not count old demo values or broken numbers as answers', () => {
    for (const broken of [
      { ...KEY_SCORES, big_five_neuroticism: 0.8 },
      { ...KEY_SCORES, big_five_openness: { score: Number.NaN } },
      { ...KEY_SCORES, learning_styles: { score: 140 } },
    ]) {
      const derived = derivedProfilesFromScores(broken as never);
      assert.equal(derived.learningStyle, undefined, JSON.stringify(broken));
      assert.ok(derived.cognitiveProfile);
    }
  });

  it('derives the style once all five key topics are filled in', () => {
    const derived = derivedProfilesFromScores(KEY_SCORES);
    assert.deepEqual(derived.learningStyle, deriveLearningStyle(KEY_SCORES));
    assert.equal(derived.learningStyle?.primary, 'visual');
    assert.equal(derived.learningStyle?.socialPreference, 'solo');
    assert.deepEqual(derived.cognitiveProfile, estimateCognitiveProfile(KEY_SCORES));
    assert.equal(derived.cognitiveProfile.attentionSpan, 'short');
  });

  it('reads the same key topics the learning style derivation does', () => {
    assert.equal(PSYCHOMETRIC_DOMAINS.LEARNING_STYLES, 'learning_styles');
    for (const domain of Object.keys(KEY_SCORES)) {
      const without = Object.fromEntries(Object.entries(KEY_SCORES).filter(([key]) => key !== domain));
      assert.equal(derivedProfilesFromScores(without as never).learningStyle, undefined, domain);
    }
  });
});

describe('admin psychometrics save', () => {
  const dir = path.join(os.tmpdir(), `learngraph-admin-derived-${process.pid}`);
  let db: EducationGraphDB;

  before(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    db = await openTestGraphDB(dir);
  });
  after(async () => {
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const manualStyle = {
    primary: 'reading' as const,
    secondary: 'visual' as const,
    socialPreference: 'mixed' as const,
    pacePreference: 'structured' as const,
    feedbackPreference: 'delayed' as const,
  };

  /** The update object the admin page builds: no learningStyle key unless derived. */
  const adminUpdate = (
    scores: Record<string, ReturnType<typeof s>>,
  ): Partial<LearnerProfile> => {
    const { learningStyle, cognitiveProfile } = derivedProfilesFromScores(scores);
    return {
      psychometricScores: scores as LearnerProfile['psychometricScores'],
      cognitiveProfile,
      ...(learningStyle ? { learningStyle } : {}),
    };
  };

  it('keeps a manually set style when only some topics are filled in', async () => {
    await db.setLearnerProfile('me-admin-partial', {
      name: 'Partial',
      learningStyle: manualStyle,
    });
    await db.setLearnerProfile('me-admin-partial', adminUpdate({
      learning_styles: s(85),
      big_five_openness: s(80),
    }));

    const stored = await db.getLearnerProfile('me-admin-partial');
    assert.deepEqual(stored?.learningStyle, manualStyle);
    assert.equal(stored?.name, 'Partial', 'other fields stay');
    assert.ok(stored?.cognitiveProfile, 'the cognitive profile is saved');
  });

  it('replaces the style once all five key topics are filled in', async () => {
    await db.setLearnerProfile('me-admin-full', { learningStyle: manualStyle });
    await db.setLearnerProfile('me-admin-full', adminUpdate(KEY_SCORES));

    const stored = await db.getLearnerProfile('me-admin-full');
    assert.equal(stored?.learningStyle?.primary, 'visual');
    assert.equal(stored?.cognitiveProfile?.attentionSpan, 'short');
  });
});

describe('the admin page uses the shared helper', () => {
  const pageSrc = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'src', 'routes', 'admin', 'psychometrics.tsx'),
    'utf8',
  );

  it('goes through derivedProfilesFromScores instead of deriving by hand', () => {
    assert.match(pageSrc, /\bderivedProfilesFromScores\(/);
    assert.doesNotMatch(pageSrc, /\bderiveLearningStyle\s*\(/);
    assert.doesNotMatch(pageSrc, /\bestimateCognitiveProfile\s*\(/);
  });

  it('never sends a missing learning style to updateLearner', () => {
    const guarded = pageSrc.match(/\.\.\.\(learningStyle \? \{ learningStyle \} : \{\}\)/g) ?? [];
    assert.equal(guarded.length, 2, 'both save paths keep the stored style');
  });
});
