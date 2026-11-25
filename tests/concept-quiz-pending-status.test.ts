/**
 * Quiz busy status is announced (`ConceptQuiz`).
 *
 * "Check my answers" calls `submit`, which flips `busy` true while the answers
 * are graded on the server. While busy the button only faded (`disabled` +
 * `disabled:opacity-60`): its accessible name stayed "Check my answers", there
 * was no `aria-busy`, and no live region said anything, so a screen reader
 * could not tell that checking was in progress and the button looked frozen.
 * "Not now" was simply disabled with no announcement either.
 *
 * This file locks `aria-busy={busy}` next to `disabled={busy}` on the submit
 * button with its type, classes, label and spinner untouched, a new `sr-only`
 * polite `role="status"` line after both buttons inside the same `<form>` that
 * says `Checking your answers…` while busy and clears when idle, the existing
 * `role="alert"` error line, the untouched `submit` flow, and that no server
 * function, RPC call or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const QUIZ_FILE = join(ROOT, 'src', 'components', 'ConceptQuiz.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const quiz = source(QUIZ_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The whole answer form, from `<form>` to its closing `</form>`. */
const FORM_OPEN = '<form onSubmit={submit} noValidate>';
const formStart = quiz.indexOf(FORM_OPEN);
assert.ok(formStart > 0, 'the quiz answer form is rendered');
const formEnd = quiz.indexOf('</form>', formStart) + '</form>'.length;
const form = quiz.slice(formStart, formEnd);
assert.ok(form.includes('Check my answers'), 'the form holds the submit button');
assert.ok(form.includes('Not now'), 'the form holds the cancel button');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string) => {
  const labelIdx = form.indexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = form.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(form.slice(open, labelIdx).includes('</button>'), false, `the "${label}" label is inside its button`);
  return form.slice(open, labelIdx);
};

const CHECK = buttonOf('Check my answers');

describe('ConceptQuiz: the submit button announces it is busy', () => {
  it('adds aria-busy={busy} right after disabled={busy} on the submit button', () => {
    assert.ok(CHECK.includes('type="submit"'), 'the button stays a submit');
    assert.ok(CHECK.includes('disabled={busy}'), 'disabled stays driven by busy');
    assert.ok(CHECK.includes('aria-busy={busy}'), 'aria-busy is driven by busy');
    assert.ok(
      CHECK.indexOf('disabled={busy}') < CHECK.indexOf('aria-busy={busy}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(form, /aria-busy=\{busy\}/g), 1, 'one aria-busy, on the submit button only');
  });

  it('keeps the submit classes, label and spinner untouched', () => {
    assert.ok(
      CHECK.includes(
        'className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"',
      ),
      'submit classes untouched',
    );
    assert.equal(count(form, /Check my answers/g), 1, 'the submit label stays once');
    assert.ok(
      form.includes('{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}'),
      'the existing spinner stays hidden and unchanged',
    );
  });

  it('leaves the Not now button disabled but without aria-busy', () => {
    const cancel = buttonOf('Not now');
    assert.ok(cancel.includes('type="button"'), 'cancel stays a plain button');
    assert.ok(cancel.includes('onClick={onCancel}'), 'cancel handler stays');
    assert.ok(cancel.includes('disabled={busy}'), 'cancel stays disabled while busy');
    assert.equal(cancel.includes('aria-busy'), false, 'cancel gets no aria-busy');
    assert.ok(
      cancel.includes(
        'className="inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-primary/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"',
      ),
      'cancel classes untouched',
    );
    assert.equal(count(form, /Not now/g), 1, 'the cancel label stays once');
  });
});

describe('ConceptQuiz: one polite status line after the buttons', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the busy line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(form, /aria-live="polite"/g), 1, 'one polite live region in the form');
  });

  it('says Checking your answers… while busy and clears when idle', () => {
    assert.ok(form.includes("{busy ? 'Checking your answers…' : ''}"), 'the status text follows busy');
    assert.equal(count(form, /Checking your answers…/g), 1, 'the status copy appears once');
  });

  it('sits after both buttons as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status"');
    const checkClose = form.indexOf('</button>', form.indexOf('Check my answers'));
    const cancelClose = form.indexOf('</button>', form.indexOf('Not now'));
    assert.ok(checkClose > 0, 'the submit button is closed');
    assert.ok(cancelClose > checkClose, 'the cancel button follows');
    assert.ok(statusStart > cancelClose, 'the status line follows both buttons');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the form',
    );
  });
});

describe('ConceptQuiz: the error line and the untouched surroundings', () => {
  it('keeps the single role="alert" error line and the loading status line', () => {
    assert.equal(count(form, /role="alert"/g), 1, 'one alert line for errors');
    assert.ok(
      form.includes('<p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">'),
      'the error line keeps its role and classes',
    );
    assert.equal(count(form, /role="status"/g), 2, 'the loading line and the new busy line');
    assert.ok(
      form.includes('mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status"'),
      'Preparing questions… keeps its role without aria-live',
    );
  });

  it('keeps the submit flow intact', () => {
    assert.ok(quiz.includes('const submit = async (e: FormEvent) => {'), 'submit stays');
    assert.ok(quiz.includes('setBusy(true);'), 'busy still starts with the request');
    assert.ok(quiz.includes("setError('Answer every question first.');"), 'the completeness guard stays');
    assert.ok(
      quiz.includes('await submitConceptQuiz({ data: { sessionId: quiz.sessionId, answers } })'),
      'the grading call stays',
    );
    assert.ok(quiz.includes('requestAnimationFrame(() => resultRef.current?.focus());'), 'the result focus move stays');
    assert.ok(quiz.includes('} finally {'), 'busy still clears in finally');
    assert.ok(quiz.includes('setBusy(false);'), 'busy still clears');
  });

  it('keeps the rest of the quiz markup untouched', () => {
    assert.ok(quiz.includes('<form onSubmit={submit} noValidate>'), 'the form stays');
    assert.ok(quiz.includes('{result.passed ? ('), 'the result branch stays');
    assert.ok(quiz.includes('Quick quiz: {conceptName}'), 'the heading copy stays');
    assert.ok(quiz.includes('data-testid="concept-quiz"'), 'the container test id stays');
  });
});

describe('ConceptQuiz: no replaced name and no new data path', () => {
  it('adds no aria-label, aria-labelledby or aria-atomic to the form', () => {
    assert.equal(count(form, /aria-label=/g), 0);
    assert.equal(count(form, /aria-labelledby=/g), 0);
    assert.equal(count(form, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/graphCall|rpc-schemas|migrat/i.test(quiz), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Checking your answers'), false, `${file} gained the status copy`);
      assert.equal(other.includes('check-my-answers-busy'), false, `${file} gained busy wiring`);
    }
  });
});
