/**
 * Direct unit tests for the demo quiz bank `src/lib/evidence/demo-questions.ts`.
 *
 * `DEMO_QUESTIONS` is what `seedDemoQuestions` copies into a new workspace
 * (`src/lib/evidence/service.ts`), but only a handful of assertions inside
 * `tests/learning-evidence.test.ts` covered it. This file imports the bank
 * directly (node:test, no PGlite or DOM) and locks its exact shape: 44 ids,
 * the eleven concepts in `demoConcepts` order, four questions per concept, the
 * editor validator pass, the option rules, and the source wiring. The module
 * itself is not changed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_QUESTIONS } from '../src/lib/evidence/demo-questions.ts';
import { demoConcepts } from '../src/lib/demo-data.ts';
import { questionInput, type QuizQuestion } from '../src/lib/evidence/quiz.ts';

const DEMO_QUESTIONS_FILE = join(
  import.meta.dirname,
  '..',
  'src',
  'lib',
  'evidence',
  'demo-questions.ts',
);
const SERVICE_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'service.ts');
const LEARNING_EVIDENCE_FILE = join(
  import.meta.dirname,
  '..',
  'tests',
  'learning-evidence.test.ts',
);
const LEARN_IN_APP_FILE = join(import.meta.dirname, '..', 'tests', 'learn-in-app.test.ts');
const SRC_DIR = join(import.meta.dirname, '..', 'src');

// Explicit copies: reordering, renaming or dropping a question must show up in the diff.
const CONCEPT_IDS = [
  'arithmetic',
  'fractions',
  'decimals',
  'pre-algebra',
  'linear-equations',
  'quadratic-equations',
  'programming-basics',
  'control-flow',
  'functions',
  'data-structures',
  'algorithms',
] as const;

const EXPECTED_IDS = CONCEPT_IDS.flatMap((conceptId) =>
  [1, 2, 3, 4].map((n) => `demo-${conceptId}-${n}`),
);

const questionsOf = (conceptId: string): QuizQuestion[] =>
  DEMO_QUESTIONS.filter((q) => q.conceptId === conceptId);

describe('demo quiz bank', () => {
  it('ships exactly 44 questions with the exact ids, in concept order and all unique', () => {
    assert.equal(DEMO_QUESTIONS.length, 44);
    assert.deepEqual(
      DEMO_QUESTIONS.map((q) => q.id),
      EXPECTED_IDS,
    );
    assert.equal(new Set(DEMO_QUESTIONS.map((q) => q.id)).size, 44);
    for (const q of DEMO_QUESTIONS) {
      assert.match(q.id, /^[A-Za-z0-9_-]{1,64}$/, q.id);
    }
    // The concepts are exactly the eleven demo concepts, nothing else.
    const demoIds = demoConcepts.map((c) => c.id.replace('concept:', ''));
    assert.deepEqual(demoIds, [...CONCEPT_IDS]);
    const known = new Set<string>(demoIds);
    for (const q of DEMO_QUESTIONS) assert.ok(known.has(q.conceptId), q.conceptId);
  });

  it('gives every concept four questions numbered 1..4, each with its own prompt', () => {
    // Group order = the BANK key order = the demoConcepts order.
    assert.deepEqual([...new Set(DEMO_QUESTIONS.map((q) => q.conceptId))], [...CONCEPT_IDS]);
    for (const conceptId of CONCEPT_IDS) {
      const questions = questionsOf(conceptId);
      assert.equal(questions.length, 4, conceptId);
      assert.deepEqual(
        questions.map((q) => q.id),
        [1, 2, 3, 4].map((n) => `demo-${conceptId}-${n}`),
        conceptId,
      );
      // Four distinct prompts, so a retake asks something new instead of repeating.
      assert.equal(new Set(questions.map((q) => q.prompt)).size, 4, conceptId);
    }
  });

  it('passes every question through the editor validator with its id and text unchanged', () => {
    for (const q of DEMO_QUESTIONS) {
      const parsed = questionInput.safeParse(q);
      assert.equal(parsed.success, true, q.id);
      if (!parsed.success) continue;
      assert.equal(parsed.data.id, q.id, q.id);
      assert.equal(parsed.data.conceptId, q.conceptId, q.id);
    }
    // Filled as written: the validator would silently trim, so the bank must not need it.
    for (const q of DEMO_QUESTIONS) {
      assert.ok(q.prompt.length > 0 && q.prompt.length <= 500, `${q.id} prompt`);
      assert.ok(q.answer.length > 0 && q.answer.length <= 200, `${q.id} answer`);
      assert.ok(q.explanation.length > 0 && q.explanation.length <= 1000, `${q.id} explanation`);
      assert.equal(q.prompt, q.prompt.trim(), `${q.id} prompt has stray whitespace`);
      assert.equal(q.answer, q.answer.trim(), `${q.id} answer has stray whitespace`);
      assert.equal(q.explanation, q.explanation.trim(), `${q.id} explanation has stray whitespace`);
    }
  });

  it('offers 3 or 4 distinct options with the answer exactly once', () => {
    for (const q of DEMO_QUESTIONS) {
      assert.ok(q.options.length >= 3 && q.options.length <= 4, `${q.id}: ${q.options.length}`);
      assert.equal(new Set(q.options).size, q.options.length, `${q.id} repeats an option`);
      for (const option of q.options) {
        assert.ok(option.length >= 1 && option.length <= 200, `${q.id} option ${option}`);
      }
      assert.equal(
        q.options.filter((option) => option === q.answer).length,
        1,
        `${q.id} answer appears once`,
      );
    }
    // Four is the norm; the one comparison question is the only three-option example.
    const threeOptions = DEMO_QUESTIONS.filter((q) => q.options.length === 3);
    assert.equal(threeOptions.length, 1);
    assert.equal(threeOptions[0].id, 'demo-fractions-4');
    assert.equal(threeOptions[0].prompt, 'Which is larger, 3/8 or 1/2?');
    assert.deepEqual(threeOptions[0].options, ['3/8', '1/2', 'They are equal']);
    assert.equal(threeOptions[0].answer, '1/2');
  });
});

describe('source guards', () => {
  it('keeps demo-questions.ts type-only toward quiz.ts', () => {
    const source = readFileSync(DEMO_QUESTIONS_FILE, 'utf8');
    assert.ok(
      source.includes("import type { QuizQuestion } from './quiz.ts'"),
      'the bank types its questions through quiz.ts',
    );
    // No runtime import: the bank stays plain data with no behaviour of its own.
    assert.ok(!/^import\s+(?!type\b)/m.test(source), 'demo-questions.ts has a runtime import');
    assert.equal((source.match(/^import\b/gm) ?? []).length, 1, 'a single type import');
  });

  it('keeps service.ts the only consumer of the bank inside src/', () => {
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' }).filter(
      (f) =>
        (f.endsWith('.ts') || f.endsWith('.tsx')) &&
        f !== join('lib', 'evidence', 'demo-questions.ts') &&
        f !== join('lib', 'evidence', 'service.ts'),
    );
    assert.ok(files.length > 50, `expected to scan the whole src/ tree, found ${files.length}`);
    for (const file of files) {
      const source = readFileSync(join(SRC_DIR, file), 'utf8');
      assert.ok(!source.includes('demo-questions'), `${file} imports the demo bank`);
      assert.ok(!source.includes('DEMO_QUESTIONS'), `${file} copies the demo bank`);
    }
    const service = readFileSync(SERVICE_FILE, 'utf8');
    assert.ok(
      service.includes("import { DEMO_QUESTIONS } from './demo-questions.ts'"),
      'service.ts imports the bank',
    );
    assert.ok(
      service.includes('DEMO_QUESTIONS.filter((q) => q.conceptId === conceptId)'),
      'seedDemoQuestions filters the bank per concept',
    );
  });

  it('keeps the original assertions in the lessons and evidence suites', () => {
    const evidence = readFileSync(LEARNING_EVIDENCE_FILE, 'utf8');
    for (const anchor of [
      'ships at least 3 valid questions for each of the 11 example concepts',
      'assert.ok(qs.length >= 3,',
      'assert.equal(new Set(DEMO_QUESTIONS.map((q) => q.id)).size, DEMO_QUESTIONS.length);',
    ]) {
      assert.ok(evidence.includes(anchor), anchor);
    }
    // The lesson-seeding suite next to it is untouched too.
    const learnInApp = readFileSync(LEARN_IN_APP_FILE, 'utf8');
    assert.ok(
      learnInApp.includes('seeds the example lessons once, per workspace'),
      'the lesson seeding test is missing',
    );
  });
});
