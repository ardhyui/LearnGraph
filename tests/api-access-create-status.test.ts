/**
 * API key creation busy status is announced (`ApiAccess`).
 *
 * "Create a read-only key" calls `createMyApiKey`, which flips `busy` true.
 * While busy the submit button only faded (`disabled` + `disabled:opacity-60`)
 * and showed an `aria-hidden` spinner: its accessible name stayed the same,
 * there was no `aria-busy`, and no live region spoke, so a screen reader could
 * not tell that a key was being created and the button looked frozen.
 *
 * This file locks `aria-busy={busy}` next to `disabled={busy}` on the submit
 * button with its type, classes, label and spinner untouched, a new `sr-only`
 * polite `role="status"` line after the button inside the same `<form>` that
 * says `Creating your key…` while busy and clears when idle, the existing
 * `role="alert"` error line, the new-key block, the Copy/Copied toggle, the
 * named key list with its Revoke buttons, the untouched `create`/`revoke`/`copy`
 * flows, and that no server function, RPC schema or migration was added.
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

/** The create-key form, from `<form>` to its closing `</form>`. */
const FORM_OPEN = '<form onSubmit={create} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">';
const formStart = account.indexOf(FORM_OPEN);
assert.ok(formStart > 0, 'the create-key form is rendered');
const formEnd = account.indexOf('</form>', formStart) + '</form>'.length;
const form = account.slice(formStart, formEnd);
assert.ok(form.includes('Create a read-only key'), 'the form holds the submit button');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string) => {
  const labelIdx = form.indexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = form.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(form.slice(open, labelIdx).includes('</button>'), false, `the "${label}" label is inside its button`);
  return form.slice(open, labelIdx);
};

const CREATE = buttonOf('Create a read-only key');

describe('ApiAccess: the submit button announces it is busy', () => {
  it('adds aria-busy={busy} right after disabled={busy} on the submit button', () => {
    assert.ok(CREATE.includes('type="submit"'), 'the button stays a submit');
    assert.ok(CREATE.includes('disabled={busy}'), 'disabled stays driven by busy');
    assert.ok(CREATE.includes('aria-busy={busy}'), 'aria-busy is driven by busy');
    assert.ok(
      CREATE.indexOf('disabled={busy}') < CREATE.indexOf('aria-busy={busy}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(account, /aria-busy=/g), 1, 'one aria-busy in the component');
  });

  it('keeps the submit classes, label and spinner untouched', () => {
    assert.ok(
      CREATE.includes(
        'className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"',
      ),
      'submit classes untouched',
    );
    assert.equal(count(form, /Create a read-only key/g), 1, 'the submit label stays once');
    assert.ok(
      form.includes('{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}'),
      'the existing spinner stays hidden and unchanged',
    );
  });
});

describe('ApiAccess: one polite status line after the button', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the busy line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(form, /aria-live="polite"/g), 1, 'one polite live region in the form');
    assert.equal(count(form, /role="status"/g), 1, 'one status line in the form');
  });

  it('says Creating your key… while busy and clears when idle', () => {
    assert.ok(form.includes("{busy ? 'Creating your key…' : ''}"), 'the status text follows busy');
    assert.equal(count(form, /Creating your key…/g), 1, 'the status copy appears once');
  });

  it('sits after the submit button as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status"');
    const buttonClose = form.indexOf('</button>', form.indexOf('Create a read-only key'));
    assert.ok(buttonClose > 0, 'the submit button is closed');
    assert.ok(statusStart > buttonClose, 'the status line follows the submit button');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the form',
    );
  });
});

describe('ApiAccess: the error line and the untouched surroundings', () => {
  it('keeps the single role="alert" error line', () => {
    assert.equal(count(account, /role="alert"/g), 1, 'one alert line for errors');
    assert.ok(
      account.includes('<p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">'),
      'the error line keeps its role and classes',
    );
  });

  it('keeps the new-key block and its Copy/Copied toggle', () => {
    assert.ok(account.includes('data-testid="new-api-key"'), 'the new-key block stays');
    assert.ok(account.includes('Your new key — copy it now, it is not shown again'), 'the key label stays');
    assert.ok(account.includes("{copied ? 'Copied' : 'Copy'}"), 'the Copy/Copied label stays');
    assert.ok(
      account.includes('{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}'),
      'the Copy/Copied icon stays hidden',
    );
  });

  it('keeps the named key list with its Revoke buttons', () => {
    assert.ok(account.includes('aria-label="Your API keys"'), 'the key list keeps its name');
    assert.ok(account.includes('Revoke<span className="sr-only"> {k.name}</span>'), 'each Revoke keeps its hidden name');
    assert.equal(count(account, /Revoke<span/g), 1, 'the Revoke button label stays once');
  });

  it('keeps the heading, paragraph and privacy link', () => {
    assert.ok(account.includes('Connect an AI assistant'), 'the heading stays');
    assert.ok(account.includes('A key lets an assistant or tool you trust'), 'the explanation stays');
    assert.ok(account.includes('<Link to="/privacy"'), 'the privacy link stays');
    assert.ok(account.includes('How your data is handled'), 'the privacy link copy stays');
  });
});

describe('ApiAccess: no aria-busy on the other buttons and no replaced name', () => {
  it('leaves the Copy and Revoke buttons without aria-busy', () => {
    assert.equal(count(account, /aria-busy=/g), 1, 'only the submit button carries aria-busy');
    for (const handler of ['onClick={() => void copy()}', 'onClick={() => void revoke(k)}']) {
      const handlerIdx = account.indexOf(handler);
      assert.ok(handlerIdx > 0, `${handler} stays`);
      const open = account.lastIndexOf('<button', handlerIdx);
      const tag = account.slice(open, handlerIdx);
      assert.equal(tag.includes('aria-busy'), false, `no aria-busy on the button for ${handler}`);
    }
  });

  it('adds no aria-label, aria-labelledby or aria-atomic to the form', () => {
    assert.equal(count(form, /aria-label=/g), 0);
    assert.equal(count(form, /aria-labelledby=/g), 0);
    assert.equal(count(form, /aria-atomic=/g), 0);
  });
});

describe('ApiAccess: the flows stay intact and no data path is added', () => {
  it('keeps the create flow', () => {
    assert.ok(account.includes('const create = async (e: FormEvent) => {'), 'create stays');
    assert.ok(account.includes('if (busy) return;'), 'the busy guard stays');
    assert.ok(account.includes('setBusy(true);'), 'busy still starts with the request');
    assert.ok(account.includes('setError(null);'), 'the error still clears first');
    assert.ok(account.includes('setCopied(false);'), 'the copy state still resets first');
    assert.ok(account.includes('await createMyApiKey({ data: { name } })'), 'the create call stays');
    assert.ok(account.includes('setSecret(created.secret);'), 'the new secret still shows');
    assert.ok(account.includes("setName('');"), 'the name still clears');
    assert.ok(account.includes('await load();'), 'the list still reloads');
    assert.ok(account.includes('setBusy(false);'), 'busy still clears in finally');
  });

  it('keeps the revoke and copy flows', () => {
    assert.ok(account.includes('const revoke = async (key: KeyInfo) => {'), 'revoke stays');
    assert.ok(account.includes('await revokeMyApiKey({ data: { id: key.id } })'), 'the revoke call stays');
    assert.ok(account.includes('const copy = async () => {'), 'copy stays');
    assert.ok(account.includes('await navigator.clipboard.writeText(secret);'), 'the clipboard write stays');
    assert.ok(account.includes('setCopied(true);'), 'copy still flips the label');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migrat/i.test(account), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Creating your key'), false, `${file} gained the status copy`);
      assert.equal(other.includes('api-access-busy'), false, `${file} gained busy wiring`);
    }
  });
});
