/**
 * Keyboard focus is visible on all eight buttons of `/admin/concepts`
 * (`src/routes/admin/concepts.tsx`).
 *
 * The page renders the error-banner close, the toolbar **Add Concept**, the
 * form close, the form Create/Update submit, **Cancel**, the empty-state
 * **Add Concept**, and the per-card Edit/Delete buttons. None of them
 * had a `:focus-visible` style and `src/styles.css` has no global rule, so a
 * keyboard user tabbing from the domain filter to any button saw no focus
 * indicator. Six of the eight also had no `type`, so they could act as submit
 * buttons if they ever move inside a form. This file locks the exact class
 * string of every button (with the focus pair at the end), the
 * `type="submit"` of the form submit and `type="button"` on the other seven,
 * the handlers, labels, icons, busy markers, status lines and file-wide
 * counts. No server function, RPC schema or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'admin', 'concepts.tsx');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** Every button element, in source order. */
const buttons: string[] = [];
for (let start = page.indexOf('<button'); start !== -1; start = page.indexOf('<button', start)) {
  const close = page.indexOf('</button>', start) + '</button>'.length;
  buttons.push(page.slice(start, close));
  start = close;
}
assert.equal(buttons.length, 8, 'the page renders exactly eight buttons');

const buttonAround = (anchor: string) => {
  const at = page.indexOf(anchor);
  assert.ok(at > 0, `the anchor ${anchor} is present`);
  const open = page.lastIndexOf('<button', at);
  const close = page.indexOf('</button>', open) + '</button>'.length;
  return page.slice(open, close);
};

const ERROR_CLOSE = buttonAround('onClick={() => setError(\'\')}');
const TOOLBAR_ADD = buttonAround(
  'onClick={openNewForm} className="btn btn-primary flex items-center gap-2',
);
const FORM_CLOSE = buttonAround(
  'className="p-2 rounded-lg hover:bg-muted transition-colors',
);
const SUBMIT = buttonAround('aria-busy={saving}');
const CANCEL = buttonAround('className="btn btn-secondary');
const EMPTY_ADD = buttonAround(
  'onClick={openNewForm} className="btn btn-primary focus-visible',
);
const EDIT = buttonAround('onClick={() => openEditForm(concept)}');
const DELETE = buttonAround('onClick={(e) => handleDelete(concept.conceptId, e.currentTarget)}');

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';

const CLASSES = {
  errorClose: 'ml-auto text-destructive/70 hover:text-destructive',
  toolbarAdd: 'btn btn-primary flex items-center gap-2',
  formClose: 'p-2 rounded-lg hover:bg-muted transition-colors',
  submit: 'btn btn-success flex items-center gap-2',
  cancel: 'btn btn-secondary',
  emptyAdd: 'btn btn-primary',
  edit: 'p-2 rounded-lg hover:bg-blue-500/10 text-blue-500 transition-colors',
  delete: 'p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors',
};

const ELEMENTS = [
  ['error close', ERROR_CLOSE, CLASSES.errorClose],
  ['toolbar Add Concept', TOOLBAR_ADD, CLASSES.toolbarAdd],
  ['form close', FORM_CLOSE, CLASSES.formClose],
  ['form submit', SUBMIT, CLASSES.submit],
  ['Cancel', CANCEL, CLASSES.cancel],
  ['empty-state Add Concept', EMPTY_ADD, CLASSES.emptyAdd],
  ['Edit', EDIT, CLASSES.edit],
  ['Delete', DELETE, CLASSES.delete],
] as const;

describe('/admin/concepts: every button shows keyboard focus', () => {
  it('carries its exact class string with the focus pair at the end', () => {
    for (const [name, element, base] of ELEMENTS) {
      const expected = `${base} ${FOCUS_PAIR}`;
      assert.ok(
        element.includes(`className="${expected}"`),
        `${name} carries the focus pair after its old classes`,
      );
      assert.ok(expected.endsWith(FOCUS_PAIR), `${name} ends with the focus pair`);
      assert.equal(
        element.indexOf(expected),
        element.indexOf(`"${expected}"`) + 1,
        `${name} uses one plain class attribute`,
      );
    }
  });

  it('carries the focus pair exactly once per button', () => {
    for (const [name, element] of ELEMENTS) {
      assert.equal(count(element, /focus-visible/g), 2, `${name} has both focus classes`);
    }
  });
});

describe('/admin/concepts: button types and behaviour stay locked', () => {
  it('keeps exactly one submit button and seven plain buttons', () => {
    assert.ok(SUBMIT.includes('type="submit"'), 'the form submit stays a submit');
    assert.equal(SUBMIT.includes('type="button"'), false, 'the submit is not a plain button');
    for (const [name, element, base] of ELEMENTS) {
      if (name === 'form submit') continue;
      assert.ok(element.includes('type="button"'), `${name} is a plain button`);
      assert.ok(
        element.indexOf('type="button"') < element.indexOf('className='),
        `${name} puts type before className`,
      );
      assert.ok(base.length > 0, `${name} keeps its old classes`);
    }
    assert.equal(count(page, /type="submit"/g), 1, 'one submit button stays');
    assert.equal(count(page, /type="button"/g), 7, 'seven plain buttons stay');
  });

  it('keeps the error banner close handler and icon', () => {
    assert.ok(ERROR_CLOSE.includes('onClick={() => setError(\'\')}'), 'closing the banner stays');
    assert.ok(ERROR_CLOSE.includes('<X className="w-4 h-4" />'), 'the small X stays');
    assert.ok(
      ERROR_CLOSE.indexOf('type="button"') < ERROR_CLOSE.indexOf('onClick='),
      'type comes before the handler',
    );
  });

  it('keeps both Add Concept buttons, their handler, icon and label', () => {
    for (const [name, element] of [
      ['toolbar', TOOLBAR_ADD],
      ['empty state', EMPTY_ADD],
    ] as const) {
      assert.ok(element.includes('onClick={openNewForm}'), `${name} Add Concept keeps its handler`);
      assert.ok(element.includes('<Plus'), `${name} Add Concept keeps its Plus icon`);
      assert.ok(element.includes('Add Concept'), `${name} Add Concept keeps its label`);
      assert.ok(
        element.indexOf('type="button"') < element.indexOf('onClick='),
        `${name} Add Concept puts type before the handler`,
      );
    }
    assert.ok(EMPTY_ADD.includes('<Plus className="w-4 h-4 mr-2" />'), 'the empty-state icon stays');
  });

  it('keeps the form close and Cancel closing the form', () => {
    assert.ok(FORM_CLOSE.includes('onClick={() => setShowForm(false)}'), 'the X closes the form');
    assert.ok(
      FORM_CLOSE.includes('<X className="w-5 h-5 text-muted-foreground" />'),
      'the large X stays',
    );
    assert.ok(CANCEL.includes('onClick={() => setShowForm(false)}'), 'Cancel closes the form');
    assert.ok(CANCEL.includes('Cancel'), 'the Cancel label stays');
    assert.ok(
      FORM_CLOSE.indexOf('type="button"') < FORM_CLOSE.indexOf('onClick='),
      'the X puts type before the handler',
    );
  });

  it('keeps the submit busy marker, icon and label', () => {
    assert.ok(SUBMIT.includes('disabled={saving}'), 'the submit disables while saving');
    assert.ok(SUBMIT.includes('aria-busy={saving}'), 'the submit announces it is busy');
    assert.ok(
      SUBMIT.indexOf('className=') < SUBMIT.indexOf('disabled={saving}') &&
        SUBMIT.indexOf('disabled={saving}') < SUBMIT.indexOf('aria-busy={saving}'),
      'class, disabled and aria-busy stay in order',
    );
    assert.ok(SUBMIT.includes('<Save className="w-4 h-4" />'), 'the Save icon stays');
    assert.ok(
      SUBMIT.includes("{editingConcept ? 'Update' : 'Create'}"),
      'the Create/Update label stays',
    );
    assert.ok(CANCEL.includes('disabled={saving}'), 'Cancel keeps its disabled state');
    assert.equal(CANCEL.includes('aria-busy'), false, 'Cancel still has no busy marker');
  });

  it('keeps the per-card Edit and Delete buttons', () => {
    assert.ok(EDIT.includes('onClick={() => openEditForm(concept)}'), 'Edit keeps its handler');
    assert.ok(EDIT.includes('title="Edit"'), 'Edit keeps its title');
    assert.ok(EDIT.includes('<Edit className="w-4 h-4" />'), 'Edit keeps its icon');
    assert.ok(DELETE.includes('title="Delete"'), 'Delete keeps its title');
    assert.ok(DELETE.includes('<Trash2 className="w-4 h-4" />'), 'Delete keeps its icon');
    assert.ok(DELETE.includes('disabled={deleting !== null}'), 'every card disables while deleting');
    assert.ok(
      DELETE.includes('aria-busy={deleting === concept.conceptId}'),
      'only the deleted card is busy',
    );
    assert.ok(
      DELETE.indexOf('className=') < DELETE.indexOf('disabled={deleting !== null}') &&
        DELETE.indexOf('disabled={deleting !== null}') <
          DELETE.indexOf('aria-busy={deleting === concept.conceptId}'),
      'class, disabled and aria-busy stay in order',
    );
    assert.equal(EDIT.includes('aria-busy'), false, 'Edit stays without a busy marker');
  });
});

describe('/admin/concepts: the rest of the page stays', () => {
  it('keeps both status lines and the error banner', () => {
    assert.ok(
      page.includes("<p role=\"status\" aria-live=\"polite\" className=\"sr-only\">{saving ? 'Saving the concept…' : ''}</p>"),
      'the saving status line stays',
    );
    assert.ok(
      page.includes("<p role=\"status\" aria-live=\"polite\" className=\"sr-only\">{deleting ? 'Deleting the concept…' : ''}</p>"),
      'the deleting status line stays',
    );
    assert.ok(
      page.includes(
        'className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3"',
      ),
      'the error banner wrapper stays',
    );
  });

  it('matches the file-wide counts', () => {
    assert.equal(count(page, /focus-visible/g), 16, 'one focus pair per button');
    assert.equal(count(page, /<button/g), 8, 'the eight buttons stay');
    assert.equal(count(page, /type="submit"/g), 1, 'one submit button');
    assert.equal(count(page, /type="button"/g), 7, 'seven plain buttons');
    assert.equal(count(page, /aria-busy/g), 2, 'submit and Delete keep their busy markers');
    assert.equal(count(page, /aria-live/g), 2, 'the two status lines stay');
    assert.equal(count(page, /role=/g), 2, 'the alert and the two status roles');
    assert.equal(count(page, /className="sr-only"/g), 2, 'the two sr-only status lines');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(page),
      false,
      'the page adds no data path',
    );
    assert.equal(
      source(SCHEMAS_FILE).includes('focus-visible:outline-primary'),
      false,
      'the RPC schemas gained page focus styles',
    );
  });
});
