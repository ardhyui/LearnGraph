/**
 * Drafting questions with Claude is announced (`AiQuestionDrafts`).
 *
 * The "Draft questions with Claude" panel on Admin → Quiz Questions calls
 * `draft` to ask for four question drafts with the person's Anthropic key.
 * While `busy`, the button only fades (`disabled` + `disabled:opacity-60`)
 * and shows an `aria-hidden` `Loader2` spinner; a screen reader hears no
 * name change and no announcement, so it looks like the button does nothing.
 * `busy` is only used by the draft action (`decide` has its own `deciding`
 * state for Approve/Discard, locked in
 * `ai-question-drafts-decide-status.test.ts`; **Edit first** calls `edit`
 * without any marker), so `aria-busy={busy}` is safe to use directly on
 * this one button.
 *
 * This file locks `aria-busy={busy}` right after `disabled={busy}`, the
 * untouched handler/classes/spinner/label, the `role="status"` +
 * `aria-live="polite"` + `sr-only` line with the drafting copy (after the
 * drafts block, before the deciding status), the untouched drafts live
 * container and error alert, **Edit first** without `aria-busy`, the
 * `draft`/`decide`/`edit` flows, and that no server function, RPC schema
 * or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const COMPONENT_FILE = join(ROOT, 'src', 'components', 'AiQuestionDrafts.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(COMPONENT_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string) => {
  const labelIdx = page.lastIndexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = page.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(
    page.slice(open, labelIdx).includes('</button>'),
    false,
    `the "${label}" label is inside its button`,
  );
  return page.slice(open, labelIdx);
};

/** The `draft` handler, from its declaration to `const decide`. */
const draftBlock = () => {
  const start = page.indexOf('const draft = async');
  const end = page.indexOf('const decide = async', start);
  assert.ok(start > 0 && end > start, 'the draft handler is present');
  return page.slice(start, end);
};

/** The `decide` handler, from its declaration to `const edit`. */
const decideBlock = () => {
  const start = page.indexOf('const decide = async');
  const end = page.indexOf('const edit =', start);
  assert.ok(start > 0 && end > start, 'the decide handler is present');
  return page.slice(start, end);
};

/** The `edit` handler, from its declaration to the returned markup. */
const editBlock = () => {
  const start = page.indexOf('const edit =');
  const end = page.indexOf('  return (', start);
  assert.ok(start > 0 && end > start, 'the edit handler is present');
  return page.slice(start, end);
};

const BUTTON = buttonOf('Draft 4 questions');

describe('ai question drafts: the Draft 4 questions button announces it is working', () => {
  it('adds aria-busy={busy} right after disabled={busy}', () => {
    assert.ok(BUTTON.includes('type="button"'), 'the button type stays');
    assert.ok(BUTTON.includes('disabled={busy}'), 'disabled stays driven by busy');
    assert.ok(BUTTON.includes('aria-busy={busy}'), 'the button is busy while drafting');
    assert.ok(
      BUTTON.indexOf('disabled={busy}') < BUTTON.indexOf('aria-busy={busy}'),
      'aria-busy sits after disabled',
    );
  });

  it('keeps the handler, classes, spinner and label untouched', () => {
    assert.ok(BUTTON.includes('onClick={() => void draft()}'), 'the handler stays');
    assert.ok(
      BUTTON.includes(
        'className="btn btn-primary flex items-center justify-center gap-2 disabled:opacity-60"',
      ),
      'the button classes stay',
    );
    assert.ok(
      page.includes('{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}'),
      'the spinner stays driven by busy',
    );
    assert.equal(count(page, /Draft 4 questions/g), 1, 'the visible label stays');
  });
});

describe('ai question drafts: one dedicated status line speaks while drafting', () => {
  it('adds exactly one live status with the pending copy', () => {
    assert.ok(
      page.includes(
        '<p role="status" aria-live="polite" className="sr-only">\n        {busy ? \'Drafting questions…\' : \'\'}\n      </p>',
      ),
      'the status line is rendered',
    );
    assert.equal(count(page, /Drafting questions…/g), 1, 'only the status carries the pending copy');
    assert.equal(count(page, /className="sr-only"/g), 2, 'the drafting and deciding statuses are sr-only');
  });

  it('sits after the drafts block, before the section closes', () => {
    const status = page.indexOf("{busy ? 'Drafting questions…' : ''}");
    const draftsBlock = page.lastIndexOf('{drafts && (');
    const sectionClose = page.lastIndexOf('</section>');
    assert.ok(draftsBlock > 0, 'the drafts block is present');
    assert.ok(draftsBlock < status, 'the status comes after the drafts block');
    assert.ok(status < sectionClose, 'the status comes before the section closes');
    const between = page.slice(status, sectionClose);
    assert.equal(count(between, /<button/g), 0, 'no button is rendered after the status');
  });

  it('keeps the drafts live container and the error alert untouched', () => {
    assert.ok(
      page.includes('<div className="mt-3 space-y-2" aria-live="polite">'),
      'the drafts container stays live',
    );
    assert.ok(page.includes('No drafts left to review.'), 'the empty state stays');
    assert.ok(
      page.includes('<p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">'),
      'the error alert stays',
    );
    assert.equal(count(page, /aria-busy=/g), 3, 'the draft, Approve and Discard buttons are busy');
    assert.equal(
      count(page, /aria-live=/g),
      3,
      'the drafts container and both statuses are live',
    );
    assert.equal(count(page, /role="status"/g), 2, 'the drafting and deciding statuses');
    assert.equal(count(page, /role="alert"/g), 1, 'the single error alert stays');
  });

  it('adds no extra labels or atomic regions', () => {
    assert.equal(count(page, /aria-label=/g), 1, 'only the section keeps its label');
    assert.equal(count(page, /aria-labelledby=/g), 0, 'no aria-labelledby was added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
  });
});

describe('ai question drafts: the per-draft actions stay independent', () => {
  it('keeps Edit first without aria-busy', () => {
    const button = buttonOf('Edit first');
    assert.ok(button.includes('type="button"'), 'Edit first keeps its button type');
    assert.equal(button.includes('aria-busy'), false, 'Edit first gains no aria-busy');
    assert.equal(count(page, /aria-busy=/g), 3, 'the draft, Approve and Discard buttons are busy');
  });

  it('keeps the draft, decide and edit flows intact', () => {
    const draft = draftBlock();
    assert.ok(draft.includes('/^sk-ant-[A-Za-z0-9_-]{20,300}$/'), 'the key validation stays');
    assert.ok(draft.includes('setBusy(true);'), 'busy still starts');
    assert.ok(draft.includes('setError(null);'), 'the error reset stays');
    assert.ok(
      draft.includes(
        'await draftQuizQuestions({ data: { conceptId, kind, count: 4, apiKey: apiKey.trim() } });',
      ),
      'the draft call stays',
    );
    assert.ok(draft.includes('setDrafts(result.valid);'), 'the drafts still land');
    assert.ok(draft.includes('setRejected(result.rejected);'), 'the rejected count still lands');
    assert.ok(draft.includes('finally'), 'the finally block stays');
    assert.ok(draft.includes('setBusy(false);'), 'busy still clears in finally');

    const decide = decideBlock();
    assert.ok(
      decide.includes('await reviewQuestionDraft({ data: { draft: d, decision } });'),
      'the review call stays',
    );
    assert.ok(
      decide.includes('setDrafts((prev) => prev?.filter((x) => x !== d) ?? null);'),
      'the decided draft is removed',
    );
    assert.ok(decide.includes("decision === 'approved'"), 'onSaved stays keyed to approvals');

    const edit = editBlock();
    assert.ok(edit.includes('onEdit(d);'), 'the edit callback stays');
  });

  it('keeps the key input, kind select, heading and panel identity intact', () => {
    assert.ok(page.includes('type="password"'), 'the key input stays masked');
    assert.ok(page.includes('autoComplete="off"'), 'the key input stays unautocompleted');
    assert.ok(page.includes('window.localStorage.getItem(KEY_STORAGE)'), 'the stored key is still read');
    assert.ok(page.includes('}, [conceptId]);'), 'the concept reset effect stays');
    assert.ok(page.includes('QUESTION_DRAFT_KINDS'), 'the kind options stay');
    assert.ok(page.includes('aria-label="Draft questions with Claude"'), 'the section label stays');
    assert.ok(page.includes('data-testid="ai-question-drafts"'), 'the test id stays');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false, 'no new data path');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Drafting questions'), false, `${file} gained the copy`);
    }
  });
});
