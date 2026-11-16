/**
 * Focus order after the quiz on the lesson page (`/learn/$conceptId`).
 *
 * Static guards only (node:test, no PGlite or DOM): closing the quiz unmounts
 * the focused Done button, so `finishQuiz` must move focus to the live-region
 * notice afterwards — while cancel keeps returning to the quiz button and no
 * other handler (mount effects, learner/concept changes, `load()`, self
 * reports) steals focus. No server function, RPC or migration may be added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'learn.$conceptId.tsx');

const source = (file: string) => readFileSync(file, 'utf8');

describe('lesson quiz focus: the notice becomes the focus target', () => {
  it('declares noticeRef and attaches it to the live-region paragraph', () => {
    const page = source(PAGE_FILE);
    assert.ok(page.includes('const noticeRef = useRef<HTMLParagraphElement>(null);'));
    const statusTag = page.match(/<p\b[^>]*\bref=\{noticeRef\}[^>]*>/)?.[0] ?? '';
    assert.ok(statusTag.length > 0, 'the status paragraph carries ref={noticeRef}');
    assert.ok(statusTag.includes('role="status"'), 'role="status" is unchanged');
    assert.ok(statusTag.includes('aria-live="polite"'), 'aria-live="polite" is unchanged');
    assert.ok(statusTag.includes('tabIndex={-1}'), 'the notice is programmatically focusable');
    assert.ok(statusTag.includes('focus:outline-none'), 'programmatic focus shows no ring');
    assert.ok(
      statusTag.includes('text-sm text-emerald-700 dark:text-emerald-400'),
      'colour classes are unchanged',
    );
    assert.ok(statusTag.includes("notice && 'mt-4'"), 'spacing behaviour is unchanged');
    // Position: still directly inside the article, above the goals card.
    const article = page.indexOf('<article aria-labelledby="lesson-title"');
    const status = page.indexOf('ref={noticeRef}');
    const goals = page.indexOf('<section aria-labelledby="goals-heading"');
    assert.ok(article > 0 && status > article && goals > status, 'the notice keeps its place');
    // Text source is unchanged.
    const noticeTag = page.match(/<p\b[^>]*\bref=\{noticeRef\}[^>]*>\s*\{notice\}\s*<\/p>/);
    assert.ok(noticeTag, 'the paragraph still renders {notice}');
  });

  it('finishQuiz focuses the notice inside requestAnimationFrame after load()', () => {
    const page = source(PAGE_FILE);
    const body = page.slice(page.indexOf('const finishQuiz'), page.indexOf('const cancelQuiz'));
    assert.ok(body.includes('setQuizOpen(false);'));
    assert.ok(body.includes('setNotice(quizResultNotice(result));'));
    assert.ok(body.includes('await load();'));
    assert.ok(body.includes('requestAnimationFrame(() => noticeRef.current?.focus());'));
    assert.ok(
      body.indexOf('await load();') < body.indexOf('requestAnimationFrame'),
      'focus moves only after the refreshed lesson is committed',
    );
    // Both a passed and a failed quiz go through the same handler.
    assert.ok(page.includes('onFinished={(r) => void finishQuiz(r)}'));
  });

  it('cancelQuiz still returns focus to the quiz button', () => {
    const page = source(PAGE_FILE);
    const body = page.slice(page.indexOf('const cancelQuiz'), page.indexOf('const toggleSolution'));
    assert.ok(body.includes('setQuizOpen(false);'));
    assert.ok(body.includes('requestAnimationFrame(() => quizButtonRef.current?.focus());'));
    assert.ok(page.includes('ref={quizButtonRef}'), 'the quiz button keeps its ref');
  });

  it('steals focus nowhere else: exactly two focus() calls, two rAFs', () => {
    const page = source(PAGE_FILE);
    assert.equal((page.match(/\.focus\(\)/g) ?? []).length, 2, 'only finishQuiz and cancelQuiz focus');
    assert.equal((page.match(/requestAnimationFrame/g) ?? []).length, 2, 'no extra deferred focus');
    const mount = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('const chooseFormat'));
    assert.equal(/\.focus\(\)/.test(mount), false, 'mount effects never move focus');
    const selfReport = page.slice(page.indexOf('const selfReport'), page.indexOf('const finishQuiz'));
    assert.equal(/\.focus\(\)|requestAnimationFrame/.test(selfReport), false, 'self reports keep relying on the live region');
    const chooseFormat = page.slice(page.indexOf('const chooseFormat'), page.indexOf('const selfReport'));
    assert.equal(/\.focus\(\)|requestAnimationFrame/.test(chooseFormat), false, 'format changes never move focus');
  });

  it('adds no server function, RPC or migration for the focus change', () => {
    const page = source(PAGE_FILE);
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    const migrations = source(join(ROOT, 'src', 'lib', 'migrations.ts'));
    const schemas = source(join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts'));
    for (const pattern of [/noticeRef/, /quizButtonRef/]) {
      assert.equal(pattern.test(migrations), false, `migrations should not mention ${pattern}`);
      assert.equal(pattern.test(schemas), false, `rpc schemas should not mention ${pattern}`);
    }
  });
});
