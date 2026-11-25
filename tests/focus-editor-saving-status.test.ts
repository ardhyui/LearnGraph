/**
 * Subject saving is announced (`FocusEditor`).
 *
 * "Save subjects" calls `setLearnerProfile`, which flips `saving` true. While
 * saving the submit button only faded (`disabled` + `disabled:opacity-60`) and
 * showed an `aria-hidden` spinner: its accessible name stayed the same, there
 * was no `aria-busy`, and no live region spoke, so a screen reader could not
 * tell that the subjects were being saved and the button looked frozen.
 *
 * This file locks `aria-busy={saving}` right after `disabled={saving ||
 * domains === null}` on the submit button with its type, classes, label and
 * spinner untouched, a new `sr-only` polite `role="status"` line after the
 * two-button row and before `</form>` that says `Saving your subjects…` while
 * saving and clears when idle, the existing "Loading subjects…" `role="status"`
 * line and `role="alert"` error, the untouched `submit`/`toggle`/`onKeyDown`
 * flows, and that no server function, RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const EDITOR_FILE = join(ROOT, 'src', 'components', 'FocusEditor.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const editor = source(EDITOR_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The editor form, from its `<form>` to its closing `</form>`. */
const formStart = editor.indexOf('<form');
assert.ok(formStart > 0, 'the focus editor form is rendered');
const formEnd = editor.indexOf('</form>', formStart) + '</form>'.length;
const form = editor.slice(formStart, formEnd);
assert.ok(form.includes('Save subjects'), 'the form holds the submit button');

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

const SAVE = buttonOf('Save subjects');
const CANCEL = buttonOf('Cancel');

describe('FocusEditor: the submit button announces it is busy', () => {
  it('adds aria-busy={saving} right after disabled={saving || domains === null}', () => {
    assert.ok(SAVE.includes('type="submit"'), 'the button stays a submit');
    assert.ok(SAVE.includes('disabled={saving || domains === null}'), 'disabled stays driven by saving and domains');
    assert.ok(SAVE.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      SAVE.indexOf('disabled={saving || domains === null}') < SAVE.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(editor, /aria-busy=/g), 1, 'one aria-busy in the component');
  });

  it('keeps the submit classes, label and spinner untouched', () => {
    assert.ok(
      SAVE.includes(
        'className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"',
      ),
      'submit classes untouched',
    );
    assert.equal(count(form, /Save subjects/g), 1, 'the submit label stays once');
    assert.ok(
      form.includes('{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}'),
      'the existing spinner stays hidden and unchanged',
    );
  });
});

describe('FocusEditor: one polite status line after the buttons', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the saving line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(form, /aria-live="polite"/g), 1, 'one polite live region in the form');
    assert.equal(count(form, /role="status"/g), 2, 'the loading line plus one saving line');
  });

  it('says Saving your subjects… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{saving ? 'Saving your subjects…' : ''}"),
      'the status text follows saving',
    );
    assert.equal(count(form, /Saving your subjects…/g), 1, 'the status copy appears once');
  });

  it('sits after the two-button row as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the saving line is present');
    const buttonRow = form.lastIndexOf('<div className="mt-3 flex flex-wrap gap-2">', statusStart);
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

describe('FocusEditor: the other button and the existing status lines stay', () => {
  it('leaves Cancel disabled while saving without aria-busy', () => {
    assert.ok(CANCEL.includes('type="button"'), 'Cancel stays a plain button');
    assert.ok(CANCEL.includes('disabled={saving}'), 'Cancel still disables while saving');
    assert.equal(CANCEL.includes('aria-busy'), false, 'no aria-busy on Cancel');
  });

  it('keeps the "Loading subjects…" role="status" line without aria-live', () => {
    assert.ok(
      form.includes(
        '<p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">',
      ),
      'the loading line keeps its role and classes',
    );
    const loadingStart = form.indexOf('role="status"');
    const loadingEnd = form.indexOf('</p>', loadingStart);
    assert.equal(
      form.slice(loadingStart, loadingEnd).includes('aria-live'),
      false,
      'the loading line carries no aria-live',
    );
    assert.ok(form.includes('Loading subjects…'), 'the loading copy stays');
  });

  it('keeps the single role="alert" error line', () => {
    assert.equal(count(editor, /role="alert"/g), 1, 'one alert line for errors');
    assert.ok(
      editor.includes('<p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">'),
      'the error line keeps its role and classes',
    );
  });

  it('keeps the heading, hint, choices and test id', () => {
    assert.ok(editor.includes('aria-labelledby={ids.heading}'), 'the form keeps its heading label');
    assert.ok(editor.includes('data-testid="focus-editor"'), 'the editor keeps its test id');
    assert.ok(
      editor.includes('What should {learnerName}’s plan focus on?'),
      'the heading copy stays',
    );
    assert.ok(
      editor.includes('<SubjectChoices domains={domains} chosen={chosen} onToggle={toggle} disabled={saving} />'),
      'the choices stay disabled while saving',
    );
  });
});

describe('FocusEditor: the flows stay intact and no data path is added', () => {
  it('keeps the submit flow without a finally', () => {
    assert.ok(editor.includes('const submit = async (e: FormEvent) => {'), 'submit stays');
    assert.ok(editor.includes('if (!db || saving || domains === null) return;'), 'the guard stays');
    assert.ok(editor.includes('if (sameSubjects(chosen, focus)) {'), 'the unchanged check stays');
    assert.ok(editor.includes('setSaving(true);'), 'saving still starts with the request');
    assert.ok(editor.includes('setError(null);'), 'the error still clears first');
    assert.ok(editor.includes('await db.getLearnerProfile(learnerId);'), 'the fresh profile read stays');
    assert.ok(
      editor.includes('await db.setLearnerProfile(learnerId, { tags: withFocus(profile.tags, chosen) });'),
      'the save call stays',
    );
    assert.ok(editor.includes('await onSaved(learnerId, chosen);'), 'the parent callback stays');
    assert.ok(editor.includes('setError(`Could not save your subjects:'), 'the error copy stays');
    assert.ok(editor.includes('setSaving(false);'), 'saving still clears in the catch');
    assert.equal(/finally\s*{/.test(editor), false, 'no finally was added');
  });

  it('keeps toggle and the Escape handler', () => {
    assert.ok(editor.includes('const toggle = (domain: string, on: boolean) =>'), 'toggle stays');
    assert.ok(editor.includes('const onKeyDown = (e: KeyboardEvent) => {'), 'onKeyDown stays');
    assert.ok(editor.includes("if (e.key === 'Escape' && !saving) {"), 'Escape still waits for saving');
  });

  it('adds no aria-label, extra aria-labelledby or aria-atomic', () => {
    assert.equal(count(editor, /aria-label=/g), 0);
    assert.equal(count(editor, /aria-labelledby=/g), 1, 'the form keeps its single heading label');
    assert.equal(count(editor, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migrat/i.test(editor), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Saving your subjects'), false, `${file} gained the status copy`);
      assert.equal(other.includes('focus-editor-busy'), false, `${file} gained busy wiring`);
    }
  });
});
