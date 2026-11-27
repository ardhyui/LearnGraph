/**
 * Saving a lesson content item is announced (admin → Lesson Content).
 *
 * "Save item" calls `saveLessonContent`, which flips `saving` true. While
 * saving the submit button only faded (`disabled` + `disabled:opacity-60`) and
 * showed an `aria-hidden` spinner: its accessible name stayed the same, there
 * was no `aria-busy`, and no live region spoke, so a screen reader could not
 * tell that the lesson material was being saved and the button looked frozen.
 *
 * This file locks `aria-busy={saving}` right after `disabled={saving}` on the
 * submit button with its type, classes, icons and label untouched, a new
 * `sr-only` polite `role="status"` line after the two-button row and before
 * `</form>` that says `Saving the item…` while saving and clears when idle,
 * the untouched Cancel, Add item and per-item Edit buttons (the per-row Delete
 * marker is locked separately in `tests/content-delete-status.test.ts`), the
 * existing notice, error and "Loading lesson content…" lines, the untouched
 * `submit`/`load`/`openForm`/`edit`/`remove` flows, and that no server
 * function, RPC schema or migration was added.
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

/** The lesson content form, from its `<form>` to its closing `</form>`. */
const formStart = page.indexOf('<form onSubmit={submit}');
assert.ok(formStart > 0, 'the lesson content form is rendered');
const formEnd = page.indexOf('</form>', formStart) + '</form>'.length;
const form = page.slice(formStart, formEnd);
assert.ok(form.includes('Save item'), 'the form holds the submit button');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string, text: string = form) => {
  const labelIdx = text.lastIndexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = text.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(
    text.slice(open, labelIdx).includes('</button>'),
    false,
    `the "${label}" label is inside its button`,
  );
  return text.slice(open, labelIdx);
};

const SAVE = buttonOf('Save item');
const CANCEL = buttonOf('Cancel');

describe('Lesson Content: the submit button announces it is busy', () => {
  it('adds aria-busy={saving} right after disabled={saving}', () => {
    assert.ok(SAVE.includes('type="submit"'), 'the button stays a submit');
    assert.ok(SAVE.includes('disabled={saving}'), 'disabled stays driven by saving');
    assert.ok(SAVE.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      SAVE.indexOf('disabled={saving}') < SAVE.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(page, /aria-busy=/g), 2, 'the submit button plus the per-row Delete marker');
  });

  it('keeps the submit classes, label and spinner untouched', () => {
    assert.ok(
      SAVE.includes('className="btn btn-primary flex items-center gap-2 disabled:opacity-60"'),
      'submit classes untouched',
    );
    assert.equal(count(form, /Save item/g), 1, 'the submit label stays once');
    assert.ok(
      form.includes(
        '{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}',
      ),
      'the existing spinner and save icon stay hidden and unchanged',
    );
  });
});

describe('Lesson Content: one polite status line after the buttons', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the saving line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(form, /aria-live="polite"/g), 1, 'one polite live region in the form');
    assert.equal(count(form, /role="status"/g), 1, 'one status line in the form');
    assert.equal(count(page, /aria-live="polite"/g), 3, 'the notice plus saving and deleting lines');
    assert.equal(count(page, /role="status"/g), 4, 'notice, loading line plus saving and deleting lines');
  });

  it('says Saving the item… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{saving ? 'Saving the item…' : ''}"),
      'the status text follows saving',
    );
    assert.equal(count(form, /Saving the item…/g), 1, 'the status copy appears once');
  });

  it('sits after the two-button row as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the saving line is present');
    const buttonRow = form.lastIndexOf('<div className="flex flex-wrap gap-2">', statusStart);
    assert.ok(buttonRow > 0, 'the two-button row stays');
    const rowClose = form.indexOf('</div>', buttonRow);
    assert.ok(statusStart > rowClose, 'the status line follows the button row');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the form',
    );
  });
});

describe('Lesson Content: the other buttons and the existing status lines stay', () => {
  it('leaves Cancel disabled while saving without aria-busy', () => {
    assert.ok(CANCEL.includes('type="button"'), 'Cancel stays a plain button');
    assert.ok(CANCEL.includes('onClick={() => setDraft(null)}'), 'Cancel still closes the form');
    assert.ok(CANCEL.includes('disabled={saving}'), 'Cancel still disables while saving');
    assert.equal(CANCEL.includes('aria-busy'), false, 'no aria-busy on Cancel');
  });

  it('leaves Add item and Edit without aria-busy', () => {
    const add = buttonOf('Add item', page);
    assert.equal(add.includes('aria-busy'), false, 'no aria-busy on Add item');
    assert.ok(page.includes('aria-label={`Edit ${c.title}`}'), 'Edit keeps its label');
    assert.equal(
      count(page, /aria-busy=\{saving\}/g),
      1,
      'only the submit button is marked busy by saving',
    );
  });

  it('keeps the notice, the error and the "Loading lesson content…" line', () => {
    assert.ok(
      page.includes(
        '<p role="status" aria-live="polite" className={cn(\'text-sm text-emerald-700 dark:text-emerald-400\', notice && \'mb-4\')}>',
      ),
      'the conditional notice keeps its role, politeness and classes',
    );
    assert.equal(count(page, /role="alert"/g), 1, 'one alert line for errors');
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
    const loadingStart = page.indexOf('Loading lesson content…');
    assert.ok(loadingStart > 0, 'the loading copy stays');
    const loadingLineStart = page.lastIndexOf('<p', loadingStart);
    assert.equal(
      page.slice(loadingLineStart, loadingStart).includes('aria-live'),
      false,
      'the loading line carries no aria-live',
    );
  });
});

describe('Lesson Content: the flows stay intact and no data path is added', () => {
  it('keeps the submit flow', () => {
    assert.ok(page.includes('const submit = async (e: FormEvent) => {'), 'submit stays');
    assert.ok(page.includes('if (!draft || !conceptId || saving) return;'), 'the guard stays');
    assert.ok(page.includes("setError('Give the item a title.');"), 'title validation stays');
    assert.ok(
      page.includes("setError('Links and videos need an https:// address.');"),
      'link validation stays',
    );
    assert.ok(page.includes("setError('Write the text of this item.');"), 'body validation stays');
    assert.ok(
      page.includes("setError('Minutes must be a whole number from 1 to 600.');"),
      'minutes validation stays',
    );
    assert.ok(page.includes('setSaving(true);'), 'saving still starts with the request');
    assert.ok(page.includes('await saveLessonContent({'), 'the save call stays');
    assert.ok(
      page.includes("setNotice(draft.id ? 'Item updated.' : 'Item added.');"),
      'the result notice stays',
    );
    assert.ok(page.includes('setDraft(null);'), 'the form still closes on success');
    assert.ok(page.includes('await load();'), 'the list still reloads on success');
    assert.ok(page.includes('setSaving(false);'), 'saving still clears in the finally');
  });

  it('keeps load, openForm, edit and remove', () => {
    assert.ok(page.includes('const load = useCallback(async () => {'), 'load stays');
    assert.ok(page.includes('const openForm = (next: Draft) => {'), 'openForm stays');
    assert.ok(page.includes('const edit = (c: ContentItem) =>'), 'edit stays');
    assert.ok(page.includes('const remove = async (c: ContentItem, button?: HTMLElement) => {'), 'remove stays');
    assert.ok(
      page.includes('if (!confirm(`Delete “${c.title}”?`)) return;'),
      'delete confirmation stays',
    );
    assert.ok(page.includes('rememberRowFocus(button)'), 'row focus is still remembered');
    assert.ok(page.includes('restoreRowFocus(focus)'), 'row focus is still restored');
  });

  it('keeps the form heading, labels and fields', () => {
    assert.ok(page.includes('aria-labelledby={ids.form}'), 'the form keeps its heading label');
    assert.ok(
      page.includes('{draft.id ? \'Edit item\' : \'New item\'}'),
      'the form heading copy stays',
    );
    assert.ok(page.includes('ref={formHeadingRef}'), 'the heading still receives focus');
    assert.ok(page.includes('CONTENT_KIND_LABELS'), 'the kind labels stay');
    assert.ok(
      page.includes('aria-label={`Lesson content for ${concept.name}`}'),
      'the item list keeps its name',
    );
    assert.equal(modelLabels().length, 8, 'all eight form fields are still labelled');
  });

  it('adds no aria-label, extra aria-labelledby or aria-atomic on the form', () => {
    assert.equal(count(form, /aria-label=/g), 0);
    assert.equal(count(form, /aria-labelledby=/g), 1, 'the form keeps its single heading label');
    assert.equal(count(form, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Saving the item'), false, `${file} gained the status copy`);
      assert.equal(other.includes('content-save-busy'), false, `${file} gained busy wiring`);
    }
  });
});

/** The `ids.<field>` labels the form still renders (kind, title, body, solution, url, minutes, source, position). */
function modelLabels(): string[] {
  return ['kind', 'title', 'body', 'solution', 'url', 'minutes', 'source', 'position']
    .map((fieldId) => `htmlFor={ids.${fieldId}}`)
    .filter((marker) => page.includes(marker));
}
