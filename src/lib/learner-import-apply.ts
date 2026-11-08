/**
 * Apply a learner import (see learner-import.ts) to one account's workspace.
 * Takes the database and the owner's graph explicitly, like the other
 * evidence-aware services, so the tests run the same code.
 */
import type { Kysely } from 'kysely';
import type { EducationGraphDB } from './graph/education-graph-db.ts';
import { questionCounts } from './evidence/service.ts';
import { parseLearnerExport, planLearnerImport } from './learner-import.ts';

export interface ImportResult {
  learnerId: string;
  name: string;
  imported: number;
  skippedConcepts: string[];
  capped: string[];
}

export async function importLearnerFile(
  db: Kysely<any>,
  graph: EducationGraphDB,
  owner: string,
  text: string,
): Promise<ImportResult> {
  const file = parseLearnerExport(text);
  const [learners, concepts, counts] = await Promise.all([
    graph.listLearnerProfiles(),
    graph.listConcepts(),
    questionCounts(db, owner),
  ]);
  const flagged = new Set(concepts.filter((c) => c.evidenceRequired).map((c) => c.conceptId));
  const plan = planLearnerImport(file, {
    learnerIds: learners.map((l) => l.userId),
    conceptIds: new Set(concepts.map((c) => c.conceptId)),
    evidenceRequired: (id) => flagged.has(id) || (counts[id] ?? 0) > 0,
  });
  await graph.setLearnerProfile(plan.learnerId, plan.profile);
  for (const s of plan.states) await graph.setKnowledgeState(plan.learnerId, s.conceptId, s.patch);
  return {
    learnerId: plan.learnerId,
    name: plan.name,
    imported: plan.states.length,
    skippedConcepts: plan.skippedConcepts,
    capped: plan.capped,
  };
}
