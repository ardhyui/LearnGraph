/**
 * Server-only: the graph-backed MCP tools and resources. Each tool reuses the
 * exact payload behind the read-only REST API, so REST and MCP can never drift
 * apart. Resources only read the account's own graph.
 */
import { contextPayload, learnersPayload } from '../api/v1.ts';
import type { ConceptNode, KnowledgeState, LearnerProfile } from '../graph/types.ts';
import { conceptLabel } from '../gaps.ts';
import { MCP_PROMPTS, type McpHandlers, type McpResource, type McpToolResult } from './protocol.ts';
import { buildPromptMessages } from './prompts.ts';
import {
  conceptResourceMarkdown,
  conceptResourceUri,
  learnerResourceMarkdown,
  learnerResourceUri,
  parseResourceUri,
} from './resources.ts';

const LEARNER_DESCRIPTION =
  'Learner summary: name, mastery per concept (with the evidence source), and reviews due now.';
const CONCEPT_DESCRIPTION =
  'Concept details: name, domain, description, learning time estimate, and direct prerequisites.';

/** The account's own graph, loaded lazily so the pure layers stay importable. */
async function graphFor(owner: string) {
  const { graphForOwner } = await import('../graph/server.ts');
  return graphForOwner(owner);
}

/** Same ordering as the resources themselves: case-insensitive name, then id. */
function compareByName(a: string, b: string, tieA: string, tieB: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  return tieA < tieB ? -1 : tieA > tieB ? 1 : 0;
}

function learnerName(learner: LearnerProfile): string {
  const name = typeof learner.name === 'string' ? learner.name.trim() : '';
  return name || learner.userId;
}

function conceptName(concept: ConceptNode): string {
  return conceptLabel(concept.conceptId, concept.name);
}

/** Concepts stay a lookup by id so names never have to be copied around. */
function conceptNames(concepts: readonly ConceptNode[]): Map<string, string> {
  return new Map(concepts.map((concept) => [concept.conceptId, conceptName(concept)]));
}

export function mcpToolHandlersFor(owner: string): McpHandlers {
  /** The same brief behind `get_tutor_context`, reused by the ready-made prompts. */
  const tutorBrief = async (args: {
    learner?: string;
    concept?: string;
    query?: string;
  }): Promise<McpToolResult> => {
    const payload = await contextPayload(owner, args);
    return {
      text: payload.context,
      structuredContent: {
        learner: payload.learner,
        concept: payload.concept,
        queryType: payload.queryType,
        tokens: payload.tokens,
      },
    };
  };

  return {
    list_learners: async (): Promise<McpToolResult> => {
      const payload = await learnersPayload(owner);
      const lines = payload.learners.map(
        (learner) =>
          `${learner.name} — learner id: ${learner.id}${learner.example ? ' (example learner)' : ''}`,
      );
      return {
        text: lines.length ? lines.join('\n') : 'This account has no learners yet.',
        structuredContent: payload,
      };
    },

    get_tutor_context: (args): Promise<McpToolResult> => tutorBrief(args),

    get_prompt: async (name, args) => {
      const prompt = MCP_PROMPTS.find((candidate) => candidate.name === name);
      const query =
        name === 'next_topic'
          ? 'What should I learn next?'
          : name === 'review_due'
            ? 'Quiz me on my due reviews.'
            : `Explain ${args.concept ?? ''}`;
      const brief = await tutorBrief({
        learner: args.learner,
        concept: args.concept,
        query,
      });
      return {
        description: prompt?.description ?? 'A ready-to-use request for this learner.',
        messages: buildPromptMessages(name, args, brief.text),
      };
    },

    list_resources: async (): Promise<McpResource[]> => {
      const graph = await graphFor(owner);
      const [learners, concepts] = await Promise.all([
        graph.listLearnerProfiles(),
        graph.listConcepts(),
      ]);

      const learnerResources = learners
        .map((learner) => ({
          uri: learnerResourceUri(learner.userId),
          name: learnerName(learner),
          description: LEARNER_DESCRIPTION,
          mimeType: 'text/markdown' as const,
          _id: learner.userId,
        }))
        .sort((a, b) => compareByName(a.name, b.name, a._id, b._id))
        .map(({ _id, ...resource }) => resource);

      const conceptResources = concepts
        .map((concept) => ({
          uri: conceptResourceUri(concept.conceptId),
          name: conceptName(concept),
          description: CONCEPT_DESCRIPTION,
          mimeType: 'text/markdown' as const,
          _id: concept.conceptId,
        }))
        .sort((a, b) => compareByName(a.name, b.name, a._id, b._id))
        .map(({ _id, ...resource }) => resource);

      return [...learnerResources, ...conceptResources];
    },

    read_resource: async (uri: string) => {
      const parsed = parseResourceUri(uri);
      if (!parsed) return null;
      const graph = await graphFor(owner);

      if (parsed.kind === 'learner') {
        const [learners, concepts] = await Promise.all([
          graph.listLearnerProfiles(),
          graph.listConcepts(),
        ]);
        const learner = learners.find((candidate) => candidate.userId === parsed.id);
        if (!learner) return null;
        const states: KnowledgeState[] = await graph.getLearnerKnowledgeStates(parsed.id);
        return {
          uri,
          mimeType: 'text/markdown' as const,
          text: learnerResourceMarkdown({
            learner: { id: learner.userId, name: learner.name },
            states,
            concepts,
            now: new Date(),
          }),
        };
      }

      const [concepts, prerequisites] = await Promise.all([
        graph.listConcepts(),
        graph.getPrerequisites(parsed.id),
      ]);
      const concept = concepts.find((candidate) => candidate.conceptId === parsed.id);
      if (!concept) return null;
      const names = conceptNames(concepts);
      return {
        uri,
        mimeType: 'text/markdown' as const,
        text: conceptResourceMarkdown({
          concept,
          prerequisites: prerequisites.map((edge) => ({
            conceptId: edge.from,
            name: names.get(edge.from) ?? null,
          })),
        }),
      };
    },
  };
}
