/**
 * Whole-workspace export for the teacher/admin (Roadmap P0 #6): every learner
 * of the signed-in account with their full profile and knowledge states,
 * together with the workspace's own concepts and prerequisite edges, as one
 * JSON file made on the device. Pure functions (no I/O): the component loads
 * the data through the same account-scoped read RPCs the admin pages already
 * use, so no new server function or schema is needed.
 *
 * The format/version are explicit so a future import can validate the file
 * (`learngraph.workspace-export`, version 1). States of deleted concepts are
 * kept (they belong to the learner), and states whose learner is not in the
 * list are dropped — the file never carries anything beyond the data given.
 */
import type { ConceptNode, KnowledgeState, LearnerProfile, PrerequisiteEdge } from './graph/types.ts';
import { focusDomains } from './onboarding.ts';

export const WORKSPACE_EXPORT_FORMAT = 'learngraph.workspace-export';
export const WORKSPACE_EXPORT_VERSION = 1;

export interface WorkspaceLearnerExport {
  id: string;
  name: string;
  subjects: string[];
  profile: LearnerProfile;
  /** Every knowledge state of this learner as stored (history, dates, deleted concepts). */
  knowledgeStates: KnowledgeState[];
}

export interface WorkspaceExport {
  format: typeof WORKSPACE_EXPORT_FORMAT;
  version: typeof WORKSPACE_EXPORT_VERSION;
  exportedAt: string;
  learners: WorkspaceLearnerExport[];
  /** Every concept of the workspace, including ones the account made itself. */
  concepts: ConceptNode[];
  /** Every prerequisite edge of the workspace. */
  edges: PrerequisiteEdge[];
}

/**
 * Build the whole-workspace export from data already loaded through the
 * account-scoped reads. Defensive on purpose: null entries and duplicates are
 * dropped, and each learner only ever receives its own states.
 */
export function buildWorkspaceExport(input: {
  learners: readonly (LearnerProfile | null | undefined)[];
  states: readonly (KnowledgeState | null | undefined)[];
  concepts: readonly (ConceptNode | null | undefined)[];
  edges: readonly (PrerequisiteEdge | null | undefined)[];
  now: Date;
}): WorkspaceExport {
  const byLearner = new Map<string, KnowledgeState[]>();
  const conceptSeen = new Set<string>();
  const edgeSeen = new Set<string>();
  const concepts: ConceptNode[] = [];
  const edges: PrerequisiteEdge[] = [];

  for (const c of input.concepts) {
    if (!c || typeof c.conceptId !== 'string' || conceptSeen.has(c.conceptId)) continue;
    conceptSeen.add(c.conceptId);
    concepts.push(c);
  }
  for (const e of input.edges) {
    if (!e || typeof e.edgeId !== 'string' || edgeSeen.has(e.edgeId)) continue;
    edgeSeen.add(e.edgeId);
    edges.push(e);
  }

  const learners: WorkspaceLearnerExport[] = [];
  const learnerSeen = new Set<string>();
  for (const learner of input.learners) {
    if (!learner || typeof learner.userId !== 'string' || learnerSeen.has(learner.userId)) continue;
    learnerSeen.add(learner.userId);
    learners.push({
      id: learner.userId,
      name: learner.name || learner.userId,
      subjects: focusDomains(learner),
      profile: learner,
      knowledgeStates: [],
    });
    byLearner.set(learner.userId, learners[learners.length - 1]!.knowledgeStates);
  }

  // Only states of listed learners travel with the file (one per concept).
  const stateSeen = new Set<string>();
  for (const s of input.states) {
    if (!s || typeof s.userId !== 'string' || typeof s.conceptId !== 'string') continue;
    const key = `${s.userId}\u0000${s.conceptId}`;
    if (stateSeen.has(key)) continue;
    const own = byLearner.get(s.userId);
    if (!own) continue;
    stateSeen.add(key);
    own.push(s);
  }

  return {
    format: WORKSPACE_EXPORT_FORMAT,
    version: WORKSPACE_EXPORT_VERSION,
    exportedAt: Number.isFinite(input.now.getTime()) ? input.now.toISOString() : '',
    learners,
    concepts,
    edges,
  };
}

/** `learngraph-workspace-2026-11-13.json` (local date; ASCII-only name). */
export function workspaceExportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = Number.isFinite(now.getTime())
    ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    : 'undated';
  return `learngraph-workspace-${date}.json`;
}
