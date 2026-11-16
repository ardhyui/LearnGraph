/**
 * Quiz length and layout toggles in My Profile are named button groups.
 *
 * The four toggles under "Short questionnaires" only showed their selection
 * through colour: screen-reader users were not told which option is pressed,
 * nor that each pair of buttons is one choice group. The page is locked
 * statically so the two `role="group"` wrappers, their `aria-label`s, the four
 * exact `aria-pressed` expressions and the decorative icons stay put, without
 * changing labels, clicks, classes or order and without adding a read, server
 * function, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'profile.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

// The two toggle groups, from the first group label to the closing tag of the
// second group's wrapper, so counts elsewhere on the page cannot hide changes.
const lengthLabel = page.indexOf('aria-label="Quiz length"');
const togglesStart = page.lastIndexOf('<div', lengthLabel);
const layoutLabel = page.indexOf('aria-label="Quiz layout"');
const allQuestions = page.indexOf('All questions', layoutLabel);
const lastButtonEnd = page.indexOf('</button>', allQuestions);
const togglesEnd = page.indexOf('</div>', lastButtonEnd);
const toggles = page.slice(togglesStart, togglesEnd);

const groupOpenTag = (label: string) => {
  const at = page.indexOf(`aria-label="${label}"`);
  const open = page.lastIndexOf('<div', at);
  return page.slice(open, page.indexOf('>', at) + 1);
};

const count = (text: string, pattern: RegExp) =>
  (text.match(pattern) ?? []).length;

describe('profile quiz toggles: two named choice groups', () => {
  it('labels the quiz length and quiz layout wrappers', () => {
    assert.ok(togglesStart > 0, 'the quiz length group exists');
    assert.ok(layoutLabel > togglesStart, 'the quiz layout group follows it');
    assert.ok(togglesEnd > lastButtonEnd, 'the layout group is closed');

    assert.equal(count(page, /aria-label="Quiz length"/g), 1);
    assert.equal(count(page, /aria-label="Quiz layout"/g), 1);
    assert.equal(count(toggles, /role="group"/g), 2);
  });

  it('keeps the wrapper class and puts no extra role inside the groups', () => {
    for (const label of ['Quiz length', 'Quiz layout']) {
      const tag = groupOpenTag(label);
      assert.match(tag, /^<div\b/, `${label} is a div wrapper`);
      assert.match(tag, /role="group"/, `${label} is a group`);
      assert.ok(
        tag.includes(
          'className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl"',
        ),
        `${label} keeps its wrapper class`,
      );
    }
    // Only the two group wrappers carry a role in this block.
    assert.equal(count(toggles, /role=/g), 2);
  });
});

describe('profile quiz toggles: pressed state and labels', () => {
  const pressed = [
    "aria-pressed={assessmentType === 'quick'}",
    "aria-pressed={assessmentType === 'full'}",
    "aria-pressed={assessmentViewMode === 'cards'}",
    "aria-pressed={assessmentViewMode === 'all'}",
  ];

  it('marks each button with its exact pressed expression exactly once', () => {
    assert.equal(count(toggles, /<button\b/g), 4);
    assert.equal(count(toggles, /aria-pressed=/g), 4);
    for (const expression of pressed) {
      assert.equal(
        count(page, new RegExp(expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')),
        1,
        expression,
      );
      assert.ok(toggles.includes(expression), expression);
    }
    // The page already had three pressed states in the quiz forms; this change
    // adds exactly four and does not touch those.
    assert.equal(count(page, /aria-pressed=/g), 7);
  });

  it('keeps Quick, Full, Cards and All questions in order', () => {
    const labels = ['Quick', 'Full', 'Cards', 'All questions'];
    const positions = labels.map((label) => toggles.indexOf(label));
    for (let i = 0; i < positions.length; i += 1) {
      assert.ok(positions[i] > 0, `${labels[i]} remains visible`);
      if (i > 0) assert.ok(positions[i] > positions[i - 1], `${labels[i]} keeps its order`);
    }
    // The accessible names are the visible text: no replacement aria-label on
    // the buttons, and no role of their own.
    assert.equal(count(toggles, /aria-label=/g), 2);
    for (const label of labels) {
      assert.equal(count(toggles, new RegExp(`aria-label="${label}"`, 'g')), 0);
    }
  });

  it('keeps each click handler unchanged', () => {
    for (const handler of [
      "onClick={() => setAssessmentType('quick')}",
      "onClick={() => setAssessmentType('full')}",
      "onClick={() => setAssessmentViewMode('cards')}",
      "onClick={() => setAssessmentViewMode('all')}",
    ]) {
      assert.equal(count(toggles, new RegExp(handler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')), 1);
    }
  });

  it('keeps the four button classes unchanged', () => {
    assert.equal(
      count(
        toggles,
        /'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',/g,
      ),
      2,
    );
    assert.equal(
      count(
        toggles,
        /'px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',/g,
      ),
      2,
    );
  });
});

describe('profile quiz toggles: decorative icons are hidden', () => {
  it('hides all four icons without changing size or classes', () => {
    for (const icon of ['Zap', 'FileText', 'LayoutGrid', 'List']) {
      assert.equal(
        count(toggles, new RegExp(`<${icon} className="w-4 h-4" aria-hidden="true" />`, 'g')),
        1,
        icon,
      );
    }
    assert.equal(count(toggles, /aria-hidden="true"/g), 4);
  });
});

describe('profile quiz toggles: no new data path', () => {
  it('adds no server function, RPC call or migration for the toggles', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Quiz length'), false, `${file} gained group markup`);
      assert.equal(other.includes('Quiz layout'), false, `${file} gained group markup`);
    }
  });
});
