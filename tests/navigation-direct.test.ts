/**
 * Direct unit tests for the navigation data & helpers `src/lib/navigation.ts`.
 *
 * The module was only covered by `tests/navigation.test.ts` (63 lines, kept
 * intact): five broad assertions that the menu is routed and partitioned. This
 * file imports the module directly (node:test, no PGlite or DOM) and locks the
 * full menu as data — sections, the exact 22 hrefs, labels, descriptions and
 * icons, the Indonesian Japanese entry (D2) — plus the router-matching rule of
 * `isNavItemActive` (trailing slash included), the open/closed logic of the
 * collapsible groups, the storage key, every malformed-input branch of
 * `parseNavOpenState`, and the wiring of Sidebar/page-titles to the module.
 * The module is not changed here: the tests pin its current behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  NAV_SECTIONS,
  NAV_STORAGE_KEY,
  isNavItemActive,
  isSectionOpen,
  parseNavOpenState,
  sectionHasActive,
  type NavSection,
} from '../src/lib/navigation.ts';

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const NAVIGATION_FILE = join(SRC_DIR, 'lib', 'navigation.ts');
const SIDEBAR_FILE = join(SRC_DIR, 'components', 'Sidebar.tsx');
const PAGE_TITLES_FILE = join(SRC_DIR, 'lib', 'page-titles.ts');
const OLD_NAV_TEST = join(import.meta.dirname, 'navigation.test.ts');

const section = (id: NavSection['id']) => NAV_SECTIONS.find((s) => s.id === id)!;

/** The `NavIcon` union, as an explicit copy of its 20 values. */
const NAV_ICONS = [
  'home',
  'sparkles',
  'alert',
  'network',
  'user',
  'hexagon',
  'layers',
  'graduation',
  'info',
  'users',
  'brain',
  'book',
  'branch',
  'chart',
  'database',
  'activity',
  'test',
  'quiz',
  'lesson',
  'wand',
] as const;

/** Every `.ts`/`.tsx` file under `src/`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('NAV_SECTIONS — the menu as data', () => {
  it('keeps exactly four sections, in order, with their titles and collapsible flags', () => {
    assert.deepEqual(
      NAV_SECTIONS.map((s) => [s.id, s.title, s.collapsible]),
      [
        ['learn', 'Learn', false],
        ['explore', 'Explore', false],
        ['manage', 'Manage data', true],
        ['developer', 'Developer tools', true],
      ],
    );
  });

  it('lists exactly 22 unique hrefs, grouped 7/4/9/2, in a fixed order', () => {
    // An explicit copy of the whole menu: adding, moving or renaming a page
    // shows up here as a diff.
    assert.deepEqual(
      NAV_SECTIONS.map((s) => s.items.map((i) => i.href)),
      [
        ['/', '/japanese', '/recommendations', '/gaps', '/progress', '/graph', '/profile'],
        ['/domains', '/combined-graph', '/edu-psychology', '/about'],
        [
          '/admin/learners',
          '/admin/psychometrics',
          '/admin/concepts',
          '/admin/prerequisites',
          '/admin/curriculum',
          '/admin/content',
          '/admin/questions',
          '/admin/states',
          '/data-entry',
        ],
        ['/status', '/tests'],
      ],
    );
    const flat = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    assert.equal(flat.length, 22);
    assert.equal(new Set(flat).size, flat.length, 'every page is listed once');
    assert.deepEqual(
      NAV_SECTIONS.map((s) => s.items.length),
      [7, 4, 9, 2],
    );
  });

  it('gives every item a trimmed, non-empty label and description and one of the 20 icons', () => {
    assert.equal(new Set(NAV_ICONS).size, 20);
    for (const s of NAV_SECTIONS) {
      for (const item of s.items) {
        assert.ok(item.label.length > 0 && item.label === item.label.trim(), `${s.id}: label`);
        assert.ok(
          item.description.length > 0 && item.description === item.description.trim(),
          `${s.id} ${item.href}: description`,
        );
        assert.ok(
          (NAV_ICONS as readonly string[]).includes(item.icon),
          `${s.id} ${item.href}: unknown icon ${item.icon}`,
        );
      }
    }
  });

  it('keeps the Japanese page Indonesian inside the learner menu (D2)', () => {
    const japanese = section('learn').items.find((i) => i.href === '/japanese');
    assert.ok(japanese, '/japanese lives in the Learn group');
    assert.equal(japanese.label, 'Bahasa Jepang');
    assert.equal(japanese.description, 'Jalur N5 sampai N1 dan latihan');
  });

  it('keeps admin and debug pages partitioned, with the dashboard first', () => {
    const learner = [...section('learn').items, ...section('explore').items].map((i) => i.href);
    assert.ok(
      learner.every(
        (h) => !h.startsWith('/admin') && h !== '/tests' && h !== '/status' && h !== '/data-entry',
      ),
    );
    assert.ok(
      section('manage').items.every((i) => i.href.startsWith('/admin') || i.href === '/data-entry'),
    );
    assert.deepEqual(
      section('developer')
        .items.map((i) => i.href)
        .sort(),
      ['/status', '/tests'],
    );
    assert.equal(NAV_SECTIONS[0].id, 'learn');
    assert.equal(NAV_SECTIONS[0].items[0].href, '/');
  });
});

describe('isNavItemActive', () => {
  it('treats "/" as exact only', () => {
    assert.equal(isNavItemActive('/', '/'), true);
    assert.equal(isNavItemActive('/', '/gaps'), false);
    assert.equal(isNavItemActive('/', '//'), false);
  });

  it('matches other hrefs exactly or by full segment — a trailing slash counts, a longer word does not', () => {
    assert.equal(isNavItemActive('/graph', '/graph'), true);
    assert.equal(isNavItemActive('/graph', '/graph/x'), true);
    assert.equal(isNavItemActive('/graph', '/graphs'), false, 'prefix of another word');
    // Probed behaviour: "/graph/" satisfies the `${href}/` prefix, so the
    // trailing slash is active — the menu stays highlighted on such paths.
    assert.equal(isNavItemActive('/graph', '/graph/'), true);
    assert.equal(isNavItemActive('/gaps', '/gaps/'), true);
    assert.equal(isNavItemActive('/admin/learners', '/admin/learners'), true);
    assert.equal(isNavItemActive('/admin/learners', '/admin/learners/x'), true);
  });
});

describe('sectionHasActive', () => {
  it('reports which section holds the current page', () => {
    assert.equal(sectionHasActive(section('learn'), '/'), true);
    assert.equal(sectionHasActive(section('learn'), '/graph'), true);
    assert.equal(sectionHasActive(section('explore'), '/about'), true);
    assert.equal(sectionHasActive(section('explore'), '/'), false);
    assert.equal(sectionHasActive(section('manage'), '/admin/concepts'), true);
    assert.equal(sectionHasActive(section('manage'), '/data-entry'), true);
    assert.equal(sectionHasActive(section('manage'), '/'), false);
    assert.equal(sectionHasActive(section('developer'), '/status'), true);
    assert.equal(sectionHasActive(section('developer'), '/tests'), true);
    assert.equal(sectionHasActive(section('developer'), '/admin/concepts'), false);
  });
});

describe('isSectionOpen', () => {
  it('never closes the fixed sections, whatever the saved choice says', () => {
    // "Learn"/"Explore" are not collapsible: even a saved `false` (which
    // parseNavOpenState would never produce) cannot close them.
    assert.equal(isSectionOpen(section('learn'), '/tests', { learn: false }), true);
    assert.equal(isSectionOpen(section('explore'), '/admin/concepts', { explore: false }), true);
  });

  it('keeps a collapsible section open on its own pages, and follows the saved choice elsewhere', () => {
    // The group holding the current page cannot be hidden.
    assert.equal(isSectionOpen(section('manage'), '/admin/states', { manage: false }), true);
    assert.equal(isSectionOpen(section('developer'), '/status', { developer: false }), true);
    // Elsewhere the saved choice decides; a missing key means closed (`?? false`).
    assert.equal(isSectionOpen(section('manage'), '/', { manage: true }), true);
    assert.equal(isSectionOpen(section('manage'), '/', { manage: false }), false);
    assert.equal(isSectionOpen(section('manage'), '/', {}), false);
    assert.equal(isSectionOpen(section('manage'), '/', { manage: undefined }), false);
    // Keys are independent: opening "Manage data" does not open "Developer tools".
    assert.equal(
      isSectionOpen(section('developer'), '/', { developer: false, manage: true }),
      false,
    );
  });
});

describe('parseNavOpenState', () => {
  it('uses one storage key, and returns an empty choice for absent, empty and non-object JSON', () => {
    assert.equal(NAV_STORAGE_KEY, 'learngraph:nav-open');
    for (const raw of [
      null,
      undefined,
      '',
      'not json',
      '[true]',
      'null',
      '42',
      '"x"',
      'true',
      '{}',
    ]) {
      assert.deepEqual(parseNavOpenState(raw), {}, JSON.stringify(raw));
    }
  });

  it('keeps only booleans for the collapsible sections, dropping bad keys and values one by one', () => {
    assert.deepEqual(parseNavOpenState('{"manage":true,"developer":false}'), {
      manage: true,
      developer: false,
    });
    // Saved booleans for the fixed sections are ignored — only the collapsible
    // ids are ever read back.
    assert.deepEqual(
      parseNavOpenState('{"learn":true,"explore":false,"manage":true,"developer":false}'),
      { manage: true, developer: false },
    );
    assert.deepEqual(parseNavOpenState('{"learn":true,"explore":true}'), {});
    assert.deepEqual(parseNavOpenState('{"x":true,"y":false}'), {});
    // A bad value drops only its own key, not the whole saved choice.
    assert.deepEqual(parseNavOpenState('{"manage":"yes","developer":true}'), { developer: true });
    assert.deepEqual(parseNavOpenState('{"manage":1,"developer":null}'), {});
    // Probed behaviour: JSON parsing keeps the last duplicate key.
    assert.deepEqual(parseNavOpenState('{"manage":true,"manage":false}'), { manage: false });
  });
});

describe('source guards', () => {
  it('keeps navigation.ts import-free and exporting exactly the six helpers plus four types', () => {
    const source = readFileSync(NAVIGATION_FILE, 'utf8');
    assert.deepEqual(source.match(/^\s*import\b.*$/gm) ?? [], []);
    assert.doesNotMatch(source, /\brequire\s*\(/);
    const exports = [...source.matchAll(/^export (?:type|interface|const|function) (\w+)/gm)].map(
      (match) => match[1],
    );
    assert.deepEqual(exports, [
      'NavIcon',
      'NavItem',
      'NavSection',
      'NAV_SECTIONS',
      'isNavItemActive',
      'sectionHasActive',
      'NavOpenState',
      'isSectionOpen',
      'NAV_STORAGE_KEY',
      'parseNavOpenState',
    ]);
  });

  it('keeps Sidebar.tsx and page-titles.ts wired to the module', () => {
    const sidebar = readFileSync(SIDEBAR_FILE, 'utf8');
    const navImport = sidebar.match(/import\s*\{[^}]*\}\s*from\s*'@\/lib\/navigation';/)?.[0] ?? '';
    for (const name of [
      'NAV_SECTIONS',
      'NAV_STORAGE_KEY',
      'isNavItemActive',
      'isSectionOpen',
      'parseNavOpenState',
      'sectionHasActive',
    ]) {
      assert.ok(navImport.includes(name), `Sidebar import lost ${name}`);
    }
    assert.ok(sidebar.includes('window.localStorage.getItem(NAV_STORAGE_KEY)'));
    assert.ok(
      sidebar.includes('window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next))'),
    );
    assert.ok(sidebar.includes('isSectionOpen(section, pathname, savedOpen)'));
    const titles = readFileSync(PAGE_TITLES_FILE, 'utf8');
    assert.ok(titles.includes("import { NAV_SECTIONS } from './navigation.ts';"));
    assert.ok(
      titles.includes('NAV_SECTIONS.flatMap((s) => s.items.map((i) => [i.href, i.label]))'),
      'page labels no longer built from the menu',
    );
  });

  it('does not copy item descriptions elsewhere, and keeps the old navigation test intact', () => {
    // Fully-quoted literals, probed to be unique to navigation.ts (other
    // descriptions collide with legitimate matches in routes/dashboard).
    const descriptions = [
      "'Your plan for today'",
      "'What to learn next'",
      "'Draft a course with AI'",
      "'Run engine checks'",
      "'Quick add forms'",
    ];
    for (const file of sourceFiles(SRC_DIR)) {
      if (file === NAVIGATION_FILE) continue;
      const source = readFileSync(file, 'utf8');
      for (const literal of descriptions) {
        assert.ok(!source.includes(literal), `${relative(SRC_DIR, file)}: ${literal}`);
      }
    }
    const oldNav = readFileSync(OLD_NAV_TEST, 'utf8');
    for (const title of [
      'lists every page once, each backed by a route file',
      'keeps admin and debug pages out of the learner groups',
      'marks the active page like the router does',
      'collapsible groups start closed, open on their own pages, and follow the saved choice',
      'ignores malformed saved state',
    ]) {
      assert.ok(oldNav.includes(`'${title}'`), `old test lost: ${title}`);
    }
    assert.equal(oldNav.trimEnd().split('\n').length, 63);
  });
});
