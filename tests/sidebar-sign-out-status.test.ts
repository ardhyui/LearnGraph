/**
 * Signing out is announced (`Sidebar`).
 *
 * The footer `Sign out` button called `handleSignOut`, which signed out,
 * invalidated and navigated but disabled nothing and announced nothing: while
 * the request was in flight the button stayed clickable (a double click could
 * fire two sign-outs) and a screen reader could not tell that the session was
 * being closed. This file locks `disabled={signingOut}` and
 * `aria-busy={signingOut}` on that button with its type, handler, classes,
 * icon and label untouched, the `signingOut` state and its
 * guard/marking/cleanup in `handleSignOut`, and one `sr-only` polite
 * `role="status"` line as the last child of the footer that says
 * `Signing you out…` while a sign-out is in flight and clears when idle. The
 * old behaviour (three awaits, no new catch) stays, and no server function,
 * RPC schema or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SIDEBAR_FILE = join(ROOT, 'src', 'components', 'Sidebar.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const sidebar = source(SIDEBAR_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The footer block, from its opening tag to its closing `</div>`. */
const FOOTER_OPEN = '<div className="p-4 border-t border-sidebar-border">';
const footerStart = sidebar.indexOf(FOOTER_OPEN);
assert.ok(footerStart > 0, 'the sidebar footer is rendered');
const footerEnd = sidebar.indexOf('</div>\n      </aside>', footerStart) + '</div>'.length;
const footer = sidebar.slice(footerStart, footerEnd);

/** The opening tag of the Sign out button. */
const signOutLabelIdx = sidebar.indexOf('Sign out\n              </button>');
assert.ok(signOutLabelIdx > 0, 'the Sign out button is rendered');
const buttonOpen = sidebar.lastIndexOf('<button', signOutLabelIdx);
assert.ok(buttonOpen > 0, 'the Sign out button has an opening tag');
const buttonClose = sidebar.indexOf('</button>', buttonOpen) + '</button>'.length;
const BUTTON = sidebar.slice(buttonOpen, buttonClose);

/** The `handleSignOut` handler, from its declaration to its closing `}`. */
const handlerStart = sidebar.indexOf('async function handleSignOut() {');
assert.ok(handlerStart > 0, 'the sign-out handler is rendered');
const handlerEnd = sidebar.indexOf('\n  }', handlerStart) + '\n  }'.length;
const handler = sidebar.slice(handlerStart, handlerEnd);

describe('Sidebar: the Sign out button announces it is busy', () => {
  it('adds disabled and aria-busy after the classes, driven by signingOut', () => {
    assert.ok(BUTTON.includes('type="button"'), 'the button stays a plain button');
    assert.ok(BUTTON.includes('onClick={handleSignOut}'), 'the handler stays');
    assert.ok(
      BUTTON.includes(
        'className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"',
      ),
      'the classes stay exactly',
    );
    assert.ok(BUTTON.includes('disabled={signingOut}'), 'the button disables while signing out');
    assert.ok(BUTTON.includes('aria-busy={signingOut}'), 'the button is busy while signing out');
    assert.ok(
      BUTTON.indexOf('className=') < BUTTON.indexOf('disabled={signingOut}'),
      'disabled sits after className',
    );
    assert.ok(
      BUTTON.indexOf('disabled={signingOut}') < BUTTON.indexOf('aria-busy={signingOut}'),
      'aria-busy sits after disabled',
    );
    assert.ok(
      BUTTON.indexOf('aria-busy={signingOut}') < BUTTON.indexOf('aria-label="Sign out"'),
      'the existing label stays after the new attributes',
    );
  });

  it('keeps the icon and the visible label', () => {
    assert.ok(BUTTON.includes('<LogOut className="h-3.5 w-3.5" />'), 'the icon stays');
    assert.ok(BUTTON.includes('Sign out\n              </button>'), 'the label stays');
    assert.equal(count(sidebar, /aria-label="Sign out"/g), 1, 'the Sign out label stays once');
  });
});

describe('Sidebar: signing out is announced once', () => {
  it('adds exactly one sr-only polite status line for signing out', () => {
    assert.ok(
      footer.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the sign-out line is a sr-only paragraph carrying role and politeness',
    );
    assert.ok(footer.includes("{signingOut ? 'Signing you out…' : ''}"), 'the status text follows signingOut');
    assert.equal(count(footer, /Signing you out…/g), 1, 'the status copy appears once');
  });

  it('sits after the user block as the last child of the footer', () => {
    const statusStart = footer.lastIndexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the sign-out line is in the footer');
    const userBlock = footer.indexOf('{user && (');
    assert.ok(userBlock > 0, 'the user block is rendered');
    assert.ok(userBlock < statusStart, 'the status line follows the user block');
    const userClose = footer.indexOf('          )}', userBlock);
    assert.ok(userClose > 0, 'the user block is closed');
    assert.ok(userClose < statusStart, 'the status line is outside the user block');
    const statusEnd = footer.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      footer.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</div>',
      'the status line is the last child of the footer',
    );
  });
});

describe('Sidebar: the sign-out flow keeps its behaviour', () => {
  it('declares signingOut after open', () => {
    const open = sidebar.indexOf('const [open, setOpen] = useState(false);');
    const signingOut = sidebar.indexOf('const [signingOut, setSigningOut] = useState(false);');
    assert.ok(open > 0, 'the drawer open state stays');
    assert.ok(signingOut > open, 'signingOut is declared after open');
  });

  it('guards re-entry first', () => {
    const guard = handler.indexOf('if (signingOut) return;');
    assert.ok(guard > 0, 'the guard stays');
    assert.ok(
      guard < handler.indexOf('await authClient.signOut();'),
      'the guard runs before the sign-out call',
    );
    assert.equal(count(handler, /if \(signingOut\) return;/g), 1, 'the guard appears once');
  });

  it('marks signing out before the try and keeps the three awaits', () => {
    const mark = handler.indexOf('setSigningOut(true);');
    const tryAt = handler.indexOf('try {');
    assert.ok(mark > 0, 'signing out is marked');
    assert.ok(mark < tryAt, 'the mark is set before the try');
    assert.equal(count(handler, /setSigningOut\(true\);/g), 1, 'the mark is set once');
    const body = handler.slice(tryAt);
    assert.ok(body.includes('await authClient.signOut();'), 'the sign-out call stays');
    assert.ok(body.includes('await router.invalidate();'), 'the router still invalidates');
    assert.ok(
      body.includes("await router.navigate({ to: '/sign-in', search: {} });"),
      'the redirect stays',
    );
  });

  it('keeps the unhandled rejection: a finally clears the mark, no catch is added', () => {
    assert.equal(count(handler, /catch/g), 0, 'no catch is added');
    assert.ok(handler.includes('finally {'), 'the try gains a finally');
    const finallyIdx = handler.indexOf('finally {');
    assert.ok(handler.slice(finallyIdx).includes('setSigningOut(false);'), 'signing out is cleared in the finally');
    assert.equal(count(handler, /finally \{/g), 1, 'no extra finally is added');
  });
});

describe('Sidebar: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(sidebar, /aria-busy/g), 1, 'the single sign-out marker');
    assert.equal(count(sidebar, /aria-busy=/g), 1, 'one aria-busy attribute');
    assert.equal(count(sidebar, /aria-live/g), 1, 'the sign-out status line');
    assert.equal(count(sidebar, /role="status"/g), 1, 'the sign-out status line');
    assert.equal(count(sidebar, /role="alert"/g), 0, 'no alert is added');
    assert.equal(count(sidebar, /aria-label=/g), 5, 'the five existing labels stay');
    assert.equal(count(sidebar, /aria-labelledby/g), 1, 'the section list label stays');
    assert.equal(count(sidebar, /aria-atomic/g), 0, 'no aria-atomic is added');
    assert.equal(count(sidebar, /className="sr-only"/g), 1, 'only the sign-out line is sr-only');
    assert.equal(count(sidebar, /role="/g), 1, 'one status line');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(sidebar),
      false,
      'the component adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Signing you out'), false, `${file} gained the status copy`);
      assert.equal(other.includes('sidebar-sign-out-busy'), false, `${file} gained busy wiring`);
    }
  });
});
