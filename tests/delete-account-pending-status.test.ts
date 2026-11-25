/**
 * Account deletion busy status is announced (`DeleteAccount`).
 *
 * "Delete my account and all data" calls `authClient.deleteUser`, which flips
 * `busy` true. While busy the submit button only faded (`disabled` +
 * `disabled:opacity-60`) and showed an `aria-hidden` spinner: its accessible
 * name stayed the same, there was no `aria-busy`, and no live region spoke, so
 * a screen reader could not tell that deletion was running and the button
 * looked frozen. "Keep my account" was simply disabled with no announcement
 * either.
 *
 * This file locks `aria-busy={busy}` next to `disabled={busy}` on the submit
 * button with its type, classes, label and spinner untouched, a new `sr-only`
 * polite `role="status"` line after both buttons inside the same `<form>` that
 * says `Deleting your account…` while busy and clears when idle, the existing
 * `role="alert"` error line, the untouched `submit` flow and local-owner guard,
 * and that no server function, RPC call or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DELETE_FILE = join(ROOT, 'src', 'components', 'DeleteAccount.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const account = source(DELETE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The delete form, from `<form>` to its closing `</form>`. */
const FORM_OPEN = '<form onSubmit={submit} className="mt-4 max-w-sm space-y-3" noValidate>';
const formStart = account.indexOf(FORM_OPEN);
assert.ok(formStart > 0, 'the delete form is rendered');
const formEnd = account.indexOf('</form>', formStart) + '</form>'.length;
const form = account.slice(formStart, formEnd);
assert.ok(form.includes('Delete my account and all data'), 'the form holds the submit button');
assert.ok(form.includes('Keep my account'), 'the form holds the cancel button');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string) => {
  const labelIdx = form.indexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = form.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(form.slice(open, labelIdx).includes('</button>'), false, `the "${label}" label is inside its button`);
  return form.slice(open, labelIdx);
};

const DELETE = buttonOf('Delete my account and all data');

describe('DeleteAccount: the submit button announces it is busy', () => {
  it('adds aria-busy={busy} right after disabled={busy} on the submit button', () => {
    assert.ok(DELETE.includes('type="submit"'), 'the button stays a submit');
    assert.ok(DELETE.includes('disabled={busy}'), 'disabled stays driven by busy');
    assert.ok(DELETE.includes('aria-busy={busy}'), 'aria-busy is driven by busy');
    assert.ok(
      DELETE.indexOf('disabled={busy}') < DELETE.indexOf('aria-busy={busy}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(form, /aria-busy=\{busy\}/g), 1, 'one aria-busy, on the submit button only');
  });

  it('keeps the submit classes, label and spinner untouched', () => {
    assert.ok(
      DELETE.includes(
        'className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60"',
      ),
      'submit classes untouched',
    );
    assert.equal(count(form, /Delete my account and all data/g), 1, 'the submit label stays once');
    assert.ok(
      form.includes('{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}'),
      'the existing spinner stays hidden and unchanged',
    );
  });

  it('leaves the Keep my account button disabled but without aria-busy', () => {
    const cancel = buttonOf('Keep my account');
    assert.ok(cancel.includes('type="button"'), 'cancel stays a plain button');
    assert.ok(cancel.includes('disabled={busy}'), 'cancel stays disabled while busy');
    assert.equal(cancel.includes('aria-busy'), false, 'cancel gets no aria-busy');
    assert.ok(
      cancel.includes(
        'className="inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-primary/10 hover:text-foreground disabled:opacity-60"',
      ),
      'cancel classes untouched',
    );
    assert.equal(count(form, /Keep my account/g), 1, 'the cancel label stays once');
  });
});

describe('DeleteAccount: one polite status line after the buttons', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the busy line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(form, /aria-live="polite"/g), 1, 'one polite live region in the form');
  });

  it('says Deleting your account… while busy and clears when idle', () => {
    assert.ok(form.includes("{busy ? 'Deleting your account…' : ''}"), 'the status text follows busy');
    assert.equal(count(form, /Deleting your account…/g), 1, 'the status copy appears once');
  });

  it('sits after both buttons as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status"');
    const cancelContainer = form.indexOf('<div className="flex flex-wrap gap-2">');
    const deleteClose = form.indexOf('</button>', form.indexOf('Delete my account and all data'));
    const cancelClose = form.indexOf('</button>', form.indexOf('Keep my account'));
    assert.ok(cancelContainer > 0, 'the two-button container stays');
    assert.ok(deleteClose > 0, 'the submit button is closed');
    assert.ok(cancelClose > deleteClose, 'the cancel button follows');
    assert.ok(statusStart > cancelClose, 'the status line follows both buttons');
    const containerEnd = form.indexOf('</div>', cancelContainer) + '</div>'.length;
    assert.ok(statusStart > containerEnd, 'the status line follows the two-button container');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the form',
    );
  });
});

describe('DeleteAccount: the error line and the untouched surroundings', () => {
  it('keeps the single role="alert" error line', () => {
    assert.equal(count(form, /role="alert"/g), 1, 'one alert line for errors');
    assert.ok(
      form.includes('<p role="alert" className="text-sm text-red-600 dark:text-red-400">'),
      'the error line keeps its role and classes',
    );
  });

  it('keeps the submit flow intact', () => {
    assert.ok(account.includes('const submit = async (e: FormEvent) => {'), 'submit stays');
    assert.ok(account.includes('if (busy) return;'), 'the busy guard stays');
    assert.ok(account.includes("return setError(`Type ${CONFIRM_WORD} to confirm.`);"), 'the confirm guard stays');
    assert.ok(account.includes("return setError('Enter your password.');"), 'the password guard stays');
    assert.ok(account.includes('setBusy(true);'), 'busy still starts with the request');
    assert.ok(account.includes('await authClient.deleteUser({ password })'), 'the deletion call stays');
    assert.ok(account.includes('setBusy(false);'), 'busy still clears on failure');
    assert.ok(account.includes("window.location.assign('/sign-in?deleted=1');"), 'the reload after success stays');
  });

  it('keeps the local-owner guard and the section shell', () => {
    assert.ok(account.includes("if (!user || user.id === LOCAL_OWNER_ID) return null;"), 'the local-owner guard stays');
    assert.ok(
      account.includes(
        '<section aria-labelledby={ids.heading} className="mt-10 rounded-xl border border-red-500/30 p-4 sm:p-6" data-testid="delete-account">',
      ),
      'the section shell stays',
    );
    assert.ok(account.includes('How your data is handled'), 'the privacy link stays');
    assert.ok(account.includes('Delete my account…'), 'the closed-state button stays');
  });
});

describe('DeleteAccount: no replaced name and no new data path', () => {
  it('adds no aria-label, aria-labelledby or aria-atomic to the form', () => {
    assert.equal(count(form, /aria-label=/g), 0);
    assert.equal(count(form, /aria-labelledby=/g), 0);
    assert.equal(count(form, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migrat/i.test(account), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Deleting your account'), false, `${file} gained the status copy`);
      assert.equal(other.includes('delete-account-busy'), false, `${file} gained busy wiring`);
    }
  });
});
