/**
 * The Learning Path tab on `/recommendations` is one ordered, named list.
 *
 * Screen-reader users should hear that the suggested steps form one sequence
 * (and how many steps it has) and be able to jump from step to step, instead
 * of walking a run of anonymous blocks. The page is locked statically so
 * framer-motion keeps a direct `<motion.li>` per step, the decorative arrow is
 * hidden from assistive technology, and the empty message stays outside the
 * list. No read, RPC or migration is added.
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
const listStart = page.indexOf('<ol');
const listEnd = page.indexOf('</ol>');
const listBlock = listStart >= 0 && listEnd > listStart ? page.slice(listStart, listEnd) : '';
const emptyMessage = page.indexOf('No learning path available');

describe('recommendations learning path: one named ordered list', () => {
  it('wraps the steps in a single labelled <ol>', () => {
    assert.ok(listStart > 0, 'the page has an ordered list');
    assert.ok(listEnd > listStart, 'the ordered list is closed');
    assert.equal((page.match(/<ol\b/g) ?? []).length, 1);
    assert.equal((page.match(/<\/ol>/g) ?? []).length, 1);

    const openTag = page.slice(listStart, page.indexOf('>', listStart) + 1);
    assert.equal(openTag, '<ol aria-label="Suggested learning path" className="space-y-4">');
  });

  it('maps the steps to direct <motion.li> children without a wrapper', () => {
    assert.match(listBlock, /\{zpd\.suggestedPath\.map\(\(conceptId, idx\) => \{[\s\S]*?<motion\.li\b/);
    assert.equal((listBlock.match(/\{zpd\.suggestedPath\.map\(/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<motion\.li\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<\/motion\.li>/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<motion\.div\b/g) ?? []).length, 0);
    assert.equal((listBlock.match(/<div key=/g) ?? []).length, 0);

    // Nothing (especially no extra <div>) sits between the list and its rows.
    const afterOpen = page.indexOf('>', listStart) + 1;
    const mapStart = page.indexOf('{zpd.suggestedPath.map', afterOpen);
    assert.equal(page.slice(afterOpen, mapStart).trim(), '');
  });

  it('keeps the step key, animation and visual classes', () => {
    const liStart = listBlock.indexOf('<motion.li');
    const liTag = listBlock.slice(liStart, listBlock.indexOf('>', liStart) + 1);
    assert.ok(liTag.includes('key={conceptId}'));
    assert.ok(liTag.includes('initial={{ opacity: 0, x: -20 }}'));
    assert.ok(liTag.includes('animate={{ opacity: 1, x: 0 }}'));
    assert.ok(liTag.includes('transition={{ delay: idx * 0.1 }}'));
    assert.ok(liTag.includes('className="flex items-center gap-4"'));
  });

  it('keeps the step content order: number, name, estimate, arrow', () => {
    const badge = listBlock.indexOf('{idx + 1}');
    const nameSource = listBlock.indexOf(
      'const name =',
    );
    const name = listBlock.indexOf('{name}');
    const estimate = listBlock.indexOf(
      'Est. {formatDuration(rec.estimatedMasteryTime)} •',
    );
    const readiness = listBlock.indexOf('Readiness {Math.round(rec.readinessScore * 100)}%');
    const arrow = listBlock.indexOf('↓');

    assert.ok(badge > 0, 'the step number is shown');
    assert.ok(nameSource > 0, 'the step name is resolved once');
    assert.ok(name > badge, 'the concept name follows the number');
    assert.ok(estimate > name, 'the estimate follows the name');
    assert.ok(readiness > estimate, 'readiness follows the estimate');
    assert.ok(arrow > readiness, 'the connector arrow follows the step');

    assert.ok(
      listBlock.includes(
        'className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center font-bold shadow-lg shadow-purple-500/25"',
      ),
    );
    assert.ok(listBlock.includes('className="flex-1 p-4 bg-secondary/50 rounded-xl"'));
    assert.ok(listBlock.includes('className="font-medium text-foreground"'));
    assert.ok(listBlock.includes('className="text-sm text-muted-foreground mt-1"'));
  });

  it('hides only the decorative icons', () => {
    const arrowDiv = listBlock.lastIndexOf('<div', listBlock.indexOf('↓'));
    const arrowTag = listBlock.slice(arrowDiv, listBlock.indexOf('>', arrowDiv) + 1);
    assert.equal(arrowTag, '<div className="w-8 text-center text-muted-foreground text-xl" aria-hidden="true">');
    assert.equal((listBlock.match(/aria-hidden="true"/g) ?? []).length, 2);
    assert.ok(listBlock.includes('{idx < zpd.suggestedPath.length - 1 && ('));
  });

  it('keeps the empty message outside the list', () => {
    assert.ok(emptyMessage > 0, 'the empty message still exists');
    assert.ok(emptyMessage < listStart, 'the empty message renders in its own branch');
    assert.equal(listBlock.includes('No learning path available'), false);
    const paragraph = page.lastIndexOf('<p className="text-muted-foreground">', emptyMessage);
    assert.ok(paragraph > 0 && paragraph < emptyMessage, 'the empty message stays a paragraph');
  });
});

describe('recommendations learning path: surrounding page contract', () => {
  it('adds no visible marker, list role, live region or forced focus', () => {
    assert.equal(/list-(disc|decimal|none)|listStyleType/.test(page), false);
    assert.equal(/role="list"/.test(page), false);
    assert.equal(/aria-live/.test(page), false);
    assert.equal(/\.focus\(\)/.test(listBlock), false);
    assert.equal(/tabIndex/.test(listBlock), false);
  });

  it('keeps the tab wiring and the visible heading untouched', () => {
    assert.ok(page.includes('id="rec-panel-path"'));
    assert.ok(page.includes('aria-labelledby="rec-tab-path"'));
    assert.ok(page.includes("activeTab === 'path'"));
    assert.ok(page.includes("'Learning Path'"));
    const heading = page.indexOf('Suggested Learning Path');
    assert.ok(heading > 0 && heading < listStart, 'the heading still labels the card');
    assert.equal((page.match(/<h3\b/g) ?? []).length, 5, 'no extra heading was added');
    assert.equal((page.match(/role="tabpanel"/g) ?? []).length, 3);
    assert.equal((page.match(/role="tab"/g) ?? []).length, 1);
    assert.equal((page.match(/role="tablist"/g) ?? []).length, 1);
  });

  it('adds no server function, RPC schema or migration for the list', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Suggested learning path'), false, `${file} gained list markup`);
    }
  });
});
