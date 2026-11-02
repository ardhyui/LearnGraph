/**
 * "Take quizzes" on My Profile: learner wording (no research markers or
 * instrument citations), named answer buttons, and quiz results that are
 * actually saved and recognised after a reload.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  answerButtonName,
  answerLabel,
  completedQuizTopics,
  isQuizResult,
  quizLengthLine,
  savedQuizzesLine,
  scoreSourceLabel,
} from '../src/lib/quiz.ts';
import { ALL_ASSESSMENTS } from '../src/lib/assessments.ts';

describe('quizLengthLine', () => {
  it('gives question count and a rough time', () => {
    assert.equal(quizLengthLine(1), '1 question · under a minute');
    assert.equal(quizLengthLine(2), '2 questions · under a minute');
    assert.equal(quizLengthLine(10), '10 questions · about 2 min');
    assert.equal(quizLengthLine(20), '20 questions · about 4 min');
  });
  it('never shows negative or fractional counts', () => {
    assert.equal(quizLengthLine(-3), '0 questions · under a minute');
    assert.equal(quizLengthLine(2.7), '2 questions · under a minute');
  });
});

describe('answerLabel / answerButtonName', () => {
  const five = { min: 1, max: 5, labels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'] };
  it('names every value of a fully labelled scale', () => {
    assert.equal(answerLabel(five, 1), 'Strongly Disagree');
    assert.equal(answerLabel(five, 3), 'Neutral');
    assert.equal(answerButtonName(five, 5), '5 — Strongly Agree');
  });
  it('only labels the ends when a scale has end labels only', () => {
    const ends = { min: 0, max: 10, labels: ['Not at all', 'Completely'] };
    assert.equal(answerLabel(ends, 0), 'Not at all');
    assert.equal(answerLabel(ends, 10), 'Completely');
    assert.equal(answerLabel(ends, 5), '');
    assert.equal(answerButtonName(ends, 5), '5');
  });
  it('returns nothing for values outside the scale', () => {
    assert.equal(answerLabel(five, 0), '');
    assert.equal(answerLabel(five, 6), '');
    assert.equal(answerLabel(five, 2.5), '');
  });
  it('every answer button in every quiz has a name', () => {
    let checked = 0;
    for (const data of Object.values(ALL_ASSESSMENTS)) {
      for (const quiz of [data.quick, data.full]) {
        for (let v = quiz.scale.min; v <= quiz.scale.max; v++) {
          assert.match(answerButtonName(quiz.scale, v), new RegExp(`^${v}( — .+)?$`));
          checked++;
        }
      }
    }
    assert.ok(checked > 100, `checked ${checked}`);
  });
});

describe('scoreSourceLabel', () => {
  it('uses everyday words for known sources', () => {
    assert.equal(scoreSourceLabel('assessment_quick'), 'From a quick quiz');
    assert.equal(scoreSourceLabel('assessment_full'), 'From a full quiz');
    assert.equal(scoreSourceLabel('manual_entry'), 'Set by you');
    assert.equal(scoreSourceLabel('surprise_me'), 'Random starting value');
  });
  it('hides unknown or missing sources instead of showing raw ids', () => {
    assert.equal(scoreSourceLabel('some_internal_tag'), null);
    assert.equal(scoreSourceLabel('__proto__'), null);
    assert.equal(scoreSourceLabel(''), null);
    assert.equal(scoreSourceLabel(undefined), null);
  });
});

describe('completedQuizTopics', () => {
  it('counts only values that came from a quiz', () => {
    const done = completedQuizTopics({
      learning_styles: { source: 'assessment_quick' },
      growth_mindset: { source: 'assessment_full' },
      big_five_openness: { source: 'manual_entry' },
      creativity: {},
    });
    assert.deepEqual([...done].sort(), ['growth_mindset', 'learning_styles']);
    assert.equal(isQuizResult(null), false);
    assert.equal(completedQuizTopics({}).size, 0);
  });
});

describe('savedQuizzesLine', () => {
  it('reads naturally', () => {
    assert.equal(savedQuizzesLine(1), 'Saved 1 quiz result.');
    assert.equal(savedQuizzesLine(3), 'Saved 3 quiz results.');
    assert.match(savedQuizzesLine(0), /Answer every question/);
  });
});

describe('My Profile quiz page', () => {
  const src = fs.readFileSync(new URL('../src/routes/profile.tsx', import.meta.url), 'utf8');
  it('shows no research markers, instrument citations or shouting jargon', () => {
    assert.doesNotMatch(src, /\(R\)<\/span>/);
    assert.doesNotMatch(src, /Source: \{/);
    assert.doesNotMatch(src, /\.source\.split\(/);
    assert.doesNotMatch(src, /TRAIT SCORE|DATA QUALITY|Submit Assessment|Response Scale/);
    assert.doesNotMatch(src, /\/ 39 completed/);
  });
  it('saves quiz results (not just keeps them in the page)', () => {
    const submit = src.slice(src.indexOf('const submitAssessment'), src.indexOf('// Batch mode functions'));
    assert.match(submit, /await persistScores\(/);
    const batch = src.slice(src.indexOf('const submitBatchAssessments'), src.indexOf('const getScoreColor'));
    assert.match(batch, /await persistScores\(/);
  });
  it('the quiz is a labelled dialog with named, pressable answers', () => {
    assert.match(src, /role="dialog"/);
    assert.match(src, /aria-modal="true"/);
    assert.match(src, /aria-labelledby=\{quizTitleId\}/);
    assert.match(src, /aria-pressed=\{assessmentAnswers\[q\.id\] === val\}/);
    assert.match(src, /aria-label=\{answerButtonName\(/);
  });
});
