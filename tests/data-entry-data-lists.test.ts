/**
 * Data Entry data lists are named lists (`/data-entry`).
 *
 * Four blocks on the page rendered their rows as a run of `<div>` inside a
 * `<div>`: Recent Learners, Recent Concepts, Existing Learners and Existing
 * Concepts. A screen reader did not know the rows were one list and could not
 * jump item by item. The Existing Concepts block also had no empty message at
 * all, so an empty account showed a blank grey box.
 *
 * This file locks the four lists as `<ul>` carrying the previous container
 * classes and one English `aria-label`, each row as a direct `<li>` with the
 * original key/classes/content, both empty states outside their `<ul>`, and
 * the two decorative `Plus` icons hidden. The page gains no marker class,
 * `role="list"`, live region, forced focus, server function, RPC or migration.
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
const blockAfter = (text: string, marker: string) => {
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing marker: ${marker}`);
  const end = text.indexOf('</ul>', start);
  assert.ok(end > start, `missing closing </ul> for ${marker}`);
  return text.slice(start, end + '</ul>'.length);
};
const slide = (text: string, startMarker: string, endMarker?: string) => {
  const start = text.indexOf(startMarker);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  if (endMarker === undefined) return text.slice(start);
  const end = text.indexOf(endMarker, start);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return text.slice(start, end);
};

const LISTS = [
  {
    label: 'Recent learners',
    open: '<ul aria-label="Recent learners" className="space-y-2">',
    head: '{learners.slice(0, 3).map((l) => (',
    key: 'key={l.userId}',
    rowClass: 'flex items-center gap-3 p-3 rounded-xl bg-accent/50',
    content: ['{(l.name || l.userId).charAt(0).toUpperCase()}', "{l.name || 'Unnamed'}", '{l.userId}'],
    order: [
      ["{l.name || 'Unnamed'}", 'className="text-xs text-muted-foreground font-mono truncate">{l.userId}'],
    ],
  },
  {
    label: 'Recent concepts',
    open: '<ul aria-label="Recent concepts" className="space-y-2">',
    head: '{concepts.slice(0, 3).map((c) => (',
    key: 'key={c.conceptId}',
    rowClass: 'flex items-center gap-3 p-3 rounded-xl bg-accent/50',
    content: ['{c.name.charAt(0).toUpperCase()}', '{c.name}', '{c.domain}', '{c.conceptId}'],
    order: [
      ['className="text-sm font-medium text-foreground truncate">{c.name}', '{c.domain}'],
      ['{c.domain}', '<span className="text-xs px-2 py-1 rounded-lg bg-purple-500/10 text-purple-500 font-mono">'],
      ['<span className="text-xs px-2 py-1 rounded-lg bg-purple-500/10 text-purple-500 font-mono">', '{c.conceptId}\n'],
    ],
  },
  {
    label: 'Existing learners',
    open: '<ul aria-label="Existing learners" className="max-h-32 overflow-y-auto rounded-xl bg-accent/50 p-2">',
    head: '{learners.map((l) => (',
    key: 'key={l.userId}',
    rowClass: 'text-sm text-foreground py-1.5 px-2 rounded-lg hover:bg-accent',
    content: ['{l.name || l.userId}', '({l.userId})'],
    order: [['{l.name || l.userId}', '({l.userId})']],
  },
  {
    label: 'Existing concepts',
    open: '<ul aria-label="Existing concepts" className="max-h-40 overflow-y-auto rounded-xl bg-accent/50 p-2">',
    head: '{concepts.map((c) => (',
    key: 'key={c.conceptId}',
    rowClass: 'text-sm text-foreground py-1.5 px-2 rounded-lg hover:bg-accent',
    content: ['{c.name}', '({c.domain})'],
    order: [['{c.name}', '({c.domain})']],
  },
];

describe('data-entry data lists: four named lists', () => {
  it('uses exactly the four labels once each, with the previous container classes', () => {
    for (const list of LISTS) {
      assert.equal(count(page, new RegExp(list.open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')), 1, list.open);
    }
    assert.equal(count(page, /aria-label="Recent learners"/g), 1);
    assert.equal(count(page, /aria-label="Recent concepts"/g), 1);
    assert.equal(count(page, /aria-label="Existing learners"/g), 1);
    assert.equal(count(page, /aria-label="Existing concepts"/g), 1);
  });

  it('maps each row straight to a keyed <li> with the same classes and content', () => {
    for (const list of LISTS) {
      const block = blockAfter(page, list.open);
      const mapIndex = block.indexOf(list.head);
      assert.ok(mapIndex > 0, `${list.label}: map head present`);
      const afterHead = block.slice(mapIndex + list.head.length);
      assert.match(afterHead, /^\s*<li /, `${list.label}: map opens directly with <li>`);
      assert.equal(count(block, /<li /g), 1, `${list.label}: one <li> in the map source`);
      assert.ok(block.includes(`${list.key} className="${list.rowClass}"`), `${list.label}: key and classes`);
      for (const snippet of list.content) {
        assert.ok(block.includes(snippet), `${list.label}: missing ${snippet}`);
      }
      for (const [earlier, later] of list.order) {
        assert.ok(
          block.indexOf(earlier) < block.indexOf(later),
          `${list.label}: ${earlier} before ${later}`,
        );
      }
      assert.equal(count(block, /<div key=/g), 0, `${list.label}: no wrapper div per row`);
    }
  });

  it('adds no marker class, role="list", aria-live or extra attributes', () => {
    for (const list of LISTS) {
      const block = blockAfter(page, list.open);
      assert.equal(/list-(disc|decimal|none)|role="list"/.test(block), false, `${list.label}: stock list only`);
      assert.equal(/aria-live=/.test(block), false, `${list.label}: not a live region`);
      assert.equal(/tabIndex|\.focus\(\)/.test(block), false, `${list.label}: no forced focus`);
    }
    assert.equal(count(page, /aria-live=/g), 5, 'the message banner and all four save status lines are the live regions');
  });
});

describe('data-entry data lists: empty states stay outside the lists', () => {
  it('keeps the Recent Learners and Recent Concepts empty states after their list', () => {
    const recentLearners = slide(
      page,
      '<h3 className="font-medium text-sm text-muted-foreground mb-3">Recent Learners</h3>',
      '<h3 className="font-medium text-sm text-muted-foreground mb-3">Recent Concepts</h3>',
    );
    assert.ok(
      recentLearners.includes(
        '<p className="text-muted-foreground text-sm mb-2">No learners yet</p>',
      ),
      'Recent Learners empty copy',
    );
    assert.ok(
      recentLearners.indexOf('No learners yet') > recentLearners.indexOf('</ul>'),
      'Recent Learners empty state sits outside <ul>',
    );
    const recentConcepts = slide(
      page,
      '<h3 className="font-medium text-sm text-muted-foreground mb-3">Recent Concepts</h3>',
      '{/* Learners Tab */}',
    );
    assert.ok(
      recentConcepts.includes(
        '<p className="text-muted-foreground text-sm mb-2">No concepts yet</p>',
      ),
      'Recent Concepts empty copy',
    );
    assert.ok(
      recentConcepts.indexOf('No concepts yet') > recentConcepts.indexOf('</ul>'),
      'Recent Concepts empty state sits outside <ul>',
    );
  });

  it('renders No learners yet and No concepts yet as the Existing branch before the list', () => {
    const existingLearners = slide(
      page,
      'Existing Learners ({learners.length})',
      'Existing Concepts ({concepts.length})',
    );
    assert.ok(existingLearners.includes('{learners.length === 0 ? ('), 'Existing Learners branch');
    assert.ok(
      existingLearners.includes(
        '<p className="text-muted-foreground text-sm text-center py-2">No learners yet</p>',
      ),
      'Existing Learners empty copy',
    );
    assert.ok(
      existingLearners.indexOf('No learners yet') < existingLearners.indexOf('<ul aria-label="Existing learners"'),
      'Existing Learners empty state sits outside <ul>',
    );

    const existingConcepts = slide(page, 'Existing Concepts ({concepts.length})', '{/* Prerequisites Tab */}');
    assert.ok(existingConcepts.includes('{concepts.length === 0 ? ('), 'Existing Concepts branch');
    assert.ok(
      existingConcepts.includes(
        '<p className="text-muted-foreground text-sm text-center py-2">No concepts yet</p>',
      ),
      'Existing Concepts gains the missing empty copy',
    );
    assert.ok(
      existingConcepts.indexOf('No concepts yet') < existingConcepts.indexOf('<ul aria-label="Existing concepts"'),
      'Existing Concepts empty state sits outside <ul>',
    );
    assert.equal(count(existingConcepts, /No concepts yet/g), 1, 'one empty message only');
    assert.equal(count(existingConcepts, /<button/g), 0, 'no button added to the empty state');
  });
});

describe('data-entry data lists: decorative icons and no new data path', () => {
  it('hides both Plus icons without changing their classes or copy', () => {
    assert.equal(count(page, /<Plus className="w-3 h-3" aria-hidden="true" \/>/g), 2);
    assert.ok(page.includes('Add your first learner'), 'learner button copy stays');
    assert.ok(page.includes('Add your first concept'), 'concept button copy stays');
  });

  it('changes no header, heading count, or delete/copy control', () => {
    assert.equal(count(page, /Recent Learners/g), 1);
    assert.equal(count(page, /Recent Concepts/g), 1);
    assert.equal(count(page, /Existing Learners \(\{learners\.length\}\)/g), 1);
    assert.equal(count(page, /Existing Concepts \(\{concepts\.length\}\)/g), 1);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('data-entry-data-lists'), false, `${file} gained list wiring`);
    }
  });
});
