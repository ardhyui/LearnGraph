/**
 * Context for any AI tutor (Roadmap M4, the part without LLM cost):
 * `buildTutorContext` turns what LearnGraph knows about one learner into a
 * short plain-text brief (≤ 2000 tokens) to paste above a question. Pure, no
 * LLM, unit-tested.
 *
 * Privacy by construction: the brief is built only from an allow-list —
 * concept names, mastery and where it came from, open misconceptions, what is
 * due or next, and teaching preferences in neutral words. Raw psychometric
 * scores, domain names and trait wording are never read, so sensitive domains
 * (dark triad, political ideology, attachment, …) cannot leak into it.
 */
import type {
  ConceptNode,
  KnowledgeState,
  LearnerProfile,
  MasterySource,
  ScaffoldingStrategy,
} from '../graph/types.ts';

/** Context size limit (Roadmap M4 / Phase 7). */
export const MAX_CONTEXT_TOKENS = 2000;

/** A rough, conservative token estimate (about 4 characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Psychometric domains that must never appear in a tutor context (checked by tests). */
export const SENSITIVE_DOMAINS = [
  'dark_triad_narcissism',
  'dark_triad_machiavellianism',
  'dark_triad_psychopathy',
  'political_ideology',
  'attachment_style',
  'love_languages',
  'moral_reasoning',
  'personal_values',
  'cultural_values',
  'life_satisfaction',
  'stress_coping',
  'big_five_neuroticism',
] as const;

export type QueryType = 'explain' | 'practice' | 'stuck' | 'review' | 'next' | 'general';

const QUERY_PATTERNS: [QueryType, RegExp][] = [
  ['stuck', /\b(stuck|confus|don'?t (get|understand)|wrong|mistake|error|bingung|salah|tidak paham|nggak ngerti|gak ngerti)/i],
  ['practice', /\b(practi[cs]e|exercise|quiz me|test me|problem|soal|latihan|uji)/i],
  ['review', /\b(review|remind|forgot|forget|refresh|recap|ulang|lupa|ingat)/i],
  ['next', /\b(next|what should i (learn|study)|where (do|should) i (start|go)|selanjutnya|belajar apa)/i],
  ['explain', /\b(explain|what is|what are|why|how (do|does|to)|meaning|jelaskan|apa itu|kenapa|mengapa|bagaimana)/i],
];

/** What kind of help the question asks for (keywords, English and Indonesian). */
export function detectQueryType(query: string | null | undefined): QueryType {
  const q = (query ?? '').trim();
  if (!q) return 'general';
  return QUERY_PATTERNS.find(([, re]) => re.test(q))?.[0] ?? 'general';
}

/** How the tutor should answer each kind of question (the prompt template). */
const INSTRUCTIONS: Record<QueryType, string> = {
  explain:
    'Explain the concept at the learner’s level. Build on what they have mastered, avoid what they have not learned yet, and end with one quick check question.',
  practice:
    'Give 2–3 practice problems at the right level, one at a time. Wait for each answer, then give feedback that names the mistake, not just the right answer.',
  stuck:
    'The learner is stuck. Find the exact step that goes wrong, address any listed misconception directly, and give a hint before the full solution.',
  review:
    'Help the learner recall before re-explaining: ask them to retrieve the key idea first, then fill the gaps.',
  next: 'Suggest what to learn next using the list below, and say why in one sentence each.',
  general: 'Answer the question using what is known about the learner below. Keep it at their level.',
};

/** Neutral teaching instructions per strategy (never the engine's trait-based reasons). */
const STRATEGY_TEXT: Record<ScaffoldingStrategy['type'], string> = {
  worked_example: 'show a worked example before asking them to try',
  guided_practice: 'practise together step by step before independent work',
  hints: 'offer hints before giving answers',
  visual_aids: 'use diagrams or visual layouts where they help',
  chunking: 'break explanations into small steps',
  peer_discussion: 'invite them to explain their thinking in their own words',
  analogy: 'connect new ideas to familiar ones with analogies',
  repetition: 'revisit key points briefly',
};

const FORMAT_TEXT: Record<string, string> = {
  'explain-first': 'the explanation first',
  'example-first': 'examples first',
  'practice-first': 'practice first',
};

const SOURCE_TEXT: Record<MasterySource, string> = {
  quiz: 'from quizzes',
  self_report: 'self-reported',
  manual: 'set by hand',
  practice: 'from practice notes',
  sync: 'synced from another app',
};

export interface TutorContextInput {
  learner: Pick<LearnerProfile, 'learningStyle' | 'cognitiveProfile' | 'tags'>;
  /** The concept the question is about, if known. */
  concept?: ConceptNode | null;
  /** Its prerequisites (concept ids). */
  prerequisites?: string[];
  concepts: ConceptNode[];
  states: KnowledgeState[];
  /** Next concepts from the ZPD, best first. */
  next: { conceptId: string }[];
  /** Due reviews, most urgent first. */
  dueReviews: { conceptId: string }[];
  /** Teaching strategy types (from the engine), most important first. */
  strategies: ScaffoldingStrategy['type'][];
  /** Chosen lesson format, e.g. "example-first". */
  formatPreference?: string | null;
  /** Subjects the learner chose. */
  focus?: string[];
}

export interface TutorContext {
  text: string;
  tokens: number;
  queryType: QueryType;
}

/** Shorten user-written text so one long field cannot crowd out the rest. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function masteryLine(name: string, state: KnowledgeState | undefined): string {
  if (!state || state.mastery <= 0) return `${name}: not started`;
  const source = state.masterySource ? SOURCE_TEXT[state.masterySource] : 'not quiz-checked';
  return `${name}: ${Math.round(state.mastery)}% mastered (${source})`;
}

/**
 * The brief, most important first. Sections that would push it over
 * `MAX_CONTEXT_TOKENS` are dropped from the end, and long lists are capped.
 */
export function buildTutorContext(input: TutorContextInput, query?: string | null): TutorContext {
  const queryType = detectQueryType(query);
  const name = new Map(input.concepts.map((c) => [c.conceptId, c.name]));
  const stateOf = new Map(input.states.map((s) => [s.conceptId, s]));
  const label = (id: string) => name.get(id) ?? id;
  const sections: string[] = [];

  sections.push(
    [
      'You are tutoring one learner. LearnGraph, their study app, knows the following. Use it to personalise your answer; do not repeat it back.',
      `How to answer: ${INSTRUCTIONS[queryType]}`,
    ].join('\n'),
  );

  if (input.concept) {
    const c = input.concept;
    const lines = [`Topic: ${c.name}${c.description ? ` — ${clip(c.description, 300)}` : ''}`, masteryLine('Learner', stateOf.get(c.conceptId))];
    const prereqs = (input.prerequisites ?? []).slice(0, 8);
    if (prereqs.length) lines.push(`Builds on: ${prereqs.map((id) => masteryLine(label(id), stateOf.get(id))).join('; ')}`);
    const open = (stateOf.get(c.conceptId)?.misconceptions ?? []).filter((m) => !m.resolved).slice(0, 5);
    if (open.length) lines.push(`Known misconceptions: ${open.map((m) => clip(m.description, 200)).join('; ')}`);
    sections.push(lines.join('\n'));
  }

  const preferences: string[] = [];
  const style = input.learner.learningStyle;
  const format = input.formatPreference ? FORMAT_TEXT[input.formatPreference] : undefined;
  if (format) preferences.push(`prefers lessons with ${format}`);
  if (style?.pacePreference) preferences.push(`pace: ${style.pacePreference}`);
  if (style?.feedbackPreference) preferences.push(`feedback: ${style.feedbackPreference}`);
  const strategies = [...new Set(input.strategies)].slice(0, 4).map((s) => STRATEGY_TEXT[s]).filter(Boolean);
  if (strategies.length) preferences.push(`helps to ${strategies.join(', ')}`);
  if (input.learner.cognitiveProfile?.attentionSpan === 'short') preferences.push('keep each step short');
  if (preferences.length) sections.push(`Teaching preferences: ${preferences.join('; ')}.`);

  const struggles = input.states
    .flatMap((s) => s.misconceptions.filter((m) => !m.resolved).map((m) => `${label(s.conceptId)}: ${clip(m.description, 200)}`))
    .filter((line) => !input.concept || !line.startsWith(`${input.concept.name}:`))
    .slice(0, 5);
  if (struggles.length) sections.push(`Other open misconceptions: ${struggles.join('; ')}`);

  const mastered = input.states
    .filter((s) => s.mastery >= 80 && name.has(s.conceptId))
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 12)
    .map((s) => masteryLine(label(s.conceptId), s));
  if (mastered.length) sections.push(`Already mastered: ${mastered.join('; ')}`);

  if (input.dueReviews.length) sections.push(`Due for review: ${input.dueReviews.slice(0, 5).map((r) => label(r.conceptId)).join(', ')}`);
  if (input.next.length) sections.push(`Ready to learn next: ${input.next.slice(0, 5).map((n) => label(n.conceptId)).join(', ')}`);
  if (input.focus?.length) sections.push(`Subjects they chose: ${input.focus.join(', ')}`);

  const kept: string[] = [];
  for (const section of sections) {
    const candidate = [...kept, section].join('\n\n');
    if (estimateTokens(candidate) > MAX_CONTEXT_TOKENS) continue;
    kept.push(section);
  }
  const text = kept.join('\n\n');
  return { text, tokens: estimateTokens(text), queryType };
}
