/**
 * Computing profiles and saving scores are announced (admin → Psychometrics).
 *
 * Both buttons on the **Score Progress** card shared one `saving` flag: while
 * it was true they only faded (`disabled` + `disabled:opacity-50`), the
 * Compute Profiles icon spun, and nothing else happened. There was no
 * `aria-busy` and no live region anywhere on the page, so a screen reader could
 * not tell whether scores were being saved or profiles were being computed,
 * and the buttons looked frozen.
 *
 * This file locks one `aria-busy` per button right after its `disabled`, two
 * separate markers (`computing`, `savingScores`) set and cleared around the
 * existing `setSaving`, a single `sr-only` polite `role="status"` line that
 * names the running action and is the last child of the **Score Progress**
 * card, the untouched classes/icons/labels and handler flows, and that no
 * server function, RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'admin', 'psychometrics.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

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

const COMPUTE = buttonOf('Compute Profiles');
const SAVE = buttonOf('Save Scores');

/** The Score Progress card, from its `<motion.div` to its `</motion.div>`. */
const scoreAnchor = page.indexOf('Scores: {psychometricData.scoreCount}');
assert.ok(scoreAnchor > 0, 'the Score Progress card is rendered');
const cardStart = page.lastIndexOf('<motion.div', scoreAnchor);
const cardEnd = page.indexOf('</motion.div>', scoreAnchor) + '</motion.div>'.length;
const card = page.slice(cardStart, cardEnd);
assert.ok(card.includes('Compute Profiles') && card.includes('Save Scores'), 'the card holds both buttons');

/** Each handler, from `async function <name>` to the next top-level function. */
const saveStart = page.indexOf('async function handleSaveScores() {');
const computeStart = page.indexOf('async function handleComputeProfiles() {');
const toggleStart = page.indexOf('function toggleCategory(category: string) {');
assert.ok(saveStart > 0 && computeStart > saveStart && toggleStart > computeStart, 'both handlers are present');
const SAVE_HANDLER = page.slice(saveStart, computeStart);
const COMPUTE_HANDLER = page.slice(computeStart, toggleStart);

describe('Psychometrics: each button announces its own busy state', () => {
  it('adds aria-busy={computing} right after disabled={saving || !hasScores}', () => {
    assert.ok(COMPUTE.includes('onClick={handleComputeProfiles}'), 'the handler stays');
    assert.ok(COMPUTE.includes('disabled={saving || !hasScores}'), 'disabled stays driven by saving and scores');
    assert.ok(COMPUTE.includes('aria-busy={computing}'), 'aria-busy is driven by computing');
    assert.ok(
      COMPUTE.indexOf('disabled={saving || !hasScores}') < COMPUTE.indexOf('aria-busy={computing}'),
      'aria-busy sits right after disabled',
    );
  });

  it('adds aria-busy={savingScores} right after the Save Scores disabled', () => {
    assert.ok(SAVE.includes('onClick={handleSaveScores}'), 'the handler stays');
    assert.ok(
      SAVE.includes('disabled={saving || Object.keys(editedScores).length === 0}'),
      'disabled stays driven by saving and edited scores',
    );
    assert.ok(SAVE.includes('aria-busy={savingScores}'), 'aria-busy is driven by savingScores');
    assert.ok(
      SAVE.indexOf('disabled={saving || Object.keys(editedScores).length === 0}') <
        SAVE.indexOf('aria-busy={savingScores}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(page, /aria-busy=/g), 2, 'exactly two aria-busy attributes on the page');
  });

  it('keeps classes, icons and labels untouched', () => {
    assert.ok(
      COMPUTE.includes('className="btn btn-secondary flex items-center gap-2 disabled:opacity-50"'),
      'the Compute Profiles classes stay',
    );
    assert.ok(
      COMPUTE.includes("<RefreshCw className={cn('w-4 h-4', saving && 'animate-spin')} />"),
      'the Compute Profiles spinner stays driven by saving',
    );
    assert.ok(
      SAVE.includes('className="btn btn-success flex items-center gap-2 disabled:opacity-50"'),
      'the Save Scores classes stay',
    );
    assert.ok(SAVE.includes('<Save className="w-4 h-4" />'), 'the Save Scores icon stays');
    assert.equal(count(card, /Compute Profiles/g), 1, 'the Compute Profiles label stays once in the card');
    assert.equal(count(card, /Save Scores/g), 1, 'the Save Scores label stays once in the card');
  });
});

describe('Psychometrics: the markers wrap the existing saving flag', () => {
  it('declares computing and savingScores after saving', () => {
    assert.ok(page.includes('const [saving, setSaving] = useState(false);'), 'saving stays');
    assert.ok(page.includes('const [computing, setComputing] = useState(false);'), 'computing exists');
    assert.ok(page.includes('const [savingScores, setSavingScores] = useState(false);'), 'savingScores exists');
    assert.ok(
      page.indexOf('const [saving, setSaving] = useState(false);') <
        page.indexOf('const [computing, setComputing] = useState(false);'),
      'computing follows saving',
    );
    assert.equal(count(page, /const \[computing, setComputing\]/g), 1, 'one computing marker');
    assert.equal(count(page, /const \[savingScores, setSavingScores\]/g), 1, 'one savingScores marker');
  });

  it('sets and clears savingScores around saving in handleSaveScores', () => {
    assert.ok(SAVE_HANDLER.includes('setSaving(true);'), 'saving still starts with the request');
    assert.ok(
      SAVE_HANDLER.indexOf('setSaving(true);') < SAVE_HANDLER.indexOf('setSavingScores(true);'),
      'savingScores starts after saving',
    );
    assert.ok(
      SAVE_HANDLER.indexOf('setSavingScores(true);') < SAVE_HANDLER.indexOf("setError('');"),
      'savingScores starts before clearing the messages',
    );
    assert.ok(SAVE_HANDLER.includes('setSaving(false);'), 'saving still clears in the finally');
    assert.ok(
      SAVE_HANDLER.indexOf('setSaving(false);') < SAVE_HANDLER.indexOf('setSavingScores(false);'),
      'savingScores clears after saving',
    );
    assert.equal(SAVE_HANDLER.includes('setComputing'), false, 'the save flow leaves computing alone');
    assert.equal(count(SAVE_HANDLER, /finally/g), 1, 'the save flow keeps a single finally');
  });

  it('sets and clears computing around saving in handleComputeProfiles', () => {
    assert.ok(COMPUTE_HANDLER.includes('setSaving(true);'), 'saving still starts with the request');
    assert.ok(
      COMPUTE_HANDLER.indexOf('setSaving(true);') < COMPUTE_HANDLER.indexOf('setComputing(true);'),
      'computing starts after saving',
    );
    assert.ok(
      COMPUTE_HANDLER.indexOf('setComputing(true);') < COMPUTE_HANDLER.indexOf("setError('');"),
      'computing starts before clearing the messages',
    );
    assert.ok(COMPUTE_HANDLER.includes('setSaving(false);'), 'saving still clears in the finally');
    assert.ok(
      COMPUTE_HANDLER.indexOf('setSaving(false);') < COMPUTE_HANDLER.indexOf('setComputing(false);'),
      'computing clears after saving',
    );
    assert.equal(COMPUTE_HANDLER.includes('setSavingScores'), false, 'the compute flow leaves savingScores alone');
    assert.equal(count(COMPUTE_HANDLER, /finally/g), 1, 'the compute flow keeps a single finally');
  });
});

describe('Psychometrics: one polite status line names the running action', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      card.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the progress line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(page, /role="status"/g), 1, 'one status line on the page');
    assert.equal(count(page, /role="alert"/g), 0, 'no alert role added');
  });

  it('names each action and clears when idle', () => {
    assert.ok(
      card.includes("{computing ? 'Computing profiles…' : savingScores ? 'Saving scores…' : ''}"),
      'the status text follows both markers before clearing',
    );
    assert.equal(count(page, /Computing profiles…/g), 1, 'the computing copy appears once');
    assert.equal(count(page, /Saving scores…/g), 1, 'the saving copy appears once');
  });

  it('sits after the two-button header row as the last child of the card', () => {
    const statusStart = card.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the progress line is present');
    const saveButton = card.lastIndexOf('</button>', statusStart);
    assert.ok(saveButton > 0, 'the Save Scores button closes before the line');
    assert.ok(statusStart > saveButton, 'the line follows both buttons');
    const headerClose = card.indexOf('</div>\n                </div>', saveButton);
    assert.ok(headerClose > saveButton, 'the header row closes after the button row');
    assert.ok(statusStart > headerClose, 'the line follows the header row');
    const statusEnd = card.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      card.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the card',
    );
  });
});

describe('Psychometrics: the flows stay intact and no data path is added', () => {
  it('keeps both handlers', () => {
    assert.ok(SAVE_HANDLER.includes('if (!selectedUserId || !db) return;'), 'the save guard stays');
    assert.ok(COMPUTE_HANDLER.includes('if (!selectedUserId || !db) return;'), 'the compute guard stays');
    assert.ok(SAVE_HANDLER.includes('source: \'admin-ui\','), 'the save source stays');
    assert.ok(
      SAVE_HANDLER.includes('const { learningStyle, cognitiveProfile } = derivedProfilesFromScores(scores);'),
      'the save derivation stays',
    );
    assert.ok(
      COMPUTE_HANDLER.includes(
        'const { learningStyle, cognitiveProfile } = derivedProfilesFromScores(learner.psychometricScores);',
      ),
      'the compute derivation stays',
    );
    assert.equal(count(page, /await updateLearner\(selectedUserId,/g), 2, 'both flows still update the learner');
    assert.ok(SAVE_HANDLER.includes('await fetchPsychometricData(selectedUserId);'), 'the save reload stays');
    assert.ok(COMPUTE_HANDLER.includes('await fetchPsychometricData(selectedUserId);'), 'the compute reload stays');
    assert.ok(
      page.includes("'Scores saved and profiles computed successfully!'"),
      'the save success copy stays',
    );
    assert.ok(page.includes("'Profiles computed successfully!'"), 'the compute success copy stays');
    assert.ok(page.includes("setError(err instanceof Error ? err.message : 'An error occurred');"), 'the error path stays');
  });

  it('keeps the learner picker, cards, progress bar and score inputs', () => {
    assert.ok(page.includes('Select Learner:'), 'the learner label stays');
    assert.ok(page.includes('Choose a learner...'), 'the empty option stays');
    assert.ok(page.includes('Learning Style'), 'the Learning Style card stays');
    assert.ok(page.includes('Cognitive Profile'), 'the Cognitive Profile card stays');
    assert.ok(
      card.includes('Scores: {psychometricData.scoreCount} / {psychometricData.totalDomains} domains'),
      'the progress copy stays',
    );
    assert.ok(page.includes("type=\"range\""), 'the score sliders stay');
    assert.ok(page.includes('toggleCategory'), 'the accordion stays');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(page, /aria-label=/g), 0);
    assert.equal(count(page, /aria-labelledby=/g), 0);
    assert.equal(count(page, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Computing profiles'), false, `${file} gained the status copy`);
      assert.equal(other.includes('psychometrics-save-busy'), false, `${file} gained busy wiring`);
    }
  });
});
