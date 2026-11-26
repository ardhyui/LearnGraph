/**
 * Saving the batch assessment answers is announced (/profile).
 *
 * The **All questions on one page** card renders three buttons that all depend
 * on `saving`: the header **Save answers** button (with `batchSubmitRef`),
 * **Save quiz results** after the batch overwrite confirmation, and **Save
 * answers** in the floating panel. While `saving` was true all three only lost
 * their action and swapped their label to `Saving…`; there was no `aria-busy`
 * and no live region, so a screen reader could not tell that the batch results
 * were being stored and the buttons looked frozen — while the same pattern is
 * already used on `/sign-in`, `/forgot-password`, `/reset-password`, the
 * `/learn` self-report and concept quiz, `DeleteAccount`, both **Ask an AI
 * tutor** buttons, the snooze buttons, **Create a read-only key**, **Save
 * subjects**, the `/japanese` buttons, **Start learning**, the admin
 * draft/save buttons, the **Refresh** button on `/gaps`, and both assessment
 * quiz Save buttons on this very page.
 *
 * This file locks one `aria-busy={saving}` right after each batch button's
 * `disabled`, a single `sr-only` polite `role="status"` line that is the last
 * child of the batch card, the untouched classes/icons/labels/handlers/ref,
 * the untouched Go back button, the assessment quiz status and error alert,
 * the batch overwrite confirmation, the untouched `submitBatchAssessments`/
 * `cancelBatchOverwrite` flows, and that no server function, RPC schema or
 * migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'profile.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The `<button>` that opens before `anchor`. */
const buttonAt = (anchor: string): string => {
  const open = page.lastIndexOf('<button', page.indexOf(anchor));
  assert.ok(open > 0, `the button for ${anchor} is rendered`);
  const close = page.indexOf('</button>', open) + '</button>'.length;
  return page.slice(open, close);
};

const HEADER_SAVE = buttonAt('ref={batchSubmitRef}');
const CONFIRM_SAVE = buttonAt('onClick={() => submitBatchAssessments(true)}');
const GO_BACK = buttonAt('onClick={cancelBatchOverwrite}');
const stickyStart = page.indexOf('sticky bottom-4');
assert.ok(stickyStart > 0, 'the floating panel is rendered');
const stickyOpen = page.indexOf('<button', stickyStart);
assert.ok(stickyOpen > 0, 'the floating panel has a button');
const STICKY_SAVE = page.slice(
  stickyOpen,
  page.indexOf('</button>', stickyOpen) + '</button>'.length,
);

/** The batch card, from its `<motion.div` after the batch-mode comment to the `</motion.div>` after the status line. */
const batchModeComment = page.indexOf('{/* All Questions View - Batch mode */}');
assert.ok(batchModeComment > 0, 'the batch card is rendered');
const cardStart = page.indexOf('<motion.div', batchModeComment);
assert.ok(cardStart > 0, 'the batch card has its motion.div');
const statusStart = page.indexOf('<p role="status" aria-live="polite"', cardStart);
assert.ok(statusStart > cardStart, 'the progress line is present in the batch card');
const cardEnd = page.indexOf('</motion.div>', statusStart) + '</motion.div>'.length;
const card = page.slice(cardStart, cardEnd);

/** The batch overwrite confirmation block. */
const confirmAnchor = page.indexOf('data-testid="batch-overwrite-confirm"');
const confirmOpen = page.lastIndexOf('<div', confirmAnchor);
const CONFIRM = page.slice(confirmOpen, page.indexOf('</div>', confirmAnchor) + '</div>'.length);

/** `submitBatchAssessments`, from its declaration to the cancel helper's doc comment. */
const submitStart = page.indexOf('const submitBatchAssessments = async (confirmed = false) => {');
const cancelStart = page.indexOf('/** Dismiss the batch overwrite confirmation', submitStart);
assert.ok(submitStart > 0 && cancelStart > submitStart, 'the batch submit flow is present');
const SUBMIT = page.slice(submitStart, cancelStart);
const cancelEnd = page.indexOf('const getScoreColor', cancelStart);
const CANCEL = page.slice(cancelStart, cancelEnd);

describe('/profile: the batch Save buttons announce their busy state', () => {
  it('adds aria-busy={saving} right after disabled on the header Save answers button', () => {
    assert.ok(HEADER_SAVE.includes('ref={batchSubmitRef}'), 'the ref stays');
    assert.ok(HEADER_SAVE.includes('onClick={() => submitBatchAssessments()}'), 'the handler stays');
    assert.ok(
      HEADER_SAVE.includes('disabled={saving || getBatchProgress().answered === 0}'),
      'disabled keeps its readiness condition',
    );
    assert.ok(HEADER_SAVE.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      HEADER_SAVE.indexOf('disabled={saving ||') < HEADER_SAVE.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
  });

  it('adds aria-busy={saving} right after disabled on Save quiz results', () => {
    assert.ok(CONFIRM_SAVE.includes('onClick={() => submitBatchAssessments(true)}'), 'the handler stays');
    assert.ok(CONFIRM_SAVE.includes('disabled={saving}'), 'disabled stays driven by saving');
    assert.ok(CONFIRM_SAVE.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      CONFIRM_SAVE.indexOf('disabled={saving}') < CONFIRM_SAVE.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
  });

  it('adds aria-busy={saving} right after disabled on the floating Save answers button', () => {
    assert.ok(STICKY_SAVE.includes('onClick={() => submitBatchAssessments()}'), 'the handler stays');
    assert.ok(STICKY_SAVE.includes('disabled={saving}'), 'disabled stays driven by saving');
    assert.ok(STICKY_SAVE.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      STICKY_SAVE.indexOf('disabled={saving}') < STICKY_SAVE.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(page, /aria-busy=/g), 6, 'exactly six aria-busy attributes on the page');
  });

  it('keeps the classes, icons and labels of all three batch buttons untouched', () => {
    for (const [button, label] of [
      [HEADER_SAVE, 'Save answers'],
      [CONFIRM_SAVE, 'Save quiz results'],
      [STICKY_SAVE, 'Save answers'],
    ] as const) {
      assert.ok(button.includes(`{saving ? 'Saving…' : '${label}'}`), 'the label stays');
    }
    assert.ok(
      HEADER_SAVE.includes(
        'className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium shadow-lg shadow-amber-500/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transition-all"',
      ),
      'the header button classes stay',
    );
    assert.ok(
      HEADER_SAVE.includes('<Send className="w-5 h-5" aria-hidden="true" />'),
      'the header button icon stays',
    );
    assert.ok(
      CONFIRM_SAVE.includes(
        'className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"',
      ),
      'the confirmation button classes stay',
    );
    assert.ok(
      CONFIRM_SAVE.includes('<CheckCircle className="w-4 h-4" aria-hidden="true" />'),
      'the confirmation button icon stays',
    );
    assert.ok(
      STICKY_SAVE.includes(
        'className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium shadow-lg shadow-amber-500/25 flex items-center gap-2 hover:shadow-xl transition-all"',
      ),
      'the floating button classes stay',
    );
    assert.ok(
      STICKY_SAVE.includes('<Send className="w-5 h-5" aria-hidden="true" />'),
      'the floating button icon stays',
    );
  });

  it('leaves the batch Go back button without disabled or aria-busy', () => {
    assert.ok(GO_BACK.includes('onClick={cancelBatchOverwrite}'), 'Go back keeps its handler');
    assert.equal(GO_BACK.includes('disabled'), false, 'Go back stays enabled');
    assert.equal(GO_BACK.includes('aria-busy'), false, 'Go back gains no aria-busy');
  });
});

describe('/profile: one polite status line announces the batch save', () => {
  it('adds exactly one sr-only polite status line inside the batch card', () => {
    assert.ok(
      card.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the progress line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 3, 'three polite live regions on the page');
    assert.equal(count(page, /role="status"/g), 4, 'four status lines on the page');
    assert.equal(count(page, /role="alert"/g), 1, 'the one existing alert role stays');
  });

  it('says the quiz results are saving and clears when idle', () => {
    assert.ok(
      card.includes("{saving ? 'Saving your quiz results…' : ''}"),
      'the status text follows saving before clearing',
    );
    assert.equal(count(page, /Saving your quiz results…/g), 1, 'the copy appears once');
  });

  it('sits after the floating panel as the last child of the batch card', () => {
    const panelClose = page.indexOf('</motion.div>', stickyStart) + '</motion.div>'.length;
    assert.ok(statusStart > panelClose, 'the line follows the floating panel and its closing condition');
    const lineEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      page.slice(lineEnd, cardEnd).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the card',
    );
  });
});

describe('/profile: existing notices and batch flows stay intact', () => {
  it('keeps the assessment quiz status and the error alert', () => {
    assert.ok(
      page.includes("{saving ? 'Saving your quiz result…' : ''}"),
      'the assessment quiz status from PR #180 stays',
    );
    assert.equal(count(page, /Saving your quiz result…/g), 1, 'the old copy appears once');
    assert.ok(
      /role="alert"\s+className="mb-4 p-4 rounded-xl bg-destructive\/10/.test(page),
      'the error alert stays',
    );
    assert.ok(
      page.includes('data-testid="profile-success"'),
      'the existing success status stays',
    );
  });

  it('keeps the batch overwrite confirmation block', () => {
    assert.ok(CONFIRM.includes('This will replace the values you set yourself'), 'the copy stays');
    assert.ok(CONFIRM.includes('Going back keeps your values'), 'the hint stays');
    assert.equal(count(page, /data-testid="batch-overwrite-confirm"/g), 1, 'one confirmation block');
  });

  it('keeps the submitBatchAssessments flow unchanged', () => {
    assert.ok(SUBMIT.includes('if (saving) return;'), 'the guard stays');
    assert.ok(
      SUBMIT.includes('manualTopicsAtRisk(editedScores, completeTopics)'),
      'the manual-topic check stays',
    );
    assert.ok(SUBMIT.includes('setOverwriteAtRisk(atRisk.map((topic) => topic.id));'), 'it still confirms');
    assert.ok(SUBMIT.includes('setOverwriteAtRisk([]);'), 'it still clears the confirmation');
    assert.ok(SUBMIT.includes('let submittedCount = 0;'), 'it still counts submissions');
    assert.ok(SUBMIT.includes('setEditedScores(newScores);'), 'it still records the scores');
    assert.ok(SUBMIT.includes('await persistScores(newScores,'), 'it still persists');
    assert.ok(SUBMIT.includes('if (ok) setBatchAnswers({});'), 'it still resets the answers');
    assert.equal(count(SUBMIT, /setSaving\(/g), 0, 'aria-busy reuses the existing saving flag');
  });

  it('keeps the cancelBatchOverwrite flow unchanged', () => {
    assert.ok(CANCEL.includes('setOverwriteAtRisk([]);'), 'cancel still clears the confirmation');
    assert.ok(CANCEL.includes('batchSubmitRef.current?.focus();'), 'cancel still returns the focus');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(page, /aria-label=/g), 4, 'the four existing labels stay');
    assert.equal(count(page, /aria-labelledby=/g), 3, 'the three existing labelledby usages stay');
    assert.equal(count(page, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Saving your quiz results'), false, `${file} gained the status copy`);
      assert.equal(other.includes('batch-save-busy'), false, `${file} gained busy wiring`);
    }
  });
});
