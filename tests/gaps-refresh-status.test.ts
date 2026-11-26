/**
 * Refreshing the gap analysis is announced (/gaps).
 *
 * The Refresh button in the learner-picker card shared the page's `loading`
 * flag with the initial load: while it was true the button only faded
 * (`disabled`), its icon spun, and nothing else happened. There was no
 * `aria-busy` and no live region for the refresh, so a screen reader could not
 * tell that the gaps were being reloaded and the button looked frozen — while
 * the same pattern is already used on `/sign-in`, `/forgot-password`,
 * `/reset-password`, the `/learn` self-report and concept quiz, `DeleteAccount`,
 * both **Ask an AI tutor** buttons, the snooze buttons, **Create a read-only
 * key**, **Save subjects**, the `/japanese` buttons, **Start learning**,
 * **Draft 4 questions**, **Draft with Claude** and **Save what I kept**,
 * **Save item**, **Save question**, and the admin Psychometrics buttons.
 *
 * This file locks one `aria-busy={loading}` right after `disabled={loading}`,
 * a single `sr-only` polite `role="status"` line that is the last child of the
 * learner-picker card, the untouched classes/icon/label and the existing
 * loading flow, and that no server function, RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'gaps.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The only `motion.button` on the page: the Refresh action. */
const buttonStart = page.indexOf('<motion.button');
assert.ok(buttonStart > 0, 'the Refresh button is rendered');
const buttonEnd = page.indexOf('</motion.button>', buttonStart) + '</motion.button>'.length;
const REFRESH = page.slice(buttonStart, buttonEnd);

/** The learner-picker card, from its `<motion.div` to its `</motion.div>`. */
const labelAnchor = page.indexOf('htmlFor={learnerSelectId}');
assert.ok(labelAnchor > 0, 'the learner picker is rendered');
const cardStart = page.lastIndexOf('<motion.div', labelAnchor);
const cardEnd = page.indexOf('</motion.div>', labelAnchor) + '</motion.div>'.length;
const card = page.slice(cardStart, cardEnd);
assert.ok(card.includes('Learner') && card.includes('Refresh'), 'the card holds the picker and the button');

/** `fetchGapData`, from its declaration to the learner-change effect. */
const fetchStart = page.indexOf('const fetchGapData = useCallback(');
const effectStart = page.indexOf('// Load the analysis for the active learner', fetchStart);
assert.ok(fetchStart > 0 && effectStart > fetchStart, 'the fetch flow is present');
const FETCH = page.slice(fetchStart, effectStart);

describe('/gaps: the Refresh button announces its busy state', () => {
  it('adds aria-busy={loading} right after disabled={loading}', () => {
    assert.ok(REFRESH.includes('onClick={() => fetchGapData(selectedLearnerId)}'), 'the handler stays');
    assert.ok(REFRESH.includes('disabled={loading}'), 'disabled stays driven by loading');
    assert.ok(REFRESH.includes('aria-busy={loading}'), 'aria-busy is driven by loading');
    assert.ok(
      REFRESH.indexOf('disabled={loading}') < REFRESH.indexOf('aria-busy={loading}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(page, /aria-busy=/g), 1, 'exactly one aria-busy attribute on the page');
  });

  it('keeps motion props, classes, icon and label untouched', () => {
    assert.ok(REFRESH.includes('whileHover={{ scale: 1.02 }}'), 'the hover animation stays');
    assert.ok(REFRESH.includes('whileTap={{ scale: 0.98 }}'), 'the tap animation stays');
    assert.ok(
      REFRESH.includes('className="btn btn-primary flex items-center gap-2"'),
      'the button classes stay',
    );
    assert.ok(
      REFRESH.includes("<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />"),
      'the spinner stays driven by loading',
    );
    assert.equal(count(REFRESH, />\s*Refresh\s*</g), 1, 'the Refresh label stays once in the button');
  });
});

describe('/gaps: one polite status line announces the refresh', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      card.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the progress line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 2, 'two polite live regions on the page');
    assert.equal(count(page, /role="status"/g), 3, 'three status lines on the page');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert role added');
  });

  it('says the gaps are refreshing and clears when idle', () => {
    assert.ok(
      card.includes("{loading ? 'Refreshing gaps…' : ''}"),
      'the status text follows loading before clearing',
    );
    assert.equal(count(page, /Refreshing gaps…/g), 1, 'the refresh copy appears once');
  });

  it('sits after the picker row as the last child of the card', () => {
    const statusStart = card.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the progress line is present');
    const rowClose = card.lastIndexOf('</div>', statusStart);
    assert.ok(rowClose > 0, 'the picker row closes before the line');
    assert.ok(statusStart > rowClose, 'the line follows the picker row');
    const statusEnd = card.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      card.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the card',
    );
  });
});

describe('/gaps: existing notices and flows stay intact', () => {
  it('keeps the snooze notice and the loading line', () => {
    assert.ok(
      page.includes('role="status"\n                    aria-live="polite"\n                    data-testid="snooze-notice"'),
      'the snooze notice keeps its role and politeness',
    );
    assert.ok(
      page.includes(
        '<p className="mt-4 text-muted-foreground" role="status">Checking what needs attention…</p>',
      ),
      'the loading line keeps a bare status role',
    );
    assert.equal(
      /role="status"\s+aria-live="polite"\s+data-testid="snooze-notice"/.test(page),
      true,
      'the snooze notice stays a polite status',
    );
  });

  it('leaves the per-review button without aria-busy', () => {
    const reviewStart = page.indexOf('aria-label={`Review it now:');
    assert.ok(reviewStart > 0, 'the per-review button is rendered');
    const open = page.lastIndexOf('<button', reviewStart);
    const button = page.slice(open, page.indexOf('</button>', reviewStart));
    assert.ok(button.includes('disabled={!!unsnoozing}'), 'its disabled stays driven by unsnoozing');
    assert.equal(button.includes('aria-busy'), false, 'it gains no aria-busy');
  });

  it('keeps the fetch flow unchanged', () => {
    assert.ok(FETCH.includes('if (!db || !isReady) return;'), 'the guard stays');
    assert.ok(FETCH.includes('const seq = ++requestSeq.current;'), 'the request sequence stays');
    assert.ok(FETCH.includes('if (!quiet) {'), 'the quiet reload stays');
    assert.ok(FETCH.includes('setLoading(true);'), 'loading still starts');
    assert.ok(FETCH.includes('setLoading(false);'), 'loading still clears');
    assert.ok(FETCH.includes('setLoadedFor(userId);'), 'the loaded learner is still tracked');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(page, /aria-label=/g), 4, 'the four existing labels stay');
    assert.equal(count(page, /aria-labelledby=/g), 0);
    assert.equal(count(page, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Refreshing gaps'), false, `${file} gained the status copy`);
      assert.equal(other.includes('gaps-refresh-busy'), false, `${file} gained busy wiring`);
    }
  });
});
