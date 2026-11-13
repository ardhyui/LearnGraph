/**
 * Demo data seeding — moved from the old browser DBProvider to the server.
 * Runs once per account, when its workspace is empty (same rule as before).
 */
import type { EducationGraphDB } from './education-graph-db.ts';
import { demoLearners, demoConcepts, demoEdges, demoKnowledgeStates, shiftDemoDate } from '../demo-data.ts';

/**
 * Seed the demo dataset if the workspace has no learners and no concepts.
 * Demo progress dates are moved to be relative to `now` (see shiftDemoDate),
 * so the example learners have a realistic mix of due and upcoming reviews.
 * Returns true if seeded.
 */
export async function seedDemoDataIfEmpty(db: EducationGraphDB, now: Date = new Date()): Promise<boolean> {
  // The user chose "Start with an empty workspace": an empty workspace stays empty.
  if (await db.getMeta(DEMO_DECLINED_FLAG)) return false;
  const stats = await db.getStats();
  if (!(stats.learnerCount === 0 && stats.conceptCount === 0)) return false;

  // Seed learners
  for (const learner of demoLearners) {
    await db.setLearnerProfile(learner.userId, {
      name: learner.name,
      email: learner.email,
      learningStyle: learner.learningStyle,
      cognitiveProfile: learner.cognitiveProfile,
      psychometricScores: learner.psychometricScores as any, // legacy bare 0–1 numbers (ignored by the engine)
      tags: learner.tags,
      notes: learner.notes,
    });
  }

  // Seed concepts
  for (const concept of demoConcepts) {
    // Demo data uses 'id' but actual type uses 'conceptId'
    const conceptId = (concept as any).id?.replace('concept:', '') || (concept as any).conceptId;
    const difficultyValue = typeof concept.difficulty === 'number' ? concept.difficulty : 5;
    const estimatedMins = (concept as any).estimatedMinutes || 60;
    await db.addConcept({
      conceptId,
      name: concept.name,
      domain: concept.domain,
      description: concept.description || '',
      difficulty: {
        absolute: difficultyValue,
        cognitiveLoad: 0.5,
        abstractness: 0.5,
      },
      timeEstimates: {
        introduction: Math.round(estimatedMins / 4),
        basicMastery: estimatedMins,
        deepMastery: estimatedMins * 2,
      },
    });
  }

  // Seed edges
  for (const edge of demoEdges) {
    const from = edge.from.replace('concept:', '');
    const to = edge.to.replace('concept:', '');
    // Demo data uses 'weight' but actual type uses 'strength'
    const weight = (edge as any).weight ?? 1.0;
    await db.addEdge({
      from,
      to,
      strength: weight >= 0.9 ? 'required' : weight >= 0.7 ? 'recommended' : 'helpful',
    });
  }

  // Seed knowledge states
  for (const state of demoKnowledgeStates) {
    // Same id as the seeded learner profile (`demo-alice`). Until 2026-11-01
    // the `demo-` prefix was stripped here, so the progress landed on a
    // learner that does not exist (see repairDemoKnowledgeStates).
    const learnerId = (state as any).learnerId || '';
    const conceptId = (state.conceptId || '').replace('concept:', '');
    const confidence = (state as any).confidence ?? 0.8;
    const lastReviewed = shiftDemoDate((state as any).lastReviewed, now);
    // First seen can't be after the last review.
    const createdAt = shiftDemoDate((state as any).createdAt, now);
    const firstSeen = createdAt <= lastReviewed ? createdAt : lastReviewed;
    const reviewCount = (state as any).reviewCount ?? 0;

    if (learnerId && conceptId) {
      await db.setKnowledgeState(
        learnerId,
        conceptId,
        {
          mastery: state.mastery,
          retentionStrength: confidence,
          lastReviewed,
          firstSeen,
          reviewCount: reviewCount,
        }
      );
    }
  }

  return true;
}

/**
 * Workspaces seeded before 2026-11-01 have their demo progress stored under
 * `alice`/`bob`/`carol` while the profiles are `demo-alice`/… — so the demo
 * learners showed no progress at all. Copy those states onto the real demo
 * learner, only when that is unambiguous: the `demo-*` profile exists, it has
 * no knowledge states of its own yet, and there is no learner profile with the
 * short id (so the states really are orphans). Additive: the orphaned rows are
 * left untouched. Runs once per workspace (a meta flag is set afterwards), so
 * a user who later resets a demo learner's progress doesn't get it back.
 * Returns the number of states copied.
 */
export const DEMO_STATES_REPAIR_FLAG = 'repair:demo-knowledge-states';

export async function repairDemoKnowledgeStates(db: EducationGraphDB): Promise<number> {
  if (await db.getMeta(DEMO_STATES_REPAIR_FLAG)) return 0;
  let copied = 0;
  for (const learner of demoLearners) {
    const demoId = learner.userId;
    const shortId = demoId.replace(/^demo-/, '');
    if (shortId === demoId) continue;
    if (!(await db.getLearnerProfile(demoId))) continue;
    if (await db.getLearnerProfile(shortId)) continue;
    if ((await db.getLearnerKnowledgeStates(demoId)).length > 0) continue;
    const orphans = await db.getLearnerKnowledgeStates(shortId);
    for (const state of orphans) {
      const { userId: _owner, conceptId, updatedAt: _updated, lastAccessed: _accessed, ...rest } = state;
      await db.setKnowledgeState(demoId, conceptId, rest);
      copied++;
    }
  }
  await db.setMeta(DEMO_STATES_REPAIR_FLAG, { at: new Date().toISOString(), copied });
  return copied;
}

/** Meta flag: this workspace chose to start without the example data (never seed it again). */
export const DEMO_DECLINED_FLAG = 'seed:demo-declined';

/**
 * "Start with an empty workspace" (Roadmap M3): remove the example learners
 * and the example concepts that still look like the examples (same id and
 * subject), with their prerequisites, progress, quiz questions and lessons,
 * and remember the choice so the examples are not seeded again. The user's own
 * learners and concepts are left alone (only their progress on a removed
 * example concept goes with it).
 */
export async function removeDemoData(db: EducationGraphDB): Promise<{ learners: number; concepts: number }> {
  let learners = 0;
  let concepts = 0;
  const demoLearnerIds = new Set(demoLearners.map((l) => l.userId));
  const profiles = await db.listLearnerProfiles();
  for (const profile of profiles) {
    if (!demoLearnerIds.has(profile.userId)) continue;
    await db.deleteLearnerProfile(profile.userId);
    learners++;
  }
  const remaining = profiles.filter((p) => !demoLearnerIds.has(p.userId)).map((p) => p.userId);
  for (const demo of demoConcepts) {
    const conceptId = demo.id.replace('concept:', '');
    const concept = await db.getConcept(conceptId);
    if (!concept || concept.domain !== demo.domain) continue;
    for (const learnerId of remaining) await db.deleteKnowledgeState(learnerId, conceptId);
    await db.deleteConcept(conceptId);
    concepts++;
  }
  await db.setMeta(DEMO_DECLINED_FLAG, { at: new Date().toISOString(), learners, concepts });
  return { learners, concepts };
}
