/**
 * Adding a learner is announced (`/data-entry`, **Learners** tab).
 *
 * The **Add Learner** / **Submit JSON** submit button only called
 * `createLearner` while the form stayed silent: it had no `disabled`, no
 * `aria-busy` and the learner form had no live region, so a screen reader
 * never heard that the learner was being added and a double click could send
 * the save twice. The page already had one result banner
 * (`role={message.type === 'success' ? 'status' : 'alert'}`) which must stay.
 *
 * This file locks the new `savingLearner` state and guard, `disabled` +
 * `aria-busy` right after `className` on the submit button with its type,
 * classes and label untouched, one `sr-only` polite `role="status"` line as
 * the last child of the learner form, the untouched result banner and the
 * prerequisite/knowledge-state forms, and that no server function, RPC schema
 * or migration was added.
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

/** The learner form, from its opening tag to its closing `</form>`. */
const formStart = page.indexOf('<form onSubmit={handleAddLearner}');
assert.ok(formStart > 0, 'the learner form is rendered');
const formEnd = page.indexOf('</form>', formStart) + '</form>'.length;
const form = page.slice(formStart, formEnd);
assert.ok(form.includes('Add Learner'), 'the learner form holds the submit button');

/** The opening tag of the learner submit button. */
const submitTypeAt = form.lastIndexOf('type="submit"');
assert.ok(submitTypeAt > 0, 'the submit button is rendered');
const buttonStart = form.lastIndexOf('<button', submitTypeAt);
const buttonEnd = form.indexOf('>', submitTypeAt) + 1;
const SUBMIT = form.slice(buttonStart, buttonEnd);

/** `handleAddLearner`, from its signature to `handleAddConcept`. */
const handlerStart = page.indexOf('const handleAddLearner = async (e: React.FormEvent) => {');
assert.ok(handlerStart > 0, 'handleAddLearner is declared');
const handlerEnd = page.indexOf('const handleAddConcept', handlerStart);
assert.ok(handlerEnd > handlerStart, 'handleAddLearner keeps its body before handleAddConcept');
const FLOW = page.slice(handlerStart, handlerEnd);

describe('/data-entry: the learner submit button announces it is busy', () => {
  it('adds disabled and aria-busy right after the submit class', () => {
    assert.ok(SUBMIT.includes('type="submit"'), 'the button stays a submit');
    assert.ok(
      SUBMIT.includes('className="btn btn-success w-full"'),
      'the submit classes are untouched',
    );
    assert.ok(SUBMIT.includes('disabled={savingLearner}'), 'disabled is driven by savingLearner');
    assert.ok(SUBMIT.includes('aria-busy={savingLearner}'), 'aria-busy is driven by savingLearner');
    const typeAt = SUBMIT.indexOf('type="submit"');
    const classAt = SUBMIT.indexOf('className="btn btn-success w-full"');
    const disabledAt = SUBMIT.indexOf('disabled={savingLearner}');
    const busyAt = SUBMIT.indexOf('aria-busy={savingLearner}');
    assert.ok(
      typeAt < classAt && classAt < disabledAt && disabledAt < busyAt,
      'type, class, disabled and aria-busy stay in order',
    );
    assert.equal(count(page, /aria-busy=/g), 3, 'the learner, concept and prerequisite buttons carry aria-busy');
  });

  it('keeps both labels of the toggle', () => {
    assert.ok(
      form.includes("{learnerInputMode === 'json' ? 'Submit JSON' : 'Add Learner'}"),
      'the visible label still follows the input mode',
    );
  });
});

describe('/data-entry: adding a learner is guarded and always cleared', () => {
  it('declares savingLearner with the learner state', () => {
    assert.ok(
      page.includes(
        "const [learnerJson, setLearnerJson] = useState('');\n\n  // Learner save progress\n  const [savingLearner, setSavingLearner] = useState(false);",
      ),
      'savingLearner is declared after the learner JSON state',
    );
  });

  it('guards double submits after preventDefault', () => {
    assert.match(
      FLOW,
      /const handleAddLearner = async \(e: React\.FormEvent\) => \{\n\s{4}e\.preventDefault\(\);\n\s{4}if \(savingLearner\) return;/,
      'preventDefault runs first and the guard follows directly',
    );
  });

  it('starts saving right before createLearner and clears it in the existing finally', () => {
    const savingAt = FLOW.indexOf('setSavingLearner(true);');
    const createAt = FLOW.indexOf('await createLearner(');
    assert.ok(savingAt > 0, 'saving starts');
    assert.ok(createAt > savingAt, 'saving starts right before createLearner');
    assert.match(
      FLOW,
      /catch \(err\) \{\s*showMessage\('error', err instanceof Error \? err\.message : 'Failed to add learner'\);\s*\} finally \{\s*setSavingLearner\(false\);\s*\}/,
      'the existing catch is followed by a finally that clears savingLearner',
    );
    assert.equal(count(FLOW, /finally \{/g), 1, 'no extra finally is added');
  });

  it('leaves the invalid-JSON return before the busy flag', () => {
    const jsonReturn = FLOW.indexOf("showMessage('error', 'Invalid JSON format');");
    const savingAt = FLOW.indexOf('setSavingLearner(true);');
    assert.ok(jsonReturn > 0, 'the invalid JSON branch stays');
    assert.ok(savingAt > jsonReturn, 'a rejected submission never leaves the button busy');
  });
});

describe('/data-entry: one polite status line after the learner submit button', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the learner status line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live=/g), 4, 'the result banner plus all three save status lines');
    assert.equal(count(page, /role="status"/g), 3, 'one status line per save form');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert is added');
    assert.equal(count(page, /aria-label=/g), 5, 'no aria-label is added');
    assert.equal(count(page, /aria-labelledby=/g), 5, 'no aria-labelledby is added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic is added');
    assert.equal(count(page, /className="sr-only"/g), 3, 'the learner, concept and prerequisite status lines');
  });

  it('says Adding the learner… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{savingLearner ? 'Adding the learner…' : ''}"),
      'the status text follows savingLearner',
    );
    assert.equal(count(page, /Adding the learner…/g), 1, 'the status copy appears once');
  });

  it('sits after the submit button as the last child of the learner form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the status line is present');
    assert.ok(statusStart > buttonEnd, 'the status line follows the submit button');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the learner form',
    );
  });
});

describe('/data-entry: the result banner and the other forms stay intact', () => {
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

  it('leaves the knowledge-state form without aria-busy', () => {
    for (const handler of ['handleAddKnowledgeState']) {
      const start = page.indexOf(`<form onSubmit={${handler}`);
      assert.ok(start > 0, `the ${handler} form is rendered`);
      const end = page.indexOf('</form>', start) + '</form>'.length;
      const otherForm = page.slice(start, end);
      assert.equal(otherForm.includes('aria-busy'), false, `${handler} gains no aria-busy`);
      assert.equal(otherForm.includes('role="status"'), false, `${handler} gains no status line`);
    }
  });

  it('keeps the existing learner flow', () => {
    assert.ok(FLOW.includes("if (learnerInputMode === 'json') {"), 'the JSON mode stays');
    assert.ok(FLOW.includes('JSON.parse(learnerJson);'), 'the JSON parse stays');
    assert.ok(FLOW.includes('psychometricScores: Object.keys(psychometricScores).length > 0'), 'the scores stay');
    assert.ok(FLOW.includes("showMessage('success', 'Learner added successfully!');"), 'the success message stays');
    assert.ok(FLOW.includes('setPsychometricScores({});'), 'the scores still reset');
    assert.ok(FLOW.includes("setLearnerJson('');"), 'the JSON still resets');
    assert.ok(FLOW.includes("'Failed to add learner'"), 'the error message stays');
    assert.ok(page.includes('<form onSubmit={handleAddLearner} className="space-y-4">'), 'the form tag stays');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall/.test(page), false, 'the page adds no server call');
    assert.equal(page.includes('rpc-schemas'), false, 'the page imports no new RPC schema');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Adding the learner'), false, `${file} gained the status copy`);
    }
  });
});
