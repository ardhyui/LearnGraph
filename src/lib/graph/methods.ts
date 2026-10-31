import type { EducationGraphDB } from './education-graph-db.ts';

/**
 * EducationGraphDB methods the browser may call through the `graphCall`
 * server function. Everything runs server-side against the caller's own
 * workspace; `open`/`close`/raw `batch` are intentionally not exposed.
 */
export const REMOTE_GRAPH_METHODS = [
  'addConcept',
  'addEdge',
  'addMisconception',
  'addRelatedEdge',
  'adjustForPsychometrics',
  'clear',
  'computeAndStoreCognitiveProfile',
  'computeAndStoreDerivedProfiles',
  'computeAndStoreLearningStyle',
  'computeZPD',
  'deleteConcept',
  'deleteEdge',
  'deleteKnowledgeState',
  'deleteLearnerProfile',
  'deleteRelatedEdge',
  'detectGaps',
  'generateLearningPath',
  'generateRemediationPlan',
  'getConcept',
  'getDependentChain',
  'getDependents',
  'getEdge',
  'getKnowledgeState',
  'getLearnerKnowledgeStates',
  'getLearnerProfile',
  'getPrerequisiteChain',
  'getPrerequisites',
  'getPsychometricScores',
  'getRelatedEdges',
  'getReviewQueue',
  'getStats',
  'listConcepts',
  'listConceptsByBloomLevel',
  'listConceptsByDifficulty',
  'listConceptsByDomain',
  'listEdges',
  'listLearnerProfiles',
  'listRelatedEdges',
  'predictDecay',
  'scheduleNextReview',
  'searchConcepts',
  'selectScaffoldingStrategies',
  'setKnowledgeState',
  'setLearnerProfile',
  'updatePsychometricScore',
  'updatePsychometricScores',
] as const satisfies readonly (keyof EducationGraphDB)[];

export type RemoteGraphMethod = (typeof REMOTE_GRAPH_METHODS)[number];

/** Browser-side view of EducationGraphDB: same methods, always async. */
export type RemoteGraphDB = {
  [K in RemoteGraphMethod]: EducationGraphDB[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};
