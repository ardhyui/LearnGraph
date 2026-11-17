/**
 * Data Entry form labels name their controls (`/data-entry`).
 *
 * The four forms on the page (Learners, Concepts, Prerequisites, Knowledge
 * States) rendered every field with a visual label that was not associated
 * with its input, so a screen reader announced anonymous edit fields and
 * clicking a label did not focus its control. This file locks the 26
 * `htmlFor`/`id` pairs: one stable `data-entry-` id per control, the label
 * pointing at the same value, the original label text (including the required
 * marker and the live slider value), and no replaced name through
 * `aria-label`. The Strength radios and the psychometric score labels stay
 * implicit/unpaired, and the page gains no server function, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'data-entry.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const onceIn = (text: string, literal: string, where: string) => {
  assert.equal(count(text, new RegExp(escape(literal), 'g')), 1, `${literal} once in ${where}`);
};

interface Block {
  form: string;
  tab: string;
  pairs: Array<{ id: string; text: string; prefix?: boolean }>;
}

const BLOCKS: Block[] = [
  {
    form: '<form onSubmit={handleAddLearner}',
    tab: 'Learners',
    pairs: [
      { id: 'data-entry-learner-json', text: 'Paste Full Learner JSON' },
      { id: 'data-entry-learner-name', text: 'Name *' },
      { id: 'data-entry-learner-email', text: 'Email' },
      { id: 'data-entry-learner-id', text: 'Custom ID' },
      { id: 'data-entry-learner-modality', text: 'Primary Modality' },
      { id: 'data-entry-learner-social', text: 'Social Pref' },
      { id: 'data-entry-learner-pace', text: 'Pace Pref' },
      { id: 'data-entry-learner-memory', text: 'Working Memory' },
      { id: 'data-entry-learner-attention', text: 'Attention Span' },
      { id: 'data-entry-learner-speed', text: 'Processing Speed' },
      { id: 'data-entry-learner-abstract', text: 'Abstract Thinking' },
    ],
  },
  {
    form: '<form onSubmit={handleAddConcept}',
    tab: 'Concepts',
    pairs: [
      { id: 'data-entry-concept-id', text: 'Concept ID *' },
      { id: 'data-entry-concept-name', text: 'Name *' },
      { id: 'data-entry-concept-domain', text: 'Domain *' },
      { id: 'data-entry-concept-subdomain', text: 'Subdomain' },
      { id: 'data-entry-concept-description', text: 'Description *' },
      { id: 'data-entry-concept-difficulty', text: 'Difficulty (1-10):', prefix: true },
      { id: 'data-entry-concept-cognitive-load', text: 'Cognitive Load:', prefix: true },
      { id: 'data-entry-concept-abstractness', text: 'Abstractness:', prefix: true },
    ],
  },
  {
    form: '<form onSubmit={handleAddPrerequisite}',
    tab: 'Prerequisites',
    pairs: [
      { id: 'data-entry-prereq-from', text: 'From (Prerequisite) *' },
      { id: 'data-entry-prereq-to', text: 'To (Dependent) *' },
      { id: 'data-entry-prereq-reason', text: 'Reason (optional)' },
    ],
  },
  {
    form: '<form onSubmit={handleAddKnowledgeState}',
    tab: 'Knowledge States',
    pairs: [
      { id: 'data-entry-state-learner', text: 'Learner *' },
      { id: 'data-entry-state-concept', text: 'Concept *' },
      { id: 'data-entry-state-mastery', text: 'Mastery Level:', prefix: true },
      { id: 'data-entry-state-bloom', text: 'Bloom Level Achieved' },
    ],
  },
];

const allPairs = BLOCKS.flatMap((block) => block.pairs);

const blockSlice = (form: string) => {
  const start = page.indexOf(form);
  assert.ok(start > 0, `${form} is rendered`);
  const end = page.indexOf('</form>', start);
  assert.ok(end > start, `${form} has a closing tag`);
  return page.slice(start, end);
};

const labelText = (htmlFor: string) => {
  const pattern = new RegExp(
    `<label htmlFor="${escape(htmlFor)}"[^>]*>([\\s\\S]*?)</label>`,
  );
  const match = page.match(pattern);
  if (!match) return null;
  return match[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const controlTag = (id: string) => {
  const pattern = new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bid="${escape(id)}"[^>]*>`);
  return page.match(pattern)?.[0] ?? null;
};

describe('data-entry form labels: every control is paired', () => {
  it('has exactly 26 prefixed htmlFor attributes and matching ids', () => {
    const fors = [...page.matchAll(/htmlFor="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(fors.length, 26);
    assert.deepEqual(
      [...fors].sort(),
      allPairs.map((pair) => pair.id).sort(),
      'the paired labels are exactly the 26 expected controls',
    );
    for (const value of fors) assert.ok(value.startsWith('data-entry-'), `${value} is prefixed`);
    assert.equal(count(page, /htmlFor="data-entry-/g), 26);
  });

  it('points every htmlFor at one unique control id', () => {
    const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const idsForControls = ids.filter((id) => id.startsWith('data-entry-') && !id.startsWith('data-entry-panel-'));
    assert.equal(idsForControls.length, 26, 'one id per pair, panels excluded');
    assert.deepEqual(
      idsForControls,
      allPairs.map((pair) => pair.id),
      'the control ids are the same values as the htmlFor attributes',
    );

    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual(duplicates, [], 'no id appears twice on the page');

    for (const pair of allPairs) {
      assert.equal(
        count(page, new RegExp(`id="${escape(pair.id)}"`, 'g')),
        1,
        `${pair.id} is unique`,
      );
      assert.ok(controlTag(pair.id), `${pair.id} sits on an input, select or textarea`);
    }
  });

  it('keeps each pair inside its own form', () => {
    for (const block of BLOCKS) {
      const slice = blockSlice(block.form);
      const fors = [...slice.matchAll(/htmlFor="([^"]+)"/g)].map((match) => match[1]);
      assert.deepEqual(
        fors,
        block.pairs.map((pair) => pair.id),
        `${block.tab} keeps its ${block.pairs.length} pairs in order`,
      );
      for (const pair of block.pairs) {
        assert.ok(
          slice.includes(`id="${pair.id}"`),
          `${pair.id} stays in the ${block.tab} form`,
        );
      }
    }
    assert.deepEqual(
      BLOCKS.map((block) => block.pairs.length),
      [11, 8, 3, 4],
      'the 11/8/3/4 distribution is locked',
    );
  });
});

describe('data-entry form labels: names, required markers and sliders stay', () => {
  it('keeps the original label text in every pair', () => {
    for (const pair of allPairs) {
      const text = labelText(pair.id);
      assert.ok(text, `label for ${pair.id} exists`);
      if (pair.prefix) {
        assert.ok(text.startsWith(pair.text), `${pair.id} still starts with "${pair.text}"`);
      } else {
        assert.equal(text, pair.text, `${pair.id} keeps its exact visible text`);
      }
    }
  });

  it('keeps the four perfect sliders as ranges with their values', () => {
    for (const id of [
      'data-entry-concept-difficulty',
      'data-entry-concept-cognitive-load',
      'data-entry-concept-abstractness',
      'data-entry-state-mastery',
    ]) {
      const tag = controlTag(id);
      assert.ok(tag, `${id} control exists`);
      assert.ok(tag.includes('type="range"'), `${id} stays a range input`);
    }
    onceIn(page, 'min="1"\n                        max="10"', 'the difficulty slider');
    onceIn(page, 'min="0"\n                        max="100"', 'the mastery slider');
  });

  it('keeps the visible slider values inside their labels', () => {
    assert.ok(labelText('data-entry-concept-difficulty')?.includes('{conceptForm.difficulty}'));
    assert.ok(labelText('data-entry-concept-cognitive-load')?.includes('{conceptForm.cognitiveLoad.toFixed(1)}'));
    assert.ok(labelText('data-entry-concept-abstractness')?.includes('{conceptForm.abstractness.toFixed(1)}'));
    assert.ok(labelText('data-entry-state-mastery')?.includes('{stateForm.mastery}%'));
  });

  it('adds no aria-label replacing the visible names', () => {
    for (const block of BLOCKS) {
      const slice = blockSlice(block.form);
      assert.equal(count(slice, /aria-label=/g), 0, `${block.tab} form uses no aria-label`);
      assert.equal(count(slice, /aria-labelledby=/g), 0, `${block.tab} form uses no aria-labelledby`);
    }
  });
});

describe('data-entry form labels: implicit groups stay implicit', () => {
  it('keeps the Strength radios wrapped in their own labels', () => {
    const slice = blockSlice('<form onSubmit={handleAddPrerequisite}');
    assert.ok(slice.includes('<label className="form-label">Strength</label>'), 'group label untouched');
    onceIn(page, '<label key={s} className="flex items-center cursor-pointer">', 'the page');
    assert.equal(count(slice, /type="radio"/g), 1);
    assert.equal(count(slice, /name="strength"/g), 1);
    // The three radios are named implicitly by wrapping them, not by htmlFor.
    assert.equal(count(slice, /htmlFor=/g), 3, 'only the three prerequisite fields are paired');
  });

  it('leaves the psychometric score labels and Strength title unpaired', () => {
    assert.equal(count(page, /<label/g), 29, 'the page keeps 29 label elements');
    assert.equal(count(page, /<label htmlFor=/g), 26, 'exactly the 26 paired labels');
    assert.equal(count(page, /<label className="form-label">Strength<\/label>/g), 1);
    assert.equal(
      count(page, /<label className="block text-xs font-medium text-foreground truncate" title=\{domain\.desc\}>/g),
      1,
      'the psychometric score label is unchanged',
    );
  });
});

describe('data-entry form labels: no new data path', () => {
  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('data-entry-learner-'), false, `${file} gained form ids`);
      assert.equal(other.includes('data-entry-concept-'), false, `${file} gained form ids`);
      assert.equal(other.includes('data-entry-prereq-'), false, `${file} gained form ids`);
      assert.equal(other.includes('data-entry-state-'), false, `${file} gained form ids`);
    }
  });
});
