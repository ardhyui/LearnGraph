/**
 * Focus after moving between concepts (`/learn/$conceptId`).
 *
 * "Builds on" and "Next:" navigate to another concept. The lesson is cleared
 * while it loads, so the article and the focused link unmount and focus used
 * to fall back to `<body>`; keyboard and screen-reader users had to Tab from
 * the top again. These static guards keep the title targetable and the move
 * wired only to a real concept change; the Playwright smoke check exercises
 * the real browser behaviour. No PGlite or DOM is needed.
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
const FOCUS_TEST_FILE = join(ROOT, 'tests', 'lesson-focus.test.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const between = (text: string, start: string, end: string) => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing marker: ${start}`);
  assert.ok(to > from, `missing end marker: ${end}`);
  return text.slice(from, to);
};

describe('lesson navigation focus wiring (static)', () => {
  it('declares a ref for the lesson title and remembers the concept already shown', () => {
    const page = source(PAGE_FILE);
    assert.match(page, /const lessonTitleRef = useRef<HTMLHeadingElement>\(null\);/);
    // Initialised on mount, not null: the first load must not steal focus.
    assert.match(page, /const titleConceptId = useRef\(conceptId\);/);
    assert.equal((page.match(/titleConceptId\.current/g) ?? []).length, 2, 'read once, written once');
  });

  it('keeps the existing heading and only adds the focus contract', () => {
    const page = source(PAGE_FILE);
    const heading = between(page, '<h1\n                  id="lesson-title"', '</h1>');
    assert.ok(heading.includes('id="lesson-title"'), 'the heading id is unchanged');
    assert.ok(heading.includes('ref={lessonTitleRef}'), 'the heading carries the ref');
    assert.ok(heading.includes('tabIndex={-1}'), 'the heading is programmatically focusable');
    assert.ok(heading.includes('focus:outline-none'), 'focus adds no visible ring');
    assert.ok(
      heading.includes('className="mt-1 text-3xl font-bold text-foreground focus:outline-none"'),
      'text, size, colour and position classes are unchanged',
    );
    assert.ok(heading.includes('{lesson.concept.name}'), 'the heading text is unchanged');
    assert.ok(page.includes('<article aria-labelledby="lesson-title" data-testid="lesson">'), 'the article is unchanged');
  });

  it('moves focus only when a different concept has actually loaded', () => {
    const page = source(PAGE_FILE);
    const effect = between(page, '// Following "Builds on" or "Next:"', '}, [lesson, conceptId]);');
    assert.ok(
      effect.includes('if (!lesson || lesson.concept.conceptId !== conceptId) return;'),
      'waits for the lesson of the requested concept (never the stale one or a quiz reload)',
    );
    assert.ok(
      effect.includes('if (titleConceptId.current === conceptId) return;'),
      'skips the first load, learner changes and quiz reloads',
    );
    const updated = effect.indexOf('titleConceptId.current = conceptId;');
    const frame = effect.indexOf('requestAnimationFrame(');
    const focus = effect.indexOf('lessonTitleRef.current?.focus()');
    assert.ok(updated >= 0, 'the shown concept is remembered');
    assert.ok(frame > updated, 'focus moves after the new concept is recorded');
    assert.ok(focus > frame, 'focus moves inside the animation frame');
    assert.equal((effect.match(/\.focus\(\)/g) ?? []).length, 1);
  });

  it('leaves the quiz focus moves exactly as they were', () => {
    const page = source(PAGE_FILE);
    const finishQuiz = between(page, 'const finishQuiz = async', 'const cancelQuiz =');
    assert.ok(finishQuiz.includes('requestAnimationFrame(() => noticeRef.current?.focus());'));
    const cancelQuiz = between(page, 'const cancelQuiz =', 'const toggleSolution =');
    assert.ok(cancelQuiz.includes('requestAnimationFrame(() => quizButtonRef.current?.focus());'));
    const selfReport = between(page, 'const selfReport =', 'const finishQuiz =');
    assert.equal(selfReport.includes('.focus()'), false, 'self-reports do not steal focus');
    // Three moves: quiz result, quiz cancel, and the new lesson title.
    assert.equal((page.match(/\.focus\(\)/g) ?? []).length, 3);
    // The older guard is aware of the new move instead of silently loosening it.
    assert.ok(source(FOCUS_TEST_FILE).includes(`.focus\\(\\)/g) ?? []).length, 3`), 'the quiz guard counts the new move');
  });

  it('adds no server function, RPC or migration for the focus move', () => {
    const page = source(PAGE_FILE);
    assert.equal(page.includes('createServerFn'), false);
    assert.equal(page.includes('graphCall'), false);
    const migrations = source(MIGRATIONS_FILE);
    const schemas = source(SCHEMAS_FILE);
    for (const pattern of [/lessonTitleRef/, /titleConceptId/, /lesson title focus/]) {
      assert.equal(pattern.test(migrations), false, `migrations should not mention ${pattern}`);
      assert.equal(pattern.test(schemas), false, `rpc schemas should not mention ${pattern}`);
    }
  });

  it('lets the Playwright smoke check prove focus lands on the new title after "Next:"', () => {
    const smoke = source(SMOKE_FILE);
    const nextStep = smoke.indexOf('const nextStep =');
    const checkIndex = smoke.indexOf('lesson: following "Next:" moves focus to the new lesson title');
    assert.ok(nextStep >= 0, 'the lesson flow still checks the next step');
    assert.ok(checkIndex > nextStep, 'the focus check follows the lesson flow');
    const block = between(
      smoke,
      '// Following "Next:" replaces the lesson; focus must land on the new title',
      'const newErrors = errors.slice(before);',
    );
    assert.ok(block.includes('nextLink.click()'));
    assert.ok(block.includes("document.activeElement?.id === 'lesson-title'"));
    assert.ok(block.includes("nextFocus.tag === 'H1'"));
    assert.ok(block.includes('nextFocus.text === nextName'));
  });
});
