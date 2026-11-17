/**
 * The table of contents on `/about` is a named navigation landmark whose
 * entries form one list, so screen-reader users hear "Table of Contents" as a
 * landmark and can jump from section to section instead of walking a run of
 * anonymous links. The page is locked statically: the block stays one <nav>
 * labelled by its heading, the grid becomes a <ul> whose rows are direct <li>
 * wrappers around the unchanged links, and no new read, RPC, live region or
 * migration appears.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'about.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

// The TableOfContents component, from its comment to the next component.
const start = page.indexOf('// Table of Contents');
const end = page.indexOf('function AboutPage()');
assert.ok(start > 0 && end > start, 'the About page has a TableOfContents block');
const toc = page.slice(start, end);

describe('about table of contents: named navigation list', () => {
  it('wraps the block in exactly one nav labelled by the heading id', () => {
    assert.equal((toc.match(/<nav\b/g) ?? []).length, 1);
    assert.ok(
      toc.includes(
        '<nav aria-labelledby="about-toc-title" className="mb-16 p-6 rounded-xl border border-border/50 bg-card/50">',
      ),
      'the outer div becomes a nav with the same classes',
    );
    assert.equal((page.match(/aria-labelledby="about-toc-title"/g) ?? []).length, 1);

    // No wrapper <div> is left between the nav and the heading.
    const navOpen = toc.indexOf('>', toc.indexOf('<nav')) + 1;
    const heading = toc.indexOf('<h3', navOpen);
    assert.ok(heading > navOpen && toc.slice(navOpen, heading).trim() === '');
    assert.equal((toc.match(/<div\b/g) ?? []).length, 0);
  });

  it('keeps exactly one heading carrying the id and the Table of Contents copy', () => {
    assert.equal((page.match(/id="about-toc-title"/g) ?? []).length, 1);
    const headingTag = toc.slice(toc.indexOf('<h3'), toc.indexOf('>', toc.indexOf('<h3')) + 1);
    assert.ok(headingTag.startsWith('<h3 id="about-toc-title"'), 'the heading owns the id');
    assert.ok(
      headingTag.includes('className="text-lg font-semibold mb-4 flex items-center gap-2"'),
    );
    assert.ok(toc.includes('<BookMarked className="w-5 h-5 text-primary" />'));
    assert.ok(toc.includes('Table of Contents'));
  });

  it('maps each section to a direct <li> row without a wrapper', () => {
    const listOpen = toc.indexOf('<ul');
    assert.ok(listOpen > 0, 'the grid container is a list');
    assert.equal(
      toc.slice(listOpen, toc.indexOf('>', listOpen) + 1),
      '<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">',
      'the list keeps the grid classes',
    );

    // Nothing (especially a <div>) sits between the list and its rows.
    const afterOpen = toc.indexOf('>', listOpen) + 1;
    const mapStart = toc.indexOf('{sections.map', afterOpen);
    assert.ok(mapStart > afterOpen, 'the rows come straight from the map');
    assert.equal(toc.slice(afterOpen, mapStart).trim(), '');
    assert.match(toc, /\{sections\.map\(\(section\) => \(\s*<li key=\{section\.id\}>/);

    // The <li> wraps the unchanged anchor directly, and there is exactly one row.
    const liOpen = toc.indexOf('<li key={section.id}>');
    const anchorOpen = toc.indexOf('<a', liOpen);
    assert.ok(
      anchorOpen > liOpen &&
        toc.slice(liOpen + '<li key={section.id}>'.length, anchorOpen).trim() === '',
      'the anchor sits directly inside the <li>',
    );
    assert.equal((toc.match(/<li\b/g) ?? []).length, 1);
    assert.equal((toc.match(/<\/li>/g) ?? []).length, 1);
  });

  it('keeps every link contract: href, classes, decorative icon and label', () => {
    assert.ok(toc.includes('href={`#${section.id}`}'));
    assert.ok(
      toc.includes(
        'className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"',
      ),
    );
    assert.ok(toc.includes('<ChevronRight className="w-3 h-3" aria-hidden="true" />'));
    assert.ok(toc.includes('{section.label}'));
    // The key moved from the anchor to the <li>, not duplicated on both.
    assert.equal((toc.match(/key=\{section\.id\}/g) ?? []).length, 1);
  });

  it('keeps the 15 label→href destinations in order', () => {
    const sections = [
      ['what-is', 'The Vision'],
      ['the-problem', 'The Problem We Solve'],
      ['privacy', 'Privacy First'],
      ['architecture', 'How It Works'],
      ['gap-detection', 'Knowledge Gap Detection'],
      ['zpd', 'Zone of Proximal Development'],
      ['domains', '39 Psychological Domains'],
      ['scaffolding', 'Personalized Scaffolding'],
      ['forgetting', 'Fighting Forgetting'],
      ['comparison', 'Traditional vs LearnGraph'],
      ['who-benefits', 'Who Benefits?'],
      ['magic-moments', 'Magic Moments'],
      ['quick-test', 'Try It Yourself'],
      ['technical', 'Technical Deep Dive'],
      ['bottom-line', 'The Bottom Line'],
    ];
    assert.equal(sections.length, 15);

    // The href is `#${section.id}`, so the source pairs are the destinations.
    const pairs = [...toc.matchAll(/\{ id: '([\w-]+)', label: '([^']+)' \},/g)];
    assert.equal(pairs.length, 15, 'one entry per section');
    assert.deepEqual(
      pairs.map((m) => [m[1], m[2]]),
      sections,
      'label→href pairs keep their order',
    );
  });

  it('adds no visible marker, list role or live region', () => {
    assert.equal(/list-(disc|decimal|none)|listStyleType/.test(page), false);
    assert.equal(/role="list"/.test(toc), false);
    assert.equal(/aria-live/.test(toc), false);
  });

  it('adds no server function, RPC schema or migration', () => {
    // Note: the page body documents `graphCall` in its API table, so this guard
    // is scoped to the TableOfContents block itself.
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(toc), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('about-toc'), false, `${file} gained table of contents markup`);
    }
  });
});
