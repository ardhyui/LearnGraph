/**
 * Direct unit tests for the generic quiz helpers in `src/lib/evidence/quiz.ts`:
 * `shuffled`, `pickQuestions`, `gradeQuiz` and `questionInput`.
 *
 * These helpers were only covered indirectly by a handful of broad assertions in
 * `tests/learning-evidence.test.ts`. This file imports the module directly
 * (node:test, no PGlite or DOM) and pins the exact behaviour: the Fisher–Yates
 * draw order, the "new questions first" ordering, the grading rules and error,
 * the editor validator's trimming and bounds, and the source wiring that keeps
 * one copy of each helper. The module itself is not changed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_OPTIONS,
  MAX_QUESTIONS_PER_CONCEPT,
  MIN_OPTIONS,
  QUIZ_LENGTH,
  QuizAnswerError,
  gradeQuiz,
  pickQuestions,
  questionInput,
  shuffled,
} from '../src/lib/evidence/quiz.ts';

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const QUIZ_FILE = join(SRC_DIR, 'lib', 'evidence', 'quiz.ts');
const SERVICE_FILE = join(SRC_DIR, 'lib', 'evidence', 'service.ts');
const EVIDENCE_FUNCTIONS_FILE = join(SRC_DIR, 'server', 'evidence.functions.ts');
const JAPANESE_FUNCTIONS_FILE = join(SRC_DIR, 'server', 'japanese.functions.ts');
const ADMIN_QUESTIONS_FILE = join(SRC_DIR, 'routes', 'admin', 'questions.tsx');
const LEARNING_EVIDENCE_TEST_FILE = join(import.meta.dirname, 'learning-evidence.test.ts');
const DEMO_QUESTIONS_TEST_FILE = join(import.meta.dirname, 'demo-questions.test.ts');

const readSource = (path: string) => readFileSync(path, 'utf8');

/** A `randomInt` that always draws 0 and records every requested bound. */
function recordingZero(): { calls: number[]; randomInt: (n: number) => number } {
  const calls: number[] = [];
  return {
    calls,
    randomInt: (n) => {
      calls.push(n);
      return 0;
    },
  };
}

/** Names imported from `from` in `src`, with a leading `type` keyword stripped. */
function importedNames(src: string, from: string): string[] {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${escaped}'`).exec(src);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/, ''))
    .filter(Boolean);
}

const questions = [
  { id: 'q1', options: ['A', 'B'], answer: 'A' },
  { id: 'q2', options: ['x', 'y'], answer: 'y' },
];

describe('quiz constants', () => {
  it('locks the quiz length, option bounds and bank cap', () => {
    assert.equal(QUIZ_LENGTH, 3);
    assert.equal(MIN_OPTIONS, 2);
    assert.equal(MAX_OPTIONS, 6);
    assert.equal(MAX_QUESTIONS_PER_CONCEPT, 50);
  });
});

describe('shuffled', () => {
  it('draws randomInt downwards, one swap per position from the end', () => {
    const four = recordingZero();
    shuffled([1, 2, 3, 4], four.randomInt);
    assert.deepEqual(four.calls, [4, 3, 2]);

    const two = recordingZero();
    shuffled([1, 2], two.randomInt);
    assert.deepEqual(two.calls, [2]);

    const six = recordingZero();
    shuffled([1, 2, 3, 4, 5, 6], six.randomInt);
    assert.deepEqual(six.calls, [6, 5, 4, 3, 2]);
  });

  it('moves items exactly as the recorded swaps say', () => {
    // i = 3 -> j = 0, i = 2 -> j = 0, i = 1 -> j = 0.
    assert.deepEqual(
      shuffled([1, 2, 3, 4], () => 0),
      [2, 3, 4, 1],
    );
    // Always swapping an item with itself leaves the order alone.
    assert.deepEqual(
      shuffled([1, 2, 3, 4], (n) => n - 1),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      shuffled(['a', 'b', 'c'], () => 0),
      ['b', 'c', 'a'],
    );
  });

  it('returns a copy, never mutates the input and skips the draw for 0/1 items', () => {
    const input = [1, 2, 3];
    const out = shuffled(input, () => 0);
    assert.notEqual(out, input);
    assert.deepEqual(input, [1, 2, 3]);
    assert.deepEqual([...out].sort(), [1, 2, 3]);

    const empty = recordingZero();
    assert.deepEqual(shuffled([], empty.randomInt), []);
    assert.deepEqual(empty.calls, []);

    const single = recordingZero();
    assert.deepEqual(shuffled([9], single.randomInt), [9]);
    assert.deepEqual(single.calls, []);
  });
});

describe('pickQuestions', () => {
  const pool = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

  it('shuffles first, then moves ids already seen to the back', () => {
    // Zero draws rotate [a,b,c,d] to [b,c,d,a]; the stable sort pushes a to the end.
    const zero = recordingZero();
    assert.deepEqual(
      pickQuestions(pool, ['a', 'b', 'c'], 3, zero.randomInt).map((q) => q.id),
      ['d', 'b', 'c'],
    );
    assert.deepEqual(zero.calls, [4, 3, 2]);

    // Without the shuffle, the stable sort keeps the shuffled order of the kept ids.
    assert.deepEqual(
      pickQuestions(pool, ['a', 'b', 'c'], 3, (n) => n - 1).map((q) => q.id),
      ['d', 'a', 'b'],
    );
  });

  it('ignores previous ids outside the pool and never duplicates questions', () => {
    assert.deepEqual(
      pickQuestions(pool, ['x', 'y'], 4, () => 0).map((q) => q.id),
      ['b', 'c', 'd', 'a'],
    );

    const all = pickQuestions(pool, [], 99, () => 0).map((q) => q.id);
    assert.equal(all.length, pool.length);
    assert.equal(new Set(all).size, pool.length);

    const small = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(
      pickQuestions(small, [], 3, () => 0).map((q) => q.id),
      ['b', 'a'],
    );
  });

  it('still shuffles the whole pool when the count is zero or negative', () => {
    const zero = recordingZero();
    assert.deepEqual(pickQuestions(pool, ['a'], 0, zero.randomInt), []);
    assert.deepEqual(zero.calls, [4, 3, 2]);

    const negative = recordingZero();
    assert.deepEqual(pickQuestions(pool, [], -2, negative.randomInt), []);
    assert.deepEqual(negative.calls, [4, 3, 2]);
  });

  it('does not mutate the pool or the previous-id list', () => {
    const previous = ['a', 'b'];
    pickQuestions(pool, previous, 2, () => 0);
    assert.deepEqual(
      pool.map((q) => q.id),
      ['a', 'b', 'c', 'd'],
    );
    assert.deepEqual(previous, ['a', 'b']);
  });
});

describe('gradeQuiz', () => {
  it('grades in question order and counts exact matches', () => {
    const result = gradeQuiz(questions, { q2: 'x', q1: 'A' });
    assert.deepEqual(result, {
      correct: 1,
      total: 2,
      results: [
        { questionId: 'q1', picked: 'A', correct: true },
        { questionId: 'q2', picked: 'x', correct: false },
      ],
    });

    // Case matters: the answer key is compared as-is.
    assert.deepEqual(
      gradeQuiz([{ id: 'q1', options: ['A', 'a'], answer: 'A' }], { q1: 'a' }).results,
      [{ questionId: 'q1', picked: 'a', correct: false }],
    );
  });

  it('rejects a missing, undefined, non-string or foreign answer', () => {
    const attempts: Record<string, string>[] = [
      { q1: 'A' },
      { q1: 'A', q2: undefined as unknown as string },
      { q1: 'A', q2: 5 as unknown as string },
      { q1: 'A', q2: 'z' },
    ];
    for (const answers of attempts) {
      assert.throws(
        () => gradeQuiz(questions, answers),
        (error: unknown) => {
          assert.ok(error instanceof QuizAnswerError);
          assert.equal(error.name, 'QuizAnswerError');
          assert.equal(error.status, 400);
          assert.equal(error.message, 'Answer every question first.');
          return true;
        },
        JSON.stringify(answers),
      );
    }
  });

  it('reads own properties only and ignores keys for other questions', () => {
    const inherited = Object.create({ q1: 'A', q2: 'y' }) as Record<string, string>;
    assert.throws(() => gradeQuiz(questions, inherited), QuizAnswerError);

    assert.deepEqual(gradeQuiz(questions, { q1: 'A', q2: 'y', q3: 'z' }), {
      correct: 2,
      total: 2,
      results: [
        { questionId: 'q1', picked: 'A', correct: true },
        { questionId: 'q2', picked: 'y', correct: true },
      ],
    });
  });

  it('grades an empty quiz as zero and leaves its inputs alone', () => {
    assert.deepEqual(gradeQuiz([], {}), { correct: 0, total: 0, results: [] });

    const bank = [{ id: 'q1', options: ['A', 'B'], answer: 'A' }];
    const answers = { q1: 'A' };
    gradeQuiz(bank, answers);
    assert.deepEqual(bank, [{ id: 'q1', options: ['A', 'B'], answer: 'A' }]);
    assert.deepEqual(answers, { q1: 'A' });
  });
});

describe('questionInput', () => {
  const valid = {
    conceptId: 'fractions',
    prompt: 'What is 1/2 + 1/4?',
    options: ['1/4', '3/4', '1/2'],
    answer: '3/4',
  };

  it('trims the text fields and defaults the explanation to an empty string', () => {
    const parsed = questionInput.parse({
      conceptId: 'fractions',
      prompt: '  What is 1/2 + 1/4?  ',
      options: [' 1/4 ', '3/4', '1/2'],
      answer: ' 3/4 ',
    });
    assert.deepEqual(parsed, {
      conceptId: 'fractions',
      prompt: 'What is 1/2 + 1/4?',
      options: ['1/4', '3/4', '1/2'],
      answer: '3/4',
      explanation: '',
    });

    // Rough edge kept as-is: spaces-only explanation is an accepted empty string.
    assert.equal(questionInput.safeParse({ ...valid, explanation: '   ' }).success, true);
    assert.equal(questionInput.parse({ ...valid, explanation: '  why  ' }).explanation, 'why');
  });

  it('keeps prompt, options and answer inside their length limits', () => {
    assert.equal(questionInput.safeParse({ ...valid, prompt: 'p'.repeat(500) }).success, true);
    assert.equal(questionInput.safeParse({ ...valid, prompt: 'p'.repeat(501) }).success, false);

    const option200 = 'a'.repeat(200);
    assert.equal(
      questionInput.safeParse({ ...valid, options: [option200, 'b'], answer: option200 }).success,
      true,
    );
    const option201 = 'a'.repeat(201);
    assert.equal(
      questionInput.safeParse({ ...valid, options: [option201, 'b'], answer: option201 }).success,
      false,
    );

    assert.equal(
      questionInput.safeParse({
        ...valid,
        options: ['x', 'a'.repeat(200)],
        answer: 'a'.repeat(200),
      }).success,
      true,
    );
    assert.equal(
      questionInput.safeParse({
        ...valid,
        options: ['x', 'a'.repeat(201)],
        answer: 'a'.repeat(201),
      }).success,
      false,
    );
  });

  it('requires 2..6 distinct options after trimming, with the answer among them', () => {
    assert.equal(questionInput.safeParse({ ...valid, options: ['A'], answer: 'A' }).success, false);
    assert.equal(
      questionInput.safeParse({ ...valid, options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'A' })
        .success,
      true,
    );
    assert.equal(
      questionInput.safeParse({
        ...valid,
        options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        answer: 'A',
      }).success,
      false,
    );

    // Trimming happens before the uniqueness check, so the raw strings may differ.
    assert.equal(
      questionInput.safeParse({ ...valid, options: ['A', ' A '], answer: 'A' }).success,
      false,
    );
    assert.equal(
      questionInput.safeParse({ ...valid, options: ['A', ' B '], answer: ' B ' }).success,
      true,
    );
    assert.equal(
      questionInput.safeParse({ ...valid, options: ['A', 'B'], answer: 'C' }).success,
      false,
    );
    assert.equal(questionInput.safeParse({ ...valid, prompt: '   ' }).success, false);
  });

  it('validates conceptId like a storage key', () => {
    assert.equal(questionInput.safeParse({ ...valid, conceptId: 'c'.repeat(128) }).success, true);
    for (const conceptId of ['', 'c'.repeat(129), 'a:b', 'a\u0001b', ' c ']) {
      assert.equal(
        questionInput.safeParse({ ...valid, conceptId }).success,
        false,
        JSON.stringify(conceptId),
      );
    }
  });

  it('accepts an optional editor id matching the id pattern', () => {
    assert.equal(questionInput.safeParse(valid).success, true);
    assert.equal(questionInput.safeParse({ ...valid, id: 'q_1-a' }).success, true);
    assert.equal(questionInput.safeParse({ ...valid, id: 'a'.repeat(64) }).success, true);
    for (const id of ['a'.repeat(65), 'has space', '', 'x:y']) {
      assert.equal(questionInput.safeParse({ ...valid, id }).success, false, JSON.stringify(id));
    }
  });

  it('trims the explanation and caps it at 1000 characters', () => {
    assert.equal(
      questionInput.safeParse({ ...valid, explanation: 'e'.repeat(1000) }).success,
      true,
    );
    assert.equal(
      questionInput.safeParse({ ...valid, explanation: 'e'.repeat(1001) }).success,
      false,
    );
  });

  it('drops keys that are not part of a question', () => {
    const parsed = questionInput.parse({ ...valid, bogus: 'yes', another: 1 });
    assert.deepEqual(Object.keys(parsed), [
      'conceptId',
      'prompt',
      'options',
      'answer',
      'explanation',
    ]);
  });
});

describe('source wiring', () => {
  it('service.ts imports the shared helpers and defines none of its own', () => {
    const src = readSource(SERVICE_FILE);
    const names = importedNames(src, './quiz.ts');
    for (const name of [
      'gradeQuiz',
      'MAX_QUESTIONS_PER_CONCEPT',
      'pickQuestions',
      'QUIZ_LENGTH',
      'quizStatePatch',
      'reviewWasDue',
      'shuffled',
    ]) {
      assert.ok(names.includes(name), `service.ts imports ${name}`);
      assert.doesNotMatch(
        src,
        new RegExp(`(?:function|const|class)\\s+${name}\\b`),
        `service.ts defines its own ${name}`,
      );
    }
    assert.doesNotMatch(
      src,
      /export const (?:QUIZ_LENGTH|MIN_OPTIONS|MAX_OPTIONS|MAX_QUESTIONS_PER_CONCEPT)\b/,
    );
  });

  it('the server and admin entry points keep using the quiz module', () => {
    const evidence = readSource(EVIDENCE_FUNCTIONS_FILE);
    assert.deepEqual(importedNames(evidence, '@/lib/evidence/quiz'), ['questionInput']);

    const japanese = readSource(JAPANESE_FUNCTIONS_FILE);
    const japaneseNames = importedNames(japanese, '@/lib/evidence/quiz');
    assert.deepEqual(japaneseNames.sort(), ['pickQuestions', 'shuffled']);
    assert.match(japanese, /pickQuestions\(/);
    assert.match(japanese, /shuffled\(/);

    const admin = readSource(ADMIN_QUESTIONS_FILE);
    const adminNames = importedNames(admin, '@/lib/evidence/quiz');
    for (const name of ['MAX_OPTIONS', 'MIN_OPTIONS', 'QUIZ_LENGTH']) {
      assert.ok(adminNames.includes(name), `admin questions import ${name}`);
      assert.ok(admin.split(name).length - 1 > 1, `admin questions use ${name} outside the import`);
    }
  });

  it('keeps the older assertions for these helpers in place', () => {
    const evidence = readSource(LEARNING_EVIDENCE_TEST_FILE);
    for (const anchor of [
      'pickQuestions(',
      'shuffled(',
      'gradeQuiz(',
      'questionInput.safeParse',
      'quizStatePatch(',
      'draws questions not seen in the previous attempt first',
      'grades only complete answers that are among the options',
      'validates questions typed in the editor',
    ]) {
      assert.ok(evidence.includes(anchor), `learning-evidence.test.ts keeps ${anchor}`);
    }

    const demo = readSource(DEMO_QUESTIONS_TEST_FILE);
    assert.ok(demo.includes('questionInput.safeParse'));
    assert.ok(demo.includes("from '../src/lib/evidence/quiz.ts'"));
  });

  it('quiz.ts stays the single home of these helpers', () => {
    const src = readSource(QUIZ_FILE);
    const exports = [...src.matchAll(/export (?:function|const|class) (\w+)/g)].map((m) => m[1]);
    for (const name of ['QUIZ_LENGTH', 'MIN_OPTIONS', 'MAX_OPTIONS', 'MAX_QUESTIONS_PER_CONCEPT']) {
      assert.ok(exports.includes(name), `quiz.ts exports ${name}`);
    }
    for (const name of [
      'shuffled',
      'pickQuestions',
      'gradeQuiz',
      'quizStatePatch',
      'reviewWasDue',
    ]) {
      assert.ok(exports.includes(name), `quiz.ts exports ${name}`);
    }
    assert.ok(exports.includes('questionInput'));
  });
});
