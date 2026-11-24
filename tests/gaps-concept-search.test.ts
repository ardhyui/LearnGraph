/**
 * Static guards for "Find a concept" on Gap Analysis. The page lists whole
 * concepts (reviews due, shaky spots, a catch-up plan), so a learner who
 * already knows the name can now search the account's concepts and open the
 * lesson instead of scrolling. The box itself is the shared `ConceptSearch`
 * component extracted from the Today panel; the page only supplies the
 * already-loaded concept list — no new server function, RPC method, query,
 * table or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const GAPS_FILE = join(SRC_DIR, 'routes', 'gaps.tsx');
const TODAY_FILE = join(SRC_DIR, 'components', 'StudyToday.tsx');
const SEARCH_COMPONENT = join(SRC_DIR, 'components', 'ConceptSearch.tsx');
const SEARCH_LIB = join(SRC_DIR, 'lib', 'concept-search.ts');

const source = (file: string) => readFileSync(file, 'utf8');

describe('Gap Analysis "Find a concept" wiring (static)', () => {
  it('renders the shared ConceptSearch below the learner selector and before the analysis', () => {
    const gaps = source(GAPS_FILE);
    assert.ok(gaps.includes("import { ConceptSearch } from '@/components/ConceptSearch';"));
    assert.match(
      gaps,
      /<ConceptSearch key=\{`search-\$\{selectedLearnerId\}`\} concepts=\{searchConcepts\} \/>/,
    );
    const selectAt = gaps.indexOf('id={learnerSelectId}');
    const searchAt = gaps.indexOf('<ConceptSearch');
    assert.ok(selectAt !== -1, 'learner select not found');
    assert.ok(searchAt !== -1, 'concept search not found');
    assert.ok(selectAt < searchAt, 'the search box must come after the learner selector');
  });

  it('keeps the loaded concepts in state filled from the existing listConcepts call', () => {
    const gaps = source(GAPS_FILE);
    assert.match(gaps, /const \[searchConcepts, setSearchConcepts\] = useState<ConceptNode\[\]>\(\[\]\);/);
    assert.ok(gaps.includes('db.listConcepts().catch(() => [])'));
    assert.ok(gaps.includes('setSearchConcepts(concepts);'));
    assert.match(gaps, /import type \{ ConceptNode, MasterySource \} from '@\/lib\/graph\/types';/);
    // A new learner starts with a clean box; a quiet reload keeps the query.
    assert.ok(gaps.includes('setSearchConcepts([]);'));
  });

  it('resets the query per learner and still renders when concepts cannot load', () => {
    const gaps = source(GAPS_FILE);
    assert.match(gaps, /key=\{`search-\$\{selectedLearnerId\}`\}/);
    // The catch fallback keeps the page (and the search card) alive with no list.
    assert.ok(gaps.includes('db.listConcepts().catch(() => [])'));
    assert.match(gaps, /\{selectedLearnerId && \(\s*<div className="mb-6">\s*<ConceptSearch/);
  });

  it('defines the box once in the shared file and imports it in both pages', () => {
    const search = source(SEARCH_COMPONENT);
    const today = source(TODAY_FILE);
    const gaps = source(GAPS_FILE);
    assert.equal((search.match(/function ConceptSearch|export function ConceptSearch/g) ?? []).length, 1);
    assert.equal(/function ConceptSearch\b/.test(today), false);
    assert.ok(today.includes("import { ConceptSearch } from '@/components/ConceptSearch';"));
    assert.ok(gaps.includes("import { ConceptSearch } from '@/components/ConceptSearch';"));
  });

  it('does not change the pure search helper', () => {
    const lib = source(SEARCH_LIB);
    const imports = lib.match(/^import\b.*$/gm) ?? [];
    assert.deepEqual(imports, ["import type { ConceptNode } from './graph/types.ts';"]);
    assert.equal(/from 'react'|from '@\//.test(lib), false);
  });

  it('adds no server function, RPC method, schema or migration', () => {
    const gaps = source(GAPS_FILE);
    const migrations = source(join(SRC_DIR, 'lib', 'migrations.ts'));
    const schemas = source(join(SRC_DIR, 'lib', 'graph', 'rpc-schemas.ts'));
    assert.equal(/createServerFn/.test(gaps), false);
    assert.equal(/graphCall/.test(gaps), false);
    assert.equal(/concept.?search/i.test(migrations), false);
    assert.equal(/concept.?search/i.test(schemas), false);
  });

  it('keeps the search box accessible and keeps the page in English', () => {
    const search = source(SEARCH_COMPONENT);
    assert.match(search, /data-testid="concept-search"/);
    assert.match(search, /<h3[^>]*>[\s\S]*Find a concept/);
    assert.match(search, /type="search"/);
    assert.match(search, />\s*Search your concepts\s*</);
    assert.match(search, /role="status" aria-live="polite"/);
    assert.match(search, /<ul aria-label="Concept search results"/);
    assert.match(search, /min-h-10/);
    assert.match(search, /No concepts match “\{cleaned\}”\./);
  });
});
