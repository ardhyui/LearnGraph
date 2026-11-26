/**
 * Saving a concept is announced (`/admin/concepts`).
 *
 * The **Create** / **Update** submit button only closed the form while
 * `createConcept`/`updateConcept` ran: it had no `disabled`, no `aria-busy`
 * and the page had no live region, so a screen reader never heard that the
 * concept was being saved and a double click could send the save twice. The
 * same button + status pattern is already used on `/sign-in`,
 * `/forgot-password`, `/reset-password`, the `/learn` self-report and concept
 * quiz, `DeleteAccount`, both **Ask an AI tutor** buttons, the snooze buttons,
 * **Create a read-only key**, **Save subjects**, the `/japanese` buttons,
 * **Start learning**, the admin draft/save buttons, **Refresh** on `/gaps`,
 * `/graph`, `/combined-graph`, `/progress`, `/recommendations`, `/status`,
 * the profile save buttons, **Refresh study plan**, **Run All Tests** and
 * **Import from a file**.
 *
 * This file locks the new `saving` state and guard, `aria-busy={saving}`
 * right after `disabled={saving}` on the submit button with its type, classes,
 * icon and label untouched, a disabled Cancel without `aria-busy`, one
 * `sr-only` polite `role="status"` line after the two-button row and before
 * `</form>`, the untouched delete/form flows, and that no server function, RPC
 * schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'admin', 'concepts.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The concepts form, from its `<form>` to its closing `</form>`. */
const formStart = page.indexOf('<form onSubmit={handleSubmit}');
assert.ok(formStart > 0, 'the concept form is rendered');
const formEnd = page.indexOf('</form>', formStart) + '</form>'.length;
const form = page.slice(formStart, formEnd);
assert.ok(form.includes('Save'), 'the form holds the submit button');

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

const SUBMIT = buttonOf("'Update'");
const CANCEL = buttonOf('Cancel');

/** `handleSubmit`, from its signature to `handleDelete`. */
const submitStart = page.indexOf('async function handleSubmit');
assert.ok(submitStart > 0, 'handleSubmit is declared');
const submitEnd = page.indexOf('async function handleDelete', submitStart);
assert.ok(submitEnd > submitStart, 'handleSubmit keeps its body before handleDelete');
const SUBMIT_FLOW = page.slice(submitStart, submitEnd);

describe('/admin/concepts: the submit button announces it is busy', () => {
  it('adds disabled and aria-busy right after the submit class', () => {
    assert.ok(SUBMIT.includes('type="submit"'), 'the button stays a submit');
    assert.ok(
      SUBMIT.includes('className="btn btn-success flex items-center gap-2"'),
      'the submit classes are untouched',
    );
    assert.ok(SUBMIT.includes('disabled={saving}'), 'disabled is driven by saving');
    assert.ok(SUBMIT.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    const typeAt = SUBMIT.indexOf('type="submit"');
    const classAt = SUBMIT.indexOf('className="btn btn-success flex items-center gap-2"');
    const disabledAt = SUBMIT.indexOf('disabled={saving}');
    const busyAt = SUBMIT.indexOf('aria-busy={saving}');
    assert.ok(
      typeAt < classAt && classAt < disabledAt && disabledAt < busyAt,
      'type, class, disabled and aria-busy stay in order',
    );
    assert.equal(count(page, /aria-busy=/g), 1, 'one aria-busy in the page');
  });

  it('keeps the Save icon and the Create/Update label', () => {
    assert.ok(SUBMIT.includes('<Save className="w-4 h-4" />'), 'the Save icon stays');
    assert.ok(
      form.includes("{editingConcept ? 'Update' : 'Create'}"),
      'the visible label still follows the edit mode',
    );
  });
});

describe('/admin/concepts: saving is guarded and always cleared', () => {
  it('declares saving right after the error state', () => {
    assert.ok(
      page.includes(
        "const [error, setError] = useState('');\n  const [saving, setSaving] = useState(false);",
      ),
      'saving is declared after error',
    );
  });

  it('guards double submits and starts saving after resetting the error', () => {
    assert.match(
      SUBMIT_FLOW,
      /async function handleSubmit\(e: React\.FormEvent\) \{\s*if \(saving\) return;\s*e\.preventDefault\(\);/,
      'the guard is the first statement and preventDefault still runs',
    );
    const errorAt = SUBMIT_FLOW.indexOf("setError('');");
    const savingAt = SUBMIT_FLOW.indexOf('setSaving(true);');
    assert.ok(errorAt > 0, 'the error is still reset');
    assert.ok(savingAt > errorAt, 'saving starts right after the error reset');
  });

  it('clears saving in the finally of the existing try/catch', () => {
    assert.match(
      SUBMIT_FLOW,
      /catch \(err\) \{\s*setError\(err instanceof Error \? err\.message : 'An error occurred'\);\s*\} finally \{\s*setSaving\(false\);\s*\}/,
      'the existing catch is followed by a finally that clears saving',
    );
    assert.equal(count(SUBMIT_FLOW, /finally \{/g), 1, 'no extra finally is added');
  });
});

describe('/admin/concepts: one polite status line after the buttons', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the saving line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(page, /role="status"/g), 1, 'one status line on the page');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert is added');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby=/g), 0, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic is added');
    assert.equal(count(page, /className="sr-only"/g), 1, 'the saving line is the only sr-only node');
  });

  it('says Saving the concept… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{saving ? 'Saving the concept…' : ''}"),
      'the status text follows saving',
    );
    assert.equal(count(page, /Saving the concept…/g), 1, 'the status copy appears once');
  });

  it('sits after the two-button row as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the saving line is present');
    const buttonRow = form.lastIndexOf('<div className="flex gap-3 pt-2">', statusStart);
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

describe('/admin/concepts: Cancel and the existing flows stay intact', () => {
  it('leaves Cancel disabled while saving without aria-busy', () => {
    assert.ok(CANCEL.includes('type="button"'), 'Cancel stays a plain button');
    assert.ok(CANCEL.includes('onClick={() => setShowForm(false)}'), 'Cancel still closes the form');
    assert.ok(CANCEL.includes('className="btn btn-secondary"'), 'Cancel classes are untouched');
    assert.ok(CANCEL.includes('disabled={saving}'), 'Cancel disables while saving');
    assert.equal(CANCEL.includes('aria-busy'), false, 'no aria-busy on Cancel');
  });

  it('keeps the form assembly and save calls', () => {
    assert.ok(SUBMIT_FLOW.includes('conceptId: formData.conceptId,'), 'the concept id stays');
    assert.ok(SUBMIT_FLOW.includes('difficulty: {'), 'the difficulty block stays');
    assert.ok(SUBMIT_FLOW.includes('await updateConcept(conceptData);'), 'the update call stays');
    assert.ok(SUBMIT_FLOW.includes('await createConcept(conceptData);'), 'the create call stays');
    assert.ok(SUBMIT_FLOW.includes('setShowForm(false);'), 'the form still closes on success');
    assert.ok(SUBMIT_FLOW.includes('setEditingConcept(null);'), 'the edit mode still clears');
    assert.ok(SUBMIT_FLOW.includes('resetForm();'), 'the form still resets');
  });

  it('keeps handleDelete, openNewForm, openEditForm and resetForm', () => {
    assert.ok(
      page.includes('async function handleDelete(conceptId: string, button?: HTMLElement) {'),
      'handleDelete stays',
    );
    assert.ok(
      page.includes("if (!confirm('Are you sure you want to delete this concept?')) return;"),
      'delete confirmation stays',
    );
    assert.ok(page.includes('rememberRowFocus(button)'), 'row focus is still remembered');
    assert.ok(page.includes('restoreRowFocus(focus)'), 'row focus is still restored');
    assert.ok(page.includes('function resetForm() {'), 'resetForm stays');
    assert.ok(page.includes('function openEditForm(concept: ConceptNode) {'), 'openEditForm stays');
    assert.ok(page.includes('function openNewForm() {'), 'openNewForm stays');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Saving the concept'), false, `${file} gained the status copy`);
    }
  });
});
