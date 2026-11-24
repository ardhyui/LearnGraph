/**
 * Static guards for "Find a concept" on Recommendations. The page suggests
 * concepts, groups them into zones and lays out a learning path, so a learner
 * who already knows the name can search the account's concepts and open the
 * lesson instead of scrolling the lists. The box itself is the shared
 * `ConceptSearch` component already used by the Today panel and Gap Analysis;
 * the page only supplies the account's concept list — no new server function,
 * RPC method, query, table or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const PAGE_FILE = join(SRC_DIR, 'routes', 'recommendations.tsx');
const SEARCH_COMPONENT = join(SRC_DIR, 'components', 'ConceptSearch.tsx');
const SEARCH_LIB = join(SRC_DIR, 'lib', 'concept-search.ts');

const source = (file: string) => readFileSync(file, 'utf8');

describe('Recommendations "Find a concept" wiring (static)', () => {
  it('renders the shared ConceptSearch below the learner selector and before the views', () => {
    const page = source(PAGE_FILE);
    assert.ok(page.includes("import { ConceptSearch } from '@/components/ConceptSearch';"));
    assert.match(
      page,
      /<ConceptSearch key=\{`search-\$\{selectedLearner\}`\} concepts=\{searchConcepts\} \/>/,
    );
    const selectAt = page.indexOf('id={learnerSelectId}');
    const searchAt = page.indexOf('<ConceptSearch');
    const tabsAt = page.indexOf('aria-label="Recommendation views"');
    assert.ok(selectAt !== -1, 'learner select not found');
    assert.ok(searchAt !== -1, 'concept search not found');
    assert.ok(tabsAt !== -1, 'recommendation views tablist not found');
    assert.ok(selectAt < searchAt, 'the search box must come after the learner selector');
    assert.ok(searchAt < tabsAt, 'the search box must come before the recommendation views');
  });

  it('mounts the box per learner inside the same wrapper used on Gap Analysis', () => {
    const page = source(PAGE_FILE);
    assert.match(
      page,
      /\{selectedLearner && \(\s*<div className="mb-6">\s*<ConceptSearch key=\{`search-\$\{selectedLearner\}`\}/,
    );
    // The box is shown only once a learner is active, like the analysis itself.
    assert.equal((page.match(/<ConceptSearch\b/g) ?? []).length, 1);
  });

  it('keeps the account concepts in state filled from one listConcepts call', () => {
    const page = source(PAGE_FILE);
    assert.match(page, /const \[searchConcepts, setSearchConcepts\] = useState<GraphConceptNode\[\]>\(\[\]\);/);
    assert.ok(page.includes('db.listConcepts().catch(() => [])'));
    assert.ok(page.includes('setSearchConcepts(concepts);'));
    assert.match(page, /import type \{ ConceptNode as GraphConceptNode \} from '@\/lib\/graph\/types';/);
    // A new learner starts with a clean list, never the previous one's concepts.
    assert.ok(page.includes('setSearchConcepts([]);'));
  });

  it('only lets the latest request fill the list', () => {
    const page = source(PAGE_FILE);
    const loadAt = page.indexOf('db.listConcepts()');
    const guardAt = page.indexOf('if (seq !== requestSeq.current) return;', loadAt);
    const fillAt = page.indexOf('setSearchConcepts(concepts);', loadAt);
    assert.ok(loadAt !== -1, 'listConcepts not called');
    assert.ok(guardAt !== -1, 'the stale-request guard is missing after the reads');
    assert.ok(fillAt !== -1, 'the loaded concepts are never stored');
    assert.ok(guardAt < fillAt, 'the list must only be filled by the latest request');
  });

  it('still shows the box with an empty list when concepts cannot load', () => {
    const page = source(PAGE_FILE);
    // The catch fallback keeps the page (and the search card) alive with no list.
    assert.ok(page.includes('db.listConcepts().catch(() => [])'));
    assert.match(page, /\{selectedLearner && \(\s*<div className="mb-6">/);
  });

  it('defines the box once in the shared file and does not copy it into the route', () => {
    const search = source(SEARCH_COMPONENT);
    const page = source(PAGE_FILE);
    assert.equal((search.match(/function ConceptSearch|export function ConceptSearch/g) ?? []).length, 1);
    assert.equal(/function ConceptSearch\b/.test(page), false);
  });

  it('does not change the shared search helper or component', () => {
    const lib = source(SEARCH_LIB);
    const imports = lib.match(/^import\b.*$/gm) ?? [];
    assert.deepEqual(imports, ["import type { ConceptNode } from './graph/types.ts';"]);
    assert.equal(/from 'react'|from '@\//.test(lib), false);
    const search = source(SEARCH_COMPONENT);
    assert.match(search, /data-testid="concept-search"/);
    assert.match(search, /<ul aria-label="Concept search results"/);
  });

  it('adds no server function, RPC method, schema or migration', () => {
    const page = source(PAGE_FILE);
    const migrations = source(join(SRC_DIR, 'lib', 'migrations.ts'));
    const schemas = source(join(SRC_DIR, 'lib', 'graph', 'rpc-schemas.ts'));
    assert.equal(/createServerFn/.test(page), false);
    assert.equal(/graphCall/.test(page), false);
    assert.equal(/concept.?search/i.test(migrations), false);
    assert.equal(/concept.?search/i.test(schemas), false);
  });
});
