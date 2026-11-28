/**
 * Deleting a learner is announced (admin → Learners).
 *
 * The per-row `Delete` button called `handleDelete` → `deleteLearner`, which
 * previously disabled nothing and announced nothing: during the request the
 * button stayed clickable (a double click could fire two deletes) and a screen
 * reader could not tell that the learner was being deleted. This file locks
 * `disabled={deleting !== null}` and `aria-busy={deleting === learner.userId}`
 * on that button, the `deleting` state and its guard/cleanup in `handleDelete`,
 * and one `sr-only` polite `role="status"` line as the last child of the table
 * card that says `Deleting the learner…` while a delete is in flight and clears
 * when idle. The synchronous per-row `Edit` button, the import label/status and
 * the `import-notice` line stay untouched, and no server function, RPC schema or
 * migration is added.
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

/** The `handleDelete` handler, from its declaration to its closing `}`. */
const removeStart = page.indexOf('async function handleDelete(userId: string, button?: HTMLElement) {');
assert.ok(removeStart > 0, 'the handleDelete handler is rendered');
const removeEnd = page.indexOf('\n  }', removeStart) + '\n  }'.length;
const remove = page.slice(removeStart, removeEnd);

/** The table card, from its opening tag to its closing `</motion.div>`. */
const cardMark = page.indexOf('variants={containerVariants}');
assert.ok(cardMark > 0, 'the learners table card is rendered');
const cardStart = page.lastIndexOf('<motion.div', cardMark);
assert.ok(cardStart > 0, 'the card has an opening tag');
const cardEnd = page.indexOf('\n            </motion.div>', cardStart) + '\n            </motion.div>'.length;
const card = page.slice(cardStart, cardEnd);

describe('/admin/learners: the per-row Delete button announces it is busy', () => {
  it('adds disabled and aria-busy after the classes, driven by deleting', () => {
    assert.ok(
      DELETE.includes('onClick={(e) => handleDelete(learner.userId, e.currentTarget)}'),
      'Delete still passes its element for focus restoration',
    );
    assert.ok(
      DELETE.includes(
        'className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors focus-visible:outline-2 focus-visible:outline-primary"',
      ),
      'the classes stay exactly',
    );
    assert.ok(DELETE.includes('disabled={deleting !== null}'), 'every row disables while deleting');
    assert.ok(DELETE.includes('aria-busy={deleting === learner.userId}'), 'only the deleted row is busy');
    assert.ok(
      DELETE.indexOf('className=') < DELETE.indexOf('disabled={deleting !== null}'),
      'disabled sits after className',
    );
    assert.ok(
      DELETE.indexOf('disabled={deleting !== null}') < DELETE.indexOf('aria-busy={deleting === learner.userId}'),
      'aria-busy sits after disabled',
    );
    assert.ok(DELETE.includes('title="Delete"'), 'the delete title stays');
    assert.ok(page.includes('<Trash2 className="w-4 h-4" />'), 'the trash icon stays');
  });

  it('leaves the synchronous Edit button without a busy marker', () => {
    assert.ok(EDIT.includes('onClick={() => openEditForm(learner)}'), 'Edit still opens the form');
    assert.ok(EDIT.includes('title="Edit"'), 'Edit keeps its title');
    assert.equal(EDIT.includes('disabled'), false, 'no disabled on Edit');
    assert.equal(EDIT.includes('aria-busy'), false, 'no aria-busy on Edit');
  });
});

describe('/admin/learners: deleting is announced once', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      page.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the deleting line is a sr-only paragraph carrying role and politeness',
    );
    assert.ok(
      page.includes("{deleting ? 'Deleting the learner…' : ''}"),
      'the status text follows deleting',
    );
    assert.equal(count(page, /Deleting the learner…/g), 1, 'the status copy appears once');
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

describe('/admin/learners: the delete flow keeps its behaviour', () => {
  it('declares deleting after importNotice', () => {
    const notice = page.indexOf("const [importNotice, setImportNotice] = useState('');");
    const deleting = page.indexOf('const [deleting, setDeleting] = useState<string | null>(null);');
    assert.ok(notice > 0, 'the import notice state stays');
    assert.ok(deleting > notice, 'deleting is declared after importNotice');
  });

  it('guards re-entry before the confirmation and marks the learner after confirming', () => {
    const guard = remove.indexOf('if (deleting) return;');
    const confirm = remove.indexOf("if (!confirm('Are you sure you want to delete this learner?')) return;");
    const mark = remove.indexOf('setDeleting(userId);');
    const focus = remove.indexOf('rememberRowFocus(button)');
    assert.ok(guard > 0, 'the guard stays');
    assert.ok(confirm > guard, 'the guard runs before the confirmation');
    assert.ok(mark > confirm, 'the learner is marked after the confirmation');
    assert.ok(focus > mark, 'focus is remembered after the learner is marked');
  });

  it('keeps the delete call, focus restore and error message', () => {
    assert.ok(remove.includes('await deleteLearner(userId);'), 'the delete call stays');
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

describe('/admin/learners: the import status and page counts stay locked', () => {
  it('keeps the import label, its status and the result notice', () => {
    assert.ok(
      page.includes(
        'className="btn btn-secondary flex cursor-pointer items-center gap-2 focus-within:ring-2 focus-within:ring-primary" aria-busy={importing}',
      ),
      'the import label keeps its aria-busy',
    );
    assert.ok(page.includes("{importing ? 'Importing…' : 'Import from a file'}"), 'the import label stays');
    assert.ok(page.includes("{importing ? 'Importing the learner file…' : ''}"), 'the import status stays');
    assert.ok(page.includes('data-testid="import-notice"'), 'the result notice stays');
    assert.ok(
      page.includes('onClick={openNewForm}'),
      'the Add Learner button stays',
    );
  });

  it('matches the file-wide counts', () => {
    assert.equal(count(page, /aria-busy/g), 2, 'the import marker plus the new row marker');
    assert.equal(count(page, /aria-busy=/g), 2, 'two aria-busy attributes');
    assert.equal(count(page, /aria-live/g), 3, 'import line, result notice and deleting line');
    assert.equal(count(page, /role="status"/g), 3, 'import line, result notice and deleting line');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert is added');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby/g), 0, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic/g), 0, 'no aria-atomic is added');
    assert.equal(count(page, /className="sr-only"/g), 3, 'file input, import line and deleting line');
    assert.equal(count(page, /role="/g), 18, 'the table semantics plus the three status lines');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Deleting the learner'), false, `${file} gained the status copy`);
      assert.equal(other.includes('learner-delete-busy'), false, `${file} gained busy wiring`);
    }
  });
});
