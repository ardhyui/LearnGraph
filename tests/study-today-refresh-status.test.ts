/**
 * Refreshing the study plan from Today is announced (`StudyToday`).
 *
 * The Refresh button in the learner picker shares the panel's `loading` flag
 * with the first load: while it was true the button only faded (`disabled`),
 * its icon spun, and nothing else happened. There was no `aria-busy` and no
 * live region for the refresh, so a screen reader could not tell the plan was
 * being reloaded and the button looked frozen — while the same pattern is
 * already used on `/sign-in`, `/forgot-password`, `/reset-password`, the
 * `/learn` self-report and concept quiz, `DeleteAccount`, both **Ask an AI
 * tutor** buttons, the snooze buttons (including both in this file),
 * **Create a read-only key**, **Save subjects**, the `/japanese` buttons,
 * **Start learning**, the admin buttons, **Refresh** on `/gaps`, the profile
 * assessment saves, and **Save Profile**.
 *
 * This file locks one `aria-busy={loading}` right after `disabled={loading}`
 * on the Refresh button with its type, handler, classes, icon and label
 * untouched, a single `sr-only` polite `role="status"` line that is the last
 * child of the learner-picker row and says "Refreshing your study plan…" while
 * loading and clears when idle, the untouched `load` flow and **Try again** /
 * snooze buttons, and that no server function, RPC schema or migration was
 * added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TODAY_FILE = join(ROOT, 'src', 'components', 'StudyToday.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const today = source(TODAY_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const ROW_OPEN = '<div className="flex items-center gap-2">';

/** The learner-picker row: the only plain flex row with that exact class. */
const rowStart = today.indexOf(ROW_OPEN);
assert.ok(rowStart > 0, 'the learner-picker row is rendered');
const rowEnd = today.indexOf('</div>', rowStart) + '</div>'.length;
const row = today.slice(rowStart, rowEnd);
assert.ok(row.includes('Refresh study plan'), 'the row holds the Refresh button');

/** The Refresh button, found from its accessible name. */
const LABEL = 'aria-label="Refresh study plan"';
const labelIdx = today.indexOf(LABEL);
assert.ok(labelIdx > 0, 'the Refresh button keeps its aria-label');
const buttonOpen = today.lastIndexOf('<button', labelIdx);
const buttonClose = today.indexOf('</button>', labelIdx) + '</button>'.length;
const REFRESH = today.slice(buttonOpen, buttonClose);

/** `load`, from its declaration to the reload effect that calls it. */
const loadStart = today.indexOf('const load = useCallback(async () => {');
const loadEnd = today.indexOf('useEffect(() => {', loadStart);
assert.ok(loadStart > 0 && loadEnd > loadStart, 'the load flow is present');
const LOAD = today.slice(loadStart, loadEnd);

/** The **Try again** button inside the error alert. */
const RETRY_LABEL = 'Try again';
const retryLabelIdx = today.indexOf(RETRY_LABEL);
assert.ok(retryLabelIdx > 0, 'the Try again button is rendered');
const RETRY = today.slice(today.lastIndexOf('<button', retryLabelIdx), today.indexOf('</button>', retryLabelIdx));

describe('StudyToday: the Refresh button announces its busy state', () => {
  it('adds aria-busy={loading} right after disabled={loading}', () => {
    assert.ok(REFRESH.includes('type="button"'), 'the button stays a plain button');
    assert.ok(REFRESH.includes('onClick={() => load()}'), 'the handler stays');
    assert.ok(REFRESH.includes('disabled={loading}'), 'disabled stays driven by loading');
    assert.ok(REFRESH.includes('aria-busy={loading}'), 'aria-busy is driven by loading');
    assert.ok(
      REFRESH.indexOf('disabled={loading}') < REFRESH.indexOf('aria-busy={loading}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(today, /aria-busy=\{loading\}/g), 1, 'one aria-busy={loading}, on the Refresh button only');
    assert.equal(count(today, /aria-busy=/g), 3, 'the two snooze markers plus the Refresh button');
  });

  it('keeps classes, icon, label and handler untouched', () => {
    assert.ok(
      REFRESH.includes(
        'className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"',
      ),
      'the button classes stay',
    );
    assert.ok(REFRESH.includes(LABEL), 'the accessible name stays');
    assert.ok(
      REFRESH.includes("<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden=\"true\" />"),
      'the spinner stays driven by loading and hidden',
    );
  });
});

describe('StudyToday: one polite status line announces the refresh', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      row.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the progress line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(today, /aria-live="polite"/g), 4, 'four polite live regions in the file');
    assert.equal(count(today, /role="status"/g), 5, 'five status lines in the file');
    assert.equal(count(today, /role="alert"/g), 1, 'only the error alert stays');
  });

  it('says the study plan is refreshing and clears when idle', () => {
    assert.ok(
      row.includes("{loading ? 'Refreshing your study plan…' : ''}"),
      'the status text follows loading before clearing',
    );
    assert.equal(count(today, /Refreshing your study plan…/g), 1, 'the refresh copy appears once');
  });

  it('sits after the Refresh button as the last child of the picker row', () => {
    const statusStart = row.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the progress line is present');
    assert.ok(statusStart > row.indexOf('</button>'), 'the line follows the Refresh button');
    const statusEnd = row.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      row.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</div>',
      'the line is the last child of the row',
    );
  });
});

describe('StudyToday: existing notices and flows stay intact', () => {
  it('keeps the result notice and both snooze status lines', () => {
    assert.ok(
      today.includes(
        '<p aria-live="polite" role="status" className={cn(\'text-sm text-emerald-700 dark:text-emerald-400\', (notice || welcome) && \'mt-4\')}>',
      ),
      'the result notice keeps its role and politeness',
    );
    assert.ok(
      today.includes("<p role=\"status\" aria-live=\"polite\" className=\"sr-only\">\n                {busy === UNSNOOZE_BUSY ? 'Bringing your snoozed reviews back…' : ''}\n              </p>"),
      'the summary snooze status stays',
    );
    assert.ok(
      today.includes("{unsnoozingName ? `Bringing “${unsnoozingName}” back…` : ''}"),
      'the per-item snooze status stays',
    );
    assert.ok(
      today.includes("aria-busy={busy === UNSNOOZE_BUSY}") &&
        today.includes("aria-busy={busy === item.conceptId}"),
      'both snooze buttons keep their own busy markers',
    );
  });

  it('leaves the Try again button without aria-busy', () => {
    assert.ok(RETRY.includes('onClick={() => load()}'), 'Try again still reloads the plan');
    assert.equal(RETRY.includes('aria-busy'), false, 'Try again gains no aria-busy');
  });

  it('keeps the load flow unchanged', () => {
    assert.ok(LOAD.includes('if (!db || !isReady || !learnerId) return;'), 'the guard stays');
    assert.ok(LOAD.includes('const seq = ++requestSeq.current;'), 'the request sequence stays');
    assert.ok(LOAD.includes('setLoading(true);'), 'loading still starts');
    assert.ok(LOAD.includes('await Promise.all(['), 'the parallel load stays');
    assert.ok(LOAD.includes('setData({'), 'the panel data is still stored');
    assert.ok(LOAD.includes('if (seq === requestSeq.current) setLoading(false);'), 'loading still clears');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(today, /aria-label=/g), 10, 'the ten existing labels stay');
    assert.equal(count(today, /aria-labelledby=/g), 5, 'the five existing references stay');
    assert.equal(count(today, /aria-atomic=/g), 0, 'no aria-atomic added');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(today), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Refreshing your study plan'), false, `${file} gained the status copy`);
      assert.equal(other.includes('study-plan-refresh-busy'), false, `${file} gained busy wiring`);
    }
  });
});
