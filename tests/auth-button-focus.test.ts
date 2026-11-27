/**
 * Keyboard focus is visible on the interactive controls of the three auth
 * pages (`src/routes/sign-in.tsx`, `src/routes/forgot-password.tsx`,
 * `src/routes/reset-password.tsx`).
 *
 * The six focusable controls a keyboard user meets before signing in — the
 * /sign-in submit button, the sign-in/sign-up mode toggle, the two footer
 * links on /sign-in, and the submit buttons of /forgot-password and
 * /reset-password — had no `:focus-visible` style at all, while
 * `src/styles.css` has no global rule, so tabbing from the email field to
 * any of them showed no focus indicator. This file locks the focus pair
 * (`focus-visible:outline-2 focus-visible:outline-primary`) at the end of
 * each control's exact class string, `type="submit"` on the three submit
 * buttons, `type="button"` on the mode toggle, the toggle handler, the
 * labels, the link targets and the file-wide counts. The async buttons
 * already carry `aria-busy` plus a sr-only status line — none is added
 * here. No server function, RPC schema or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SIGN_IN_FILE = join(ROOT, 'src', 'routes', 'sign-in.tsx');
const FORGOT_FILE = join(ROOT, 'src', 'routes', 'forgot-password.tsx');
const RESET_FILE = join(ROOT, 'src', 'routes', 'reset-password.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const signIn = source(SIGN_IN_FILE);
const forgot = source(FORGOT_FILE);
const reset = source(RESET_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The `<button …>…</button>` block containing the given marker text. */
function buttonOf(page: string, marker: string) {
  const markerIdx = page.indexOf(marker);
  assert.ok(markerIdx > 0, `the button carrying ${marker} is rendered`);
  const open = page.lastIndexOf('<button', markerIdx);
  const close = page.indexOf('</button>', open) + '</button>'.length;
  assert.ok(open > 0 && close > open, `the button carrying ${marker} is closed`);
  return page.slice(open, close);
}

/** The `<Link …>…</Link>` block for the given route target. */
function linkOf(page: string, target: string) {
  const start = page.indexOf(`<Link to="${target}"`);
  assert.ok(start >= 0, `the ${target} link is rendered`);
  const end = page.indexOf('</Link>', start) + '</Link>'.length;
  assert.ok(end > start, `the ${target} link is closed`);
  return page.slice(start, end);
}

const signInSubmit = buttonOf(signIn, 'type="submit"');
const signInToggle = buttonOf(signIn, 'type="button"');
const forgotLink = linkOf(signIn, '/forgot-password');
const privacyLink = linkOf(signIn, '/privacy');
const forgotSubmit = buttonOf(forgot, 'type="submit"');
const resetSubmit = buttonOf(reset, 'type="submit"');

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';
const SIGN_IN_SUBMIT_CLASS =
  'btn btn-primary w-full flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-primary';
const SIGN_IN_TOGGLE_CLASS =
  'text-foreground font-medium hover:underline focus-visible:outline-2 focus-visible:outline-primary';
const FOOTER_LINK_CLASS = 'hover:underline focus-visible:outline-2 focus-visible:outline-primary';
const SUBMIT_CLASS =
  'btn btn-primary flex w-full items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-primary';

describe('auth focus: every control on the three pages shows keyboard focus', () => {
  it('the /sign-in submit button ends its cn literal with the focus pair', () => {
    assert.ok(
      signInSubmit.includes(`className={cn('${SIGN_IN_SUBMIT_CLASS}')}`),
      'the submit classes stay with the focus pair appended',
    );
    assert.ok(SIGN_IN_SUBMIT_CLASS.endsWith(FOCUS_PAIR), 'the focus classes end the cn literal');
    assert.equal(count(signInSubmit, /focus-visible/g), 2, 'the submit button carries the pair exactly once');
  });

  it('the /sign-in mode toggle ends its class string with the focus pair', () => {
    assert.ok(
      signInToggle.includes(`className="${SIGN_IN_TOGGLE_CLASS}"`),
      'the toggle classes stay with the focus pair appended',
    );
    assert.ok(SIGN_IN_TOGGLE_CLASS.endsWith(FOCUS_PAIR), 'the focus classes end the class string');
    assert.equal(count(signInToggle, /focus-visible/g), 2, 'the toggle carries the pair exactly once');
  });

  it('both /sign-in footer links end their class string with the focus pair', () => {
    for (const link of [forgotLink, privacyLink]) {
      assert.ok(
        link.includes(`className="${FOOTER_LINK_CLASS}"`),
        'the link classes stay with the focus pair appended',
      );
      assert.ok(FOOTER_LINK_CLASS.endsWith(FOCUS_PAIR), 'the focus classes end the class string');
      assert.equal(count(link, /focus-visible/g), 2, 'the link carries the pair exactly once');
    }
  });

  it('the /forgot-password and /reset-password submit buttons end with the focus pair', () => {
    for (const button of [forgotSubmit, resetSubmit]) {
      assert.ok(
        button.includes(`className="${SUBMIT_CLASS}"`),
        'the submit classes stay with the focus pair appended',
      );
      assert.ok(SUBMIT_CLASS.endsWith(FOCUS_PAIR), 'the focus classes end the class string');
      assert.equal(count(button, /focus-visible/g), 2, 'the button carries the pair exactly once');
    }
  });
});

describe('auth focus: the controls keep their behaviour', () => {
  it('the /sign-in submit button keeps type, pending wiring and label in order', () => {
    assert.ok(signInSubmit.startsWith('<button'), 'the control stays a plain button element');
    assert.ok(signInSubmit.includes('type="submit"'), 'the submit button stays a submit button');
    assert.ok(signInSubmit.includes('disabled={pending}'), 'disabled stays driven by pending');
    assert.ok(signInSubmit.includes('aria-busy={pending}'), 'aria-busy stays driven by pending');
    assert.ok(
      signInSubmit.indexOf('type="submit"') < signInSubmit.indexOf('disabled=') &&
        signInSubmit.indexOf('disabled=') < signInSubmit.indexOf('aria-busy=') &&
        signInSubmit.indexOf('aria-busy=') < signInSubmit.indexOf('className='),
      'type, disabled, aria-busy and class order stays',
    );
    assert.ok(
      signInSubmit.includes('<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />'),
      'the spinner stays hidden with its original class',
    );
    assert.equal(
      count(signInSubmit, /\{mode === 'sign-in' \? 'Sign in' : 'Create account'\}/g),
      1,
      'the label expression stays exactly once',
    );
  });

  it('the /sign-in mode toggle keeps type, handler and label', () => {
    assert.ok(signInToggle.startsWith('<button'), 'the toggle stays a plain button element');
    assert.ok(signInToggle.includes('type="button"'), 'the toggle stays a plain button');
    assert.ok(
      signInToggle.indexOf('type="button"') < signInToggle.indexOf('className=') &&
        signInToggle.indexOf('className=') < signInToggle.indexOf('onClick='),
      'type, class and handler order stays',
    );
    assert.ok(signInToggle.includes('setError(null);'), 'the error reset stays');
    assert.ok(
      signInToggle.includes("setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');"),
      'the mode switch stays',
    );
    assert.equal(
      count(signInToggle, /\{mode === 'sign-in' \? 'Create one' : 'Sign in'\}/g),
      1,
      'the toggle label stays exactly once',
    );
  });

  it('the footer links keep their targets, texts and wrapper', () => {
    assert.ok(forgotLink.startsWith('<Link to="/forgot-password"'), 'the forgot link target stays');
    assert.equal(count(forgotLink, /Forgot your password\?/g), 1, 'the forgot link text stays');
    assert.ok(privacyLink.startsWith('<Link to="/privacy"'), 'the privacy link target stays');
    assert.equal(count(privacyLink, /How your data is handled/g), 1, 'the privacy link text stays');
    assert.ok(signIn.includes("{' · '}"), 'the separator between the links stays');
    assert.ok(signIn.includes("{mode === 'sign-in' && ("), 'the forgot link stays gated on sign-in mode');
  });

  it('the two reset submit buttons keep type, pending wiring, spinner and label', () => {
    for (const [button, label] of [
      [forgotSubmit, 'Send the reset link'],
      [resetSubmit, 'Save the new password'],
    ] as const) {
      assert.ok(button.includes('type="submit"'), `${label}: stays a submit button`);
      assert.ok(button.includes('disabled={pending}'), `${label}: disabled stays driven by pending`);
      assert.ok(button.includes('aria-busy={pending}'), `${label}: aria-busy stays driven by pending`);
      assert.ok(
        button.indexOf('type="submit"') < button.indexOf('disabled=') &&
          button.indexOf('disabled=') < button.indexOf('aria-busy=') &&
          button.indexOf('aria-busy=') < button.indexOf('className='),
        `${label}: attribute order stays`,
      );
      assert.ok(
        button.includes('<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />'),
        `${label}: the spinner stays hidden`,
      );
      assert.equal(count(button, new RegExp(label, 'g')), 1, `${label}: the label stays exactly once`);
    }
  });

  it('keeps the pending status lines and the untouched auth flow', () => {
    for (const [page, status] of [
      [signIn, 'Signing in…'],
      [forgot, 'Sending the reset link…'],
      [reset, 'Saving the new password…'],
    ] as const) {
      assert.equal(count(page, /aria-live="polite"/g), 1, 'exactly one polite live region stays');
      assert.ok(
        page.includes('<p role="status" aria-live="polite" className="sr-only">'),
        'the pending status line stays sr-only',
      );
      assert.ok(page.includes(status), 'the pending status copy stays');
    }
    assert.ok(signIn.includes('const parsed = credentialsSchema.safeParse({'), 'the Zod validation stays');
    assert.equal(count(signIn, /function safeRedirect/g), 1, 'safeRedirect stays untouched');
    assert.ok(signIn.includes('rateLimitMessage()'), 'the rate-limit message stays');
    assert.ok(forgot.includes('!features.passwordReset'), 'the feature-flag branch stays');
  });
});

describe('auth focus: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(signIn, /focus-visible/g), 8, 'four controls, one focus pair each');
    assert.equal(count(forgot, /focus-visible/g), 2, 'the submit button carries one focus pair');
    assert.equal(count(reset, /focus-visible/g), 2, 'the submit button carries one focus pair');
    assert.equal(count(signIn, /<button/g), 2, 'the two sign-in buttons stay');
    assert.equal(count(forgot, /<button/g), 1, 'the one forgot-password button stays');
    assert.equal(count(reset, /<button/g), 1, 'the one reset-password button stays');
    assert.equal(count(signIn, /type="submit"/g), 1, 'one submit button on /sign-in');
    assert.equal(count(forgot, /type="submit"/g), 1, 'one submit button on /forgot-password');
    assert.equal(count(reset, /type="submit"/g), 1, 'one submit button on /reset-password');
    assert.equal(count(signIn, /type="button"/g), 1, 'the toggle stays the only plain button');
    assert.equal(count(signIn, /<Link/g), 2, 'the two footer links stay');
    assert.equal(count(signIn, /className=\{cn\(/g), 1, 'no cn block is added');
    assert.equal(count(signIn, /aria-busy/g), 1, 'no busy state is added on /sign-in');
    assert.equal(count(forgot, /aria-busy/g), 1, 'no busy state is added on /forgot-password');
    assert.equal(count(reset, /aria-busy/g), 1, 'no busy state is added on /reset-password');
    assert.equal(count(signIn, /aria-live/g), 1, 'no live region is added on /sign-in');
    assert.equal(count(forgot, /aria-live/g), 1, 'no live region is added on /forgot-password');
    assert.equal(count(reset, /aria-live/g), 1, 'no live region is added on /reset-password');
    assert.equal(count(signIn, /role=/g), 2, 'the alert and status roles stay');
    assert.equal(count(forgot, /role=/g), 3, 'the sent, alert and status roles stay');
    assert.equal(count(reset, /role=/g), 4, 'the two alerts and two statuses stay');
    assert.equal(count(signIn, /className="sr-only"/g), 1, 'no sr-only helper is added');
    assert.equal(count(forgot, /className="sr-only"/g), 1, 'no sr-only helper is added');
    assert.equal(count(reset, /className="sr-only"/g), 1, 'no sr-only helper is added');
    assert.equal(count(signIn, /aria-hidden/g), 1, 'the spinner stays the only hidden element');
    assert.equal(count(forgot, /aria-hidden/g), 1, 'the spinner stays the only hidden element');
    assert.equal(count(reset, /aria-hidden/g), 1, 'the spinner stays the only hidden element');
  });

  it('adds no server function, RPC schema or migration', () => {
    for (const page of [signIn, forgot, reset]) {
      assert.equal(
        /createServerFn|graphCall|rpc-schemas|migrat/i.test(page),
        false,
        'the page adds no data path',
      );
    }
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('focus-visible:outline-primary'), false, `${file} gained page focus styles`);
    }
  });
});
