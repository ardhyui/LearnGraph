/**
 * Reloading recommendations is announced and can be triggered by hand
 * (/recommendations).
 *
 * The page only loaded through the effect that runs when the selected learner
 * changes: a learner who finished a review or quiz in another tab had to switch
 * learners or reload the whole page, and nothing announced that recommendations
 * were being recomputed. The same pattern is already used on `/sign-in`,
 * `/forgot-password`, `/reset-password`, the `/learn` self-report and concept
 * quiz, `DeleteAccount`, both **Ask an AI tutor** buttons, the snooze buttons,
 * **Create a read-only key**, **Save subjects**, the `/japanese` buttons,
 * **Start learning**, **Draft 4 questions**, **Draft with Claude** and **Save
 * what I kept**, **Save item**, **Save question**, the admin Psychometrics
 * buttons, **Refresh** on `/gaps`, `/graph`, `/combined-graph`, `/progress`,
 * the profile save buttons, and **Refresh study plan** on the Today card.
 *
 * This file locks one Refresh button in the learner picker card that calls the
 * existing `computeZPD`, a single `sr-only` polite `role="status"` line as the
 * last child of that card, the untouched picker, loading line, search box and
 * tab list, and that no server function, RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'recommendations.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The learner picker card, from its `motion.div` to its closing tag. */
const cardClassStart = page.indexOf('className="glass-card p-5 mb-6"');
assert.ok(cardClassStart > 0, 'the learner picker card is rendered');
const cardStart = page.lastIndexOf('<motion.div', cardClassStart);
assert.ok(cardStart > 0, 'the picker card wrapper is present');
const statusStart = page.indexOf('<p role="status" aria-live="polite"', cardStart);
assert.ok(statusStart > cardStart, 'the refresh status line is present');
const statusEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
const cardEnd = page.indexOf('</motion.div>', statusEnd) + '</motion.div>'.length;
const CARD = page.slice(cardStart, cardEnd);

/** The Refresh button inside the card. */
const buttonStart = page.indexOf('<button', cardStart);
assert.ok(buttonStart > cardStart && buttonStart < statusStart, 'the Refresh button is rendered');
const buttonEnd = page.indexOf('</button>', buttonStart) + '</button>'.length;
const REFRESH = page.slice(buttonStart, buttonEnd);

/** The one existing load: the effect that calls `computeZPD`. */
const effectStart = page.indexOf('useEffect(() => {');
assert.ok(effectStart > 0, 'the recommendation effect is present');
const effectEnd =
  page.indexOf('}, [isReady, selectedLearner, computeZPD]);', effectStart) +
  '}, [isReady, selectedLearner, computeZPD]);'.length;
assert.ok(effectEnd > effectStart, 'the recommendation effect keeps its dependency list');
const EFFECT = page.slice(effectStart, effectEnd);

describe('/recommendations: the Refresh button recomputes and announces its busy state', () => {
  it('adds type, the recompute handler, disabled and aria-busy in order', () => {
    assert.ok(REFRESH.includes('type="button"'), 'the button is explicitly a button');
    assert.ok(
      REFRESH.includes('onClick={() => void computeZPD()}'),
      'the handler reuses the existing computeZPD call',
    );
    assert.ok(
      REFRESH.includes('disabled={loading || !selectedLearner}'),
      'disabled follows loading and the selected learner',
    );
    assert.ok(REFRESH.includes('aria-busy={loading}'), 'aria-busy is driven by loading');
    const click = REFRESH.indexOf('onClick={() => void computeZPD()}');
    const disabled = REFRESH.indexOf('disabled={loading || !selectedLearner}');
    const busy = REFRESH.indexOf('aria-busy={loading}');
    assert.ok(click < disabled && disabled < busy, 'the order is click, disabled, aria-busy');
    assert.equal(count(page, /aria-busy=/g), 1, 'exactly one aria-busy attribute on the page');
  });

  it('keeps the classes, icon and label untouched', () => {
    assert.ok(
      REFRESH.includes('className="btn btn-secondary inline-flex items-center gap-2"'),
      'the button classes stay',
    );
    assert.ok(
      REFRESH.includes(
        "<RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden=\"true\" />",
      ),
      'the decorative spinner keeps its size and loading class and is hidden',
    );
    assert.equal(count(REFRESH, />\s*Refresh\s*</g), 1, 'the Refresh label stays once in the button');
  });
});

describe('/recommendations: the existing recompute flow stays the only loader', () => {
  it('imports RefreshCw once', () => {
    assert.equal(count(page, /\bRefreshCw\b/g), 2, 'the icon is imported and used once');
    assert.ok(page.includes('  RefreshCw,\n} from'), 'RefreshCw joins the existing lucide import');
  });

  it('keeps the computeZPD effect unchanged', () => {
    assert.ok(EFFECT.includes('if (isReady && selectedLearner) {'), 'the readiness guard stays');
    assert.ok(EFFECT.includes('computeZPD();'), 'the effect still calls computeZPD');
    assert.equal(count(page, /}, \[isReady, selectedLearner, computeZPD\]\);/g), 1, 'the deps stay');
  });

  it('keeps the recompute guard, request sequence and state writes unchanged', () => {
    const computeStart = page.indexOf('const computeZPD = useCallback(async () => {');
    assert.ok(computeStart > 0, 'computeZPD is declared');
    const computeEnd = page.indexOf('}, [db, isReady, selectedLearner]);', computeStart);
    assert.ok(computeEnd > computeStart, 'computeZPD keeps its dependencies');
    const COMPUTE = page.slice(computeStart, computeEnd);
    assert.ok(
      COMPUTE.includes('if (!db || !isReady || !selectedLearner) return;'),
      'the empty-learner guard stays',
    );
    assert.ok(COMPUTE.includes('const seq = ++requestSeq.current;'), 'the request sequence stays');
    assert.ok(COMPUTE.includes('setLoading(true);'), 'loading still starts');
    assert.ok(COMPUTE.includes('setError(null);'), 'the previous error is still cleared');
    assert.ok(
      COMPUTE.includes('db.computeZPD(selectedLearner, { limit: 10 })'),
      'the same ZPD call is reused',
    );
    assert.ok(
      COMPUTE.includes('if (seq !== requestSeq.current) return;'),
      'stale requests still bail out',
    );
    assert.ok(
      COMPUTE.includes('if (seq === requestSeq.current) setLoading(false);'),
      'loading still clears in finally',
    );
  });
});

describe('/recommendations: one polite status line announces the reload', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      CARD.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the refresh line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(page, /role="status"/g), 2, 'the loading line and the refresh line only');
    assert.equal(count(page, /role="alert"/g), 0, 'no error alert is added');
  });

  it('says recommendations are refreshing and clears when idle', () => {
    assert.ok(
      CARD.includes("{loading ? 'Refreshing your recommendations…' : ''}"),
      'the status text follows loading before clearing',
    );
    assert.equal(count(page, /Refreshing your recommendations…/g), 1, 'the refresh copy appears once');
  });

  it('sits after the button as the last child of the picker card', () => {
    assert.ok(statusStart > buttonEnd, 'the line follows the Refresh button');
    assert.equal(
      CARD.slice(statusEnd - cardStart).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the card',
    );
  });
});

describe('/recommendations: the picker, the loading line and the page stay intact', () => {
  it('keeps the learner picker unchanged', () => {
    assert.ok(CARD.includes('htmlFor={learnerSelectId}'), 'the label still points at the select');
    assert.ok(CARD.includes('value={selectedLearner}'), 'the select still reads the selected learner');
    assert.ok(
      CARD.includes('onChange={(e) => setSelectedLearner(e.target.value)}'),
      'the change handler stays',
    );
    assert.ok(CARD.includes('Learner'), 'the label copy stays');
  });

  it('keeps the loading line and the search box unchanged', () => {
    assert.ok(
      page.includes('<p className="text-muted-foreground" role="status">'),
      'the loading line keeps its bare status role without politeness',
    );
    assert.ok(page.includes('Finding what you’re ready to learn…'), 'the loading copy stays');
    assert.ok(
      page.includes(
        '<ConceptSearch key={`search-${selectedLearner}`} concepts={searchConcepts} />',
      ),
      'the concept search box stays',
    );
  });

  it('keeps the recommendation tab list unchanged', () => {
    assert.ok(page.includes('aria-label="Recommendation views"'), 'the tab list label stays');
    assert.ok(page.includes('handleTabKeyDown'), 'the keyboard handler stays');
    assert.ok(page.includes('tabRefs'), 'the tab refs stay');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(page, /aria-label=/g), 3, 'the three list labels stay');
    assert.equal(count(page, /aria-labelledby=/g), 6, 'the six section labels stay');
    assert.equal(count(page, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Refreshing your recommendations'), false, `${file} gained the status copy`);
      assert.equal(other.includes('recommendations-refresh-busy'), false, `${file} gained busy wiring`);
    }
  });
});
