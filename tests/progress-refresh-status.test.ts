/**
 * Reloading progress is announced and can be triggered by hand (/progress).
 *
 * The page only loaded through the effect that runs when the selected learner
 * changes: a learner who finished a review or quiz in another tab had to switch
 * learners or reload the whole page, and nothing announced that progress was
 * being reloaded. The same pattern is already used on `/sign-in`,
 * `/forgot-password`, `/reset-password`, the `/learn` self-report and concept
 * quiz, `DeleteAccount`, both **Ask an AI tutor** buttons, the snooze buttons,
 * **Create a read-only key**, **Save subjects**, the `/japanese` buttons,
 * **Start learning**, **Draft 4 questions**, **Draft with Claude** and **Save
 * what I kept**, **Save item**, **Save question**, the admin Psychometrics
 * buttons, **Refresh** on `/gaps`, `/graph`, `/combined-graph`, the profile save
 * buttons, and **Refresh study plan** on the Today card.
 *
 * This file locks one Refresh button in the learner picker card, a bumped
 * `refreshKey` that re-runs the one existing effect, a single `sr-only` polite
 * `role="status"` line as the last child of that card, the untouched picker,
 * loading line and `getLearnerProgress` flow, and that no server function, RPC
 * schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'progress.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The learner picker card, from its wrapper to its closing `</div>`. */
const cardStart = page.indexOf('<div className="glass-card p-5 mb-6">');
assert.ok(cardStart > 0, 'the learner picker card is rendered');
const statusStart = page.indexOf('<p role="status" aria-live="polite"', cardStart);
assert.ok(statusStart > cardStart, 'the refresh status line is present');
const statusEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
const cardEnd = page.indexOf('</div>', statusEnd) + '</div>'.length;
const CARD = page.slice(cardStart, cardEnd);

/** The Refresh button inside the card. */
const buttonStart = page.indexOf('<button', cardStart);
assert.ok(buttonStart > cardStart && buttonStart < statusStart, 'the Refresh button is rendered');
const buttonEnd = page.indexOf('</button>', buttonStart) + '</button>'.length;
const REFRESH = page.slice(buttonStart, buttonEnd);

/** The single progress-loading effect, from its declaration to its deps. */
const seqStart = page.indexOf('const seq = ++requestSeq.current;');
assert.ok(seqStart > 0, 'the progress load is present');
const effectStart = page.lastIndexOf('useEffect(() => {', seqStart);
assert.ok(effectStart > 0, 'the progress effect is present');
const effectEnd = page.indexOf('}, [selectedLearnerId, refreshKey]);', seqStart);
assert.ok(effectEnd > effectStart, 'the progress effect keeps its dependency list');
const EFFECT = page.slice(effectStart, effectEnd);

describe('/progress: the Refresh button reloads and announces its busy state', () => {
  it('adds type, the refresh handler, disabled and aria-busy in order', () => {
    assert.ok(REFRESH.includes('type="button"'), 'the button is explicitly a button');
    assert.ok(
      REFRESH.includes('onClick={() => setRefreshKey((n) => n + 1)}'),
      'the handler bumps the refresh key',
    );
    assert.ok(
      REFRESH.includes('disabled={loading || !selectedLearnerId}'),
      'disabled follows loading and the selected learner',
    );
    assert.ok(REFRESH.includes('aria-busy={loading}'), 'aria-busy is driven by loading');
    const click = REFRESH.indexOf('onClick={() => setRefreshKey((n) => n + 1)}');
    const disabled = REFRESH.indexOf('disabled={loading || !selectedLearnerId}');
    const busy = REFRESH.indexOf('aria-busy={loading}');
    assert.ok(click < disabled && disabled < busy, 'the order is click, disabled, aria-busy');
    assert.equal(count(page, /aria-busy=/g), 1, 'exactly one aria-busy attribute on the page');
  });

  it('keeps the classes, icon and label untouched', () => {
    assert.ok(
      REFRESH.includes('className="btn btn-secondary inline-flex items-center gap-2 mt-3"'),
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

describe('/progress: one refresh key drives the one existing effect', () => {
  it('declares refreshKey after requestSeq', () => {
    const requestSeq = page.indexOf('const requestSeq = useRef(0);');
    const refreshKey = page.indexOf('const [refreshKey, setRefreshKey] = useState(0);');
    assert.ok(requestSeq > 0, 'the request sequence stays');
    assert.ok(refreshKey > requestSeq, 'refreshKey is declared after requestSeq');
    assert.equal(count(page, /const \[refreshKey, setRefreshKey\]/g), 1, 'one refresh key');
  });

  it('depends on the selected learner and the refresh key only', () => {
    assert.equal(
      count(page, /\}, \[selectedLearnerId, refreshKey\]\);/g),
      1,
      'the effect depends on the learner and the refresh key',
    );
    assert.equal(
      count(page, /\}, \[selectedLearnerId\]\);/g),
      0,
      'the old learner-only dependency list is gone',
    );
  });

  it('keeps the loading flow unchanged', () => {
    assert.ok(EFFECT.includes('if (!selectedLearnerId) {'), 'the empty-learner guard stays');
    assert.ok(EFFECT.includes('const seq = ++requestSeq.current;'), 'the request sequence stays');
    assert.ok(EFFECT.includes('setData(null);'), 'stale data is still cleared');
    assert.ok(EFFECT.includes('setLoading(true);'), 'loading still starts');
    assert.ok(EFFECT.includes('setError(null);'), 'the previous error is still cleared');
    assert.ok(
      EFFECT.includes('getLearnerProgress({ data: { learnerId: selectedLearnerId } })'),
      'the same server function is reused',
    );
    assert.ok(EFFECT.includes('if (seq === requestSeq.current) setData(result);'), 'the latest request still wins');
    assert.ok(EFFECT.includes('if (seq === requestSeq.current) setLoading(false);'), 'loading still clears in finally');
  });
});

describe('/progress: one polite status line announces the reload', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      CARD.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the refresh line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(page, /role="status"/g), 2, 'the loading line and the refresh line only');
    assert.equal(count(page, /role="alert"/g), 1, 'the error alert stays');
  });

  it('says progress is refreshing and clears when idle', () => {
    assert.ok(
      CARD.includes("{loading ? 'Refreshing your progress…' : ''}"),
      'the status text follows loading before clearing',
    );
    assert.equal(count(page, /Refreshing your progress…/g), 1, 'the refresh copy appears once');
  });

  it('sits after the button as the last child of the picker card', () => {
    assert.ok(statusStart > buttonEnd, 'the line follows the Refresh button');
    assert.equal(
      CARD.slice(statusEnd - cardStart).replace(/\s*\n\s*/g, ''),
      '</div>',
      'the line is the last child of the card',
    );
  });
});

describe('/progress: the picker, the loading line and the page stay intact', () => {
  it('keeps the learner picker unchanged', () => {
    assert.ok(CARD.includes('htmlFor={learnerSelectId}'), 'the label still points at the select');
    assert.ok(CARD.includes('value={selectedLearnerId}'), 'the select still reads the selected learner');
    assert.ok(
      CARD.includes('if (e.target.value) setSelectedLearnerId(e.target.value);'),
      'the change handler stays',
    );
    assert.ok(CARD.includes('Learner'), 'the label copy stays');
  });

  it('keeps the loading line and the progress call unchanged', () => {
    assert.ok(
      page.includes('<p role="status" className="text-muted-foreground">'),
      'the loading line keeps its bare status role without politeness',
    );
    assert.ok(page.includes('Loading your progress…'), 'the loading copy stays');
    assert.ok(
      page.includes("import { getLearnerProgress } from '@/server/evidence.functions';"),
      'the existing server function import stays',
    );
    assert.equal(count(page, /getLearnerProgress\(/g), 1, 'one progress call remains');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(page, /aria-label=/g), 2, 'the two list labels stay');
    assert.equal(count(page, /aria-labelledby=/g), 4, 'the four section labels stay');
    assert.equal(count(page, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Refreshing your progress'), false, `${file} gained the status copy`);
      assert.equal(other.includes('progress-refresh-busy'), false, `${file} gained busy wiring`);
    }
  });
});
