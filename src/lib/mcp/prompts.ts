/**
 * The ready-made requests behind MCP `prompts/get` (Roadmap M4): one user turn
 * that pairs a short instruction with the learner's existing tutor brief.
 * Pure — no database, no React — so the wording can be unit-tested directly;
 * `src/lib/mcp/tools.ts` supplies the brief from the account's own graph.
 */
import type { McpPromptArguments, McpPromptMessage, McpPromptName } from './protocol.ts';

function withBrief(instruction: string, brief: string): string {
  const body = brief.trim();
  return body ? `${instruction}\n\n---\n\n${body}` : instruction;
}

/** One user message: the prompt's instruction, then the tutor brief verbatim. */
export function buildPromptMessages(
  name: McpPromptName,
  args: McpPromptArguments,
  brief: string,
): McpPromptMessage[] {
  let instruction: string;
  switch (name) {
    case 'next_topic':
      instruction =
        'Using the learner brief below, recommend the one concept this learner should learn ' +
        'next. Say why it fits now, mention any prerequisite that is still shaky, and give one ' +
        'concrete first step in under 150 words.';
      break;
    case 'review_due': {
      const count = args.count ?? 5;
      instruction =
        'Using the learner brief below, quiz this learner on the concepts that are due for ' +
        `review. Ask ${count} short questions, one at a time, and wait for the learner's answer ` +
        'before showing whether it was right.';
      break;
    }
    case 'explain_concept':
      instruction =
        `Using the learner brief below, explain "${(args.concept ?? '').trim()}" at this ` +
        "learner's level. Start from what they already know, use one concrete example, and end " +
        'with one short check question.';
      break;
  }
  return [{ role: 'user', content: { type: 'text', text: withBrief(instruction, brief) } }];
}
