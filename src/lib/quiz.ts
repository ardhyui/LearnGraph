/**
 * The "Take quizzes" option on My Profile, in learner words: no research
 * markers or instrument citations, honest time estimates, and which topics
 * already have a saved quiz result. Plain data so it can be tested.
 */

export interface QuizScale {
  min: number;
  max: number;
  labels: readonly string[];
}

/** Roughly how long one answer takes (read the statement, pick a number). */
const SECONDS_PER_QUESTION = 12;

/** "1 question · under a minute" / "10 questions · about 2 min". */
export function quizLengthLine(questionCount: number): string {
  const n = Math.max(0, Math.floor(questionCount));
  const noun = n === 1 ? 'question' : 'questions';
  const minutes = Math.round((n * SECONDS_PER_QUESTION) / 60);
  const time = minutes < 1 ? 'under a minute' : `about ${minutes} min`;
  return `${n} ${noun} · ${time}`;
}

/**
 * The words for one answer value, e.g. 1 → "Strongly Disagree". Scales list
 * one label per value; if a scale only has end labels, the middle values get
 * none (empty string) rather than a wrong label.
 */
export function answerLabel(scale: QuizScale, value: number): string {
  const count = scale.max - scale.min + 1;
  const i = value - scale.min;
  if (!Number.isInteger(i) || i < 0 || i >= count) return '';
  if (scale.labels.length === count) return scale.labels[i] ?? '';
  if (i === 0) return scale.labels[0] ?? '';
  if (i === count - 1) return scale.labels[scale.labels.length - 1] ?? '';
  return '';
}

/** Accessible name for an answer button: "3 — Neutral" (or just "3"). */
export function answerButtonName(scale: QuizScale, value: number): string {
  const label = answerLabel(scale, value);
  return label ? `${value} — ${label}` : String(value);
}

/** The everyday label for values the learner set themselves. */
const SET_BY_YOU = 'Set by you';

/** Where a saved profile value came from, in everyday words. */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  assessment_quick: 'From a quick quiz',
  assessment_full: 'From a full quiz',
  manual_entry: SET_BY_YOU,
  adaptive_initial: SET_BY_YOU,
  surprise_me: 'Random starting value',
  auto_discovery: 'Filled in automatically',
};

export function scoreSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  if (Object.hasOwn(SOURCE_LABELS, source)) return SOURCE_LABELS[source];
  return null;
}

/** Whether a stored value came from answering a quiz. */
export function isQuizResult(score: { source?: string | null } | null | undefined): boolean {
  return score?.source === 'assessment_quick' || score?.source === 'assessment_full';
}

/** Topics (domain ids) whose saved value came from a quiz. */
export function completedQuizTopics(scores: Readonly<Record<string, { source?: string | null }>>): Set<string> {
  const done = new Set<string>();
  for (const [id, score] of Object.entries(scores)) {
    if (isQuizResult(score)) done.add(id);
  }
  return done;
}

/** "Saved 3 quiz results." with a friendly zero case. */
export function savedQuizzesLine(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return 'Answer every question in a topic to get a result.';
  return n === 1 ? 'Saved 1 quiz result.' : `Saved ${n} quiz results.`;
}

/** A topic whose saved value a quiz result would replace (Roadmap P0.2). */
export interface TopicAtRisk {
  /** Domain id, e.g. "growth_mindset". */
  id: string;
  /** Where the old value came from, e.g. "Set by you". */
  label: string;
}

/**
 * Topics from `domainIds` (about to be overwritten by a quiz) whose saved
 * value the learner set themselves, so saving should ask first. Quiz results
 * replacing quiz results, random starting values, auto-filled values and
 * empty topics are not at risk: replacing those loses nothing the learner
 * chose (Roadmap P0.2 — ask only when the old value is "Set by you").
 */
export function manualTopicsAtRisk(
  scores: Readonly<Record<string, { source?: string | null }>>,
  domainIds: readonly string[],
): TopicAtRisk[] {
  const atRisk: TopicAtRisk[] = [];
  for (const id of new Set(domainIds)) {
    const score = scores[id];
    if (!score || isQuizResult(score)) continue;
    if (scoreSourceLabel(score.source) !== SET_BY_YOU) continue;
    atRisk.push({ id, label: SET_BY_YOU });
  }
  return atRisk;
}

/** "A", "A and B", "A, B and C" — names of replaced topics in one sentence. */
export function topicListLine(names: readonly string[]): string {
  const clean = names.filter((name) => name.trim() !== '');
  if (clean.length <= 1) return clean[0] ?? '';
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}
