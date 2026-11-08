/**
 * `getRAGContext(learnerId, query)` from the roadmap (M4): gathers what the
 * graph knows about one learner and builds the tutor brief, without any LLM.
 */
import type { EducationGraphDB } from '../graph/education-graph-db.ts';
import { determinePresentationStrategy } from '../content/content.ts';
import { focusDomains } from '../onboarding.ts';
import { buildTutorContext, type TutorContext } from './context.ts';

export async function getRAGContext(
  graph: EducationGraphDB,
  input: { learnerId: string; conceptId?: string | null; query?: string | null },
): Promise<(TutorContext & { ms: number }) | null> {
  const started = performance.now();
  const learner = await graph.getLearnerProfile(input.learnerId);
  if (!learner) return null;
  const [concepts, states, zpd, reviews, concept, prereqs] = await Promise.all([
    graph.listConcepts(),
    graph.getLearnerKnowledgeStates(input.learnerId),
    graph.computeZPD(input.learnerId, { limit: 5 }),
    graph.getReviewQueue(input.learnerId, { limit: 5 }),
    input.conceptId ? graph.getConcept(input.conceptId) : Promise.resolve(null),
    input.conceptId ? graph.getPrerequisites(input.conceptId) : Promise.resolve([]),
  ]);
  const strategy = determinePresentationStrategy(learner);
  const context = buildTutorContext(
    {
      learner,
      concept,
      prerequisites: prereqs.map((e) => e.from),
      concepts,
      states,
      next: zpd.recommendations.map((r) => ({ conceptId: r.concept.conceptId })),
      dueReviews: reviews.queue.map((r) => ({ conceptId: r.conceptId })),
      strategies: [...zpd.psychometricAdjustments.scaffoldingStrategies]
        .sort((a, b) => b.priority - a.priority)
        .map((s) => s.type),
      formatPreference: strategy.source === 'chosen' ? strategy.preference : null,
      focus: focusDomains(learner),
    },
    input.query,
  );
  return { ...context, ms: Math.round(performance.now() - started) };
}
