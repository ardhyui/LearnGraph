/**
 * Review queue on `/gaps` is one named list of reviews.
 *
 * Screen-reader users should hear that the due reviews are a list (and how
 * many items it has) and be able to jump from item to item, instead of a run
 * of anonymous blocks. The page is locked statically so framer-motion markup
 * keeps `<ul aria-label="Reviews due">` as the only wrapper and
 * `<motion.li>` as the only mapped item, without adding a read, RPC or
 * migration.
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

describe('gaps: due reviews are one named list', () => {
  it('wraps the review cards in a single labelled <ul>', () => {
    assert.ok(listStart > 0, 'the review queue has an unordered list');
    assert.ok(listEnd > listStart, 'the unordered list is closed');
    assert.equal((page.match(/<ul aria-label="Reviews due"/g) ?? []).length, 1);
    assert.equal((page.match(/aria-label="Reviews due"/g) ?? []).length, 1);

    const openTag = page.slice(listStart, page.indexOf('>', listStart) + 1);
    assert.match(openTag, /^<ul\b/);
    assert.ok(openTag.includes('aria-label="Reviews due"'));
    // The scroll container and vertical rhythm stay exactly as they were.
    assert.ok(openTag.includes('className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide"'));
  });

  it('maps the queue to direct <motion.li> children', () => {
    assert.match(listBlock, /\{reviewQueue\.queue\.map\(\(item, i\) => \(\s*<motion\.li\b/);
    assert.equal((listBlock.match(/\{reviewQueue\.queue\.map\(/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<motion\.li\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<\/motion\.li>/g) ?? []).length, 1);

    // Nothing (especially no extra <div>) sits between the list and its items.
    const afterOpen = page.indexOf('>', listStart) + 1;
    const mapStart = page.indexOf('{reviewQueue.queue.map', afterOpen);
    assert.equal(page.slice(afterOpen, mapStart).trim(), '');
  });

  it('keeps the item key, hover animation and visual classes', () => {
    const liStart = listBlock.indexOf('<motion.li');
    const liTag = listBlock.slice(liStart, listBlock.indexOf('>', liStart) + 1);
    assert.ok(liTag.includes('key={i}'));
    assert.ok(liTag.includes('whileHover={{ scale: 1.01 }}'));
    assert.ok(
      liTag.includes(
        'className="p-4 bg-secondary/50 rounded-xl border border-border/50 flex items-center gap-3"',
      ),
    );
  });

  it('keeps the review content, priority dot and badge in order', () => {
    const dot = listBlock.indexOf('aria-hidden="true"');
    const concept = listBlock.indexOf('{conceptLabel(item.conceptId, item.conceptName)}');
    const summary = listBlock.indexOf(
      '{reviewSummary(item.nextReviewDate, item.predictedRetention, now)}',
    );
    const badge = listBlock.indexOf('{priorityLabel(item.priority)}');
    assert.ok(dot > 0 && concept > dot && summary > concept && badge > summary);
    assert.ok(listBlock.includes("getPriorityColor(item.priority)"));
  });

  it('adds no visible list marker or extra role', () => {
    assert.equal(/list-(disc|decimal|none)|listStyleType/.test(page), false);
    assert.equal(/role="list"/.test(page), false);
  });
});

describe('gaps: empty state stays as it was', () => {
  it('keeps both empty messages outside the list', () => {
    const emptyStart = page.indexOf(
      "{!reviewQueue || reviewQueue.queue.length === 0 ? (",
    );
    assert.ok(emptyStart > 0, 'the empty state branch still exists');
    assert.ok(emptyStart < listStart, 'the empty state is chosen before the list');
    assert.equal(listBlock.includes('Nothing due right now'), false);
    assert.equal(listBlock.includes('Nothing to review yet'), false);
    assert.ok(page.includes("snoozed.length > 0 ? 'Nothing due right now' : 'Nothing to review yet'"));
  });
});

describe('gaps: surrounding page contract', () => {
  it('keeps the snoozed reviews list untouched', () => {
    assert.ok(
      page.includes(
        '<ul ref={snoozedListRef} className="mt-3 space-y-2" aria-label="Snoozed reviews">',
      ),
    );
    assert.equal((page.match(/aria-label="Snoozed reviews"/g) ?? []).length, 1);
  });

  it('adds no server function, RPC call or migration for the list', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Reviews due'), false, `${file} gained list markup`);
    }
  });
});
