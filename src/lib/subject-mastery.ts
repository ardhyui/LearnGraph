/**
 * "Mastery by subject" for My Profile: one row per chosen subject (or every
 * subject that has concepts when no focus is set), so a learner can see which
 * subjects are already mastered and which still need work without opening the
 * Knowledge Graph or Gap Analysis.
 *
 * Pure (no React/DB): the profile card passes the concepts and knowledge states
 * it already loads. Mastery follows `summarizeProgress` exactly — same
 * threshold, same clamping — so the per-subject rows always add up to the
 * overall progress line.
 */
import type { ConceptNode, KnowledgeState } from './graph/types.ts';
import { domainLabel } from './onboarding.ts';
import { summarizeProgress } from './study.ts';

export interface SubjectMasteryRow {
  domain: string;
  /** Human name from `domainLabel` (`computer-science` → `Computer science`). */
  label: string;
  total: number;
  mastered: number;
  /** 0–100, rounded share of the subject's concepts that are mastered. */
  percent: number;
}

type ConceptLike = Pick<ConceptNode, 'conceptId' | 'domain'>;
type StateLike = Pick<KnowledgeState, 'conceptId' | 'mastery' | 'userId'>;

/**
 * Rows for the learner's subjects:
 * - only subjects that actually have concepts are shown;
 * - with `focus`, only those subjects, in the learner's chosen order;
 * - without `focus`, every subject with concepts, by label;
 * - states for any other learner are dropped when `learnerId` is given, and a
 *   concept without a state counts as not started.
 */
export function subjectMastery(
  concepts: ConceptLike[],
  states: StateLike[],
  focus: string[] = [],
  learnerId?: string,
): SubjectMasteryRow[] {
  const ownStates =
    learnerId === undefined ? states : states.filter((state) => state.userId === learnerId);

  const byDomain = new Map<string, ConceptLike[]>();
  for (const concept of concepts) {
    if (!concept.domain) continue;
    const group = byDomain.get(concept.domain);
    if (group) group.push(concept);
    else byDomain.set(concept.domain, [concept]);
  }

  const rows: SubjectMasteryRow[] = [];
  const seen = new Set<string>();
  const add = (domain: string) => {
    if (seen.has(domain)) return;
    const group = byDomain.get(domain);
    if (!group || group.length === 0) return;
    seen.add(domain);
    const progress = summarizeProgress(group, ownStates);
    rows.push({
      domain,
      label: domainLabel(domain),
      total: progress.total,
      mastered: progress.mastered,
      percent: progress.percentMastered,
    });
  };

  for (const domain of focus) add(domain);
  if (focus.length === 0) {
    const all = [...byDomain.keys()].sort((a, b) => domainLabel(a).localeCompare(domainLabel(b)));
    for (const domain of all) add(domain);
  }

  return rows;
}
