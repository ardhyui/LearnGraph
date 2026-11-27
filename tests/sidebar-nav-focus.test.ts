/**
 * Keyboard focus is visible on both sidebar links (`Sidebar`).
 *
 * `src/components/Sidebar.tsx` renders exactly two `<Link>` elements — the
 * brand link to the home page in the mobile top bar and every navigation item
 * inside the drawer/sticky column. The three buttons (menu, close, group
 * headers) already carried `focus-visible:outline-2
 * focus-visible:outline-primary`, but both links had no `:focus-visible`
 * style at all and `src/styles.css` has no global rule, so a keyboard user
 * tabbing from the menu button into the brand link or the navigation items
 * saw no focus indicator anywhere. This file locks the two focus classes on
 * both links: the brand link keeps its exact class string with the focus
 * classes appended at the end, and the nav item link carries the focus class
 * line as the last argument of its `cn(...)` block after the active/inactive
 * conditional. The link attributes (`to`, `onClick`, `activeOptions`,
 * `isActive`), the three existing button focus rings and the file-wide counts
 * stay locked. No server function, RPC schema or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SIDEBAR_FILE = join(ROOT, 'src', 'components', 'Sidebar.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const sidebar = source(SIDEBAR_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The brand link to the home page, from its opening tag to its `</Link>`. */
const brandStart = sidebar.indexOf('<Link');
assert.ok(brandStart > 0, 'the brand link is rendered');
const brandEnd = sidebar.indexOf('</Link>', brandStart) + '</Link>'.length;
const BRAND = sidebar.slice(brandStart, brandEnd);

/** The nav item link, from the second `<Link` to its `</Link>`. */
const navStart = sidebar.indexOf('<Link', brandEnd);
assert.ok(navStart > 0, 'the nav item link is rendered');
const navEnd = sidebar.indexOf('</Link>', navStart) + '</Link>'.length;
const NAV = sidebar.slice(navStart, navEnd);

/** The menu button, located through its label. */
const menuIdx = sidebar.indexOf('aria-label="Open menu"');
assert.ok(menuIdx > 0, 'the menu button is rendered');
const menuOpen = sidebar.lastIndexOf('<button', menuIdx);
const menuClose = sidebar.indexOf('</button>', menuOpen) + '</button>'.length;
const MENU = sidebar.slice(menuOpen, menuClose);

/** The close-drawer button, located through its label. */
const closeIdx = sidebar.indexOf('aria-label="Close menu"');
assert.ok(closeIdx > 0, 'the close button is rendered');
const closeOpen = sidebar.lastIndexOf('<button', closeIdx);
const closeClose = sidebar.indexOf('</button>', closeOpen) + '</button>'.length;
const CLOSE = sidebar.slice(closeOpen, closeClose);

/** The collapsible group header button, located through its expanded state. */
const headerIdx = sidebar.indexOf('aria-expanded={isOpen}');
assert.ok(headerIdx > 0, 'the group header button is rendered');
const headerOpen = sidebar.lastIndexOf('<button', headerIdx);
const headerClose = sidebar.indexOf('</button>', headerOpen) + '</button>'.length;
const HEADER = sidebar.slice(headerOpen, headerClose);

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';
const FOCUS_LINE = `'${FOCUS_PAIR}',`;

describe('Sidebar: both links show keyboard focus', () => {
  it('the brand link keeps its exact class string with the focus classes at the end', () => {
    assert.ok(
      BRAND.includes(`className="flex min-w-0 items-center gap-2 ${FOCUS_PAIR}"`),
      'the brand classes stay with the focus pair appended',
    );
    assert.equal(
      BRAND.indexOf(`flex min-w-0 items-center gap-2 ${FOCUS_PAIR}"`),
      BRAND.indexOf('className="') + 'className="'.length,
      'the class string starts at the link own className attribute',
    );
  });

  it('the nav item link gains the focus line as the last cn argument', () => {
    const cnStart = NAV.indexOf('className={cn(');
    assert.ok(cnStart > 0, 'the nav item link has a cn block');
    const cnEnd = NAV.indexOf(')}', cnStart);
    assert.ok(cnEnd > 0, 'the cn block is closed');
    const CN = NAV.slice(cnStart, cnEnd + 2);
    assert.ok(CN.includes(FOCUS_LINE), 'the focus line is rendered');
    const inactiveAt = CN.indexOf(
      ": 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',",
    );
    assert.ok(inactiveAt > 0, 'the inactive branch stays');
    assert.ok(inactiveAt < CN.indexOf(FOCUS_LINE), 'the focus line follows the conditional');
    assert.equal(
      CN.slice(CN.indexOf(FOCUS_LINE) + FOCUS_LINE.length).replace(/\s/g, ''),
      ')}',
      'only the closing brace follows the focus line',
    );
  });

  it('each link carries the focus pair exactly once', () => {
    assert.equal(count(BRAND, /focus-visible/g), 2, 'the brand link has both focus classes');
    assert.equal(count(NAV, /focus-visible/g), 2, 'the nav item link has both focus classes');
  });
});

describe('Sidebar: the links keep their behaviour', () => {
  it('keeps the brand link attributes, icon and label', () => {
    assert.ok(BRAND.includes('to="/"'), 'the brand link keeps its destination');
    assert.ok(BRAND.includes('activeOptions={{ exact: true }}'), 'the exact match stays');
    assert.ok(BRAND.includes('<Brain className="h-4 w-4 text-white" />'), 'the brand icon stays');
    assert.ok(BRAND.includes('LearnGraph'), 'the brand label stays');
  });

  it('keeps the nav item attributes and the active state logic', () => {
    assert.ok(NAV.includes('to={item.href as any}'), 'the destination stays');
    assert.ok(NAV.includes('onClick={() => setOpen(false)}'), 'the drawer still closes');
    assert.ok(NAV.includes("activeOptions={{ exact: item.href === '/' }}"), 'the exact rule stays');
    assert.ok(
      sidebar.includes('const isActive = isNavItemActive(item.href, pathname);'),
      'the active detection stays',
    );
    assert.ok(
      NAV.includes("'group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200',"),
      'the base nav classes stay',
    );
    assert.ok(
      NAV.includes("? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'"),
      'the active branch stays',
    );
    assert.ok(
      NAV.includes(": 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'"),
      'the inactive branch stays',
    );
    assert.ok(NAV.includes('<Icon size={18} aria-hidden="true" />'), 'the item icon stays hidden');
  });
});

describe('Sidebar: the three existing button focus rings stay', () => {
  it('the menu, close and group header buttons keep their focus classes', () => {
    for (const [name, button] of [
      ['menu', MENU],
      ['close', CLOSE],
      ['group header', HEADER],
    ] as const) {
      assert.ok(
        button.includes('focus-visible:outline-2 focus-visible:outline-primary'),
        `${name}: the focus ring stays`,
      );
    }
  });

  it('the buttons are unchanged in count', () => {
    assert.equal(count(sidebar, /<button/g), 4, 'the four buttons stay');
    assert.equal(count(sidebar, /type="button"/g), 4, 'every button stays a plain button');
  });
});

describe('Sidebar: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(sidebar, /focus-visible/g), 10, 'five focus pairs: three buttons and two links');
    assert.equal(count(sidebar, /<Link/g), 2, 'the two links stay');
    assert.equal(count(sidebar, /className=\{cn\(/g), 5, 'the five cn blocks stay');
    assert.equal(count(sidebar, /className="sr-only"/g), 1, 'only the sign-out line is sr-only');
    assert.equal(count(sidebar, /aria-busy/g), 1, 'the single sign-out marker');
    assert.equal(count(sidebar, /aria-live/g), 1, 'the sign-out status line');
    assert.equal(count(sidebar, /role="/g), 1, 'one status line');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(sidebar),
      false,
      'the component adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('focus-visible:outline-primary'), false, `${file} gained sidebar focus styles`);
    }
  });
});
