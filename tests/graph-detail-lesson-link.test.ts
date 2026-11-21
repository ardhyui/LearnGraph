/**
 * The concept panel on `/graph` opens the lesson.
 *
 * Clicking a node showed the concept's domain, difficulty, progress,
 * prerequisites and unlocks, but the lesson itself could only be reached by
 * finding its id again. The panel now offers one "Open the lesson" link right
 * under the domain line, following the same link pattern as the
 * recommendations pages (PR #137/#138/#139), the "Reviews due" list (PR #140)
 * and the "Shaky spots" cards (PR #141). The prerequisite and unlock chips
 * link to their own lessons too, so a learner can walk the graph from the
 * panel. The page is locked statically so the main link stays above the
 * description, the rest of the panel stays plain text, and no read, RPC or
 * migration is added.
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
const panel = panelStart >= 0 && panelEnd > panelStart ? page.slice(panelStart, panelEnd) : '';

const LINK_CLASS =
  'className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"';

const domainStart = panel.indexOf('Domain:');
const descriptionStart = panel.indexOf('{selectedConcept.description && (');
const prerequisitesStart = panel.indexOf('{/* Prerequisites */}');
const mainActionPanel =
  prerequisitesStart > domainStart ? panel.slice(0, prerequisitesStart) : '';
const linkStart = panel.indexOf('<Link');
const linkEnd = panel.indexOf('</Link>', linkStart);
const linkBlock = linkStart >= 0 && linkEnd > linkStart ? panel.slice(linkStart, linkEnd + '</Link>'.length) : '';

const chipList = (label: string) => {
  const start = panel.indexOf(`<ul aria-label="${label}"`);
  if (start < 0) return { start, block: '', linkBlock: '' };
  const end = panel.indexOf('</ul>', start);
  const block = panel.slice(start, end);
  const chipStart = block.indexOf('<Link');
  return { start, block, linkBlock: chipStart >= 0 ? block.slice(chipStart) : '' };
};

describe('graph detail panel: the selected concept opens its lesson', () => {
  it('renders exactly one main lesson link inside the panel', () => {
    assert.ok(panelStart > 0, 'the details panel still exists');
    assert.ok(panelEnd > panelStart, 'the details panel is closed');
    assert.ok(prerequisitesStart > 0, 'the prerequisites block still exists');
    assert.equal((mainActionPanel.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((mainActionPanel.match(/<\/Link>/g) ?? []).length, 1);
    assert.equal((mainActionPanel.match(/Open the lesson/g) ?? []).length, 1);
  });

  it('links to the existing lesson route with the selected concept', () => {
    assert.ok(linkStart > 0, 'the panel has a lesson link');
    const openTag = panel.slice(linkStart, panel.indexOf('>', linkStart) + 1);
    assert.ok(openTag.startsWith('<Link'), 'the link opens with <Link');
    assert.ok(openTag.includes('to="/learn/$conceptId"'), 'the link points at the lesson route');
    assert.ok(
      openTag.includes('params={{ conceptId: selectedConcept.conceptId }}'),
      'the link passes the selected concept',
    );
  });

  it('keeps the agreed styling, icon and accessible name', () => {
    const openTag = panel.slice(linkStart, panel.indexOf('>', linkStart) + 1);
    assert.ok(openTag.includes(LINK_CLASS), 'the link keeps the agreed classes');
    assert.ok(
      linkBlock.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'),
      'the icon is decorative',
    );
    assert.match(
      linkBlock,
      /Open the lesson\s*\n\s*<span className="sr-only">: \{selectedConcept\.name\}<\/span>/,
      'the visible label keeps a unique accessible name',
    );
    assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('places the link after the Domain line and before the description', () => {
    assert.ok(domainStart > 0, 'the Domain line still exists');
    assert.ok(descriptionStart > domainStart, 'the description block still follows the Domain line');
    assert.ok(linkStart > domainStart, 'the link follows the Domain line');
    assert.ok(linkStart < descriptionStart, 'the link comes before the description');
    assert.match(
      panel.slice(domainStart, linkStart),
      /Domain:[\s\S]*<\/div>\s*$/,
      'the link sits after the closing Domain row, not inside it',
    );
  });

  it('keeps the rest of the panel as plain text', () => {
    assert.ok(panel.includes('<span className="text-sm text-muted-foreground">Domain:</span>'));
    assert.ok(panel.includes('{selectedConcept.domain}'));
    assert.ok(panel.includes('data-testid="mastery-source"'));
    assert.ok(panel.includes('aria-label="Prerequisites"'));
    assert.ok(panel.includes('aria-label="Unlocks"'));
    assert.ok(panel.includes('ID: <span className="font-mono">{selectedConcept.conceptId}</span>'));
    assert.ok(panel.includes('title={selectedConcept?.name}'));
    assert.ok(panel.includes('onClose={closeDetails}'));
    assert.ok(panel.includes('open={!!selectedConcept}'));
    assert.ok(panel.includes('In Zone of Proximal Development'));
    assert.ok(panel.includes('Due for a review'));
    assert.ok(panel.includes('Learner Progress'));
    assert.ok(panel.includes('Difficulty'));
  });

  it('adds no focus, live region, button or extra role to the link', () => {
    assert.equal(/aria-live/.test(linkBlock), false, 'the link gained a live region');
    assert.equal(/\.focus\(\)/.test(linkBlock), false, 'the link forces focus');
    assert.equal(/tabIndex/.test(linkBlock), false, 'the link gained a tab stop');
    assert.equal(/role=/.test(linkBlock), false, 'the link gained a role');
    assert.equal(/<button\b/.test(linkBlock), false, 'the link became a button');
  });

  it('turns every prerequisite chip into a lesson link', () => {
    const list = chipList('Prerequisites');
    assert.ok(list.start > 0, 'the prerequisites list still exists');
    assert.equal((list.block.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((list.block.match(/<\/Link>/g) ?? []).length, 1);
    const openTag = list.linkBlock.slice(0, list.linkBlock.indexOf('>') + 1);
    assert.ok(openTag.includes('to="/learn/$conceptId"'), 'the chip points at the lesson route');
    assert.ok(
      openTag.includes('params={{ conceptId: prereq.conceptId }}'),
      'the chip passes the prerequisite id',
    );
    assert.ok(
      openTag.includes(
        'className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs px-2.5 py-1 rounded-lg inline-flex items-center gap-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"',
      ),
      'the chip keeps the old class plus link affordances',
    );
    assert.ok(list.block.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'));
    assert.match(
      list.block,
      /\{prereq\.name\}\s*<span className="sr-only"> — open the lesson<\/span>/,
      'the visible name keeps an accessible lesson label',
    );
  });

  it('turns every unlock chip into a lesson link', () => {
    const list = chipList('Unlocks');
    assert.ok(list.start > 0, 'the unlocks list still exists');
    assert.equal((list.block.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((list.block.match(/<\/Link>/g) ?? []).length, 1);
    const openTag = list.linkBlock.slice(0, list.linkBlock.indexOf('>') + 1);
    assert.ok(openTag.includes('to="/learn/$conceptId"'), 'the chip points at the lesson route');
    assert.ok(
      openTag.includes('params={{ conceptId: dep.conceptId }}'),
      'the chip passes the dependent id',
    );
    assert.ok(
      openTag.includes(
        'className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs px-2.5 py-1 rounded-lg inline-flex items-center gap-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"',
      ),
      'the chip keeps the old class plus link affordances',
    );
    assert.ok(list.block.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'));
    assert.match(
      list.block,
      /\{dep\.name\}\s*<span className="sr-only"> — open the lesson<\/span>/,
      'the visible name keeps an accessible lesson label',
    );
  });

  it('derives each chip id and name from the edge endpoints', () => {
    assert.match(
      page,
      /prerequisites\?: Array<\{ conceptId: string; name: string \}>;/,
    );
    assert.match(page, /dependents\?: Array<\{ conceptId: string; name: string \}>;/);
    assert.match(
      page,
      /conceptId: e\.source,\s*name: sourceNode\?\.data\?\.label as string \|\| e\.source,/,
    );
    assert.match(
      page,
      /conceptId: e\.target,\s*name: targetNode\?\.data\?\.label as string \|\| e\.target,/,
    );
  });

  it('imports Link and BookOpen exactly once', () => {
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
