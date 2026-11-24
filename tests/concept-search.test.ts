/**
 * Direct unit tests for "Find a concept" in the Today panel
 * (`src/lib/concept-search.ts`) and its wiring. A learner who already knows
 * the name of a concept can search the concepts their account has and open the
 * lesson link instead of scrolling the review and "Learn next" lists.
 *
 * The helper is pure (node:test, no PGlite or DOM); the static guards keep the
 * panel on the loaded concept list with no new server function, RPC method,
 * table or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_SEARCH_LENGTH,
  conceptSearchResults,
  conceptSearchSummary,
  searchQuery,
} from '../src/lib/concept-search.ts';
import type { ConceptNode } from '../src/lib/graph/types.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const SEARCH_FILE = join(SRC_DIR, 'lib', 'concept-search.ts');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'ConceptSearch.tsx');
const TODAY_FILE = join(SRC_DIR, 'components', 'StudyToday.tsx');

/** One concept as the search sees it. */
const concept = (over: Partial<ConceptNode> = {}): ConceptNode => ({
  conceptId: 'concept:fractions',
  name: 'Fractions',
  domain: 'mathematics',
  description: 'Parts of a whole',
  difficulty: { absolute: 2, cognitiveLoad: 0.3, abstractness: 0.2 },
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
  ...over,
});

const names = (results: ConceptNode[]) => results.map((c) => c.name);

describe('searchQuery: cleaning the typed query', () => {
  it('trims the ends and collapses runs of whitespace', () => {
    assert.equal(searchQuery('  Algebra  '), 'Algebra');
    assert.equal(searchQuery('linear\t  equations\n'), 'linear equations');
    assert.equal(searchQuery('   parts   of    a whole  '), 'parts of a whole');
  });

  it('refuses anything shorter than two characters after cleaning', () => {
    assert.equal(MIN_SEARCH_LENGTH, 2);
    assert.equal(searchQuery(''), '');
    assert.equal(searchQuery('   '), '');
    assert.equal(searchQuery('\n\t '), '');
    assert.equal(searchQuery('a'), '');
    assert.equal(searchQuery('  a  '), '');
    assert.equal(searchQuery('é'), '');
    assert.equal(searchQuery(' a '), '');
  });

  it('accepts two characters, including non-Latin text unchanged', () => {
    assert.equal(searchQuery(' ab '), 'ab');
    assert.equal(searchQuery(' 日本 '), '日本');
    assert.equal(searchQuery('  分数  '), '分数');
  });

  it('treats a missing value as empty instead of throwing', () => {
    assert.equal(searchQuery(undefined as unknown as string), '');
    assert.equal(searchQuery(null as unknown as string), '');
  });
});

describe('conceptSearchResults: what matches', () => {
  it('matches name, description, id, domain and tags case-insensitively', () => {
    const concepts = [
      concept(),
      concept({
        conceptId: 'concept:decimals',
        name: 'Decimals',
        description: 'Tenths and hundredths',
        tags: ['place-value'],
      }),
      concept({
        conceptId: 'concept:algebra',
        name: 'Algebra',
        domain: 'computer-science',
        description: 'Letters for numbers',
      }),
    ];
    assert.deepEqual(names(conceptSearchResults(concepts, 'fraction')), ['Fractions']);
    assert.deepEqual(names(conceptSearchResults(concepts, 'WHOLE')), ['Fractions']);
    assert.deepEqual(names(conceptSearchResults(concepts, 'hundredths')), ['Decimals']);
    assert.deepEqual(names(conceptSearchResults(concepts, 'DECIMALS')), ['Decimals']);
    assert.deepEqual(names(conceptSearchResults(concepts, 'computer')), ['Algebra']);
    assert.deepEqual(names(conceptSearchResults(concepts, 'place-value')), ['Decimals']);
  });

  it('collapses whitespace in the query before matching', () => {
    const concepts = [concept({ name: 'Linear equations' })];
    assert.deepEqual(names(conceptSearchResults(concepts, '  linear    equations ')), [
      'Linear equations',
    ]);
  });

  it('returns nothing for a blank, one-character or unmatched query', () => {
    const concepts = [concept()];
    assert.deepEqual(conceptSearchResults(concepts, ''), []);
    assert.deepEqual(conceptSearchResults(concepts, '   '), []);
    assert.deepEqual(conceptSearchResults(concepts, 'f'), []);
    assert.deepEqual(conceptSearchResults(concepts, 'geometry'), []);
    assert.deepEqual(conceptSearchResults([], 'fractions'), []);
  });

  it('handles a missing description or tag list without throwing', () => {
    const bare = concept({ description: undefined as unknown as string, tags: undefined });
    assert.deepEqual(names(conceptSearchResults([bare], 'fractions')), ['Fractions']);
  });
});

describe('conceptSearchResults: ordering', () => {
  it('puts an exact name first, then names containing it, then other fields by name', () => {
    const concepts = [
      concept({
        conceptId: 'concept:decimals',
        name: 'Decimals',
        description: 'Fractions written another way',
      }),
      concept({
        conceptId: 'concept:algebra',
        name: 'Algebra',
        description: 'Letters for numbers',
        tags: ['fractions'],
      }),
      concept({
        conceptId: 'concept:fractions-and-decimals',
        name: 'Fractions and decimals',
        description: 'Link them',
      }),
      concept({
        conceptId: 'concept:fractions',
        name: 'Fractions',
        description: 'Parts of a whole',
      }),
    ];
    assert.deepEqual(names(conceptSearchResults(concepts, 'fractions')), [
      'Fractions',
      'Fractions and decimals',
      'Algebra',
      'Decimals',
    ]);
  });

  it('sorts equal ranks by name regardless of the input order', () => {
    const concepts = [
      concept({ conceptId: 'concept:c', name: 'Circles', description: 'Shapes' }),
      concept({ conceptId: 'concept:a', name: 'Angles', description: 'Shapes' }),
      concept({ conceptId: 'concept:b', name: 'Both', description: 'Shapes' }),
    ];
    assert.deepEqual(names(conceptSearchResults(concepts, 'shapes')), [
      'Angles',
      'Both',
      'Circles',
    ]);
    assert.deepEqual(names(conceptSearchResults([...concepts].reverse(), 'shapes')), [
      'Angles',
      'Both',
      'Circles',
    ]);
  });

  it('keeps exact-name matching case-insensitive for ranking', () => {
    const concepts = [
      concept({ conceptId: 'concept:long', name: 'Fractions and decimals' }),
      concept({ conceptId: 'concept:exact', name: 'FRACTIONS' }),
    ];
    assert.deepEqual(names(conceptSearchResults(concepts, 'fractions')), [
      'FRACTIONS',
      'Fractions and decimals',
    ]);
  });
});

describe('conceptSearchResults: unique results and the limit', () => {
  it('returns one row per concept id, keeping the first occurrence', () => {
    const concepts = [
      concept({ conceptId: 'concept:a', name: 'Beta plan' }),
      concept({ conceptId: 'concept:a', name: 'Alpha plan' }),
      concept({ conceptId: 'concept:b', name: 'Gamma plan' }),
    ];
    assert.deepEqual(names(conceptSearchResults(concepts, 'plan')), ['Beta plan', 'Gamma plan']);
  });

  it('defaults to eight results and accepts a smaller or larger limit', () => {
    const concepts = Array.from({ length: 10 }, (_, i) =>
      concept({
        conceptId: `concept:c${i}`,
        name: `Concept ${String(i + 1).padStart(2, '0')}`,
        description: 'Practice',
      }),
    );
    assert.equal(conceptSearchResults(concepts, 'concept').length, 8);
    assert.deepEqual(names(conceptSearchResults(concepts, 'concept', 3)), [
      'Concept 01',
      'Concept 02',
      'Concept 03',
    ]);
    assert.equal(conceptSearchResults(concepts, 'concept', 99).length, 10);
    assert.deepEqual(conceptSearchResults(concepts, 'concept', 0), []);
    assert.deepEqual(conceptSearchResults(concepts, 'concept', -1), []);
  });
});

describe('conceptSearchSummary: the quiet count line', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    concept({
      conceptId: `concept:c${i}`,
      name: `Concept ${String(i + 1).padStart(2, '0')}`,
      description: 'Practice',
    }),
  );

  it('says nothing for a blank or too-short query, where the list is hidden anyway', () => {
    assert.equal(conceptSearchSummary(many, ''), null);
    assert.equal(conceptSearchSummary(many, '   '), null);
    assert.equal(conceptSearchSummary(many, 'c'), null);
  });

  it('says nothing when nothing matches, so the no-match line stays the only message', () => {
    assert.equal(conceptSearchSummary(many, 'geometry'), null);
    assert.equal(conceptSearchSummary([], 'concept'), null);
  });

  it('announces a single match in the singular', () => {
    assert.equal(conceptSearchSummary([concept()], 'fractions'), '1 concept found');
  });

  it('announces the total when every match fits under the limit', () => {
    assert.equal(conceptSearchSummary(many.slice(0, 3), 'concept'), '3 concepts found');
    // Exactly at the default limit: still a plain count.
    assert.equal(conceptSearchSummary(many.slice(0, 8), 'concept'), '8 concepts found');
    assert.equal(conceptSearchSummary(many.slice(0, 3), 'concept', 99), '3 concepts found');
  });

  it('announces the cut when the matches exceed the limit', () => {
    assert.equal(conceptSearchSummary(many, 'concept'), '8 of 10 concepts shown');
    assert.equal(conceptSearchSummary(many, 'concept', 3), '3 of 10 concepts shown');
  });

  it('says nothing for a non-positive or non-finite limit, where nothing is displayed', () => {
    assert.equal(conceptSearchSummary(many, 'concept', 0), null);
    assert.equal(conceptSearchSummary(many, 'concept', -1), null);
    assert.equal(conceptSearchSummary(many, 'concept', Number.NaN), null);
    assert.equal(conceptSearchSummary(many, 'concept', Number.POSITIVE_INFINITY), null);
  });

  it('counts duplicate concept ids once, like the result list does', () => {
    const duplicated = [
      concept({ conceptId: 'concept:a', name: 'Alpha plan' }),
      concept({ conceptId: 'concept:a', name: 'Beta plan' }),
      concept({ conceptId: 'concept:b', name: 'Gamma plan' }),
    ];
    assert.equal(conceptSearchSummary(duplicated, 'plan'), '2 concepts found');
    assert.equal(conceptSearchResults(duplicated, 'plan').length, 2);
  });

  it('always agrees with the result list it sits above', () => {
    const cases: Array<[string, number | undefined]> = [
      ['concept', undefined],
      ['concept', 3],
      ['concept', 0],
      ['concept', -2],
      ['concept 01', undefined],
      ['geometry', undefined],
    ];
    for (const [query, limit] of cases) {
      const summary = conceptSearchSummary(many, query, limit);
      const shown = conceptSearchResults(many, query, limit).length;
      if (summary === null) {
        assert.equal(shown, 0, `${query}/${limit}: summary silent but list shows ${shown}`);
        continue;
      }
      const match = /^(\d+)(?: of \d+ concepts shown| concepts? found)$/.exec(summary);
      assert.ok(match, `unrecognised summary: ${summary}`);
      assert.equal(shown, Number(match[1]), `${query}/${limit}: ${summary} but list shows ${shown}`);
    }
  });
});

describe('wiring guards (static)', () => {
  const source = (file: string) => readFileSync(file, 'utf8');

  it('keeps concept-search.ts pure, with only the concept type imported', () => {
    const search = source(SEARCH_FILE);
    const imports = search.match(/^import\b.*$/gm) ?? [];
    assert.deepEqual(imports, ["import type { ConceptNode } from './graph/types.ts';"]);
    assert.equal(/require\(/.test(search), false);
    assert.equal(/from 'react'|from '@\//.test(search), false);
    assert.match(search, /export const MIN_SEARCH_LENGTH = 2;/);
    assert.match(search, /export function searchQuery\(/);
    assert.match(search, /export function conceptSearchResults\(/);
    assert.match(search, /export function conceptSearchSummary\(/);
  });

  it('searches the already-loaded concepts and links to each lesson page', () => {
    const search = source(COMPONENT_FILE);
    assert.ok(
      search.includes(
        "import { conceptSearchResults, conceptSearchSummary, searchQuery } from '@/lib/concept-search';",
      ),
    );
    assert.match(search, /<label htmlFor=\{inputId\}[^>]*>\s*Search your concepts\s*<\/label>/);
    assert.match(search, /type="search"/);
    assert.match(search, /const results = conceptSearchResults\(concepts, query\);/);
    assert.match(search, /No concepts match “\{cleaned\}”\./);
    assert.match(
      search,
      /<Link\s+to="\/learn\/\$conceptId"\s+params=\{\{ conceptId: concept\.conceptId \}\}/,
    );
    assert.match(search, /\{concept\.name\}/);
    assert.match(search, /\{domainLabel\(concept\.domain\)\}/);

    // The Today panel feeds the shared box its already-loaded concept list.
    const today = source(TODAY_FILE);
    assert.ok(today.includes('concepts: allConcepts,'));
    assert.ok(today.includes('current.concepts.length > 0'));
    assert.ok(today.includes("import { ConceptSearch } from '@/components/ConceptSearch';"));
    assert.match(
      today,
      /<ConceptSearch key=\{`search-\$\{current\.learnerId\}`\} concepts=\{current\.concepts\} \/>/,
    );
    assert.equal(/createServerFn/.test(search), false);
    assert.equal(/graphCall/.test(search), false);
    assert.equal(/db\.searchConcepts/.test(search), false);
  });

  it('announces the match count in a polite status line between the input and the list', () => {
    const search = source(COMPONENT_FILE);
    assert.match(search, /const summary = conceptSearchSummary\(concepts, query\);/);
    assert.match(search, /\{summary && \(/);
    assert.match(
      search,
      /<p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">\s*\{summary\}\s*<\/p>/,
    );
    // The line sits below the search input and above the result list.
    const inputAt = search.indexOf('placeholder="Name, topic or tag"');
    const summaryAt = search.indexOf('<p role="status" aria-live="polite"');
    const listAt = search.indexOf('<ul aria-label="Concept search results"');
    assert.ok(inputAt !== -1, 'search input not found');
    assert.ok(summaryAt !== -1, 'summary line not found');
    assert.ok(listAt !== -1, 'result list not found');
    assert.ok(inputAt < summaryAt, 'summary must come after the input');
    assert.ok(summaryAt < listAt, 'summary must come before the result list');
  });

  it('does not add a migration or a new RPC method for the search', () => {
    const migrations = source(join(SRC_DIR, 'lib', 'migrations.ts'));
    const schemas = source(join(SRC_DIR, 'lib', 'graph', 'rpc-schemas.ts'));
    assert.equal(/concept.?search/i.test(migrations), false);
    assert.equal(/concept.?search/i.test(schemas), false);
  });
});
