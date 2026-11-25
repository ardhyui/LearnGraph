/**
 * Practice saving is announced (`/japanese`).
 *
 * The "Catat praktik" form calls `recordJapanesePractice`. While it saves the
 * submit button only faded through the shared `busy` flag (`disabled` +
 * `disabled:opacity-50`) and carried no `aria-busy`, and no live region spoke,
 * so a screen reader could not tell the practice was being saved and the button
 * looked frozen.
 *
 * This file locks `aria-busy={savingPractice}` right after `disabled={busy}` on
 * the "Simpan praktik" button with its class and label untouched, a separate
 * `savingPractice` flag set inside `run` with `try/finally` without changing the
 * global `busy` meaning, a new `sr-only` polite `role="status"` line after the
 * button and before `</form>` that says `Menyimpan praktik…` while saving and
 * clears when idle, the untouched notice/error/form fields/`run`/`refresh`/
 * `begin`, and that no server function, RPC schema or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'japanese.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The practice form, from its `<form>` to its closing `</form>`. */
const formStart = page.indexOf('Catat praktik: {data.modules.find');
assert.ok(formStart > 0, 'the practice form is rendered');
const formOpen = page.indexOf('<form', formStart);
const formEnd = page.indexOf('</form>', formOpen) + '</form>'.length;
const form = page.slice(formOpen, formEnd);
assert.ok(form.includes('Simpan praktik'), 'the form holds the submit button');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string, text: string = form) => {
  const labelIdx = text.lastIndexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = text.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(
    text.slice(open, labelIdx).includes('</button>'),
    false,
    `the "${label}" label is inside its button`,
  );
  return text.slice(open, labelIdx);
};

const SAVE = buttonOf('Simpan praktik');

describe('/japanese: the practice submit button announces it is busy', () => {
  it('adds aria-busy={savingPractice} right after disabled={busy}', () => {
    assert.ok(SAVE.includes("className={button + ' mt-3'}"), 'the button classes stay');
    assert.ok(SAVE.includes('disabled={busy}'), 'disabled stays driven by the shared busy flag');
    assert.ok(SAVE.includes('aria-busy={savingPractice}'), 'aria-busy is driven by savingPractice');
    assert.ok(
      SAVE.indexOf('disabled={busy}') < SAVE.indexOf('aria-busy={savingPractice}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(page, /aria-busy=/g), 1, 'one aria-busy on the page');
  });

  it('keeps the label untouched and adds a separate saving state', () => {
    assert.equal(count(form, /Simpan praktik/g), 1, 'the label stays once');
    assert.ok(
      page.includes('const [savingPractice, setSavingPractice] = useState(false);'),
      'savingPractice starts false',
    );
    assert.ok(
      page.indexOf("const [note, setNote] = useState('');") <
        page.indexOf('const [savingPractice, setSavingPractice] = useState(false);'),
      'savingPractice is declared after the note state',
    );
    assert.ok(page.includes('const [busy, setBusy] = useState(false);'), 'busy stays');
  });
});

describe('/japanese: one polite status line after the button', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the saving line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(page, /aria-live="polite"/g), 1, 'one polite live region on the page');
    assert.equal(count(form, /role="status"/g), 1, 'one saving status line in the form');
  });

  it('says Menyimpan praktik… while saving and clears when idle', () => {
    assert.ok(
      form.includes("{savingPractice ? 'Menyimpan praktik…' : ''}"),
      'the status text follows savingPractice',
    );
    assert.equal(count(page, /Menyimpan praktik…/g), 1, 'the status copy appears once');
  });

  it('sits after the button as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the saving line is present');
    const buttonClose = form.indexOf('</button>', form.indexOf('Simpan praktik'));
    assert.ok(statusStart > buttonClose, 'the status line follows the button');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the form',
    );
  });
});

describe('/japanese: the submit flow stays intact', () => {
  it('sets and clears savingPractice around the save inside run', () => {
    const runStart = form.indexOf('void run(async () => {');
    assert.ok(runStart > 0, 'the form still submits through run');
    const runBlock = form.slice(runStart);
    const setTrue = runBlock.indexOf('setSavingPractice(true);');
    const call = runBlock.indexOf('await recordJapanesePractice(');
    const notice = runBlock.indexOf("setNotice('Praktik tersimpan.');");
    const reset = runBlock.indexOf("setPractice('');");
    const refresh = runBlock.indexOf('await refresh();');
    const setFalse = runBlock.indexOf('setSavingPractice(false);');
    assert.ok(setTrue > 0, 'savingPractice starts before the call');
    assert.ok(setTrue < call, 'the flag starts before the request');
    assert.ok(call < notice && notice < reset && reset < refresh, 'the existing order is unchanged');
    assert.ok(runBlock.includes('try {'), 'the flag is wrapped in try');
    assert.ok(runBlock.includes('} finally {'), 'the flag clears in finally');
    assert.ok(setFalse > refresh, 'savingPractice clears after the refresh');
    assert.ok(
      runBlock.includes(
        'await recordJapanesePractice({ data: { concept: practice, minutes, note } });',
      ),
      'the practice call stays',
    );
  });

  it('keeps run, refresh, begin and the 30 second refresh', () => {
    assert.ok(page.includes('async function run(action: () => Promise<void>) {'), 'run stays');
    assert.ok(page.includes('setBusy(true);'), 'run still sets the shared busy flag');
    assert.ok(page.includes("setError('');"), 'run still clears the error');
    assert.ok(page.includes('} finally {\n      setBusy(false);'), 'run still clears busy');
    assert.ok(page.includes('async function refresh() {'), 'refresh stays');
    assert.ok(page.includes('function begin(id: string) {'), 'begin stays');
    assert.ok(page.includes('}, 30000);'), 'the 30 second interval stays');
  });

  it('keeps the notice, error and form fields', () => {
    assert.ok(page.includes('{error ? ('), 'the error block stays');
    assert.ok(page.includes('<div role="alert"'), 'the error keeps role alert');
    assert.ok(page.includes('Menit belajar nyata'), 'the minutes label stays');
    assert.ok(page.includes('Bukti dan catatan'), 'the note label stays');
    assert.ok(page.includes('maxLength={2000}'), 'the note limit stays');
    assert.ok(page.includes('Coba lagi'), 'the retry copy stays');
  });

  it('leaves the other buttons without aria-busy', () => {
    assert.equal(count(page, /aria-label=/g), 3, 'the two list labels and the level group only');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Menyimpan praktik'), false, `${file} gained the status copy`);
      assert.equal(other.includes('savingPractice'), false, `${file} gained busy wiring`);
    }
  });
});
