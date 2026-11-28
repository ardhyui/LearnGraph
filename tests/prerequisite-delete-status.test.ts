/**
 * Deleting a prerequisite is announced (admin → Prerequisites).
 *
 * The per-row `Delete` button called `handleDelete` → `deleteEdge`, which
 * previously disabled nothing and announced nothing: during the request the
 * button stayed clickable (a double click could fire two deletes) and a screen
 * reader could not tell that the prerequisite was being deleted. This file
 * locks `disabled={deleting !== null}` and
 * `aria-busy={deleting === `${edge.from}:${edge.to}`}` on that button, the
 * `deleting` state and its guard/key/cleanup in `handleDelete`, and one
 * `sr-only` polite `role="status"` line as the last child of the table card
 * that says `Deleting the prerequisite…` while a delete is in flight and clears
 * when idle. The `Add Prerequisite` buttons and the saving status from PR #192
 * stay untouched, and no server function, RPC schema or migration is added.
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

/** The `handleDelete` handler, from its declaration to its closing `}`. */
const removeStart = page.indexOf(
  'async function handleDelete(from: string, to: string, button?: HTMLElement) {',
);
assert.ok(removeStart > 0, 'the handleDelete handler is rendered');
const removeEnd = page.indexOf('\n  }', removeStart) + '\n  }'.length;
const remove = page.slice(removeStart, removeEnd);

/** The table card, from its opening tag to its closing `</motion.div>`. */
const cardMark = page.indexOf('variants={containerVariants}');
assert.ok(cardMark > 0, 'the prerequisite table card is rendered');
const cardStart = page.lastIndexOf('<motion.div', cardMark);
assert.ok(cardStart > 0, 'the card has an opening tag');
const cardEnd = page.indexOf('\n            </motion.div>', cardStart) + '\n            </motion.div>'.length;
const card = page.slice(cardStart, cardEnd);

describe('/admin/prerequisites: the per-row Delete button announces it is busy', () => {
  it('adds disabled and aria-busy after the classes, driven by deleting', () => {
    assert.ok(
      DELETE.includes('onClick={(e) => handleDelete(edge.from, edge.to, e.currentTarget)}'),
      'Delete still passes its element for focus restoration',
    );
    assert.ok(
      DELETE.includes('className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors focus-visible:outline-2 focus-visible:outline-primary"'),
      'the classes stay exactly',
    );
    assert.ok(DELETE.includes('disabled={deleting !== null}'), 'every row disables while deleting');
    assert.ok(
      DELETE.includes('aria-busy={deleting === `${edge.from}:${edge.to}`}'),
      'only the deleted row is busy',
    );
    assert.ok(
      DELETE.indexOf('className=') < DELETE.indexOf('disabled={deleting !== null}'),
      'disabled sits after className',
    );
    assert.ok(
      DELETE.indexOf('disabled={deleting !== null}') <
        DELETE.indexOf('aria-busy={deleting === `${edge.from}:${edge.to}`}'),
      'aria-busy sits after disabled',
    );
    assert.ok(DELETE.includes('title="Delete"'), 'the delete title stays');
    assert.ok(page.includes('<Trash2 className="w-4 h-4" />'), 'the trash icon stays');
  });
});

describe('/admin/prerequisites: deleting is announced once', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      page.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the deleting line is a sr-only paragraph carrying role and politeness',
    );
    assert.ok(
      page.includes("{deleting ? 'Deleting the prerequisite…' : ''}"),
      'the status text follows deleting',
    );
    assert.equal(count(page, /Deleting the prerequisite…/g), 1, 'the status copy appears once');
  });

  it('sits outside the table as the last child of the card', () => {
    const statusStart = card.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the deleting line is in the card');
    const tableClose = card.lastIndexOf('</table>', statusStart);
    assert.ok(tableClose > 0, 'the status line follows the closing table tag');
    const wrapperClose = card.lastIndexOf('</div>', statusStart);
    assert.ok(wrapperClose > tableClose, 'the status line follows the overflow wrapper');
    const statusEnd = card.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      card.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the status line is the last child of the card',
    );
  });
});

describe('/admin/prerequisites: the delete flow keeps its behaviour', () => {
  it('declares deleting after saving', () => {
    const saving = page.indexOf('const [saving, setSaving] = useState(false);');
    const deleting = page.indexOf('const [deleting, setDeleting] = useState<string | null>(null);');
    assert.ok(saving > 0, 'the saving state stays');
    assert.ok(deleting > saving, 'deleting is declared after saving');
  });

  it('guards re-entry, keys the row and confirms before marking it', () => {
    const guard = remove.indexOf('if (deleting) return;');
    const key = remove.indexOf('const key = `${from}:${to}`;');
    const confirm = remove.indexOf(
      "if (!confirm('Are you sure you want to delete this prerequisite?')) return;",
    );
    const focus = remove.indexOf('rememberRowFocus(button)');
    const mark = remove.indexOf('setDeleting(key);');
    assert.ok(guard > 0, 'the guard stays');
    assert.ok(key > guard, 'the row key is computed after the guard');
    assert.ok(confirm > key, 'the guard and key run before the confirmation');
    assert.ok(focus > confirm, 'focus is remembered after the confirmation');
    assert.ok(mark > focus, 'the row is marked after yes: focus is remembered');
  });

  it('marks before the try', () => {
    const mark = remove.indexOf('setDeleting(key);');
    const tryAt = remove.indexOf('try {');
    assert.ok(tryAt > mark, 'the row is marked before the try');
    assert.equal(count(remove, /const key = /g), 1, 'the key is computed once');
  });

  it('keeps the delete call, focus restore and error message', () => {
    assert.ok(remove.includes('await deleteEdge(from, to);'), 'the delete call stays');
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
    assert.equal(count(remove, /finally \{/g), 1, 'no extra finally is added');
  });
});

describe('/admin/prerequisites: the save status and page counts stay locked', () => {
  it('keeps both Add Prerequisite buttons and the saving status', () => {
    const addButtons = [...page.matchAll(/Add Prerequisite\s*<\/button>/g)];
    assert.equal(addButtons.length, 2, 'both Add Prerequisite buttons stay');
    assert.equal(
      count(page, /disabled=\{concepts\.length < 2\}/g),
      2,
      'both Add Prerequisite buttons keep their disabled guard',
    );
    assert.ok(
      page.includes("{saving ? 'Saving the prerequisite…' : ''}"),
      'the saving status from PR #192 stays',
    );
    assert.ok(
      page.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'both status lines share the sr-only paragraph shape',
    );
  });

  it('matches the file-wide counts', () => {
    assert.equal(count(page, /aria-busy/g), 2, 'the save marker plus the new row marker');
    assert.equal(count(page, /aria-busy=/g), 2, 'two aria-busy attributes');
    assert.equal(count(page, /aria-live/g), 2, 'saving line and deleting line');
    assert.equal(count(page, /role="status"/g), 2, 'saving line and deleting line');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert is added');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby/g), 0, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic/g), 0, 'no aria-atomic is added');
    assert.equal(count(page, /className="sr-only"/g), 3, 'the Strength radio and both status lines');
    assert.equal(count(page, /role="/g), 17, 'the table semantics plus the two status lines');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Deleting the prerequisite'), false, `${file} gained the status copy`);
      assert.equal(other.includes('prerequisite-delete-busy'), false, `${file} gained busy wiring`);
    }
  });
});
