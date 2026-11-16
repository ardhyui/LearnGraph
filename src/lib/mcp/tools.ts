/**
 * Server-only: the graph-backed MCP tools. Each tool reuses the exact payload
 * behind the read-only REST API, so REST and MCP can never drift apart.
 */
import { contextPayload, learnersPayload } from '../api/v1.ts';
import type { McpToolHandlers, McpToolResult } from './protocol.ts';

export function mcpToolHandlersFor(owner: string): McpToolHandlers {
  return {
    list_learners: async (): Promise<McpToolResult> => {
      const payload = await learnersPayload(owner);
      const lines = payload.learners.map(
        (learner) => `${learner.name} — learner id: ${learner.id}${learner.example ? ' (example learner)' : ''}`,
      );
      return {
        text: lines.length ? lines.join('\n') : 'This account has no learners yet.',
        structuredContent: payload,
      };
    },

    get_tutor_context: async (args): Promise<McpToolResult> => {
      const payload = await contextPayload(owner, {
        learner: args.learner,
        concept: args.concept,
        query: args.query,
      });
      return {
        text: payload.context,
        structuredContent: {
          learner: payload.learner,
          concept: payload.concept,
          queryType: payload.queryType,
          tokens: payload.tokens,
        },
      };
    },
  };
}
