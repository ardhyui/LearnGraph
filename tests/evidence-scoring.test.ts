/**
 * Direct unit tests for the evidence scoring rules `src/lib/evidence/scoring.ts`.
 *
 * The module is pure and was only covered indirectly: four `evidenceMastery`
 * and three `nextQuizReview` assertions in `tests/japanese.test.ts` (through
 * the re-export `src/lib/japanese/evidence.ts`) plus one `evidenceMastery`
 * assertion in `tests/learning-evidence.test.ts`. This file imports it directly
 * (node:test, no PGlite or DOM) and locks the pass ratio, the accuracy floor, the
 * delayed-retrieval/distinct-question rules and the earned review interval. The
 * module is not changed here: the tests pin its current behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PASS_RATIO,
  evidenceMastery,
  nextQuizReview,
  passed,
  type Attempt,
} from '../src/lib/evidence/scoring.ts';

const SCORING_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'scoring.ts');
const JAPANESE_EVIDENCE_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'japanese', 'evidence.ts');
const QUIZ_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'quiz.ts');
const JAPANESE_SERVER_FILE = join(import.meta.dirname, '..', 'src', 'server', 'japanese.functions.ts');

const DAY_MS = 86_400_000;
const BASE = Date.parse('2026-11-03T00:00:00Z');

/** ISO timestamp `day` days after 2026-11-03T00:00:00Z, plus an offset. */
const at = (day: number, offsetMs = 0) => new Date(BASE + day * DAY_MS + offsetMs).toISOString();

/** A passing attempt (3/3) unless stated otherwise. */
const attempt = (day: number, ids: string[], correct = 3, total = 3, offsetMs = 0): Attempt => ({
  at: at(day, offsetMs),
  correct,
  total,
  ids,
});

const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim();

describe('passed', () => {
  it('needs 80% correct', () => {
    assert.equal(PASS_RATIO, 0.8);
    assert.equal(passed({ correct: 4, total: 5 }), true);
    assert.equal(passed({ correct: 8, total: 10 }), true);
    assert.equal(passed({ correct: 4, total: 4 }), true);
    assert.equal(passed({ correct: 3, total: 4 }), false);
    assert.equal(passed({ correct: 7, total: 10 }), false);
  });

  it('treats an empty quiz as a denominator of one', () => {
    // 0 / max(1, 0) === 0, never 0 / 0 === NaN.
    assert.equal(passed({ correct: 0, total: 0 }), false);
    assert.equal(passed({ correct: 1, total: 0 }), true);
  });

  it('passes when more answers are correct than the quiz asked', () => {
    assert.equal(passed({ correct: 5, total: 4 }), true);
  });
});

describe('evidenceMastery', () => {
  it('is zero without attempts, whatever the options', () => {
    assert.equal(evidenceMastery([]), 0);
    assert.equal(evidenceMastery([], { delayedRetrieval: false }), 0);
    assert.equal(evidenceMastery([], { distinctQuestions: 0 }), 0);
  });

  it('rounds 70% of the accuracy after a failed last attempt', () => {
    const failed = (correct: number) => [{ at: at(0), correct, total: 4, ids: [] }];
    assert.equal(evidenceMastery(failed(1)), 18); // 17.5 rounds up
    assert.equal(evidenceMastery(failed(2)), 35);
    assert.equal(evidenceMastery(failed(3)), 53); // 52.5 rounds up
    assert.equal(evidenceMastery(failed(0)), 0);
  });

  it('lets a failed last attempt win over an earlier pass', () => {
    const attempts = [
      attempt(0, ['a', 'b', 'c']),
      attempt(1, ['a', 'b', 'c']),
      { at: at(2), correct: 1, total: 4, ids: [] },
    ];
    assert.equal(evidenceMastery(attempts), 18);
  });

  it('finds the last attempt by timestamp, not by array order', () => {
    const lastFails = [attempt(1, ['a'], 2, 4), attempt(0, ['a', 'b', 'c', 'd'])];
    // Reading the array order instead of sorting would return the earlier pass (70).
    assert.equal(evidenceMastery(lastFails), 35);
    const lastPasses = [attempt(1, ['c', 'd']), attempt(0, ['a', 'b'])];
    assert.equal(evidenceMastery(lastPasses), 85);
  });

  it('needs a second pass a full day later, covering four distinct questions', () => {
    assert.equal(evidenceMastery([attempt(0, ['a', 'b', 'c'])]), 70);
    // Same-day repetition cannot establish retention, even with new questions.
    assert.equal(evidenceMastery([attempt(0, ['a', 'b', 'c']), attempt(0, ['d', 'e', 'f'], 3, 3, 3_600_000)]), 70);
    assert.equal(evidenceMastery([attempt(0, ['a', 'b']), attempt(1, ['c', 'd'])]), 85);
    // Two shared questions make five distinct across the pair.
    assert.equal(evidenceMastery([attempt(0, ['a', 'b', 'c']), attempt(1, ['c', 'd', 'e'])]), 85);
    // Three distinct questions are still below the default of four.
    assert.equal(evidenceMastery([attempt(0, ['a', 'b']), attempt(1, ['c'])]), 70);
  });

  it('measures the day boundary at exactly 86,400,000 ms', () => {
    assert.equal(evidenceMastery([attempt(0, ['a', 'b']), attempt(1, ['c', 'd'])]), 85);
    assert.equal(evidenceMastery([attempt(0, ['a', 'b']), attempt(1, ['c', 'd'], 3, 3, -1)]), 70);
  });

  it('accepts a single pass without the delayed-retrieval policy', () => {
    assert.equal(evidenceMastery([attempt(0, [])], { delayedRetrieval: false }), 85);
    assert.equal(evidenceMastery([attempt(0, ['a'])], { delayedRetrieval: false }), 85);
    for (let day = 0; day < 5; day++) {
      assert.equal(
        evidenceMastery([attempt(day, ['a']), attempt(day, ['b'])], { delayedRetrieval: false }),
        85,
      );
    }
  });

  it('still caps a failed attempt at 70% of its accuracy without delayed retrieval', () => {
    assert.equal(
      evidenceMastery([{ at: at(0), correct: 1, total: 4, ids: [] }], { delayedRetrieval: false }),
      18,
    );
    assert.equal(
      evidenceMastery([{ at: at(0), correct: 0, total: 0, ids: [] }], { delayedRetrieval: false }),
      0,
    );
  });

  it('takes the distinct-question count from the options', () => {
    const twoIds = [attempt(0, ['a']), attempt(1, ['b'])];
    assert.equal(evidenceMastery(twoIds), 70);
    assert.equal(evidenceMastery(twoIds, { distinctQuestions: 2 }), 85);
    assert.equal(evidenceMastery(twoIds, { distinctQuestions: 3 }), 70);
    // Zero accepts anything, but a second delayed pass is still required.
    assert.equal(evidenceMastery([attempt(0, []), attempt(1, [])], { distinctQuestions: 0 }), 85);
    assert.equal(evidenceMastery([attempt(0, [])], { distinctQuestions: 0 }), 70);
  });

  it('does not mutate the attempts it is given', () => {
    const attempts = [attempt(1, ['a', 'b']), attempt(0, ['a', 'b', 'c', 'd'])];
    const snapshot = structuredClone(attempts);
    evidenceMastery(attempts);
    assert.deepEqual(attempts, snapshot);
  });
});

describe('nextQuizReview', () => {
  it('has no review after no attempts', () => {
    assert.equal(nextQuizReview([]), null);
  });

  it('asks for a retry ten minutes after a failure', () => {
    assert.equal(
      nextQuizReview([{ at: at(0), correct: 1, total: 4, ids: [] }]),
      '2026-11-03T00:10:00.000Z',
    );
    // A failure after two passes still schedules the ten-minute retry.
    assert.equal(
      nextQuizReview([attempt(0, ['a']), attempt(1, ['a']), { at: at(2), correct: 0, total: 3, ids: [] }]),
      '2026-11-05T00:10:00.000Z',
    );
  });

  it('earns 1, 2, 4, 8, 16, then a 30-day cap for daily passes', () => {
    const expected = [
      '2026-11-04T00:00:00.000Z',
      '2026-11-06T00:00:00.000Z',
      '2026-11-09T00:00:00.000Z',
      '2026-11-14T00:00:00.000Z',
      '2026-11-23T00:00:00.000Z',
      '2026-12-08T00:00:00.000Z',
      '2026-12-09T00:00:00.000Z',
    ];
    for (let count = 1; count <= expected.length; count++) {
      const attempts = Array.from({ length: count }, (_, day) => attempt(day, ['a', 'b', 'c']));
      assert.equal(nextQuizReview(attempts), expected[count - 1], `${count} daily passes`);
    }
  });

  it('does not count same-day passes twice', () => {
    assert.equal(
      nextQuizReview([attempt(0, ['a']), attempt(0, ['a'], 3, 3, 3_600_000)]),
      '2026-11-04T01:00:00.000Z',
    );
  });

  it('counts by timestamp, not by array order', () => {
    assert.equal(
      nextQuizReview([attempt(1, ['a']), attempt(0, ['a'])]),
      '2026-11-06T00:00:00.000Z',
    );
  });

  it('resets the earned count on a failure', () => {
    const attempts = [
      attempt(0, ['a']),
      attempt(1, ['a']),
      attempt(2, ['a']),
      { at: at(3), correct: 0, total: 3, ids: [] },
      attempt(4, ['a']),
    ];
    // The single pass after the failure starts again at one earned day.
    assert.equal(nextQuizReview(attempts), '2026-11-08T00:00:00.000Z');
  });

  it('does not mutate the attempts it is given', () => {
    const attempts = [attempt(1, ['a']), attempt(0, ['a']), { at: at(2), correct: 2, total: 4, ids: [] }];
    const snapshot = structuredClone(attempts);
    nextQuizReview(attempts);
    assert.deepEqual(attempts, snapshot);
  });
});

describe('source guards', () => {
  it('keeps the Japanese module a bare re-export of the shared rules', () => {
    const source = readFileSync(JAPANESE_EVIDENCE_FILE, 'utf8');
    assert.equal(
      stripComments(source),
      "export { evidenceMastery, nextQuizReview, type Attempt } from '../evidence/scoring.ts';",
    );
  });

  it('keeps the scoring module free of runtime imports and exports only its rules', () => {
    const source = readFileSync(SCORING_FILE, 'utf8');
    assert.equal(source.match(/^\s*import\b/gm), null);
    const exports = [...source.matchAll(/^export (?:type|interface|const|function) (\w+)/gm)].map(
      (match) => match[1],
    );
    assert.deepEqual(exports, [
      'Attempt',
      'PASS_RATIO',
      'passed',
      'EvidenceOptions',
      'evidenceMastery',
      'nextQuizReview',
    ]);
  });

  it('keeps the generic quiz on the same rules instead of a copy', () => {
    const source = readFileSync(QUIZ_FILE, 'utf8');
    assert.match(source, /import \{ evidenceMastery, passed, type Attempt \} from '\.\/scoring\.ts';/);
    // The generic quizzes count a single pass as mastered but reuse the accuracy
    // floor: no local `passed`, no local pass ratio, no copied fraction.
    assert.match(source, /evidenceMastery\(sorted, \{ delayedRetrieval: false \}\)/);
    assert.doesNotMatch(source, /PASS_RATIO|function passed\(|Math\.max\(1, [^)]*total\)/);
  });

  it('keeps the Japanese page on the strict default policy', () => {
    const source = readFileSync(JAPANESE_SERVER_FILE, 'utf8');
    assert.match(source, /import \{ evidenceMastery, nextQuizReview, type Attempt \} from '@\/lib\/japanese\/evidence';/);
    assert.doesNotMatch(source, /delayedRetrieval/);
  });
});
