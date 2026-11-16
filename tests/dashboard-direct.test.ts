/**
 * Direct unit tests for the dashboard greeting & shortcut data
 * `src/lib/dashboard.ts`.
 *
 * The module was only covered by `tests/dashboard.test.ts` (48 lines, kept
 * intact): five broad assertions that names resolve and that every link has a
 * route file. This file imports the module directly (node:test, no PGlite or
 * DOM) and locks the two link lists as data — the exact hrefs, labels and
 * descriptions in order, the learner/manage partition — plus every branch of
 * `greetingName`: first-word extraction, the email fallback, control/format
 * stripping before splitting (probed: a tab is a control char, so it is
 * deleted rather than treated as a word separator), and the 40-code-point cap
 * that never cuts an astral character in half. Source guards pin the module's
 * exports, the home route's wiring, and the uniqueness of the link copy.
 * The module is not changed here: the tests pin its current behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  LEARNER_SHORTCUTS,
  MANAGE_LINKS,
  dashboardHeading,
  greetingName,
} from '../src/lib/dashboard.ts';

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const DASHBOARD_FILE = join(SRC_DIR, 'lib', 'dashboard.ts');
const INDEX_FILE = join(SRC_DIR, 'routes', 'index.tsx');
const OLD_DASHBOARD_TEST = join(import.meta.dirname, 'dashboard.test.ts');

/** Every `.ts`/`.tsx` file under `src/`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('dashboard links as data', () => {
  it('keeps exactly four learner shortcuts, in order, with their labels and descriptions', () => {
    // An explicit copy of the whole list: adding, moving or rewording a card
    // shows up here as a diff.
    assert.deepEqual(LEARNER_SHORTCUTS, [
      {
        href: '/recommendations',
        label: 'Recommendations',
        description: 'More concepts you are ready to learn next',
      },
      {
        href: '/gaps',
        label: 'Gap Analysis',
        description: 'Find shaky foundations and what to review',
      },
      {
        href: '/graph',
        label: 'Knowledge Graph',
        description: 'See how concepts connect and where you are',
      },
      {
        href: '/profile',
        label: 'My Profile',
        description: 'Your subjects, progress and how you like to learn',
      },
    ]);
    assert.equal(LEARNER_SHORTCUTS.length, 4);
  });

  it('keeps exactly five manage links, in order, with their labels and descriptions', () => {
    assert.deepEqual(MANAGE_LINKS, [
      { href: '/admin/learners', label: 'Learners', description: 'Learner profiles' },
      { href: '/admin/concepts', label: 'Concepts', description: 'Concept nodes' },
      { href: '/admin/prerequisites', label: 'Prerequisites', description: 'Concept dependencies' },
      { href: '/admin/states', label: 'Knowledge States', description: 'Progress and mastery' },
      {
        href: '/data-entry',
        label: 'Data Entry Guide',
        description: 'How to structure your content',
      },
    ]);
    assert.equal(MANAGE_LINKS.length, 5);
  });

  it('gives every link a trimmed, non-empty label and description', () => {
    for (const l of [...LEARNER_SHORTCUTS, ...MANAGE_LINKS]) {
      assert.ok(l.label.length > 0 && l.label === l.label.trim(), `${l.href}: label`);
      assert.ok(
        l.description.length > 0 && l.description === l.description.trim(),
        `${l.href}: description`,
      );
    }
  });

  it('partitions learner pages from editor pages — nine unique hrefs in total', () => {
    assert.ok(
      LEARNER_SHORTCUTS.every((l) => !l.href.startsWith('/admin') && l.href !== '/data-entry'),
    );
    assert.ok(MANAGE_LINKS.every((l) => l.href.startsWith('/admin') || l.href === '/data-entry'));
    const all = [...LEARNER_SHORTCUTS, ...MANAGE_LINKS].map((l) => l.href);
    assert.equal(all.length, 9);
    assert.equal(new Set(all).size, all.length, 'every page is listed once');
  });
});

describe('greetingName', () => {
  it('takes the first word of the name, collapsing wild whitespace', () => {
    assert.equal(greetingName({ name: 'Sari Smoke' }), 'Sari');
    assert.equal(greetingName({ name: '  Muhammad   Lazuardi ' }), 'Muhammad');
    // An empty name field steps aside for the email; an empty email does not
    // disturb the name.
    assert.equal(greetingName({ name: null, email: 'ardhy.ui@example.test' }), 'ardhy.ui');
    assert.equal(greetingName({ name: 'Sari', email: '' }), 'Sari');
  });

  it('falls back to the email local-part, then to null when nothing usable is known', () => {
    assert.equal(greetingName({ name: '', email: 'ardhy.ui@example.test' }), 'ardhy.ui');
    // The part before "@" is used verbatim (plus-addressing included), and
    // whitespace around it is trimmed by the same word-collapse rule.
    assert.equal(greetingName({ email: 'first.last+tag@example.test' }), 'first.last+tag');
    assert.equal(greetingName({ email: '  ardhy.ui  @example.test' }), 'ardhy.ui');
    // No "@" at all: split()[0] keeps the whole string.
    assert.equal(greetingName({ email: 'no-at-mark' }), 'no-at-mark');
    assert.equal(greetingName(null), null);
    assert.equal(greetingName(undefined), null);
    assert.equal(greetingName({}), null);
    assert.equal(greetingName({ name: '', email: '' }), null);
  });

  it('strips control/format characters from the name before splitting — they never separate words', () => {
    // Cc/Cf characters are deleted first, so a name can gain or lose them
    // mid-word without changing the greeting.
    assert.equal(greetingName({ name: 'S\u0000a\u202eri Smoke' }), 'Sari');
    assert.equal(greetingName({ name: 'A\u200bri Budi' }), 'Ari', 'zero-width space (Cf)');
    // Probed behaviour: a tab is itself a Cc control character, so it is
    // deleted *before* split(/\s+/) runs — the words fuse instead of
    // splitting. Only a real space (Zs) separates first names.
    assert.equal(greetingName({ name: 'Sari\tSmoke' }), 'SariSmoke');
  });

  it('cleans the email local-part the same way, and skips an all-control name', () => {
    // A name made purely of control/format characters cleans to nothing, so
    // the greeting falls through to the email — which is cleaned too.
    assert.equal(greetingName({ name: '\u0007\u202e', email: 'bo\u0000b@x.test' }), 'bob');
    assert.equal(greetingName({ name: '\u0007', email: '\u202e@x.test' }), null);
  });

  it('caps the name at 40 code points, never cutting an astral character in half', () => {
    assert.equal(greetingName({ name: 'a'.repeat(40) }), 'a'.repeat(40));
    const long = greetingName({ name: 'a'.repeat(41) })!;
    assert.equal(long, 'a'.repeat(40) + '…');
    assert.equal(long.length, 41);
    // 39 a + two emoji is 41 code points: the cap keeps the first 40 (whole
    // emoji included) and appends the ellipsis — 41 code points, 42 UTF-16
    // units because the emoji is a surrogate pair.
    const emoji = greetingName({ name: 'a'.repeat(39) + '😀😀' })!;
    assert.equal(emoji, 'a'.repeat(39) + '😀…');
    assert.equal(Array.from(emoji).length, 41);
    assert.equal(emoji.length, 42);
    // Exactly 40 code points with an emoji at the boundary stays whole.
    assert.equal(greetingName({ name: 'a'.repeat(38) + '😀😀' }), 'a'.repeat(38) + '😀😀');
    assert.equal(greetingName({ name: 'a'.repeat(39) + '😀' }), 'a'.repeat(39) + '😀');
  });
});

describe('dashboardHeading', () => {
  it('greets by the resolved name, or stays neutral', () => {
    assert.equal(dashboardHeading({ name: 'Sari Smoke' }), 'Hi, Sari');
    assert.equal(dashboardHeading({ name: '  Muhammad   Lazuardi ' }), 'Hi, Muhammad');
    assert.equal(dashboardHeading({ email: 'ardhy.ui@example.test' }), 'Hi, ardhy.ui');
    assert.equal(dashboardHeading(null), 'Your learning today');
    assert.equal(dashboardHeading(undefined), 'Your learning today');
    assert.equal(dashboardHeading({}), 'Your learning today');
  });
});

describe('source guards', () => {
  it('keeps dashboard.ts import-free and exporting exactly the five members in order', () => {
    const source = readFileSync(DASHBOARD_FILE, 'utf8');
    assert.deepEqual(source.match(/^\s*import\b.*$/gm) ?? [], []);
    assert.doesNotMatch(source, /\brequire\s*\(/);
    const exports = [...source.matchAll(/^export (?:type|interface|const|function) (\w+)/gm)].map(
      (match) => match[1],
    );
    assert.deepEqual(exports, [
      'DashboardLink',
      'LEARNER_SHORTCUTS',
      'MANAGE_LINKS',
      'greetingName',
      'dashboardHeading',
    ]);
  });

  it('keeps the home route wired to the module', () => {
    const index = readFileSync(INDEX_FILE, 'utf8');
    const dashImport = index.match(/import\s*\{[^}]*\}\s*from\s*'@\/lib\/dashboard';/)?.[0] ?? '';
    for (const name of ['LEARNER_SHORTCUTS', 'MANAGE_LINKS', 'dashboardHeading']) {
      assert.ok(dashImport.includes(name), `index.tsx import lost ${name}`);
    }
    assert.ok(
      index.includes('{dashboardHeading(user)}'),
      'heading no longer rendered for the user',
    );
    assert.ok(
      index.includes('LEARNER_SHORTCUTS.map'),
      'learner shortcuts no longer rendered from data',
    );
    assert.ok(index.includes('MANAGE_LINKS.map'), 'manage links no longer rendered from data');
  });

  it('does not copy link descriptions elsewhere, and keeps the old dashboard test intact', () => {
    // Fully-quoted literals, probed to be unique to dashboard.ts (shorter
    // descriptions and the link labels collide with legitimate matches in
    // navigation.ts and routes).
    const descriptions = [
      "'More concepts you are ready to learn next'",
      "'Find shaky foundations and what to review'",
      "'See how concepts connect and where you are'",
      "'Your subjects, progress and how you like to learn'",
      "'Concept dependencies'",
      "'Progress and mastery'",
      "'How to structure your content'",
    ];
    for (const file of sourceFiles(SRC_DIR)) {
      if (file === DASHBOARD_FILE) continue;
      const source = readFileSync(file, 'utf8');
      for (const literal of descriptions) {
        assert.ok(!source.includes(literal), `${relative(SRC_DIR, file)}: ${literal}`);
      }
    }
    const oldDashboard = readFileSync(OLD_DASHBOARD_TEST, 'utf8');
    for (const title of [
      'uses the first name of the account',
      'falls back to the email, then to a neutral heading',
      'strips control/format characters and caps very long names',
      'learner shortcuts are learner pages only, each backed by a route',
      'manage links point at existing editor pages',
    ]) {
      assert.ok(oldDashboard.includes(`'${title}'`), `old test lost: ${title}`);
    }
    assert.equal(oldDashboard.trimEnd().split('\n').length, 48);
  });
});
