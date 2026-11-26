/**
 * Reloading the system status is announced and can be triggered by hand
 * (/status).
 *
 * The **Refresh** button only faded out and spun its icon while `loading`; a
 * screen reader had no idea the status was being reloaded. The same
 * `aria-busy` + `sr-only` polite `role="status"` pattern is already used on
 * `/sign-in`, `/forgot-password`, `/reset-password`, the `/learn` self-report
 * and concept quiz, `DeleteAccount`, both **Ask an AI tutor** buttons, the
 * snooze buttons, **Create a read-only key**, **Save subjects**, the
 * `/japanese` buttons, **Start learning**, the admin buttons, and
 * **Refresh** on `/gaps`, `/graph`, `/combined-graph`, `/progress` and
 * `/recommendations`.
 *
 * This file locks the one Refresh button in the page header that reuses the
 * existing `fetchStatus`, the single `sr-only` polite `role="status"` line as
 * the last child of that header, the untouched loader, error block, cards,
 * auto-refresh interval and 30-second timer, and that no server function, RPC
 * schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'status.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The page header, from its `motion.div` to its closing tag. */
const headerClass = page.indexOf('className="mb-8"');
assert.ok(headerClass > 0, 'the page header is rendered');
const headerStart = page.lastIndexOf('<motion.div', headerClass);
assert.ok(headerStart > 0, 'the header wrapper is present');
const statusStart = page.indexOf('<p role="status" aria-live="polite"', headerStart);
assert.ok(statusStart > headerStart, 'the refresh status line is present');
const statusEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
const headerEnd = page.indexOf('</motion.div>', statusEnd) + '</motion.div>'.length;
const HEADER = page.slice(headerStart, headerEnd);

/** The Refresh button inside the header. */
const buttonStart = page.indexOf('<button', headerStart);
assert.ok(buttonStart > headerStart && buttonStart < statusStart, 'the Refresh button is rendered');
const buttonEnd = page.indexOf('</button>', buttonStart) + '</button>'.length;
const REFRESH = page.slice(buttonStart, buttonEnd);

/** The existing reload helper. */
const fetchStart = page.indexOf('const fetchStatus = useCallback(async () => {');
assert.ok(fetchStart > 0, 'fetchStatus is declared');
const fetchEnd =
  page.indexOf('}, [refreshStats, buildStatusData]);', fetchStart) +
  '}, [refreshStats, buildStatusData]);'.length;
assert.ok(fetchEnd > fetchStart, 'fetchStatus keeps its dependency list');
const FETCH = page.slice(fetchStart, fetchEnd);

/** The existing status builder behind it. */
const buildStart = page.indexOf('const buildStatusData = useCallback(async () => {');
assert.ok(buildStart > 0, 'buildStatusData is declared');
const buildEnd =
  page.indexOf('}, [db, isReady, stats]);', buildStart) + '}, [db, isReady, stats]);'.length;
assert.ok(buildEnd > buildStart, 'buildStatusData keeps its dependency list');
const BUILD = page.slice(buildStart, buildEnd);

describe('/status: the Refresh button reloads and announces its busy state', () => {
  it('adds type, disabled and aria-busy in order', () => {
    assert.ok(REFRESH.includes('type="button"'), 'the button is explicitly a button');
    assert.ok(REFRESH.includes('onClick={fetchStatus}'), 'the handler reuses the existing fetchStatus');
    assert.ok(REFRESH.includes('disabled={loading}'), 'disabled follows loading');
    assert.ok(REFRESH.includes('aria-busy={loading}'), 'aria-busy is driven by loading');
    const click = REFRESH.indexOf('onClick={fetchStatus}');
    const disabled = REFRESH.indexOf('disabled={loading}');
    const busy = REFRESH.indexOf('aria-busy={loading}');
    assert.ok(click < disabled && disabled < busy, 'the order is click, disabled, aria-busy');
    assert.equal(count(page, /aria-busy=/g), 1, 'exactly one aria-busy attribute on the page');
  });

  it('keeps the classes, icon and label untouched', () => {
    assert.ok(
      REFRESH.includes(
        'className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"',
      ),
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

describe('/status: the existing reload flow stays the only loader', () => {
  it('reuses refreshStats and buildStatusData in the same order', () => {
    assert.ok(FETCH.includes('await refreshStats();'), 'stats are refreshed');
    assert.ok(FETCH.includes('await buildStatusData();'), 'the status data is rebuilt');
    assert.ok(
      FETCH.indexOf('await refreshStats();') < FETCH.indexOf('await buildStatusData();'),
      'stats are refreshed before the status is rebuilt',
    );
  });

  it('keeps the builder guard, state writes and finally unchanged', () => {
    assert.ok(
      BUILD.includes('if (!db || !isReady || !stats) return;'),
      'the not-ready guard stays',
    );
    assert.ok(BUILD.includes('setLoading(true);'), 'loading still starts');
    assert.ok(BUILD.includes('setError(null);'), 'the previous error is still cleared');
    assert.ok(BUILD.includes('setStatusData(data);'), 'the same data is stored');
    assert.ok(BUILD.includes('setLastRefresh(new Date());'), 'the refresh time is stored');
    assert.ok(BUILD.includes('setLoading(false);'), 'loading still clears in finally');
  });

  it('keeps the 30-second auto-refresh', () => {
    assert.equal(count(page, /setInterval\(fetchStatus, 30000\)/g), 1, 'one interval remains');
    assert.ok(
      page.includes('const interval = setInterval(fetchStatus, 30000);'),
      'the interval still calls fetchStatus',
    );
  });
});

describe('/status: one polite status line announces the reload', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      HEADER.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the refresh line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(page, /role="status"/g), 1, 'the refresh line is the only status role');
    assert.equal(count(page, /role="alert"/g), 0, 'no error alert is added');
  });

  it('says the system status is refreshing and clears when idle', () => {
    assert.ok(
      HEADER.includes("{loading ? 'Refreshing the system status…' : ''}"),
      'the status text follows loading before clearing',
    );
    assert.equal(count(page, /Refreshing the system status…/g), 1, 'the refresh copy appears once');
  });

  it('sits after the header row as the last child of the header', () => {
    assert.ok(statusStart > buttonEnd, 'the line follows the header row');
    assert.equal(
      HEADER.slice(statusEnd - headerStart).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the header',
    );
  });
});

describe('/status: the loader, error block and cards stay intact', () => {
  it('keeps the first-load loader and the error block', () => {
    assert.ok(page.includes('{loading && !statusData && ('), 'the first-load branch stays');
    assert.ok(
      page.includes(
        '<Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />',
      ),
      'the loader icon stays',
    );
    assert.ok(page.includes('Error fetching status'), 'the error copy stays');
    assert.ok(page.includes('Database error: {dbError.message}'), 'the database error stays');
  });

  it('keeps the overall banner and the four data cards', () => {
    for (const label of ['Concepts', 'Prerequisites', 'Learners', 'Knowledge States']) {
      assert.equal(count(page, new RegExp(`label="${label}"`, 'g')), 1, `${label} stays once`);
    }
    assert.ok(page.includes('All Systems Operational'), 'the healthy banner stays');
    assert.ok(page.includes('Last checked: {lastRefresh.toLocaleTimeString()}'), 'the timestamp stays');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(page, /aria-label=/g), 0, 'no list labels are added');
    assert.equal(count(page, /aria-labelledby=/g), 0, 'no section labels are added');
    assert.equal(count(page, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Refreshing the system status'), false, `${file} gained the status copy`);
      assert.equal(other.includes('system-status-refresh-busy'), false, `${file} gained busy wiring`);
    }
  });
});
