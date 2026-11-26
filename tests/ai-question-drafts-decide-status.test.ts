/**
 * Deciding on an AI question draft is announced (`AiQuestionDrafts`).
 *
 * Every draft in the "Draft questions with Claude" panel is decided with
 * **Approve** or **Discard** (`decide` → `reviewQuestionDraft`). While the
 * decision is being saved the buttons had no `disabled`/`aria-busy` and no
 * announcement, so a screen reader heard nothing and a double click could
 * send two `reviewQuestionDraft` calls; the `busy` flag of the draft button
 * deliberately stays untouched. **Edit first** is synchronous (filter + edit)
 * and keeps no marker.
 *
 * This file locks the `deciding` state right after `busy`, the guard and
 * `setDeciding(d)` right before `await reviewQuestionDraft` with a `finally`
 * that clears it (old `try`/`catch` contents untouched), both decision
 * buttons with `type`/handler/`className`/`disabled`/`aria-busy` in order and
 * their labels/icons untouched, **Edit first** without `aria-busy`, one new
 * `role="status"` + `aria-live="polite"` + `sr-only` line with the pending
 * copy as the last child of the section (after the drafting status), the
 * untouched draft button, drafts live container and error alert, the file
 * counts, and that no server function, RPC schema or migration was added.
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

/** The `decide` handler, from its declaration to `const edit`. */
const decideBlock = () => {
  const start = page.indexOf('const decide = async');
  const end = page.indexOf('const edit =', start);
  assert.ok(start > 0 && end > start, 'the decide handler is present');
  return page.slice(start, end);
};

const APPROVE = buttonOf('Approve');
const DISCARD = buttonOf('Discard');
const EDIT_FIRST = buttonOf('Edit first');

describe('ai question drafts: the decision buttons announce they are working', () => {
  for (const [name, button, decision] of [
    ['Approve', APPROVE, 'approved'],
    ['Discard', DISCARD, 'discarded'],
  ] as const) {
    it(`keeps ${name} with type, handler, className, disabled and aria-busy in order`, () => {
      assert.ok(button.includes('type="button"'), `${name} keeps its button type`);
      assert.ok(
        button.includes(`onClick={() => void decide(d, '${decision}')}`),
        `${name} keeps its handler`,
      );
      assert.ok(button.includes('disabled={deciding !== null}'), `${name} is disabled while deciding`);
      assert.ok(
        button.includes('aria-busy={deciding === d}'),
        `${name} is busy only for its own draft`,
      );
      const typeIdx = button.indexOf('type="button"');
      const handlerIdx = button.indexOf('onClick=');
      const classIdx = button.indexOf('className=');
      const disabledIdx = button.indexOf('disabled={deciding !== null}');
      const busyIdx = button.indexOf('aria-busy={deciding === d}');
      assert.ok(
        typeIdx < handlerIdx && handlerIdx < classIdx && classIdx < disabledIdx && disabledIdx < busyIdx,
        `${name} keeps type, handler, className, disabled, aria-busy in order`,
      );
    });

    it(`keeps the ${name} classes, icon and label untouched`, () => {
      const icon = name === 'Approve' ? 'Check' : 'X';
      assert.ok(
        page.includes(
          name === 'Approve'
            ? 'className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"'
            : 'className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-700"',
        ),
        `${name} keeps its classes`,
      );
      assert.equal(
        count(page, new RegExp(`<${icon} className="h-3\\.5 w-3\\.5" aria-hidden="true" /> ${name}`, 'g')),
        1,
        `${name} keeps its icon and label`,
      );
    });
  }

  it('keeps Edit first without aria-busy or disabled', () => {
    assert.ok(EDIT_FIRST.includes('type="button"'), 'Edit first keeps its button type');
    assert.ok(EDIT_FIRST.includes('onClick={() => edit(d)}'), 'Edit first keeps its handler');
    assert.ok(
      EDIT_FIRST.includes(
        'className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-primary/10"',
      ),
      'Edit first keeps its classes',
    );
    assert.equal(EDIT_FIRST.includes('aria-busy'), false, 'Edit first gains no aria-busy');
    assert.equal(EDIT_FIRST.includes('disabled='), false, 'Edit first gains no disabled');
    assert.equal(
      count(page, /<Pencil className="h-3\.5 w-3\.5" aria-hidden="true" \/> Edit first/g),
      1,
      'Edit first keeps its icon and label',
    );
  });
});

describe('ai question drafts: the decide flow guards one decision at a time', () => {
  it('adds the deciding state right after busy', () => {
    const busyState = page.indexOf('const [busy, setBusy] = useState(false);');
    const decidingState = page.indexOf('const [deciding, setDeciding] = useState<QuestionInput | null>(null);');
    assert.ok(busyState > 0, 'the busy state is present');
    assert.ok(decidingState > 0, 'the deciding state is present');
    assert.ok(decidingState > busyState, 'the deciding state sits after busy');
  });

  it('guards re-entry and marks the draft right before the review call', () => {
    const decide = decideBlock();
    assert.ok(decide.startsWith('const decide = async'), 'the handler declaration stays');
    assert.ok(decide.includes('if (deciding) return;'), 'the handler starts with the guard');
    const setIdx = decide.indexOf('setDeciding(d);');
    const callIdx = decide.indexOf('await reviewQuestionDraft({ data: { draft: d, decision } });');
    assert.ok(setIdx > 0 && callIdx > setIdx, 'setDeciding runs before the review call');
    assert.equal(
      decide.slice(setIdx + 'setDeciding(d);'.length, callIdx).trim(),
      'try {',
      'setDeciding is the last statement before the try block opening the review call',
    );
    assert.ok(decide.includes('} finally {'), 'the finally block is added');
    assert.ok(decide.includes('setDeciding(null);'), 'the deciding state is cleared');
  });

  it('keeps the old decide contents untouched', () => {
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
    assert.ok(decide.includes("'Could not save the decision.'"), 'the fallback error message stays');
    const edit = page.slice(page.indexOf('const edit ='), page.indexOf('  return (', page.indexOf('const edit =')));
    assert.ok(edit.includes('onEdit(d);'), 'the edit callback stays');
  });
});

describe('ai question drafts: one dedicated status line speaks while deciding', () => {
  it('adds exactly one live status with the pending copy', () => {
    assert.ok(
      page.includes(
        '<p role="status" aria-live="polite" className="sr-only">\n        {deciding ? \'Saving your decision…\' : \'\'}\n      </p>',
      ),
      'the status line is rendered',
    );
    assert.equal(count(page, /Saving your decision…/g), 1, 'only the status carries the pending copy');
  });

  it('is the last child of the section, after the drafting status', () => {
    const decidingStatus = page.indexOf("{deciding ? 'Saving your decision…' : ''}");
    const busyStatus = page.indexOf("{busy ? 'Drafting questions…' : ''}");
    const sectionClose = page.lastIndexOf('</section>');
    assert.ok(busyStatus > 0, 'the drafting status stays');
    assert.ok(busyStatus < decidingStatus, 'the deciding status comes after the drafting status');
    assert.ok(decidingStatus < sectionClose, 'the deciding status comes before the section closes');
    const between = page.slice(decidingStatus, sectionClose);
    assert.equal(count(between, /<button/g), 0, 'no button is rendered after the deciding status');
    assert.equal(count(between, /<p/g), 0, 'no extra line follows the deciding status');
  });

  it('keeps the draft button, drafts live container and error alert untouched', () => {
    assert.ok(
      page.includes('onClick={() => void draft()}'),
      'the draft button handler stays',
    );
    assert.ok(page.includes('disabled={busy}'), 'the draft button stays disabled while busy');
    assert.ok(page.includes('aria-busy={busy}'), 'the draft button stays busy while drafting');
    assert.ok(
      page.includes('<div className="mt-3 space-y-2" aria-live="polite">'),
      'the drafts container stays live',
    );
    assert.ok(page.includes('No drafts left to review.'), 'the empty state stays');
    assert.ok(
      page.includes('<p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">'),
      'the error alert stays',
    );
    assert.equal(count(page, /Drafting questions…/g), 1, 'the drafting pending copy stays');
  });

  it('keeps the file counts tight', () => {
    assert.equal(count(page, /aria-busy=/g), 3, 'the draft, Approve and Discard buttons are busy');
    assert.equal(count(page, /aria-live=/g), 3, 'the drafts container and both statuses are live');
    assert.equal(count(page, /role="status"/g), 2, 'the drafting and deciding statuses');
    assert.equal(count(page, /role="alert"/g), 1, 'the single error alert stays');
    assert.equal(count(page, /className="sr-only"/g), 2, 'both status lines are sr-only');
  });

  it('adds no extra labels or atomic regions', () => {
    assert.equal(count(page, /aria-label=/g), 1, 'only the section keeps its label');
    assert.equal(count(page, /aria-labelledby=/g), 0, 'no aria-labelledby was added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false, 'no new data path');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Saving your decision'), false, `${file} gained the copy`);
    }
  });
});
