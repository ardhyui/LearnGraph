/**
 * Direct unit tests for the demo lesson dataset `src/lib/content/demo-content.ts`.
 *
 * `DEMO_CONTENT` is the seeded example subject (decision D6: basic mathematics
 * first) and its coverage was only a handful of assertions inside
 * `tests/learn-in-app.test.ts`. This file imports the dataset directly
 * (node:test, no PGlite or DOM) and locks its exact shape: the 18 ids, the six
 * mathematics concepts (the same ids as `demoConcepts`), the text/example/
 * exercise triplet per concept, the shared metadata, the validator pass, the
 * per-preference ordering, the parsed markup with its unicode typography, and
 * the explicit minutes. The dataset itself is not changed; source guards keep
 * `service.ts` its only seeding consumer and the module type-only toward
 * `content.ts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_CONTENT } from '../src/lib/content/demo-content.ts';
import { demoConcepts } from '../src/lib/demo-data.ts';
import {
  contentInput,
  lessonMinutes,
  orderContent,
  parseRichText,
  FORMAT_PREFERENCES,
  type Block,
  type ContentItem,
} from '../src/lib/content/content.ts';

const SERVICE_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'content', 'service.ts');
const DEMO_CONTENT_FILE = join(
  import.meta.dirname,
  '..',
  'src',
  'lib',
  'content',
  'demo-content.ts',
);
const LEARN_IN_APP_FILE = join(import.meta.dirname, '..', 'tests', 'learn-in-app.test.ts');
const SRC_DIR = join(import.meta.dirname, '..', 'src');

// Explicit copies: reordering, renaming or dropping an item must show up in the diff.
const MATH_CONCEPT_IDS = [
  'arithmetic',
  'fractions',
  'decimals',
  'pre-algebra',
  'linear-equations',
  'quadratic-equations',
] as const;

const EXPECTED_IDS = [
  'demo-arithmetic-text',
  'demo-arithmetic-example',
  'demo-arithmetic-exercise',
  'demo-fractions-text',
  'demo-fractions-example',
  'demo-fractions-exercise',
  'demo-decimals-text',
  'demo-decimals-example',
  'demo-decimals-exercise',
  'demo-pre-algebra-text',
  'demo-pre-algebra-example',
  'demo-pre-algebra-exercise',
  'demo-linear-equations-text',
  'demo-linear-equations-example',
  'demo-linear-equations-exercise',
  'demo-quadratic-equations-text',
  'demo-quadratic-equations-example',
  'demo-quadratic-equations-exercise',
] as const;

// lessonMinutes per concept = the sum of the items' explicit minutes.
const EXPECTED_CONCEPT_MINUTES = {
  arithmetic: 8,
  fractions: 8,
  decimals: 8,
  'pre-algebra': 8,
  'linear-equations': 11,
  'quadratic-equations': 11,
} as const;

const itemsOf = (conceptId: string): ContentItem[] =>
  DEMO_CONTENT.filter((c) => c.conceptId === conceptId);

/** All text of parsed blocks joined back into one string (markup removed). */
const flatText = (blocks: Block[]): string =>
  blocks
    .flatMap((b) => (b.type === 'p' ? b.parts : b.items.flat()))
    .map((p) => p.text)
    .join(' ');

describe('demo lesson content dataset', () => {
  it('ships exactly 18 items: the six mathematics concepts times three kinds, ids exact and unique', () => {
    assert.equal(DEMO_CONTENT.length, 18);
    assert.deepEqual(
      DEMO_CONTENT.map((c) => c.id),
      [...EXPECTED_IDS],
    );
    assert.equal(new Set(DEMO_CONTENT.map((c) => c.id)).size, 18);
    // The concepts are exactly the mathematics demo concepts, in that order.
    const mathIds = demoConcepts
      .filter((c) => c.domain === 'mathematics')
      .map((c) => c.id.replace('concept:', ''));
    assert.deepEqual(mathIds, [...MATH_CONCEPT_IDS]);
    assert.deepEqual([...new Set(DEMO_CONTENT.map((c) => c.conceptId))], [...MATH_CONCEPT_IDS]);
  });

  it('gives every concept an explanation, a worked example and practice, in editor order', () => {
    for (const conceptId of MATH_CONCEPT_IDS) {
      const items = itemsOf(conceptId);
      assert.equal(items.length, 3, conceptId);
      assert.deepEqual(
        items.map((c) => c.kind),
        ['text', 'example', 'exercise'],
        conceptId,
      );
      assert.deepEqual(
        items.map((c) => c.position),
        [0, 1, 2],
        conceptId,
      );
    }
    for (const c of DEMO_CONTENT) {
      assert.ok(c.title.trim().length > 0, `${c.id} has an empty title`);
      assert.ok(c.body.trim().length > 0, `${c.id} has an empty body`);
    }
  });

  it('stamps every item with the same seeding metadata', () => {
    for (const c of DEMO_CONTENT) {
      assert.equal(c.url, null, c.id);
      assert.equal(c.language, 'en', c.id); // learner UI is English (decision D2)
      assert.equal(c.source, 'LearnGraph example content', c.id);
      assert.ok(
        typeof c.minutes === 'number' &&
          Number.isInteger(c.minutes) &&
          c.minutes >= 1 &&
          c.minutes <= 10,
        `${c.id} minutes ${String(c.minutes)}`,
      );
    }
  });

  it('attaches a written solution only to the practice exercises', () => {
    for (const c of DEMO_CONTENT) {
      if (c.kind === 'exercise') assert.ok(c.solution.trim().length > 0, `${c.id} has no solution`);
      else assert.equal(c.solution, '', c.id);
    }
  });

  it('passes every item through the editor validator unchanged in its minutes', () => {
    for (const c of DEMO_CONTENT) {
      const parsed = contentInput.safeParse(c);
      assert.equal(parsed.success, true, c.id);
      if (parsed.success) {
        assert.equal(parsed.data.minutes, c.minutes, c.id);
        assert.equal(parsed.data.id, c.id, c.id);
      }
    }
  });

  it('orders the three items for each preference without losing or duplicating one', () => {
    for (const conceptId of MATH_CONCEPT_IDS) {
      const items = itemsOf(conceptId);
      for (const preference of FORMAT_PREFERENCES) {
        const ordered = orderContent(items, preference);
        assert.equal(ordered.length, 3, `${conceptId}/${preference}`);
        assert.equal(new Set(ordered.map((i) => i.id)).size, 3, `${conceptId}/${preference}`);
        assert.deepEqual(
          ordered.map((i) => i.kind),
          preference === 'explain-first'
            ? ['text', 'example', 'exercise']
            : preference === 'example-first'
              ? ['example', 'text', 'exercise']
              : ['exercise', 'example', 'text'],
          `${conceptId}/${preference}`,
        );
      }
    }
  });

  it('parses every body and solution into blocks, none with an empty text part', () => {
    for (const c of DEMO_CONTENT) {
      const blocksList =
        c.solution !== ''
          ? [parseRichText(c.body), parseRichText(c.solution)]
          : [parseRichText(c.body)];
      for (const blocks of blocksList) {
        assert.ok(blocks.length >= 1, `${c.id} parses to no block`);
        for (const part of blocks.flatMap((b) => (b.type === 'p' ? b.parts : b.items.flat()))) {
          assert.ok(part.text.length > 0, `${c.id} has an empty text part`);
        }
      }
      assert.ok(flatText(parseRichText(c.body)).trim().length > 0, `${c.id} body is blank text`);
    }
  });

  it('keeps the unicode math typography intact as plain text', () => {
    // − × ÷ in the arithmetic explanation, ² in the quadratic one, ✓ in the worked examples.
    const arithmeticText = flatText(parseRichText(itemsOf('arithmetic')[0].body));
    for (const ch of ['\u2212', '\u00d7', '\u00f7'])
      assert.ok(arithmeticText.includes(ch), `arithmetic text lost ${ch}`);
    const quadraticText = flatText(parseRichText(itemsOf('quadratic-equations')[0].body));
    assert.ok(quadraticText.includes('\u00b2'), 'quadratic text lost ²');
    // ✓ ends the check line of the three algebra worked examples.
    for (const conceptId of ['pre-algebra', 'linear-equations', 'quadratic-equations'] as const) {
      const example = itemsOf(conceptId)[1];
      assert.ok(
        flatText(parseRichText(example.body)).includes('✓'),
        `${example.id} lost its check mark`,
      );
    }
    // The arithmetic practice solution keeps ×, ÷ and − as well.
    const arithmeticSolution = flatText(parseRichText(itemsOf('arithmetic')[2].solution));
    for (const ch of ['\u2212', '\u00d7', '\u00f7']) {
      assert.ok(arithmeticSolution.includes(ch), `arithmetic solution lost ${ch}`);
    }
  });

  it('sums each concept to its explicit minutes', () => {
    for (const conceptId of MATH_CONCEPT_IDS) {
      const items = itemsOf(conceptId);
      assert.equal(lessonMinutes(items), EXPECTED_CONCEPT_MINUTES[conceptId], conceptId);
      assert.equal(
        lessonMinutes(items),
        items.reduce((sum, i) => sum + (i.minutes ?? 0), 0),
        conceptId,
      );
    }
  });
});

describe('source guards', () => {
  it('keeps service.ts the only consumer of the dataset inside src/', () => {
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' }).filter(
      (f) =>
        (f.endsWith('.ts') || f.endsWith('.tsx')) &&
        f !== join('lib', 'content', 'demo-content.ts') &&
        f !== join('lib', 'content', 'service.ts'),
    );
    assert.ok(
      files.length > 50,
      `expected to scan the whole src/ tree, found ${files.length} files`,
    );
    for (const file of files) {
      const source = readFileSync(join(SRC_DIR, file), 'utf8');
      assert.ok(!source.includes('demo-content'), `${file} imports the demo dataset`);
      assert.ok(!source.includes('DEMO_CONTENT'), `${file} copies the demo dataset`);
    }
    // Seeding still runs through the module, one concept at a time.
    const service = readFileSync(SERVICE_FILE, 'utf8');
    assert.ok(
      service.includes("import { DEMO_CONTENT } from './demo-content.ts'"),
      'service.ts imports the dataset',
    );
    assert.ok(
      service.includes('DEMO_CONTENT.filter((c) => c.conceptId === conceptId)'),
      'seedDemoContent filters the dataset per concept',
    );
  });

  it('keeps demo-content.ts type-only toward content.ts', () => {
    const source = readFileSync(DEMO_CONTENT_FILE, 'utf8');
    assert.ok(
      source.includes("import type { ContentItem } from './content.ts'"),
      'the dataset types its items through content.ts',
    );
    // No runtime import: the dataset stays a plain module with no behaviour of its own.
    assert.ok(!/^import\s+(?!type\b)/m.test(source), 'demo-content.ts has a runtime import');
  });

  it('keeps the original assertions in tests/learn-in-app.test.ts', () => {
    const source = readFileSync(LEARN_IN_APP_FILE, 'utf8');
    for (const anchor of [
      'ships a complete example subject: every mathematics concept has an explanation, an example and practice',
      'accepts lesson items and only https links',
    ]) {
      assert.ok(source.includes(anchor), anchor);
    }
  });
});
