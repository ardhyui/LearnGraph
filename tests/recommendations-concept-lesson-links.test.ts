/**
 * Every recommendation card on `/recommendations` opens its lesson.
 *
 * The "Recommended concepts" tab suggests what to study next, but a card could
 * only be read: there was no way to start the lesson from the suggestion. Each
 * card now ends with one small "Open the lesson" link that carries the concept
 * name in its accessible name, following the pattern of the Learning Path tab.
 * The page is locked statically so the link stays the last child of the card
 * text block, the heading stays plain text, and no read, RPC or migration is
 * added.
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
const listStart = page.lastIndexOf('<motion.ol', page.indexOf('aria-label="Recommended concepts"'));
const listEnd = page.indexOf('</motion.ol>', listStart);
const listBlock = listStart >= 0 && listEnd > listStart ? page.slice(listStart, listEnd) : '';
const linkStart = listBlock.indexOf('<Link');
const linkEnd = listBlock.indexOf('</Link>');
const linkBlock =
  linkStart >= 0 && linkEnd > linkStart ? listBlock.slice(linkStart, linkEnd + '</Link>'.length) : '';
const openTag = linkStart >= 0 ? listBlock.slice(linkStart, listBlock.indexOf('>', linkStart) + 1) : '';
const textBlockOpen = '<div className="flex-1">';
const textBlockStart = listBlock.indexOf(textBlockOpen);
const textBlockEnd = textBlockOpen ? listBlock.indexOf('</div>', linkEnd) : -1;

describe('recommendations concept cards: each card opens its lesson', () => {
  it('adds exactly one lesson link per card and one in the list', () => {
    assert.ok(listBlock.length > 0, 'the recommended concepts list still exists');
    assert.equal((listBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<\/Link>/g) ?? []).length, 1);
    assert.equal((listBlock.match(/\{zpd\.recommendations\.map\(/g) ?? []).length, 1);
    assert.ok(listBlock.includes('<motion.li'), 'each rendered card still owns its link');
  });

  it('links to the existing lesson route with the recommended concept', () => {
    assert.ok(openTag.startsWith('<Link'));
    assert.ok(openTag.includes('to="/learn/$conceptId"'));
    assert.ok(openTag.includes('params={{ conceptId: rec.concept.conceptId }}'));
  });

  it('keeps the agreed link styling, icon and visible label', () => {
    assert.ok(
      openTag.includes(
        'className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"',
      ),
    );
    assert.ok(linkBlock.includes('<BookOpen className="h-4 w-4" aria-hidden="true" />'));
    assert.match(
      linkBlock,
      /aria-hidden="true" \/>\s*\n\s*Open the lesson\s*\n\s*<span className="sr-only">: \{rec\.concept\.name\}<\/span>/,
    );
    assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('places the link after "Ways to learn it" and as the last child of the text block', () => {
    assert.ok(textBlockStart > 0, 'the card text block still exists');
    const waysToLearn = listBlock.indexOf('Ways to learn it');
    const chipContainer = listBlock.indexOf('<div className="mt-2 flex flex-wrap gap-2">');
    assert.ok(waysToLearn > 0 && chipContainer > waysToLearn);
    assert.ok(linkStart > chipContainer, 'the link follows the scaffolding chips');
    assert.ok(linkStart > textBlockStart, 'the link lives inside the card text block');
    assert.ok(textBlockEnd > linkEnd, 'the text block closes after the link');
    assert.equal(listBlock.slice(linkEnd + '</Link>'.length, textBlockEnd).trim(), '');
  });

  it('keeps the concept heading as plain text, not a link', () => {
    const heading = '<h3 className="text-xl font-semibold text-foreground">{rec.concept.name}</h3>';
    assert.ok(listBlock.includes(heading));
    assert.equal(linkBlock.includes('text-xl'), false);
    assert.ok(linkStart > listBlock.indexOf(heading), 'the heading renders before the link');
  });

  it('keeps the list, badge, metrics, reasons, prerequisites and scaffolding intact', () => {
    const olTag = page.slice(listStart, page.indexOf('>', listStart) + 1);
    assert.ok(olTag.startsWith('<motion.ol'));
    assert.ok(listBlock.includes('aria-label="Recommended concepts"'));
    assert.ok(listBlock.includes('variants={containerVariants}'));
    assert.ok(listBlock.includes('className="space-y-4"'));
    assert.ok(listBlock.includes('<motion.li'));
    assert.ok(listBlock.includes('key={rec.concept.conceptId}'));
    assert.ok(listBlock.includes('variants={itemVariants}'));
    assert.ok(listBlock.includes('whileHover={{ y: -2 }}'));
    assert.ok(listBlock.includes('{idx + 1}'));
    assert.ok(listBlock.includes('Readiness: {Math.round(rec.readinessScore * 100)}%'));
    assert.ok(listBlock.includes('Est. time: {formatDuration(rec.estimatedMasteryTime)}'));
    assert.ok(listBlock.includes('Profile match: {Math.round(rec.psychometricMatch * 100)}%'));
    assert.ok(listBlock.includes('Why this concept?'));
    assert.ok(listBlock.includes('Builds on'));
    assert.ok(listBlock.includes('Ways to learn it'));
  });

  it('keeps the empty state outside the list and the tab wiring unchanged', () => {
    const empty = page.indexOf('All caught up!');
    assert.ok(empty > 0 && empty < listStart, 'the empty message stays outside the list');
    const emptyBranch = page.slice(listStart - 800, listStart);
    assert.ok(emptyBranch.includes('zpd.recommendations.length === 0'));

    assert.ok(page.includes('id="rec-panel-recommendations"'));
    assert.ok(page.includes('aria-labelledby="rec-tab-recommendations"'));
    assert.ok(page.includes("activeTab === 'recommendations'"));
  });

  it('adds no focus, live region, button or extra role to the card link', () => {
    assert.equal(/aria-live/.test(listBlock), false);
    assert.equal(/\.focus\(\)/.test(listBlock), false);
    assert.equal(/tabIndex/.test(listBlock), false);
    assert.equal(/role=/.test(listBlock), false);
    assert.equal(/<button\b/.test(listBlock), false);
  });

  it('imports Link and BookOpen exactly once and keeps one link per list', () => {
    assert.equal((page.match(/from '@tanstack\/react-router'/g) ?? []).length, 1);
    assert.match(page, /import \{ createFileRoute, Link \} from '@tanstack\/react-router';/);
    assert.equal((listBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<BookOpen\b/g) ?? []).length, 1);

    const pathStart = page.indexOf('<ol aria-label="Suggested learning path"');
    const pathEnd = page.indexOf('</ol>', pathStart);
    const pathBlock = pathStart >= 0 && pathEnd > pathStart ? page.slice(pathStart, pathEnd) : '';
    assert.equal((pathBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((pathBlock.match(/<BookOpen\b/g) ?? []).length, 1);

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
