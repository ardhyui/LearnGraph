/**
 * Rebuilding the combined graph is announced (/combined-graph).
 *
 * The Refresh button in the controls card had no `disabled` at all: while the
 * combined graph was being rebuilt its icon spun, but there was no
 * `aria-busy` and no live region, so a screen reader could not tell a rebuild
 * was running, the button looked idle, and a double click could start two
 * overlapping `buildGraph` calls. The same pattern is already used on
 * `/sign-in`, `/forgot-password`, `/reset-password`, the `/learn` self-report
 * and concept quiz, `DeleteAccount`, both **Ask an AI tutor** buttons, the
 * snooze buttons, **Create a read-only key**, **Save subjects**, the
 * `/japanese` buttons, **Start learning**, the admin buttons, **Refresh** on
 * `/gaps`, the profile save buttons, **Refresh study plan** on the Today card,
 * and **Refresh** on `/graph`.
 *
 * This file locks one `type="button"` + `disabled={loading}` +
 * `aria-busy={loading}` after `onClick={buildGraph}`, a single `sr-only`
 * polite `role="status"` line that is the last child of the first controls
 * row, the untouched classes/icon/label, the three View Toggles staying
 * `aria-pressed` without `aria-busy`, the existing build flow and learner
 * picker, and that no server function, RPC schema or migration was added.
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

/** The Refresh action: the first `motion.button`, the one wired to `buildGraph`. */
const buttonStart = page.indexOf('<motion.button');
assert.ok(buttonStart > 0, 'the Refresh button is rendered');
const buttonEnd = page.indexOf('</motion.button>', buttonStart) + '</motion.button>'.length;
const REFRESH = page.slice(buttonStart, buttonEnd);
assert.ok(REFRESH.includes('onClick={buildGraph}'), 'the first motion.button is the Refresh action');

/** The first controls row, from its flex wrapper to its closing `</div>`. */
const rowStart = page.indexOf('<div className="flex flex-wrap items-center gap-4">');
assert.ok(rowStart > 0, 'the controls row is rendered');
const row = page.slice(rowStart, page.indexOf('</div>', page.indexOf('</p>', rowStart)) + '</div>'.length);
assert.ok(row.includes('Refresh') && row.includes('Select Learner:'), 'the row holds the button and the picker');

/** `buildGraph`, from its declaration to the effect that calls it. */
const buildStart = page.indexOf('const buildGraph = useCallback(');
const effectStart = page.indexOf('useEffect(() => {', buildStart);
assert.ok(buildStart > 0 && effectStart > buildStart, 'the build flow is present');
const BUILD = page.slice(buildStart, effectStart);

/** The learner picker, from its wrapper to its closing `</div>`. */
const pickerStart = page.indexOf('<div className="flex items-center gap-3 flex-1">');
const pickerEnd = page.indexOf('</div>', page.indexOf('</select>', pickerStart)) + '</div>'.length;
const PICKER = page.slice(pickerStart, pickerEnd);

/** All three View Toggles, from the toggle row to its closing `</div>`. */
const toggleStart = page.indexOf('{/* View Toggles */}');
const toggleEnd = page.indexOf('</div>', page.indexOf('Knowledge States (Bridge)')) + '</div>'.length;
const TOGGLES = page.slice(toggleStart, toggleEnd);

describe('/combined-graph: the Refresh button announces its busy state', () => {
  it('adds type, disabled={loading} and aria-busy={loading} after the handler', () => {
    assert.ok(REFRESH.includes('onClick={buildGraph}'), 'the handler stays');
    assert.ok(REFRESH.includes('type="button"'), 'the button is explicitly a button');
    assert.ok(REFRESH.includes('disabled={loading}'), 'disabled is driven by loading');
    assert.ok(REFRESH.includes('aria-busy={loading}'), 'aria-busy is driven by loading');
    const click = REFRESH.indexOf('onClick={buildGraph}');
    const disabled = REFRESH.indexOf('disabled={loading}');
    const busy = REFRESH.indexOf('aria-busy={loading}');
    assert.ok(click < disabled && disabled < busy, 'the order is click, disabled, aria-busy');
    assert.equal(count(page, /aria-busy=/g), 1, 'exactly one aria-busy attribute on the page');
  });

  it('keeps motion props, classes, icon and label untouched', () => {
    assert.ok(REFRESH.includes('whileHover={{ scale: 1.02 }}'), 'the hover animation stays');
    assert.ok(REFRESH.includes('whileTap={{ scale: 0.98 }}'), 'the tap animation stays');
    assert.ok(
      REFRESH.includes(
        'className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/25"',
      ),
      'the button classes stay',
    );
    assert.match(
      REFRESH,
      /<RefreshCw\s+size=\{18\}\s+className=\{loading \? 'animate-spin' : ''\}\s+aria-hidden="true"\s*\/>/,
      'the decorative spinner keeps its size and loading class and is hidden',
    );
    assert.equal(count(REFRESH, />\s*Refresh\s*</g), 1, 'the Refresh label stays once in the button');
  });
});

describe('/combined-graph: one polite status line announces the rebuild', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      row.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the progress line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(page, /role="status"/g), 1, 'one status line on the page');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert role added');
  });

  it('says the combined graph is refreshing and clears when idle', () => {
    assert.ok(
      row.includes("{loading ? 'Refreshing the combined graph…' : ''}"),
      'the status text follows loading before clearing',
    );
    assert.equal(count(page, /Refreshing the combined graph…/g), 1, 'the refresh copy appears once');
  });

  it('sits after the picker as the last child of the first controls row', () => {
    const statusStart = row.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the progress line is present');
    const pickerClose = row.indexOf('</div>', row.indexOf('</select>'));
    assert.ok(pickerClose > 0 && statusStart > pickerClose, 'the line follows the picker');
    const statusEnd = row.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      row.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</div>',
      'the line is the last child of the row',
    );
  });
});

describe('/combined-graph: the build flow, picker and toggles stay intact', () => {
  it('keeps the build flow unchanged', () => {
    assert.ok(BUILD.includes('if (!selectedLearnerData) {'), 'the guard stays');
    assert.ok(BUILD.includes('setLoading(true);'), 'loading still starts');
    assert.ok(BUILD.includes('newNodes.push({'), 'nodes are still built');
    assert.ok(BUILD.includes('newEdges.push({'), 'edges are still built');
    assert.ok(BUILD.includes('setNodes(newNodes);'), 'nodes are still committed');
    assert.ok(BUILD.includes('setEdges(newEdges);'), 'edges are still committed');
    assert.ok(BUILD.includes('setLoading(false);'), 'loading still clears');
  });

  it('keeps the learner picker unchanged', () => {
    assert.ok(PICKER.includes('htmlFor="combined-graph-learner"'), 'the label still points at the select');
    assert.ok(PICKER.includes('value={selectedLearner}'), 'the select still reads the selected learner');
    assert.ok(PICKER.includes('onChange={(e) => setSelectedLearner(e.target.value)}'), 'the change handler stays');
    assert.ok(PICKER.includes('<option value="">Choose a learner...</option>'), 'the placeholder option stays');
  });

  it('keeps the three View Toggles aria-pressed without aria-busy', () => {
    assert.equal(count(TOGGLES, /aria-pressed=\{showDomains\}/g), 1, 'the Domains toggle stays');
    assert.equal(count(TOGGLES, /aria-pressed=\{showConcepts\}/g), 1, 'the Concepts toggle stays');
    assert.equal(count(TOGGLES, /aria-pressed=\{showBridges\}/g), 1, 'the Bridges toggle stays');
    assert.equal(count(page, /aria-pressed=/g), 3, 'exactly the three toggles are pressed-buttons');
    assert.equal(TOGGLES.includes('aria-busy'), false, 'the toggles are not marked busy');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(page, /aria-label=/g), 0);
    assert.equal(count(page, /aria-labelledby=/g), 0);
    assert.equal(count(page, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Refreshing the combined graph'), false, `${file} gained the status copy`);
      assert.equal(other.includes('combined-graph-refresh-busy'), false, `${file} gained busy wiring`);
    }
  });
});
