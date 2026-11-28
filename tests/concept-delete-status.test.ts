/**
 * Deleting a concept is announced (admin → Concepts).
 *
 * The per-card `Delete` button calls `handleDelete` → `deleteConcept`, which
 * previously disabled nothing and announced nothing: during the request the
 * button stayed clickable (a double click could fire two deletes) and a screen
 * reader could not tell that the concept was being deleted. This file locks
 * `disabled={deleting !== null}` and `aria-busy={deleting === concept.conceptId}`
 * on that button, the `deleting` state and its guard/cleanup in `handleDelete`,
 * and one `sr-only` polite `role="status"` line at the end of the concept card
 * grid that says `Deleting the concept…` while a delete is in flight and clears
 * when idle. The synchronous per-card `Edit` button and the existing Save
 * concept status stay untouched, and no server function, RPC schema or
 * migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CONCEPTS_FILE = join(ROOT, 'src', 'routes', 'admin', 'concepts.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(CONCEPTS_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The opening tag of the button whose visible label is `label`. */
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

const DELETE = buttonOf('title="Delete"');
const EDIT = buttonOf('title="Edit"');
const CANCEL = buttonOf('Cancel');
const SUBMIT = buttonOf("'Update'");

/** The `handleDelete` handler, from its declaration to its closing `}`. */
const removeStart = page.indexOf('async function handleDelete(conceptId: string, button?: HTMLElement) {');
assert.ok(removeStart > 0, 'the handleDelete handler is rendered');
const removeEnd = page.indexOf('\n  }', removeStart) + '\n  }'.length;
const remove = page.slice(removeStart, removeEnd);

/** The concept card grid, from its opening tag to its closing `</motion.div>`. */
const gridMark = page.indexOf('variants={containerVariants}');
assert.ok(gridMark > 0, 'the concept grid is rendered');
const listStart = page.lastIndexOf('<motion.div', gridMark);
assert.ok(listStart > 0, 'the grid has an opening tag');
const listEnd = page.indexOf('\n            </motion.div>', listStart) + '\n            </motion.div>'.length;
const list = page.slice(listStart, listEnd);

describe('/admin/concepts: the per-card Delete button announces it is busy', () => {
  it('adds disabled and aria-busy after the classes, driven by deleting', () => {
    assert.ok(
      DELETE.includes('onClick={(e) => handleDelete(concept.conceptId, e.currentTarget)}'),
      'Delete still passes its element for focus restoration',
    );
    assert.ok(
      DELETE.includes('className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors focus-visible:outline-2 focus-visible:outline-primary"'),
      'the classes stay exactly',
    );
    assert.ok(DELETE.includes('disabled={deleting !== null}'), 'every card disables while deleting');
    assert.ok(DELETE.includes('aria-busy={deleting === concept.conceptId}'), 'only the deleted card is busy');
    assert.ok(
      DELETE.indexOf('className=') < DELETE.indexOf('disabled={deleting !== null}'),
      'disabled sits after className',
    );
    assert.ok(
      DELETE.indexOf('disabled={deleting !== null}') < DELETE.indexOf('aria-busy={deleting === concept.conceptId}'),
      'aria-busy sits after disabled',
    );
    assert.ok(DELETE.includes('title="Delete"'), 'the delete title stays');
    assert.ok(page.includes('<Trash2 className="w-4 h-4" />'), 'the trash icon stays');
  });

  it('leaves the synchronous Edit button without a busy marker', () => {
    assert.ok(EDIT.includes('onClick={() => openEditForm(concept)}'), 'Edit still opens the form');
    assert.ok(EDIT.includes('title="Edit"'), 'Edit keeps its title');
    assert.equal(EDIT.includes('disabled'), false, 'no disabled on Edit');
    assert.equal(EDIT.includes('aria-busy'), false, 'no aria-busy on Edit');
  });
});

describe('/admin/concepts: deleting is announced once', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      page.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the deleting line is a sr-only paragraph carrying role and politeness',
    );
    assert.ok(
      page.includes("{deleting ? 'Deleting the concept…' : ''}"),
      'the status text follows deleting',
    );
    assert.equal(count(page, /Deleting the concept…/g), 1, 'the status copy appears once');
  });

  it('sits after filteredConcepts.map as the last child of the grid', () => {
    const statusStart = list.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the deleting line is in the grid');
    const mapClose = list.lastIndexOf('))}', statusStart);
    assert.ok(mapClose > 0, 'the status line follows the concept map');
    const statusEnd = list.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      list.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the status line is the last child of the grid',
    );
    assert.ok(
      list.slice(0, mapClose).includes('</motion.div>'),
      'the map still renders the concept cards before the status line',
    );
  });
});

describe('/admin/concepts: the delete flow keeps its behaviour', () => {
  it('declares deleting after saving', () => {
    const saving = page.indexOf('const [saving, setSaving] = useState(false);');
    const deleting = page.indexOf('const [deleting, setDeleting] = useState<string | null>(null);');
    assert.ok(saving > 0, 'the saving state stays');
    assert.ok(deleting > saving, 'deleting is declared after saving');
  });

  it('guards re-entry before the confirmation and marks the concept after confirming', () => {
    const guard = remove.indexOf('if (deleting) return;');
    const confirm = remove.indexOf("if (!confirm('Are you sure you want to delete this concept?')) return;");
    const mark = remove.indexOf('setDeleting(conceptId);');
    const focus = remove.indexOf('rememberRowFocus(button)');
    assert.ok(guard > 0, 'the guard stays');
    assert.ok(confirm > guard, 'the guard runs before the confirmation');
    assert.ok(mark > confirm, 'the concept is marked after the confirmation');
    assert.ok(focus > mark, 'focus is remembered after the concept is marked');
  });

  it('keeps the delete call, focus restore and error message', () => {
    assert.ok(remove.includes('await deleteConcept(conceptId);'), 'the delete call stays');
    assert.ok(remove.includes('restoreRowFocus(focus);'), 'focus is still restored');
    assert.ok(
      remove.includes("setError(err instanceof Error ? err.message : 'An error occurred');"),
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

describe('/admin/concepts: the save status and page counts stay locked', () => {
  it('keeps the Create/Update and Cancel markers', () => {
    assert.ok(SUBMIT.includes('type="submit"'), 'the submit button stays a submit');
    assert.ok(
      SUBMIT.includes('className="btn btn-success flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-primary"'),
      'the submit classes are untouched',
    );
    assert.ok(SUBMIT.includes('disabled={saving}'), 'disabled is driven by saving');
    assert.ok(SUBMIT.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(SUBMIT.includes('<Save className="w-4 h-4" />'), 'the Save icon stays');
    assert.ok(page.includes("{saving ? 'Saving the concept…' : ''}"), 'the save status stays');
    assert.ok(
      page.includes("{editingConcept ? 'Update' : 'Create'}"),
      'the submit label still follows the edit mode',
    );
    assert.ok(CANCEL.includes('type="button"'), 'Cancel stays a plain button');
    assert.ok(CANCEL.includes('onClick={() => setShowForm(false)}'), 'Cancel still closes the form');
    assert.ok(CANCEL.includes('className="btn btn-secondary focus-visible:outline-2 focus-visible:outline-primary"'), 'Cancel classes are untouched');
    assert.ok(CANCEL.includes('disabled={saving}'), 'Cancel disables while saving');
    assert.equal(CANCEL.includes('aria-busy'), false, 'no aria-busy on Cancel');
  });

  it('keeps handleDelete declared with the confirmation', () => {
    assert.ok(
      page.includes('async function handleDelete(conceptId: string, button?: HTMLElement) {'),
      'handleDelete keeps its signature',
    );
    assert.ok(
      page.includes("if (!confirm('Are you sure you want to delete this concept?')) return;"),
      'delete confirmation stays',
    );
  });

  it('matches the file-wide counts', () => {
    assert.equal(count(page, /aria-busy/g), 2, 'the save marker plus the new card marker');
    assert.equal(count(page, /aria-busy=/g), 2, 'two aria-busy attributes');
    assert.equal(count(page, /aria-live/g), 2, 'saving line and deleting line');
    assert.equal(count(page, /role="status"/g), 2, 'saving line and deleting line');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert is added');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby/g), 0, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic/g), 0, 'no aria-atomic is added');
    assert.equal(count(page, /className="sr-only"/g), 2, 'saving line plus the deleting line');
    assert.equal(count(page, /role="/g), 2, 'the two status lines');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Deleting the concept'), false, `${file} gained the status copy`);
      assert.equal(other.includes('concept-delete-busy'), false, `${file} gained busy wiring`);
    }
  });
});
