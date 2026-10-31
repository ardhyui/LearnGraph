/**
 * Demo data seeding — moved from the old browser DBProvider to the server.
 * Runs once per account, when its workspace is empty (same rule as before).
 */
import type { EducationGraphDB } from './education-graph-db.ts';
import { demoLearners, demoConcepts, demoEdges, demoKnowledgeStates } from '../demo-data.ts';

/** Seed the demo dataset if the workspace has no learners and no concepts. Returns true if seeded. */
export async function seedDemoDataIfEmpty(db: EducationGraphDB): Promise<boolean> {
  const stats = await db.getStats();
  if (!(stats.learnerCount === 0 && stats.conceptCount === 0)) return false;

  // Seed learners
  for (const learner of demoLearners) {
    await db.setLearnerProfile(learner.userId, {
      name: learner.name,
      email: learner.email,
      learningStyle: learner.learningStyle as any,
      cognitiveProfile: learner.cognitiveProfile as any,
      psychometricScores: learner.psychometricScores as any,
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
    // Demo data uses 'learnerId' but format varies
    const learnerId = ((state as any).learnerId || '').replace('demo-', '');
    const conceptId = (state.conceptId || '').replace('concept:', '');
    const confidence = (state as any).confidence ?? 0.8;
    const lastReviewed = (state as any).lastReviewed || new Date().toISOString();
    const reviewCount = (state as any).reviewCount ?? 0;

    if (learnerId && conceptId) {
      await db.setKnowledgeState(
        learnerId,
        conceptId,
        {
          mastery: state.mastery,
          retentionStrength: confidence,
          lastReviewed: lastReviewed,
          reviewCount: reviewCount,
        }
      );
    }
  }

  return true;
}
