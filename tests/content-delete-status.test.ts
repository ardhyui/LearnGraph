/**
 * Deleting a lesson content item is announced (admin → Lesson Content).
 *
 * The per-row `Delete` button calls `remove` → `deleteLessonContent`, which
 * previously disabled nothing and announced nothing: during the request the
 * button stayed clickable (a double click could fire two deletes) and a screen
 * reader could not tell that the item was being deleted. This file locks
 * `disabled={deleting !== null}` and `aria-busy={deleting === c.id}` on that
 * button, the `deleting` state and its guard/cleanup in `remove`, and one
 * `sr-only` polite `role="status"` line at the end of the item list that says
 * `Deleting the item…` while a delete is in flight and clears when idle. The
 * synchronous per-row `Edit` button and the existing Save item status stay
 * untouched, and no server function, RPC schema or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CONTENT_FILE = join(ROOT, 'src', 'routes', 'admin', 'content.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(CONTENT_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The opening tag of the button whose accessible label is `label`. */
const buttonOf = (label: string) => {
  const labelIdx = page.indexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = page.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(
    page.slice(open, labelIdx).includes('</button>'),
    false,
    `the "${label}" label is inside its button`,
  );
  const close = page.indexOf('>', labelIdx) + 1;
  return page.slice(open, close);
};

const DELETE = buttonOf('aria-label={`Delete ${c.title}`}');
const EDIT = buttonOf('aria-label={`Edit ${c.title}`}');

/** The `remove` handler, from its declaration to its closing `};`. */
const removeStart = page.indexOf('const remove = async (c: ContentItem, button?: HTMLElement) => {');
assert.ok(removeStart > 0, 'the remove handler is rendered');
const removeEnd = page.indexOf('\n  };', removeStart) + '\n  };'.length;
const remove = page.slice(removeStart, removeEnd);

/** The lesson item list, from its `<ol>` to its `</ol>`. */
const listStart = page.indexOf('<ol className="space-y-3"');
assert.ok(listStart > 0, 'the item list is rendered');
const listEnd = page.indexOf('</ol>', listStart) + '</ol>'.length;
const list = page.slice(listStart, listEnd);

describe('Lesson Content: the per-row Delete button announces it is busy', () => {
  it('adds disabled and aria-busy after the classes, driven by deleting', () => {
    assert.ok(DELETE.includes('type="button"'), 'Delete stays a plain button');
    assert.ok(
      DELETE.includes('onClick={(e) => remove(c, e.currentTarget)}'),
      'Delete still passes its element for focus restoration',
    );
    assert.ok(DELETE.includes('aria-label={`Delete ${c.title}`}'), 'the label stays');
    assert.ok(
      DELETE.includes('className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"'),
      'the classes stay exactly',
    );
    assert.ok(DELETE.includes('disabled={deleting !== null}'), 'every row disables while deleting');
    assert.ok(DELETE.includes('aria-busy={deleting === c.id}'), 'only the deleted row is busy');
    assert.ok(
      DELETE.indexOf('className=') < DELETE.indexOf('disabled={deleting !== null}'),
      'disabled sits after className',
    );
    assert.ok(
      DELETE.indexOf('disabled={deleting !== null}') < DELETE.indexOf('aria-busy={deleting === c.id}'),
      'aria-busy sits after disabled',
    );
    assert.ok(page.includes('<Trash2 className="h-4 w-4" aria-hidden="true" />'), 'the hidden trash icon stays');
  });

  it('leaves the synchronous Edit button without a busy marker', () => {
    assert.ok(EDIT.includes('type="button"'), 'Edit stays a plain button');
    assert.ok(EDIT.includes('onClick={() => edit(c)}'), 'Edit still opens the form');
    assert.ok(page.includes('aria-label={`Edit ${c.title}`}'), 'Edit keeps its label');
    assert.equal(EDIT.includes('disabled'), false, 'no disabled on Edit');
    assert.equal(EDIT.includes('aria-busy'), false, 'no aria-busy on Edit');
  });
});

describe('Lesson Content: deleting is announced once', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      page.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the deleting line is a sr-only paragraph carrying role and politeness',
    );
    assert.ok(
      page.includes("{deleting ? 'Deleting the item…' : ''}"),
      'the status text follows deleting',
    );
    assert.equal(count(page, /Deleting the item…/g), 1, 'the status copy appears once');
  });

  it('sits after list.map as the last child of the item list', () => {
    const statusStart = list.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the deleting line is in the list');
    const mapClose = list.lastIndexOf('))}', statusStart);
    assert.ok(mapClose > 0, 'the status line follows the list map');
    const statusEnd = list.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      list.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</ol>',
      'the status line is the last child of the list',
    );
    assert.ok(
      list.slice(0, mapClose).includes('</li>'),
      'the map still renders the item rows before the status line',
    );
  });
});

describe('Lesson Content: the remove flow keeps its behaviour', () => {
  it('declares deleting after notice', () => {
    const notice = page.indexOf('const [notice, setNotice] = useState<string | null>(null);');
    const deleting = page.indexOf('const [deleting, setDeleting] = useState<string | null>(null);');
    assert.ok(notice > 0, 'the notice state stays');
    assert.ok(deleting > notice, 'deleting is declared after notice');
  });

  it('guards re-entry before the confirmation and marks the row after clearing the error', () => {
    const guard = remove.indexOf('if (deleting) return;');
    const confirm = remove.indexOf('if (!confirm(`Delete “${c.title}”?`)) return;');
    const clear = remove.indexOf('setError(null);');
    const mark = remove.indexOf('setDeleting(c.id);');
    const focus = remove.indexOf('rememberRowFocus(button)');
    assert.ok(guard > 0, 'the guard stays');
    assert.ok(confirm > guard, 'the guard runs before the confirmation');
    assert.ok(clear > confirm, 'the confirmation still comes first');
    assert.ok(mark > clear, 'the row is marked after the error clears');
    assert.ok(focus > mark, 'focus is remembered after the row is marked');
  });

  it('keeps the delete call, notice, draft close, reload and focus restore', () => {
    assert.ok(remove.includes('await deleteLessonContent({ data: { id: c.id } });'), 'the delete call stays');
    assert.ok(remove.includes("setNotice('Item deleted.');"), 'the result notice stays');
    assert.ok(remove.includes('if (draft?.id === c.id) setDraft(null);'), 'the open draft still closes');
    assert.ok(remove.includes('await load();'), 'the list still reloads');
    assert.ok(remove.includes('restoreRowFocus(focus);'), 'focus is still restored');
    assert.ok(
      remove.includes("setError(err instanceof Error ? err.message : 'Could not delete the item.');"),
      'the error message stays',
    );
  });

  it('clears deleting in a finally', () => {
    assert.ok(remove.includes('finally {'), 'the try/catch gains a finally');
    const finallyIdx = remove.indexOf('finally {');
    assert.ok(remove.slice(finallyIdx).includes('setDeleting(null);'), 'deleting is cleared in the finally');
    assert.ok(
      remove.indexOf('setDeleting(null);') > remove.indexOf('setError(err instanceof Error'),
      'the cleanup runs after the catch body',
    );
  });
});

describe('Lesson Content: the save status and page counts stay locked', () => {
  it('keeps the Save item and Cancel markers', () => {
    assert.ok(page.includes('disabled={saving} aria-busy={saving}'), 'Save item keeps its busy marker');
    assert.ok(page.includes("{saving ? 'Saving the item…' : ''}"), 'the save status stays');
    assert.ok(
      page.includes('onClick={() => setDraft(null)} disabled={saving} className="btn btn-secondary"'),
      'Cancel stays disabled',
    );
  });

  it('keeps the notice, the error and the "Loading lesson content…" line', () => {
    assert.ok(
      page.includes(
        '<p role="status" aria-live="polite" className={cn(\'text-sm text-emerald-700 dark:text-emerald-400\', notice && \'mb-4\')}>',
      ),
      'the notice keeps its role, politeness and classes',
    );
    assert.ok(
      page.includes(
        '<p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">',
      ),
      'the error line keeps its role and classes',
    );
    assert.ok(
      page.includes(
        '<p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">',
      ),
      'the loading line keeps its role and classes',
    );
  });

  it('matches the file-wide counts', () => {
    assert.equal(count(page, /aria-busy/g), 2, 'Save item plus the new row marker');
    assert.equal(count(page, /aria-busy=/g), 2, 'two aria-busy attributes');
    assert.equal(count(page, /aria-live/g), 3, 'notice, saving line and deleting line');
    assert.equal(count(page, /role="status"/g), 4, 'notice, loading line, saving line and deleting line');
    assert.equal(count(page, /role="alert"/g), 1, 'one alert line');
    assert.equal(count(page, /aria-label=/g), 3, 'the existing accessible labels stay');
    assert.equal(count(page, /aria-labelledby/g), 1, 'only the form keeps its heading label');
    assert.equal(count(page, /aria-atomic/g), 0, 'no aria-atomic is added');
    assert.equal(count(page, /className="sr-only"/g), 2, 'saving line plus the deleting line');
    assert.equal(count(page, /role="/g), 5, 'notice, loading, saving, deleting and the alert');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Deleting the item'), false, `${file} gained the status copy`);
      assert.equal(other.includes('content-delete-busy'), false, `${file} gained busy wiring`);
    }
  });
});
