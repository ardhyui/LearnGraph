/**
 * Password-reset pending status is announced (`/forgot-password`, `/reset-password`).
 *
 * While `pending`, both submit buttons only showed a spinner: their
 * accessible names stayed "Send the reset link" / "Save the new password",
 * the spinning `Loader2` was read out as part of the button, and no live
 * region told a screen reader that the request was in flight.
 *
 * This file locks `aria-busy={pending}` on both submit buttons (with
 * `disabled`, classes and labels untouched), the hidden spinners with their
 * original class, exactly one new polite `role="status"` line per page whose
 * text clears when idle and sits right after the submit button as the last
 * form child, the untouched alert/status branches, the label/control pairs
 * and submit guards, and that no button name is replaced nor any server
 * function, RPC call or migration added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const FORGOT_FILE = join(ROOT, 'src', 'routes', 'forgot-password.tsx');
const RESET_FILE = join(ROOT, 'src', 'routes', 'reset-password.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const forgot = source(FORGOT_FILE);
const reset = source(RESET_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** Slice the one `<form onSubmit={onSubmit}>…</form>` block out of a page. */
function formOf(page: string, label: string) {
  const start = page.indexOf('<form onSubmit={onSubmit}');
  const end = page.indexOf('</form>', start) + '</form>'.length;
  assert.ok(start > 0, `${label}: the form is rendered`);
  assert.ok(end > start, `${label}: the form is closed`);
  return page.slice(start, end);
}

const forgotForm = formOf(forgot, '/forgot-password');
const resetForm = formOf(reset, '/reset-password');

const submitOpen = (form: string) => form.match(/<button\s+type="submit"[\s\S]*?>/)?.[0] ?? '';

const BUTTON_CLASS = 'className="btn btn-primary flex w-full items-center justify-center gap-2"';

describe('/forgot-password pending: the submit button announces it is busy', () => {
  it('adds exactly one aria-busy={pending}, on the submit button', () => {
    assert.equal(count(forgot, /aria-busy=\{pending\}/g), 1, 'one aria-busy expression in the page');
    assert.ok(submitOpen(forgotForm).includes('aria-busy={pending}'), 'aria-busy sits on the submit button');
  });

  it('keeps disabled, className and the visible label untouched', () => {
    assert.ok(submitOpen(forgotForm).includes('disabled={pending}'), 'disabled stays driven by pending');
    assert.ok(submitOpen(forgotForm).includes(BUTTON_CLASS), 'button classes untouched');
    assert.equal(count(forgotForm, /Send the reset link/g), 1, 'the button label stays exactly once');
  });

  it('hides the spinner without changing its class', () => {
    assert.ok(
      forgotForm.includes('<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />'),
      'Loader2 is hidden with its original class',
    );
    assert.equal(count(forgotForm, /aria-hidden="true"/g), 1, 'the spinner is the only hidden element in the form');
  });
});

describe('/forgot-password pending: one polite status line inside the form', () => {
  it('renders exactly one polite live region and keeps the sent status branch', () => {
    assert.equal(count(forgot, /aria-live="polite"/g), 1, 'exactly one polite live region');
    assert.equal(count(forgot, /role="status"/g), 2, 'the sent branch plus the new pending line');
    assert.ok(
      forgotForm.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the status line is a sr-only paragraph carrying role and politeness',
    );
  });

  it('announces the exact text and stays silent when idle', () => {
    assert.ok(
      forgotForm.includes("{pending ? 'Sending the reset link…' : ''}"),
      'the status text clears when idle',
    );
    assert.equal(count(forgot, /Sending the reset link…/g), 1);
  });

  it('sits right after the submit button and is the last form child', () => {
    const labelIdx = forgotForm.indexOf('Send the reset link');
    const submitClose = forgotForm.indexOf('</button>', labelIdx);
    const statusStart = forgotForm.indexOf('<p role="status"');
    assert.ok(submitClose > 0, 'the submit button is closed');
    assert.ok(statusStart > submitClose, 'the status line follows the submit button');
    const statusEnd = forgotForm.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      forgotForm.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'nothing else is added to the form after the status line',
    );
  });
});

describe('/reset-password pending: the submit button announces it is busy', () => {
  it('adds exactly one aria-busy={pending}, on the submit button', () => {
    assert.equal(count(reset, /aria-busy=\{pending\}/g), 1, 'one aria-busy expression in the page');
    assert.ok(submitOpen(resetForm).includes('aria-busy={pending}'), 'aria-busy sits on the submit button');
  });

  it('keeps disabled, className and the visible label untouched', () => {
    assert.ok(submitOpen(resetForm).includes('disabled={pending}'), 'disabled stays driven by pending');
    assert.ok(submitOpen(resetForm).includes(BUTTON_CLASS), 'button classes untouched');
    assert.equal(count(resetForm, /Save the new password/g), 1, 'the button label stays exactly once');
  });

  it('hides the spinner without changing its class', () => {
    assert.ok(
      resetForm.includes('<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />'),
      'Loader2 is hidden with its original class',
    );
    assert.equal(count(resetForm, /aria-hidden="true"/g), 1, 'the spinner is the only hidden element in the form');
  });
});

describe('/reset-password pending: one polite status line inside the form', () => {
  it('renders exactly one polite live region and keeps the done status branch', () => {
    assert.equal(count(reset, /aria-live="polite"/g), 1, 'exactly one polite live region');
    assert.equal(count(reset, /role="status"/g), 2, 'the done branch plus the new pending line');
    assert.ok(
      resetForm.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the status line is a sr-only paragraph carrying role and politeness',
    );
  });

  it('announces the exact text and stays silent when idle', () => {
    assert.ok(
      resetForm.includes("{pending ? 'Saving the new password…' : ''}"),
      'the status text clears when idle',
    );
    assert.equal(count(reset, /Saving the new password…/g), 1);
  });

  it('sits right after the submit button and is the last form child', () => {
    const labelIdx = resetForm.indexOf('Save the new password');
    const submitClose = resetForm.indexOf('</button>', labelIdx);
    const statusStart = resetForm.indexOf('<p role="status"');
    assert.ok(submitClose > 0, 'the submit button is closed');
    assert.ok(statusStart > submitClose, 'the status line follows the submit button');
    const statusEnd = resetForm.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      resetForm.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'nothing else is added to the form after the status line',
    );
  });
});

describe('password reset: the error alerts and the untouched surroundings', () => {
  it('keeps the failed-request alert as the only alert on /forgot-password', () => {
    assert.equal(count(forgot, /role="alert"/g), 1, 'the form error stays the only alert');
    assert.ok(forgot.includes('<p role="alert" className="form-error">'));
  });

  it('keeps both alerts on /reset-password (invalid link and failed request)', () => {
    assert.equal(count(reset, /role="alert"/g), 2, 'the invalid-link notice and the form error');
    assert.ok(reset.includes('<p role="alert" className="form-error">'));
    assert.ok(reset.includes('This reset link is not valid any more.'));
  });

  it('keeps the label/control pairs intact', () => {
    assert.equal(count(forgot, /htmlFor="reset-email"/g), 1);
    assert.equal(count(forgot, /id="reset-email"/g), 1);
    for (const field of ['new-password', 'confirm-password']) {
      assert.equal(count(reset, new RegExp(`htmlFor="${field}"`, 'g')), 1, `htmlFor="${field}" once`);
      assert.equal(count(reset, new RegExp(`id="${field}"`, 'g')), 1, `id="${field}" once`);
    }
  });

  it('keeps the submit flow and its guards untouched', () => {
    assert.ok(forgot.includes('z.email().safeParse(email.trim())'), 'email validation untouched');
    assert.ok(forgot.includes('await authClient.requestPasswordReset({'), 'reset request untouched');
    assert.ok(reset.includes("if (password.length < 8) return setError('Password must be at least 8 characters');"));
    assert.ok(reset.includes("if (password !== confirm) return setError('The two passwords do not match');"));
    assert.ok(reset.includes('await authClient.resetPassword({ newPassword: password, token: token ?? \'\' })'));
    for (const page of [forgot, reset]) {
      assert.ok(page.includes('setPending(true);'), 'pending still starts with the request');
      assert.ok(page.includes('finally {\n      setPending(false);'), 'pending still clears in finally');
      assert.ok(page.includes('rateLimitMessage()'), 'rate-limit message untouched');
      assert.ok(page.includes('noValidate'), 'native validation stays off');
    }
    assert.ok(forgot.includes('!features.passwordReset'), 'feature-flag branch untouched');
  });
});

describe('password reset pending: no replaced name and no new data path', () => {
  it('adds no aria-label or aria-labelledby anywhere', () => {
    for (const page of [forgot, reset]) {
      assert.equal(count(page, /aria-label=/g), 0);
      assert.equal(count(page, /aria-labelledby=/g), 0);
      assert.equal(count(page, /aria-atomic=/g), 0);
    }
  });

  it('adds no server function, RPC call or migration', () => {
    for (const page of [forgot, reset]) {
      assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    }
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('password-reset-pending'), false, `${file} gained pending wiring`);
      assert.equal(other.includes('aria-busy'), false, `${file} gained aria-busy`);
      assert.equal(other.includes('Sending the reset link'), false, `${file} gained the status copy`);
      assert.equal(other.includes('Saving the new password'), false, `${file} gained the status copy`);
    }
  });
});
