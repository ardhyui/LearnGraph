/**
 * Refreshing the Japanese dashboard is announced (`/japanese`).
 *
 * The "Perbarui progres" button in the "Sesi hari ini · 90 menit" card calls
 * `refresh` through `run`. While the dashboard reloaded the button only faded
 * through the shared `busy` flag (`disabled` + `disabled:opacity-50`) and had no
 * `aria-busy`, and no live region spoke, so a screen reader could not tell the
 * progress was being reloaded and the button looked frozen. `busy` is shared
 * with every other Japanese button, so reloading gets its own flag.
 *
 * This file locks `aria-busy={refreshing}` right after `disabled={busy}` on the
 * "Perbarui progres" button with its class, handler and label untouched, a
 * separate `refreshing` flag set around `await refresh()` with `try/finally`
 * without changing the global `busy` meaning or `refresh` itself, a new
 * `sr-only` polite `role="status"` line after that button in the same action
 * wrapper that says `Memuat ulang progres…` while reloading and clears when
 * idle, the untouched "Mulai kuis yang disarankan" (`startingQuiz`), "Perbarui
 * progres" (`refreshing`), "Catat praktik", "Simpan praktik" and "Nilai
 * jawaban" buttons, the module "Latihan kuis" buttons reusing the same
 * `startingQuiz`/`topic` pair, the "Coba lagi" retry, the earlier
 * practice/grading/starting statuses, the result
 * block, fieldset/radio answers, notice/error and `run`/`refresh`/the 30 second
 * interval, and that no server function, RPC schema or migration was added.
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

/** The session card's action wrapper, from its `<div>` to its closing `</div>`. */
const SESSION_ACTIONS_OPEN = '<div className="mt-4 flex flex-wrap gap-3">';
const sessionStart = page.indexOf(SESSION_ACTIONS_OPEN);
assert.ok(sessionStart > 0, 'the session action wrapper is rendered');
const sessionEnd =
  page.indexOf('</div>', sessionStart + SESSION_ACTIONS_OPEN.length) + '</div>'.length;
const actions = page.slice(sessionStart, sessionEnd);
assert.ok(actions.includes('Perbarui progres'), 'the wrapper holds the refresh button');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string, text: string = page, last = true) => {
  const labelIdx = last ? text.lastIndexOf(label) : text.indexOf(label);
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

const REFRESH = buttonOf('Perbarui progres', actions);

describe('/japanese: the refresh button announces it is reloading', () => {
  it('adds aria-busy={refreshing} right after disabled={busy}', () => {
    assert.ok(REFRESH.includes('className={outline}'), 'the button classes stay');
    assert.ok(REFRESH.includes('disabled={busy}'), 'disabled stays driven by the shared busy flag');
    assert.ok(REFRESH.includes('aria-busy={refreshing}'), 'aria-busy is driven by refreshing');
    assert.ok(
      REFRESH.indexOf('disabled={busy}') < REFRESH.indexOf('aria-busy={refreshing}'),
      'aria-busy sits right after disabled',
    );
    assert.ok(
      REFRESH.includes('void run(async () => {'),
      'the handler still runs through the shared helper',
    );
    assert.ok(REFRESH.includes('await refresh();'), 'the handler still reloads the dashboard');
  });

  it('keeps the label untouched and adds a separate refreshing state', () => {
    assert.equal(count(actions, /Perbarui progres/g), 1, 'the label stays once');
    assert.ok(
      page.includes('const [refreshing, setRefreshing] = useState(false);'),
      'refreshing starts false',
    );
    assert.ok(
      page.indexOf('const [startingQuiz, setStartingQuiz] = useState(false);') <
        page.indexOf('const [refreshing, setRefreshing] = useState(false);'),
      'refreshing is declared after startingQuiz',
    );
    assert.ok(page.includes('const [busy, setBusy] = useState(false);'), 'busy stays');
  });
});

describe('/japanese: one polite reload status line after the button', () => {
  it('adds exactly one sr-only polite status line', () => {
    const refreshIdx = actions.indexOf('Perbarui progres');
    const after = actions.slice(refreshIdx);
    assert.ok(
      after.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the reload line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(actions, /aria-live="polite"/g), 2, 'start and refresh live regions');
    assert.equal(count(actions, /role="status"/g), 2, 'start and refresh status lines');
  });

  it('says Memuat ulang progres… while reloading and clears when idle', () => {
    assert.ok(
      actions.includes("{refreshing ? 'Memuat ulang progres…' : ''}"),
      'the status text follows refreshing',
    );
    assert.equal(count(page, /Memuat ulang progres…/g), 1, 'the status copy appears once');
  });

  it('sits after the refresh button as the last child of the action wrapper', () => {
    const refreshIdx = actions.indexOf('Perbarui progres');
    const statusStart = actions.indexOf('<p role="status" aria-live="polite"', refreshIdx);
    assert.ok(statusStart > 0, 'the reload line is present');
    const buttonClose = actions.indexOf('</button>', refreshIdx);
    assert.ok(statusStart > buttonClose, 'the status line follows the refresh button');
    const statusEnd = actions.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      actions.slice(statusEnd, sessionEnd - sessionStart).trim(),
      '</div>',
      'the status line is the last child before the wrapper closes',
    );
  });
});

describe('/japanese: the reload flow stays intact', () => {
  it('sets and clears refreshing around the request inside the handler', () => {
    const setTrue = REFRESH.indexOf('setRefreshing(true);');
    const call = REFRESH.indexOf('await refresh();');
    const setFalse = REFRESH.indexOf('setRefreshing(false);');
    assert.ok(setTrue > 0, 'refreshing is set');
    assert.ok(call > setTrue, 'the reload runs after the flag starts');
    assert.ok(REFRESH.includes('try {'), 'the reload is wrapped in try');
    assert.ok(REFRESH.includes('} finally {'), 'the flag clears in finally');
    assert.ok(setFalse > call, 'refreshing clears after the reload');
  });

  it('does not route the new flag through the shared busy setter', () => {
    assert.equal(REFRESH.includes('setBusy'), false, 'the handler never touches busy directly');
    assert.ok(page.includes('setBusy(true);'), 'run still sets the shared busy flag');
    assert.ok(page.includes('} finally {\n      setBusy(false);'), 'run still clears busy');
  });

  it('keeps run, refresh and the 30 second refresh', () => {
    assert.ok(page.includes('async function run(action: () => Promise<void>) {'), 'run stays');
    assert.ok(page.includes("setError('');"), 'run still clears the error');
    assert.ok(page.includes('async function refresh() {'), 'refresh stays');
    assert.ok(page.includes('setData(await japaneseDashboard());'), 'refresh still loads data');
    assert.ok(page.includes('}, 30000);'), 'the 30 second interval stays');
  });

  it('keeps the other refresh callers untouched', () => {
    assert.equal(count(page, /await refresh\(\);/g), 3, 'initial effect, grading and practice');
    assert.ok(page.includes('void refresh().catch((e) => setError(String(e)));'), 'effect stays');
    assert.ok(page.includes('void refresh().catch(() => {});'), 'interval stays quiet');
  });
});

describe('/japanese: other buttons keep their own state', () => {
  it('keeps the retry, quiz start and practice buttons as they were', () => {
    const retry = buttonOf('Coba lagi');
    assert.ok(retry.includes('onClick={() => void run(refresh)}'), 'the retry still reloads');
    assert.equal(retry.includes('aria-busy'), false, 'the retry has no aria-busy');
    const start = buttonOf('Mulai kuis yang disarankan');
    assert.ok(start.includes('aria-busy={startingQuiz}'), 'the start keeps its own flag');
    const practice = buttonOf('Latihan kuis');
    assert.ok(
      practice.includes('aria-busy={startingQuiz && topic === m.id}'),
      'Latihan kuis is busy only for its own starting card',
    );
    const logPractice = buttonOf('Catat praktik', page, false);
    assert.equal(logPractice.includes('aria-busy'), false, 'Catat praktik has no aria-busy');
    assert.ok(
      buttonOf('Simpan praktik').includes('aria-busy={savingPractice}'),
      'Simpan praktik keeps its flag',
    );
    assert.ok(
      buttonOf('Nilai jawaban').includes('aria-busy={gradingQuiz}'),
      'Nilai jawaban keeps its flag',
    );
    assert.equal(
      count(page, /aria-busy=/g),
      5,
      'start, refresh, module quiz, saving practice and grading only',
    );
  });

  it('keeps the earlier statuses and result block', () => {
    assert.ok(
      page.includes("{savingPractice ? 'Menyimpan praktik…' : ''}"),
      'practice saving status stays',
    );
    assert.ok(
      page.includes("{gradingQuiz ? 'Menilai jawaban…' : ''}"),
      'quiz grading status stays',
    );
    assert.ok(page.includes("{startingQuiz ? 'Menyiapkan kuis…' : ''}"), 'quiz start status stays');
    assert.ok(
      page.includes('<p role="status" className="my-4 text-xl font-semibold">'),
      'result stays a status',
    );
    assert.ok(page.includes('Hasil: {result.correct}/{result.total}'), 'the result copy stays');
  });

  it('keeps the answer fields, notice and error', () => {
    assert.ok(page.includes('<fieldset key={q.id} className="my-5">'), 'answers stay fieldsets');
    assert.ok(page.includes('type="radio"'), 'answers stay radios');
    assert.ok(page.includes('{notice ? ('), 'the notice block stays');
    assert.ok(page.includes('{error ? ('), 'the error block stays');
    assert.ok(page.includes('<div role="alert"'), 'the error keeps role alert');
    assert.equal(count(page, /Memuat ulang progres…/g), 1, 'only one reload status');
  });

  it('adds no extra labels, atomic regions or imports', () => {
    assert.equal(count(page, /aria-label=/g), 3, 'the two list labels and the level group only');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
    assert.equal(count(page, /refreshing/g), 3, 'state, aria-busy and status only');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false, 'no new data path');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Memuat ulang progres'), false, `${file} gained the status copy`);
      assert.equal(other.includes('refreshing'), false, `${file} gained busy wiring`);
    }
  });
});
