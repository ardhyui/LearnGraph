/**
 * Every row of the "Reviews due" list on `/gaps` opens its lesson.
 *
 * The Reviews card says which concepts are due, but each row was only readable:
 * a learner still had to copy the concept id or look the lesson up by hand. Each
 * row now ends with one small "Open the lesson" link that carries the concept
 * name in its accessible name, following the pattern of the recommendations
 * pages (PR #137/#138/#139). The page is locked statically so the link stays the
 * last child of the text block, the concept name/summary/priority badge stay
 * plain text, the snoozed list gets no link, and no read, RPC or migration is
 * added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'gaps.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const listStart = page.indexOf('<ul aria-label="Reviews due"');
const listEnd = page.indexOf('</ul>', listStart);
const listBlock = listStart >= 0 && listEnd > listStart ? page.slice(listStart, listEnd) : '';
const linkStart = listBlock.indexOf('<Link');
const linkEnd = listBlock.indexOf('</Link>');
const linkBlock =
  linkStart >= 0 && linkEnd > linkStart ? listBlock.slice(linkStart, linkEnd + '</Link>'.length) : '';
const openTag = linkStart >= 0 ? listBlock.slice(linkStart, listBlock.indexOf('>', linkStart) + 1) : '';

describe('gaps reviews due: each row opens its lesson', () => {
  it('adds exactly one lesson link per rendered row and one in the list', () => {
    assert.ok(listStart > 0, 'the reviews-due list still exists');
    assert.ok(listEnd > listStart, 'the reviews-due list is closed');
    assert.equal((listBlock.match(/\{reviewQueue\.queue\.map\(\(item, i\) => \(/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<\/Link>/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<motion\.li\b/g) ?? []).length, 1);
    assert.ok(linkStart > listBlock.indexOf('<motion.li'), 'the link lives inside the mapped row');
  });

  it('links to the existing lesson route with the listed concept', () => {
    assert.ok(openTag.startsWith('<Link'));
    assert.ok(openTag.includes('to="/learn/$conceptId"'));
    assert.ok(openTag.includes('params={{ conceptId: item.conceptId }}'));
  });

  it('keeps the agreed link styling, icon and visible label', () => {
    assert.ok(
      openTag.includes(
        'className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"',
      ),
    );
    assert.ok(linkBlock.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'));
    assert.match(
      linkBlock,
      /aria-hidden="true" \/>\s*\n\s*Open the lesson\s*\n\s*<span className="sr-only">: \{conceptLabel\(item\.conceptId, item\.conceptName\)\}<\/span>/,
    );
    assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('places the link after the review summary and as the last child of the text block', () => {
    const textBlockStart = listBlock.indexOf('<div className="flex-1 min-w-0">');
    assert.ok(textBlockStart > 0, 'the row still has its text block');
    const textBlockEnd = listBlock.indexOf('</div>', textBlockStart);
    assert.ok(textBlockEnd > textBlockStart, 'the text block is closed');

    const summary = listBlock.indexOf(
      '{reviewSummary(item.nextReviewDate, item.predictedRetention, now)}',
    );
    assert.ok(summary > 0, 'the review summary line still exists');
    assert.ok(linkStart > summary, 'the link follows the review summary line');
    assert.ok(linkEnd < textBlockEnd, 'the link sits inside the text block');
    assert.equal(listBlock.slice(linkEnd + '</Link>'.length, textBlockEnd).trim(), '');
  });

  it('keeps the concept name, review summary and priority badge as plain text', () => {
    assert.ok(
      listBlock.includes(
        '<p className="font-medium text-foreground">{conceptLabel(item.conceptId, item.conceptName)}</p>',
      ),
    );
    assert.ok(
      listBlock.includes(
        '{reviewSummary(item.nextReviewDate, item.predictedRetention, now)}',
      ),
    );
    assert.ok(listBlock.includes('{priorityLabel(item.priority)}'));
    assert.equal(linkBlock.includes('text-sm text-muted-foreground'), false);
    assert.equal(linkBlock.includes('{reviewSummary('), false);
    assert.equal(linkBlock.includes('{priorityLabel('), false);
  });

  it('keeps the list wiring, row styling and hover animation intact', () => {
    const listOpenTag = page.slice(listStart, page.indexOf('>', listStart) + 1);
    assert.ok(listOpenTag.startsWith('<ul'));
    assert.ok(listOpenTag.includes('aria-label="Reviews due"'));
    assert.ok(
      listOpenTag.includes('className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide"'),
    );
    const rowTag = listBlock.slice(
      listBlock.indexOf('<motion.li'),
      listBlock.indexOf('>', listBlock.indexOf('<motion.li')) + 1,
    );
    assert.ok(rowTag.includes('key={i}'));
    assert.ok(rowTag.includes('whileHover={{ scale: 1.01 }}'));
    assert.ok(
      rowTag.includes(
        'className="p-4 bg-secondary/50 rounded-xl border border-border/50 flex items-center gap-3"',
      ),
    );
    assert.ok(listBlock.includes("getPriorityColor(item.priority)"));
  });

  it('keeps both empty messages outside the list', () => {
    assert.equal(listBlock.includes('Nothing due right now'), false);
    assert.equal(listBlock.includes('Nothing to review yet'), false);
    assert.ok(
      page.includes("snoozed.length > 0 ? 'Nothing due right now' : 'Nothing to review yet'"),
    );
  });

  it('does not add lesson links to the snoozed reviews list', () => {
    const snoozedStart = page.indexOf(
      '<ul ref={snoozedListRef} className="mt-3 space-y-2" aria-label="Snoozed reviews">',
    );
    assert.ok(snoozedStart > 0, 'the snoozed list still exists');
    const snoozedEnd = page.indexOf('</ul>', snoozedStart);
    const snoozedBlock = page.slice(snoozedStart, snoozedEnd);
    assert.equal(/<Link\b/.test(snoozedBlock), false, 'the snoozed list gained a lesson link');
    assert.equal(snoozedBlock.includes('Open the lesson'), false);
    assert.equal(/<BookOpen\b/.test(snoozedBlock), false);
  });

  it('adds no focus, live region, button or extra role to the row link', () => {
    assert.equal(/aria-live/.test(linkBlock), false);
    assert.equal(/\.focus\(\)/.test(linkBlock), false);
    assert.equal(/tabIndex/.test(linkBlock), false);
    assert.equal(/role=/.test(linkBlock), false);
    assert.equal(/<button\b/.test(linkBlock), false);
  });

  it('imports Link and BookOpen exactly once', () => {
    assert.equal((page.match(/from '@tanstack\/react-router'/g) ?? []).length, 1);
    assert.match(page, /import \{ Link, createFileRoute \} from '@tanstack\/react-router';/);

    const lucideEnd = page.indexOf("from 'lucide-react'");
    const lucideImport = page.slice(page.lastIndexOf('import', lucideEnd), lucideEnd);
    assert.equal((lucideImport.match(/\bBookOpen\b/g) ?? []).length, 1);
    assert.equal((lucideImport.match(/\bLink\b/g) ?? []).length, 0);
  });

  it('adds no server function, RPC schema or migration for the links', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Open the lesson'), false, `${file} gained link markup`);
    }
  });
});
