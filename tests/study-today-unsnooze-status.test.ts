/**
 * "Review them now" busy status is announced (`StudyToday` snooze summary).
 *
 * The snoozed summary in Today's panel lets a learner bring every snoozed
 * review back with one button. While `unsnoozeAll` ran, the button only faded
 * (`disabled={!!busy}`) and showed an `aria-hidden` spinner: there was no
 * `aria-busy` and no live region, so a screen reader could not tell the review
 * was being returned to the queue and the button looked frozen. The per-item
 * "Review it now" button (`busy === item.conceptId`) had the same gap.
 *
 * This file locks `aria-busy={busy === UNSNOOZE_BUSY}` right after
 * `disabled={!!busy}` on the summary button with its type, classes, label and
 * spinner untouched, a polite `sr-only` `role="status"` line between the
 * summary paragraph and the named snoozed list that says "Bringing your snoozed
 * reviews back…" while busy and clears when idle, `aria-busy={busy ===
 * item.conceptId}` on the per-item button plus a second polite `sr-only` status
 * line after the named list that says `Bringing “<name>” back…` while that item
 * is busy and clears when idle, the untouched `unsnoozeAll`/`unsnoozeOne`
 * flows, and that no server function, RPC call or migration was added.
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

const SUMMARY_OPEN = '<div className="mt-2" data-testid="snoozed-summary">';
const LIST_OPEN = '<ul className="mt-1 space-y-1" aria-label="Snoozed reviews">';
const NEXT_BLOCK = '{/* Learn next */}';

const summaryStart = today.indexOf(SUMMARY_OPEN);
assert.ok(summaryStart > 0, 'the snoozed summary block is rendered');
const summaryEnd = today.indexOf(NEXT_BLOCK, summaryStart);
assert.ok(summaryEnd > summaryStart, 'the snoozed summary block is followed by the next block');
const summary = today.slice(summaryStart, summaryEnd);
assert.ok(summary.includes(LIST_OPEN), 'the named snoozed list stays inside the summary block');

/** The opening tag of the summary button whose visible label is `Review them now`. */
const ALL_LABEL = 'Review them now';
const allLabelIdx = summary.indexOf(ALL_LABEL);
assert.ok(allLabelIdx > 0, 'the "Review them now" label is rendered once');
const allOpen = summary.lastIndexOf('<button', allLabelIdx);
assert.ok(allOpen > 0, 'the "Review them now" button has an opening tag');
const ALL_TAG = summary.slice(allOpen, allLabelIdx);

/** The opening tag of the per-item button (found from its aria-label). */
const ONE_LABEL = 'aria-label={`Review it now:';
const oneLabelIdx = summary.indexOf(ONE_LABEL);
assert.ok(oneLabelIdx > 0, 'the per-item "Review it now" button keeps its aria-label');
const oneOpen = summary.lastIndexOf('<button', oneLabelIdx);
assert.ok(oneOpen > 0, 'the per-item button has an opening tag');
const oneTagEnd = summary.indexOf('>', oneLabelIdx);
assert.ok(oneTagEnd > oneLabelIdx, 'the per-item opening tag closes');
const ONE_TAG = summary.slice(oneOpen, oneTagEnd);

describe('StudyToday: the Review them now button announces it is busy', () => {
  it('adds aria-busy={busy === UNSNOOZE_BUSY} right after disabled={!!busy}', () => {
    assert.ok(ALL_TAG.includes('type="button"'), 'the button stays a plain button');
    assert.ok(ALL_TAG.includes('onClick={unsnoozeAll}'), 'the button still calls unsnoozeAll');
    assert.ok(ALL_TAG.includes('disabled={!!busy}'), 'disabled stays driven by any busy marker');
    assert.ok(ALL_TAG.includes('aria-busy={busy === UNSNOOZE_BUSY}'), 'aria-busy follows the summary marker');
    assert.ok(
      ALL_TAG.indexOf('disabled={!!busy}') < ALL_TAG.indexOf('aria-busy={busy === UNSNOOZE_BUSY}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(
      count(today, /aria-busy=\{busy === UNSNOOZE_BUSY\}/g),
      1,
      'one aria-busy={busy === UNSNOOZE_BUSY}, on the summary button only',
    );
  });

  it('keeps the Review them now classes, label and spinner untouched', () => {
    assert.ok(
      ALL_TAG.includes(
        'className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"',
      ),
      'Review them now classes untouched',
    );
    assert.equal(count(summary, /Review them now/g), 1, 'the Review them now label stays once');
    assert.ok(
      summary.includes('{busy === UNSNOOZE_BUSY && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}'),
      'the summary spinner stays hidden and unchanged',
    );
  });

  it('adds aria-busy={busy === item.conceptId} right after disabled={!!busy} on the per-item button', () => {
    assert.ok(ONE_TAG.includes('type="button"'), 'the per-item button stays a plain button');
    assert.ok(ONE_TAG.includes('onClick={() => unsnoozeOne(item)}'), 'the per-item button still calls unsnoozeOne');
    assert.ok(ONE_TAG.includes('disabled={!!busy}'), 'the per-item button stays driven by any busy marker');
    assert.ok(ONE_TAG.includes('aria-busy={busy === item.conceptId}'), 'aria-busy follows the per-item marker');
    assert.ok(
      ONE_TAG.indexOf('disabled={!!busy}') < ONE_TAG.indexOf('aria-busy={busy === item.conceptId}'),
      'aria-busy sits right after disabled',
    );
    assert.ok(ONE_TAG.includes('aria-label={`Review it now: ${item.name}`}'), 'its accessible name stays');
    assert.equal(
      count(today, /aria-busy=\{busy === item\.conceptId\}/g),
      1,
      'one aria-busy={busy === item.conceptId}, on the per-item button only',
    );
    assert.ok(
      ONE_TAG.includes(
        'className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"',
      ),
      'the per-item classes stay untouched',
    );
    assert.ok(
      summary.includes('{busy === item.conceptId && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}'),
      'the per-item spinner stays hidden and unchanged',
    );
  });
});

describe('StudyToday: one polite status line in the snooze summary', () => {
  it('adds exactly one sr-only polite status line for bringing reviews back', () => {
    assert.ok(
      summary.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the summary line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(summary, /className="sr-only"/g), 2, 'two sr-only status lines: summary plus per-item');
  });

  it('says Bringing your snoozed reviews back… while busy and clears when idle', () => {
    assert.ok(
      summary.includes("{busy === UNSNOOZE_BUSY ? 'Bringing your snoozed reviews back…' : ''}"),
      'the status text follows the summary marker',
    );
    assert.equal(count(summary, /Bringing your snoozed reviews back…/g), 1, 'the status copy appears once');
  });

  it('sits after the summary paragraph and before the named snoozed list', () => {
    const statusStart = summary.indexOf('<p role="status"');
    const paragraphStart = summary.indexOf('<p className="text-xs text-muted-foreground">');
    assert.ok(paragraphStart > 0, 'the summary paragraph stays');
    const paragraphEnd = summary.indexOf('</p>', paragraphStart);
    assert.ok(paragraphEnd > paragraphStart, 'the summary paragraph closes');
    const listStart = summary.indexOf(LIST_OPEN);
    assert.ok(statusStart > paragraphEnd, 'the status line follows the summary paragraph');
    assert.ok(statusStart < listStart, 'the status line sits before the named snoozed list');
  });

  it('adds a second sr-only polite status line that names the item being brought back', () => {
    assert.ok(
      today.includes(
        'const unsnoozingName = current?.snoozed.find((s) => s.conceptId === busy)?.name ?? null;',
      ),
      'the busy item name is derived from the current snoozed list',
    );
    const statusStart = summary.lastIndexOf('<p role="status" aria-live="polite" className="sr-only">');
    assert.ok(statusStart > 0, 'the per-item status line is rendered');
    const statusEnd = summary.indexOf('</p>', statusStart);
    assert.ok(statusEnd > statusStart, 'the per-item status line closes');
    const statusBlock = summary.slice(statusStart, statusEnd);
    assert.ok(
      statusBlock.includes("{unsnoozingName ? `Bringing “${unsnoozingName}” back…` : ''}"),
      'the status names the item while it is busy and clears when idle',
    );
    assert.ok(
      statusStart > summary.lastIndexOf(LIST_OPEN),
      'the per-item status line follows the named list',
    );
    assert.ok(
      statusStart < summary.lastIndexOf('</div>'),
      'the per-item status line stays inside the snooze block',
    );
  });
});

describe('StudyToday: the existing snooze UI and flows stay intact', () => {
  it('keeps the summary shell, helper and see-link', () => {
    assert.ok(summaryStart > 0, 'data-testid="snoozed-summary" stays');
    assert.ok(
      summary.includes('snoozedSummary(\n                  current.snoozed.map((s) => s.until),\n                  new Date(),\n                )'),
      'the summary helper call stays',
    );
    assert.ok(
      summary.includes('<Link to="/gaps" className="font-medium text-primary underline underline-offset-2">'),
      'the See snoozed reviews link stays',
    );
    assert.ok(summary.includes('See snoozed reviews'), 'the see-link label stays');
    assert.ok(summary.includes('aria-label="Snoozed reviews"'), 'the named snoozed list stays');
    assert.ok(
      summary.includes('{current.snoozed.length > 1 && ('),
      'the summary button stays limited to more than one snooze',
    );
  });

  it('keeps the unsnoozeAll and unsnoozeOne flows intact', () => {
    assert.ok(today.includes('const unsnoozeAll = async () => {'), 'unsnoozeAll stays');
    assert.ok(
      today.includes('if (!db || !learnerId || busy || data?.learnerId !== learnerId || data.snoozed.length === 0) return;'),
      'the unsnoozeAll guard stays',
    );
    assert.ok(today.includes('setBusy(UNSNOOZE_BUSY);'), 'unsnoozeAll still marks the summary busy');
    assert.ok(today.includes('setBusy(null);'), 'busy still clears');
    assert.ok(today.includes('const unsnoozeOne = async (item: NamedSnoozedReview) => {'), 'unsnoozeOne stays');
    assert.ok(today.includes('setBusy(item.conceptId);'), 'unsnoozeOne still marks the item busy');
    assert.ok(today.includes('outcome: \'unsnooze\''), 'both flows still record the unsnooze outcome');
  });

  it('adds no new labels and no data path', () => {
    assert.equal(count(summary, /aria-label=/g), 2, 'only the list label and the per-item label stay');
    assert.equal(count(summary, /aria-labelledby=/g), 0);
    assert.equal(count(summary, /aria-atomic=/g), 0);
    assert.equal(/createServerFn|graphCall|rpc-schemas|migrat/i.test(summary), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Bringing your snoozed reviews back'), false, `${file} gained the status copy`);
    }
  });
});
