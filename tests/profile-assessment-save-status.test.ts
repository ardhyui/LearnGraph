/**
 * Saving a quiz result is announced (/profile).
 *
 * The assessment quiz card renders one of two Save buttons: **Save quiz
 * result** after the overwrite confirmation, or **Save my answers** otherwise.
 * While `saving` was true both only lost their action and swapped their label
 * to `Saving…`; there was no `aria-busy` and no live region, so a screen reader
 * could not tell that the answers were being stored and the button looked
 * frozen — while the same pattern is already used on `/sign-in`,
 * `/forgot-password`, `/reset-password`, the `/learn` self-report and concept
 * quiz, `DeleteAccount`, both **Ask an AI tutor** buttons, the snooze buttons,
 * **Create a read-only key**, **Save subjects**, the `/japanese` buttons,
 * **Start learning**, the admin draft/save buttons, and the **Refresh** button
 * on `/gaps`.
 *
 * This file locks one `aria-busy={saving}` right after each Save button's
 * `disabled`, a single `sr-only` polite `role="status"` line that is the last
 * child of the quiz card, the untouched classes/icon/labels/handlers, the
 * existing status/alert notices and overwrite confirmation, the untouched
 * `submitAssessment` flow, and that no server function, RPC schema or
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

const SAVE_RESULT = buttonAt('onClick={() => submitAssessment(true)}');
const SAVE_ANSWERS = buttonAt('onClick={() => submitAssessment()}');
const GO_BACK = buttonAt('onClick={() => setOverwriteAtRisk([])}');
const cancelOpen = page.lastIndexOf('<button', page.lastIndexOf('onClick={() => setActiveAssessment(null)}'));
assert.ok(cancelOpen > 0, 'the Cancel button is rendered');
const CANCEL = page.slice(cancelOpen, page.indexOf('</button>', cancelOpen) + '</button>'.length);

/** The quiz dialog card, from its `<motion.div` to the `</motion.div>` after the status line. */
const dialogAnchor = page.indexOf('data-testid="quiz-dialog"');
assert.ok(dialogAnchor > 0, 'the quiz dialog is rendered');
const cardStart = page.lastIndexOf('<motion.div', dialogAnchor);
const statusStart = page.indexOf('<p role="status" aria-live="polite"', cardStart);
const cardEnd = page.indexOf('</motion.div>', statusStart) + '</motion.div>'.length;
const card = page.slice(cardStart, cardEnd);

/** The overwrite confirmation block. */
const confirmAnchor = page.indexOf('data-testid="quiz-overwrite-confirm"');
const confirmOpen = page.lastIndexOf('<div', confirmAnchor);
const CONFIRM = page.slice(confirmOpen, page.indexOf('</div>', confirmAnchor) + '</div>'.length);

/** `submitAssessment`, from its declaration to the batch helpers. */
const submitStart = page.indexOf('const submitAssessment = async (confirmed = false) => {');
const batchStart = page.indexOf('// Batch mode functions', submitStart);
assert.ok(submitStart > 0 && batchStart > submitStart, 'the submit flow is present');
const SUBMIT = page.slice(submitStart, batchStart);

describe('/profile: the assessment Save buttons announce their busy state', () => {
  it('adds aria-busy={saving} right after disabled on Save quiz result', () => {
    assert.ok(SAVE_RESULT.includes('onClick={() => submitAssessment(true)}'), 'the handler stays');
    assert.ok(SAVE_RESULT.includes('disabled={saving}'), 'disabled stays driven by saving');
    assert.ok(SAVE_RESULT.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      SAVE_RESULT.indexOf('disabled={saving}') < SAVE_RESULT.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
  });

  it('adds aria-busy={saving} right after disabled on Save my answers', () => {
    assert.ok(SAVE_ANSWERS.includes('onClick={() => submitAssessment()}'), 'the handler stays');
    assert.ok(
      SAVE_ANSWERS.includes(
        'disabled={saving || Object.keys(assessmentAnswers).length < activeAssessment.questions.length}',
      ),
      'disabled keeps its readiness condition',
    );
    assert.ok(SAVE_ANSWERS.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      SAVE_ANSWERS.indexOf('disabled={saving ||') < SAVE_ANSWERS.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(page, /aria-busy=/g), 6, 'exactly six aria-busy attributes on the page (three batch buttons and Save Profile added)');
  });

  it('keeps the classes, icons and labels of both Save buttons untouched', () => {
    for (const [button, label] of [
      [SAVE_RESULT, 'Save quiz result'],
      [SAVE_ANSWERS, 'Save my answers'],
    ] as const) {
      assert.ok(
        button.includes(
          'className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"',
        ),
        'the button classes stay',
      );
      assert.ok(
        button.includes('<CheckCircle className="w-4 h-4" aria-hidden="true" />'),
        'the CheckCircle icon stays',
      );
      assert.ok(button.includes(`{saving ? 'Saving…' : '${label}'}`), 'the label stays');
    }
  });

  it('leaves Go back and Cancel without disabled or aria-busy', () => {
    assert.ok(GO_BACK.includes('onClick={() => setOverwriteAtRisk([])}'), 'Go back keeps its handler');
    assert.equal(GO_BACK.includes('disabled'), false, 'Go back stays enabled');
    assert.equal(GO_BACK.includes('aria-busy'), false, 'Go back gains no aria-busy');
    assert.ok(CANCEL.includes('onClick={() => setActiveAssessment(null)}'), 'Cancel keeps its handler');
    assert.equal(CANCEL.includes('disabled'), false, 'Cancel stays enabled');
    assert.equal(CANCEL.includes('aria-busy'), false, 'Cancel gains no aria-busy');
  });
});

describe('/profile: one polite status line announces the save', () => {
  it('adds exactly one sr-only polite status line inside the quiz card', () => {
    assert.ok(
      card.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the progress line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 3, 'three polite live regions on the page');
    assert.equal(count(page, /role="status"/g), 4, 'four status lines on the page');
    assert.equal(count(page, /role="alert"/g), 1, 'the one existing alert role stays');
  });

  it('says the quiz result is saving and clears when idle', () => {
    assert.ok(
      card.includes("{saving ? 'Saving your quiz result…' : ''}"),
      'the status text follows saving before clearing',
    );
    assert.equal(count(page, /Saving your quiz result…/g), 1, 'the copy appears once');
  });

  it('sits after the two-button row as the last child of the card', () => {
    assert.ok(statusStart > 0, 'the progress line is present');
    const cancelEnd = page.indexOf('</button>', page.lastIndexOf('onClick={() => setActiveAssessment(null)}'));
    assert.ok(
      page.lastIndexOf('</div>', statusStart) > cancelEnd,
      'the line follows the button row',
    );
    const lineEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      page.slice(lineEnd, cardEnd).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the card',
    );
  });
});

describe('/profile: existing notices and flows stay intact', () => {
  it('keeps the existing error alert and success status', () => {
    assert.ok(
      /role="alert"\s+className="mb-4 p-4 rounded-xl bg-destructive\/10/.test(page),
      'the error alert stays',
    );
    assert.ok(
      page.includes('data-testid="profile-success"'),
      'the existing success status stays',
    );
  });

  it('keeps the overwrite confirmation block', () => {
    assert.ok(CONFIRM.includes('This will replace the value you set yourself'), 'the copy stays');
    assert.ok(CONFIRM.includes('Going back keeps your value'), 'the hint stays');
    assert.equal(count(page, /data-testid="quiz-overwrite-confirm"/g), 1, 'one confirmation block');
  });

  it('keeps the submitAssessment flow unchanged', () => {
    assert.ok(SUBMIT.includes('if (!activeAssessment || saving) return;'), 'the guard stays');
    assert.ok(
      SUBMIT.includes('manualTopicsAtRisk(editedScores, [activeAssessment.domainId]).length > 0'),
      'the manual-topic check stays',
    );
    assert.ok(SUBMIT.includes('setOverwriteAtRisk([activeAssessment.domainId]);'), 'it still confirms');
    assert.ok(SUBMIT.includes('setOverwriteAtRisk([]);'), 'it still clears the confirmation');
    assert.ok(SUBMIT.includes('setEditedScores(next);'), 'it still records the scores');
    assert.ok(SUBMIT.includes('setActiveAssessment(null);'), 'it still closes the dialog');
    assert.ok(SUBMIT.includes('await persistScores(next,'), 'it still persists');
    assert.equal(count(SUBMIT, /setSaving\(/g), 0, 'aria-busy reuses the existing saving flag');
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
      assert.equal(other.includes('Saving your quiz result'), false, `${file} gained the status copy`);
      assert.equal(other.includes('assessment-save-busy'), false, `${file} gained busy wiring`);
    }
  });
});
