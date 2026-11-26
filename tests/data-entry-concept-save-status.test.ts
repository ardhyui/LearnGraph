/**
 * Adding a concept is announced (`/data-entry`, **Concepts** tab).
 *
 * The **Add Concept** submit button only called `createConcept` while the form
 * stayed silent: it had no `disabled`, no `aria-busy` and the concept form had
 * no live region, so a screen reader never heard that the concept was being
 * added and a double click could send the save twice. The page already had one
 * result banner (`role={message.type === 'success' ? 'status' : 'alert'}`) and
 * the learner save status from PR #195, both of which must stay.
 *
 * This file locks the new `savingConcept` state and guard, `disabled` +
 * `aria-busy` right after `className` on the submit button with its type,
 * classes and label untouched, one `sr-only` polite `role="status"` line as the
 * last child of the concept form, the untouched result banner and learner
 * status, the two remaining form submits without a new marker, and that no
 * server function, RPC schema or migration was added.
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

/** The concept form, from its opening tag to its closing `</form>`. */
const formStart = page.indexOf('<form onSubmit={handleAddConcept}');
assert.ok(formStart > 0, 'the concept form is rendered');
const formEnd = page.indexOf('</form>', formStart) + '</form>'.length;
const form = page.slice(formStart, formEnd);
assert.ok(form.includes('Add Concept'), 'the concept form holds the submit button');

/** The opening tag of the concept submit button. */
const submitTypeAt = form.lastIndexOf('type="submit"');
assert.ok(submitTypeAt > 0, 'the submit button is rendered');
const buttonStart = form.lastIndexOf('<button', submitTypeAt);
const buttonEnd = form.indexOf('>', submitTypeAt) + 1;
const SUBMIT = form.slice(buttonStart, buttonEnd);

/** `handleAddConcept`, from its signature to `handleAddPrerequisite`. */
const handlerStart = page.indexOf('const handleAddConcept = async (e: React.FormEvent) => {');
assert.ok(handlerStart > 0, 'handleAddConcept is declared');
const handlerEnd = page.indexOf('const handleAddPrerequisite', handlerStart);
assert.ok(handlerEnd > handlerStart, 'handleAddConcept keeps its body before handleAddPrerequisite');
const FLOW = page.slice(handlerStart, handlerEnd);

describe('/data-entry: the concept submit button announces it is busy', () => {
  it('adds disabled and aria-busy right after the submit class', () => {
    assert.ok(SUBMIT.includes('type="submit"'), 'the button stays a submit');
    assert.ok(
      SUBMIT.includes(
        'className="btn w-full bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20"',
      ),
      'the submit classes are untouched',
    );
    assert.ok(SUBMIT.includes('disabled={savingConcept}'), 'disabled is driven by savingConcept');
    assert.ok(SUBMIT.includes('aria-busy={savingConcept}'), 'aria-busy is driven by savingConcept');
    const typeAt = SUBMIT.indexOf('type="submit"');
    const classAt = SUBMIT.indexOf(
      'className="btn w-full bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20"',
    );
    const disabledAt = SUBMIT.indexOf('disabled={savingConcept}');
    const busyAt = SUBMIT.indexOf('aria-busy={savingConcept}');
    assert.ok(
      typeAt < classAt && classAt < disabledAt && disabledAt < busyAt,
      'type, class, disabled and aria-busy stay in order',
    );
    assert.equal(count(page, /aria-busy=/g), 2, 'the learner and concept buttons carry aria-busy');
  });

  it('keeps the Add Concept label', () => {
    assert.ok(form.includes('Add Concept'), 'the visible label is untouched');
  });
});

describe('/data-entry: adding a concept is guarded and always cleared', () => {
  it('declares savingConcept right after savingLearner', () => {
    assert.ok(
      page.includes(
        'const [savingLearner, setSavingLearner] = useState(false);\n\n  // Concept save progress\n  const [savingConcept, setSavingConcept] = useState(false);',
      ),
      'savingConcept is declared after savingLearner',
    );
  });

  it('guards double submits after preventDefault', () => {
    assert.match(
      FLOW,
      /const handleAddConcept = async \(e: React\.FormEvent\) => \{\n\s{4}e\.preventDefault\(\);\n\s{4}if \(savingConcept\) return;/,
      'preventDefault runs first and the guard follows directly',
    );
  });

  it('starts saving right before createConcept and clears it in the existing finally', () => {
    const savingAt = FLOW.indexOf('setSavingConcept(true);');
    const createAt = FLOW.indexOf('await createConcept(');
    assert.ok(savingAt > 0, 'saving starts');
    assert.ok(createAt > savingAt, 'saving starts right before createConcept');
    assert.match(
      FLOW,
      /catch \(err\) \{\s*showMessage\('error', err instanceof Error \? err\.message : 'Failed to add concept'\);\s*\} finally \{\s*setSavingConcept\(false\);\s*\}/,
      'the existing catch is followed by a finally that clears savingConcept',
    );
    assert.equal(count(FLOW, /finally \{/g), 1, 'no extra finally is added');
  });
});

describe('/data-entry: one polite status line after the concept submit button', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the concept status line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live=/g), 3, 'the banner plus both save status lines');
    assert.equal(count(page, /role="status"/g), 2, 'one status line per save form');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert is added');
    assert.equal(count(page, /aria-label=/g), 5, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby=/g), 5, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic is added');
    assert.equal(count(page, /className="sr-only"/g), 2, 'the learner and concept status lines');
    assert.equal(count(page, /role="/g), 9, 'the page keeps its nine literal roles');
  });

  it('says Adding the concept… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{savingConcept ? 'Adding the concept…' : ''}"),
      'the status text follows savingConcept',
    );
    assert.equal(count(page, /Adding the concept…/g), 1, 'the status copy appears once');
  });

  it('sits after the submit button as the last child of the concept form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the status line is present');
    assert.ok(statusStart > buttonEnd, 'the status line follows the submit button');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the concept form',
    );
  });
});

describe('/data-entry: the banner, learner status and other forms stay intact', () => {
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

  it('keeps the untouched learner save status', () => {
    const learnerStart = page.indexOf('<form onSubmit={handleAddLearner}');
    assert.ok(learnerStart > 0, 'the learner form is rendered');
    const learnerEnd = page.indexOf('</form>', learnerStart) + '</form>'.length;
    const learnerForm = page.slice(learnerStart, learnerEnd);
    assert.ok(learnerForm.includes('aria-busy={savingLearner}'), 'the learner button stays busy-aware');
    assert.ok(
      learnerForm.includes("{savingLearner ? 'Adding the learner…' : ''}"),
      'the learner status copy stays',
    );
  });

  it('leaves the prerequisite and knowledge-state forms without a new marker', () => {
    for (const handler of ['handleAddPrerequisite', 'handleAddKnowledgeState']) {
      const start = page.indexOf(`<form onSubmit={${handler}`);
      assert.ok(start > 0, `the ${handler} form is rendered`);
      const end = page.indexOf('</form>', start) + '</form>'.length;
      const otherForm = page.slice(start, end);
      assert.equal(otherForm.includes('aria-busy'), false, `${handler} gains no aria-busy`);
      assert.equal(otherForm.includes('role="status"'), false, `${handler} gains no status line`);
    }
  });

  it('keeps the existing concept flow', () => {
    assert.ok(FLOW.includes('conceptId: conceptForm.conceptId,'), 'the concept id stays');
    assert.ok(FLOW.includes('domain: conceptForm.domain,'), 'the domain stays');
    assert.ok(FLOW.includes('difficulty: {'), 'the difficulty block stays');
    assert.ok(FLOW.includes("showMessage('success', 'Concept added successfully!');"), 'the success message stays');
    assert.ok(FLOW.includes('setConceptForm({'), 'the form still resets');
    assert.ok(FLOW.includes("'Failed to add concept'"), 'the error message stays');
    assert.ok(page.includes('<form onSubmit={handleAddConcept} className="space-y-4">'), 'the form tag stays');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall/.test(page), false, 'the page adds no server call');
    assert.equal(page.includes('rpc-schemas'), false, 'the page imports no new RPC schema');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Adding the concept'), false, `${file} gained the status copy`);
    }
  });
});
