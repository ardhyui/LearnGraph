/**
 * The concept details panel on `/graph` links to its lesson.
 *
 * The panel described the selected concept (domain, description, difficulty,
 * mastery, prerequisites, unlocks) but offered no way to study it: the concept
 * had to be found again by hand on the lesson page. The panel now carries one
 * "Open the lesson" link with the concept name in its accessible name, placed
 * right after the domain row so the main action sits on top instead of being
 * buried under the Concept ID — following the pattern of the recommendations
 * and gaps pages (PR #137–#141). The page is locked statically so the link
 * stays between the domain row and the description, everything else stays
 * plain text, and no read, server function, RPC or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'graph.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const panelStart = page.indexOf('<GraphDetailPanel open={!!selectedConcept}');
const panelEnd = page.indexOf('</GraphDetailPanel>', panelStart);
const panelBlock =
  panelStart >= 0 && panelEnd > panelStart ? page.slice(panelStart, panelEnd) : '';
const linkStart = panelBlock.indexOf('<Link');
const linkEnd = panelBlock.indexOf('</Link>', linkStart);
const linkBlock =
  linkStart >= 0 && linkEnd > linkStart
    ? panelBlock.slice(linkStart, linkEnd + '</Link>'.length)
    : '';
const openTag =
  linkStart >= 0 ? panelBlock.slice(linkStart, panelBlock.indexOf('>', linkStart) + 1) : '';

const domainRowStart = panelBlock.indexOf('Domain:');
const domainRowEnd = panelBlock.indexOf('</div>', domainRowStart);
const descriptionStart = panelBlock.indexOf('{selectedConcept.description && (');
const idBlockStart = panelBlock.indexOf('border-t border-border');

describe('graph details panel: the selected concept opens its lesson', () => {
  it('adds exactly one lesson link to the panel', () => {
    assert.ok(panelStart > 0, 'the details panel still exists');
    assert.ok(panelEnd > panelStart, 'the details panel is closed');
    assert.equal((panelBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((panelBlock.match(/<\/Link>/g) ?? []).length, 1);
    assert.ok(linkStart > panelBlock.indexOf('{selectedConcept && ('), 'the link lives in the concept branch');
  });

  it('links to the existing lesson route with the selected concept', () => {
    assert.ok(openTag.startsWith('<Link'));
    assert.ok(openTag.includes('to="/learn/$conceptId"'));
    assert.ok(openTag.includes('params={{ conceptId: selectedConcept.conceptId }}'));
  });

  it('keeps the agreed link styling, icon and visible label', () => {
    assert.ok(
      openTag.includes(
        'className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"',
      ),
    );
    assert.ok(linkBlock.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'));
    assert.match(
      linkBlock,
      /aria-hidden="true" \/>\s*\n\s*Open the lesson\s*\n\s*<span className="sr-only">: \{selectedConcept\.name\}<\/span>/,
    );
    assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('places the link right after the domain row and before the description', () => {
    assert.ok(domainRowStart > 0, 'the domain row still exists');
    assert.ok(domainRowEnd > domainRowStart, 'the domain row is closed');
    assert.ok(descriptionStart > 0, 'the description block still exists');

    assert.ok(linkStart > domainRowEnd, 'the link follows the domain row');
    assert.ok(linkEnd < descriptionStart, 'the link comes before the description block');
    assert.equal(panelBlock.slice(domainRowEnd + '</div>'.length, linkStart).trim(), '');
  });

  it('keeps the domain row, description and concept id as plain text', () => {
    const domainRow = panelBlock.slice(domainRowStart, domainRowEnd);
    assert.ok(domainRow.includes('{selectedConcept.domain}'));
    assert.equal(/<Link\b/.test(domainRow), false, 'the domain row became a link');

    assert.ok(
      panelBlock.includes('<p className="text-sm text-foreground">{selectedConcept.description}</p>'),
    );
    assert.ok(
      panelBlock.includes('ID: <span className="font-mono">{selectedConcept.conceptId}</span>'),
    );
    assert.ok(idBlockStart > 0, 'the concept id block still exists');
    assert.ok(linkEnd < idBlockStart, 'the concept id block stays below the link');
    assert.equal(/<Link\b/.test(panelBlock.slice(idBlockStart)), false, 'the concept id block gained a link');
  });

  it('keeps the mastery line and both named lists intact and unlinked', () => {
    assert.ok(panelBlock.includes('data-testid="mastery-source"'));
    assert.ok(panelBlock.includes('{masterySourceLabel(selectedConcept.masterySource)}'));
    for (const label of ['Prerequisites', 'Unlocks']) {
      const listStart = panelBlock.indexOf(`<ul aria-label="${label}"`);
      assert.ok(listStart > 0, `the ${label.toLowerCase()} list still exists`);
      const listEnd = panelBlock.indexOf('</ul>', listStart);
      const list = panelBlock.slice(listStart, listEnd);
      assert.equal(/<Link\b/.test(list), false, `the ${label.toLowerCase()} list gained a lesson link`);
    }
  });

  it('keeps the panel wiring (open state, title, close handler) intact', () => {
    assert.ok(
      page.includes(
        '<GraphDetailPanel open={!!selectedConcept} title={selectedConcept?.name} onClose={closeDetails}>',
      ),
    );
  });

  it('adds no focus, live region, button or extra role to the panel link', () => {
    assert.equal(/aria-live/.test(linkBlock), false);
    assert.equal(/\.focus\(\)/.test(linkBlock), false);
    assert.equal(/tabIndex/.test(linkBlock), false);
    assert.equal(/role=/.test(linkBlock), false);
    assert.equal(/<button\b/.test(linkBlock), false);
  });

  it('imports Link exactly once and keeps BookOpen imported once', () => {
    assert.equal((page.match(/from '@tanstack\/react-router'/g) ?? []).length, 1);
    assert.match(page, /import \{ createFileRoute, Link \} from '@tanstack\/react-router';/);

    const lucideEnd = page.indexOf("from 'lucide-react'");
    const lucideImport = page.slice(page.lastIndexOf('import', lucideEnd), lucideEnd);
    assert.equal((lucideImport.match(/\bBookOpen\b/g) ?? []).length, 1);
    assert.equal((lucideImport.match(/\bLink\b/g) ?? []).length, 0);
  });

  it('adds no server function, RPC schema or migration for the link', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Open the lesson'), false, `${file} gained link markup`);
    }
  });
});
