/**
 * Import a learner from a LearnGraph JSON export (Roadmap M3: "Impor JSON
 * sebagai pasangan ekspor dari PR #29"). The file format is the one PR #29's
 * "Download my data" writes (`learngraph.learner-export`, version 1). Pure
 * planning here (validated, no I/O), unit-tested; the server applies the plan.
 *
 * Rules:
 * - The import always creates a NEW learner; it never overwrites one.
 * - Progress is kept only for concepts that exist in this workspace.
 * - Imported mastery counts as entered by hand (`masterySource: 'manual'`),
 *   and on quiz-checked concepts it stays below "mastered" (79): a file can't
 *   claim what only a passed quiz may show (decision D5).
 * - Everything is validated with the same schemas as the graph API.
 */
import { z } from 'zod';
import { knowledgeStateInput, learnerProfileInput } from './graph/rpc-schemas.ts';
import type { KnowledgeState, LearnerProfile } from './graph/types.ts';
import { makeLearnerId } from './onboarding.ts';

export const IMPORT_FORMAT = 'learngraph.learner-export';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_STATES = 2000;
/** Highest mastery an import may give a quiz-checked concept (below "mastered" at 80). */
export const EVIDENCE_IMPORT_CAP = 79;

const exportFile = z.object({
  format: z.literal(IMPORT_FORMAT),
  version: z.literal(1),
  exportedAt: z.string().max(64).optional(),
  learner: z.object({
    id: z.string().max(512).optional(),
    name: z.string().max(200).optional(),
    profile: z.record(z.string(), z.unknown()),
  }),
  knowledgeStates: z.array(z.record(z.string(), z.unknown())).max(MAX_IMPORT_STATES),
});

export class ImportError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export interface ImportPlan {
  learnerId: string;
  name: string;
  /** Validated like setLearnerProfile through the API (same schema, then the engine's type). */
  profile: Partial<LearnerProfile>;
  states: { conceptId: string; patch: Partial<KnowledgeState> }[];
  /** Concept ids in the file that this workspace does not have. */
  skippedConcepts: string[];
  /** Quiz-checked concepts whose imported mastery was lowered to the cap. */
  capped: string[];
}

/** Parse and check a file's text; throws ImportError with a readable message. */
export function parseLearnerExport(text: string): z.infer<typeof exportFile> {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError('The file is too large to import (max 2 MB).');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('This is not a JSON file.');
  }
  const parsed = exportFile.safeParse(json);
  if (!parsed.success) {
    throw new ImportError('This file is not a LearnGraph learner export (format "learngraph.learner-export", version 1).');
  }
  return parsed.data;
}

export function planLearnerImport(
  file: z.infer<typeof exportFile>,
  workspace: {
    learnerIds: Iterable<string>;
    conceptIds: ReadonlySet<string>;
    /** Concepts whose mastery must come from evidence (quiz bank or flag). */
    evidenceRequired: (conceptId: string) => boolean;
  },
): ImportPlan {
  // Same validation as setLearnerProfile through the API (unknown fields dropped).
  const profileResult = learnerProfileInput.safeParse(file.learner.profile);
  if (!profileResult.success) throw new ImportError('The learner profile in this file is not valid.');
  const profile = profileResult.data;
  const name = (profile.name || file.learner.name || 'Imported learner').trim().slice(0, 200) || 'Imported learner';
  const learnerId = makeLearnerId(name, workspace.learnerIds);

  const states: ImportPlan['states'] = [];
  const skipped = new Set<string>();
  const capped: string[] = [];
  const seen = new Set<string>();
  for (const raw of file.knowledgeStates) {
    const conceptId = typeof raw.conceptId === 'string' ? raw.conceptId : '';
    if (!conceptId || seen.has(conceptId)) continue;
    seen.add(conceptId);
    if (!workspace.conceptIds.has(conceptId)) {
      skipped.add(conceptId);
      continue;
    }
    const parsed = knowledgeStateInput.safeParse(raw);
    if (!parsed.success) {
      skipped.add(conceptId);
      continue;
    }
    // Validated like setKnowledgeState through the API (graphCall casts the same way).
    const patch = { ...parsed.data } as Partial<KnowledgeState>;
    if (patch.mastery !== undefined) {
      patch.masterySource = 'manual';
      if (workspace.evidenceRequired(conceptId) && patch.mastery > EVIDENCE_IMPORT_CAP) {
        patch.mastery = EVIDENCE_IMPORT_CAP;
        capped.push(conceptId);
      }
    }
    states.push({ conceptId, patch });
  }
  return {
    learnerId,
    name,
    profile: { ...(profile as Partial<LearnerProfile>), name },
    states,
    skippedConcepts: [...skipped].sort(),
    capped,
  };
}
