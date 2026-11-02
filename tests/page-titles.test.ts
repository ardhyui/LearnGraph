/**
 * Every page has its own browser-tab title (WCAG 2.4.2), taken from the menu
 * label, and in-app navigation is announced to screen readers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NAV_SECTIONS } from '../src/lib/navigation.ts';
import {
  APP_NAME,
  ERROR_TITLE,
  NOT_FOUND_TITLE,
  PAGE_LABELS,
  navigationAnnouncement,
  pageHead,
  pageTitle,
  titleForPath,
} from '../src/lib/page-titles.ts';

function routeFiles(dir = 'src/routes'): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(p);
    return /\.tsx$/.test(e.name) && e.name !== '__root.tsx' ? [p] : [];
  });
}

describe('page titles', () => {
  it('formats "Label · LearnGraph" and falls back to the app name', () => {
    assert.equal(pageTitle('Gap Analysis'), 'Gap Analysis · LearnGraph');
    assert.equal(pageTitle(''), APP_NAME);
    assert.equal(pageTitle(null), APP_NAME);
    assert.equal(pageTitle('  My\n Profile '), 'My Profile · LearnGraph');
  });

  it('uses the sidebar label for every menu page', () => {
    for (const item of NAV_SECTIONS.flatMap((s) => s.items)) {
      assert.equal(titleForPath(item.href), `${item.label} · LearnGraph`);
    }
    assert.equal(titleForPath('/sign-in'), 'Sign in · LearnGraph');
    assert.equal(titleForPath('/gaps/'), 'Gap Analysis · LearnGraph');
  });

  it('gives every page a different title', () => {
    const titles = Object.keys(PAGE_LABELS).map(titleForPath);
    assert.equal(new Set(titles).size, titles.length);
    assert.ok(!titles.includes(NOT_FOUND_TITLE) && !titles.includes(ERROR_TITLE));
  });

  it('ignores unknown and prototype paths', () => {
    for (const p of ['/nope', 'constructor', '/constructor', '__proto__', '']) {
      assert.equal(titleForPath(p), APP_NAME, p);
    }
  });

  it('is wired into the head of every page route', () => {
    const files = routeFiles();
    assert.ok(files.length >= 18);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const m = src.match(/createFileRoute\('([^']+)'\)/);
      assert.ok(m, `${file} has no route`);
      assert.ok(src.includes(`head: () => pageHead('${m[1]}')`), `${file} sets no page title`);
      assert.ok(Object.hasOwn(PAGE_LABELS, m[1]), `${m[1]} has no title label`);
    }
    assert.deepEqual(pageHead('/profile'), { meta: [{ title: 'My Profile · LearnGraph' }] });
  });

  it('announces the new page after navigation', () => {
    assert.equal(navigationAnnouncement('/recommendations'), 'Recommendations · LearnGraph');
  });
});
