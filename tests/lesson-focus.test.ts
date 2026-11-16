/**
 * Focus order after the lesson quiz (`/learn/$conceptId`).
 *
 * "Done" closes `ConceptQuiz` and fills the result notice, so the focused
 * button is unmounted and focus used to fall back to `<body>`. These static
 * guards keep the notice targetable and the move wired only to `finishQuiz`:
 * cancelling still returns to the quiz button, and nothing focuses on mount,
 * learner changes, `load()` or self-reports. No PGlite or DOM is needed; the
 * Playwright smoke check exercises the real browser behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'learn.$conceptId.tsx');
const SMOKE_FILE = join(ROOT, 'scripts', 'smoke.mjs');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const between = (text: string, start: string, end: string) => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing marker: ${start}`);
  assert.ok(to > from, `missing end marker: ${end}`);
  return text.slice(from, to);
};

describe('lesson quiz focus wiring (static)', () => {
  it('declares a ref for the status notice', () => {
    const page = source(PAGE_FILE);
    assert.match(page, /const noticeRef = useRef<HTMLParagraphElement>\(null\);/);
    assert.ok((page.match(/noticeRef/g) ?? []).length >= 3);
  });

  it('makes the existing status paragraph the focus target without changing its contract', () => {
    const page = source(PAGE_FILE);
    const notice = between(
      page,
      '<p\n                ref={noticeRef}',
      '{notice}\n              </p>',
    );
    assert.ok(notice.includes('ref={noticeRef}'), 'the status paragraph carries the ref');
    assert.ok(notice.includes('role="status"'), 'the live region role is unchanged');
    assert.ok(notice.includes('aria-live="polite"'), 'the polite live region is unchanged');
    assert.ok(notice.includes('tabIndex={-1}'), 'the paragraph is programmatically focusable');
    assert.ok(notice.includes('focus:outline-none'), 'focus adds no visible ring');
    assert.ok(
      notice.includes('text-sm text-emerald-700 dark:text-emerald-400'),
      'the colour classes are unchanged',
    );
    assert.ok(notice.includes("notice && 'mt-4'"), 'the spacing class is unchanged');
  });

  it('moves focus only after the quiz reload has finished', () => {
    const page = source(PAGE_FILE);
    const finishQuiz = between(page, 'const finishQuiz = async', 'const cancelQuiz =');
    const setNotice = finishQuiz.indexOf('setNotice(quizResultNotice(result));');
    const reload = finishQuiz.indexOf('await load();');
    const frame = finishQuiz.indexOf('requestAnimationFrame(');
    const focus = finishQuiz.indexOf('noticeRef.current?.focus()');
    assert.ok(setNotice >= 0, 'the notice is filled first');
    assert.ok(reload > setNotice, 'the page reloads after the notice is set');
    assert.ok(frame > reload, 'focus moves after the reload resolves');
    assert.ok(focus > frame, 'focus moves inside the animation frame');
    assert.equal((finishQuiz.match(/noticeRef\.current\?\.focus\(\)/g) ?? []).length, 1);
  });

  it('keeps cancelling on the quiz button and leaves every other flow alone', () => {
    const page = source(PAGE_FILE);
    const cancelQuiz = between(page, 'const cancelQuiz =', 'const toggleSolution =');
    assert.ok(
      cancelQuiz.includes('requestAnimationFrame(() => quizButtonRef.current?.focus());'),
      'cancel still returns to "Take the quick quiz"',
    );
    const selfReport = between(page, 'const selfReport =', 'const finishQuiz =');
    assert.equal(selfReport.includes('.focus()'), false, 'self-reports do not steal focus');
    const load = between(page, 'const load = useCallback', 'useEffect(() => {');
    assert.equal(load.includes('.focus()'), false, 'loading a lesson does not steal focus');
    // Exactly the two intended moves: cancel and finish.
    assert.equal((page.match(/\.focus\(\)/g) ?? []).length, 2);
  });

  it('adds no server function, RPC or migration for the focus move', () => {
    const page = source(PAGE_FILE);
    assert.equal(page.includes('createServerFn'), false);
    const migrations = source(MIGRATIONS_FILE);
    const schemas = source(SCHEMAS_FILE);
    for (const pattern of [/noticeRef/, /quiz result notice/]) {
      assert.equal(pattern.test(migrations), false, `migrations should not mention ${pattern}`);
      assert.equal(pattern.test(schemas), false, `rpc schemas should not mention ${pattern}`);
    }
  });

  it('lets the Playwright smoke check prove focus lands on the notice after Done', () => {
    const smoke = source(SMOKE_FILE);
    const close = smoke.indexOf('await closeQuiz(lesson);');
    const checkIndex = smoke.indexOf('lesson: focus moves to the quiz result notice after Done');
    assert.ok(close >= 0, 'the lesson flow still closes its quiz');
    assert.ok(checkIndex > close, 'the focus check runs after the lesson quiz is closed');
    const block = between(
      smoke,
      '// "Done" unmounts the quiz; focus must land on the result notice',
      'const nextStep =',
    );
    assert.ok(block.includes('document.activeElement'));
    assert.ok(block.includes('/passed/.test(focused.text)'));
    assert.ok(block.includes("focused.tag === 'P'"));
    assert.ok(block.includes("focused.role === 'status'"));
  });
});
