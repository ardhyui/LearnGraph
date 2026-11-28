/**
 * Keyboard focus is visible on all eight buttons of admin → Learners
 * (`src/routes/admin/learners.tsx`).
 *
 * The page renders eight buttons: the error banner close, **Add Learner** in
 * the toolbar, the form close, Create / Update, **Cancel**, **Add
 * Learner** in the empty state, **Edit** and **Delete** on every row. None of
 * them had a `:focus-visible` style, while `src/styles.css` has no global rule,
 * so a keyboard user tabbing through the page saw no focus indicator. Seven of
 * them also had no `type`, which would make them submit buttons if they ever
 * moved inside a form. This file locks **type** first on all eight, the exact
 * class string with the two focus classes appended at the end, each handler,
 * title, icon and label, the existing `disabled`/`aria-busy` wiring and the
 * file-wide counts. The buttons stay synchronous apart from the existing
 * Save/Delete flows, so no new `aria-busy` or live region is added. No server
 * function, RPC schema or migration is added.
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

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';

/** The whole `<button>...</button>` element around a unique anchor. */
const buttonAt = (anchor: string) => {
  assert.equal(page.split(anchor).length - 1, 1, `the "${anchor}" anchor appears once`);
  const idx = page.indexOf(anchor);
  const open = page.lastIndexOf('<button', idx);
  assert.ok(open >= 0, `the "${anchor}" button has an opening tag`);
  const close = page.indexOf('</button>', open);
  assert.ok(close > open, `the "${anchor}" button is closed`);
  return page.slice(open, close + '</button>'.length);
};

const BANNER = buttonAt("onClick={() => setError('')}");
const ADD_HEADER = buttonAt('btn btn-primary flex items-center gap-2 focus-visible');
const FORM_CLOSE = buttonAt('p-2 rounded-lg hover:bg-muted transition-colors');
const SUBMIT = buttonAt('type="submit"');
const CANCEL = buttonAt('Cancel');
const ADD_EMPTY = buttonAt('btn btn-primary focus-visible');
const EDIT = buttonAt('title="Edit"');
const DELETE = buttonAt('title="Delete"');

/** The eight buttons with their exact class string and first-attribute type. */
const BUTTONS: Array<{ name: string; element: string; className: string; type: string }> = [
  {
    name: 'error banner close',
    element: BANNER,
    className: `ml-auto text-destructive/70 hover:text-destructive ${FOCUS_PAIR}`,
    type: 'button',
  },
  {
    name: 'header Add Learner',
    element: ADD_HEADER,
    className: `btn btn-primary flex items-center gap-2 ${FOCUS_PAIR}`,
    type: 'button',
  },
  {
    name: 'form close',
    element: FORM_CLOSE,
    className: `p-2 rounded-lg hover:bg-muted transition-colors ${FOCUS_PAIR}`,
    type: 'button',
  },
  {
    name: 'submit',
    element: SUBMIT,
    className: `btn btn-success flex items-center gap-2 ${FOCUS_PAIR}`,
    type: 'submit',
  },
  {
    name: 'Cancel',
    element: CANCEL,
    className: `btn btn-secondary ${FOCUS_PAIR}`,
    type: 'button',
  },
  {
    name: 'empty state Add Learner',
    element: ADD_EMPTY,
    className: `btn btn-primary ${FOCUS_PAIR}`,
    type: 'button',
  },
  {
    name: 'Edit',
    element: EDIT,
    className: `p-2 rounded-lg hover:bg-blue-500/10 text-blue-500 transition-colors ${FOCUS_PAIR}`,
    type: 'button',
  },
  {
    name: 'Delete',
    element: DELETE,
    className: `p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors ${FOCUS_PAIR}`,
    type: 'button',
  },
];

describe('/admin/learners: every button shows keyboard focus', () => {
  it('each button carries its exact class string with the focus pair at the end', () => {
    for (const { name, element, className } of BUTTONS) {
      assert.ok(element.includes(`className="${className}"`), `${name} keeps its exact classes`);
      assert.ok(className.endsWith(FOCUS_PAIR), `${name} ends with the focus pair`);
    }
  });

  it('each button carries the focus pair exactly once', () => {
    for (const { name, element } of BUTTONS) {
      assert.equal(count(element, /focus-visible/g), 2, `${name} has both focus classes`);
    }
  });

  it('each button declares its type as the first attribute', () => {
    for (const { name, element, type } of BUTTONS) {
      assert.match(element, new RegExp(`^<button\\s+type="${type}"`), `${name} starts with its type`);
    }
  });

  it('keeps type before the handler and the class string', () => {
    for (const { name, element } of BUTTONS) {
      const typeAt = element.indexOf('type="');
      assert.ok(typeAt > 0, `${name} declares its type`);
      if (element.includes('onClick=')) {
        assert.ok(typeAt < element.indexOf('onClick='), `${name} puts type before its handler`);
      }
      if (element.includes('className=')) {
        assert.ok(typeAt < element.indexOf('className='), `${name} puts type before its class`);
      }
    }
  });
});

describe('/admin/learners: the buttons keep their behaviour', () => {
  it('the error banner close still clears the error', () => {
    assert.ok(BANNER.includes('onClick={() => setError(\'\')}'), 'the dismiss handler stays');
    assert.ok(BANNER.includes('<X className="w-4 h-4" />'), 'the small X icon stays');
  });

  it('both Add Learner buttons still open a new form', () => {
    for (const [name, element] of [
      ['header', ADD_HEADER],
      ['empty state', ADD_EMPTY],
    ] as const) {
      assert.ok(element.includes('onClick={openNewForm}'), `${name} opens the new form`);
      assert.ok(element.includes('Add Learner'), `${name} keeps its label`);
    }
    assert.ok(ADD_HEADER.includes('<Plus className="w-4 h-4" />'), 'the header Plus icon stays');
    assert.ok(ADD_EMPTY.includes('<Plus className="w-4 h-4 mr-2" />'), 'the empty state Plus icon stays');
  });

  it('the form close and Cancel still close the form', () => {
    for (const [name, element] of [
      ['form close', FORM_CLOSE],
      ['Cancel', CANCEL],
    ] as const) {
      assert.ok(element.includes('onClick={() => setShowForm(false)}'), `${name} closes the form`);
    }
    assert.ok(
      FORM_CLOSE.includes('<X className="w-5 h-5 text-muted-foreground" />'),
      'the large X icon stays',
    );
    assert.ok(CANCEL.includes('Cancel'), 'the Cancel label stays');
  });

  it('the submit keeps its type, icon and label in order without a busy marker', () => {
    assert.ok(SUBMIT.includes('<Save className="w-4 h-4" />'), 'the Save icon stays');
    assert.ok(
      SUBMIT.includes("{editingLearner ? 'Update' : 'Create'}"),
      'the label still follows the edit mode',
    );
    assert.equal(SUBMIT.includes('disabled'), false, 'no disabled is added');
    assert.equal(SUBMIT.includes('aria-busy'), false, 'no aria-busy is added');
    const typeAt = SUBMIT.indexOf('type="submit"');
    const classAt = SUBMIT.indexOf('className=');
    assert.ok(typeAt < classAt, 'type sits before the class string');
  });

  it('Cancel stays a plain close button without a busy marker', () => {
    assert.equal(CANCEL.includes('disabled'), false, 'no disabled on Cancel');
    assert.equal(CANCEL.includes('aria-busy'), false, 'no aria-busy on Cancel');
  });

  it('the per-row Edit button still opens the edit form without a busy marker', () => {
    assert.ok(EDIT.includes('onClick={() => openEditForm(learner)}'), 'Edit opens the form');
    assert.ok(EDIT.includes('title="Edit"'), 'Edit keeps its title');
    assert.ok(EDIT.includes('<Edit className="w-4 h-4" />'), 'the Edit icon stays');
    assert.equal(EDIT.includes('disabled'), false, 'no disabled on Edit');
    assert.equal(EDIT.includes('aria-busy'), false, 'no aria-busy on Edit');
  });

  it('the per-row Delete button keeps its focus and busy wiring', () => {
    assert.ok(
      DELETE.includes('onClick={(e) => handleDelete(learner.userId, e.currentTarget)}'),
      'Delete still passes its element for focus restoration',
    );
    assert.ok(DELETE.includes('title="Delete"'), 'Delete keeps its title');
    assert.ok(DELETE.includes('<Trash2 className="w-4 h-4" />'), 'the trash icon stays');
    assert.ok(DELETE.includes('disabled={deleting !== null}'), 'every row disables while deleting');
    assert.ok(
      DELETE.includes('aria-busy={deleting === learner.userId}'),
      'only the deleted row is busy',
    );
    assert.ok(
      DELETE.indexOf('className=') < DELETE.indexOf('disabled={deleting !== null}') &&
        DELETE.indexOf('disabled={deleting !== null}') <
          DELETE.indexOf('aria-busy={deleting === learner.userId}'),
      'class, disabled and aria-busy stay in order',
    );
  });
});

describe('/admin/learners: the page structure stays', () => {
  it('keeps the form, import label and status lines', () => {
    assert.ok(page.includes('<form onSubmit={handleSubmit}'), 'the learner form stays');
    assert.ok(
      page.includes(
        '<label className="btn btn-secondary flex cursor-pointer items-center gap-2 focus-within:ring-2 focus-within:ring-primary" aria-busy={importing}>',
      ),
      'the import label keeps its focus-within ring',
    );
    assert.ok(
      page.includes("{importing ? 'Importing the learner file…' : ''}"),
      'the importing status line stays',
    );
    assert.ok(
      page.includes("{deleting ? 'Deleting the learner…' : ''}"),
      'the deleting status line stays',
    );
    assert.ok(page.includes('data-testid="import-notice"'), 'the import notice stays');
    assert.ok(page.includes('function openEditForm(learner:'), 'openEditForm stays');
    assert.ok(page.includes('function openNewForm()'), 'openNewForm stays');
    assert.ok(page.includes('async function handleDelete('), 'handleDelete stays');
  });
});

describe('/admin/learners: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(page, /focus-visible/g), 16, 'a focus pair on each of the eight buttons');
    assert.equal(count(page, /<button/g), 8, 'the eight buttons stay');
    assert.equal(count(page, /type="button"/g), 7, 'seven plain buttons');
    assert.equal(count(page, /type="submit"/g), 1, 'one submit button');
    assert.equal(count(page, /aria-busy/g), 2, 'the import and delete markers stay');
    assert.equal(count(page, /aria-live/g), 3, 'the three status lines stay');
    assert.equal(count(page, /role=/g), 18, 'the table semantics and status roles stay');
    assert.equal(count(page, /className="sr-only"/g), 3, 'the three sr-only lines stay');
    assert.equal(count(page, /focus-within/g), 2, 'the import label keeps its focus-within classes');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
    assert.equal(count(page, /title="Edit"/g), 1, 'Edit keeps its title');
    assert.equal(count(page, /title="Delete"/g), 1, 'Delete keeps its title');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migration/i.test(page),
      false,
      'the page adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      assert.equal(source(file).includes(FOCUS_PAIR), false, `${file} gained page focus styles`);
    }
  });
});
