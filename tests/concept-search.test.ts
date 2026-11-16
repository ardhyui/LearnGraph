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
import { MIN_SEARCH_LENGTH, conceptSearchResults, searchQuery } from '../src/lib/concept-search.ts';
import type { ConceptNode } from '../src/lib/graph/types.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const SEARCH_FILE = join(SRC_DIR, 'lib', 'concept-search.ts');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'StudyToday.tsx');

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
  });

  it('searches the already-loaded concepts and links to each lesson page', () => {
    const today = source(COMPONENT_FILE);
    assert.ok(
      today.includes("import { conceptSearchResults, searchQuery } from '@/lib/concept-search';"),
    );
    assert.ok(today.includes('concepts: allConcepts,'));
    assert.ok(today.includes('current.concepts.length > 0'));
    assert.match(
      today,
      /<ConceptSearch key=\{`search-\$\{current\.learnerId\}`\} concepts=\{current\.concepts\} \/>/,
    );
    assert.match(today, /<label htmlFor=\{inputId\}[^>]*>\s*Search your concepts\s*<\/label>/);
    assert.match(today, /type="search"/);
    assert.match(today, /const results = conceptSearchResults\(concepts, query\);/);
    assert.match(today, /No concepts match “\{cleaned\}”\./);
    assert.match(
      today,
      /<Link\s+to="\/learn\/\$conceptId"\s+params=\{\{ conceptId: concept\.conceptId \}\}/,
    );
    assert.match(today, /\{concept\.name\}/);
    assert.match(today, /\{domainLabel\(concept\.domain\)\}/);
    assert.equal(/createServerFn/.test(today), false);
    assert.equal(/graphCall/.test(today), false);
    assert.equal(/db\.searchConcepts/.test(today), false);
  });

  it('does not add a migration or a new RPC method for the search', () => {
    const migrations = source(join(SRC_DIR, 'lib', 'migrations.ts'));
    const schemas = source(join(SRC_DIR, 'lib', 'graph', 'rpc-schemas.ts'));
    assert.equal(/concept.?search/i.test(migrations), false);
    assert.equal(/concept.?search/i.test(schemas), false);
  });
});
