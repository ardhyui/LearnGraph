/**
 * The long public `/privacy` page has a table of contents: one named
 * navigation landmark whose six entries are a list, each jumping to a section
 * that now owns a stable id. Screen-reader and keyboard users can move between
 * the six policy sections instead of walking the whole page. This guard locks
 * the structure statically: the policy copy, section order, and card/heading
 * styling stay untouched, and no new read, RPC, live region, focus change or
 * migration appears.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'privacy.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const TOC_START = '<nav aria-labelledby="privacy-toc-title"';
const tocStart = page.indexOf(TOC_START);
assert.ok(tocStart > 0, 'the privacy page has a table of contents nav');
const tocEnd = page.indexOf('</nav>', tocStart);
assert.ok(tocEnd > tocStart, 'the table of contents nav is closed');
const toc = page.slice(tocStart, tocEnd + '</nav>'.length);

// The six sections, in the order they appear on the page.
const SECTIONS: [string, string][] = [
  ['privacy-what-is-stored', 'What is stored'],
  ['privacy-who-can-see-it', 'Who can see it'],
  ['privacy-cookies-and-tracking', 'Cookies and tracking'],
  ['privacy-ai-services', 'AI services'],
  ['privacy-personal-topics', 'Personal topics'],
  ['privacy-deleting-your-data', 'Deleting your data'],
];

describe('privacy table of contents: named navigation list', () => {
  it('wraps the entries in exactly one nav labelled by its heading', () => {
    assert.equal((page.match(/<nav\b/g) ?? []).length, 1);
    assert.ok(
      toc.startsWith(
        '<nav aria-labelledby="privacy-toc-title" className="mt-6 p-4 rounded-xl border border-border/50 bg-card/50">',
      ),
      'the nav carries the card classes and the heading reference',
    );
    assert.equal((page.match(/aria-labelledby="privacy-toc-title"/g) ?? []).length, 1);
  });

  it('keeps exactly one heading carrying the id and the On this page copy', () => {
    assert.equal((page.match(/id="privacy-toc-title"/g) ?? []).length, 1);
    assert.ok(
      toc.includes(
        '<h2 id="privacy-toc-title" className="text-sm font-semibold text-foreground">On this page</h2>',
      ),
      'the heading keeps its classes and copy',
    );
    assert.equal((toc.match(/<h2\b/g) ?? []).length, 1);
  });

  it('maps the six entries to list rows in section order', () => {
    assert.ok(
      toc.includes('<ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">'),
      'the entry grid is a list with the same classes',
    );
    assert.equal((toc.match(/<li>/g) ?? []).length, 6);
    assert.equal((toc.match(/<\/li>/g) ?? []).length, 6);
    assert.ok(!/<li[^>]>/.test(toc), 'no list item gains attributes');

    for (const [id] of SECTIONS) {
      assert.ok(toc.includes(`href="#${id}"`), `${id} has a jump link`);
    }

    const pairs = [
      ...toc.matchAll(
        /<a href="#(privacy-[\w-]+)" className="text-sm font-medium text-primary hover:underline">\s*([^<]+?)\s*<\/a>/g,
      ),
    ].map((match) => [match[1], match[2]] as [string, string]);
    assert.deepEqual(pairs, SECTIONS, 'label→destination pairs keep the section order');
  });

  it('gives every section a stable id and a heading id derived from it', () => {
    assert.ok(page.includes('<section id={id} className="mt-8 scroll-mt-4">'));
    assert.ok(
      page.includes(
        '<h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">{title}</h2>',
      ),
      'the heading keeps its classes and reads the id from the section',
    );

    const calls = [...page.matchAll(/<Section id="(privacy-[\w-]+)" title="([^"]+)">/g)].map(
      (match) => [match[1], match[2]] as [string, string],
    );
    assert.deepEqual(calls, SECTIONS, 'the six sections keep their ids and titles in order');

    for (const [id] of SECTIONS) {
      assert.ok(!page.includes(`id="${id}-title"`), `${id} does not hard-code its heading id`);
    }
    // Only the nav's own heading id is written out; the six section heading ids
    // are derived from the section id by the shared template above.
    const literalHeadingIds = [...page.matchAll(/id="(privacy-[\w-]+-title)"/g)].map((match) => match[1]);
    assert.deepEqual(literalHeadingIds, ['privacy-toc-title']);
    // The nav's own heading does not collide with the six section headings.
    assert.equal(new Set(calls.map(([id]) => id)).size, 6);
  });

  it('keeps the policy content that existed before the table of contents', () => {
    for (const [, title] of SECTIONS) {
      assert.ok(page.includes(`title="${title}"`), `${title} section is still there`);
    }
    assert.ok(page.includes('never the password itself'));
    assert.ok(page.includes('no advertising or analytics cookies and no third-party'));
    assert.ok(page.includes('“Delete my account”'));
    assert.ok(page.includes('There is no single download of a whole workspace yet.'));
    assert.ok(page.includes('How your data is handled'));
    assert.ok(page.includes('← LearnGraph'));
    assert.ok(page.includes("pageHead('/privacy')"));
  });

  it('adds no marker class, extra role, live region or forced focus', () => {
    assert.equal(/list-(disc|decimal|none)/.test(toc), false);
    assert.equal(/role=/.test(page), false);
    assert.equal(/aria-live/.test(page), false);
    assert.equal(/\.focus\(/.test(page), false);
    assert.equal(/tabIndex/.test(page), false);
    assert.equal(/aria-label=/.test(page), false);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('privacy-toc'), false, `${file} gained table of contents markup`);
    }
  });
});
