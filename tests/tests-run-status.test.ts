/**
 * Running every functional test is announced and marked busy (`/tests`).
 *
 * The **Run All Tests** button only dimmed and changed its label while the
 * suite ran, and the page had no live region at all, so a screen reader never
 * learned that a long-running sequence had started. The same button + status
 * pattern is already used on `/sign-in`, `/forgot-password`,
 * `/reset-password`, the `/learn` self-report and concept quiz, `DeleteAccount`,
 * both **Ask an AI tutor** buttons, the snooze buttons, **Create a read-only
 * key**, **Save subjects**, the `/japanese` buttons, **Start learning**,
 * **Draft 4 questions**, **Draft with Claude** and **Save what I kept**,
 * **Save item**, **Save question**, the admin Psychometrics buttons, **Refresh**
 * on `/gaps`, `/graph`, `/combined-graph`, `/progress`, `/recommendations` and
 * `/status`, the profile save buttons, and **Refresh study plan** on the Today
 * card.
 *
 * This file locks `aria-busy` on the existing button, one `sr-only` polite
 * `role="status"` line as the last child of the button wrapper, and that the
 * run flow, the status helpers, the group toggles and the summary stay
 * untouched without a server function, RPC schema or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'tests.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The wrapper around the run button, from its `motion.div` to its closing tag. */
const wrapperClassStart = page.indexOf('className="mb-6"');
assert.ok(wrapperClassStart > 0, 'the run button wrapper is rendered');
const wrapperStart = page.lastIndexOf('<motion.div', wrapperClassStart);
assert.ok(wrapperStart > 0, 'the wrapper motion.div is present');
const statusStart = page.indexOf('<p role="status" aria-live="polite"', wrapperStart);
assert.ok(statusStart > wrapperStart, 'the run status line is present');
const statusEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
const wrapperEnd = page.indexOf('</motion.div>', statusEnd) + '</motion.div>'.length;
const WRAPPER = page.slice(wrapperStart, wrapperEnd);

/** The run button inside the wrapper. */
const buttonStart = page.indexOf('<motion.button', wrapperStart);
assert.ok(buttonStart > wrapperStart && buttonStart < statusStart, 'the run button is rendered');
const buttonEnd = page.indexOf('</motion.button>', buttonStart) + '</motion.button>'.length;
const BUTTON = page.slice(buttonStart, buttonEnd);

describe('/tests: the Run All Tests button reports its busy state', () => {
  it('adds aria-busy right after disabled and keeps the handler', () => {
    assert.ok(BUTTON.includes('onClick={runAllTests}'), 'the button still calls runAllTests');
    assert.ok(BUTTON.includes('disabled={isRunning}'), 'disabled is still driven by isRunning');
    assert.ok(BUTTON.includes('aria-busy={isRunning}'), 'aria-busy is driven by isRunning');
    const click = BUTTON.indexOf('onClick={runAllTests}');
    const disabled = BUTTON.indexOf('disabled={isRunning}');
    const busy = BUTTON.indexOf('aria-busy={isRunning}');
    assert.ok(click < disabled && disabled < busy, 'the order is click, disabled, aria-busy');
    assert.equal(count(page, /aria-busy=/g), 1, 'exactly one aria-busy attribute on the page');
  });

  it('keeps the animation, classes, icon and label untouched', () => {
    assert.ok(BUTTON.includes('whileHover={{ scale: 1.02 }}'), 'the hover animation stays');
    assert.ok(BUTTON.includes('whileTap={{ scale: 0.98 }}'), 'the tap animation stays');
    assert.ok(BUTTON.includes('className={cn('), 'the button keeps its composed classes');
    assert.ok(
      BUTTON.includes(
        "'flex items-center gap-2 px-6 py-3 rounded-xl font-medium shadow-lg transition-all',",
      ),
      'the shared classes stay',
    );
    assert.ok(
      BUTTON.includes("? 'bg-muted text-muted-foreground cursor-not-allowed'"),
      'the running classes stay',
    );
    assert.ok(
      BUTTON.includes(
        ": 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/25 hover:shadow-xl hover:shadow-emerald-600/30'",
      ),
      'the idle classes stay',
    );
    assert.ok(
      BUTTON.includes(
        "<Play size={20} className={isRunning ? 'animate-pulse' : ''} aria-hidden=\"true\" />",
      ),
      'the decorative Play icon keeps its size, pulse and hidden state',
    );
    assert.ok(
      BUTTON.includes("{isRunning ? 'Running Tests...' : 'Run All Tests'}"),
      'the visible label still flips between running and idle',
    );
  });
});

describe('/tests: one polite status line announces the run', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      WRAPPER.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the run line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(page, /role="status"/g), 1, 'the run line is the only status role');
    assert.equal(count(page, /role="alert"/g), 0, 'no error alert is added');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby=/g), 0, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic is added');
    assert.equal(
      count(page, /className="sr-only"/g),
      2,
      'the per-row status word and the new run line are the only sr-only nodes',
    );
  });

  it('says tests are running and clears when idle', () => {
    assert.ok(
      WRAPPER.includes("{isRunning ? 'Running your tests…' : ''}"),
      'the status text follows isRunning before clearing',
    );
    assert.equal(count(page, /Running your tests…/g), 1, 'the run copy appears once');
  });

  it('sits after the button as the last child of the wrapper', () => {
    assert.ok(statusStart > buttonEnd, 'the line follows the Run All Tests button');
    assert.equal(
      WRAPPER.slice(statusEnd - wrapperStart).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the wrapper',
    );
  });
});

describe('/tests: the run flow, helpers and summary stay intact', () => {
  it('keeps the run guard, reset and busy clearing', () => {
    const runStart = page.indexOf('async function runAllTests() {');
    assert.ok(runStart > 0, 'runAllTests is declared');
    const runEnd = page.indexOf('function statusLabel', runStart);
    assert.ok(runEnd > runStart, 'runAllTests keeps its body before the helpers');
    const RUN = page.slice(runStart, runEnd);
    assert.ok(RUN.includes('if (!db) {'), 'the missing-database guard stays');
    assert.ok(RUN.includes('setIsRunning(true);'), 'the run still starts busy');
    assert.ok(RUN.includes('setTestGroups(initialTests);'), 'the run still resets the groups');
    assert.ok(RUN.includes('setSummary({ total, passed, failed });'), 'the summary still lands');
    assert.ok(RUN.includes('setIsRunning(false);'), 'the run still clears busy at the end');
  });

  it('keeps the status helpers and the group toggle untouched', () => {
    const helperStart = page.indexOf('function statusLabel');
    const helperEnd = page.indexOf('const getGroupStats', helperStart);
    assert.ok(helperEnd > helperStart, 'the status helpers stay between the run and the stats');
    const HELPERS = page.slice(helperStart, helperEnd);
    assert.ok(HELPERS.includes("return 'Passed';"), 'the passed label stays');
    assert.ok(HELPERS.includes("return 'Failed';"), 'the failed label stays');
    assert.ok(HELPERS.includes("return 'Running';"), 'the running label stays');
    assert.ok(HELPERS.includes("return 'Not run';"), 'the not-run label stays');
    assert.ok(
      HELPERS.includes(
        '<CheckCircle size={16} className="text-emerald-500" aria-hidden="true" />',
      ),
      'the passed icon stays',
    );
    assert.ok(
      HELPERS.includes('<RefreshCw size={16} className="text-blue-500 animate-spin" aria-hidden="true" />'),
      'the running icon stays',
    );
    assert.equal(count(page, /onClick=\{\(\) => toggleGroup\(groupIndex\)\}/g), 1, 'the group toggle stays');
    assert.equal(count(page, /aria-expanded=\{isExpanded\}/g), 1, 'the open state still announces');
  });

  it('keeps the summary labels and the coverage heading', () => {
    for (const label of ['Total Tests', 'Passed', 'Failed']) {
      assert.ok(page.includes(`>${label}</div>`), `the summary still shows ${label}`);
    }
    assert.ok(
      page.includes('<h3 className="font-semibold text-foreground mb-2">Test Coverage</h3>'),
      'the coverage heading stays',
    );
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Running your tests'), false, `${file} gained the status copy`);
      assert.equal(other.includes('tests-run-busy'), false, `${file} gained busy wiring`);
    }
  });
});
