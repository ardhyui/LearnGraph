/**
 * Starting a module quiz is announced (`/japanese`).
 *
 * Every `m.mode === 'quiz'` card in the "Peta kemampuan" list has a "Latihan
 * kuis" button that calls `begin(m.id)`, which runs `startJapaneseQuiz`. While
 * the quiz is prepared the button only faded through the shared `busy` flag
 * (`disabled` + `disabled:opacity-50`) and carried no `aria-busy`, so a screen
 * reader could not tell the quiz was being prepared and the button looked
 * frozen. `busy` is shared with many Japanese buttons, so the module button
 * reuses the existing `startingQuiz`/`topic` pair: only the card whose quiz is
 * starting is busy.
 *
 * This file locks `aria-busy={startingQuiz && topic === m.id}` right after
 * `disabled={busy}` on the "Latihan kuis" button with its class, handler and
 * label untouched, no new state or live region (the existing "Menyiapkan
 * kuis…" status line already speaks), the untouched "Mulai kuis yang
 * disarankan" (`startingQuiz`), "Perbarui progres" (`refreshing`), "Catat
 * praktik", "Simpan praktik" and "Nilai jawaban" buttons, the earlier
 * practice/grading/starting statuses, the result block, fieldset/radio
 * answers, notice/error and `run`/`refresh`/`begin`/the 30 second interval,
 * and that no server function, RPC schema or migration was added.
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

/** The `Peta kemampuan` module list, from its `<ul>` to its closing `</ul>`. */
const MODULES_OPEN = '<ul aria-label={`Modul ${level}`} className="grid gap-3 sm:grid-cols-2">';
const blockAfter = (text: string, marker: string) => {
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing marker: ${marker}`);
  const end = text.indexOf('</ul>', start);
  assert.ok(end > start, `missing closing </ul> for ${marker}`);
  return text.slice(start, end + '</ul>'.length);
};
const modules = blockAfter(page, MODULES_OPEN);

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

const QUIZ = buttonOf('Latihan kuis', modules);

describe('/japanese: the module quiz button announces it is starting', () => {
  it('adds aria-busy={startingQuiz && topic === m.id} right after disabled={busy}', () => {
    assert.ok(QUIZ.includes('className={outline}'), 'the button classes stay');
    assert.ok(QUIZ.includes('disabled={busy}'), 'disabled stays driven by the shared busy flag');
    assert.ok(QUIZ.includes('onClick={() => begin(m.id)}'), 'the handler stays');
    assert.ok(
      QUIZ.includes('aria-busy={startingQuiz && topic === m.id}'),
      'only the card whose quiz is starting is busy',
    );
    assert.ok(
      QUIZ.indexOf('disabled={busy}') < QUIZ.indexOf('aria-busy={startingQuiz && topic === m.id}'),
      'aria-busy sits after disabled',
    );
  });

  it('keeps the label and adds no new state', () => {
    assert.equal(count(modules, /Latihan kuis/g), 1, 'the label stays once');
    assert.ok(page.includes('const [startingQuiz, setStartingQuiz] = useState(false);'), 'flag stays');
    assert.ok(page.includes("const [topic, setTopic] = useState('');"), 'topic stays');
    assert.equal(count(page, /startingQuiz/g), 4, 'state, two aria-busy and status only');
  });
});

describe('/japanese: one existing starting status line still speaks', () => {
  it('adds no live region or role to the module list', () => {
    assert.equal(count(modules, /aria-live=/g), 0, 'the module list adds no live region');
    assert.equal(count(modules, /role="/g), 0, 'the module list adds no role');
    assert.equal(count(page, /aria-live=/g), 4, 'practice, grading, start and refresh only');
    assert.equal(count(page, /role="/g), 9, 'alert, seven status and the level group only');
  });

  it('keeps the single Menyiapkan kuis… status line in the session card', () => {
    assert.ok(page.includes("{startingQuiz ? 'Menyiapkan kuis…' : ''}"), 'the status stays');
    assert.equal(count(page, /Menyiapkan kuis…/g), 1, 'the status copy appears once');
  });
});

describe('/japanese: the quiz start flow stays intact', () => {
  it('keeps begin and its try/finally', () => {
    assert.ok(page.includes('function begin(id: string) {'), 'begin stays');
    assert.ok(page.includes('setTopic(id);'), 'the topic is still set');
    assert.ok(page.includes('setResult(null);'), 'the result is still cleared');
    assert.ok(page.includes('setAnswers({});'), 'the answers are still cleared');
    assert.ok(
      page.includes('setQuiz(await startJapaneseQuiz({ data: { concept: id } }));'),
      'the start call stays',
    );
    assert.ok(page.includes('setStartingQuiz(true);'), 'the flag still starts');
    assert.ok(page.includes('setStartingQuiz(false);'), 'the flag still clears');
  });

  it('keeps the other buttons with their own state', () => {
    assert.ok(
      buttonOf('Mulai kuis yang disarankan').includes('aria-busy={startingQuiz}'),
      'the suggested quiz keeps its flag',
    );
    assert.ok(
      buttonOf('Perbarui progres').includes('aria-busy={refreshing}'),
      'the refresh keeps its flag',
    );
    assert.equal(
      buttonOf('Catat praktik', page, false).includes('aria-busy'),
      false,
      'Catat praktik has no aria-busy',
    );
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

  it('keeps the earlier statuses, result, answers, notice and error', () => {
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
    assert.ok(page.includes('<fieldset key={q.id} className="my-5">'), 'answers stay fieldsets');
    assert.ok(page.includes('type="radio"'), 'answers stay radios');
    assert.ok(page.includes('{notice ? ('), 'the notice block stays');
    assert.ok(page.includes('{error ? ('), 'the error block stays');
    assert.ok(page.includes('<div role="alert"'), 'the error keeps role alert');
    assert.ok(page.includes('Coba lagi'), 'the retry copy stays');
  });

  it('keeps run, refresh and the 30 second refresh', () => {
    assert.ok(page.includes('async function run(action: () => Promise<void>) {'), 'run stays');
    assert.ok(page.includes("setError('');"), 'run still clears the error');
    assert.ok(page.includes('async function refresh() {'), 'refresh stays');
    assert.ok(page.includes('setData(await japaneseDashboard());'), 'refresh still loads data');
    assert.ok(page.includes('}, 30000);'), 'the 30 second interval stays');
  });

  it('adds no extra labels, atomic regions or imports', () => {
    assert.equal(count(page, /aria-label=/g), 3, 'the two list labels and the level group only');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false, 'no new data path');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Latihan kuis'), false, `${file} gained the button copy`);
      assert.equal(other.includes('startingQuiz'), false, `${file} gained busy wiring`);
    }
  });
});
