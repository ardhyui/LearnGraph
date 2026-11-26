/**
 * Adding a prerequisite is announced (`/data-entry`, **Prerequisites** tab).
 *
 * The **Add Prerequisite Edge** submit button only called `createEdge` while the
 * form stayed silent: it had no `disabled`, no `aria-busy` and the prerequisite
 * form had no live region, so a screen reader never heard that the edge was
 * being added and a double click could send the save twice. The page already had
 * one result banner (`role={message.type === 'success' ? 'status' : 'alert'}`)
 * plus the learner save status from PR #195 and the concept save status from
 * PR #196, all of which must stay.
 *
 * This file locks the new `savingPrerequisite` state and guard, `disabled` +
 * `aria-busy` right after `className` on the submit button with its type,
 * classes and label untouched, one `sr-only` polite `role="status"` line as the
 * last child of the prerequisite form, the untouched result banner and the
 * learner/concept/knowledge-state statuses, the untouched **Preview** block,
 * and that no server function, RPC schema or migration was added.
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

/** The prerequisite form, from its opening tag to its closing `</form>`. */
const formStart = page.indexOf('<form onSubmit={handleAddPrerequisite}');
assert.ok(formStart > 0, 'the prerequisite form is rendered');
const formEnd = page.indexOf('</form>', formStart) + '</form>'.length;
const form = page.slice(formStart, formEnd);
assert.ok(form.includes('Add Prerequisite Edge'), 'the prerequisite form holds the submit button');

/** The opening tag of the prerequisite submit button. */
const submitTypeAt = form.lastIndexOf('type="submit"');
assert.ok(submitTypeAt > 0, 'the submit button is rendered');
const buttonStart = form.lastIndexOf('<button', submitTypeAt);
const buttonEnd = form.indexOf('>', submitTypeAt) + 1;
const SUBMIT = form.slice(buttonStart, buttonEnd);

/** `handleAddPrerequisite`, from its signature to `handleAddKnowledgeState`. */
const handlerStart = page.indexOf('const handleAddPrerequisite = async (e: React.FormEvent) => {');
assert.ok(handlerStart > 0, 'handleAddPrerequisite is declared');
const handlerEnd = page.indexOf('const handleAddKnowledgeState', handlerStart);
assert.ok(handlerEnd > handlerStart, 'handleAddPrerequisite keeps its body before handleAddKnowledgeState');
const FLOW = page.slice(handlerStart, handlerEnd);

describe('/data-entry: the prerequisite submit button announces it is busy', () => {
  it('adds disabled and aria-busy right after the submit class', () => {
    assert.ok(SUBMIT.includes('type="submit"'), 'the button stays a submit');
    assert.ok(
      SUBMIT.includes(
        'className="btn w-full bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-600/20"',
      ),
      'the submit classes are untouched',
    );
    assert.ok(SUBMIT.includes('disabled={savingPrerequisite}'), 'disabled is driven by savingPrerequisite');
    assert.ok(
      SUBMIT.includes('aria-busy={savingPrerequisite}'),
      'aria-busy is driven by savingPrerequisite',
    );
    const typeAt = SUBMIT.indexOf('type="submit"');
    const classAt = SUBMIT.indexOf(
      'className="btn w-full bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-600/20"',
    );
    const disabledAt = SUBMIT.indexOf('disabled={savingPrerequisite}');
    const busyAt = SUBMIT.indexOf('aria-busy={savingPrerequisite}');
    assert.ok(
      typeAt < classAt && classAt < disabledAt && disabledAt < busyAt,
      'type, class, disabled and aria-busy stay in order',
    );
    assert.equal(count(page, /aria-busy=/g), 4, 'the learner, concept, prerequisite and knowledge-state buttons carry aria-busy');
  });

  it('keeps the Add Prerequisite Edge label', () => {
    assert.ok(form.includes('Add Prerequisite Edge'), 'the visible label is untouched');
  });
});

describe('/data-entry: adding a prerequisite is guarded and always cleared', () => {
  it('declares savingPrerequisite right after savingConcept', () => {
    assert.ok(
      page.includes(
        'const [savingConcept, setSavingConcept] = useState(false);\n\n  // Prerequisite save progress\n  const [savingPrerequisite, setSavingPrerequisite] = useState(false);',
      ),
      'savingPrerequisite is declared after savingConcept',
    );
  });

  it('guards double submits after preventDefault', () => {
    assert.match(
      FLOW,
      /const handleAddPrerequisite = async \(e: React\.FormEvent\) => \{\n\s{4}e\.preventDefault\(\);\n\s{4}if \(savingPrerequisite\) return;/,
      'preventDefault runs first and the guard follows directly',
    );
  });

  it('starts saving right before createEdge and clears it in the existing finally', () => {
    const savingAt = FLOW.indexOf('setSavingPrerequisite(true);');
    const createAt = FLOW.indexOf('await createEdge(');
    assert.ok(savingAt > 0, 'saving starts');
    assert.ok(createAt > savingAt, 'saving starts right before createEdge');
    assert.match(
      FLOW,
      /catch \(err\) \{\s*showMessage\('error', err instanceof Error \? err\.message : 'Failed to add prerequisite'\);\s*\} finally \{\s*setSavingPrerequisite\(false\);\s*\}/,
      'the existing catch is followed by a finally that clears savingPrerequisite',
    );
    assert.equal(count(FLOW, /finally \{/g), 1, 'no extra finally is added');
  });
});

describe('/data-entry: one polite status line after the prerequisite submit button', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the prerequisite status line is a sr-only paragraph carrying role and politeness',
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

  it('says Adding the prerequisite… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{savingPrerequisite ? 'Adding the prerequisite…' : ''}"),
      'the status text follows savingPrerequisite',
    );
    assert.equal(count(page, /Adding the prerequisite…/g), 1, 'the status copy appears once');
  });

  it('sits after the submit button as the last child of the prerequisite form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the status line is present');
    assert.ok(statusStart > buttonEnd, 'the status line follows the submit button');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the prerequisite form',
    );
  });
});

describe('/data-entry: the banner, other statuses, preview and knowledge state stay intact', () => {
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

  it('keeps the untouched learner, concept and knowledge-state save statuses', () => {
    for (const [handler, marker, copy] of [
      ['handleAddLearner', 'aria-busy={savingLearner}', "{savingLearner ? 'Adding the learner…' : ''}"],
      ['handleAddConcept', 'aria-busy={savingConcept}', "{savingConcept ? 'Adding the concept…' : ''}"],
      ['handleAddKnowledgeState', 'aria-busy={savingKnowledgeState}', "{savingKnowledgeState ? 'Saving the knowledge state…' : ''}"],
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
    assert.ok(page.includes('{prereqForm.from && prereqForm.to && ('), 'the preview condition stays');
  });

  it('keeps the existing prerequisite flow', () => {
    assert.ok(FLOW.includes('from: prereqForm.from,'), 'the from concept stays');
    assert.ok(FLOW.includes('to: prereqForm.to,'), 'the to concept stays');
    assert.ok(FLOW.includes('strength: prereqForm.strength,'), 'the strength stays');
    assert.ok(FLOW.includes('reason: prereqForm.reason || undefined,'), 'the reason stays');
    assert.ok(
      FLOW.includes("showMessage('success', 'Prerequisite edge added successfully!');"),
      'the success message stays',
    );
    assert.ok(
      FLOW.includes("setPrereqForm({ from: '', to: '', strength: 'recommended', reason: '' });"),
      'the form still resets',
    );
    assert.ok(FLOW.includes("'Failed to add prerequisite'"), 'the error message stays');
    assert.ok(
      page.includes('<form onSubmit={handleAddPrerequisite} className="space-y-4">'),
      'the form tag stays',
    );
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall/.test(page), false, 'the page adds no server call');
    assert.equal(page.includes('rpc-schemas'), false, 'the page imports no new RPC schema');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Adding the prerequisite'), false, `${file} gained the status copy`);
    }
  });
});
