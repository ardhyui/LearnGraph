/**
 * The learning-style profile on My Profile must actually reach the study
 * plan: traits saved under their canonical ids change pace, challenge and
 * "ways to learn it", old trait names keep working, and the page leads with
 * the categories the plan reads.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TRAIT_KEYS, traitScore } from '../src/lib/graph/trait-scores.ts';
import { PSYCHOMETRIC_DOMAINS } from '../src/lib/graph/psychometrics.ts';
import { ASSESSMENT_CATEGORIES } from '../src/lib/assessments.ts';
import {
  PROFILE_CATEGORY_COPY,
  filledInLine,
  profileCategoryCopy,
  splitProfileCategories,
} from '../src/lib/profile.ts';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import type { LearnerProfile } from '../src/lib/graph/types.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const s = (score: number) => ({ score, confidence: 0.7, lastUpdated: '2026-11-02T00:00:00.000Z' });

describe('traitScore', () => {
  it('reads the canonical id the profile page saves', () => {
    assert.equal(traitScore({ big_five_openness: s(80) }, 'openness'), 80);
    assert.equal(traitScore({ big_five_neuroticism: s(0) }, 'neuroticism'), 0);
  });

  it('falls back to older names, canonical wins', () => {
    assert.equal(traitScore({ openness_to_experience: s(20) }, 'openness'), 20);
    assert.equal(traitScore({ conscientiousness: s(75) }, 'conscientiousness'), 75);
    assert.equal(traitScore({ big_five_extraversion: s(90), extraversion: s(10) }, 'extraversion'), 90);
  });

  it('ignores bare numbers, out-of-range and junk', () => {
    // Old demo data stores 0–1 numbers, which are not 0–100 scores.
    assert.equal(traitScore({ openness: 0.85 }, 'openness'), undefined);
    assert.equal(traitScore({ big_five_openness: s(140) }, 'openness'), undefined);
    assert.equal(traitScore({ big_five_openness: { score: Number.NaN } }, 'openness'), undefined);
    assert.equal(traitScore({ big_five_openness: { score: '80' } }, 'openness'), undefined);
    assert.equal(traitScore(null, 'openness'), undefined);
    assert.equal(traitScore('x', 'openness'), undefined);
    assert.equal(traitScore({}, 'neuroticism'), undefined);
  });

  it('canonical ids match the psychometric domain list', () => {
    assert.equal(TRAIT_KEYS.openness[0], PSYCHOMETRIC_DOMAINS.BIG_FIVE_OPENNESS);
    assert.equal(TRAIT_KEYS.conscientiousness[0], PSYCHOMETRIC_DOMAINS.BIG_FIVE_CONSCIENTIOUSNESS);
    assert.equal(TRAIT_KEYS.extraversion[0], PSYCHOMETRIC_DOMAINS.BIG_FIVE_EXTRAVERSION);
    assert.equal(TRAIT_KEYS.agreeableness[0], PSYCHOMETRIC_DOMAINS.BIG_FIVE_AGREEABLENESS);
    assert.equal(TRAIT_KEYS.neuroticism[0], PSYCHOMETRIC_DOMAINS.BIG_FIVE_NEUROTICISM);
  });
});

describe('engine uses the profile saved on My Profile', () => {
  const dir = path.join(os.tmpdir(), `learngraph-traits-${process.pid}`);
  let db: EducationGraphDB;

  before(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    db = await openTestGraphDB(dir);
  });
  after(async () => {
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const profile = (scores: Record<string, unknown>): LearnerProfile =>
    ({ userId: 'x', createdAt: '', updatedAt: '', psychometricScores: scores }) as unknown as LearnerProfile;

  it('canonical traits change pace, challenge and strategies', () => {
    const base = db.adjustForPsychometrics(profile({}));
    assert.equal(base.paceRecommendation, 'normal');
    assert.equal(base.difficultyModifier, 0);

    const tuned = db.adjustForPsychometrics(
      profile({ big_five_conscientiousness: s(85), big_five_neuroticism: s(80), big_five_extraversion: s(90) }),
    );
    assert.equal(tuned.paceRecommendation, 'faster');
    assert.ok(tuned.difficultyModifier < 0, 'anxious learner gets gentler material');
    assert.ok(tuned.scaffoldingStrategies.some((st) => st.type === 'guided_practice'));
    assert.ok(tuned.scaffoldingStrategies.some((st) => st.type === 'peer_discussion'));

    const curious = db.adjustForPsychometrics(profile({ big_five_openness: s(85) }));
    assert.ok(curious.difficultyModifier > 0, 'curious learner gets more challenge');
    const cautious = db.adjustForPsychometrics(profile({ big_five_openness: s(20) }));
    assert.ok(cautious.scaffoldingStrategies.some((st) => st.type === 'analogy'));
  });

  it('profiles saved with old trait names keep working', () => {
    const legacy = db.adjustForPsychometrics(profile({ conscientiousness: s(20), openness_to_experience: s(85) }));
    assert.equal(legacy.paceRecommendation, 'slower');
    assert.ok(legacy.difficultyModifier > 0);
  });

  it('saving scores then deriving the style updates the stored learner', async () => {
    await db.setLearnerProfile('me-sam', { name: 'Sam' });
    await db.setLearnerProfile('me-sam', {
      psychometricScores: {
        learning_styles: s(85),
        big_five_openness: s(80),
        big_five_extraversion: s(20),
        executive_functions: s(20),
        cognitive_abilities: s(20),
      } as LearnerProfile['psychometricScores'],
    });
    const saved = await db.computeAndStoreDerivedProfiles('me-sam');
    assert.equal(saved.learningStyle?.primary, 'visual');
    assert.equal(saved.learningStyle?.socialPreference, 'solo');
    assert.equal(saved.cognitiveProfile?.workingMemoryCapacity, 'low');
    const again = await db.getLearnerProfile('me-sam');
    assert.equal(again?.name, 'Sam', 'other profile fields stay');
    const adj = db.adjustForPsychometrics(again!);
    const types = adj.scaffoldingStrategies.map((st) => st.type);
    assert.ok(types.includes('visual_aids') && types.includes('chunking'), types.join(','));
  });
});

describe('My Profile categories', () => {
  const pageSrc = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'routes', 'profile.tsx'), 'utf8');
  const pageIds = [...pageSrc.matchAll(/^ {4}id: '([a-z_]+)',\n {4}name:/gm)].map((m) => m[1]);

  it('every category on the page and in the questionnaires has everyday copy', () => {
    assert.ok(pageIds.length >= 8, `found ${pageIds.length}`);
    for (const id of [...pageIds, ...ASSESSMENT_CATEGORIES.map((c) => c.id)]) {
      assert.ok(Object.hasOwn(PROFILE_CATEGORY_COPY, id), id);
      const c = PROFILE_CATEGORY_COPY[id];
      assert.doesNotMatch(`${c.name} ${c.hint}`, /^[A-Z]\.|psychometric|Dark Personality|Big Five|NEO|MACH/i, id);
    }
  });

  it('leads with what the study plan reads, folds the rest', () => {
    const { main, more } = splitProfileCategories(ASSESSMENT_CATEGORIES);
    assert.deepEqual(main.map((c) => c.id), ['cognitive_learning', 'decision_motivation', 'core_personality']);
    assert.ok(more.some((c) => c.id === 'dark_personality'));
    assert.equal(main.length + more.length, ASSESSMENT_CATEGORIES.length);
    // Every trait the engine reads lives in a category shown up front.
    const upFront = new Set(main.flatMap((c) => c.domains));
    for (const id of [
      PSYCHOMETRIC_DOMAINS.BIG_FIVE_OPENNESS,
      PSYCHOMETRIC_DOMAINS.BIG_FIVE_CONSCIENTIOUSNESS,
      PSYCHOMETRIC_DOMAINS.BIG_FIVE_EXTRAVERSION,
      PSYCHOMETRIC_DOMAINS.BIG_FIVE_NEUROTICISM,
      PSYCHOMETRIC_DOMAINS.LEARNING_STYLES,
      PSYCHOMETRIC_DOMAINS.INFORMATION_PROCESSING,
      PSYCHOMETRIC_DOMAINS.COGNITIVE_ABILITIES,
      PSYCHOMETRIC_DOMAINS.EXECUTIVE_FUNCTIONS,
      PSYCHOMETRIC_DOMAINS.METACOGNITION,
      PSYCHOMETRIC_DOMAINS.SELF_EFFICACY,
    ]) {
      assert.ok(upFront.has(id), id);
    }
  });

  it('unknown ids fall back safely to "more", keeping input order', () => {
    const { main, more } = splitProfileCategories([{ id: 'zz' }, { id: 'constructor' }, { id: 'core_personality' }]);
    assert.deepEqual(main.map((c) => c.id), ['core_personality']);
    assert.deepEqual(more.map((c) => c.id), ['zz', 'constructor']);
    assert.equal(profileCategoryCopy('zz', 'Q. Something').name, 'Something');
    assert.equal(profileCategoryCopy('constructor').usedByPlan, false);
  });

  it('fill-in counts read plainly', () => {
    assert.equal(filledInLine(2, 6), '2 of 6 filled in');
    assert.equal(filledInLine(9, 6), '6 of 6 filled in');
    assert.equal(filledInLine(-1, 3), '0 of 3 filled in');
    assert.equal(filledInLine(0, 0), 'Nothing to fill in');
  });

  it('the page no longer shows instrument names or fades in from opacity 0 on load', () => {
    assert.doesNotMatch(pageSrc, /Assessment: \{domain\.assessmentInstrument\}/);
    assert.doesNotMatch(pageSrc, /containerVariants|domains configured/);
  });
});
