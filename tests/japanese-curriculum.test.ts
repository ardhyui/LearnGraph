/**
 * Direct unit tests for the Japanese learning datasets
 * `src/lib/japanese/curriculum.ts` and `src/lib/japanese/questions.ts`.
 *
 * Both modules are plain data with no runtime imports. The older
 * `tests/japanese.test.ts` only checks unique ids, prerequisite resolution,
 * acyclic prerequisites, six questions per quiz topic, `answer` being one of
 * the options and three options per question. This file imports the datasets
 * directly (node:test, no PGlite or DOM) and locks what was still unasserted:
 * the exact 40-module order, the level/mode mix, the eight quiz modules and
 * their Indonesian copy (D2), the per-mode resources, the 48-question bank with
 * its topic slugs, the trimmed text, the exact hardest questions, the
 * `answer === options[0]` quirk of the data as written, and the source wiring.
 * Neither module is changed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES, LEARNER, type Module } from '../src/lib/japanese/curriculum.ts';
import { QUESTIONS, type Question } from '../src/lib/japanese/questions.ts';

const CURRICULUM_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'japanese', 'curriculum.ts');
const QUESTIONS_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'japanese', 'questions.ts');
const JAPANESE_FUNCTIONS_FILE = join(
  import.meta.dirname,
  '..',
  'src',
  'server',
  'japanese.functions.ts',
);
const JAPANESE_TEST_FILE = join(import.meta.dirname, 'japanese.test.ts');
const SRC_DIR = join(import.meta.dirname, '..', 'src');

const IRODORI = 'https://www.irodori-online.jpf.go.jp/';
const MICHI_BASE = 'http://127.0.0.1:17831/bab/';

// Explicit copies: reordering, renaming or dropping a module must show in the diff.
const MODULE_IDS = [
  'jp-hiragana',
  'jp-katakana',
  'jp-particles',
  'jp-existence',
  'jp-verbs',
  'jp-adjectives',
  'jp-te',
  'jp-counters',
  'jp-questions',
  'jp-comparison',
  'jp-plain',
  'jp-reading',
  'jp-listening',
  'jp-speaking',
  'jp-writing',
  'jp-kanji-dasar',
  'jp-kanji-alam',
  'jp-kanji-ukuran',
  'jp-kanji-waktu',
  'jp-kanji-orang',
  'jp-kanji-sekolah',
  'jp-kanji-gerak',
  'jp-kanji-kota',
  'jp-kanji-angka',
  'jp-n4-grammar',
  'jp-n4-reading',
  'jp-n4-listening',
  'jp-n4-output',
  'jp-n3-grammar',
  'jp-n3-reading',
  'jp-n3-listening',
  'jp-n3-output',
  'jp-n2-grammar',
  'jp-n2-reading',
  'jp-n2-listening',
  'jp-n2-output',
  'jp-n1-grammar',
  'jp-n1-reading',
  'jp-n1-listening',
  'jp-n1-output',
];

// The eight quiz topics, locked as whole objects including the Indonesian copy (D2).
const QUIZ_MODULES: Module[] = [
  {
    id: 'jp-hiragana',
    name: 'Hiragana dan bunyi mora',
    level: 'N5',
    description: 'Baca kana acak; bedakan vokal panjang, っ, dan kombinasi kecil.',
    prereqs: [],
    resource: IRODORI,
    mode: 'quiz',
  },
  {
    id: 'jp-katakana',
    name: 'Katakana',
    level: 'N5',
    description: 'Baca kata serapan tanpa romaji.',
    prereqs: ['jp-hiragana'],
    resource: IRODORI,
    mode: 'quiz',
  },
  {
    id: 'jp-particles',
    name: 'Partikel dasar',
    level: 'N5',
    description: 'は・が・を・に・で・の dalam kalimat baru.',
    prereqs: ['jp-hiragana'],
    resource: IRODORI,
    mode: 'quiz',
  },
  {
    id: 'jp-existence',
    name: 'Keberadaan dan lokasi',
    level: 'N5',
    description: 'あります・います, lokasi benda dan orang.',
    prereqs: ['jp-particles'],
    resource: IRODORI,
    mode: 'quiz',
  },
  {
    id: 'jp-verbs',
    name: 'Verba sopan: waktu dan negatif',
    level: 'N5',
    description: 'ます・ません・ました・ませんでした serta bentuk kamus.',
    prereqs: ['jp-particles'],
    resource: IRODORI,
    mode: 'quiz',
  },
  {
    id: 'jp-adjectives',
    name: 'Adjektiva い dan な',
    level: 'N5',
    description: 'Predikat, bentuk negatif, lampau dan modifikasi nomina.',
    prereqs: ['jp-particles'],
    resource: IRODORI,
    mode: 'quiz',
  },
  {
    id: 'jp-te',
    name: 'Bentuk て dan penggunaannya',
    level: 'N5',
    description: 'Permintaan, kegiatan berlangsung, izin dan larangan.',
    prereqs: ['jp-verbs'],
    resource: IRODORI,
    mode: 'quiz',
  },
  {
    id: 'jp-counters',
    name: 'Angka, waktu dan counter',
    level: 'N5',
    description: 'Bacaan tanggal, jumlah benda dan jam.',
    prereqs: ['jp-hiragana'],
    resource: IRODORI,
    mode: 'quiz',
  },
];

// Question-id slug -> quiz module id (the `te` slug drops the `jp-` prefix pattern only in name).
const TOPIC_SLUGS = [
  ['hiragana', 'jp-hiragana'],
  ['katakana', 'jp-katakana'],
  ['particles', 'jp-particles'],
  ['existence', 'jp-existence'],
  ['verbs', 'jp-verbs'],
  ['adjectives', 'jp-adjectives'],
  ['te', 'jp-te'],
  ['counters', 'jp-counters'],
] as const;

const MICHI_SLUGS = [
  'dasar',
  'alam',
  'ukuran',
  'waktu',
  'orang',
  'sekolah',
  'gerak',
  'kota',
  'angka',
] as const;

const modulesWithMode = (mode: string): Module[] => MODULES.filter((m) => m.mode === mode);
const questionsOf = (topic: string): Question[] => QUESTIONS.filter((q) => q.topic === topic);

describe('japanese curriculum', () => {
  it('ships exactly 40 modules with the exact ids, in order and all unique', () => {
    assert.equal(MODULES.length, 40);
    assert.deepEqual(
      MODULES.map((m) => m.id),
      MODULE_IDS,
    );
    assert.equal(new Set(MODULES.map((m) => m.id)).size, 40);
    assert.equal(new Set(MODULES.map((m) => m.name)).size, 40, 'module names repeat');
  });

  it('mixes the levels and modes exactly as the study plan does', () => {
    const levels = MODULES.reduce<Record<string, number>>((counts, m) => {
      counts[m.level] = (counts[m.level] ?? 0) + 1;
      return counts;
    }, {});
    assert.deepEqual(levels, { N5: 24, N4: 4, N3: 4, N2: 4, N1: 4 });
    const modes = MODULES.reduce<Record<string, number>>((counts, m) => {
      counts[m.mode] = (counts[m.mode] ?? 0) + 1;
      return counts;
    }, {});
    assert.deepEqual(modes, { quiz: 8, external: 23, michi: 9 });
    assert.equal(LEARNER, 'japanese-ardhyui');
    for (const m of MODULES) {
      assert.ok(m.name.trim().length > 0, `${m.id} name`);
      assert.ok(m.level.trim().length > 0, `${m.id} level`);
      assert.ok(m.description.trim().length > 0, `${m.id} description`);
      assert.ok(m.resource.trim().length > 0, `${m.id} resource`);
      assert.equal(m.name, m.name.trim(), `${m.id} name has stray whitespace`);
      assert.equal(m.description, m.description.trim(), `${m.id} description has stray whitespace`);
    }
  });

  it('locks the eight quiz modules as whole objects', () => {
    assert.deepEqual(modulesWithMode('quiz'), QUIZ_MODULES);
    assert.deepEqual(
      modulesWithMode('quiz').map((m) => m.id),
      TOPIC_SLUGS.map(([, moduleId]) => moduleId),
    );
    // The quiz modules are the ones the page actually offers a quiz for.
    assert.deepEqual(
      MODULES.filter((m) => m.mode === 'quiz').map((m) => m.level),
      Array(8).fill('N5'),
    );
  });

  it('points every mode at its own resource family', () => {
    assert.deepEqual([...new Set(modulesWithMode('quiz').map((m) => m.resource))], [IRODORI]);
    const external = modulesWithMode('external');
    assert.equal(external.length, 23);
    for (const m of external) assert.ok(m.resource.startsWith('https://'), `${m.id} is not https`);
    assert.deepEqual([...new Set(external.map((m) => m.resource))].sort(), [
      'https://marugoto.jpf.go.jp/en/e-learning/',
      'https://samplequestions.jlpt.jp/e/samples/sample09.html',
      'https://tadoku.org/japanese/en/free-books-en/',
      'https://www.aozora.gr.jp/',
      'https://www.irodori-online.jpf.go.jp/',
    ]);
    assert.deepEqual(
      modulesWithMode('michi').map((m) => m.resource),
      MICHI_SLUGS.map((slug) => `${MICHI_BASE}${slug}`),
    );
  });
});

describe('japanese question bank', () => {
  it('ships exactly 48 questions across the eight quiz topics', () => {
    assert.equal(QUESTIONS.length, 48);
    const topics = [...new Set(QUESTIONS.map((q) => q.topic))];
    assert.deepEqual(
      topics,
      TOPIC_SLUGS.map(([, moduleId]) => moduleId),
    );
    assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 48, 'question ids repeat');
    for (const [slug] of TOPIC_SLUGS) {
      const ids = QUESTIONS.filter((q) => q.id.startsWith(`${slug}-`)).map((q) => q.id);
      assert.deepEqual(
        ids,
        [1, 2, 3, 4, 5, 6].map((n) => `${slug}-${n}`),
        slug,
      );
    }
    // Every topic maps to its own quiz module and nothing else.
    for (const [slug, moduleId] of TOPIC_SLUGS) {
      assert.deepEqual(
        [...new Set(questionsOf(moduleId).map((q) => q.id.replace(/-\d$/, '')))],
        [slug],
        moduleId,
      );
      assert.equal(questionsOf(moduleId).length, 6, moduleId);
    }
    for (const q of QUESTIONS) assert.match(q.id, /^[a-z]+-[1-6]$/, q.id);
  });

  it('offers three distinct options per question with trimmed, non-empty text', () => {
    for (const q of QUESTIONS) {
      assert.equal(q.options.length, 3, `${q.id} options`);
      assert.equal(new Set(q.options).size, 3, `${q.id} repeats an option`);
      assert.equal(
        q.options.filter((option) => option === q.answer).length,
        1,
        `${q.id} answer appears once`,
      );
      assert.ok(q.prompt.length > 0, `${q.id} prompt`);
      assert.ok(q.answer.length > 0, `${q.id} answer`);
      assert.ok(q.explanation.length > 0, `${q.id} explanation`);
      assert.equal(q.prompt, q.prompt.trim(), `${q.id} prompt has stray whitespace`);
      assert.equal(q.answer, q.answer.trim(), `${q.id} answer has stray whitespace`);
      assert.equal(q.explanation, q.explanation.trim(), `${q.id} explanation has stray whitespace`);
    }
  });

  it('keeps the answer as options[0] everywhere as written (options are shuffled on draw)', () => {
    // Rough edge of the data: the draw in `startJapaneseQuiz` shuffles options, so this
    // is not a leak, but a reordered bank would change the stored shape. Locked as-is.
    for (const q of QUESTIONS) assert.equal(q.answer, q.options[0], q.id);
    assert.deepEqual(
      QUESTIONS.find((q) => q.id === 'hiragana-4'),
      {
        id: 'hiragana-4',
        topic: 'jp-hiragana',
        prompt: 'Bacaan 「りょ」 adalah?',
        answer: 'ryo',
        options: ['ryo', 'riyo', 'yo'],
        explanation: 'Baca menurut mora; perhatikan tanda bunyi dan ukuran kana.',
      },
    );
  });

  it('locks one hard counters question exactly', () => {
    assert.deepEqual(
      QUESTIONS.find((q) => q.id === 'counters-1'),
      {
        id: 'counters-1',
        topic: 'jp-counters',
        prompt: '「三つ」の読み方は？',
        answer: 'みっつ',
        options: ['みっつ', 'さんにん', 'みっか'],
        explanation: '三つ tiga benda; 三人 tiga orang; 三日 tanggal 3/tiga hari.',
      },
    );
  });
});

describe('source guards', () => {
  it('keeps both datasets free of runtime imports', () => {
    for (const file of [CURRICULUM_FILE, QUESTIONS_FILE]) {
      const source = readFileSync(file, 'utf8');
      assert.ok(!/^import\b/m.test(source), `${file} has an import`);
      assert.ok(!/require\s*\(/.test(source), `${file} requires a module`);
    }
    const curriculum = readFileSync(CURRICULUM_FILE, 'utf8');
    assert.ok(curriculum.includes('export const MODULES: Module[] = ['));
    assert.ok(curriculum.includes("export const LEARNER = 'japanese-ardhyui';"));
    const questions = readFileSync(QUESTIONS_FILE, 'utf8');
    assert.ok(questions.includes('export const QUESTIONS: Question[] = ['));
  });

  it('keeps japanese.functions.ts wired to the datasets through their shared imports', () => {
    const source = readFileSync(JAPANESE_FUNCTIONS_FILE, 'utf8');
    for (const anchor of [
      "import { MODULES, LEARNER } from '@/lib/japanese/curriculum';",
      "import { QUESTIONS } from '@/lib/japanese/questions';",
      "m.mode === 'michi'",
      "m.mode === 'quiz'",
      "m.mode === 'external'",
      'QUESTIONS.filter((q) => q.topic === data.concept)',
    ]) {
      assert.ok(source.includes(anchor), anchor);
    }
  });

  it('leaves no second copy of these datasets anywhere else in src/', () => {
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' }).filter(
      (f) =>
        (f.endsWith('.ts') || f.endsWith('.tsx')) &&
        f !== join('lib', 'japanese', 'curriculum.ts') &&
        f !== join('lib', 'japanese', 'questions.ts'),
    );
    assert.ok(files.length > 50, `expected to scan the whole src/ tree, found ${files.length}`);
    for (const file of files) {
      const source = readFileSync(join(SRC_DIR, file), 'utf8');
      for (const marker of [
        'japanese-ardhyui',
        'jp-hiragana',
        'export const MODULES',
        'export const QUESTIONS',
        'export const LEARNER =',
      ]) {
        assert.ok(!source.includes(marker), `${file} copies the Japanese dataset (${marker})`);
      }
    }
  });

  it('keeps the original assertions in tests/japanese.test.ts in place', () => {
    const source = readFileSync(JAPANESE_TEST_FILE, 'utf8');
    for (const anchor of [
      'assert.equal(new Set(MODULES.map((m) => m.id)).size, MODULES.length);',
      'for (const id of m.prereqs) assert.ok(MODULES.some((n) => n.id === id));',
      "if (m.mode === 'quiz') assert.equal(QUESTIONS.filter((q) => q.topic === m.id).length, 6);",
      'assert.ok(q.options.includes(q.answer));',
      'assert.equal(new Set(q.options).size, 3);',
    ]) {
      assert.ok(source.includes(anchor), anchor);
    }
  });
});
