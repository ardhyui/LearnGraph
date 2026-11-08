/**
 * Calls the model for AI drafts (Roadmap M5) with the person's own Anthropic
 * key (decision D3's recommendation). Structured outputs return JSON that
 * matches the draft schema; `drafts.ts` validates it again. Server-only.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { TUTOR_MODEL, TutorChatError, toTutorError } from '../tutor/chat.ts';
import {
  curriculumDraftSchema,
  curriculumPrompt,
  questionDraftSchema,
  questionPrompt,
  type CurriculumDraft,
  type QuestionDraft,
  type QuestionDraftKind,
} from './drafts.ts';
import type { ConceptNode } from '../graph/types.ts';

/** The part of the SDK client used here (tests pass a stand-in). */
export interface DraftClient {
  beta: { messages: { parse: Anthropic['beta']['messages']['parse'] } };
}

/** A PDF sent along with the prompt (Claude reads it as a document). */
export interface PdfInput {
  base64: string;
}

async function parseWith<T>(
  client: DraftClient,
  prompt: string,
  format: ReturnType<typeof betaZodOutputFormat>,
  pdf?: PdfInput,
): Promise<T> {
  try {
    const response = await client.beta.messages.parse({
      model: TUTOR_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format },
      messages: [
        {
          role: 'user',
          content: pdf
            ? [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.base64 } },
                { type: 'text', text: prompt },
              ]
            : prompt,
        },
      ],
    });
    if (response.stop_reason === 'refusal') throw new TutorChatError('The model declined to draft this.');
    if (!response.parsed_output) throw new TutorChatError('The model did not return a usable draft. Try again.');
    return response.parsed_output as T;
  } catch (err) {
    throw err instanceof TutorChatError ? err : toTutorError(err);
  }
}

export async function draftQuestions(
  client: DraftClient,
  concept: Pick<ConceptNode, 'name' | 'description' | 'domain'>,
  kind: QuestionDraftKind,
  count: number,
  existingPrompts: string[],
): Promise<QuestionDraft[]> {
  const out = await parseWith<{ questions: QuestionDraft[] }>(
    client,
    questionPrompt(concept, kind, count, existingPrompts),
    betaZodOutputFormat(questionDraftSchema),
  );
  return out.questions;
}

export async function draftCurriculum(
  client: DraftClient,
  syllabus: string,
  subject: string,
  pdf?: PdfInput,
): Promise<CurriculumDraft> {
  const text = pdf ? `${syllabus}\n\n(The attached PDF is the course document.)`.trim() : syllabus;
  return parseWith<CurriculumDraft>(client, curriculumPrompt(text, subject), betaZodOutputFormat(curriculumDraftSchema), pdf);
}
