/**
 * Domain graph toolbar and stat cards are accessible.
 *
 * The Correlations/Subscales toggles only showed their state through colour,
 * the "Overlay scores:" label was not wired to the learner select, and the
 * four stat cards were motion divs in a plain grid, so screen readers could
 * not tell toggle state, select name, nor that the cards are one list. The
 * page is locked statically so the two exact `aria-pressed` expressions, the
 * `htmlFor`/`id` pair, the hidden decorative icons and the `<motion.ul>`/
 * `<motion.li>` cards stay put — without changing labels, clicks, classes,
 * order or data flow, and without adding a server function, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'domains.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const onceIn = (text: string, literal: string, where: string) => {
  assert.equal(count(text, new RegExp(escape(literal), 'g')), 1, `${literal} once in ${where}`);
};

// The toolbar, from the Refresh button to the closing of the overlay wrapper,
// so counts elsewhere on the page cannot hide changes.
const refreshAt = page.indexOf('onClick={buildGraph}');
const toolbarStart = page.lastIndexOf('<motion.button', refreshAt);
const overlayAt = page.indexOf('Overlay scores:');
const selectClose = page.indexOf('</select>', overlayAt);
const toolbarEnd = page.indexOf('</div>', selectClose);
const toolbar = page.slice(toolbarStart, toolbarEnd);

// The select's opening tag, which now starts with the id paired to the label.
// (The tag ends after the class attribute — the `=>` inside onChange is not
// the end of the tag.)
const selectIdAt = page.indexOf('id="domains-overlay-learner"');
const classEnd = page.indexOf('transition-all text-foreground"', selectIdAt);
const selectOpen = page.slice(
  page.lastIndexOf('<select', selectIdAt),
  page.indexOf('>', classEnd) + 1,
);

// The stat cards grid and its map body.
const gridAt = page.indexOf('className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"');
const stats = page.slice(
  page.lastIndexOf('<motion.ul', gridAt),
  page.indexOf('</motion.ul>', gridAt) + '</motion.ul>'.length,
);
const mapAt = page.indexOf('{statCards.map((card) => {');
const mapBody = page.slice(mapAt, page.indexOf(')})}', mapAt));

// The statCards definition itself.
const defStart = page.indexOf('const statCards = [');
const def = page.slice(defStart, page.indexOf('];', defStart));

describe('domains toolbar: toggle states are announced', () => {
  it('marks both overlay toggles with their exact pressed expression', () => {
    assert.ok(toolbarStart > 0 && toolbarEnd > selectClose, 'the toolbar block is found');

    assert.equal(count(toolbar, /<motion\.button\b/g), 3);
    assert.equal(count(toolbar, /aria-pressed=/g), 2);
    onceIn(page, 'aria-pressed={showCorrelations}', 'the page');
    onceIn(page, 'aria-pressed={showSubscales}', 'the page');
    assert.ok(toolbar.includes('aria-pressed={showCorrelations}'));
    assert.ok(toolbar.includes('aria-pressed={showSubscales}'));
    // The page had no aria state before; this change adds exactly these two.
    assert.equal(count(page, /aria-pressed=/g), 2);
  });

  it('keeps the clicks, classes and label order unchanged', () => {
    onceIn(toolbar, 'onClick={buildGraph}', 'the toolbar');
    onceIn(toolbar, 'onClick={() => setShowCorrelations(!showCorrelations)}', 'the toolbar');
    onceIn(toolbar, 'onClick={() => setShowSubscales(!showSubscales)}', 'the toolbar');
    assert.equal(count(toolbar, /whileHover=\{\{ scale: 1\.02 \}\}/g), 3);
    assert.equal(count(toolbar, /whileTap=\{\{ scale: 0\.98 \}\}/g), 3);

    // Active/inactive colour classes stay driven by the same state.
    onceIn(
      toolbar,
      "'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/50'",
      'the toolbar',
    );
    onceIn(
      toolbar,
      "'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/50'",
      'the toolbar',
    );
    assert.equal(
      count(toolbar, /'bg-secondary text-muted-foreground border border-transparent'/g),
      2,
    );

    const labels = ['Refresh', 'Correlations', 'Subscales'];
    const positions = labels.map((text) => toolbar.indexOf(text));
    for (let i = 0; i < positions.length; i += 1) {
      assert.ok(positions[i] > 0, `${labels[i]} remains visible`);
      if (i > 0) assert.ok(positions[i] > positions[i - 1], `${labels[i]} keeps its order`);
    }
  });
});

describe('domains toolbar: the overlay select has a name', () => {
  it('couples the Overlay scores label with the learner select', () => {
    onceIn(page, 'htmlFor="domains-overlay-learner"', 'the page');
    onceIn(page, 'id="domains-overlay-learner"', 'the page');
    assert.ok(
      toolbar.includes(
        '<label htmlFor="domains-overlay-learner" className="text-sm text-muted-foreground">Overlay scores:</label>',
      ),
    );

    // The select keeps its contract, now with the paired id first.
    assert.ok(selectOpen.startsWith('<select'));
    assert.ok(selectOpen.includes('id="domains-overlay-learner"'));
    assert.ok(selectOpen.includes('value={selectedLearner}'));
    assert.ok(selectOpen.includes('onChange={(e) => setSelectedLearner(e.target.value)}'));
    assert.ok(
      selectOpen.includes(
        'className="flex-1 max-w-xs px-4 py-2.5 bg-secondary/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"',
      ),
    );

    // Options are untouched: the empty "No overlay" plus one per learner.
    onceIn(toolbar, '<option value="">No overlay</option>', 'the toolbar');
    onceIn(toolbar, '{learners.map((l) => (', 'the toolbar');
    onceIn(toolbar, '<option key={l.userId} value={l.userId}>', 'the toolbar');
  });
});

describe('domains toolbar: decorative icons are hidden', () => {
  it('hides every toolbar icon without changing size or classes', () => {
    onceIn(
      toolbar,
      "<RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden=\"true\" />",
      'the toolbar',
    );
    assert.equal(count(toolbar, /<Eye size=\{18\} aria-hidden="true" \/>/g), 2);
    assert.equal(count(toolbar, /<EyeOff size=\{18\} aria-hidden="true" \/>/g), 2);
    onceIn(
      toolbar,
      '<Users size={18} className="text-muted-foreground" aria-hidden="true" />',
      'the toolbar',
    );
    assert.equal(count(toolbar, /aria-hidden="true"/g), 6);
    // Every toolbar icon is hidden: six icon tags, six aria-hidden attributes.
    assert.equal(count(toolbar, /<(?:Eye|EyeOff|Users|RefreshCw)\b/g), 6);
    assert.equal(count(page, /aria-hidden="true"/g), 6);
  });
});

describe('domains stat cards: one list, no wrappers', () => {
  it('renders the grid as motion.ul with the same animation and class', () => {
    assert.ok(gridAt > 0, 'the stat cards grid is found');
    assert.equal(count(stats, /<motion\.ul\b/g), 1);
    assert.equal(count(stats, /<\/motion\.ul>/g), 1);
    onceIn(stats, 'initial="hidden"', 'the stats block');
    onceIn(stats, 'animate="visible"', 'the stats block');
    onceIn(
      stats,
      'visible: { opacity: 1, transition: { staggerChildren: 0.1 } },',
      'the stats block',
    );
    onceIn(stats, 'className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"', 'the stats block');
  });

  it('maps each card straight to a motion.li with the same contract', () => {
    assert.ok(mapAt > 0, 'the stat cards map is found');
    assert.match(mapBody, /return \(\s*\n\s*<motion\.li\b/, 'the map returns a motion.li directly');
    onceIn(stats, '<motion.li', 'the stats block');
    onceIn(stats, 'key={card.label}', 'the stats block');
    onceIn(stats, 'whileHover={{ scale: 1.02, y: -2 }}', 'the stats block');
    onceIn(stats, 'className="glass-card p-4 text-center"', 'the stats block');
    // No motion.div remains in the block and no div sits between ul and li:
    // the only divs left are the plain icon/value/label wrappers inside the card.
    assert.equal(count(stats, /<motion\.div\b/g), 0);
    assert.equal(
      count(stats, /<div\b/g),
      3,
      'exactly the icon, value and label wrappers of the mapped card',
    );
  });

  it('adds no marker class, list role or live region to the cards', () => {
    assert.equal(count(stats, /role=/g), 0);
    assert.equal(count(stats, /aria-live/g), 0);
    assert.equal(count(stats, /list-(?:disc|decimal|none)|marker:/g), 0);
    assert.equal(count(stats, /<ul\b/g), 0, 'no plain ul replaces the motion list');
  });

  it('keeps the four card labels in order', () => {
    assert.ok(defStart > 0, 'the statCards definition is found');
    const labels = ['Domains', 'Categories', 'Correlations', 'Subscale Groups'];
    const positions = labels.map((label) => def.indexOf(`label: '${label}'`));
    for (let i = 0; i < positions.length; i += 1) {
      assert.ok(positions[i] > 0, `${labels[i]} remains defined`);
      if (i > 0) assert.ok(positions[i] > positions[i - 1], `${labels[i]} keeps its order`);
    }
  });
});

describe('domains toolbar: no new data path', () => {
  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(
        other.includes('domains-overlay-learner'),
        false,
        `${file} gained toolbar markup`,
      );
      assert.equal(other.includes('Overlay scores'), false, `${file} gained toolbar markup`);
    }
  });
});
