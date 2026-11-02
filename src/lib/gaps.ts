/**
 * Learner-facing wording for the Gap Analysis and Recommendations pages:
 * concept names instead of internal ids ("concept:linear-equations"), plain
 * review-due phrases instead of raw dates, and everyday labels for engine
 * enums (priority, remediation step type, gap kind). Pure — no React, no
 * clock unless passed in — so it is unit-tested directly.
 */

/** Strip control/format characters and collapse whitespace. */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Readable fallback for a concept id when no name is known:
 * "concept:linear-equations" → "Linear equations".
 */
export function humanizeConceptId(id: string): string {
  const base = clean(String(id ?? '')).replace(/^concept[:_-]/i, '').replace(/[-_:]+/g, ' ').trim();
  if (!base) return 'Untitled concept';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Concept name when present, otherwise a readable version of its id. */
export function conceptLabel(id: string, name?: string | null): string {
  const n = typeof name === 'string' ? clean(name) : '';
  return n || humanizeConceptId(id);
}

/** Build an id → readable name lookup from any list of concepts. */
export function conceptNameMap(concepts: Iterable<{ conceptId: string; name?: string | null }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of concepts) {
    if (c && typeof c.conceptId === 'string' && !map.has(c.conceptId)) {
      map.set(c.conceptId, conceptLabel(c.conceptId, c.name));
    }
  }
  return map;
}

/** Names for a list of concept ids, using the lookup and falling back to the id. */
export function conceptNames(ids: readonly string[], names: ReadonlyMap<string, string>): string[] {
  return ids.map((id) => names.get(id) ?? humanizeConceptId(id));
}

/**
 * "Learn first: Fractions, Decimals and 2 more" — what is still missing
 * before a concept that is not ready yet. Empty string when nothing is missing.
 */
export function learnFirstLabel(ids: readonly string[], names: ReadonlyMap<string, string>, max = 3): string {
  if (ids.length === 0) return '';
  const shown = conceptNames(ids.slice(0, max), names).join(', ');
  const rest = ids.length - max;
  return `Learn first: ${shown}${rest > 0 ? ` and ${rest} more` : ''}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Whole calendar days from `now` until `date` (negative = in the past), or
 * null for an invalid date.
 */
export function daysUntil(date: string | Date, now: Date): number | null {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime()) || Number.isNaN(now.getTime())) return null;
  return Math.round((startOfLocalDay(d) - startOfLocalDay(now)) / DAY_MS);
}

/** "Due today", "Overdue by 3 days", "Due tomorrow", "Due in 5 days". */
export function dueLabel(date: string | Date, now: Date): string {
  const days = daysUntil(date, now);
  if (days === null) return 'Review date unknown';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  const late = -days;
  return `Overdue by ${late} day${late === 1 ? '' : 's'}`;
}

/** "Overdue by 3 days · about 64% remembered" — one line per due review (Today & Gap Analysis). */
export function reviewSummary(nextReviewDate: string | Date, predictedRetention: number, now: Date): string {
  const pct = Number.isFinite(predictedRetention) ? Math.round(Math.min(100, Math.max(0, predictedRetention))) : 0;
  return `${dueLabel(nextReviewDate, now)} · about ${pct}% remembered`;
}

export type ReviewPriority = 'urgent' | 'normal' | 'low';

const PRIORITY_LABELS: Record<ReviewPriority, string> = {
  urgent: 'Review first',
  normal: 'Review soon',
  low: 'Can wait',
};

export function priorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority as ReviewPriority] ?? 'Review';
}

const STEP_LABELS: Record<string, string> = {
  correct_misconception: 'Fix a mix-up',
  review: 'Refresh',
  relearn: 'Practice more',
  new_learning: 'Learn',
};

/** Everyday label for a remediation step type from the engine. */
export function stepTypeLabel(type: string): string {
  return STEP_LABELS[type] ?? 'Study';
}

/** Summary cards on the Gap Analysis page, in display order. */
export const GAP_KINDS = [
  { key: 'missing', label: 'Not started', hint: 'Ready for you, not learned yet' },
  { key: 'partial', label: 'Still learning', hint: 'Started but not mastered yet' },
  { key: 'forgotten', label: 'Fading', hint: 'Learned before, now due for a review' },
  { key: 'misconceptions', label: 'Mix-ups', hint: 'Something was understood the wrong way' },
] as const;

/** "1 review", "3 reviews". */
export function countLabel(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * When a snoozed review comes back, in plain words: "Snoozed until later
 * today", "Snoozed until tomorrow", "Snoozed until Mon, Nov 9".
 */
export function snoozeLabel(until: number | string | Date, now: Date): string {
  const d = until instanceof Date ? until : new Date(until);
  const days = daysUntil(d, now);
  if (days === null) return 'Snoozed for now';
  if (days <= 0) return 'Snoozed until later today';
  if (days === 1) return 'Snoozed until tomorrow';
  return `Snoozed until ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

/**
 * One line for the Today panel: "1 review snoozed until tomorrow",
 * "3 reviews snoozed — the first until tomorrow". Empty when none.
 * `untils` should be sorted soonest first.
 */
export function snoozedSummary(untils: readonly number[], now: Date): string {
  if (untils.length === 0) return '';
  const labels = untils.map((u) => snoozeLabel(u, now).replace(/^Snoozed /, ''));
  const n = countLabel(untils.length, 'review');
  return labels.every((l) => l === labels[0]) ? `${n} snoozed ${labels[0]}` : `${n} snoozed — the first ${labels[0]}`;
}
