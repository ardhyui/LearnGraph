/**
 * Rebuilding the domain graph is announced (/domains).
 *
 * The Refresh button in the controls card had no `type`, no `disabled` and no
 * `aria-busy`: while the graph was being rebuilt its icon spun, but there was
 * no live region, so a screen reader could not tell a rebuild was running, the
 * button looked idle, and a double click could start two overlapping builds
 * (the handler only sets `loading`). The same pattern is already used on
 * `/sign-in`, `/forgot-password`, `/reset-password`, the `/learn` self-report
 * and concept quiz, `DeleteAccount`, both **Ask an AI tutor** buttons, the
 * snooze buttons, **Create a read-only key**, **Save subjects**, the
 * `/japanese` buttons, **Start learning**, the admin save buttons, **Refresh**
 * on `/gaps`, `/graph`, `/combined-graph`, `/progress`, `/recommendations` and
 * `/status`, and **Refresh study plan** on the Today card.
 *
 * This file locks one `type="button"` + `disabled={loading}` +
 * `aria-busy={loading}` right after `onClick={buildGraph}`, a single `sr-only`
 * polite `role="status"` line that is the last child of the controls row, the
 * untouched classes/icon/label, the existing build flow and learner picker,
 * and that no server function, RPC schema or migration was added.
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

/** The first `motion.button` on the page: the Refresh action. */
const buttonStart = page.indexOf('<motion.button');
assert.ok(buttonStart > 0, 'the Refresh button is rendered');
const buttonEnd = page.indexOf('</motion.button>', buttonStart) + '</motion.button>'.length;
const REFRESH = page.slice(buttonStart, buttonEnd);

/** Both toggle buttons, Correlations and Subscales. */
const correlationsStart = page.indexOf('<motion.button', buttonEnd);
const subscalesStart = page.indexOf('<motion.button', page.indexOf('</motion.button>', correlationsStart));
const subscalesEnd = page.indexOf('</motion.button>', subscalesStart) + '</motion.button>'.length;
const CORRELATIONS = page.slice(correlationsStart, page.indexOf('</motion.button>', correlationsStart) + '</motion.button>'.length);
const SUBSCALES = page.slice(subscalesStart, subscalesEnd);

/** The controls row, from its flex wrapper to its closing `</div>`. */
const rowStart = page.indexOf('<div className="flex flex-wrap items-center gap-4">');
assert.ok(rowStart > 0, 'the controls row is rendered');
const statusStart = page.indexOf('<p role="status"', rowStart);
assert.ok(statusStart > rowStart, 'the status line is inside the controls row');
const statusEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
const rowEnd = page.indexOf('</div>', statusEnd) + '</div>'.length;
const row = page.slice(rowStart, rowEnd);
assert.ok(row.includes('Refresh') && row.includes('Overlay scores:'), 'the row holds the button and the picker');

/** `buildGraph`, from its declaration to the effect that calls it. */
const buildStart = page.indexOf('const buildGraph = useCallback(');
const effectStart = page.indexOf('useEffect(() => {', buildStart);
assert.ok(buildStart > 0 && effectStart > buildStart, 'the build flow is present');
const BUILD = page.slice(buildStart, effectStart);

/** The learner picker, from its wrapper to its closing `</div>`. */
const pickerStart = page.indexOf('<div className="flex items-center gap-3 flex-1">');
const pickerEnd = page.indexOf('</div>', page.indexOf('</select>', pickerStart)) + '</div>'.length;
const PICKER = page.slice(pickerStart, pickerEnd);

describe('/domains: the Refresh button announces its busy state', () => {
  it('adds type, disabled={loading} and aria-busy={loading} after the handler', () => {
    assert.ok(REFRESH.includes('onClick={buildGraph}'), 'the handler stays');
    assert.ok(REFRESH.includes('type="button"'), 'the button is explicitly a button');
    assert.ok(REFRESH.includes('disabled={loading}'), 'disabled is driven by loading');
    assert.ok(REFRESH.includes('aria-busy={loading}'), 'aria-busy is driven by loading');
    const click = REFRESH.indexOf('onClick={buildGraph}');
    const type = REFRESH.indexOf('type="button"');
    const disabled = REFRESH.indexOf('disabled={loading}');
    const busy = REFRESH.indexOf('aria-busy={loading}');
    assert.ok(click < type && type < disabled && disabled < busy, 'the order is click, type, disabled, aria-busy');
    assert.equal(count(page, /aria-busy=/g), 1, 'exactly one aria-busy attribute on the page');
  });

  it('keeps motion props, classes, icon and label untouched', () => {
    assert.ok(REFRESH.includes('whileHover={{ scale: 1.02 }}'), 'the hover animation stays');
    assert.ok(REFRESH.includes('whileTap={{ scale: 0.98 }}'), 'the tap animation stays');
    assert.ok(
      REFRESH.includes(
        'className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/25 hover:shadow-xl transition-all"',
      ),
      'the button classes stay',
    );
    assert.ok(
      REFRESH.includes("<RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden=\"true\" />"),
      'the decorative spinner keeps its size and loading class and is hidden',
    );
    assert.equal(count(REFRESH, />\s*Refresh\s*</g), 1, 'the Refresh label stays once in the button');
  });

  it('keeps both toggles as pressed buttons without a busy state', () => {
    assert.equal(count(page, /aria-pressed=/g), 2, 'Correlations and Subscales stay pressed toggles');
    assert.ok(CORRELATIONS.includes('aria-pressed={showCorrelations}'), 'Correlations keeps aria-pressed');
    assert.ok(SUBSCALES.includes('aria-pressed={showSubscales}'), 'Subscales keeps aria-pressed');
    assert.ok(!CORRELATIONS.includes('aria-busy'), 'Correlations gains no busy state');
    assert.ok(!SUBSCALES.includes('aria-busy'), 'Subscales gains no busy state');
    assert.ok(!CORRELATIONS.includes('disabled='), 'Correlations stays clickable');
    assert.ok(!SUBSCALES.includes('disabled='), 'Subscales stays clickable');
  });
});

describe('/domains: one polite status line announces the rebuild', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      row.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the progress line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(page, /role="status"/g), 1, 'one status line on the page');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert role added');
    assert.equal(count(page, /className="sr-only"/g), 1, 'one sr-only class on the page');
  });

  it('says the domain graph is refreshing and clears when idle', () => {
    assert.ok(
      row.includes("{loading ? 'Refreshing the domain graph…' : ''}"),
      'the status text follows loading before clearing',
    );
    assert.equal(count(page, /Refreshing the domain graph…/g), 1, 'the refresh copy appears once');
  });

  it('sits after the picker as the last child of the controls row', () => {
    const lineStart = row.indexOf('<p role="status" aria-live="polite"');
    assert.ok(lineStart > 0, 'the progress line is present');
    const pickerClose = row.indexOf('</div>', row.indexOf('</select>'));
    assert.ok(pickerClose > 0 && lineStart > pickerClose, 'the line follows the picker');
    const lineEnd = row.indexOf('</p>', lineStart) + '</p>'.length;
    assert.equal(
      row.slice(lineEnd).replace(/\s*\n\s*/g, ''),
      '</div>',
      'the line is the last child of the row',
    );
    assert.ok(lineStart > row.indexOf('Subscales'), 'the line follows the Subscales toggle');
  });
});

describe('/domains: the build flow and learner picker stay intact', () => {
  it('keeps the build flow unchanged', () => {
    assert.ok(BUILD.includes('setLoading(true);'), 'loading still starts');
    assert.ok(BUILD.includes('setNodes(newNodes);'), 'the new nodes are still applied');
    assert.ok(BUILD.includes('setEdges(newEdges);'), 'the new edges are still applied');
    assert.ok(BUILD.includes('setLoading(false);'), 'loading still clears');
    assert.ok(
      BUILD.includes('}, [showCorrelations, showSubscales, learnerScores, setNodes, setEdges]);'),
      'the callback dependencies stay',
    );
    assert.ok(page.includes('useEffect(() => {\n    buildGraph();\n  }, [buildGraph]);'), 'the rebuild effect stays');
  });

  it('keeps the learner picker unchanged', () => {
    assert.ok(PICKER.includes('htmlFor="domains-overlay-learner"'), 'the label still points at the select');
    assert.ok(PICKER.includes('value={selectedLearner}'), 'the select still reads the selected learner');
    assert.ok(PICKER.includes('onChange={(e) => setSelectedLearner(e.target.value)}'), 'the change handler stays');
    assert.ok(PICKER.includes('<option value="">No overlay</option>'), 'the raw graph option stays');
    assert.ok(page.includes('fetchLearnerScores(selectedLearner);'), 'the score fetch stays');
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
      assert.equal(other.includes('Refreshing the domain graph'), false, `${file} gained the status copy`);
      assert.equal(other.includes('domains-refresh-busy'), false, `${file} gained busy wiring`);
    }
  });
});
