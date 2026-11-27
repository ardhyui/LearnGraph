/**
 * Saving a quiz question is announced (admin → Quiz Questions).
 *
 * "Save question" calls `saveQuizQuestion` (or, for an edited AI draft,
 * `reviewQuestionDraft`), which flips `saving` true. While saving the submit
 * button only faded (`disabled` + `disabled:opacity-60`) and showed an
 * `aria-hidden` spinner: its accessible name stayed the same, there was no
 * `aria-busy`, and no live region spoke, so a screen reader could not tell that
 * the question was being saved and the button looked frozen.
 *
 * This file locks `aria-busy={saving}` right after `disabled={saving}` on the
 * submit button with its type, classes, icons and label untouched, a new
 * `sr-only` polite `role="status"` line after the two-button row and before
 * `</form>` that says `Saving the question…` while saving and clears when idle,
 * the untouched Cancel, per-item Edit/Delete and Add question buttons, the
 * existing notice, error and "Loading questions…" lines, the untouched
 * `submit`/`load`/`openForm`/`edit`/`remove` flows, and that no server
 * function, RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const QUESTIONS_FILE = join(ROOT, 'src', 'routes', 'admin', 'questions.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(QUESTIONS_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The question form, from its `<form>` to its closing `</form>`. */
const formStart = page.indexOf('<form onSubmit={submit}');
assert.ok(formStart > 0, 'the question form is rendered');
const formEnd = page.indexOf('</form>', formStart) + '</form>'.length;
const form = page.slice(formStart, formEnd);
assert.ok(form.includes('Save question'), 'the form holds the submit button');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string, text: string = form) => {
  const labelIdx = text.lastIndexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = text.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(
    text.slice(open, labelIdx).includes('</button>'),
    false,
    `the "${label}" label is inside its button`,
  );
  return text.slice(open, labelIdx);
};

const SAVE = buttonOf('Save question');
const CANCEL = buttonOf('Cancel');

describe('Quiz Questions: the submit button announces it is busy', () => {
  it('adds aria-busy={saving} right after disabled={saving}', () => {
    assert.ok(SAVE.includes('type="submit"'), 'the button stays a submit');
    assert.ok(SAVE.includes('disabled={saving}'), 'disabled stays driven by saving');
    assert.ok(SAVE.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      SAVE.indexOf('disabled={saving}') < SAVE.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(page, /aria-busy=/g), 2, 'the submit and the per-row Delete marker');
  });

  it('keeps the submit classes, label and spinner untouched', () => {
    assert.ok(
      SAVE.includes('className="btn btn-primary flex items-center gap-2 disabled:opacity-60"'),
      'submit classes untouched',
    );
    assert.equal(count(form, /Save question/g), 1, 'the submit label stays once');
    assert.ok(
      form.includes(
        '{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}',
      ),
      'the existing spinner and save icon stay hidden and unchanged',
    );
  });
});

describe('Quiz Questions: one polite status line after the buttons', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the saving line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(form, /aria-live="polite"/g), 1, 'one polite live region in the form');
    assert.equal(count(form, /role="status"/g), 1, 'one status line in the form');
    assert.equal(count(page, /aria-live="polite"/g), 3, 'the notice, one saving line and one deleting line');
    assert.equal(count(page, /role="status"/g), 4, 'notice, loading line, saving line and deleting line');
  });

  it('says Saving the question… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{saving ? 'Saving the question…' : ''}"),
      'the status text follows saving',
    );
    assert.equal(count(form, /Saving the question…/g), 1, 'the status copy appears once');
  });

  it('sits after the two-button row as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the saving line is present');
    const buttonRow = form.lastIndexOf('<div className="flex flex-wrap gap-2">', statusStart);
    assert.ok(buttonRow > 0, 'the two-button row stays');
    const rowClose = form.indexOf('</div>', buttonRow);
    assert.ok(statusStart > rowClose, 'the status line follows the button row');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the form',
    );
  });
});

describe('Quiz Questions: the other buttons and the existing status lines stay', () => {
  it('leaves Cancel disabled while saving, discarding the AI draft, without aria-busy', () => {
    assert.ok(CANCEL.includes('type="button"'), 'Cancel stays a plain button');
    assert.ok(
      CANCEL.includes("reviewQuestionDraft({ data: { draft: aiOriginal, decision: 'discarded' } })"),
      'Cancel still discards an opened AI draft',
    );
    assert.ok(CANCEL.includes('setAiOriginal(null)'), 'Cancel still clears the AI draft');
    assert.ok(CANCEL.includes('setDraft(null)'), 'Cancel still closes the form');
    assert.ok(CANCEL.includes('disabled={saving}'), 'Cancel still disables while saving');
    assert.equal(CANCEL.includes('aria-busy'), false, 'no aria-busy on Cancel');
  });

  it('leaves Add question and Edit without the save busy marker', () => {
    const add = buttonOf('Add question', page);
    assert.equal(add.includes('aria-busy'), false, 'no aria-busy on Add question');
    assert.ok(page.includes('aria-label={`Edit question ${n + 1}`}'), 'Edit keeps its label');
    assert.ok(page.includes('aria-label={`Delete question ${n + 1}`}'), 'Delete keeps its label');
    assert.equal(
      count(page, /aria-busy=\{saving\}/g),
      1,
      'only the submit button follows the save state',
    );
    // The per-row Delete marker (`deleting`) is locked by question-delete-status.test.ts.
  });

  it('keeps the notice, the error and the "Loading questions…" line', () => {
    assert.ok(
      page.includes(
        '<p role="status" aria-live="polite" className={cn(\'text-sm text-emerald-700 dark:text-emerald-400\', notice && \'mb-4\')}>',
      ),
      'the conditional notice keeps its role, politeness and classes',
    );
    assert.equal(count(page, /role="alert"/g), 1, 'one alert line for errors');
    assert.ok(
      page.includes(
        '<p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">',
      ),
      'the error line keeps its role and classes',
    );
    assert.ok(
      page.includes(
        '<p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">',
      ),
      'the loading line keeps its role and classes',
    );
    const loadingStart = page.indexOf('Loading questions…');
    assert.ok(loadingStart > 0, 'the loading copy stays');
    const loadingLineStart = page.lastIndexOf('<p', loadingStart);
    assert.equal(
      page.slice(loadingLineStart, loadingStart).includes('aria-live'),
      false,
      'the loading line carries no aria-live',
    );
  });
});

describe('Quiz Questions: the flows stay intact and no data path is added', () => {
  it('keeps the submit flow, including the edited AI draft branch', () => {
    assert.ok(page.includes('const submit = async (e: FormEvent) => {'), 'submit stays');
    assert.ok(page.includes('if (!draft || !conceptId || saving) return;'), 'the guard stays');
    assert.ok(page.includes("setError('Write the question first.');"), 'prompt validation stays');
    assert.ok(
      page.includes('setError(`Give at least ${MIN_OPTIONS} options.`);'),
      'option count validation stays',
    );
    assert.ok(
      page.includes("setError('Fill in or remove the empty options.');"),
      'empty option validation stays',
    );
    assert.ok(
      page.includes("setError('Each option must be different.');"),
      'duplicate option validation stays',
    );
    assert.ok(page.includes('setSaving(true);'), 'saving still starts with the request');
    assert.ok(
      page.includes("await reviewQuestionDraft({ data: { draft: aiOriginal, decision: 'edited', final } });"),
      'the edited AI draft review stays',
    );
    assert.ok(page.includes('await saveQuizQuestion({ data: { id: draft.id, ...final } });'), 'the save call stays');
    assert.ok(
      page.includes("setNotice(draft.id ? 'Question updated.' : 'Question added.');"),
      'the result notice stays',
    );
    assert.ok(page.includes('setDraft(null);'), 'the form still closes on success');
    assert.ok(page.includes('await load();'), 'the list still reloads on success');
    assert.ok(page.includes('setSaving(false);'), 'saving still clears in the finally');
  });

  it('keeps load, openForm, edit and remove', () => {
    assert.ok(page.includes('const load = useCallback(async () => {'), 'load stays');
    assert.ok(page.includes('const openForm = (next: Draft) => {'), 'openForm stays');
    assert.ok(page.includes('const edit = (q: QuizQuestion) =>'), 'edit stays');
    assert.ok(page.includes('const remove = async (q: QuizQuestion, button?: HTMLElement) => {'), 'remove stays');
    assert.ok(
      page.includes('if (!confirm(`Delete this question?\\n\\n${q.prompt}`)) return;'),
      'delete confirmation stays',
    );
    assert.ok(page.includes('rememberRowFocus(button)'), 'row focus is still remembered');
    assert.ok(page.includes('restoreRowFocus(focus)'), 'row focus is still restored');
  });

  it('keeps the form heading, labels and fields', () => {
    assert.ok(page.includes('aria-labelledby={ids.form}'), 'the form keeps its heading label');
    assert.ok(
      page.includes("{draft.id ? 'Edit question' : 'New question'}"),
      'the form heading copy stays',
    );
    assert.ok(page.includes('ref={formHeadingRef}'), 'the heading still receives focus');
    assert.ok(page.includes('MIN_OPTIONS'), 'the shared option bounds stay');
    assert.ok(page.includes('aria-label={`Questions for ${concept.name}`}'), 'the question list keeps its name');
    assert.equal(
      form.includes('aria-label={`Option ${i + 1} is correct`}'),
      true,
      'the correct-option radios keep their labels',
    );
  });

  it('adds no extra aria-labelledby or aria-atomic on the form', () => {
    assert.equal(count(form, /aria-labelledby=/g), 1, 'the form keeps its single heading label');
    assert.equal(count(form, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Saving the question'), false, `${file} gained the status copy`);
      assert.equal(other.includes('question-save-busy'), false, `${file} gained busy wiring`);
    }
  });
});
