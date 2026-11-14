/**
 * Direct unit tests for the psychometric assessment registry and its scoring
 * (src/lib/assessments.ts). `tests/quiz.test.ts` only checks the wording of the
 * answer buttons, so until now nothing exercised `calculateScore`,
 * `interpretation`, the 39-domain registry or the category index. A silent
 * scoring regression would change the values saved to a learner's profile.
 *
 * The module is not changed by this file: it is plain data plus pure
 * functions, so Node can test it directly with no new dependency.
 *
 * Two quick quizzes describe their scale by naming only some positions
 * (narcissism: `1`/`7`, life satisfaction: `0`/`5`/`10`). Their label arrays
 * keep one slot per value with empty strings in the unnamed positions, which
 * `answerLabel()` in src/lib/quiz.ts already renders as a bare number. Those
 * two spot-labelled scales are listed below so the test fails if any other
 * quiz starts relying on empty labels.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_ASSESSMENTS,
  ASSESSMENT_CATEGORIES,
  getAssessment,
  getFullAssessments,
  getQuickAssessments,
  type Assessment,
} from '../src/lib/assessments.ts';

/** The 39 domains, in registry order (the order the profile page relies on). */
const DOMAIN_IDS = [
  // A. Core Personality
  'big_five_openness',
  'big_five_conscientiousness',
  'big_five_extraversion',
  'big_five_agreeableness',
  'big_five_neuroticism',
  // B. Dark Personality
  'dark_triad_narcissism',
  'dark_triad_machiavellianism',
  'dark_triad_psychopathy',
  // C. Emotional/Social
  'emotional_empathy',
  'emotional_intelligence',
  'attachment_style',
  'love_languages',
  'communication_style',
  // D. Decision/Motivation
  'risk_tolerance',
  'decision_style',
  'time_orientation',
  'achievement_motivation',
  'self_efficacy',
  'locus_of_control',
  'growth_mindset',
  // E. Values/Wellbeing
  'personal_values',
  'interests',
  'life_satisfaction',
  'stress_coping',
  'social_support',
  'authenticity',
  // F. Cognitive/Learning
  'cognitive_abilities',
  'creativity',
  'learning_styles',
  'information_processing',
  'metacognition',
  'executive_functions',
  // G. Social/Cultural
  'social_cognition',
  'political_ideology',
  'cultural_values',
  'moral_reasoning',
  'work_career_style',
  // H. Sensory/Aesthetic
  'sensory_processing',
  'aesthetic_preferences',
] as const;

/** Scales that only name some positions; the other slots are deliberately ''. */
const SPOT_LABELLED_LABEL_INDEXES: Readonly<Record<string, readonly number[]>> = {
  'dark_triad_narcissism:quick': [0, 6],
  'life_satisfaction:quick': [0, 5, 10],
};

type Counterpart = { quick: Assessment; full: Assessment };
const registry = Object.entries(ALL_ASSESSMENTS) as Array<[string, Counterpart]>;

type QuizCase = { key: string; domainId: string; type: 'quick' | 'full'; quiz: Assessment };
const quizzes: QuizCase[] = registry.flatMap(([domainId, data]) => [
  { key: `${domainId}:quick`, domainId, type: 'quick', quiz: data.quick },
  { key: `${domainId}:full`, domainId, type: 'full', quiz: data.full },
]);

/** One answer for every question, the same value each time. */
function answersFor(quiz: Assessment, value: number): Record<string, number> {
  return Object.fromEntries(quiz.questions.map((question) => [question.id, value]));
}

describe('assessment registry', () => {
  it('holds exactly the 39 domains, in registry order', () => {
    assert.equal(registry.length, 39);
    assert.deepEqual(
      registry.map(([domainId]) => domainId),
      [...DOMAIN_IDS],
    );
  });

  it('keys every domain to quizzes that declare the same domainId', () => {
    for (const [domainId, data] of registry) {
      assert.equal(data.quick.domainId, domainId, `${domainId} quick domainId`);
      assert.equal(data.full.domainId, domainId, `${domainId} full domainId`);
    }
  });

  it('lists 39 quick and 39 full assessments in the same order as the registry', () => {
    const quick = getQuickAssessments();
    const full = getFullAssessments();
    assert.equal(quick.length, 39);
    assert.equal(full.length, 39);
    for (let i = 0; i < registry.length; i++) {
      assert.equal(quick[i], registry[i][1].quick, `quick order at ${registry[i][0]}`);
      assert.equal(full[i], registry[i][1].full, `full order at ${registry[i][0]}`);
    }
  });

  it('finds a quiz by domain id and version, and nothing for unknown ids', () => {
    for (const [domainId, data] of registry) {
      assert.equal(getAssessment(domainId, 'quick'), data.quick);
      assert.equal(getAssessment(domainId, 'full'), data.full);
    }
    for (const unknown of ['unknown_domain', '', '__proto__', 'toString', 'constructor']) {
      assert.equal(getAssessment(unknown, 'quick'), undefined, `${unknown} quick`);
      assert.equal(getAssessment(unknown, 'full'), undefined, `${unknown} full`);
    }
  });
});

describe('quiz contents', () => {
  it('has 78 quizzes, each with at least one question', () => {
    assert.equal(quizzes.length, 78);
    for (const { key, quiz } of quizzes) {
      assert.ok(quiz.questions.length >= 1, `${key} has no questions`);
    }
  });

  it('uses unique, non-empty question ids and texts', () => {
    for (const { key, quiz } of quizzes) {
      const ids = quiz.questions.map((question) => question.id);
      assert.equal(new Set(ids).size, ids.length, `${key} repeats a question id`);
      for (const question of quiz.questions) {
        assert.ok(question.id.trim() !== '', `${key} has an empty question id`);
        assert.ok(question.text.trim() !== '', `${key} ${question.id} has an empty text`);
        if (question.subscale !== undefined) {
          assert.ok(question.subscale.trim() !== '', `${key} ${question.id} has an empty subscale`);
        }
      }
    }
  });

  it('names every quiz in learner-facing metadata', () => {
    for (const { key, quiz } of quizzes) {
      for (const field of ['name', 'shortName', 'description', 'source'] as const) {
        assert.ok(quiz[field].trim() !== '', `${key} has an empty ${field}`);
      }
    }
  });
});

describe('scales', () => {
  it('has integer bounds with min < max', () => {
    for (const { key, quiz } of quizzes) {
      const { min, max } = quiz.scale;
      assert.ok(Number.isInteger(min), `${key} min is not an integer`);
      assert.ok(Number.isInteger(max), `${key} max is not an integer`);
      assert.ok(min < max, `${key} has min >= max`);
    }
  });

  it('has one label per value, or exactly the two end labels', () => {
    for (const { key, quiz } of quizzes) {
      const count = quiz.scale.max - quiz.scale.min + 1;
      assert.ok(
        quiz.scale.labels.length === count || quiz.scale.labels.length === 2,
        `${key} has ${quiz.scale.labels.length} labels for ${count} values`,
      );
      assert.ok(quiz.scale.labels[0]?.trim(), `${key} has no first label`);
      const last = quiz.scale.labels[quiz.scale.labels.length - 1];
      assert.ok(last?.trim(), `${key} has no last label`);
    }
  });

  it('names every position except on the two spot-labelled scales', () => {
    for (const { key, quiz } of quizzes) {
      const named = quiz.scale.labels
        .map((label, index) => ({ label, index }))
        .filter(({ label }) => label.trim() !== '')
        .map(({ index }) => index);
      const expected = SPOT_LABELLED_LABEL_INDEXES[key];
      if (expected) {
        assert.deepEqual(named, [...expected], `${key} spot labels changed`);
      } else {
        assert.deepEqual(
          named,
          quiz.scale.labels.map((_, index) => index),
          `${key} has an unnamed scale position`,
        );
      }
    }
  });
});

describe('calculateScore', () => {
  it('always returns a whole percentage 0-100', () => {
    for (const { key, quiz } of quizzes) {
      const cases: Array<[string, Record<string, number>]> = [
        ['all min', answersFor(quiz, quiz.scale.min)],
        ['all max', answersFor(quiz, quiz.scale.max)],
        ['no answers', {}],
      ];
      for (const [label, answers] of cases) {
        const score = quiz.calculateScore(answers);
        assert.ok(Number.isInteger(score), `${key} ${label}: ${score} is not an integer`);
        assert.ok(score >= 0 && score <= 100, `${key} ${label}: ${score} is outside 0-100`);
      }
    }
  });

  it('never raises the score when a reverse-scored answer goes up', () => {
    let checkedItems = 0;
    for (const { key, quiz } of quizzes) {
      if (key === 'attachment_style:full') continue; // inverted on purpose, tested below
      const reverseScored = quiz.questions.filter((question) => question.reverseScored);
      const middle = Math.floor((quiz.scale.min + quiz.scale.max) / 2);
      for (const item of reverseScored) {
        checkedItems++;
        let previous = Number.POSITIVE_INFINITY;
        for (let value = quiz.scale.min; value <= quiz.scale.max; value++) {
          const answers = answersFor(quiz, middle);
          answers[item.id] = value;
          const score = quiz.calculateScore(answers);
          assert.ok(
            score <= previous,
            `${key} ${item.id}: answer ${value} raised the score from ${previous} to ${score}`,
          );
          previous = score;
        }
      }
    }
    assert.ok(checkedItems > 20, `checked only ${checkedItems} reverse-scored items`);
  });
});

describe('attachment_style full quiz', () => {
  const quiz = ALL_ASSESSMENTS.attachment_style.full;

  it('inverts the final score: all min = 83, all max = 17', () => {
    assert.equal(quiz.calculateScore(answersFor(quiz, quiz.scale.min)), 83);
    assert.equal(quiz.calculateScore(answersFor(quiz, quiz.scale.max)), 17);
  });

  /** Different anxiety and avoidance answers, like a real respondent. */
  function pattern(anxiety: number, avoidance: number): Record<string, number> {
    return Object.fromEntries(
      quiz.questions.map((question) => [question.id, question.subscale === 'anxiety' ? anxiety : avoidance]),
    );
  }

  it('reports one of the four attachment styles with both dimension scores', () => {
    const cases: Array<[number, number, string]> = [
      [2, 2, 'Secure'],
      [5, 2, 'Anxious-Preoccupied'],
      [2, 5, 'Dismissive-Avoidant'],
      [5, 5, 'Fearful-Avoidant'],
    ];
    for (const [anxiety, avoidance, style] of cases) {
      const answers = pattern(anxiety, avoidance);
      const text = quiz.interpretation(quiz.calculateScore(answers), answers);
      assert.match(
        text,
        new RegExp(`^${style} attachment \\(Anxiety=\\d+, Avoidance=\\d+\\)\\.`),
        `anxiety ${anxiety}, avoidance ${avoidance}`,
      );
    }
  });

  it('still falls back to the plain score wording when answers are missing', () => {
    assert.equal(quiz.interpretation(100), 'Secure');
    assert.equal(quiz.interpretation(50), 'Some insecurity');
    assert.equal(quiz.interpretation(0), 'Insecure');
  });
});

describe('subscale scores of exactly zero', () => {
  /** Answers named subscales with `values`, every other question at mid-scale. */
  function subscaleAnswers(
    quiz: Assessment,
    values: Record<string, number>,
  ): Record<string, number> {
    // The answer whose normalised subscale score is 50.
    const middle = Math.round((quiz.scale.min + quiz.scale.max) / 2);
    return Object.fromEntries(
      quiz.questions.map((question) => [
        question.id,
        question.subscale !== undefined && Object.hasOwn(values, question.subscale)
          ? values[question.subscale]
          : middle,
      ]),
    );
  }

  it('keeps a real zero for both attachment dimensions (all min = secure)', () => {
    const quiz = ALL_ASSESSMENTS.attachment_style.full;
    const answers = answersFor(quiz, quiz.scale.min);
    const text = quiz.interpretation(quiz.calculateScore(answers), answers);
    assert.equal(quiz.calculateScore(answers), 83);
    assert.ok(
      text.startsWith('Secure attachment (Anxiety=0, Avoidance=33).'),
      `unexpected text: ${text}`,
    );
  });

  it('keeps the real attachment dimension scores at the top of the scale', () => {
    const quiz = ALL_ASSESSMENTS.attachment_style.full;
    const answers = answersFor(quiz, quiz.scale.max);
    const text = quiz.interpretation(quiz.calculateScore(answers), answers);
    assert.equal(quiz.calculateScore(answers), 17);
    assert.ok(
      text.startsWith('Fearful-Avoidant attachment (Anxiety=100, Avoidance=67).'),
      `unexpected text: ${text}`,
    );
  });

  it('classifies information processing from a zero analytical score', () => {
    const quiz = ALL_ASSESSMENTS.information_processing.full;
    const answers = subscaleAnswers(quiz, { analytical: quiz.scale.min });
    const text = quiz.interpretation(quiz.calculateScore(answers), answers);
    assert.match(text, /^Processing Style: Holistic\/Global\./);
    assert.match(text, /Analytical\/Sequential=0/);
    assert.match(text, /Holistic\/Global=50/);
  });

  it('classifies metacognition from a zero knowledge score', () => {
    const quiz = ALL_ASSESSMENTS.metacognition.full;
    const answers = subscaleAnswers(quiz, { knowledge: quiz.scale.min });
    const text = quiz.interpretation(quiz.calculateScore(answers), answers);
    assert.match(text, /Metacognition: Regulation of Cognition\./);
    assert.match(text, /Knowledge of Cognition=0/);
    assert.match(text, /Regulation of Cognition=50/);
  });

  it('reads a zero care/fairness score as individualizing-free, not as 50', () => {
    const quiz = ALL_ASSESSMENTS.political_ideology.full;
    // This scale starts at 0; an answer of 1 is the first position, which the
    // module normalises to a subscale score of 0.
    const answers = subscaleAnswers(quiz, { care: 1, fairness: 1 });
    const text = quiz.interpretation(quiz.calculateScore(answers), answers);
    assert.match(text, /Care\/Harm=0 Fairness\/Cheating=0/);
    assert.match(text, /Loyalty\/Betrayal=50/);
    assert.match(text, /You emphasize binding foundations/);
  });

  it('reads zero power distance and uncertainty avoidance as low, not as 50', () => {
    const quiz = ALL_ASSESSMENTS.cultural_values.full;
    const answers = subscaleAnswers(quiz, {
      power_distance: quiz.scale.min,
      uncertainty: quiz.scale.min,
    });
    const text = quiz.interpretation(quiz.calculateScore(answers), answers);
    assert.match(text, /Power Distance=0/);
    assert.match(text, /Uncertainty Avoidance=0/);
    assert.match(text, /You prefer egalitarian relationships\./);
    assert.match(text, /You are comfortable with ambiguity\./);
  });

  it('still returns non-empty subscale text when no answers are supplied', () => {
    const quizzesWithSubscales = [
      ALL_ASSESSMENTS.attachment_style.full,
      ALL_ASSESSMENTS.information_processing.full,
      ALL_ASSESSMENTS.metacognition.full,
      ALL_ASSESSMENTS.political_ideology.full,
      ALL_ASSESSMENTS.cultural_values.full,
    ];
    for (const quiz of quizzesWithSubscales) {
      let text = '';
      assert.doesNotThrow(() => {
        text = quiz.interpretation(quiz.calculateScore({}), {});
      }, `${quiz.domainId} threw on empty answers`);
      assert.ok(text.trim() !== '', `${quiz.domainId} produced empty text`);
    }
  });
});

describe('interpretation', () => {
  it('returns readable text for 0, 50 and 100 without answers', () => {
    for (const { key, quiz } of quizzes) {
      for (const score of [0, 50, 100]) {
        let text = '';
        assert.doesNotThrow(() => {
          text = quiz.interpretation(score);
        }, `${key} interpretation(${score}) threw`);
        assert.ok(text.trim() !== '', `${key} interpretation(${score}) is empty`);
      }
    }
  });

  it('does not need the answers argument', () => {
    for (const { key, quiz } of quizzes) {
      let text = '';
      assert.doesNotThrow(() => {
        text = quiz.interpretation(50);
      }, `${key} interpretation(50) threw`);
      assert.ok(text.trim() !== '', `${key} interpretation(50) is empty`);
    }
  });
});

describe('assessment categories', () => {
  it('covers every domain exactly once', () => {
    const seen = new Set<string>();
    for (const category of ASSESSMENT_CATEGORIES) {
      for (const domainId of category.domains) {
        assert.ok(Object.hasOwn(ALL_ASSESSMENTS, domainId), `${category.id} lists unknown ${domainId}`);
        assert.ok(!seen.has(domainId), `${domainId} is listed in more than one category`);
        seen.add(domainId);
      }
    }
    assert.equal(seen.size, 39);
    for (const domainId of DOMAIN_IDS) {
      assert.ok(seen.has(domainId), `${domainId} is missing from the categories`);
    }
  });

  it('gives every category a non-empty id and name', () => {
    const ids = new Set<string>();
    for (const category of ASSESSMENT_CATEGORIES) {
      assert.ok(category.id.trim() !== '', 'category with an empty id');
      assert.ok(category.name.trim() !== '', `${category.id} has an empty name`);
      assert.ok(!ids.has(category.id), `duplicate category id ${category.id}`);
      ids.add(category.id);
    }
    assert.equal(ids.size, 8);
  });
});
