/**
 * Keyboard focus is visible on all seven buttons of admin → Prerequisites
 * (`src/routes/admin/prerequisites.tsx`).
 *
 * The page renders seven buttons: the error banner close, **Add
 * Prerequisite** in the toolbar, the form close, **Create**, **Cancel**,
 * **Add Prerequisite** in the empty state and **Delete** on every row. None of
 * them had a `:focus-visible` style, while `src/styles.css` has no global rule,
 * so a keyboard user tabbing through the page saw no focus indicator. Six of
 * them also had no `type`, which would make them submit buttons if they ever
 * moved inside a form. This file locks **type** first on all seven, the exact
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
const PAGE_FILE = join(ROOT, 'src', 'routes', 'admin', 'prerequisites.tsx');
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
const ADD_HEADER = buttonAt('btn btn-primary flex items-center gap-2 disabled:opacity-50');
const FORM_CLOSE = buttonAt('p-2 rounded-lg hover:bg-muted transition-colors');
const SUBMIT = buttonAt('type="submit"');
const CANCEL = buttonAt('Cancel');
const ADD_EMPTY = buttonAt('btn btn-primary disabled:opacity-50');
const DELETE = buttonAt('title="Delete"');

/** The seven buttons with their exact class string and first-attribute type. */
const BUTTONS: Array<{ name: string; element: string; className: string; type: string }> = [
  {
    name: 'error banner close',
    element: BANNER,
    className: `ml-auto text-destructive/70 hover:text-destructive ${FOCUS_PAIR}`,
    type: 'button',
  },
  {
    name: 'header Add Prerequisite',
    element: ADD_HEADER,
    className: `btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_PAIR}`,
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
    name: 'empty state Add Prerequisite',
    element: ADD_EMPTY,
    className: `btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_PAIR}`,
    type: 'button',
  },
  {
    name: 'Delete',
    element: DELETE,
    className: `p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors ${FOCUS_PAIR}`,
    type: 'button',
  },
];

describe('/admin/prerequisites: every button shows keyboard focus', () => {
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

describe('/admin/prerequisites: the buttons keep their behaviour', () => {
  it('the error banner close still clears the error', () => {
    assert.ok(BANNER.includes("onClick={() => setError('')}"), 'the dismiss handler stays');
    assert.ok(BANNER.includes('<X className="w-4 h-4" />'), 'the small X icon stays');
  });

  it('both Add Prerequisite buttons still open the form', () => {
    for (const [name, element] of [
      ['header', ADD_HEADER],
      ['empty state', ADD_EMPTY],
    ] as const) {
      assert.ok(element.includes('onClick={() => setShowForm(true)}'), `${name} opens the form`);
      assert.ok(element.includes('disabled={concepts.length < 2}'), `${name} keeps its guard`);
      assert.ok(element.includes('Add Prerequisite'), `${name} keeps its label`);
    }
    assert.ok(ADD_HEADER.includes('<Plus className="w-4 h-4" />'), 'the header Plus icon stays');
    assert.ok(ADD_EMPTY.includes('<Plus className="w-4 h-4 mr-2" />'), 'the empty state Plus icon stays');
    assert.equal(ADD_HEADER.includes('aria-busy'), false, 'no aria-busy on the header Add button');
    assert.equal(ADD_EMPTY.includes('aria-busy'), false, 'no aria-busy on the empty state Add button');
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

  it('the submit keeps its type, icon, label and busy wiring in order', () => {
    assert.ok(SUBMIT.includes('<Save className="w-4 h-4" />'), 'the Save icon stays');
    assert.ok(SUBMIT.includes('\n                      Create\n'), 'the visible label stays Create');
    assert.ok(SUBMIT.includes('disabled={saving}'), 'disabled is driven by saving');
    assert.ok(SUBMIT.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    const typeAt = SUBMIT.indexOf('type="submit"');
    const classAt = SUBMIT.indexOf('className=');
    const disabledAt = SUBMIT.indexOf('disabled={saving}');
    const busyAt = SUBMIT.indexOf('aria-busy={saving}');
    assert.ok(
      typeAt < classAt && classAt < disabledAt && disabledAt < busyAt,
      'type, class, disabled and aria-busy stay in order',
    );
  });

  it('Cancel stays a plain close button without a busy marker', () => {
    assert.ok(CANCEL.includes('disabled={saving}'), 'Cancel disables while saving');
    assert.equal(CANCEL.includes('aria-busy'), false, 'no aria-busy on Cancel');
  });

  it('the per-row Delete button keeps its focus and busy wiring', () => {
    assert.ok(
      DELETE.includes('onClick={(e) => handleDelete(edge.from, edge.to, e.currentTarget)}'),
      'Delete still passes its element for focus restoration',
    );
    assert.ok(DELETE.includes('title="Delete"'), 'Delete keeps its title');
    assert.ok(DELETE.includes('<Trash2 className="w-4 h-4" />'), 'the trash icon stays');
    assert.ok(DELETE.includes('disabled={deleting !== null}'), 'every row disables while deleting');
    assert.ok(
      DELETE.includes('aria-busy={deleting === `${edge.from}:${edge.to}`}'),
      'only the deleted row is busy',
    );
    assert.ok(
      DELETE.indexOf('className=') < DELETE.indexOf('disabled={deleting !== null}') &&
        DELETE.indexOf('disabled={deleting !== null}') <
          DELETE.indexOf('aria-busy={deleting === `${edge.from}:${edge.to}`}'),
      'class, disabled and aria-busy stay in order',
    );
  });
});

describe('/admin/prerequisites: the page structure stays', () => {
  it('keeps the warning, the form, the table and both status lines', () => {
    assert.ok(
      page.includes('You need at least 2 concepts to create prerequisites.'),
      'the warning banner stays',
    );
    assert.ok(page.includes('<form onSubmit={handleSubmit}'), 'the prerequisite form stays');
    assert.ok(page.includes('<table className="stack-table w-full" role="table">'), 'the table stays');
    assert.ok(
      page.includes("{saving ? 'Saving the prerequisite…' : ''}"),
      'the saving status line stays',
    );
    assert.ok(
      page.includes("{deleting ? 'Deleting the prerequisite…' : ''}"),
      'the deleting status line stays',
    );
    assert.ok(page.includes('function getConceptName(conceptId: string): string {'), 'getConceptName stays');
    assert.ok(page.includes('function getStrengthStyle(strength: string): string {'), 'getStrengthStyle stays');
    assert.ok(page.includes('async function handleSubmit('), 'handleSubmit stays');
    assert.ok(page.includes('async function handleDelete('), 'handleDelete stays');
    assert.ok(page.includes('STRENGTH_OPTIONS'), 'the strength options stay');
  });
});

describe('/admin/prerequisites: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(page, /focus-visible/g), 14, 'a focus pair on each of the seven buttons');
    assert.equal(count(page, /<button/g), 7, 'the seven buttons stay');
    assert.equal(count(page, /type="button"/g), 6, 'six plain buttons');
    assert.equal(count(page, /type="submit"/g), 1, 'one submit button');
    assert.equal(count(page, /aria-busy/g), 2, 'the save marker plus the delete row marker');
    assert.equal(count(page, /aria-live/g), 2, 'the saving and deleting status lines');
    assert.equal(count(page, /role=/g), 17, 'the table semantics and status roles stay');
    assert.equal(count(page, /className="sr-only"/g), 3, 'the three sr-only nodes stay');
    assert.equal(count(page, /title="Delete"/g), 1, 'Delete keeps its title');
    assert.equal(count(page, /disabled=\{concepts\.length < 2\}/g), 2, 'both Add buttons keep their guard');
    assert.equal(count(page, /disabled=\{saving\}/g), 2, 'the submit and Cancel keep their guard');
    assert.equal(count(page, /disabled=\{deleting !== null\}/g), 1, 'Delete keeps its guard');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
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
