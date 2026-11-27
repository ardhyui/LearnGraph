/**
 * Revoking an API key is announced (`ApiAccess`).
 *
 * The per-key `Revoke` button called `revoke` → `revokeMyApiKey`, which
 * previously disabled nothing and announced nothing: during the request the
 * button stayed clickable (a double click could fire two revokes) and a
 * screen reader could not tell that the key was being revoked. This file
 * locks `disabled={revoking !== null}` and `aria-busy={revoking === k.id}`
 * on that button with its type, handler, classes and hidden key name
 * untouched, the `revoking` state and its guard/marking/cleanup in `revoke`,
 * and one `sr-only` polite `role="status"` line as the last child of the
 * section — outside the key list `<ul>` — that says `Revoking the key…`
 * while a revoke is in flight and clears when idle. The create button with
 * `aria-busy={busy}` and `Creating your key…` (PR #166) and the Copy button
 * stay untouched, and no server function, RPC schema or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const ACCESS_FILE = join(ROOT, 'src', 'components', 'ApiAccess.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const account = source(ACCESS_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The panel section, from its opening tag to its closing `</section>`. */
const SECTION_OPEN =
  '<section aria-labelledby={ids.heading} className="mt-10 rounded-xl border border-border p-4 sm:p-6" data-testid="api-access">';
const sectionStart = account.indexOf(SECTION_OPEN);
assert.ok(sectionStart > 0, 'the ApiAccess section is rendered');
const sectionEnd = account.indexOf('</section>', sectionStart) + '</section>'.length;
const section = account.slice(sectionStart, sectionEnd);

/** The opening tag of the per-key Revoke button. */
const revokeLabelIdx = account.indexOf('Revoke<span');
assert.ok(revokeLabelIdx > 0, 'the Revoke button is rendered');
const revokeOpen = account.lastIndexOf('<button', revokeLabelIdx);
assert.ok(revokeOpen > 0, 'the Revoke button has an opening tag');
assert.equal(
  account.slice(revokeOpen, revokeLabelIdx).includes('</button>'),
  false,
  'the Revoke label is inside its button',
);
const REVOKE = account.slice(revokeOpen, revokeLabelIdx);

/** The `revoke` handler, from its declaration to its closing `};`. */
const revokeFnStart = account.indexOf('const revoke = async (key: KeyInfo) => {');
assert.ok(revokeFnStart > 0, 'the revoke handler is rendered');
const revokeFnEnd = account.indexOf('\n  };', revokeFnStart) + '\n  };'.length;
const revokeFn = account.slice(revokeFnStart, revokeFnEnd);

/** The create-key form, from `<form>` to its closing `</form>`. */
const FORM_OPEN = '<form onSubmit={create} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">';
const formStart = account.indexOf(FORM_OPEN);
assert.ok(formStart > 0, 'the create-key form is rendered');
const formEnd = account.indexOf('</form>', formStart) + '</form>'.length;
const form = account.slice(formStart, formEnd);

describe('ApiAccess: the per-key Revoke button announces it is busy', () => {
  it('adds disabled and aria-busy after the classes, driven by revoking', () => {
    assert.ok(REVOKE.includes('type="button"'), 'the button stays a plain button');
    assert.ok(REVOKE.includes('onClick={() => void revoke(k)}'), 'the handler stays');
    assert.ok(
      REVOKE.includes(
        'className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-500/10 dark:text-red-400"',
      ),
      'the classes stay exactly',
    );
    assert.ok(REVOKE.includes('disabled={revoking !== null}'), 'every key disables while revoking');
    assert.ok(REVOKE.includes('aria-busy={revoking === k.id}'), 'only the revoked key is busy');
    assert.ok(
      REVOKE.indexOf('className=') < REVOKE.indexOf('disabled={revoking !== null}'),
      'disabled sits after className',
    );
    assert.ok(
      REVOKE.indexOf('disabled={revoking !== null}') < REVOKE.indexOf('aria-busy={revoking === k.id}'),
      'aria-busy sits after disabled',
    );
  });

  it('keeps the visible label and the hidden key name', () => {
    assert.ok(
      account.includes('Revoke<span className="sr-only"> {k.name}</span>'),
      'each Revoke keeps its hidden name',
    );
    assert.equal(count(account, /Revoke<span/g), 1, 'the Revoke button label stays once');
  });
});

describe('ApiAccess: revoking is announced once', () => {
  it('adds exactly one sr-only polite status line for revoking', () => {
    assert.ok(
      section.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the revoking line is a sr-only paragraph carrying role and politeness',
    );
    assert.ok(section.includes("{revoking ? 'Revoking the key…' : ''}"), 'the status text follows revoking');
    assert.equal(count(section, /Revoking the key…/g), 1, 'the status copy appears once');
  });

  it('sits outside the key list as the last child of the section', () => {
    const statusStart = section.lastIndexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the revoking line is in the section');
    const listOpen = section.indexOf('<ul');
    assert.ok(listOpen > 0, 'the key list is rendered');
    const listClose = section.indexOf('</ul>', listOpen);
    assert.ok(listClose > 0, 'the key list is closed');
    assert.ok(listClose < statusStart, 'the status line follows the closing list tag');
    const listBody = section.slice(listOpen, listClose);
    assert.equal(
      listBody.includes('<p role="status"'),
      false,
      'no status paragraph is placed inside the list',
    );
    const statusEnd = section.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      section.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</section>',
      'the status line is the last child of the section',
    );
  });
});

describe('ApiAccess: the revoke flow keeps its behaviour', () => {
  it('declares revoking after busy', () => {
    const busy = account.indexOf('const [busy, setBusy] = useState(false);');
    const revoking = account.indexOf('const [revoking, setRevoking] = useState<string | null>(null);');
    assert.ok(busy > 0, 'the busy state stays');
    assert.ok(revoking > busy, 'revoking is declared after busy');
  });

  it('guards re-entry before the confirmation', () => {
    const guard = revokeFn.indexOf('if (revoking) return;');
    const confirm = revokeFn.indexOf('if (!window.confirm(');
    assert.ok(guard > 0, 'the guard stays');
    assert.ok(confirm > guard, 'the guard runs before the confirmation');
    assert.ok(
      revokeFn.includes(
        'if (!window.confirm(`Revoke “${key.name}”? Anything using it stops working.`)) return;',
      ),
      'the confirmation copy stays',
    );
  });

  it('marks the key after clearing the error and before the try', () => {
    const clear = revokeFn.indexOf('setError(null);');
    const mark = revokeFn.indexOf('setRevoking(key.id);');
    const tryAt = revokeFn.indexOf('try {');
    assert.ok(clear > 0, 'the error still clears first');
    assert.ok(mark > clear, 'the key is marked after the error clears');
    assert.ok(tryAt > mark, 'the key is marked before the try');
    assert.equal(count(revokeFn, /setRevoking\(key\.id\);/g), 1, 'the key is marked once');
  });

  it('keeps the revoke call, reload and error message', () => {
    assert.ok(revokeFn.includes('await revokeMyApiKey({ data: { id: key.id } });'), 'the revoke call stays');
    assert.ok(revokeFn.includes('await load();'), 'the list still reloads');
    assert.ok(
      revokeFn.includes("setError(err instanceof Error ? err.message : 'Could not revoke the key.');"),
      'the error message stays',
    );
  });

  it('clears revoking in a finally', () => {
    assert.ok(revokeFn.includes('finally {'), 'the try/catch gains a finally');
    const finallyIdx = revokeFn.indexOf('finally {');
    assert.ok(revokeFn.slice(finallyIdx).includes('setRevoking(null);'), 'revoking is cleared in the finally');
    assert.ok(
      revokeFn.indexOf('setRevoking(null);') > revokeFn.indexOf('setError(err instanceof Error'),
      'the cleanup runs after the catch body',
    );
    assert.equal(count(revokeFn, /finally \{/g), 1, 'no extra finally is added');
  });
});

describe('ApiAccess: the create status and the Copy button stay untouched', () => {
  it('keeps the submit button busy marker and its status', () => {
    assert.ok(form.includes('aria-busy={busy}'), 'the create marker stays on the submit button');
    assert.ok(form.includes("{busy ? 'Creating your key…' : ''}"), 'the creating status stays');
    assert.equal(count(form, /aria-live="polite"/g), 1, 'the form keeps exactly its own status line');
    assert.equal(count(form, /role="status"/g), 1, 'the form keeps exactly one status line');
  });

  it('keeps the Copy button without aria-busy', () => {
    const handlerIdx = account.indexOf('onClick={() => void copy()}');
    assert.ok(handlerIdx > 0, 'the copy handler stays');
    const open = account.lastIndexOf('<button', handlerIdx);
    assert.ok(open > 0, 'the Copy button has an opening tag');
    assert.equal(account.slice(open, handlerIdx).includes('aria-busy'), false, 'no aria-busy on the Copy button');
  });
});

describe('ApiAccess: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(account, /aria-busy/g), 2, 'the create marker plus the new revoke marker');
    assert.equal(count(account, /aria-busy=/g), 2, 'two aria-busy attributes');
    assert.equal(count(account, /aria-live/g), 2, 'creating line and revoking line');
    assert.equal(count(account, /role="status"/g), 2, 'creating line and revoking line');
    assert.equal(count(account, /role="alert"/g), 1, 'the single alert line for errors stays');
    assert.equal(count(account, /aria-label=/g), 1, 'the named key list keeps its label');
    assert.equal(count(account, /aria-labelledby/g), 1, 'the heading label stays');
    assert.equal(count(account, /aria-atomic/g), 0, 'no aria-atomic is added');
    assert.equal(count(account, /className="sr-only"/g), 3, 'creating line, hidden key name and revoking line');
    assert.equal(count(account, /role="/g), 3, 'two status lines plus the alert line');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(account),
      false,
      'the component adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Revoking the key'), false, `${file} gained the status copy`);
      assert.equal(other.includes('api-access-revoke-busy'), false, `${file} gained busy wiring`);
    }
  });
});
