/**
 * Built-in tutor chat (Roadmap M4), following decision D3's recommendation:
 * the learner brings their own Anthropic API key, so the project pays
 * nothing. The key is sent with each request and used for that one call; it
 * is never stored or logged on the server. Server-only (Anthropic SDK).
 *
 * The answer is personalised with the same brief as "Ask an AI tutor"
 * (`getRAGContext`); for the roadmap's comparison ("dengan dan tanpa
 * konteks") the same question can also be answered without it.
 */
import Anthropic from '@anthropic-ai/sdk';

export const TUTOR_MODEL = 'claude-opus-5-5';

/** A problem the learner can fix (wrong key, limits): shown as is, not logged. */
export class TutorChatError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'TutorChatError';
  }
}

export const API_KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

const BASE_INSTRUCTIONS =
  'You are a patient tutor. Answer the learner’s question clearly and briefly, at their level. Prefer short paragraphs and a worked example over long lists. If something is ambiguous, say what you assumed.';

/** The parts of the SDK client this module uses (lets tests pass a stand-in). */
export interface TutorClient {
  beta: { messages: { create: Anthropic['beta']['messages']['create'] } };
}

export function createTutorClient(apiKey: string): TutorClient {
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
}

export interface TutorAnswer {
  text: string;
  /** The model that answered (a refusal fallback may switch it). */
  model: string;
  refused: boolean;
}

/**
 * Ask once. `context` is the learner brief, or null for an answer that does
 * not know the learner (the comparison).
 */
export async function askTutorOnce(
  client: TutorClient,
  question: string,
  context: string | null,
): Promise<TutorAnswer> {
  const system = context ? `${BASE_INSTRUCTIONS}\n\n${context}` : BASE_INSTRUCTIONS;
  try {
    const response = await client.beta.messages.create({
      model: TUTOR_MODEL,
      max_tokens: 16000,
      // Chat: low effort keeps answers quick and short.
      output_config: { effort: 'low' },
      // If the model declines for safety reasons, the API retries on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: question }],
    });
    if (response.stop_reason === 'refusal') {
      return { text: 'The model declined to answer this question.', model: response.model, refused: true };
    }
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n\n')
      .trim();
    return { text: text || '(No answer was returned.)', model: response.model, refused: false };
  } catch (err) {
    throw toTutorError(err);
  }
}

/** Readable, key-free messages for the errors a learner can act on. */
export function toTutorError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new TutorChatError('That API key was not accepted. Check it and try again.');
  if (err instanceof Anthropic.PermissionDeniedError) return new TutorChatError('That API key is not allowed to use this model.');
  if (err instanceof Anthropic.RateLimitError) return new TutorChatError('Your API key hit its rate or spending limit. Try again later.');
  if (err instanceof Anthropic.BadRequestError) return new TutorChatError('The AI service could not process this question.');
  if (err instanceof Anthropic.APIConnectionError) return new TutorChatError('Could not reach the AI service. Try again in a moment.');
  if (err instanceof Anthropic.APIError) return new TutorChatError(`The AI service had a problem (HTTP ${err.status ?? '?'}). Try again later.`);
  return err instanceof Error ? err : new Error(String(err));
}
