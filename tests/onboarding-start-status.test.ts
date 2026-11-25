/**
 * Starting the onboarding profile is announced (`Onboarding`).
 *
 * The "Let's set up your learning plan" form calls `submit` to create the
 * learner profile. While it saves, the submit button only fades (`disabled` +
 * `disabled:opacity-60`) and swaps its label to "Creating your plan…" with an
 * `aria-hidden` spinner; a screen reader does not hear the name change because
 * focus stays on the button, so nothing says the profile is being created.
 * `saving` is shared with "Start with an empty workspace" (`startEmpty`) and
 * "Explore the example learners first", so a bare `aria-busy={saving}` would
 * make "Start learning" look busy while the examples are removed. A separate
 * `submitting` flag is used for the submit button and its own status line.
 *
 * This file locks `aria-busy={submitting}` right after `disabled={saving ||
 * !isReady}`, the untouched classes/label/icons, the separate state and the
 * `setSubmitting` calls in `submit`, one new `role="status"` +
 * `aria-live="polite"` + `sr-only` line as the last child of the form, the
 * untouched "Loading subjects…"/error lines, the secondary buttons without
 * `aria-busy`, the `submit`/`startEmpty` flows, and that no server function,
 * RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const COMPONENT_FILE = join(ROOT, 'src', 'components', 'Onboarding.tsx');
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

/** The `submit` handler, from its declaration to the returned markup. */
const submitBlock = () => {
  const start = page.indexOf('const submit = async');
  const end = page.indexOf('  return (', start);
  assert.ok(start > 0 && end > start, 'the submit handler is present');
  return page.slice(start, end);
};

/** The `startEmpty` handler, from its declaration to `const domains`. */
const startEmptyBlock = () => {
  const start = page.indexOf('const startEmpty = async');
  const end = page.indexOf('const domains', start);
  assert.ok(start > 0 && end > start, 'the startEmpty handler is present');
  return page.slice(start, end);
};

const BUTTON = buttonOf('Start learning');

describe('onboarding: the Start learning button announces it is working', () => {
  it('adds aria-busy={submitting} right after disabled={saving || !isReady}', () => {
    assert.ok(BUTTON.includes('type="submit"'), 'the submit type stays');
    assert.ok(BUTTON.includes('disabled={saving || !isReady}'), 'disabled stays driven by saving');
    assert.ok(BUTTON.includes('aria-busy={submitting}'), 'the button is busy only while submitting');
    assert.ok(
      BUTTON.indexOf('disabled={saving || !isReady}') < BUTTON.indexOf('aria-busy={submitting}'),
      'aria-busy sits after disabled',
    );
  });

  it('keeps the classes, spinner, label and arrow untouched', () => {
    assert.ok(
      BUTTON.includes(
        'className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"',
      ),
      'the button classes stay',
    );
    assert.ok(
      page.includes('{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}'),
      'the spinner stays driven by saving',
    );
    assert.ok(
      page.includes("{saving ? 'Creating your plan…' : 'Start learning'}"),
      'the visible copy stays driven by saving',
    );
    assert.ok(
      page.includes('{!saving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}'),
      'the arrow stays',
    );
  });

  it('adds a separate submitting state without replacing saving', () => {
    assert.ok(
      page.includes('const [saving, setSaving] = useState(false);'),
      'the saving state stays',
    );
    assert.ok(
      page.includes('const [submitting, setSubmitting] = useState(false);'),
      'the submitting state is added',
    );
    assert.ok(
      page.indexOf('const [saving, setSaving] = useState(false);') <
        page.indexOf('const [submitting, setSubmitting] = useState(false);'),
      'submitting is declared right after saving',
    );
  });
});

describe('onboarding: the submit flow sets and clears the marker', () => {
  it('sets submitting right after saving starts', () => {
    const submit = submitBlock();
    assert.ok(submit.includes('setSaving(true);'), 'saving still starts');
    assert.ok(submit.includes('setSubmitting(true);'), 'submitting starts too');
    assert.ok(
      submit.indexOf('setSaving(true);') < submit.indexOf('setSubmitting(true);'),
      'submitting starts after saving',
    );
  });

  it('clears submitting after saving in the catch branch, with no finally', () => {
    const submit = submitBlock();
    assert.ok(submit.includes('setSaving(false);'), 'saving still clears on error');
    assert.ok(submit.includes('setSubmitting(false);'), 'submitting clears on error too');
    assert.ok(
      submit.indexOf('setSaving(false);') < submit.indexOf('setSubmitting(false);'),
      'submitting clears after saving',
    );
    assert.equal(/finally/.test(submit), false, 'the submit handler gains no finally');
  });

  it('keeps the guard, validation, profile creation and onCreated order', () => {
    const submit = submitBlock();
    assert.ok(submit.includes('if (!db || saving) return;'), 'the guard stays');
    assert.ok(submit.includes('const clean = cleanName(name);'), 'name cleaning stays');
    assert.ok(submit.includes("setError('Please enter your name.');"), 'validation stays');
    assert.ok(submit.includes('await db.setLearnerProfile('), 'profile creation stays');
    assert.ok(submit.includes('await onCreated(learnerId, clean, basicsToQuiz);'), 'onCreated stays');
  });
});

describe('onboarding: one dedicated status line speaks while submitting', () => {
  it('adds exactly one live status with the pending copy', () => {
    assert.ok(
      page.includes(
        '<p role="status" aria-live="polite" className="sr-only">\n          {submitting ? \'Creating your plan…\' : \'\'}\n        </p>',
      ),
      'the status line is rendered',
    );
    assert.equal(count(page, /Creating your plan…/g), 2, 'the button copy and the status copy');
  });

  it('is the last child of the form, after the button row', () => {
    const status = page.indexOf('{submitting ? \'Creating your plan…\' : \'\'}');
    const lastButton = page.lastIndexOf('Start with an empty workspace');
    const formClose = page.lastIndexOf('</form>');
    assert.ok(lastButton > 0, 'the last secondary button is present');
    assert.ok(lastButton < status, 'the status comes after the buttons');
    assert.ok(status < formClose, 'the status comes before the form closes');
    const between = page.slice(status, formClose);
    assert.equal(count(between, /<button/g), 0, 'no button is rendered after the status');
  });

  it('keeps Loading subjects… and the error alert untouched', () => {
    assert.ok(
      page.includes(
        '<p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">',
      ),
      'the loading line keeps role status without aria-live',
    );
    assert.ok(page.includes('Loading subjects…'), 'the loading copy stays');
    assert.ok(
      page.includes(
        '<p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">',
      ),
      'the error alert stays',
    );
    assert.equal(count(page, /role="status"/g), 2, 'loading line and the new pending status');
    assert.equal(count(page, /role="alert"/g), 1, 'the single error alert stays');
    assert.equal(count(page, /aria-live=/g), 1, 'only the new pending status is live');
  });

  it('adds no extra labels or atomic regions', () => {
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label was added');
    assert.equal(count(page, /aria-labelledby=/g), 1, 'only the section keeps its label');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
  });
});

describe('onboarding: the secondary actions stay independent', () => {
  it('keeps the skip and empty-workspace buttons disabled by saving only', () => {
    for (const label of ['Explore the example learners first', 'Start with an empty workspace']) {
      const button = buttonOf(label);
      assert.ok(button.includes('disabled={saving}'), `${label} stays disabled by saving`);
      assert.equal(button.includes('aria-busy'), false, `${label} gains no aria-busy`);
    }
    assert.equal(count(page, /aria-busy=/g), 1, 'only the submit button is busy');
  });

  it('keeps startEmpty unchanged and unaware of submitting', () => {
    const startEmpty = startEmptyBlock();
    assert.ok(startEmpty.includes('if (saving) return;'), 'the guard stays');
    assert.ok(startEmpty.includes('window.confirm('), 'the confirmation stays');
    assert.ok(startEmpty.includes('await removeExampleData();'), 'the removal stays');
    assert.ok(startEmpty.includes('await onExamplesRemoved?.();'), 'the callback stays');
    assert.ok(startEmpty.includes('finally'), 'the finally block stays');
    assert.ok(startEmpty.includes('setSaving(false);'), 'saving still clears in finally');
    assert.equal(/submitting/.test(startEmpty), false, 'startEmpty never touches submitting');
  });

  it('keeps the name field, subjects and radio choices intact', () => {
    assert.ok(page.includes('maxLength={200}'), 'the name length stays');
    assert.ok(page.includes('aria-describedby={ids.nameHint}'), 'the name hint stays');
    assert.ok(page.includes('aria-invalid={error === \'Please enter your name.\' || undefined}'), 'the invalid marker stays');
    assert.ok(page.includes('<SubjectChoices domains={domains} chosen={chosen} onToggle={toggle} />'), 'the subject choices stay');
    assert.ok(page.includes('name="start"'), 'the radio group stays');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false, 'no new data path');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('submitting'), false, `${file} gained the busy wiring`);
      assert.equal(other.includes('Creating your plan'), false, `${file} gained the copy`);
    }
  });
});
