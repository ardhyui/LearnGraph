/**
 * The read-only documents behind MCP `resources/list` and `resources/read`
 * (Roadmap M4): learner summaries and concept details as plain Markdown.
 * Pure — no database, no React, no clock unless passed in — so the wording and
 * ordering can be unit-tested directly. `src/lib/mcp/tools.ts` supplies data
 * from the account's own graph.
 */
import type { ConceptNode, KnowledgeState } from '../graph/types.ts';
import { conceptLabel, conceptNameMap, humanizeConceptId } from '../gaps.ts';
import { masterySourceLabel } from '../evidence/labels.ts';

export const LEARNER_URI_PREFIX = 'learngraph://learner/';
export const CONCEPT_URI_PREFIX = 'learngraph://concept/';

/** `learngraph://learner/<encoded id>`. */
export function learnerResourceUri(id: string): string {
  return `${LEARNER_URI_PREFIX}${encodeURIComponent(id)}`;
}

/** `learngraph://concept/<encoded id>`. */
export function conceptResourceUri(id: string): string {
  return `${CONCEPT_URI_PREFIX}${encodeURIComponent(id)}`;
}

export type ResourceUri = { kind: 'learner'; id: string } | { kind: 'concept'; id: string };

/**
 * Decode a resource URI into the kind and id it names, or `null` when it is
 * not one of this server's two shapes (or carries a broken percent escape).
 */
export function parseResourceUri(uri: string): ResourceUri | null {
  for (const [kind, prefix] of [
    ['learner', LEARNER_URI_PREFIX],
    ['concept', CONCEPT_URI_PREFIX],
  ] as const) {
    if (!uri.startsWith(prefix)) continue;
    const encoded = uri.slice(prefix.length);
    if (!encoded) return null;
    try {
      return { kind, id: decodeURIComponent(encoded) };
    } catch {
      return null;
    }
  }
  return null;
}

/** Case-insensitive, locale-independent name order with a stable id tie-break. */
function compareText(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function nameForLearner(id: string, name: string | undefined): string {
  return cleanText(name) || id;
}

function percent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function dueTime(nextReview: string | undefined): number | null {
  if (!nextReview) return null;
  const parsed = Date.parse(nextReview);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export interface LearnerResourceInput {
  learner: { id: string; name?: string };
  states: readonly KnowledgeState[];
  concepts: readonly ConceptNode[];
  now: Date;
}

/**
 * One learner as Markdown: their name, a mastery line per concept (with where
 * the number came from), and the reviews due right now. Empty sections say so
 * calmly instead of showing a blank page.
 */
export function learnerResourceMarkdown(input: LearnerResourceInput): string {
  const names = conceptNameMap(input.concepts);
  const rows = input.states
    .map((state) => ({
      state,
      name: names.get(state.conceptId) ?? humanizeConceptId(state.conceptId),
    }))
    .sort(
      (a, b) => compareText(a.name, b.name) || compareText(a.state.conceptId, b.state.conceptId),
    );

  const lines = [`# ${nameForLearner(input.learner.id, input.learner.name)}`, '', '## Mastery', ''];
  if (rows.length === 0) {
    lines.push('No concepts yet.', '', 'A first lesson or quiz will add concepts here.');
  } else {
    for (const { state, name } of rows) {
      lines.push(
        `- ${name} — ${percent(state.mastery)}% (${masterySourceLabel(state.masterySource)})`,
      );
    }
  }

  lines.push('', '## Reviews due now', '');
  const now = input.now.getTime();
  const due = rows.filter(({ state }) => {
    const when = dueTime(state.nextReview);
    return when !== null && Number.isFinite(now) && when <= now;
  });
  if (due.length === 0) {
    lines.push('Nothing due right now.', '', 'Reviews come back here when they are due.');
  } else {
    for (const { state, name } of due) {
      lines.push(`- ${name} — ${dateOnly(state.nextReview as string)}`);
    }
  }

  return lines.join('\n').trimEnd();
}

export interface ConceptResourceInput {
  concept: ConceptNode;
  /** Direct prerequisites already resolved to their learner-facing names. */
  prerequisites: readonly { conceptId: string; name?: string | null }[];
}

function timeEstimateLine(concept: ConceptNode): string | null {
  const estimates = concept.timeEstimates;
  if (!estimates) return null;
  const parts: string[] = [];
  const add = (minutes: number, label: string) => {
    if (Number.isFinite(minutes)) parts.push(`${minutes} min ${label}`);
  };
  add(estimates.introduction, 'introduction');
  add(estimates.basicMastery, 'to basic mastery');
  add(estimates.deepMastery, 'to deep mastery');
  return parts.length ? parts.join(' · ') : null;
}

/**
 * One concept as Markdown: name, domain, description, learning time when the
 * graph has estimates, and direct prerequisites by name (never raw ids).
 */
export function conceptResourceMarkdown(input: ConceptResourceInput): string {
  const concept = input.concept;
  const lines = [`# ${conceptLabel(concept.conceptId, concept.name)}`, ''];

  lines.push(`- Domain: ${cleanText(concept.domain) || 'Unspecified'}`);
  const description = cleanText(concept.description);
  if (description) lines.push(`- Description: ${description}`);
  const estimate = timeEstimateLine(concept);
  if (estimate) lines.push(`- Time estimate: ${estimate}`);

  const prerequisites = new Map<string, string>();
  for (const prerequisite of input.prerequisites) {
    if (typeof prerequisite.conceptId !== 'string' || !prerequisite.conceptId) continue;
    if (!prerequisites.has(prerequisite.conceptId)) {
      prerequisites.set(
        prerequisite.conceptId,
        conceptLabel(prerequisite.conceptId, prerequisite.name),
      );
    }
  }
  if (prerequisites.size > 0) {
    lines.push('', '## Prerequisites', '');
    const names = [...prerequisites.entries()].sort(
      ([idA, nameA], [idB, nameB]) => compareText(nameA, nameB) || compareText(idA, idB),
    );
    for (const [, name] of names) lines.push(`- ${name}`);
  }

  return lines.join('\n').trimEnd();
}
