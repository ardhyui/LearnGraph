/**
 * Both sidebar links show keyboard focus (`Sidebar`).
 *
 * The menu button, the drawer close button and the collapsible group headers
 * already carried `focus-visible:outline-2 focus-visible:outline-primary`, but
 * the two `<Link>` elements did not: the brand link back home and every
 * navigation item. `src/styles.css` has no global `:focus-visible` rule, so a
 * keyboard user tabbing from the menu button onto the brand or a nav item saw
 * no focus at all. This file locks the two focus classes on both links without
 * touching their navigation contract (`to`, `onClick`, `activeOptions`,
 * `isActive`), the existing focus rings on the three buttons, or the file's
 * data/behaviour surface. No query, RPC, migration or dependency is added.
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

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-primary';

/** The brand link's opening tag, from `<Link to="/"` through its `>`. */
const brandStart = sidebar.indexOf('<Link to="/"');
assert.ok(brandStart > 0, 'the brand link is rendered');
const brandEnd = sidebar.indexOf('>', brandStart) + '>'.length;
const BRAND = sidebar.slice(brandStart, brandEnd);

/** The nav item link, from its `<Link` through the closing `)}` of its classes. */
const navLinkStart = sidebar.indexOf('<Link\n                          to={item.href as any}');
assert.ok(navLinkStart > 0, 'the nav item link is rendered');
const navLinkEnd = sidebar.indexOf(')}', sidebar.indexOf('className={cn(', navLinkStart)) + ')}'.length;
const NAV_LINK = sidebar.slice(navLinkStart, navLinkEnd);

describe('Sidebar: the brand link shows keyboard focus', () => {
  it('keeps a single class string with the focus classes appended last', () => {
    assert.ok(
      BRAND.includes(
        `className="flex min-w-0 items-center gap-2 ${FOCUS}"`,
      ),
      'the brand link keeps its classes and ends with the two focus classes',
    );
    assert.ok(BRAND.endsWith('>'), 'the opening tag is closed');
  });

  it('keeps the navigation contract', () => {
    assert.ok(BRAND.startsWith('<Link to="/"'), 'the brand still points home');
    assert.ok(
      BRAND.includes('activeOptions={{ exact: true }}'),
      'the exact active option stays',
    );
    assert.equal(count(BRAND, /focus-visible:/g), 2, 'exactly the two focus utilities');
  });
});

describe('Sidebar: every nav item link shows keyboard focus', () => {
  it('adds the focus line as the last cn argument, after the active conditional', () => {
    assert.ok(NAV_LINK.includes('className={cn('), 'the classes stay assembled with cn');
    assert.ok(
      NAV_LINK.includes(`'focus-visible:outline-2 focus-visible:outline-primary'\n                          )}`),
      'the focus line is the last argument before the closing parenthesis',
    );
    const conditional = NAV_LINK.indexOf('isActive\n');
    assert.ok(conditional > 0, 'the active conditional stays');
    assert.ok(
      conditional < NAV_LINK.indexOf(`'${FOCUS}'`),
      'the focus line follows the active conditional',
    );
    assert.equal(count(NAV_LINK, /focus-visible:/g), 2, 'exactly the two focus utilities');
  });

  it('keeps the base, active and inactive classes exactly', () => {
    assert.ok(
      NAV_LINK.includes(
        "'group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200'",
      ),
      'the base classes stay',
    );
    assert.ok(
      NAV_LINK.includes("? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'"),
      'the active classes stay',
    );
    assert.ok(
      NAV_LINK.includes(
        ": 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'",
      ),
      'the inactive classes stay',
    );
  });

  it('keeps the navigation contract', () => {
    assert.ok(NAV_LINK.includes('to={item.href as any}'), 'the destination stays');
    assert.ok(NAV_LINK.includes('onClick={() => setOpen(false)}'), 'the drawer still closes');
    assert.ok(
      NAV_LINK.includes("activeOptions={{ exact: item.href === '/' }}"),
      'the exact active option stays',
    );
    assert.ok(NAV_LINK.includes('isActive'), 'the active flag still drives the classes');
  });
});

describe('Sidebar: the existing focus rings stay', () => {
  it('keeps the menu button, close button and group header rings', () => {
    assert.equal(count(sidebar, new RegExp(FOCUS, 'g')), 5, 'three buttons plus two links carry the ring');
    const menu = sidebar.slice(sidebar.indexOf('aria-label="Open menu"'), sidebar.indexOf('>', sidebar.indexOf('aria-label="Open menu"')));
    assert.ok(menu.includes(FOCUS), 'the menu button keeps its ring');
    const close = sidebar.slice(sidebar.indexOf('aria-label="Close menu"'), sidebar.indexOf('>', sidebar.indexOf('aria-label="Close menu"')));
    assert.ok(close.includes(FOCUS), 'the close button keeps its ring');
    const groupHeader = sidebar.slice(sidebar.indexOf('className="flex w-full min-h-10'), sidebar.indexOf('>', sidebar.indexOf('className="flex w-full min-h-10')));
    assert.ok(groupHeader.includes(FOCUS), 'the group header keeps its ring');
  });

  it('keeps the decorative icon hidden and the labels unchanged', () => {
    assert.ok(sidebar.includes('<Icon size={18} aria-hidden="true" />'), 'the item icon stays hidden');
    assert.ok(sidebar.includes('{item.label}'), 'the item label stays');
    assert.ok(sidebar.includes('{item.description}'), 'the item description stays');
  });
});

describe('Sidebar: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(sidebar, /focus-visible/g), 10, 'five rings of two classes');
    assert.equal(count(sidebar, /<Link/g), 2, 'the two links stay');
    assert.equal(count(sidebar, /className=\{cn\(/g), 5, 'the five cn calls stay');
    assert.equal(count(sidebar, /aria-label=/g), 5, 'the five existing labels stay');
    assert.equal(count(sidebar, /type="button"/g), 4, 'the four plain buttons stay');
    assert.equal(count(sidebar, /className="sr-only"/g), 1, 'only the sign-out line is sr-only');
    assert.equal(count(sidebar, /aria-busy/g), 1, 'the single sign-out marker stays');
    assert.equal(count(sidebar, /aria-live/g), 1, 'the sign-out status line stays');
    assert.equal(count(sidebar, /role="/g), 1, 'one status line stays');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(sidebar),
      false,
      'the component adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes(FOCUS), false, `${file} gained focus wiring`);
    }
  });
});
