/**
 * Every concept in the "Ready to Learn" zone on `/recommendations` opens its
 * lesson.
 *
 * The zone says which concepts are ready to study next, but each row was only
 * readable: a learner still had to copy the concept id or search for the lesson
 * by hand. Each row now ends with one small "Open the lesson" link that carries
 * the concept name in its accessible name, following the pattern of the
 * Recommended concepts (PR #138) and Learning Path (PR #137) tabs. The page is
 * locked statically so the link stays the last child of the row, the concept
 * name/reason/readiness stay plain text, only the middle zone gets links, and no
 * read, RPC or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'recommendations.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const readyMarker = page.indexOf('aria-labelledby="rec-zone-ready"');
const listStart = page.lastIndexOf('<ul', readyMarker);
const listEnd = page.indexOf('</ul>', listStart);
const listBlock = listStart >= 0 && listEnd > listStart ? page.slice(listStart, listEnd) : '';
const linkStart = listBlock.indexOf('<Link');
const linkEnd = listBlock.indexOf('</Link>');
const linkBlock =
  linkStart >= 0 && linkEnd > linkStart ? listBlock.slice(linkStart, linkEnd + '</Link>'.length) : '';
const openTag = linkStart >= 0 ? listBlock.slice(linkStart, listBlock.indexOf('>', linkStart) + 1) : '';
const rowEnd = linkEnd >= 0 ? listBlock.indexOf('</motion.li>', linkEnd) : -1;

const zoneBlock = (labelledBy: string) => {
  const marker = page.indexOf(`aria-labelledby="${labelledBy}"`);
  const start = page.lastIndexOf('<ul', marker);
  const end = page.indexOf('</ul>', start);
  return start >= 0 && end > start ? page.slice(start, end) : '';
};

describe('recommendations ready-to-learn zone: each concept opens its lesson', () => {
  it('adds exactly one lesson link per row and one in the ready list', () => {
    assert.ok(listBlock.length > 0, 'the ready-to-learn list still exists');
    assert.equal((listBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<\/Link>/g) ?? []).length, 1);
    assert.equal((listBlock.match(/\{zpd\.zpd\.map\(/g) ?? []).length, 1);
    assert.ok(listBlock.includes('<motion.li'), 'each rendered row still owns its link');
  });

  it('links to the existing lesson route with the zoned concept', () => {
    assert.ok(openTag.startsWith('<Link'));
    assert.ok(openTag.includes('to="/learn/$conceptId"'));
    assert.ok(openTag.includes('params={{ conceptId: zc.concept.conceptId }}'));
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
      /aria-hidden="true" \/>\s*\n\s*Open the lesson\s*\n\s*<span className="sr-only">: \{zc\.concept\.name\}<\/span>/,
    );
    assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('places the link after the readiness line and as the last child of the row', () => {
    const readiness = listBlock.indexOf('Readiness: {Math.round(zc.readiness * 100)}%');
    assert.ok(readiness > 0, 'the readiness line still exists');
    assert.ok(linkStart > readiness, 'the link follows the readiness line');
    assert.ok(rowEnd > linkEnd, 'the row closes after the link');
    assert.equal(listBlock.slice(linkEnd + '</Link>'.length, rowEnd).trim(), '');
  });

  it('keeps the concept name, reason and readiness as plain text', () => {
    const nameLine = '<div className="font-medium text-sm text-foreground">{zc.concept.name}</div>';
    const reasonLine = '<div className="text-xs text-muted-foreground mt-1">{zc.reason}</div>';
    const readinessLine = '<div className="text-xs text-purple-600 dark:text-purple-400 mt-1 font-medium">';
    assert.ok(listBlock.includes(nameLine));
    assert.ok(listBlock.includes(reasonLine));
    assert.ok(listBlock.includes(readinessLine));
    assert.equal(linkBlock.includes('text-sm text-foreground'), false);
    assert.equal(linkBlock.includes('{zc.reason}'), false);
    assert.ok(linkStart > listBlock.indexOf(reasonLine), 'the reason renders before the link');
  });

  it('keeps the zone heading, list wiring, row styling and animation intact', () => {
    assert.ok(page.includes('id="rec-zone-ready"'));
    assert.ok(page.includes('Ready to Learn ({zpd.zpd.length})'));
    assert.ok(listBlock.startsWith('<ul'));
    assert.ok(listBlock.includes('aria-labelledby="rec-zone-ready"'));
    assert.ok(listBlock.includes('className="space-y-2 max-h-96 overflow-y-auto scrollbar-hide"'));
    assert.ok(listBlock.includes('whileHover={{ scale: 1.02 }}'));
    assert.ok(listBlock.includes('key={zc.concept.conceptId}'));
    assert.ok(listBlock.includes('className="p-3 bg-background/80 rounded-xl shadow-sm"'));
  });

  it('keeps the empty state outside the list', () => {
    const empty = page.indexOf('Nothing ready right now');
    assert.ok(empty > 0 && empty > listEnd, 'the empty message stays outside the list');
    const emptyBranch = page.slice(listEnd, empty);
    assert.ok(emptyBranch.includes('zpd.zpd.length === 0'));
  });

  it('does not add lesson links to the Mastered or Not yet zones', () => {
    for (const labelledBy of ['rec-zone-mastered', 'rec-zone-notyet']) {
      const block = zoneBlock(labelledBy);
      assert.ok(block.length > 0, `${labelledBy} still exists`);
      assert.equal(/<Link\b/.test(block), false, `${labelledBy} gained a lesson link`);
      assert.equal(/<BookOpen\b/.test(block), false, `${labelledBy} gained a book icon`);
    }
  });

  it('adds no focus, live region, button or extra role to the zone link', () => {
    assert.equal(/aria-live/.test(listBlock), false);
    assert.equal(/\.focus\(\)/.test(listBlock), false);
    assert.equal(/tabIndex/.test(listBlock), false);
    assert.equal(/role=/.test(listBlock), false);
    assert.equal(/<button\b/.test(listBlock), false);
  });

  it('imports Link and BookOpen exactly once and keeps each list to one link', () => {
    assert.equal((page.match(/from '@tanstack\/react-router'/g) ?? []).length, 1);
    assert.match(page, /import \{ createFileRoute, Link \} from '@tanstack\/react-router';/);
    assert.equal((listBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<BookOpen\b/g) ?? []).length, 1);

    const conceptStart = page.indexOf('aria-label="Recommended concepts"');
    const conceptListStart = page.lastIndexOf('<motion.ol', conceptStart);
    const conceptListEnd = page.indexOf('</motion.ol>', conceptListStart);
    const conceptBlock = page.slice(conceptListStart, conceptListEnd);
    assert.equal((conceptBlock.match(/<Link\b/g) ?? []).length, 1);

    const pathStart = page.indexOf('<ol aria-label="Suggested learning path"');
    const pathEnd = page.indexOf('</ol>', pathStart);
    const pathBlock = pathStart >= 0 && pathEnd > pathStart ? page.slice(pathStart, pathEnd) : '';
    assert.equal((pathBlock.match(/<Link\b/g) ?? []).length, 1);

    const lucideImport = page.slice(page.indexOf("from 'lucide-react'") - 400, page.indexOf("from 'lucide-react'"));
    assert.equal((lucideImport.match(/\bBookOpen\b/g) ?? []).length, 1);
  });

  it('adds no server function, RPC schema or migration for the links', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Open the lesson'), false, `${file} gained link markup`);
    }
  });
});
