/**
 * Saving a knowledge state is announced (`/data-entry`, **Knowledge States** tab).
 *
 * The **Save Knowledge State** submit button only called `setKnowledgeState`
 * while the form stayed silent: it had no `disabled`, no `aria-busy` and the
 * knowledge-state form had no live region, so a screen reader never heard that
 * the state was being saved and a double click could send the save twice. The
 * page already had one result banner (`role={message.type === 'success' ?
 * 'status' : 'alert'}`) plus the learner save status from PR #195, the concept
 * save status from PR #196 and the prerequisite save status from PR #197, all
 * of which must stay.
 *
 * This file locks the new `savingKnowledgeState` state and guard, `disabled` +
 * `aria-busy` right after `className` on the submit button with its type,
 * classes and label untouched, one `sr-only` polite `role="status"` line as the
 * last child of the knowledge-state form, the untouched result banner and the
 * learner/concept/prerequisite statuses, the untouched **Preview** block, and
 * that no server function, RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'data-entry.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The knowledge-state form, from its opening tag to its closing `</form>`. */
const formStart = page.indexOf('<form onSubmit={handleAddKnowledgeState}');
assert.ok(formStart > 0, 'the knowledge-state form is rendered');
const formEnd = page.indexOf('</form>', formStart) + '</form>'.length;
const form = page.slice(formStart, formEnd);
assert.ok(form.includes('Save Knowledge State'), 'the knowledge-state form holds the submit button');

/** The opening tag of the knowledge-state submit button. */
const submitTypeAt = form.lastIndexOf('type="submit"');
assert.ok(submitTypeAt > 0, 'the submit button is rendered');
const buttonStart = form.lastIndexOf('<button', submitTypeAt);
const buttonEnd = form.indexOf('>', submitTypeAt) + 1;
const SUBMIT = form.slice(buttonStart, buttonEnd);

/** `handleAddKnowledgeState`, from its signature to the DB loading gate. */
const handlerStart = page.indexOf('const handleAddKnowledgeState = async (e: React.FormEvent) => {');
assert.ok(handlerStart > 0, 'handleAddKnowledgeState is declared');
const handlerEnd = page.indexOf('// Show DB loading state', handlerStart);
assert.ok(handlerEnd > handlerStart, 'handleAddKnowledgeState keeps its body before the DB loading gate');
const FLOW = page.slice(handlerStart, handlerEnd);

describe('/data-entry: the knowledge-state submit button announces it is busy', () => {
  it('adds disabled and aria-busy right after the submit class', () => {
    assert.ok(SUBMIT.includes('type="submit"'), 'the button stays a submit');
    assert.ok(
      SUBMIT.includes(
        'className="btn w-full bg-cyan-600 text-white hover:bg-cyan-700 shadow-lg shadow-cyan-600/20"',
      ),
      'the submit classes are untouched',
    );
    assert.ok(SUBMIT.includes('disabled={savingKnowledgeState}'), 'disabled is driven by savingKnowledgeState');
    assert.ok(
      SUBMIT.includes('aria-busy={savingKnowledgeState}'),
      'aria-busy is driven by savingKnowledgeState',
    );
    const typeAt = SUBMIT.indexOf('type="submit"');
    const classAt = SUBMIT.indexOf(
      'className="btn w-full bg-cyan-600 text-white hover:bg-cyan-700 shadow-lg shadow-cyan-600/20"',
    );
    const disabledAt = SUBMIT.indexOf('disabled={savingKnowledgeState}');
    const busyAt = SUBMIT.indexOf('aria-busy={savingKnowledgeState}');
    assert.ok(
      typeAt < classAt && classAt < disabledAt && disabledAt < busyAt,
      'type, class, disabled and aria-busy stay in order',
    );
    assert.equal(count(page, /aria-busy=/g), 4, 'the learner, concept, prerequisite and knowledge-state buttons carry aria-busy');
  });

  it('keeps the Save Knowledge State label', () => {
    assert.ok(form.includes('Save Knowledge State'), 'the visible label is untouched');
  });
});

describe('/data-entry: saving a knowledge state is guarded and always cleared', () => {
  it('declares savingKnowledgeState right after savingPrerequisite', () => {
    assert.ok(
      page.includes(
        'const [savingPrerequisite, setSavingPrerequisite] = useState(false);\n\n  // Knowledge state save progress\n  const [savingKnowledgeState, setSavingKnowledgeState] = useState(false);',
      ),
      'savingKnowledgeState is declared after savingPrerequisite',
    );
  });

  it('guards double submits after preventDefault', () => {
    assert.match(
      FLOW,
      /const handleAddKnowledgeState = async \(e: React\.FormEvent\) => \{\n\s{4}e\.preventDefault\(\);\n\s{4}if \(savingKnowledgeState\) return;/,
      'preventDefault runs first and the guard follows directly',
    );
  });

  it('starts saving right before setKnowledgeState and clears it in the existing finally', () => {
    const savingAt = FLOW.indexOf('setSavingKnowledgeState(true);');
    const saveAt = FLOW.indexOf('await setKnowledgeState(');
    assert.ok(savingAt > 0, 'saving starts');
    assert.ok(saveAt > savingAt, 'saving starts right before setKnowledgeState');
    assert.match(
      FLOW,
      /catch \(err\) \{\s*showMessage\('error', err instanceof Error \? err\.message : 'Failed to add knowledge state'\);\s*\} finally \{\s*setSavingKnowledgeState\(false\);\s*\}/,
      'the existing catch is followed by a finally that clears savingKnowledgeState',
    );
    assert.equal(count(FLOW, /finally \{/g), 1, 'no extra finally is added');
  });
});

describe('/data-entry: one polite status line after the knowledge-state submit button', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the knowledge-state status line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live=/g), 5, 'the banner plus all four save status lines');
    assert.equal(count(page, /role="status"/g), 4, 'one status line per save form');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert is added');
    assert.equal(count(page, /aria-label=/g), 5, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby=/g), 5, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic is added');
    assert.equal(count(page, /className="sr-only"/g), 4, 'the learner, concept, prerequisite and knowledge-state status lines');
    assert.equal(count(page, /role="/g), 11, 'the page keeps eleven literal roles');
  });

  it('says Saving the knowledge state… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{savingKnowledgeState ? 'Saving the knowledge state…' : ''}"),
      'the status text follows savingKnowledgeState',
    );
    assert.equal(count(page, /Saving the knowledge state…/g), 1, 'the status copy appears once');
  });

  it('sits after the submit button as the last child of the knowledge-state form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the status line is present');
    assert.ok(statusStart > buttonEnd, 'the status line follows the submit button');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the knowledge-state form',
    );
  });
});

describe('/data-entry: the banner, other statuses and preview stay intact', () => {
  it('keeps the existing result banner', () => {
    assert.ok(
      page.includes("role={message.type === 'success' ? 'status' : 'alert'}"),
      'the result banner keeps its role',
    );
    assert.ok(
      page.includes("aria-live={message.type === 'success' ? 'polite' : 'assertive'}"),
      'the result banner keeps its politeness',
    );
  });

  it('keeps the untouched learner, concept and prerequisite save statuses', () => {
    for (const [handler, marker, copy] of [
      ['handleAddLearner', 'aria-busy={savingLearner}', "{savingLearner ? 'Adding the learner…' : ''}"],
      ['handleAddConcept', 'aria-busy={savingConcept}', "{savingConcept ? 'Adding the concept…' : ''}"],
      ['handleAddPrerequisite', 'aria-busy={savingPrerequisite}', "{savingPrerequisite ? 'Adding the prerequisite…' : ''}"],
    ] as const) {
      const start = page.indexOf(`<form onSubmit={${handler}`);
      assert.ok(start > 0, `the ${handler} form is rendered`);
      const end = page.indexOf('</form>', start) + '</form>'.length;
      const otherForm = page.slice(start, end);
      assert.ok(otherForm.includes(marker), `${handler} keeps its aria-busy`);
      assert.ok(otherForm.includes(copy), `${handler} keeps its status copy`);
    }
  });

  it('keeps the Preview block', () => {
    assert.ok(
      page.includes('<h3 className="text-sm font-medium text-muted-foreground mb-2">Preview</h3>'),
      'the preview heading stays',
    );
    assert.ok(page.includes('{stateForm.userId && stateForm.conceptId && ('), 'the preview condition stays');
  });

  it('keeps the existing knowledge-state flow', () => {
    assert.ok(FLOW.includes('mastery: stateForm.mastery,'), 'the mastery stays');
    assert.ok(FLOW.includes('bloomLevel: stateForm.bloomLevel,'), 'the bloom level stays');
    assert.ok(
      FLOW.includes("showMessage('success', 'Knowledge state added successfully!');"),
      'the success message stays',
    );
    assert.ok(FLOW.includes("setStateForm({ userId: '', conceptId: '', mastery: 0, bloomLevel: 1 });"), 'the form still resets');
    assert.ok(FLOW.includes("'Failed to add knowledge state'"), 'the error message stays');
    assert.ok(page.includes('<form onSubmit={handleAddKnowledgeState} className="space-y-4">'), 'the form tag stays');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall/.test(page), false, 'the page adds no server call');
    assert.equal(page.includes('rpc-schemas'), false, 'the page imports no new RPC schema');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Saving the knowledge state'), false, `${file} gained the status copy`);
    }
  });
});
