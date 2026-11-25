/**
 * "Prepare the context" busy status is announced (`TutorContext`).
 *
 * The question form calls `getTutorContext`, which flips `busy` true. While
 * busy the submit button only faded (`disabled` + `disabled:opacity-60`) and
 * showed an `aria-hidden` spinner: its accessible name stayed "Prepare the
 * context", there was no `aria-busy`, and no live region spoke, so a screen
 * reader could not tell the tutor brief was being prepared and the button
 * looked frozen. The separate "Ask Claude" button (`asking`) is out of scope.
 *
 * This file locks `aria-busy={busy}` next to `disabled={busy}` on the submit
 * button with its type, classes, label and spinner untouched, a new `sr-only`
 * polite `role="status"` line inside the same `<form>` that says `Preparing
 * the context…` while busy and clears when idle, the existing `role="alert"`
 * error and **Copied…** status, the untouched `prepare` flow, and that no
 * server function, RPC call or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TUTOR_FILE = join(ROOT, 'src', 'components', 'TutorContext.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const tutor = source(TUTOR_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The question form, from `<form>` to its closing `</form>`. */
const FORM_OPEN = '<form onSubmit={prepare} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">';
const formStart = tutor.indexOf(FORM_OPEN);
assert.ok(formStart > 0, 'the question form is rendered');
const formEnd = tutor.indexOf('</form>', formStart) + '</form>'.length;
const form = tutor.slice(formStart, formEnd);
assert.ok(form.includes('Prepare the context'), 'the form holds the submit button');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string) => {
  const labelIdx = tutor.indexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = tutor.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(tutor.slice(open, labelIdx).includes('</button>'), false, `the "${label}" label is inside its button`);
  return tutor.slice(open, labelIdx);
};

const PREPARE = buttonOf('Prepare the context');
const ASK = buttonOf('Ask Claude');

describe('TutorContext: the submit button announces it is busy', () => {
  it('adds aria-busy={busy} right after disabled={busy} on the submit button', () => {
    assert.ok(PREPARE.includes('type="submit"'), 'the button stays a submit');
    assert.ok(PREPARE.includes('disabled={busy}'), 'disabled stays driven by busy');
    assert.ok(PREPARE.includes('aria-busy={busy}'), 'aria-busy is driven by busy');
    assert.ok(
      PREPARE.indexOf('disabled={busy}') < PREPARE.indexOf('aria-busy={busy}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(tutor, /aria-busy=\{busy\}/g), 1, 'one aria-busy, on the submit button only');
  });

  it('keeps the submit classes, label and spinner untouched', () => {
    assert.ok(
      PREPARE.includes(
        'className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/10 disabled:opacity-60"',
      ),
      'submit classes untouched',
    );
    assert.equal(count(form, /Prepare the context/g), 1, 'the submit label stays once');
    assert.ok(
      form.includes('{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}'),
      'the existing spinner stays hidden and unchanged',
    );
  });

  it('leaves the Ask Claude button disabled but without aria-busy', () => {
    assert.ok(ASK.includes('type="button"'), 'Ask Claude stays a plain button');
    assert.ok(ASK.includes('onClick={() => void ask()}'), 'Ask Claude still calls ask');
    assert.ok(ASK.includes('disabled={asking}'), 'Ask Claude stays driven by asking');
    assert.equal(ASK.includes('aria-busy'), false, 'Ask Claude gets no aria-busy');
    assert.ok(
      ASK.includes(
        'className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"',
      ),
      'Ask Claude classes untouched',
    );
    assert.equal(count(tutor, /Ask Claude/g), 1, 'the Ask Claude label stays once');
  });
});

describe('TutorContext: one polite status line in the form', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the busy line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(form, /aria-live="polite"/g), 1, 'one polite live region in the form');
    assert.equal(count(form, /className="sr-only"/g), 1, 'the status line is the only sr-only element');
  });

  it('says Preparing the context… while busy and clears when idle', () => {
    assert.ok(form.includes("{busy ? 'Preparing the context…' : ''}"), 'the status text follows busy');
    assert.equal(count(form, /Preparing the context…/g), 1, 'the status copy appears once');
  });

  it('sits after the submit button as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status"');
    const submitClose = form.indexOf('</button>', form.indexOf('Prepare the context'));
    assert.ok(submitClose > 0, 'the submit button is closed');
    assert.ok(statusStart > submitClose, 'the status line follows the submit button');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the form',
    );
  });
});

describe('TutorContext: the existing notices and the untouched surroundings', () => {
  it('keeps the existing form error line and the chat error line', () => {
    assert.equal(count(tutor, /role="alert"/g), 2, 'the form error and the chat error stay');
    assert.ok(
      tutor.includes('<p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">'),
      'the error lines keep their role and classes',
    );
  });

  it('keeps the Copied status line outside the form', () => {
    assert.ok(
      tutor.includes('<span role="status" aria-live="polite" className="text-xs text-emerald-700 dark:text-emerald-400">'),
      'the copy confirmation stays a polite status',
    );
    assert.ok(
      tutor.includes("{copied ? 'Copied. Paste it into your AI tutor, with your question.' : ''}"),
      'the copy confirmation text stays',
    );
  });

  it('keeps the prepare flow intact', () => {
    assert.ok(tutor.includes('const prepare = async (e: FormEvent) => {'), 'prepare stays');
    assert.ok(tutor.includes('if (busy) return;'), 'the busy guard stays');
    assert.ok(tutor.includes('setBusy(true);'), 'busy still starts with the request');
    assert.ok(tutor.includes('setError(null);'), 'the old error is still cleared');
    assert.ok(tutor.includes('setCopied(false);'), 'the copy flag is still reset');
    assert.ok(
      tutor.includes(
        'setContext(await getTutorContext({ data: { learnerId, conceptId, query: query.trim() || undefined } }));',
      ),
      'the tutor-context request stays the same',
    );
    assert.ok(tutor.includes('requestAnimationFrame(() => textRef.current?.focus());'), 'focus still moves to the brief');
    assert.ok(tutor.includes('setBusy(false);'), 'busy still clears on finish');
  });

  it('keeps the section shell, labels and copy', () => {
    assert.ok(
      tutor.includes(
        '<section aria-labelledby={ids.heading} className="glass-card mt-6 p-4 sm:p-5" data-testid="tutor-context">',
      ),
      'the section shell stays',
    );
    assert.ok(tutor.includes('Ask an AI tutor'), 'the heading stays');
    assert.ok(tutor.includes('Your question'), 'the question label stays');
    assert.ok(tutor.includes('Copy context for AI tutor'), 'the copy button stays');
    assert.ok(tutor.includes('Or ask Claude here, with your own API key'), 'the chat block stays');
  });
});

describe('TutorContext: no replaced name and no new data path', () => {
  it('adds no aria-label, aria-labelledby or aria-atomic to the form', () => {
    assert.equal(count(form, /aria-label=/g), 0);
    assert.equal(count(form, /aria-labelledby=/g), 0);
    assert.equal(count(form, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migrat/i.test(tutor), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Preparing the context'), false, `${file} gained the status copy`);
      assert.equal(other.includes('tutor-context-busy'), false, `${file} gained busy wiring`);
    }
  });
});
