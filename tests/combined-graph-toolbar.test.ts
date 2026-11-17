/**
 * Combined graph toolbar is readable without sight.
 *
 * The three view toggles (Domains / Concepts / Knowledge States) only showed
 * their state through colour, the "Select Learner:" label was not wired to the
 * learner select, and every toolbar icon was announced although decorative.
 * The page is locked statically so the three exact `aria-pressed` expressions,
 * the `htmlFor`/`id` pair and the hidden decorative icons stay put — without
 * changing labels, clicks, classes or order, and without adding a server
 * function, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'combined-graph.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const onceIn = (text: string, literal: string, where: string) => {
  assert.equal(count(text, new RegExp(escape(literal), 'g')), 1, `${literal} once in ${where}`);
};

// The toolbar only: from the Refresh button through the view toggles, so
// counts elsewhere on the page cannot hide changes.
const refreshAt = page.indexOf('onClick={buildGraph}');
const toolbarStart = page.lastIndexOf('<motion.button', refreshAt);
const toolbarEnd = page.indexOf('{/* No Learner Selected Message */}');
const toolbar = page.slice(toolbarStart, toolbarEnd);

// The select's opening tag, which now starts with the id paired to the label.
// (The tag ends after the class attribute — the `=>` inside onChange is not
// the end of the tag.)
const selectIdAt = page.indexOf('id="combined-graph-learner"');
const classEnd = page.indexOf('transition-all text-foreground"', selectIdAt);
const selectOpen = page.slice(
  page.lastIndexOf('<select', selectIdAt),
  page.indexOf('>', classEnd) + 1,
);

describe('combined graph toolbar: toggle states are announced', () => {
  it('marks the three view toggles with their exact pressed expression', () => {
    assert.ok(toolbarStart > 0 && toolbarEnd > refreshAt, 'the toolbar block is found');

    assert.equal(count(toolbar, /<motion\.button\b/g), 4);
    assert.equal(count(toolbar, /aria-pressed=/g), 3);
    onceIn(page, 'aria-pressed={showDomains}', 'the page');
    onceIn(page, 'aria-pressed={showConcepts}', 'the page');
    onceIn(page, 'aria-pressed={showBridges}', 'the page');
    // The page had no aria state before; this change adds exactly these three.
    assert.equal(count(page, /aria-pressed=/g), 3);
  });

  it('keeps the clicks, classes and label order unchanged', () => {
    onceIn(toolbar, 'onClick={buildGraph}', 'the toolbar');
    onceIn(toolbar, 'onClick={() => setShowDomains(!showDomains)}', 'the toolbar');
    onceIn(toolbar, 'onClick={() => setShowConcepts(!showConcepts)}', 'the toolbar');
    onceIn(toolbar, 'onClick={() => setShowBridges(!showBridges)}', 'the toolbar');
    assert.equal(count(toolbar, /whileHover=\{\{ scale: 1\.02 \}\}/g), 4);
    assert.equal(count(toolbar, /whileTap=\{\{ scale: 0\.98 \}\}/g), 4);

    // Active/inactive colour classes stay driven by the same state.
    onceIn(
      toolbar,
      "'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/50'",
      'the toolbar',
    );
    onceIn(
      toolbar,
      "'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/50'",
      'the toolbar',
    );
    onceIn(
      toolbar,
      "'bg-pink-500/20 text-pink-700 dark:text-pink-300 border border-pink-500/50'",
      'the toolbar',
    );
    assert.equal(
      count(toolbar, /'bg-secondary text-muted-foreground border border-transparent'/g),
      3,
    );

    const labels = [
      'Refresh',
      'Domains (Graph A)',
      'Concepts (Graph B)',
      'Knowledge States (Bridge)',
    ];
    const positions = labels.map((text) => toolbar.indexOf(text));
    for (let i = 0; i < positions.length; i += 1) {
      assert.ok(positions[i] > 0, `${labels[i]} remains visible`);
      if (i > 0) assert.ok(positions[i] > positions[i - 1], `${labels[i]} keeps its order`);
    }
  });
});

describe('combined graph toolbar: the learner select has a name', () => {
  it('couples the Select Learner label with the learner select', () => {
    onceIn(page, 'htmlFor="combined-graph-learner"', 'the page');
    onceIn(page, 'id="combined-graph-learner"', 'the page');
    assert.ok(
      toolbar.includes(
        '<label htmlFor="combined-graph-learner" className="text-sm text-muted-foreground">',
      ),
    );
    assert.ok(toolbar.includes('Select Learner:'), 'the label text is unchanged');

    // The select keeps its contract, now with the paired id first.
    assert.ok(selectOpen.startsWith('<select'));
    assert.ok(selectOpen.includes('id="combined-graph-learner"'));
    assert.ok(selectOpen.includes('value={selectedLearner}'));
    assert.ok(selectOpen.includes('onChange={(e) => setSelectedLearner(e.target.value)}'));
    assert.ok(
      selectOpen.includes(
        'className="flex-1 max-w-xs px-4 py-2.5 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"',
      ),
    );

    // Options are untouched: the empty "Choose a learner..." plus one per learner.
    onceIn(toolbar, '<option value="">Choose a learner...</option>', 'the toolbar');
    onceIn(toolbar, '{learners.map((l) => (', 'the toolbar');
    onceIn(toolbar, '<option key={l.userId} value={l.userId}>', 'the toolbar');
  });
});

describe('combined graph toolbar: decorative icons are hidden', () => {
  it('hides every toolbar icon without changing size or classes', () => {
    // Prettier may split the Refresh button icon across lines, so match any
    // whitespace between the attributes instead of one exact line.
    assert.match(
      toolbar,
      /<RefreshCw\s+size=\{18\}\s+className=\{loading \? 'animate-spin' : ''\}\s+aria-hidden="true"\s*\/>/,
    );
    onceIn(
      toolbar,
      '<User size={18} className="text-muted-foreground" aria-hidden="true" />',
      'the toolbar',
    );
    assert.equal(count(toolbar, /<Eye size=\{16\} aria-hidden="true" \/>/g), 3);
    assert.equal(count(toolbar, /<EyeOff size=\{16\} aria-hidden="true" \/>/g), 3);
    onceIn(toolbar, '<Brain size={14} aria-hidden="true" />', 'the toolbar');
    onceIn(toolbar, '<Network size={14} aria-hidden="true" />', 'the toolbar');
    onceIn(toolbar, '<ArrowRight size={14} aria-hidden="true" />', 'the toolbar');

    // Every toolbar icon is hidden: eleven icon tags, eleven aria-hidden.
    assert.equal(
      count(toolbar, /<(?:Eye|EyeOff|Users|RefreshCw|Brain|Network|ArrowRight|User)\b/g),
      11,
    );
    assert.equal(count(toolbar, /aria-hidden="true"/g), 11);
    assert.equal(count(page, /aria-hidden="true"/g), 11);
  });

  it('adds no pressed state to the Refresh button', () => {
    const refresh = toolbar.slice(
      toolbar.indexOf('<motion.button'),
      toolbar.indexOf('</motion.button>'),
    );
    assert.equal(count(refresh, /aria-pressed=/g), 0);
  });
});

describe('combined graph toolbar: no new data path', () => {
  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(
        other.includes('combined-graph-learner'),
        false,
        `${file} gained toolbar markup`,
      );
      assert.equal(other.includes('Select Learner:'), false, `${file} gained toolbar markup`);
    }
  });
});
