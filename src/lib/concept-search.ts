/**
 * "Find a concept" search for the Today panel: a learner who already knows the
 * name of a concept can open its lesson without scrolling the review and
 * "Learn next" lists. Pure — no React, database or clock — so the matching and
 * ordering are unit-tested directly. Same match fields as the graph engine's
 * `searchConcepts` (name, description, id, domain, tags), but one character is
 * too little to be useful.
 */
import type { ConceptNode } from './graph/types.ts';

/** Queries shorter than this (after cleaning) are not searched at all. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Clean a typed query: trim the ends and collapse runs of whitespace. Returns
 * an empty string when fewer than two characters remain, so the caller can
 * hide the result list instead of showing a "no matches" error for one letter.
 */
export function searchQuery(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length < MIN_SEARCH_LENGTH ? '' : cleaned;
}

/** Case-insensitive text for a field, tolerating missing values at runtime. */
const lower = (value: unknown) => String(value ?? '').toLowerCase();

/** Case-insensitive match against every field the engine searches. */
function matches(concept: ConceptNode, needle: string): boolean {
  return (
    lower(concept.name).includes(needle) ||
    lower(concept.description).includes(needle) ||
    lower(concept.conceptId).includes(needle) ||
    lower(concept.domain).includes(needle) ||
    (Array.isArray(concept.tags) &&
      concept.tags.some((tag) => typeof tag === 'string' && tag.toLowerCase().includes(needle)))
  );
}

/**
 * Up to `limit` concepts matching a query, unique by concept id: an exact name
 * first, then names that contain it, then matches found in other fields — each
 * group ordered by name. Empty for a blank or too-short query.
 */
export function conceptSearchResults(
  concepts: readonly ConceptNode[],
  query: string,
  limit = 8,
): ConceptNode[] {
  const cleaned = searchQuery(query);
  if (!cleaned) return [];
  const needle = cleaned.toLowerCase();
  const seen = new Set<string>();
  const found: ConceptNode[] = [];
  for (const concept of concepts) {
    if (seen.has(concept.conceptId)) continue;
    seen.add(concept.conceptId);
    if (matches(concept, needle)) found.push(concept);
  }
  const rank = (concept: ConceptNode) => {
    const name = lower(concept.name);
    return name === needle ? 0 : name.includes(needle) ? 1 : 2;
  };
  const byName = (a: ConceptNode, b: ConceptNode) => {
    const nameA = lower(a.name);
    const nameB = lower(b.name);
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    const idA = String(a.conceptId ?? '');
    const idB = String(b.conceptId ?? '');
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  };
  found.sort((a, b) => rank(a) - rank(b) || byName(a, b));
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  return found.slice(0, cap);
}
