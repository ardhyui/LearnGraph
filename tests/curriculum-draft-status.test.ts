/**
 * Drafting and saving a curriculum are announced (Admin → Curriculum Import).
 *
 * The "Draft with Claude" button submits the form that calls
 * `draftCurriculumWithAI` with the person's Anthropic key, and "Save what I
 * kept" calls `applyCurriculumDraft` on the reviewed plan. While `busy`, both
 * buttons only fade (`disabled` + `disabled:opacity-60`) and show an
 * `aria-hidden` `Loader2` spinner; a screen reader hears no name change and
 * no announcement, so it looks like the buttons do nothing.
 *
 * `busy` is shared by both actions (and file picking resets notices), so each
 * button gets its own marker: `drafting` for the draft form and `saving` for
 * the review section, both set right after `setBusy(true)` and cleared right
 * after `setBusy(false)` in the existing `finally` blocks.
 *
 * This file locks `aria-busy={drafting}`/`aria-busy={saving}` right after
 * `disabled={busy}`, the untouched handlers/classes/spinners/labels, the two
 * new `role="status"` + `aria-live="polite"` + `sr-only` lines (last child of
 * the draft form and of the review section), the untouched result notice and
 * error alert, the `draft`/`save` flows, and that no server function, RPC
 * schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'admin', 'curriculum.tsx');
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

/** The `draft` handler, from its declaration to `const save`. */
const draftBlock = () => {
  const start = page.indexOf('const draft = async');
  const end = page.indexOf('const save = async', start);
  assert.ok(start > 0 && end > start, 'the draft handler is present');
  return page.slice(start, end);
};

/** The `save` handler, from its declaration to `const toggle`. */
const saveBlock = () => {
  const start = page.indexOf('const save = async');
  const end = page.indexOf('const toggle =', start);
  assert.ok(start > 0 && end > start, 'the save handler is present');
  return page.slice(start, end);
};

const DRAFT_BUTTON = buttonOf('Draft with Claude');
const SAVE_BUTTON = buttonOf('Save what I kept');

describe('curriculum import: the two busy buttons announce they are working', () => {
  it('adds aria-busy={drafting} right after disabled={busy} on Draft with Claude', () => {
    assert.ok(DRAFT_BUTTON.includes('type="submit"'), 'the button type stays');
    assert.ok(DRAFT_BUTTON.includes('disabled={busy}'), 'disabled stays driven by busy');
    assert.ok(DRAFT_BUTTON.includes('aria-busy={drafting}'), 'the button is busy while drafting');
    assert.ok(
      DRAFT_BUTTON.indexOf('disabled={busy}') < DRAFT_BUTTON.indexOf('aria-busy={drafting}'),
      'aria-busy sits after disabled',
    );
  });

  it('adds aria-busy={saving} right after disabled={busy} on Save what I kept', () => {
    assert.ok(SAVE_BUTTON.includes('type="button"'), 'the button type stays');
    assert.ok(SAVE_BUTTON.includes('onClick={() => void save()}'), 'the handler stays');
    assert.ok(SAVE_BUTTON.includes('disabled={busy}'), 'disabled stays driven by busy');
    assert.ok(SAVE_BUTTON.includes('aria-busy={saving}'), 'the button is busy while saving');
    assert.ok(
      SAVE_BUTTON.indexOf('disabled={busy}') < SAVE_BUTTON.indexOf('aria-busy={saving}'),
      'aria-busy sits after disabled',
    );
  });

  it('keeps the handlers, classes, spinners and labels untouched', () => {
    for (const button of [DRAFT_BUTTON, SAVE_BUTTON]) {
      assert.ok(
        button.includes('className="btn btn-primary flex items-center gap-2 disabled:opacity-60"'),
        'the button classes stay',
      );
    }
    assert.ok(
      page.includes('{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}'),
      'the draft spinner/label icon stays driven by busy',
    );
    assert.ok(
      page.includes('{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}'),
      'the save spinner/label icon stays driven by busy',
    );
    assert.equal(count(page, /Draft with Claude/g), 1, 'the draft label stays');
    assert.equal(count(page, /Save what I kept/g), 1, 'the save label stays');
  });
});

describe('curriculum import: two dedicated markers separate the actions', () => {
  it('declares drafting and saving right after busy', () => {
    const busyIdx = page.indexOf('const [busy, setBusy] = useState(false);');
    const draftingIdx = page.indexOf('const [drafting, setDrafting] = useState(false);');
    const savingIdx = page.indexOf('const [saving, setSaving] = useState(false);');
    assert.ok(busyIdx > 0, 'busy is declared');
    assert.ok(draftingIdx > busyIdx, 'drafting is declared after busy');
    assert.ok(savingIdx > draftingIdx, 'saving is declared after drafting');
    assert.equal(count(page, /const \[drafting, setDrafting\] = useState\(false\);/g), 1, 'only one drafting marker');
    assert.equal(count(page, /const \[saving, setSaving\] = useState\(false\);/g), 1, 'only one saving marker');
  });

  it('sets and clears the markers around busy in the existing flows', () => {
    const draft = draftBlock();
    assert.ok(draft.indexOf('setBusy(true);') < draft.indexOf('setDrafting(true);'), 'drafting starts right after busy');
    assert.ok(draft.includes('finally'), 'the draft finally block stays');
    assert.ok(
      draft.indexOf('setBusy(false);') < draft.indexOf('setDrafting(false);') &&
        draft.includes('setDrafting(false);'),
      'drafting clears right after busy in finally',
    );
    assert.ok(draft.includes('if (busy) return;'), 'the draft guard stays');

    const save = saveBlock();
    assert.ok(save.indexOf('setBusy(true);') < save.indexOf('setSaving(true);'), 'saving starts right after busy');
    assert.ok(save.includes('finally'), 'the save finally block stays');
    assert.ok(
      save.indexOf('setBusy(false);') < save.indexOf('setSaving(false);') &&
        save.includes('setSaving(false);'),
      'saving clears right after busy in finally',
    );
    assert.ok(save.includes('if (!plan || busy) return;'), 'the save guard stays');
  });
});

describe('curriculum import: one dedicated status line speaks per action', () => {
  it('adds exactly one live status each with the pending copy', () => {
    assert.ok(
      page.includes("<p role=\"status\" aria-live=\"polite\" className=\"sr-only\">\n                {drafting ? 'Drafting your curriculum…' : ''}\n              </p>"),
      'the drafting status line is rendered',
    );
    assert.ok(
      page.includes("<p role=\"status\" aria-live=\"polite\" className=\"sr-only\">\n                {saving ? 'Saving what you kept…' : ''}\n              </p>"),
      'the saving status line is rendered',
    );
    assert.equal(count(page, /Drafting your curriculum…/g), 1, 'only the status carries the drafting copy');
    assert.equal(count(page, /Saving what you kept…/g), 1, 'only the status carries the saving copy');
    assert.equal(count(page, /className="sr-only"/g), 2, 'only the two new statuses are sr-only');
  });

  it('places the drafting status as the last child of the form, after its button', () => {
    const status = page.indexOf("{drafting ? 'Drafting your curriculum…' : ''}");
    const draftButton = page.indexOf('<button type="submit"');
    const formClose = page.indexOf('</form>');
    assert.ok(draftButton > 0, 'the draft button is present');
    assert.ok(draftButton < status, 'the status comes after the draft button');
    assert.ok(status < formClose, 'the status comes before the form closes');
    const between = page.slice(status, formClose);
    assert.equal(count(between, /<button/g), 0, 'no button is rendered after the status');
  });

  it('places the saving status as the last child of the review section, after its button', () => {
    const status = page.indexOf("{saving ? 'Saving what you kept…' : ''}");
    const saveButton = page.indexOf('<button type="button" onClick={() => void save()}');
    const sectionClose = page.indexOf('</section>');
    assert.ok(saveButton > 0, 'the save button is present');
    assert.ok(saveButton < status, 'the status comes after the save button');
    assert.ok(status < sectionClose, 'the status comes before the section closes');
    const between = page.slice(status, sectionClose);
    assert.equal(count(between, /<button/g), 0, 'no button is rendered after the status');
    assert.ok(page.includes('data-testid="curriculum-draft"'), 'the review section keeps its test id');
    assert.ok(page.includes('aria-label="Review the draft"'), 'the review section keeps its label');
  });

  it('keeps the result notice and the error alert untouched', () => {
    assert.ok(
      page.includes(
        `<p role="status" aria-live="polite" className={notice ? 'mb-4 text-sm text-emerald-700 dark:text-emerald-400' : 'sr-only'}>`,
      ),
      'the result notice keeps its conditional classes',
    );
    assert.ok(page.includes('<p role="alert"'), 'the error alert stays');
    assert.equal(count(page, /aria-busy=/g), 2, 'only the two buttons are busy');
    assert.equal(
      count(page, /aria-live=/g),
      3,
      'the notice and the two new statuses are live',
    );
    assert.equal(count(page, /role="status"/g), 3, 'the notice and the two new statuses');
    assert.equal(count(page, /role="alert"/g), 1, 'the single error alert stays');
  });

  it('adds no extra labels or atomic regions', () => {
    assert.equal(count(page, /aria-label=/g), 1, 'only the review section keeps its label');
    assert.equal(count(page, /aria-labelledby=/g), 0, 'no aria-labelledby was added');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
  });
});

describe('curriculum import: the rest of the page stays intact', () => {
  it('keeps the draft and save flows intact', () => {
    const draft = draftBlock();
    assert.ok(draft.includes('/^sk-ant-[A-Za-z0-9_-]{20,300}$/'), 'the key validation stays');
    assert.ok(draft.includes('if (!subject.trim()) return setError'), 'the subject validation stays');
    assert.ok(draft.includes('text.trim().length < 20 && !pdf'), 'the text/PDF validation stays');
    assert.ok(draft.includes('setPlan(null);'), 'the plan reset stays');
    assert.ok(draft.includes('setNotice(null);'), 'the notice reset stays');
    assert.ok(
      draft.includes(
        'await draftCurriculumWithAI({ data: { subject, text, apiKey: apiKey.trim(), pdfBase64: pdf?.base64 } });',
      ),
      'the draft call stays',
    );
    assert.ok(draft.includes('setKeepConcepts(new Set(result.concepts.filter((c) => !c.exists).map((c) => c.conceptId)));'), 'the concept preselection stays');
    assert.ok(draft.includes('setKeepEdges(new Set(result.edges.map(edgeKey)));'), 'the edge preselection stays');

    const save = saveBlock();
    assert.ok(save.includes('const keptIds = new Set(['), 'the kept ids stay');
    assert.ok(save.includes('keptIds.has(e.from) && keptIds.has(e.to)'), 'both edge ends must stay');
    assert.ok(save.includes('await applyCurriculumDraft({ data: { subject, proposed: strip(plan), kept: strip(kept) } });'), 'the apply call stays');
    assert.ok(save.includes('setNotice(`Saved ${result.concepts} concepts and ${result.edges} prerequisites to “${subject}”.`);'), 'the save notice stays');
    assert.ok(save.includes('await loadAi();'), 'the settings reload stays');
  });

  it('keeps the surrounding page intact', () => {
    assert.ok(page.includes('const pickFile = async (file: File | undefined) =>'), 'the file picker stays');
    assert.ok(page.includes('const toggleAi = async (enabled: boolean) =>'), 'the settings toggle stays');
    assert.ok(page.includes('const loadAi = useCallback'), 'the settings loader stays');
    assert.ok(page.includes('data-testid="ai-drafts-setting"'), 'the settings block keeps its test id');
    assert.ok(page.includes("onChange={(e) => setKeepConcepts((s) => toggle(s, c.conceptId, e.target.checked))}"), 'the concept checkboxes stay');
    assert.ok(page.includes("onChange={(ev) => setKeepEdges((s) => toggle(s, edgeKey(e), ev.target.checked))}"), 'the edge checkboxes stay');
    assert.ok(page.includes('<h1 className="text-3xl font-bold text-foreground">Curriculum Import</h1>'), 'the heading stays');
    assert.ok(page.includes('const KEY_STORAGE ='), 'the stored key constant stays');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false, 'no new data path');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Drafting your curriculum'), false, `${file} gained the copy`);
      assert.equal(other.includes('Saving what you kept'), false, `${file} gained the copy`);
    }
  });
});
