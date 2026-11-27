/**
 * Importing a learner from a file is announced and marked busy
 * (`/admin/learners`).
 *
 * The **Import from a file** label only swapped its text to **Importing…** and
 * dimmed the file input while the import ran, and the page's one live region
 * (`data-testid="import-notice"`) is cleared before the import starts, so a
 * screen reader never learned that the long-running import had begun. The same
 * button + status pattern is already used on `/sign-in`, `/forgot-password`,
 * `/reset-password`, the `/learn` self-report and concept quiz, `DeleteAccount`,
 * both **Ask an AI tutor** buttons, the snooze buttons, **Create a read-only
 * key**, **Save subjects**, the `/japanese` buttons, **Start learning**,
 * **Draft 4 questions**, **Draft with Claude** and **Save what I kept**,
 * **Save item**, **Save question**, the admin Psychometrics buttons, **Refresh**
 * on `/gaps`, `/graph`, `/combined-graph`, `/progress`, `/recommendations` and
 * `/status`, the profile save buttons, **Refresh study plan** on the Today
 * card, and **Run All Tests** on `/tests`.
 *
 * This file locks `aria-busy` on the existing label, one `sr-only` polite
 * `role="status"` line as the last child of the action row, and that the
 * import flow, the result notice and the action row stay untouched without a
 * server function, RPC schema or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'admin', 'learners.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The action row, from its `motion.div` to its closing tag. */
const rowClassStart = page.indexOf('className="mb-6 flex flex-wrap items-center gap-2"');
assert.ok(rowClassStart > 0, 'the action row is rendered');
const rowStart = page.lastIndexOf('<motion.div', rowClassStart);
assert.ok(rowStart > 0, 'the action row motion.div is present');
const statusStart = page.indexOf('<p role="status" aria-live="polite"', rowStart);
assert.ok(statusStart > rowStart, 'the import status line is present');
const statusEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
const rowEnd = page.indexOf('</motion.div>', statusEnd) + '</motion.div>'.length;
const ROW = page.slice(rowStart, rowEnd);

/** The import label inside the action row. */
const labelStart = page.indexOf('<label', rowStart);
assert.ok(labelStart > rowStart && labelStart < statusStart, 'the import label is rendered');
const labelEnd = page.indexOf('</label>', labelStart) + '</label>'.length;
const LABEL = page.slice(labelStart, labelEnd);

describe('/admin/learners: the import label reports its busy state', () => {
  it('adds aria-busy right after the wrapper class and keeps the input handler', () => {
    assert.ok(
      LABEL.includes(
        'className="btn btn-secondary flex cursor-pointer items-center gap-2 focus-within:ring-2 focus-within:ring-primary"',
      ),
      'the wrapper class is untouched',
    );
    assert.ok(LABEL.includes('aria-busy={importing}'), 'aria-busy is driven by importing');
    const classAt = LABEL.indexOf('focus-within:ring-primary"');
    const busy = LABEL.indexOf('aria-busy={importing}');
    assert.ok(busy > classAt, 'aria-busy follows the wrapper class');
    assert.ok(LABEL.includes('<Upload className="w-4 h-4" aria-hidden="true" />'), 'the icon stays');
    assert.ok(
      LABEL.includes("{importing ? 'Importing…' : 'Import from a file'}"),
      'the visible label still flips between importing and idle',
    );
    assert.ok(LABEL.includes('type="file"'), 'the file input stays');
    assert.ok(LABEL.includes('accept="application/json,.json"'), 'the accepted type stays');
    assert.ok(LABEL.includes('className="sr-only"'), 'the input stays visually hidden');
    assert.ok(LABEL.includes('disabled={importing}'), 'the input is still disabled while importing');
    assert.ok(LABEL.includes('const file = e.target.files?.[0];'), 'the handler still reads the file');
    assert.ok(LABEL.includes('e.target.value = \'\';'), 'the handler still resets the input');
    assert.ok(LABEL.includes('if (file) void handleImport(file);'), 'the handler still imports the file');
    assert.equal(count(page, /aria-busy=/g), 2, 'the import label and the per-row Delete button');
  });
});

describe('/admin/learners: one polite status line announces the import', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      ROW.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the import line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 3, 'the result notice, the import line and the deleting line are polite');
    assert.equal(count(page, /role="status"/g), 3, 'the result notice, the import line and the deleting line carry status');
    assert.equal(count(page, /role="alert"/g), 0, 'no error alert is added');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby=/g), 0, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic is added');
    assert.equal(
      count(page, /className="sr-only"/g),
      3,
      'the hidden file input, the import line and the deleting line are the only sr-only nodes',
    );
  });

  it('says the learner file is importing and clears when idle', () => {
    assert.ok(
      ROW.includes("{importing ? 'Importing the learner file…' : ''}"),
      'the status text follows importing before clearing',
    );
    assert.equal(count(page, /Importing the learner file…/g), 1, 'the import copy appears once');
  });

  it('sits after RefreshExampleData as the last child of the action row', () => {
    const refresh = ROW.indexOf('<RefreshExampleData />');
    assert.ok(refresh > 0, 'the refresh example button stays in the row');
    assert.ok(statusStart > refresh, 'the line follows RefreshExampleData');
    assert.equal(
      ROW.slice(statusEnd - rowStart).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the action row',
    );
  });
});

describe('/admin/learners: the import flow and result notice stay intact', () => {
  it('keeps the import guard, refresh, notice and busy clearing', () => {
    const importStart = page.indexOf('async function handleImport(file: File) {');
    assert.ok(importStart > 0, 'handleImport is declared');
    const importEnd = page.indexOf('async function handleSubmit', importStart);
    assert.ok(importEnd > importStart, 'handleImport keeps its body before handleSubmit');
    const IMPORT = page.slice(importStart, importEnd);
    assert.ok(IMPORT.includes('setError(\'\');'), 'the error is still reset');
    assert.ok(IMPORT.includes('setImportNotice(\'\');'), 'the result notice is still cleared');
    assert.ok(IMPORT.includes('if (file.size > MAX_IMPORT_BYTES) {'), 'the size guard stays');
    assert.ok(IMPORT.includes('setImporting(true);'), 'the import still starts busy');
    assert.ok(IMPORT.includes("importLearner({ data: { text: await file.text() } })"), 'the same server import stays');
    assert.ok(IMPORT.includes('await refresh();'), 'the learners are still refreshed');
    assert.ok(IMPORT.includes('setImportNotice(parts.join(\' \'));'), 'the result notice still lands');
    assert.ok(IMPORT.includes('setImporting(false);'), 'the import still clears busy at the end');
  });

  it('keeps the result notice right after the action row', () => {
    const notice = page.indexOf('data-testid="import-notice"');
    assert.ok(notice > rowEnd, 'the result notice follows the action row');
    assert.ok(
      page.includes(
        '<p role="status" aria-live="polite" className={importNotice ? \'mb-6 text-sm text-emerald-700 dark:text-emerald-400\' : \'sr-only\'} data-testid="import-notice">',
      ),
      'the conditional result notice is untouched',
    );
  });

  it('adds no server function, RPC call or migration to the page', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Importing the learner file'), false, `${file} gained the status copy`);
    }
  });
});
