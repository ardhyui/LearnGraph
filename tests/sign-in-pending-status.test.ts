/**
 * Sign-in pending status is announced (`/sign-in`).
 *
 * While `pending`, the submit button only showed a spinner: its accessible
 * name stayed "Sign in"/"Create account", the spinning `Loader2` icon was
 * read out as part of the button, and no live region ever told a screen
 * reader that signing in was in progress.
 *
 * This file locks `aria-busy={pending}` on the submit button (with
 * `disabled`, classes and label untouched), the hidden spinner with its
 * original class, exactly one polite `role="status"` line whose two text
 * branches follow `mode` and sit right after the submit button inside the
 * form, the untouched error alert, the three label/control pairs, the mode
 * toggle and footer links, and that no button name is replaced nor any
 * server function, RPC call or migration added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'sign-in.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const FORM_START = page.indexOf('<form onSubmit={onSubmit}');
const FORM_END = page.indexOf('</form>', FORM_START) + '</form>'.length;
assert.ok(FORM_START > 0, 'the sign-in form is rendered');
assert.ok(FORM_END > FORM_START, 'the sign-in form is closed');
const form = page.slice(FORM_START, FORM_END);

const submitOpen = () => form.match(/<button\s+type="submit"[\s\S]*?>/)?.[0] ?? '';

describe('sign-in pending: the submit button announces it is busy', () => {
  it('adds exactly one aria-busy={pending}, on the submit button', () => {
    assert.equal(count(page, /aria-busy=\{pending\}/g), 1, 'one aria-busy expression in the page');
    assert.ok(submitOpen().includes('aria-busy={pending}'), 'aria-busy sits on the submit button');
  });

  it('keeps disabled, className and the visible label untouched', () => {
    assert.ok(submitOpen().includes('disabled={pending}'), 'disabled stays driven by pending');
    assert.ok(
      submitOpen().includes(
        "className={cn('btn btn-primary w-full flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-primary')}",
      ),
      'button classes untouched',
    );
    assert.equal(
      count(form, /\{mode === 'sign-in' \? 'Sign in' : 'Create account'\}/g),
      1,
      'the button label expression stays exactly once',
    );
  });

  it('hides the spinner without changing its class', () => {
    assert.ok(
      form.includes('<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />'),
      'Loader2 is hidden with its original class',
    );
    assert.equal(
      count(form, /aria-hidden="true"/g),
      1,
      'the spinner is the only hidden element in the form',
    );
  });
});

describe('sign-in pending: one polite status line inside the form', () => {
  it('renders exactly one role="status" with polite live and sr-only', () => {
    assert.equal(count(page, /role="status"/g), 1, 'exactly one status line in the page');
    assert.equal(count(page, /aria-live="polite"/g), 1, 'exactly one polite live region');
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the status line is a sr-only paragraph carrying role and politeness',
    );
  });

  it('announces the two exact branches and stays silent otherwise', () => {
    assert.ok(
      form.includes(
        "{pending ? (mode === 'sign-in' ? 'Signing in…' : 'Creating account…') : ''}",
      ),
      'the status text follows mode and clears when idle',
    );
    assert.equal(count(page, /Signing in…/g), 1);
    assert.equal(count(page, /Creating account…/g), 1);
  });

  it('sits right after the submit button and is the last form child', () => {
    const labelIdx = form.indexOf("{mode === 'sign-in' ? 'Sign in' : 'Create account'}");
    const submitClose = form.indexOf('</button>', labelIdx);
    const statusStart = form.indexOf('<p role="status"');
    assert.ok(submitClose > 0, 'the submit button is closed');
    assert.ok(statusStart > submitClose, 'the status line follows the submit button');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'nothing else is added to the form after the status line',
    );
  });
});

describe('sign-in pending: the error alert and the untouched surroundings', () => {
  it('keeps the error paragraph as the only alert', () => {
    assert.equal(count(page, /role="alert"/g), 1, 'the error paragraph stays the only alert');
    assert.ok(page.includes('{error && ('));
    assert.ok(page.includes('<p role="alert" className="form-error">'));
  });

  it('keeps the three label/control pairs intact', () => {
    for (const field of ['name', 'email', 'password']) {
      assert.equal(
        count(page, new RegExp(`htmlFor="${field}"`, 'g')),
        1,
        `htmlFor="${field}" once`,
      );
      assert.equal(count(page, new RegExp(`id="${field}"`, 'g')), 1, `id="${field}" once`);
    }
  });

  it('keeps the mode toggle and the footer links', () => {
    assert.ok(
      page.includes("{mode === 'sign-in' ? 'Create one' : 'Sign in'}"),
      'mode toggle copy untouched',
    );
    assert.ok(page.includes('<Link to="/forgot-password"'), 'forgot-password link untouched');
    assert.ok(page.includes('<Link to="/privacy"'), 'privacy link untouched');
  });

  it('keeps the submit flow and its guards untouched', () => {
    assert.ok(
      page.includes('const parsed = credentialsSchema.safeParse({'),
      'Zod validation untouched',
    );
    assert.ok(page.includes('setPending(true);'), 'pending still starts with the request');
    assert.ok(
      page.includes('finally {\n      setPending(false);'),
      'pending still clears in finally',
    );
    assert.ok(page.includes('await authClient.signUp.email({'), 'sign-up call untouched');
    assert.ok(page.includes('await authClient.signIn.email({'), 'sign-in call untouched');
    assert.ok(page.includes('rateLimitMessage()'), 'rate-limit message untouched');
    assert.equal(count(page, /function safeRedirect/g), 1, 'safeRedirect untouched');
  });
});

describe('sign-in pending: no replaced name and no new data path', () => {
  it('adds no aria-label or aria-labelledby anywhere', () => {
    assert.equal(count(page, /aria-label=/g), 0);
    assert.equal(count(page, /aria-labelledby=/g), 0);
    assert.equal(count(page, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('sign-in-pending'), false, `${file} gained pending wiring`);
      assert.equal(other.includes('aria-busy'), false, `${file} gained aria-busy`);
      assert.equal(other.includes('Signing in'), false, `${file} gained the status copy`);
    }
  });
});
