/**
 * Quiz grading is announced (`/japanese`).
 *
 * The quiz form calls `submitJapaneseQuiz`. While it grades, the submit button
 * only faded through the shared `busy` flag (`disabled` + `disabled:opacity-50`)
 * and carried no `aria-busy`, and no live region spoke, so a screen reader could
 * not tell the answers were being graded and the button looked frozen. `busy` is
 * shared with the other Japanese buttons, so grading gets its own flag.
 *
 * This file locks `aria-busy={gradingQuiz}` right after `disabled={busy ||
 * Object.keys(answers).length !== quiz.questions.length}` on the "Nilai
 * jawaban" button with its class and label untouched, a separate `gradingQuiz`
 * flag set inside `run` with `try/finally` without changing the global `busy`
 * meaning, a new `sr-only` polite `role="status"` line after the two-button
 * wrapper and before `</form>` that says `Menilai jawaban…` while grading and
 * clears when idle, the untouched "Tutup tanpa menilai" button, result block,
 * fieldset/radio answers, notice/error and `run`/`refresh`/`begin`, and that no
 * server function, RPC schema or migration was added.
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

/** The quiz form, from its `<form>` to its closing `</form>`. */
const quizStart = page.indexOf('Kuis: {data.modules.find');
assert.ok(quizStart > 0, 'the quiz section is rendered');
const formOpen = page.indexOf('<form', quizStart);
const formEnd = page.indexOf('</form>', formOpen) + '</form>'.length;
const form = page.slice(formOpen, formEnd);
assert.ok(form.includes('Nilai jawaban'), 'the quiz form holds the submit button');

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

const DISABLED =
  'disabled={busy || Object.keys(answers).length !== quiz.questions.length}';

describe('/japanese: the quiz submit button announces it is grading', () => {
  it('adds aria-busy={gradingQuiz} right after the answers-complete disabled guard', () => {
    const grade = buttonOf('Nilai jawaban');
    assert.ok(grade.includes('className={button}'), 'the button classes stay');
    assert.ok(grade.includes(DISABLED), 'disabled stays driven by busy and full answers');
    assert.ok(grade.includes('aria-busy={gradingQuiz}'), 'aria-busy is driven by gradingQuiz');
    assert.ok(
      grade.indexOf(DISABLED) < grade.indexOf('aria-busy={gradingQuiz}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(form, /aria-busy=/g), 1, 'one aria-busy in the quiz form');
  });

  it('keeps the label untouched and adds a separate grading state', () => {
    assert.equal(count(form, /Nilai jawaban/g), 1, 'the label stays once');
    assert.ok(
      page.includes('const [gradingQuiz, setGradingQuiz] = useState(false);'),
      'gradingQuiz starts false',
    );
    assert.ok(
      page.indexOf('const [savingPractice, setSavingPractice] = useState(false);') <
        page.indexOf('const [gradingQuiz, setGradingQuiz] = useState(false);'),
      'gradingQuiz is declared after savingPractice',
    );
    assert.ok(page.includes('const [busy, setBusy] = useState(false);'), 'busy stays');
  });
});

describe('/japanese: one polite grading status line after the buttons', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      form.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the grading line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(form, /role="status"/g), 1, 'one grading status line in the form');
  });

  it('says Menilai jawaban… while grading and clears when idle', () => {
    assert.ok(
      form.includes("{gradingQuiz ? 'Menilai jawaban…' : ''}"),
      'the status text follows gradingQuiz',
    );
    assert.equal(count(page, /Menilai jawaban…/g), 1, 'the status copy appears once');
  });

  it('sits after the two-button wrapper as the last child of the form', () => {
    const statusStart = form.indexOf('<p role="status" aria-live="polite"');
    assert.ok(statusStart > 0, 'the grading line is present');
    const wrapperClose = form.indexOf('</div>', form.indexOf('Tutup tanpa menilai'));
    assert.ok(statusStart > wrapperClose, 'the status line follows the button wrapper');
    const statusEnd = form.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      form.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</form>',
      'the status line is the last child of the form',
    );
  });
});

describe('/japanese: the quiz submit flow stays intact', () => {
  it('sets and clears gradingQuiz around the grading inside run', () => {
    const runStart = form.indexOf('void run(async () => {');
    assert.ok(runStart > 0, 'the form still submits through run');
    const runBlock = form.slice(runStart);
    const setTrue = runBlock.indexOf('setGradingQuiz(true);');
    const call = runBlock.indexOf('await submitJapaneseQuiz(');
    const refresh = runBlock.indexOf('await refresh();');
    const setFalse = runBlock.indexOf('setGradingQuiz(false);');
    assert.ok(setTrue > 0, 'gradingQuiz is set');
    assert.ok(setTrue < call, 'the flag starts before the request');
    assert.ok(call < refresh, 'the existing call/refresh order is unchanged');
    assert.ok(runBlock.includes('try {'), 'the flag is wrapped in try');
    assert.ok(runBlock.includes('} finally {'), 'the flag clears in finally');
    assert.ok(setFalse > refresh, 'gradingQuiz clears after the refresh');
    assert.ok(
      runBlock.includes('setResult(await submitJapaneseQuiz({ data: { id: quiz.id, answers } }));'),
      'the grading call stays',
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

  it('leaves Tutup tanpa menilai without aria-busy', () => {
    const close = buttonOf('Tutup tanpa menilai');
    assert.ok(close.includes('type="button"'), 'the dismiss button stays a plain button');
    assert.ok(close.includes('className={outline}'), 'the dismiss classes stay');
    assert.ok(close.includes('onClick={() => setQuiz(null)}'), 'the dismiss handler stays');
    assert.equal(close.includes('aria-busy'), false, 'the dismiss button has no aria-busy');
  });

  it('keeps the result block, answer fields, notice and error', () => {
    assert.ok(page.includes('<p role="status" className="my-4 text-xl font-semibold">'), 'result stays a status');
    assert.ok(page.includes('Hasil: {result.correct}/{result.total}'), 'the result copy stays');
    assert.ok(page.includes('<fieldset key={q.id} className="my-5">'), 'answers stay fieldsets');
    assert.ok(page.includes('type="radio"'), 'answers stay radios');
    assert.ok(page.includes('required'), 'answers stay required');
    assert.ok(page.includes('{notice ? ('), 'the notice block stays');
    assert.ok(page.includes('{error ? ('), 'the error block stays');
    assert.ok(page.includes('<div role="alert"'), 'the error keeps role alert');
    assert.ok(page.includes('Coba lagi'), 'the retry copy stays');
  });

  it('adds no extra labels, atomic regions or server wiring', () => {
    assert.equal(count(page, /aria-label=/g), 3, 'the two list labels and the level group only');
    assert.equal(count(page, /aria-atomic=/g), 0, 'no aria-atomic was added');
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false, 'no new data path');
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Menilai jawaban'), false, `${file} gained the status copy`);
      assert.equal(other.includes('gradingQuiz'), false, `${file} gained busy wiring`);
    }
  });
});
