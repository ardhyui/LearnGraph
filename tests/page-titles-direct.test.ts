/**
 * Direct unit tests for browser-tab titles `src/lib/page-titles.ts` —
 * `APP_NAME`, `PAGE_LABELS`, `pageTitle`, `titleForPath`, `pageHead`,
 * `NOT_FOUND_TITLE`, `ERROR_TITLE` and `navigationAnnouncement`.
 *
 * The module was already covered through route wiring in
 * `tests/page-titles.test.ts` (kept intact): it checks that every route sets a
 * title and that a menu label is reused, but not the label table itself or the
 * formatting branches. This file imports the module directly (node:test, no
 * PGlite or DOM) and pins the exact page labels (menu pages first, then the
 * five off-menu pages), the "Label · LearnGraph" formatter, path lookup
 * (trailing slashes, query strings, parameter routes, prototype keys), and the
 * static wiring into `RouteAnnouncer`. The module is not changed here: the
 * tests pin its current behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const PAGE_TITLES_FILE = join(SRC_DIR, 'lib', 'page-titles.ts');
const ROUTE_ANNOUNCER_FILE = join(SRC_DIR, 'components', 'RouteAnnouncer.tsx');
const GAPS_ROUTE_FILE = join(SRC_DIR, 'routes', 'gaps.tsx');
const OLD_TEST_FILE = join(import.meta.dirname, 'page-titles.test.ts');

/** The 22 menu pages in sidebar order, then the five pages outside the menu. */
const EXPECTED_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/japanese': 'Bahasa Jepang',
  '/recommendations': 'Recommendations',
  '/gaps': 'Gap Analysis',
  '/progress': 'Progress',
  '/graph': 'Knowledge Graph',
  '/profile': 'My Profile',
  '/domains': 'Domain Graph',
  '/combined-graph': 'Combined View',
  '/edu-psychology': 'Edu Psychology',
  '/about': 'About LearnGraph',
  '/admin/learners': 'Learners',
  '/admin/psychometrics': 'Psychometrics',
  '/admin/concepts': 'Concepts',
  '/admin/prerequisites': 'Prerequisites',
  '/admin/curriculum': 'Curriculum Import',
  '/admin/content': 'Lesson Content',
  '/admin/questions': 'Quiz Questions',
  '/admin/states': 'Knowledge States',
  '/data-entry': 'Data Entry',
  '/status': 'System Status',
  '/tests': 'Functional Tests',
  '/sign-in': 'Sign in',
  '/privacy': 'Privacy',
  '/forgot-password': 'Forgot password',
  '/reset-password': 'Reset password',
  '/learn/$conceptId': 'Lesson',
};

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('page title constants', () => {
  it('names the app and the two error pages', () => {
    assert.equal(APP_NAME, 'LearnGraph');
    assert.equal(NOT_FOUND_TITLE, 'Page not found · LearnGraph');
    assert.equal(ERROR_TITLE, 'Something went wrong · LearnGraph');
  });

  it('labels exactly the 22 menu pages, then the five off-menu pages', () => {
    // Probe note: the module builds 22 menu hrefs + 5 extras = 27 keys, in that
    // order; a draft spec said 25, the code has 27.
    const menuKeys = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    assert.equal(menuKeys.length, 22);
    assert.deepEqual(Object.keys(PAGE_LABELS), [
      ...menuKeys,
      '/sign-in',
      '/privacy',
      '/forgot-password',
      '/reset-password',
      '/learn/$conceptId',
    ]);
    assert.deepEqual(PAGE_LABELS, EXPECTED_LABELS);
    assert.equal(Object.keys(PAGE_LABELS).length, 27);
  });

  it('freezes the label table and keeps every label non-empty and trimmed', () => {
    assert.ok(Object.isFrozen(PAGE_LABELS));
    for (const [href, label] of Object.entries(PAGE_LABELS)) {
      assert.equal(typeof label, 'string', href);
      assert.ok(label.length > 0, href);
      assert.equal(label.trim(), label, href);
    }
  });

  it('reuses the sidebar label for every menu page', () => {
    for (const item of NAV_SECTIONS.flatMap((s) => s.items)) {
      assert.equal(PAGE_LABELS[item.href], item.label, item.href);
    }
    assert.equal(PAGE_LABELS['/'], 'Dashboard');
    assert.equal(PAGE_LABELS['/japanese'], 'Bahasa Jepang');
    assert.equal(PAGE_LABELS['/learn/$conceptId'], 'Lesson');
  });
});

describe('pageTitle', () => {
  it('appends the app name to a label', () => {
    assert.equal(pageTitle('Gap Analysis'), 'Gap Analysis · LearnGraph');
  });

  it('falls back to the app name without a usable label', () => {
    for (const label of ['', '   ', '\t\n', null, undefined]) {
      assert.equal(pageTitle(label), 'LearnGraph', JSON.stringify(label));
    }
  });

  it('collapses every run of whitespace and trims the ends', () => {
    assert.equal(pageTitle('  My\n Profile '), 'My Profile · LearnGraph');
    assert.equal(pageTitle('A\tB'), 'A B · LearnGraph');
    assert.equal(pageTitle('A\u00a0B'), 'A B · LearnGraph');
    assert.equal(pageTitle('A\nB'), 'A B · LearnGraph');
    assert.equal(pageTitle('A \t \n B'), 'A B · LearnGraph');
  });

  it('keeps non-whitespace control characters (rough edge)', () => {
    assert.equal(pageTitle('A\u0000B\u202eC'), 'A\u0000B\u202eC · LearnGraph');
    assert.equal(pageTitle('\u0000'), '\u0000 · LearnGraph');
  });
});

describe('titleForPath', () => {
  it('looks up menu pages by path', () => {
    assert.equal(titleForPath('/'), 'Dashboard · LearnGraph');
    assert.equal(titleForPath('/gaps'), 'Gap Analysis · LearnGraph');
    assert.equal(titleForPath('/japanese'), 'Bahasa Jepang · LearnGraph');
    assert.equal(titleForPath('/admin/learners'), 'Learners · LearnGraph');
  });

  it('drops trailing slashes from any path longer than "/"', () => {
    assert.equal(titleForPath('/gaps/'), 'Gap Analysis · LearnGraph');
    assert.equal(titleForPath('/gaps//'), 'Gap Analysis · LearnGraph');
    assert.equal(titleForPath('/gaps///'), 'Gap Analysis · LearnGraph');
    assert.equal(titleForPath('/about//'), 'About LearnGraph · LearnGraph');
    assert.equal(titleForPath('/sign-in/'), 'Sign in · LearnGraph');
    // Rough edge: only slashes collapse to "", which is not a known label.
    assert.equal(titleForPath('//'), 'LearnGraph');
    assert.equal(titleForPath('///'), 'LearnGraph');
  });

  it('is exact: query, hash, case and missing slash fall back', () => {
    for (const p of ['/gaps?x=1', '/gaps#x', '/GAPS', 'gaps', '/gaps /']) {
      assert.equal(titleForPath(p), 'LearnGraph', p);
    }
  });

  it('maps a one-segment lesson parameter to the lesson label', () => {
    assert.equal(titleForPath('/learn/fractions'), 'Lesson · LearnGraph');
    assert.equal(titleForPath('/learn/$conceptId'), 'Lesson · LearnGraph');
    assert.equal(titleForPath('/learn/x/'), 'Lesson · LearnGraph');
    assert.equal(titleForPath('/learn/$conceptId/'), 'Lesson · LearnGraph');
    assert.equal(titleForPath('/learn/'), 'LearnGraph');
    assert.equal(titleForPath('/learn//'), 'LearnGraph');
    assert.equal(titleForPath('/learn/a/b'), 'LearnGraph');
  });

  it('ignores inherited and prototype names', () => {
    for (const p of [
      'toString',
      '/toString',
      '/hasOwnProperty',
      '__proto__',
      '/__proto__',
      'constructor',
      '/constructor',
      '',
    ]) {
      assert.equal(titleForPath(p), 'LearnGraph', p);
    }
  });
});

describe('pageHead and navigationAnnouncement', () => {
  it('returns the head meta for a known path', () => {
    assert.deepEqual(pageHead('/gaps'), { meta: [{ title: 'Gap Analysis · LearnGraph' }] });
    assert.deepEqual(pageHead('/profile'), { meta: [{ title: 'My Profile · LearnGraph' }] });
    assert.deepEqual(pageHead('/nope'), { meta: [{ title: 'LearnGraph' }] });
  });

  it('announces the title of the new page', () => {
    assert.equal(navigationAnnouncement('/gaps'), 'Gap Analysis · LearnGraph');
    assert.equal(navigationAnnouncement('/'), 'Dashboard · LearnGraph');
    assert.equal(navigationAnnouncement('/learn/x'), 'Lesson · LearnGraph');
    assert.equal(navigationAnnouncement('/nope'), 'LearnGraph');
  });
});

describe('page-titles wiring', () => {
  it('imports only the navigation data and exports the eight helpers in order', () => {
    const src = source(PAGE_TITLES_FILE);
    const imports = src.match(/^import .*$/gm) ?? [];
    assert.deepEqual(imports, ["import { NAV_SECTIONS } from './navigation.ts';"]);
    assert.ok(!src.includes('require('));

    const exported = [...src.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
    assert.deepEqual(exported, [
      'APP_NAME',
      'PAGE_LABELS',
      'pageTitle',
      'titleForPath',
      'pageHead',
      'NOT_FOUND_TITLE',
      'ERROR_TITLE',
      'navigationAnnouncement',
    ]);
  });

  it('feeds the route announcer and a page route head', () => {
    const announcer = source(ROUTE_ANNOUNCER_FILE);
    assert.ok(announcer.includes("import { navigationAnnouncement } from '@/lib/page-titles';"));
    assert.ok(announcer.includes('navigationAnnouncement(pathname)'));
    assert.ok(source(GAPS_ROUTE_FILE).includes("head: () => pageHead('/gaps')"));
  });

  it('leaves the broad route-wiring test intact', () => {
    const old = source(OLD_TEST_FILE);
    for (const title of [
      'formats "Label · LearnGraph" and falls back to the app name',
      'uses the sidebar label for every menu page',
      'gives every page a different title',
      'ignores unknown and prototype paths',
      'is wired into the head of every page route',
      'gives the crawlable sign-in page an Open Graph preview',
      'announces the new page after navigation',
    ]) {
      assert.ok(old.includes(title), title);
    }
    assert.equal(old.trimEnd().split('\n').length, 86);
  });
});
