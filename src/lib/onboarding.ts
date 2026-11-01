/**
 * New-user onboarding: a first-visit "Welcome" step on the dashboard that
 * creates the learner's own profile (name + subjects to focus on + where they
 * start) instead of leaving them on the demo learners. Pure helpers (no I/O)
 * so they are unit-tested directly; the dashboard sends the results through
 * the existing, server-validated `setLearnerProfile` / `setKnowledgeState`.
 */
import type { ConceptNode, LearnerProfile, PrerequisiteEdge } from './graph/types.ts';

/** Demo learners seeded into every new workspace use this id prefix. */
export const DEMO_LEARNER_PREFIX = 'demo-';
/** Tag prefix that stores a learner's chosen subjects (`focus:mathematics`). */
export const FOCUS_TAG_PREFIX = 'focus:';
/** Server limit for one tag (rpc-schemas `tags`). */
const MAX_TAG_LENGTH = 64;
const MAX_NAME_LENGTH = 200;

export function isDemoLearner(learner: Pick<LearnerProfile, 'userId'>): boolean {
  return learner.userId.startsWith(DEMO_LEARNER_PREFIX);
}

/** Onboarding is offered while the workspace has no learner of the user's own. */
export function needsOnboarding(learners: Pick<LearnerProfile, 'userId'>[]): boolean {
  return !learners.some((l) => !isDemoLearner(l));
}

/** Trim and collapse whitespace; `null` if nothing usable is left. */
export function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
  return name ? name : null;
}

/**
 * Storage id for a new learner: `me-<slug>` (lowercase a–z, 0–9, `-`), unique
 * among `existingIds`. Never starts with the demo prefix and never contains
 * `:` (the server's key separator), so it always passes `writeId`.
 */
export function makeLearnerId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const slug =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'learner';
  const base = `me-${slug}`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const id = `${base}-${i}`;
    if (!taken.has(id)) return id;
  }
}

/** Distinct concept domains, sorted, with how many concepts each has. */
export function listDomains(concepts: Pick<ConceptNode, 'domain'>[]): { domain: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of concepts) {
    if (!c.domain) continue;
    counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/** Human label for a domain id: `computer-science` → `Computer science`. */
export function domainLabel(domain: string): string {
  const words = domain.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : domain;
}

/** Tags that record the chosen subjects (domains too long for a tag are skipped). */
export function focusTags(domains: string[]): string[] {
  return [...new Set(domains)]
    .map((d) => `${FOCUS_TAG_PREFIX}${d}`)
    .filter((t) => t.length <= MAX_TAG_LENGTH)
    .slice(0, 20);
}

/** Subjects a learner chose during onboarding (empty = everything). */
export function focusDomains(learner: Pick<LearnerProfile, 'tags'> | null | undefined): string[] {
  return (learner?.tags ?? [])
    .filter((t) => t.startsWith(FOCUS_TAG_PREFIX))
    .map((t) => t.slice(FOCUS_TAG_PREFIX.length))
    .filter(Boolean);
}

/**
 * Keep only items in the learner's focus subjects. Falls back to all items if
 * there is no focus, or if none of the focus subjects exist any more (e.g. the
 * domain was renamed) — the plan is never empty just because of a stale tag.
 * Returns the same array instance when it falls back (callers may check that).
 */
export function inFocus<T>(items: T[], focus: string[], domainOf: (item: T) => string | undefined): T[] {
  if (focus.length === 0) return items;
  const wanted = new Set(focus);
  const kept = items.filter((item) => {
    const d = domainOf(item);
    return d !== undefined && wanted.has(d);
  });
  return kept.length > 0 ? kept : items;
}

/**
 * "I already know the basics": the entry-level concepts of the chosen
 * subjects — those with no prerequisite inside the workspace. Marking them as
 * known lets the plan start one step further instead of at the very bottom.
 */
export function basicConcepts(
  concepts: Pick<ConceptNode, 'conceptId' | 'domain'>[],
  edges: Pick<PrerequisiteEdge, 'from' | 'to'>[],
  domains: string[],
): string[] {
  const ids = new Set(concepts.map((c) => c.conceptId));
  const hasPrereq = new Set(edges.filter((e) => ids.has(e.from)).map((e) => e.to));
  return inFocus(concepts, domains, (c) => c.domain)
    .filter((c) => !hasPrereq.has(c.conceptId))
    .map((c) => c.conceptId);
}
