/**
 * "Find a concept" search for the Today panel: a learner who already knows the
 * name of a concept can open its lesson without scrolling the review and
 * "Learn next" lists. Pure — no React, database or clock — so the matching and
 * ordering are unit-tested directly. Same match fields as the graph engine's
 * `searchConcepts` (name, description, id, domain, tags), but one character is
 * too little to be useful. The result list and the count summary share one
 * ranked-match path, so they can never disagree.
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

/** Clamp a result limit the way the list always has: finite, floored, ≥ 0. */
const resultLimit = (limit: number) => (Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0);

/**
 * Every concept matching a cleaned query, unique by concept id (first
 * occurrence wins) and ranked as the result list ranks them: an exact name
 * first, then names that contain the query, then matches in other fields —
 * each group ordered by name. Shared by the result list and the summary line
 * so the announced count can never disagree with the list.
 */
function rankedMatches(concepts: readonly ConceptNode[], cleaned: string): ConceptNode[] {
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
  return found;
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
  return rankedMatches(concepts, cleaned).slice(0, resultLimit(limit));
}

/**
 * One quiet line under the search box: how many concepts matched, and whether
 * the list was cut short by the limit. A screen reader hears nothing when the
 * result list itself changes, so this polite status line is the announcement.
 * `null` means "say nothing": a blank or too-short query (the list is hidden
 * anyway), no matches (the existing "No concepts match" line already speaks
 * for that case), or a non-positive limit (nothing is displayed at all).
 */
export function conceptSearchSummary(
  concepts: readonly ConceptNode[],
  query: string,
  limit = 8,
): string | null {
  const cleaned = searchQuery(query);
  if (!cleaned) return null;
  const cap = resultLimit(limit);
  if (cap <= 0) return null;
  const total = rankedMatches(concepts, cleaned).length;
  if (total === 0) return null;
  if (total === 1) return '1 concept found';
  if (total <= cap) return `${total} concepts found`;
  return `${cap} of ${total} concepts shown`;
}
