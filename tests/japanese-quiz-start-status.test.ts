/**
 * Starting the suggested quiz is announced (`/japanese`).
 *
 * The "Mulai kuis yang disarankan" button calls `begin`, which runs
 * `startJapaneseQuiz`. While the quiz is prepared the button only faded through
 * the shared `busy` flag (`disabled` + `disabled:opacity-50`) and carried no
 * `aria-busy`, and no live region spoke, so a screen reader could not tell a
 * quiz was being prepared and the button looked frozen. `busy` is shared with
 * every other Japanese button, so starting a quiz gets its own flag.
 *
 * This file locks `aria-busy={startingQuiz}` right after `disabled={busy}` on
 * the "Mulai kuis yang disarankan" button with its class, handler and label
 * untouched, a separate `startingQuiz` flag set inside `begin` with
 * `try/finally` without changing the global `busy` meaning, a new `sr-only`
 * polite `role="status"` line after that button in the same action wrapper that
 * says `Menyiapkan kuis…` while starting and clears when idle, the untouched
 * "Perbarui progres" button, the module "Latihan kuis" buttons reusing the same
 * `startingQuiz`/`topic` pair, the earlier practice and grading statuses, the
 * result block, fieldset/radio answers, notice/error and
 * `run`/`refresh`/the 30 second interval, and that no server function, RPC
 * schema or migration was added.
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
assert.ok(actions.includes('Mulai kuis yang disarankan'), 'the wrapper holds the start button');

/** The `begin` helper, from its declaration to the next top-level statement. */
const beginStart = page.indexOf('function begin(id: string) {');
assert.ok(beginStart > 0, 'begin is rendered');
const beginEnd = page.indexOf('const next =', beginStart);
assert.ok(beginEnd > beginStart, 'begin ends before the next statement');
const begin = page.slice(beginStart, beginEnd);

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string, text: string = page) => {
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

const START = buttonOf('Mulai kuis yang disarankan', actions);

describe('/japanese: the suggested quiz button announces it is starting', () => {
  it('adds aria-busy={startingQuiz} right after disabled={busy}', () => {
    assert.ok(START.includes('className={button}'), 'the button classes stay');
    assert.ok(START.includes('disabled={busy}'), 'disabled stays driven by the shared busy flag');
    assert.ok(START.includes('onClick={() => begin(next.id)}'), 'the handler stays');
    assert.ok(START.includes('aria-busy={startingQuiz}'), 'aria-busy is driven by startingQuiz');
    assert.ok(
      START.indexOf('disabled={busy}') < START.indexOf('aria-busy={startingQuiz}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(actions, /aria-busy=/g), 2, 'start and refresh carry aria-busy');
  });

  it('keeps the label untouched and adds a separate starting state', () => {
    assert.equal(count(actions, /Mulai kuis yang disarankan/g), 1, 'the label stays once');
    assert.ok(
      page.includes('const [startingQuiz, setStartingQuiz] = useState(false);'),
      'startingQuiz starts false',
    );
    assert.ok(
      page.indexOf('const [gradingQuiz, setGradingQuiz] = useState(false);') <
        page.indexOf('const [startingQuiz, setStartingQuiz] = useState(false);'),
      'startingQuiz is declared after gradingQuiz',
    );
    assert.ok(page.includes('const [busy, setBusy] = useState(false);'), 'busy stays');
  });
});

describe('/japanese: one polite starting status line after the button', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      actions.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the starting line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(actions, /aria-live="polite"/g), 2, 'start and refresh live regions');
    assert.equal(count(actions, /role="status"/g), 2, 'start and refresh status lines');
  });

  it('says Menyiapkan kuis… while starting and clears when idle', () => {
    assert.ok(
      actions.includes("{startingQuiz ? 'Menyiapkan kuis…' : ''}"),
      'the status text follows startingQuiz',
    );
    assert.equal(count(page, /Menyiapkan kuis…/g), 1, 'the status copy appears once');
  });

  it('sits after the start button and before the Buka Michi link', () => {
    const statusStart = actions.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the starting line is present');
    const buttonClose = actions.indexOf('</button>', actions.indexOf('Mulai kuis yang disarankan'));
    const michi = actions.indexOf('Buka Michi');
    assert.ok(statusStart > buttonClose, 'the status line follows the start button');
    assert.ok(statusStart < michi, 'the status line stays before Buka Michi');
    const statusEnd = actions.indexOf('</p>', statusStart) + '</p>'.length;
    assert.ok(
      actions
        .slice(statusEnd, michi)
        .replace(/\s*\n\s*/g, '')
        .startsWith('<a'),
      'the Buka Michi link follows the status line',
    );
  });
});

describe('/japanese: the start flow stays intact', () => {
  it('sets and clears startingQuiz around the request inside begin', () => {
    const setTrue = begin.indexOf('setStartingQuiz(true);');
    const topic = begin.indexOf('setTopic(id);');
    const result = begin.indexOf('setResult(null);');
    const answers = begin.indexOf('setAnswers({});');
    const call = begin.indexOf('await startJapaneseQuiz(');
    const setFalse = begin.indexOf('setStartingQuiz(false);');
    assert.ok(setTrue > 0, 'startingQuiz is set');
    assert.ok(setTrue < topic, 'the flag starts before the state resets');
    assert.ok(
      topic < result && result < answers && answers < call,
      'the existing order is unchanged',
    );
    assert.ok(begin.includes('try {'), 'the flow is wrapped in try');
    assert.ok(begin.includes('} finally {'), 'the flag clears in finally');
    assert.ok(setFalse > call, 'startingQuiz clears after the request');
    assert.ok(
      begin.includes('setQuiz(await startJapaneseQuiz({ data: { concept: id } }));'),
      'the start call stays',
    );
  });

  it('does not route the new flag through the shared busy setter', () => {
    assert.equal(begin.includes('setBusy'), false, 'begin never touches busy directly');
    assert.ok(page.includes('setBusy(true);'), 'run still sets the shared busy flag');
    assert.ok(page.includes('} finally {\n      setBusy(false);'), 'run still clears busy');
  });

  it('keeps run, refresh and the 30 second refresh', () => {
    assert.ok(page.includes('async function run(action: () => Promise<void>) {'), 'run stays');
    assert.ok(page.includes("setError('');"), 'run still clears the error');
    assert.ok(page.includes('async function refresh() {'), 'refresh stays');
    assert.ok(page.includes('function begin(id: string) {'), 'begin stays');
    assert.ok(page.includes('}, 30000);'), 'the 30 second interval stays');
  });
});

describe('/japanese: other session buttons stay without aria-busy', () => {
  it('leaves Latihan kuis on the shared starting flag while Perbarui progres keeps its own', () => {
    const practice = buttonOf('Latihan kuis');
    assert.ok(practice.includes('disabled={busy}'), 'Latihan kuis keeps the shared disabled');
    assert.ok(
      practice.includes('aria-busy={startingQuiz && topic === m.id}'),
      'Latihan kuis is busy only for its own starting card',
    );
    const refresh = buttonOf('Perbarui progres');
    assert.ok(refresh.includes('disabled={busy}'), 'Perbarui progres keeps the shared disabled');
    assert.ok(refresh.includes('aria-busy={refreshing}'), 'Perbarui progres has its own flag');
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
    assert.ok(page.includes('Coba lagi'), 'the retry copy stays');
  });

  it('adds no extra labels, atomic regions or imports', () => {
    assert.equal(count(page, /aria-label=/g), 3, 'the two list labels and the level group only');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
    assert.equal(count(page, /startingQuiz/g), 4, 'state, two aria-busy and status only');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false, 'no new data path');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Menyiapkan kuis'), false, `${file} gained the status copy`);
      assert.equal(other.includes('startingQuiz'), false, `${file} gained busy wiring`);
    }
  });
});
