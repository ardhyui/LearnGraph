/**
 * Saving the profile is announced (/profile).
 *
 * The **Save Profile** button depends on `saving`: while it was true the
 * button only lost its action and swapped its label to `Saving...`; there was
 * no `aria-busy` and no live region, so a screen reader could not tell that
 * the profile was being stored and the button looked frozen — while the same
 * pattern is already used on `/sign-in`, `/forgot-password`,
 * `/reset-password`, the `/learn` self-report and concept quiz,
 * `DeleteAccount`, both **Ask an AI tutor** buttons, the snooze buttons,
 * **Create a read-only key**, **Save subjects**, the `/japanese` buttons,
 * **Start learning**, the admin draft/save buttons, the **Refresh** button on
 * `/gaps`, the assessment quiz Save buttons and the batch assessment Save
 * buttons on this very page.
 *
 * This file locks one `aria-busy={saving}` right after the button's
 * `disabled`, a single `sr-only` polite `role="status"` line that is the last
 * child of the block, the untouched classes/icon/label/handler, the untouched
 * **Surprise Me!** button, the existing assessment/batch statuses and error
 * alert, the untouched `saveProfile`/`persistScores`/`handleSurpriseMe` flows,
 * and that no server function, RPC schema or migration was added.
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

/** The `<motion.button>` that opens before `anchor`. */
const motionButtonAt = (anchor: string): string => {
  const open = page.lastIndexOf('<motion.button', page.indexOf(anchor));
  assert.ok(open > 0, `the motion button for ${anchor} is rendered`);
  const close = page.indexOf('</motion.button>', open) + '</motion.button>'.length;
  return page.slice(open, close);
};

const SAVE_PROFILE = motionButtonAt('onClick={saveProfile}');
const SURPRISE = motionButtonAt('onClick={handleSurpriseMe}');

/** The save block, from its `<motion.div` to the `</motion.div>` after the status line. */
const saveComment = page.indexOf('{/* Save Button & Surprise Me (for editable modes) */}');
assert.ok(saveComment > 0, 'the save block is rendered');
const blockStart = page.indexOf('<motion.div', saveComment);
assert.ok(blockStart > 0, 'the save block has its motion.div');
const statusStart = page.indexOf('<p role="status" aria-live="polite"', blockStart);
assert.ok(statusStart > blockStart, 'the status line is present in the save block');
const blockEnd = page.indexOf('</motion.div>', statusStart) + '</motion.div>'.length;
const block = page.slice(blockStart, blockEnd);

/** `saveProfile` and `persistScores`, next to each other. */
const persistStart = page.indexOf(
  'const persistScores = async (scores: Record<string, PsychometricScore>, savedMessage: string): Promise<boolean> => {',
);
const saveProfileStart = page.indexOf('const saveProfile = () =>', persistStart);
assert.ok(persistStart > 0 && saveProfileStart > persistStart, 'the save flow is present');
const PERSIST = page.slice(persistStart, saveProfileStart);
const saveProfileEnd = page.indexOf('/** Decision D4:', saveProfileStart);
const SAVE = page.slice(saveProfileStart, saveProfileEnd);

describe('/profile: the Save Profile button announces its busy state', () => {
  it('adds aria-busy={saving} right after disabled on Save Profile', () => {
    assert.ok(SAVE_PROFILE.includes('onClick={saveProfile}'), 'the handler stays');
    assert.ok(SAVE_PROFILE.includes('disabled={saving}'), 'disabled stays driven by saving');
    assert.ok(SAVE_PROFILE.includes('aria-busy={saving}'), 'aria-busy is driven by saving');
    assert.ok(
      SAVE_PROFILE.indexOf('disabled={saving}') < SAVE_PROFILE.indexOf('aria-busy={saving}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(page, /aria-busy=/g), 6, 'exactly six aria-busy attributes on the page');
  });

  it('keeps the classes, icon and label of Save Profile untouched', () => {
    assert.ok(
      SAVE_PROFILE.includes(
        'className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-purple-500 text-white font-medium shadow-lg shadow-primary/25 flex items-center gap-2 disabled:opacity-50"',
      ),
      'the button classes stay',
    );
    assert.ok(SAVE_PROFILE.includes('<Save className="w-5 h-5" />'), 'the button icon stays');
    assert.ok(SAVE_PROFILE.includes("{saving ? 'Saving...' : 'Save Profile'}"), 'the label stays');
  });

  it('leaves Surprise Me! without disabled or aria-busy', () => {
    assert.ok(SURPRISE.includes('onClick={handleSurpriseMe}'), 'Surprise Me! keeps its handler');
    assert.ok(SURPRISE.includes('Surprise Me!'), 'Surprise Me! keeps its label');
    assert.equal(SURPRISE.includes('disabled'), false, 'Surprise Me! stays enabled');
    assert.equal(SURPRISE.includes('aria-busy'), false, 'Surprise Me! gains no aria-busy');
  });
});

describe('/profile: one polite status line announces the profile save', () => {
  it('adds exactly one sr-only polite status line inside the save block', () => {
    assert.ok(
      block.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the status line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 3, 'three polite live regions on the page');
    assert.equal(count(page, /role="status"/g), 4, 'four status lines on the page');
    assert.equal(count(page, /role="alert"/g), 1, 'the one existing alert role stays');
  });

  it('says the profile is saving and clears when idle', () => {
    assert.ok(
      block.includes("{saving ? 'Saving your profile…' : ''}"),
      'the status text follows saving before clearing',
    );
    assert.equal(count(page, /Saving your profile…/g), 1, 'the copy appears once');
  });

  it('sits after the Save Profile button as the last child of the save block', () => {
    assert.ok(
      statusStart > page.indexOf('</motion.button>', page.indexOf('onClick={saveProfile}')),
      'the line follows the Save Profile button',
    );
    const lineEnd = page.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      page.slice(lineEnd, blockEnd).replace(/\s*\n\s*/g, ''),
      '</motion.div>',
      'the line is the last child of the block',
    );
  });
});

describe('/profile: existing notices and save flows stay intact', () => {
  it('keeps the assessment and batch status lines and the error alert', () => {
    assert.ok(
      page.includes("{saving ? 'Saving your quiz result…' : ''}"),
      'the assessment quiz status from PR #180 stays',
    );
    assert.equal(count(page, /Saving your quiz result…/g), 1, 'the old copy appears once');
    assert.ok(
      page.includes("{saving ? 'Saving your quiz results…' : ''}"),
      'the batch assessment status from PR #181 stays',
    );
    assert.equal(count(page, /Saving your quiz results…/g), 1, 'the batch copy appears once');
    assert.ok(
      /role="alert"\s+className="mb-4 p-4 rounded-xl bg-destructive\/10/.test(page),
      'the error alert stays',
    );
    assert.ok(
      page.includes('data-testid="profile-success"'),
      'the existing success status stays',
    );
  });

  it('keeps the saveProfile and persistScores flow unchanged', () => {
    assert.ok(SAVE.includes('const saveProfile = () => persistScores(editedScores,'), 'the call stays');
    assert.ok(
      SAVE.includes("'Saved. Your suggestions on Recommendations now use this profile.'"),
      'the saved message stays',
    );
    assert.ok(PERSIST.includes('if (!profile) return false;'), 'the guard stays');
    assert.ok(PERSIST.includes('setSaving(true);'), 'it still marks saving');
    assert.ok(PERSIST.includes('await updateLearner(userId, updatedData as any);'), 'it still updates');
    assert.ok(
      PERSIST.includes('const saved = db ? await db.computeAndStoreDerivedProfiles(userId) : null;'),
      'it still recomputes derived profiles',
    );
    assert.ok(PERSIST.includes('if (userId !== selectedLearnerRef.current) return true;'), 'the switch guard stays');
    assert.ok(PERSIST.includes('if (saved && saved.userId === userId) setProfile(saved);'), 'it still shows the result');
    assert.ok(PERSIST.includes('setSuccess(savedMessage);'), 'it still reports success');
    assert.ok(PERSIST.includes('setTimeout(() => setSuccess(null), 5000);'), 'it still clears success');
    assert.ok(PERSIST.includes('setError('), 'it still reports errors');
    assert.ok(PERSIST.includes('finally {'), 'the finally stays');
    assert.ok(PERSIST.includes('setSaving(false);'), 'it still clears saving');
    assert.equal(count(PERSIST, /setSaving\(/g), 2, 'aria-busy reuses the existing saving flag');
  });

  it('keeps handleSurpriseMe unchanged', () => {
    const surpriseStart = page.indexOf('const handleSurpriseMe = useCallback(() => {');
    const surpriseEnd = page.indexOf('/**', surpriseStart);
    assert.ok(surpriseStart > 0 && surpriseEnd > surpriseStart, 'the surprise flow is present');
    const SURPRISE_FLOW = page.slice(surpriseStart, surpriseEnd);
    assert.ok(SURPRISE_FLOW.includes('setEditedScores('), 'it still fills the scores');
    assert.ok(SURPRISE_FLOW.includes('setSuccess('), 'it still reports success');
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
      assert.equal(other.includes('Saving your profile'), false, `${file} gained the status copy`);
      assert.equal(other.includes('profile-save-busy'), false, `${file} gained busy wiring`);
    }
  });
});
