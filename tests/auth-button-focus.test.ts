/**
 * Keyboard focus is visible on the buttons and links of the three auth pages
 * (`/sign-in`, `/forgot-password`, `/reset-password`).
 *
 * These public pages are the product's front door: they are seen before a
 * learner signs in. Six focusable elements — the sign-in submit button, the
 * mode toggle, the two footer links, and the submit button of each
 * reset-request page — had no `:focus-visible` style, and `src/styles.css`
 * has no global rule, so a keyboard user tabbing from the email field to the
 * submit button or a footer link saw no focus indicator at all.
 *
 * This file locks the exact class string of each of the six elements with the
 * two focus classes appended at the end, the three submit buttons keeping
 * `type="submit"` and the toggle keeping `type="button"`, the handlers,
 * labels and `to` targets, and the file-wide counts. The pages stay
 * synchronous apart from the existing `pending` state (already announced with
 * `aria-busy` + a status line), so no busy state or live region is added. No
 * server function, RPC schema or migration is involved.
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

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';

/** Slice an element from its opening `<button` to its `</button>`. */
function buttonAround(page: string, marker: string, label: string) {
  const markerIdx = page.indexOf(marker);
  assert.ok(markerIdx > 0, `${label}: the marker is rendered`);
  const open = page.lastIndexOf('<button', markerIdx);
  const close = page.indexOf('</button>', open) + '</button>'.length;
  assert.ok(open >= 0 && close > open, `${label}: the button is closed`);
  return page.slice(open, close);
}

/** Slice a `<Link …>…</Link>` by its `to` target. */
function linkTo(page: string, to: string, label: string) {
  const marker = `<Link to="${to}"`;
  const start = page.indexOf(marker);
  assert.ok(start > 0, `${label}: the link is rendered`);
  const close = page.indexOf('</Link>', start) + '</Link>'.length;
  return page.slice(start, close);
}

const SIGN_IN_SUBMIT = buttonAround(signIn, 'type="submit"', '/sign-in submit');
const SIGN_IN_TOGGLE = buttonAround(signIn, 'type="button"', '/sign-in toggle');
const SIGN_IN_FORGOT = linkTo(signIn, '/forgot-password', '/sign-in forgot-password link');
const SIGN_IN_PRIVACY = linkTo(signIn, '/privacy', '/sign-in privacy link');
const FORGOT_SUBMIT = buttonAround(forgot, 'type="submit"', '/forgot-password submit');
const RESET_SUBMIT = buttonAround(reset, 'type="submit"', '/reset-password submit');

const SUBMIT_CLASS = 'btn btn-primary w-full flex items-center justify-center gap-2';
const RESET_SUBMIT_CLASS = 'btn btn-primary flex w-full items-center justify-center gap-2';
const TOGGLE_CLASS = 'text-foreground font-medium hover:underline';
const LINK_CLASS = 'hover:underline';

describe('auth pages: every focusable element shows keyboard focus', () => {
  it('the sign-in submit button keeps its cn class with the focus pair at the end', () => {
    assert.ok(SIGN_IN_SUBMIT.includes('className={cn('), 'the button still uses cn()');
    const literal = `'${SUBMIT_CLASS} ${FOCUS_PAIR}'`;
    assert.ok(SIGN_IN_SUBMIT.includes(literal), 'the class literal gains the focus pair');
    assert.ok(
      `${SUBMIT_CLASS} ${FOCUS_PAIR}`.endsWith(FOCUS_PAIR),
      'the focus pair ends the classes',
    );
  });

  it('the mode toggle keeps its exact class string with the focus pair at the end', () => {
    assert.ok(
      SIGN_IN_TOGGLE.includes(`className="${TOGGLE_CLASS} ${FOCUS_PAIR}"`),
      'the toggle classes stay with the focus pair appended',
    );
  });

  it('both footer links carry the focus pair after hover:underline', () => {
    for (const [link, label] of [
      [SIGN_IN_FORGOT, 'forgot-password link'],
      [SIGN_IN_PRIVACY, 'privacy link'],
    ] as const) {
      assert.ok(
        link.includes(`className="${LINK_CLASS} ${FOCUS_PAIR}"`),
        `${label}: the classes stay with the focus pair appended`,
      );
    }
  });

  it('both reset-password submit buttons carry the focus pair at the end', () => {
    for (const [button, label] of [
      [FORGOT_SUBMIT, '/forgot-password submit'],
      [RESET_SUBMIT, '/reset-password submit'],
    ] as const) {
      assert.ok(
        button.includes(`className="${RESET_SUBMIT_CLASS} ${FOCUS_PAIR}"`),
        `${label}: the classes stay with the focus pair appended`,
      );
    }
  });

  it('each of the six elements carries the focus pair exactly once', () => {
    for (const [element, label] of [
      [SIGN_IN_SUBMIT, 'sign-in submit'],
      [SIGN_IN_TOGGLE, 'sign-in toggle'],
      [SIGN_IN_FORGOT, 'forgot-password link'],
      [SIGN_IN_PRIVACY, 'privacy link'],
      [FORGOT_SUBMIT, 'forgot submit'],
      [RESET_SUBMIT, 'reset submit'],
    ] as const) {
      assert.equal(count(element, /focus-visible/g), 2, `${label}: both focus classes, once each`);
    }
  });
});

describe('auth pages: the focusable elements keep their behaviour', () => {
  it('the three submit buttons stay submit buttons and the toggle stays a plain button', () => {
    for (const [button, label] of [
      [SIGN_IN_SUBMIT, '/sign-in submit'],
      [FORGOT_SUBMIT, '/forgot-password submit'],
      [RESET_SUBMIT, '/reset-password submit'],
    ] as const) {
      assert.ok(button.includes('type="submit"'), `${label}: type="submit" stays`);
      assert.ok(
        button.includes('disabled={pending}'),
        `${label}: disabled stays driven by pending`,
      );
      assert.ok(button.includes('aria-busy={pending}'), `${label}: aria-busy stays`);
    }
    assert.ok(SIGN_IN_TOGGLE.includes('type="button"'), 'the toggle stays type="button"');
  });

  it('keeps the sign-in toggle handler and its label branches', () => {
    assert.ok(
      SIGN_IN_TOGGLE.includes("setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')"),
      'the toggle handler stays',
    );
    assert.ok(SIGN_IN_TOGGLE.includes('setError(null)'), 'the toggle clears the error');
    assert.ok(
      SIGN_IN_TOGGLE.includes("{mode === 'sign-in' ? 'Create one' : 'Sign in'}"),
      'the toggle label branches stay',
    );
  });

  it('keeps the sign-in labels and the footer link targets', () => {
    assert.ok(
      SIGN_IN_SUBMIT.includes("{mode === 'sign-in' ? 'Sign in' : 'Create account'}"),
      'the submit label branches stay',
    );
    assert.ok(
      SIGN_IN_SUBMIT.includes('<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />'),
      'the hidden spinner stays',
    );
    assert.ok(SIGN_IN_FORGOT.includes('Forgot your password?'), 'the forgot link copy stays');
    assert.ok(SIGN_IN_PRIVACY.includes('How your data is handled'), 'the privacy link copy stays');
    assert.ok(signIn.includes("{' · '}"), 'the footer separator stays');
    assert.ok(signIn.includes("{mode === 'sign-in' && ("), 'the forgot link stays conditional');
  });

  it('keeps the reset submit labels and spinners', () => {
    assert.ok(FORGOT_SUBMIT.includes('Send the reset link'), 'the forgot submit label stays');
    assert.ok(RESET_SUBMIT.includes('Save the new password'), 'the reset submit label stays');
    for (const button of [FORGOT_SUBMIT, RESET_SUBMIT]) {
      assert.ok(
        button.includes('<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />'),
        'the hidden spinner stays',
      );
    }
  });
});

describe('auth pages: the file counts stay locked', () => {
  it('matches the sign-in file-wide counts', () => {
    assert.equal(count(signIn, /focus-visible/g), 8, 'four elements, two focus classes each');
    assert.equal(count(signIn, /<button/g), 2, 'the submit button and the toggle stay');
    assert.equal(count(signIn, /type="submit"/g), 1, 'one submit button stays');
    assert.equal(count(signIn, /type="button"/g), 1, 'one plain toggle stays');
    assert.equal(count(signIn, /<Link/g), 2, 'the two footer links stay');
    assert.equal(count(signIn, /className=\{cn\(/g), 1, 'the submit button keeps its cn() class');
    assert.equal(count(signIn, /aria-hidden/g), 1, 'the spinner stays the only hidden element');
    assert.equal(count(signIn, /aria-busy/g), 1, 'no busy state is added');
    assert.equal(count(signIn, /aria-live/g), 1, 'no live region is added');
    assert.equal(count(signIn, /role=/g), 2, 'the alert and status roles stay');
    assert.equal(count(signIn, /className="sr-only"/g), 1, 'the status helper stays');
  });

  it('matches the two reset-password file-wide counts', () => {
    assert.equal(count(forgot, /focus-visible/g), 2, 'one focus pair on the submit button');
    assert.equal(count(forgot, /<button/g), 1, 'the submit button stays alone');
    assert.equal(count(forgot, /type="submit"/g), 1, 'one submit button stays');
    assert.equal(count(forgot, /role=/g), 3, 'the sent status, form alert and pending status stay');
    assert.equal(count(reset, /focus-visible/g), 2, 'one focus pair on the submit button');
    assert.equal(count(reset, /<button/g), 1, 'the submit button stays alone');
    assert.equal(count(reset, /type="submit"/g), 1, 'one submit button stays');
    assert.equal(
      count(reset, /role=/g),
      4,
      'the invalid-link alert, done status, form alert and pending status stay',
    );
  });

  it('adds no server function, RPC schema or migration', () => {
    for (const page of [signIn, forgot, reset]) {
      assert.equal(
        /createServerFn|graphCall|rpc-schemas/.test(page),
        false,
        'the pages add no data path',
      );
    }
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(
        other.includes('focus-visible:outline-primary'),
        false,
        `${file} gained auth focus styles`,
      );
    }
  });
});
