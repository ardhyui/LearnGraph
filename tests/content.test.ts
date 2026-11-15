/**
 * Direct unit tests for the lesson content module `src/lib/content/content.ts`.
 *
 * The module is pure (no I/O): validation of editor input, the learner's
 * format preference, lesson ordering, minutes, and the tiny text markup. Its
 * behaviour was only covered indirectly by a handful of assertions in
 * `tests/learn-in-app.test.ts`, so this file imports it directly (node:test,
 * no PGlite or DOM) and locks the constants, every schema rule of
 * `contentInput`, the strategy/preference helpers, the score matrix, the
 * ordering and the parser. The module is not changed by this file: rough
 * edges (a bogus first `format:` tag disables all format tags, the 50-tag
 * slice only applies when adding, a lone `-` is a paragraph) are locked as
 * the actual behaviour, not fixed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTENT_KINDS,
  CONTENT_KIND_LABELS,
  FORMAT_LABELS,
  FORMAT_PREFERENCES,
  FORMAT_TAG_PREFIX,
  MAX_CONTENT_PER_CONCEPT,
  contentInput,
  determinePresentationStrategy,
  lessonMinutes,
  orderContent,
  parseInline,
  parseRichText,
  scoreContentMatch,
  withFormatPreference,
  type ContentItem,
  type ContentKind,
} from '../src/lib/content/content.ts';
import type { LearningModality } from '../src/lib/graph/types.ts';

const FUNCTIONS_FILE = join(import.meta.dirname, '..', 'src', 'server', 'content.functions.ts');
const LEARN_ROUTE_FILE = join(import.meta.dirname, '..', 'src', 'routes', 'learn.$conceptId.tsx');
const RICH_TEXT_FILE = join(import.meta.dirname, '..', 'src', 'components', 'RichText.tsx');
const TUTOR_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'tutor', 'service.ts');
const LEARN_IN_APP_FILE = join(import.meta.dirname, '..', 'tests', 'learn-in-app.test.ts');
const SRC_DIR = join(import.meta.dirname, '..', 'src');

const base = { conceptId: 'fractions', kind: 'text', title: 'Intro', body: 'Halves and quarters.' } as const;
const linkInput = { conceptId: 'fractions', kind: 'link', title: 'More', url: 'https://example.org/fractions' };

/** A minimal profile carrying only what the strategy helper reads. */
const style = (primary: LearningModality) => ({
  learningStyle: {
    primary,
    socialPreference: 'solo' as const,
    pacePreference: 'structured' as const,
    feedbackPreference: 'immediate' as const,
  },
});

const item = (id: string, kind: ContentKind, position = 0): Pick<ContentItem, 'id' | 'kind' | 'position'> => ({
  id,
  kind,
  position,
});

describe('content constants', () => {
  it('keeps the kinds, their labels, the cap, and the format preference vocabulary', () => {
    // Explicit copies: reordering or dropping a choice must show up in the diff.
    assert.deepEqual([...CONTENT_KINDS], ['text', 'example', 'exercise', 'link', 'video']);
    assert.deepEqual([...FORMAT_PREFERENCES], ['explain-first', 'example-first', 'practice-first']);
    for (const kind of CONTENT_KINDS) assert.ok(CONTENT_KIND_LABELS[kind].length > 0, kind);
    assert.equal(Object.keys(CONTENT_KIND_LABELS).length, CONTENT_KINDS.length);
    for (const pref of FORMAT_PREFERENCES) assert.ok(FORMAT_LABELS[pref].length > 0, pref);
    assert.equal(Object.keys(FORMAT_LABELS).length, FORMAT_PREFERENCES.length);
    assert.equal(MAX_CONTENT_PER_CONCEPT, 50);
    assert.equal(FORMAT_TAG_PREFIX, 'format:');
  });
});

describe('contentInput', () => {
  it('fills the defaults, trims the title, and drops unknown keys', () => {
    assert.deepEqual(
      contentInput.parse({ ...base, title: '  Intro  ', url: '', bogus: 'dropped' }),
      {
        conceptId: 'fractions',
        kind: 'text',
        title: 'Intro',
        body: 'Halves and quarters.',
        solution: '',
        url: null,
        minutes: null,
        language: 'en',
        source: '',
        position: 0,
      },
    );
  });

  it('trims the title and bounds it to 1..200 characters', () => {
    assert.equal(contentInput.safeParse({ ...base, title: 'x'.repeat(200) }).success, true);
    assert.equal(contentInput.safeParse({ ...base, title: 'x'.repeat(201) }).success, false);
    assert.equal(contentInput.safeParse({ ...base, title: '' }).success, false);
    assert.equal(contentInput.safeParse({ ...base, title: '   ' }).success, false);
    // A title that is blank after the trim is empty; a padded one is kept trimmed.
    assert.equal(contentInput.parse({ ...base, title: '  ok  ' }).title, 'ok');
  });

  it('bounds body and solution at 20.000 characters without trimming them', () => {
    assert.equal(contentInput.safeParse({ ...base, body: 'x'.repeat(20_000) }).success, true);
    assert.equal(contentInput.safeParse({ ...base, body: 'x'.repeat(20_001) }).success, false);
    assert.equal(contentInput.safeParse({ ...base, solution: 'x'.repeat(20_000) }).success, true);
    assert.equal(contentInput.safeParse({ ...base, solution: 'x'.repeat(20_001) }).success, false);
    assert.equal(contentInput.parse({ ...base, body: ' padded ' }).body, ' padded ');
  });

  it('turns an empty url into null and only accepts trimmed https links', () => {
    // '' becomes null, which the text kinds accept but a link does not.
    assert.equal(contentInput.parse({ ...base, url: '' }).url, null);
    assert.equal(contentInput.safeParse({ ...linkInput, url: '' }).success, false);
    assert.equal(contentInput.parse({ ...linkInput, url: ' https://example.org/a ' }).url, 'https://example.org/a');
    for (const url of [
      'http://example.org',
      'ftp://example.org/f',
      '//example.org/f',
      'example.org/f',
      'https://',
      'javascript:alert(1)',
      'data:text/html,x',
    ]) {
      assert.equal(contentInput.safeParse({ ...linkInput, url }).success, false, url);
    }
    // Text items may omit the url entirely.
    assert.equal(contentInput.safeParse(base).success, true);
    assert.equal(contentInput.parse(base).url, null);
  });

  it('requires links and videos to have a url, and the text kinds to have a body', () => {
    // Links and videos: the url is the payload, the body may stay empty.
    assert.equal(contentInput.safeParse(linkInput).success, true);
    assert.equal(contentInput.safeParse({ ...linkInput, body: '' }).success, true);
    assert.equal(contentInput.safeParse({ ...linkInput, body: '   ' }).success, true);
    assert.equal(contentInput.safeParse({ ...linkInput, kind: 'video' }).success, true);
    assert.equal(contentInput.safeParse({ conceptId: 'x', kind: 'video', title: 'T', body: 'Watch this.' }).success, false);
    assert.equal(contentInput.safeParse({ conceptId: 'x', kind: 'link', title: 'T' }).success, false);
    // Text kinds: the body is the payload and must not be blank; a url is optional.
    for (const kind of ['text', 'example', 'exercise'] as const) {
      assert.equal(contentInput.safeParse({ ...base, kind, body: '' }).success, false, kind);
      assert.equal(contentInput.safeParse({ ...base, kind, body: '   ' }).success, false, kind);
      assert.equal(contentInput.safeParse({ ...base, kind, url: 'https://example.org/x' }).success, true, kind);
    }
  });

  it('bounds minutes to a whole 1..600 or null', () => {
    for (const minutes of [1, 10, 600, null]) {
      assert.equal(contentInput.safeParse({ ...base, minutes }).success, true, String(minutes));
    }
    for (const minutes of [0, -1, 601, 1.5, '5' as never]) {
      assert.equal(contentInput.safeParse({ ...base, minutes }).success, false, String(minutes));
    }
  });

  it('checks the language against a BCP-47-ish code and defaults to en', () => {
    for (const language of ['en', 'id', 'eng', 'en-US', 'nl-BE']) {
      assert.equal(contentInput.safeParse({ ...base, language }).success, true, language);
    }
    for (const language of ['EN', 'e', 'english', 'en-US-x', 'abcd', '']) {
      assert.equal(contentInput.safeParse({ ...base, language }).success, false, language);
    }
    assert.equal(contentInput.parse(base).language, 'en');
  });

  it('bounds position to a whole 0..10.000 and defaults it to 0', () => {
    for (const position of [0, 1, 10_000]) {
      assert.equal(contentInput.safeParse({ ...base, position }).success, true, String(position));
    }
    for (const position of [-1, 10_001, 1.5]) {
      assert.equal(contentInput.safeParse({ ...base, position }).success, false, String(position));
    }
    assert.equal(contentInput.parse(base).position, 0);
  });

  it('accepts an optional editor id and validates the concept id like a write key', () => {
    assert.equal(contentInput.safeParse({ ...base, id: 'A-b_9' }).success, true);
    assert.equal(contentInput.safeParse({ ...base, id: 'a'.repeat(65) }).success, false);
    assert.equal(contentInput.safeParse({ ...base, id: 'a b' }).success, false);
    assert.equal(contentInput.safeParse({ ...base, id: undefined }).success, true);
    for (const conceptId of ['', 'a:b', ' fractions', 'frac\ntions', 'x'.repeat(129)]) {
      assert.equal(contentInput.safeParse({ ...base, conceptId }).success, false, JSON.stringify(conceptId));
    }
    assert.equal(contentInput.safeParse({ ...base, kind: 'image' }).success, false);
    assert.equal(contentInput.safeParse({ ...base, kind: 'Text' }).success, false);
  });
});

describe('determinePresentationStrategy', () => {
  it("leads with the learner's chosen format, decided by the first format tag", () => {
    // A valid tag wins even when the profile points elsewhere.
    assert.deepEqual(
      determinePresentationStrategy({ tags: ['focus:mathematics', 'format:practice-first'], ...style('visual') }),
      { preference: 'practice-first', source: 'chosen' },
    );
    // The first `format:` tag decides; a bogus one disables every format tag.
    assert.deepEqual(
      determinePresentationStrategy({ tags: ['format:example-first', 'format:practice-first'] }),
      { preference: 'example-first', source: 'chosen' },
    );
    assert.deepEqual(
      determinePresentationStrategy({ tags: ['format:nonsense', 'format:practice-first'], ...style('kinesthetic') }),
      { preference: 'practice-first', source: 'suggested' },
    );
    assert.deepEqual(determinePresentationStrategy({ tags: ['format:nonsense'] }), {
      preference: 'explain-first',
      source: 'default',
    });
    // Tags that are not format tags are ignored entirely.
    assert.deepEqual(determinePresentationStrategy({ tags: ['focus:mathematics', 'practice-first'] }), {
      preference: 'explain-first',
      source: 'default',
    });
  });

  it('suggests a starting format from the primary learning style', () => {
    assert.deepEqual(determinePresentationStrategy(style('kinesthetic')), { preference: 'practice-first', source: 'suggested' });
    assert.deepEqual(determinePresentationStrategy(style('visual')), { preference: 'example-first', source: 'suggested' });
    assert.deepEqual(determinePresentationStrategy(style('reading')), { preference: 'explain-first', source: 'suggested' });
    assert.deepEqual(determinePresentationStrategy(style('auditory')), { preference: 'explain-first', source: 'suggested' });
  });

  it('falls back to explanations for anything else', () => {
    // A primary outside the modality enum, no learning style, and no learner at all.
    assert.deepEqual(determinePresentationStrategy(style('psionic' as never)), { preference: 'explain-first', source: 'default' });
    assert.deepEqual(determinePresentationStrategy({ tags: ['focus:mathematics'] }), {
      preference: 'explain-first',
      source: 'default',
    });
    assert.deepEqual(determinePresentationStrategy({}), { preference: 'explain-first', source: 'default' });
    assert.deepEqual(determinePresentationStrategy(null), { preference: 'explain-first', source: 'default' });
    assert.deepEqual(determinePresentationStrategy(undefined), { preference: 'explain-first', source: 'default' });
  });
});

describe('withFormatPreference', () => {
  it('replaces the format tags in place, keeping the other tags and their order', () => {
    assert.deepEqual(withFormatPreference(['focus:mathematics', 'format:explain-first', 'pace:slow'], 'example-first'), [
      'focus:mathematics',
      'pace:slow',
      'format:example-first',
    ]);
    // null only removes the choice.
    assert.deepEqual(withFormatPreference(['focus:mathematics', 'format:explain-first', 'format:practice-first'], null), [
      'focus:mathematics',
    ]);
    assert.deepEqual(withFormatPreference(undefined, null), []);
    assert.deepEqual(withFormatPreference(undefined, 'practice-first'), ['format:practice-first']);
  });

  it('caps the stored tags at 50 only when adding a choice', () => {
    const others = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    // Adding to 49 tags keeps the new choice as the 50th (and last).
    assert.deepEqual(withFormatPreference(others(49), 'explain-first'), [...others(49), 'format:explain-first']);
    // Rough edge, locked as-is: with 50 other tags the fresh choice is the one cut.
    assert.deepEqual(withFormatPreference(others(50), 'explain-first'), others(50));
    // The removal path does not slice a list that is already longer than 50.
    const fiftyOne = [...others(50), 'format:explain-first'];
    assert.deepEqual(withFormatPreference(fiftyOne, null), others(50));
  });
});

describe('scoreContentMatch', () => {
  it('keeps the 3×5 score matrix exactly', () => {
    const expected = {
      'explain-first': { text: 4, video: 3, example: 2, exercise: 1, link: 0 },
      'example-first': { example: 4, video: 3, text: 2, exercise: 1, link: 0 },
      'practice-first': { exercise: 4, example: 3, text: 2, video: 1, link: 0 },
    } as const;
    for (const preference of FORMAT_PREFERENCES) {
      for (const kind of CONTENT_KINDS) {
        assert.equal(scoreContentMatch({ kind }, preference), expected[preference][kind], `${preference}/${kind}`);
      }
    }
  });
});

describe('orderContent', () => {
  it('orders each preference by its score matrix', () => {
    const items = [item('i1', 'text'), item('i2', 'example'), item('i3', 'exercise'), item('i4', 'link'), item('i5', 'video')];
    assert.deepEqual(
      orderContent(items, 'explain-first').map((i) => i.kind),
      ['text', 'video', 'example', 'exercise', 'link'],
    );
    assert.deepEqual(
      orderContent(items, 'example-first').map((i) => i.kind),
      ['example', 'video', 'text', 'exercise', 'link'],
    );
    assert.deepEqual(
      orderContent(items, 'practice-first').map((i) => i.kind),
      ['exercise', 'example', 'text', 'video', 'link'],
    );
  });

  it('breaks ties by the editor position, then by id', () => {
    const items = [item('late', 'text', 20), item('early', 'text', 1), item('b', 'text', 1), item('a', 'text', 1)];
    assert.deepEqual(orderContent(items, 'explain-first').map((i) => i.id), ['a', 'b', 'early', 'late']);
    // A high score still comes first even with a huge position.
    const mixed = [item('zero', 'link', 0), item('hero', 'text', 9_999)];
    assert.deepEqual(orderContent(mixed, 'explain-first').map((i) => i.id), ['hero', 'zero']);
  });

  it('does not mutate the input list', () => {
    const items = [item('b', 'exercise', 2), item('a', 'text', 1)];
    const copy = structuredClone(items);
    orderContent(items, 'practice-first');
    assert.deepEqual(items, copy);
  });
});

describe('lessonMinutes', () => {
  it('adds the explicit minutes, keeping 0 and decimals as they are', () => {
    assert.equal(lessonMinutes([]), 0);
    assert.equal(lessonMinutes([{ kind: 'text', minutes: 0 }]), 0);
    assert.equal(lessonMinutes([{ kind: 'text', minutes: 5 }, { kind: 'video', minutes: 7 }]), 12);
    assert.equal(lessonMinutes([{ kind: 'text', minutes: 1.5 }, { kind: 'exercise', minutes: 2.25 }]), 3.75);
  });

  it('falls back to 2 minutes per item, except links which take none', () => {
    const noMinutes = { kind: 'text', minutes: null } as const;
    assert.equal(
      lessonMinutes([noMinutes, { kind: 'link', minutes: null }, { kind: 'video', minutes: null }, { kind: 'exercise', minutes: null }]),
      6,
    );
    // Items whose minutes key is absent at runtime get the same fallback.
    const absent = { kind: 'text' } as unknown as Pick<ContentItem, 'kind' | 'minutes'>;
    const absentLink = { kind: 'link' } as unknown as Pick<ContentItem, 'kind' | 'minutes'>;
    assert.equal(lessonMinutes([absent, absentLink]), 2);
  });
});

describe('parseInline', () => {
  it('marks **bold** and `code` spans and keeps the text around them', () => {
    assert.deepEqual(parseInline('a **b** c `d` e'), [
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c ' },
      { text: 'd', code: true },
      { text: ' e' },
    ]);
    // Several spans in a row.
    assert.deepEqual(parseInline('**a**`b`**c**'), [
      { text: 'a', bold: true },
      { text: 'b', code: true },
      { text: 'c', bold: true },
    ]);
    assert.deepEqual(parseInline('plain'), [{ text: 'plain' }]);
    assert.deepEqual(parseInline(''), []);
  });

  it('leaves empty and unmatched markers as plain text', () => {
    assert.deepEqual(parseInline('****'), [{ text: '****' }]);
    assert.deepEqual(parseInline('``'), [{ text: '``' }]);
    assert.deepEqual(parseInline('**bold and `code'), [{ text: '**bold and `code' }]);
    assert.deepEqual(parseInline('a**b'), [{ text: 'a**b' }]);
  });
});

describe('parseRichText', () => {
  it('normalizes line endings, splits on blank lines, and joins paragraph lines with one space', () => {
    assert.deepEqual(parseRichText('a\r\nb\rc\n\nd'), [
      { type: 'p', parts: [{ text: 'a b c' }] },
      { type: 'p', parts: [{ text: 'd' }] },
    ]);
    // A blank line may carry whitespace, and several blank lines are one break.
    assert.deepEqual(parseRichText('a\n  \nb'), [
      { type: 'p', parts: [{ text: 'a' }] },
      { type: 'p', parts: [{ text: 'b' }] },
    ]);
    assert.deepEqual(parseRichText('a\n\n\nb'), [
      { type: 'p', parts: [{ text: 'a' }] },
      { type: 'p', parts: [{ text: 'b' }] },
    ]);
    // Line ends are trimmed and the lines joined by a single space.
    assert.deepEqual(parseRichText('a  \nb\t'), [{ type: 'p', parts: [{ text: 'a b' }] }]);
    assert.deepEqual(parseRichText('a  b'), [{ type: 'p', parts: [{ text: 'a  b' }] }]);
  });

  it('starts a bullet list at "- " or "* " and parses each item inline', () => {
    assert.deepEqual(parseRichText('- one\n- **two**'), [
      { type: 'ul', items: [[{ text: 'one' }], [{ text: 'two', bold: true }]] },
    ]);
    assert.deepEqual(parseRichText('* item'), [{ type: 'ul', items: [[{ text: 'item' }]] }]);
    // Extra spaces after the marker, and leading indentation, are fine.
    assert.deepEqual(parseRichText('-   x'), [{ type: 'ul', items: [[{ text: 'x' }]] }]);
    assert.deepEqual(parseRichText('  - x'), [{ type: 'ul', items: [[{ text: 'x' }]] }]);
  });

  it('breaks the paragraph at a list and the list at a paragraph', () => {
    assert.deepEqual(parseRichText('p\n- b1\n* b2\nq'), [
      { type: 'p', parts: [{ text: 'p' }] },
      { type: 'ul', items: [[{ text: 'b1' }], [{ text: 'b2' }]] },
      { type: 'p', parts: [{ text: 'q' }] },
    ]);
    assert.deepEqual(parseRichText('- a\nback to prose\nstill prose'), [
      { type: 'ul', items: [[{ text: 'a' }]] },
      { type: 'p', parts: [{ text: 'back to prose still prose' }] },
    ]);
  });

  it('treats a lone marker as a paragraph and leaves HTML as plain text', () => {
    // Rough edge, locked as-is: after trimEnd "- " is just "-", so it is prose.
    assert.deepEqual(parseRichText('-'), [{ type: 'p', parts: [{ text: '-' }] }]);
    assert.deepEqual(parseRichText('- '), [{ type: 'p', parts: [{ text: '-' }] }]);
    assert.deepEqual(parseRichText('*'), [{ type: 'p', parts: [{ text: '*' }] }]);
    // The markup is not HTML: tags stay literal text and are never interpreted.
    assert.deepEqual(parseRichText('<b>x</b> & <script>alert(1)</script>'), [
      { type: 'p', parts: [{ text: '<b>x</b> & <script>alert(1)</script>' }] },
    ]);
    assert.deepEqual(parseRichText('  \n\n '), []);
    assert.deepEqual(parseRichText(''), []);
  });
});

describe('source guards', () => {
  it('validates lesson input on the server through the same schema and vocabularies', () => {
    const source = readFileSync(FUNCTIONS_FILE, 'utf8');
    assert.ok(
      source.includes("import { CONTENT_KINDS, contentInput, FORMAT_PREFERENCES } from '@/lib/content/content'"),
      'content.functions.ts imports the content validators',
    );
    assert.ok(source.includes('.validator(contentInput)'), 'saving goes through contentInput');
    assert.ok(source.includes('z.enum(FORMAT_PREFERENCES)'), 'the logged strategy preference is FORMAT_PREFERENCES');
    assert.ok(source.includes('z.enum(CONTENT_KINDS)'), 'the logged order is CONTENT_KINDS');
    assert.ok(source.includes("import('@/lib/content/content')"), 'the lesson page helpers come from the module');
    assert.ok(source.includes('determinePresentationStrategy(learner)'), 'the strategy is decided by the module');
    assert.ok(source.includes('orderContent(items, strategy.preference)'), 'the lesson order comes from the module');
  });

  it('keeps the lesson page and the tutor wired to the module helpers', () => {
    const route = readFileSync(LEARN_ROUTE_FILE, 'utf8');
    assert.ok(route.includes('withFormatPreference') && route.includes('orderContent'), 'learn route uses both helpers');
    assert.ok(route.includes("from '@/lib/content/content'"), 'learn route imports the module');
    const tutor = readFileSync(TUTOR_FILE, 'utf8');
    assert.ok(
      tutor.includes("import { determinePresentationStrategy } from '../content/content.ts'"),
      'tutor imports the strategy helper',
    );
    assert.ok(tutor.includes('determinePresentationStrategy(learner)'), 'tutor calls the strategy helper');
  });

  it('renders lesson text through parseRichText only, never as HTML', () => {
    const source = readFileSync(RICH_TEXT_FILE, 'utf8');
    assert.ok(
      source.includes("import { parseRichText, type Inline } from '@/lib/content/content'"),
      'RichText imports the parser from the module',
    );
    assert.ok(!source.includes('dangerouslySetInnerHTML'), 'RichText never injects HTML');
    assert.ok(!source.includes('innerHTML'), 'RichText never touches innerHTML');
  });

  it('keeps content.ts the single source of the rules (no copies elsewhere in src/)', () => {
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' }).filter(
      (f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && f !== join('lib', 'content', 'content.ts'),
    );
    assert.ok(files.length > 50, `expected to scan the whole src/ tree, found ${files.length} files`);
    for (const file of files) {
      const source = readFileSync(join(SRC_DIR, file), 'utf8');
      assert.ok(!source.includes('KIND_SCORES'), `${file} copies the score matrix`);
      assert.ok(!source.includes('FORMAT_TAG_PREFIX'), `${file} parses format: tags on its own`);
      assert.ok(!/\*\*\(\[\^\*\]\+\)\*\*/.test(source), `${file} copies the markup parser`);
      assert.ok(!source.includes('`([^`]+)`'), `${file} copies the inline code parser`);
    }
  });

  it('keeps the original assertions in tests/learn-in-app.test.ts', () => {
    const source = readFileSync(LEARN_IN_APP_FILE, 'utf8');
    for (const anchor of [
      'accepts lesson items and only https links',
      'a session leads with the format the learner chose',
      'stores the format choice as a tag without touching other tags',
      'turns the text markup into blocks and leaves HTML as plain text',
    ]) {
      assert.ok(source.includes(anchor), anchor);
    }
  });
});
