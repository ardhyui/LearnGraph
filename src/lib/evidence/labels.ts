/**
 * Learner-facing words for learning evidence: where a mastery value came from,
 * what a quiz result means, and the retention measure. Pure, unit-tested.
 */
import type { ConceptNode, MasterySource } from '../graph/types.ts';
import type { RetentionStat } from './events.ts';

/** "From quizzes" vs the self-reported kinds (decision D5: always labelled). */
export function masterySourceLabel(source: MasterySource | null | undefined): string {
  switch (source) {
    case 'quiz':
      return 'From quizzes';
    case 'self_report':
      return 'Self-reported';
    case 'manual':
      return 'Set by hand';
    case 'practice':
      return 'From practice notes';
    case 'sync':
      return 'Synced from Michi';
    default:
      return 'Not quiz-checked';
  }
}

/** How a learner shows they know a concept on the Today panel. */
export type EvidenceMode = 'quiz' | 'elsewhere' | 'self-report';

export function evidenceMode(
  concept: Pick<ConceptNode, 'conceptId' | 'evidenceRequired'>,
  questionCounts: Readonly<Record<string, number>>,
): EvidenceMode {
  if ((questionCounts[concept.conceptId] ?? 0) > 0) return 'quiz';
  return concept.evidenceRequired ? 'elsewhere' : 'self-report';
}

/** The Today notice after a graded quiz. */
export function quizResultNotice(r: {
  conceptName: string;
  correct: number;
  total: number;
  passed: boolean;
  wasDue: boolean;
  masteryBefore: number;
  mastery: number;
}): string {
  const score = `${r.correct} of ${r.total} correct`;
  if (!r.passed) {
    return `${score} — not passed yet. “${r.conceptName}” stays in your plan: read the explanations and try again later.`;
  }
  if (r.wasDue) return `${score} — passed! “${r.conceptName}” will come back after a longer break.`;
  if (r.masteryBefore >= 80) return `${score} — passed. “${r.conceptName}” keeps its review date.`;
  return `${score} — passed! “${r.conceptName}” is mastered. A short review quiz comes back tomorrow.`;
}

/** "3 of 4 due reviews answered correctly (75%)", or `null` with none yet. */
export function retentionLine(stat: RetentionStat): string | null {
  if (!stat.answered || stat.rate === null) return null;
  const noun = stat.answered === 1 ? 'due review' : 'due reviews';
  return `${stat.correct} of ${stat.answered} ${noun} answered correctly (${Math.round(stat.rate * 100)}%)`;
}
