/**
 * "Review them now" busy status is announced (Today's snooze summary).
 *
 * The snooze summary offers "Review them now" to end every snooze at once;
 * `unsnoozeAll` sets the busy marker `UNSNOOZE_BUSY` while it saves. During
 * that time the button only faded (`disabled` + `disabled:opacity-50`) and
 * showed an `aria-hidden` spinner: its accessible name stayed "Review them
 * now", there was no `aria-busy`, and no live region spoke, so a screen
 * reader could not tell the snoozed reviews were being brought back to the
 * queue. The per-item "Review it now" buttons (`busy === item.conceptId`)
 * are a candidate for a later session and stay out of scope here.
 *
 * This file locks `aria-busy={busy === UNSNOOZE_BUSY}` next to
 * `disabled={!!busy}` on the summary button with its type, classes, label
 * and spinner untouched, a new `sr-only` polite `role="status"` line between
 * the summary paragraph and the snoozed list that says `Bringing your
 * snoozed reviews back…` while the marker is set and clears when idle, the
 * untouched per-item buttons and unsnooze flows, and that no server
 * function, RPC call or migration was added.
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

/** The whole snooze summary block, from its wrapper to the end of its list. */
const SUMMARY_OPEN = '<div className="mt-2" data-testid="snoozed-summary">';
const summaryStart = today.indexOf(SUMMARY_OPEN);
assert.ok(summaryStart > 0, 'the snooze summary is rendered');
const listClose = today.indexOf('</ul>', summaryStart);
assert.ok(listClose > summaryStart, 'the snoozed list is rendered');
const summary = today.slice(summaryStart, listClose);

/**
 * The opening tag of the summary button, from `<button` up to (and
 * including) its spinner — everything before the visible label.
 */
const THEM_OPEN = today.lastIndexOf('<button', today.indexOf('Review them now'));
assert.ok(THEM_OPEN > summaryStart, 'the Review them now button lives in the snooze summary');
const THEM = today.slice(THEM_OPEN, today.indexOf('Review them now'));

/** One per-item row of the snoozed list, spinner and all. */
const itemStart = summary.indexOf('<li key={item.conceptId}');
assert.ok(itemStart > 0, 'the snoozed rows are rendered');
const item = summary.slice(itemStart, summary.indexOf('</li>', itemStart));

describe('StudyToday: the Review them now button announces it is busy', () => {
  it('adds aria-busy={busy === UNSNOOZE_BUSY} right after disabled={!!busy}', () => {
    assert.ok(THEM.includes('type="button"'), 'the button stays a plain button');
    assert.ok(THEM.includes('onClick={unsnoozeAll}'), 'the button still calls unsnoozeAll');
    assert.ok(THEM.includes('disabled={!!busy}'), 'disabled stays driven by busy');
    assert.ok(THEM.includes('aria-busy={busy === UNSNOOZE_BUSY}'), 'aria-busy is driven by the unsnooze-all marker');
    assert.ok(
      THEM.indexOf('disabled={!!busy}') < THEM.indexOf('aria-busy={busy === UNSNOOZE_BUSY}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(today, /aria-busy=/g), 1, 'one aria-busy, on the Review them now button only');
  });

  it('keeps the Review them now classes, label and spinner untouched', () => {
    assert.ok(
      THEM.includes(
        'className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"',
      ),
      'Review them now classes untouched',
    );
    assert.equal(count(today, /Review them now/g), 1, 'the Review them now label stays once');
    assert.ok(
      THEM.includes('{busy === UNSNOOZE_BUSY && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}'),
      'the existing spinner stays hidden and unchanged',
    );
  });

  it('leaves the per-item Review it now buttons without aria-busy', () => {
    assert.ok(item.includes('type="button"'), 'the per-item button stays a plain button');
    assert.ok(item.includes('onClick={() => unsnoozeOne(item)}'), 'the per-item button still calls unsnoozeOne');
    assert.ok(item.includes('disabled={!!busy}'), 'the per-item button stays driven by busy');
    assert.equal(item.includes('aria-busy'), false, 'the per-item button never carries aria-busy');
    assert.ok(item.includes('aria-label={`Review it now: ${item.name}`}'), 'the per-item accessible name stays');
    assert.ok(
      item.includes(
        'className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"',
      ),
      'the per-item classes stay untouched',
    );
    assert.ok(
      item.includes('{busy === item.conceptId && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}'),
      'the per-item spinner keeps its own busy marker',
    );
  });
});

describe('StudyToday: one polite status line in the snooze summary', () => {
  it('adds exactly one sr-only polite status line for the marker', () => {
    assert.ok(
      summary.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the status line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(summary, /className="sr-only"/g), 1, 'the status line is the only sr-only element in the summary');
  });

  it('says Bringing your snoozed reviews back… while busy and clears when idle', () => {
    assert.ok(
      summary.includes("{busy === UNSNOOZE_BUSY ? 'Bringing your snoozed reviews back…' : ''}"),
      'the status text follows the unsnooze-all marker',
    );
    assert.equal(count(summary, /Bringing your snoozed reviews back…/g), 1, 'the status copy appears once');
  });

  it('sits after the summary paragraph and before the snoozed list', () => {
    const statusStart = summary.indexOf('<p role="status"');
    const paragraphClose = summary.indexOf('</p>');
    const linkClose = summary.indexOf('</Link>');
    const listStart = summary.indexOf('<ul className="mt-1 space-y-1"');
    assert.ok(linkClose > 0 && linkClose < paragraphClose, 'the See snoozed reviews link sits inside the summary paragraph');
    assert.ok(statusStart > paragraphClose, 'the status line follows the summary paragraph');
    assert.ok(statusStart > linkClose, 'the status line follows the See snoozed reviews link');
    assert.ok(statusStart < listStart, 'the status line sits before the snoozed list');
  });
});

describe('StudyToday: the snooze summary and flows stay intact', () => {
  it('keeps the summary paragraph, its gating, the link and the named list', () => {
    assert.ok(summary.includes('<p className="text-xs text-muted-foreground">'), 'the summary paragraph keeps its classes');
    assert.ok(summary.includes('{snoozedSummary('), 'the summary copy still comes from snoozedSummary');
    assert.ok(summary.includes('current.snoozed.map((s) => s.until)'), 'the summary still maps the snoozed until dates');
    assert.ok(summary.includes('{current.snoozed.length > 1 && ('), 'the button still needs more than one snoozed review');
    assert.ok(
      summary.includes('<Link to="/gaps" className="font-medium text-primary underline underline-offset-2">'),
      'the See snoozed reviews link keeps its classes',
    );
    assert.ok(summary.includes('See snoozed reviews'), 'the link label stays');
    assert.ok(
      summary.includes('<ul className="mt-1 space-y-1" aria-label="Snoozed reviews">'),
      'the snoozed list stays named and unchanged',
    );
  });

  it('keeps the unsnoozeAll flow intact', () => {
    assert.ok(today.includes('const unsnoozeAll = async () => {'), 'unsnoozeAll stays');
    assert.ok(
      today.includes(
        'if (!db || !learnerId || busy || data?.learnerId !== learnerId || data.snoozed.length === 0) return;',
      ),
      'the unsnoozeAll guard stays',
    );
    assert.ok(today.includes('setBusy(UNSNOOZE_BUSY);'), 'unsnoozeAll still sets the marker');
    assert.ok(today.includes("outcome: 'unsnooze'"), 'unsnoozeAll still ends every snooze');
    assert.ok(today.includes('await load();'), 'unsnoozeAll still reloads');
    assert.equal(count(today, /setBusy\(null\);/g), 3, 'every flow still clears busy in its finally');
    assert.ok(today.includes(String.raw`const UNSNOOZE_BUSY = '\u0000snoozed';`), 'the marker constant stays');
  });

  it('keeps the unsnoozeOne flow and the existing announcements intact', () => {
    assert.ok(today.includes('const unsnoozeOne = async (item: NamedSnoozedReview) => {'), 'unsnoozeOne stays');
    assert.ok(today.includes('setBusy(item.conceptId);'), 'unsnoozeOne still uses its own marker');
    assert.ok(today.includes('focusAfterAnswer'), 'the post-answer focus helper stays in use');
    assert.equal(count(today, /role="status"/g), 3, 'the loading line, the notice and the new status stay');
    assert.equal(count(today, /aria-live="polite"/g), 2, 'the notice and the new status stay polite');
    assert.ok(
      today.includes("<p aria-live=\"polite\" role=\"status\" className={cn('text-sm text-emerald-700 dark:text-emerald-400', (notice || welcome) && 'mt-4')}>"),
      'the result notice keeps announcing outcomes',
    );
  });
});

describe('StudyToday: no replaced name and no new data path', () => {
  it('adds no aria-label, aria-labelledby or aria-atomic to the summary', () => {
    assert.equal(count(summary, /aria-label=/g), 2, 'the list name and the per-item button name stay the only ones');
    assert.equal(count(summary, /aria-labelledby=/g), 0);
    assert.equal(count(summary, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migrat/i.test(summary), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Bringing your snoozed reviews back'), false, `${file} gained the status copy`);
      assert.equal(other.includes('UNSNOOZE_BUSY'), false, `${file} gained unsnooze wiring`);
    }
  });
});
