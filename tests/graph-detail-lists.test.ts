/**
 * Prerequisites and Unlocks in the graph detail panel are named lists.
 *
 * Screen-reader users should hear that the chips under each heading are a list
 * of concepts (and how many items it has), and be able to jump from item to
 * item, instead of a run of anonymous spans. The page is locked statically so
 * `<ul aria-label="Prerequisites">` / `<ul aria-label="Unlocks">` stay the only
 * wrappers and `<li key={i}>` stays the only mapped item, without adding a
 * read, server function, RPC or migration. The ReactFlow detail panel only
 * appears after a canvas click, so no new smoke check is added.
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

const blockOf = (label: string) => {
  const start = page.indexOf(`<ul aria-label="${label}"`);
  if (start < 0) return { start, end: -1, block: '' };
  const end = page.indexOf('</ul>', start);
  return { start, end, block: page.slice(start, end) };
};

const prerequisites = blockOf('Prerequisites');
const unlocks = blockOf('Unlocks');

describe('graph detail: prerequisites are one named list', () => {
  it('wraps the prerequisite chips in a single labelled <ul>', () => {
    assert.ok(prerequisites.start > 0, 'prerequisites are an unordered list');
    assert.ok(prerequisites.end > prerequisites.start, 'the list is closed');
    assert.equal(
      (page.match(/<ul aria-label="Prerequisites"/g) ?? []).length,
      1,
    );
    assert.equal((page.match(/aria-label="Prerequisites"/g) ?? []).length, 1);

    const openTag = page.slice(
      prerequisites.start,
      page.indexOf('>', prerequisites.start) + 1,
    );
    assert.match(openTag, /^<ul\b/);
    assert.ok(openTag.includes('aria-label="Prerequisites"'));
    assert.ok(openTag.includes('className="flex flex-wrap gap-1.5"'));
  });

  it('maps the prerequisites to direct <li> children', () => {
    assert.match(
      prerequisites.block,
      /\{selectedConcept\.prerequisites\.map\(\(prereq, i\) => \(\s*<li key=\{i\}>/,
    );
    assert.equal(
      (prerequisites.block.match(/\{selectedConcept\.prerequisites\.map\(/g) ??
        []).length,
      1,
    );
    assert.equal((prerequisites.block.match(/<li\b/g) ?? []).length, 1);
    assert.equal((prerequisites.block.match(/<\/li>/g) ?? []).length, 1);

    // Nothing (especially no extra <div>) sits between the list and its items.
    const afterOpen = page.indexOf('>', prerequisites.start) + 1;
    const mapStart = page.indexOf(
      '{selectedConcept.prerequisites.map',
      afterOpen,
    );
    assert.equal(page.slice(afterOpen, mapStart).trim(), '');
  });

  it('keeps the blue chip class, content and order', () => {
    assert.ok(
      prerequisites.block.includes(
        '<span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs px-2.5 py-1 rounded-lg">',
      ),
    );
    const spanStart = prerequisites.block.indexOf('<span');
    const content = prerequisites.block.indexOf('{prereq}');
    const spanEnd = prerequisites.block.indexOf('</span>');
    const liEnd = prerequisites.block.indexOf('</li>');
    assert.ok(spanStart > 0 && content > spanStart, 'the chip labels the concept');
    assert.ok(spanEnd > content && liEnd > spanEnd, 'the span stays inside the <li>');
  });
});

describe('graph detail: unlocks are one named list', () => {
  it('wraps the dependent chips in a single labelled <ul>', () => {
    assert.ok(unlocks.start > 0, 'unlocks are an unordered list');
    assert.ok(unlocks.end > unlocks.start, 'the list is closed');
    assert.equal((page.match(/<ul aria-label="Unlocks"/g) ?? []).length, 1);
    assert.equal((page.match(/aria-label="Unlocks"/g) ?? []).length, 1);

    const openTag = page.slice(
      unlocks.start,
      page.indexOf('>', unlocks.start) + 1,
    );
    assert.match(openTag, /^<ul\b/);
    assert.ok(openTag.includes('aria-label="Unlocks"'));
    assert.ok(openTag.includes('className="flex flex-wrap gap-1.5"'));
  });

  it('maps the dependents to direct <li> children', () => {
    assert.match(
      unlocks.block,
      /\{selectedConcept\.dependents\.map\(\(dep, i\) => \(\s*<li key=\{i\}>/,
    );
    assert.equal(
      (unlocks.block.match(/\{selectedConcept\.dependents\.map\(/g) ?? [])
        .length,
      1,
    );
    assert.equal((unlocks.block.match(/<li\b/g) ?? []).length, 1);
    assert.equal((unlocks.block.match(/<\/li>/g) ?? []).length, 1);

    const afterOpen = page.indexOf('>', unlocks.start) + 1;
    const mapStart = page.indexOf('{selectedConcept.dependents.map', afterOpen);
    assert.equal(page.slice(afterOpen, mapStart).trim(), '');
  });

  it('keeps the emerald chip class, content and order', () => {
    assert.ok(
      unlocks.block.includes(
        '<span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs px-2.5 py-1 rounded-lg">',
      ),
    );
    const spanStart = unlocks.block.indexOf('<span');
    const content = unlocks.block.indexOf('{dep}');
    const spanEnd = unlocks.block.indexOf('</span>');
    const liEnd = unlocks.block.indexOf('</li>');
    assert.ok(spanStart > 0 && content > spanStart, 'the chip labels the concept');
    assert.ok(spanEnd > content && liEnd > spanEnd, 'the span stays inside the <li>');
  });

  it('uses the same wrapper class for both lists', () => {
    const openTag = (start: number) =>
      page.slice(start, page.indexOf('>', start) + 1);
    const classOf = (tag: string) => tag.match(/className="([^"]*)"/)?.[1];
    assert.equal(classOf(openTag(prerequisites.start)), 'flex flex-wrap gap-1.5');
    assert.equal(classOf(openTag(unlocks.start)), 'flex flex-wrap gap-1.5');
  });
});

describe('graph detail: headings and branches stay as they were', () => {
  it('keeps both headings with their counts', () => {
    assert.ok(
      page.includes(
        "<h4 className=\"text-sm font-semibold text-foreground\">Prerequisites ({selectedConcept.prerequisites.length})</h4>",
      ),
    );
    assert.ok(
      page.includes(
        "<h4 className=\"text-sm font-semibold text-foreground\">Unlocks ({selectedConcept.dependents.length})</h4>",
      ),
    );
  });

  it('keeps each list inside its non-empty branch with its icon', () => {
    const prereqBranch = page.indexOf(
      '{selectedConcept.prerequisites && selectedConcept.prerequisites.length > 0 && (',
    );
    assert.ok(prereqBranch > 0);
    assert.ok(prereqBranch < prerequisites.start);
    assert.ok(
      page.slice(prereqBranch, prerequisites.start).includes('<GitBranch size={16}'),
    );

    const dependentBranch = page.indexOf(
      '{selectedConcept.dependents && selectedConcept.dependents.length > 0 && (',
    );
    assert.ok(dependentBranch > 0);
    assert.ok(dependentBranch < unlocks.start);
    assert.ok(
      page.slice(dependentBranch, unlocks.start).includes('<Clock size={16}'),
    );
  });

  it('adds no visible list marker or extra role', () => {
    assert.equal(/list-(disc|decimal|none)|listStyleType/.test(page), false);
    assert.equal(/role="list"/.test(page), false);
    assert.equal(/aria-live|tabIndex/.test(page.slice(prerequisites.start, unlocks.end)), false);
  });
});

describe('graph detail: no new data path', () => {
  it('adds no server function, RPC call or migration for the lists', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('aria-label="Prerequisites"'), false, `${file} gained list markup`);
      assert.equal(other.includes('aria-label="Unlocks"'), false, `${file} gained list markup`);
    }
  });
});
