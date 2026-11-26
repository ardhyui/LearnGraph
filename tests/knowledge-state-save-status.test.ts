/**
 * Saving a knowledge state is announced (`/admin/states`).
 *
 * The **Save** submit button only closed the form while `setKnowledgeState`
 * ran: it had no `disabled`, no `aria-busy` and the page had no live region, so
 * a screen reader never heard that the knowledge state was being saved and a
 * double click could send the save twice. The same button + status pattern is
 * already used on `/sign-in`, `/forgot-password`, `/reset-password`, the
 * `/learn` self-report and concept quiz, `DeleteAccount`, both **Ask an AI
 * tutor** buttons, the snooze buttons, **Create a read-only key**, **Save
 * subjects**, the `/japanese` buttons, **Start learning**, the admin
 * draft/save buttons, **Refresh** on `/gaps`, `/graph`, `/combined-graph`,
 * `/progress`, `/recommendations`, `/status`, the profile save buttons,
 * **Refresh study plan**, **Run All Tests**, **Import from a file**, the
 * `/admin/concepts` save form and the `/admin/prerequisites` create form.
 *
 * This file locks the new `saving` state and guard, `aria-busy={saving}`
 * right after `disabled={saving}` on the submit button with its type, classes,
 * icon and label untouched, a disabled Cancel without `aria-busy`, one
 * `sr-only` polite `role="status"` line after the two-button row and before
 * `</form>`, the untouched delete/form flows, the Add Knowledge State guards,
 * and that no server function, RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'admin', 'states.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The knowledge state form, from its `<form>` to its closing `</form>`. */
const formStart = page.indexOf('<form onSubmit={handleSubmit}');
assert.ok(formStart > 0, 'the knowledge state form is rendered');
const formEnd = page.indexOf('</form>', formStart) + '</form>'.length;
const form = page.slice(formStart, formEnd);
assert.ok(form.includes('<Save className="w-4 h-4" />'), 'the form holds the submit button');

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

const SUBMIT = buttonOf('Save');
const CANCEL = buttonOf('Cancel');

/** `handleSubmit`, from its signature to `handleDelete`. */
const submitStart = page.indexOf('async function handleSubmit');
assert.ok(submitStart > 0, 'handleSubmit is declared');
const submitEnd = page.indexOf('async function handleDelete', submitStart);
assert.ok(submitEnd > submitStart, 'handleSubmit keeps its body before handleDelete');
const SUBMIT_FLOW = page.slice(submitStart, submitEnd);

describe('/admin/states: the save button announces it is busy', () => {
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

  it('keeps the Save icon and the Save label', () => {
    assert.ok(SUBMIT.includes('<Save className="w-4 h-4" />'), 'the Save icon stays');
    assert.ok(form.includes('\n                      Save\n'), 'the visible label stays Save');
  });
});

describe('/admin/states: saving is guarded and always cleared', () => {
  it('declares saving right after the error state', () => {
    assert.ok(
      page.includes(
        "const [error, setError] = useState('');\n  const [saving, setSaving] = useState(false);",
      ),
      'saving is declared after error',
    );
  });

  it('guards double submits and keeps the database check before saving starts', () => {
    assert.match(
      SUBMIT_FLOW,
      /async function handleSubmit\(e: React\.FormEvent\) \{\s*if \(saving\) return;\s*e\.preventDefault\(\);/,
      'the guard is the first statement and preventDefault still runs',
    );
    const errorAt = SUBMIT_FLOW.indexOf("setError('');");
    const dbCheckAt = SUBMIT_FLOW.indexOf('if (!db) {');
    const savingAt = SUBMIT_FLOW.indexOf('setSaving(true);');
    assert.ok(errorAt > 0, 'the error is still reset');
    assert.ok(dbCheckAt > errorAt, 'the database check stays');
    assert.ok(savingAt > dbCheckAt, 'saving starts only after the database check');
    assert.ok(
      SUBMIT_FLOW.includes("setError('Database not ready');"),
      'the database-not-ready message stays',
    );
    assert.ok(
      SUBMIT_FLOW.indexOf('return;', dbCheckAt) < savingAt,
      'an unready database returns before the button turns busy',
    );
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

describe('/admin/states: one polite status line after the buttons', () => {
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
    assert.equal(
      count(page, /className="sr-only"/g),
      1,
      'the saving line is the only sr-only node',
    );
  });

  it('says Saving the knowledge state… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{saving ? 'Saving the knowledge state…' : ''}"),
      'the status text follows saving',
    );
    assert.equal(count(page, /Saving the knowledge state…/g), 1, 'the status copy appears once');
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

describe('/admin/states: Cancel and the existing flows stay intact', () => {
  it('leaves Cancel disabled while saving without aria-busy', () => {
    assert.ok(CANCEL.includes('type="button"'), 'Cancel stays a plain button');
    assert.ok(CANCEL.includes('onClick={() => setShowForm(false)}'), 'Cancel still closes the form');
    assert.ok(CANCEL.includes('className="btn btn-secondary"'), 'Cancel classes are untouched');
    assert.ok(CANCEL.includes('disabled={saving}'), 'Cancel disables while saving');
    assert.equal(CANCEL.includes('aria-busy'), false, 'no aria-busy on Cancel');
  });

  it('keeps the save call and form reset', () => {
    assert.ok(
      SUBMIT_FLOW.includes('await db.setKnowledgeState(formData.userId, formData.conceptId, {'),
      'the knowledge state save call stays',
    );
    assert.ok(SUBMIT_FLOW.includes('mastery: formData.mastery,'), 'the mastery stays');
    assert.ok(
      SUBMIT_FLOW.includes(
        'bloomLevel: (BLOOM_LEVELS.indexOf(formData.bloomLevel) + 1 || 2) as 1 | 2 | 3 | 4 | 5 | 6,',
      ),
      'the bloom-level conversion stays',
    );
    assert.ok(SUBMIT_FLOW.includes('setShowForm(false);'), 'the form still closes on success');
    assert.ok(
      SUBMIT_FLOW.includes(
        "setFormData({ userId: '', conceptId: '', mastery: 50, bloomLevel: 'understand' });",
      ),
      'the form still resets',
    );
    assert.ok(SUBMIT_FLOW.includes('fetchStates();'), 'the list still refreshes');
  });

  it('keeps handleDelete and the helper functions', () => {
    assert.ok(
      page.includes(
        'async function handleDelete(userId: string, conceptId: string, button?: HTMLElement) {',
      ),
      'handleDelete stays',
    );
    assert.ok(
      page.includes('if (!confirm(\'Are you sure you want to delete this knowledge state?\')) return;'),
      'delete confirmation stays',
    );
    assert.ok(page.includes('rememberRowFocus(button)'), 'row focus is still remembered');
    assert.ok(page.includes('restoreRowFocus(focus)'), 'row focus is still restored');
    assert.ok(page.includes('const fetchStates = useCallback(async () => {'), 'fetchStates stays');
    assert.ok(
      page.includes('function getLearnerName(userId: string): string {'),
      'getLearnerName stays',
    );
    assert.ok(
      page.includes('function getConceptName(conceptId: string): string {'),
      'getConceptName stays',
    );
    assert.ok(
      page.includes('const filteredStates = useMemo(() => {'),
      'filteredStates stays',
    );
  });

  it('keeps both Add Knowledge State buttons guarded by canCreateState', () => {
    const addButtons = [...page.matchAll(/Add Knowledge State\s*<\/button>/g)];
    assert.equal(addButtons.length, 2, 'both Add Knowledge State buttons stay');
    assert.equal(
      count(page, /disabled=\{!canCreateState\}/g),
      1,
      'the header button keeps its disabled guard',
    );
    assert.ok(
      page.includes(
        '{canCreateState && (\n                <button onClick={() => setShowForm(true)} className="btn btn-primary">',
      ),
      'the empty-state button stays render-guarded',
    );
  });

  it('keeps the knowledge state table roles', () => {
    assert.equal(count(page, /role="table"/g), 1, 'the table role stays');
    assert.equal(count(page, /role="rowgroup"/g), 2, 'both rowgroups stay');
    assert.equal(count(page, /role="columnheader"/g), 6, 'all column headers stay');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Saving the knowledge state'), false, `${file} gained the status copy`);
    }
  });
});
