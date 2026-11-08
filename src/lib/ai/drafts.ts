/**
 * AI drafts for teachers (Roadmap M5): quiz questions for a concept, and a
 * curriculum (concepts + prerequisites) from a syllabus. A model only ever
 * produces DRAFTS: everything is validated here and a person approves it
 * before it is saved. Pure (no I/O), unit-tested; `service.ts` calls the model.
 */
import { z } from 'zod';
import { questionInput, type QuestionInput } from '../evidence/quiz.ts';
import type { ConceptNode } from '../graph/types.ts';

export type QuestionDraftKind = 'quick-check' | 'mastery' | 'misconception';

export const QUESTION_DRAFT_KINDS: Record<QuestionDraftKind, { label: string; instruction: string }> = {
  'quick-check': {
    label: 'Quick check',
    instruction: 'Write short questions that check whether the learner has the core idea, at the "remember" and "understand" levels.',
  },
  mastery: {
    label: 'Mastery test',
    instruction: 'Write questions that need the learner to apply the idea to a new case, at the "apply" level and above.',
  },
  misconception: {
    label: 'Misconception probe',
    instruction:
      'Write questions whose wrong options are the typical misconceptions about this concept, and say in the explanation which misconception each wrong option shows.',
  },
};

/** What the model must return (kept simple: structured outputs support plain types best). */
export const questionDraftSchema = z.object({
  questions: z.array(
    z.object({
      prompt: z.string(),
      options: z.array(z.string()),
      answer: z.string(),
      explanation: z.string(),
    }),
  ),
});

export const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const;

export const curriculumDraftSchema = z.object({
  concepts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      difficulty: z.number(),
      bloomLevel: z.enum(BLOOM),
    }),
  ),
  prerequisites: z.array(z.object({ from: z.string(), to: z.string(), reason: z.string() })),
});

export type QuestionDraft = z.infer<typeof questionDraftSchema>['questions'][number];
export type CurriculumDraft = z.infer<typeof curriculumDraftSchema>;

export function questionPrompt(
  concept: Pick<ConceptNode, 'name' | 'description' | 'domain'>,
  kind: QuestionDraftKind,
  count: number,
  existingPrompts: string[],
): string {
  return [
    `Concept: ${concept.name} (subject: ${concept.domain})`,
    concept.description ? `About it: ${concept.description}` : '',
    '',
    `Write ${count} multiple-choice questions. ${QUESTION_DRAFT_KINDS[kind].instruction}`,
    'Each question has 3 or 4 short options, exactly one of them correct; "answer" repeats the correct option word for word.',
    'Keep options distinct and plausible. The explanation says in one or two sentences why the answer is right.',
    existingPrompts.length ? `Do not repeat these existing questions:\n${existingPrompts.map((p) => `- ${p}`).join('\n')}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Drafts that pass the same validation as the question editor, without duplicates. */
export function cleanQuestionDrafts(
  drafts: QuestionDraft[],
  conceptId: string,
  existingPrompts: string[],
): { valid: QuestionInput[]; rejected: number } {
  const seen = new Set(existingPrompts.map((p) => p.trim().toLowerCase()));
  const valid: QuestionInput[] = [];
  let rejected = 0;
  for (const d of drafts) {
    const parsed = questionInput.safeParse({
      conceptId,
      prompt: d.prompt,
      options: [...new Set(d.options.map((o) => o.trim()))].slice(0, 6),
      answer: d.answer.trim(),
      explanation: d.explanation,
    });
    const key = d.prompt.trim().toLowerCase();
    if (!parsed.success || seen.has(key)) {
      rejected++;
      continue;
    }
    seen.add(key);
    valid.push(parsed.data);
  }
  return { valid, rejected };
}

export function curriculumPrompt(syllabus: string, subject: string): string {
  return [
    `Turn this course description into a concept map for the subject "${subject}".`,
    'List the concepts a learner must master (usually 5 to 25), each with a short id in lowercase-with-dashes, a name, a one-sentence description, a difficulty from 1 (easiest) to 10, and the Bloom level the course aims for.',
    'Then list prerequisites: "from" must be learned before "to". Only add a prerequisite when the later concept really needs the earlier one, and give the reason in one sentence. No cycles.',
    '',
    'Course description:',
    syllabus,
  ].join('\n');
}

/** Lowercase-with-dashes id that the graph accepts (no ":" or spaces). */
export function slugId(raw: string): string {
  return (
    raw
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'concept'
  );
}

export interface CurriculumPlan {
  concepts: { conceptId: string; name: string; description: string; domain: string; difficulty: number; bloomLevel: (typeof BLOOM)[number]; exists: boolean }[];
  edges: { from: string; to: string; reason: string }[];
  /** What was changed or dropped, in plain words, for the reviewer. */
  problems: string[];
}

/**
 * Validate a model's curriculum draft: clean ids, drop duplicates, clamp
 * difficulty, keep only prerequisites between known concepts, and drop any
 * prerequisite that would close a cycle (also with concepts already in the
 * workspace). Nothing here is saved.
 */
export function validateCurriculumDraft(
  draft: CurriculumDraft,
  subject: string,
  existing: { conceptIds: ReadonlySet<string>; edges: readonly { from: string; to: string }[] },
): CurriculumPlan {
  const problems: string[] = [];
  const domain = slugId(subject);
  const idMap = new Map<string, string>();
  const concepts: CurriculumPlan['concepts'] = [];
  for (const c of draft.concepts.slice(0, 60)) {
    const name = c.name.trim().slice(0, 200);
    if (!name) {
      problems.push('A concept without a name was left out.');
      continue;
    }
    const conceptId = slugId(c.id || name);
    if (concepts.some((x) => x.conceptId === conceptId)) {
      problems.push(`“${name}” appeared twice; kept the first.`);
      idMap.set(c.id, conceptId);
      continue;
    }
    idMap.set(c.id, conceptId);
    idMap.set(conceptId, conceptId);
    const difficulty = Math.min(10, Math.max(1, Math.round(Number.isFinite(c.difficulty) ? c.difficulty : 5)));
    concepts.push({
      conceptId,
      name,
      description: c.description.trim().slice(0, 1000),
      domain,
      difficulty,
      bloomLevel: c.bloomLevel,
      exists: existing.conceptIds.has(conceptId),
    });
  }
  const known = new Set([...existing.conceptIds, ...concepts.map((c) => c.conceptId)]);
  // Graph of existing + accepted edges, to refuse cycles.
  const next = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!next.has(a)) next.set(a, new Set());
    next.get(a)!.add(b);
  };
  for (const e of existing.edges) link(e.from, e.to);
  const reaches = (start: string, goal: string) => {
    const stack = [start];
    const seen = new Set<string>();
    while (stack.length) {
      const n = stack.pop()!;
      if (n === goal) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of next.get(n) ?? []) stack.push(m);
    }
    return false;
  };
  const edges: CurriculumPlan['edges'] = [];
  const name = (id: string) => concepts.find((c) => c.conceptId === id)?.name ?? id;
  for (const e of draft.prerequisites.slice(0, 200)) {
    const from = idMap.get(e.from) ?? slugId(e.from);
    const to = idMap.get(e.to) ?? slugId(e.to);
    if (!known.has(from) || !known.has(to)) {
      problems.push(`A prerequisite between unknown concepts (${e.from} → ${e.to}) was left out.`);
      continue;
    }
    if (from === to || edges.some((x) => x.from === from && x.to === to)) continue;
    if (reaches(to, from)) {
      problems.push(`“${name(from)} → ${name(to)}” would make a loop, so it was left out.`);
      continue;
    }
    link(from, to);
    edges.push({ from, to, reason: e.reason.trim().slice(0, 500) });
  }
  return { concepts, edges, problems };
}
