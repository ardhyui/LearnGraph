/**
 * Sanitising the interaction history kept on a knowledge state.
 *
 * States saved before interactions were written (and imported/legacy data) may
 * contain anything in this field: missing, not an array, entries with broken
 * numbers or dates. Reading it must never throw, and writing a new entry must
 * not fail because an old one is malformed. This module keeps only entries the
 * RPC schema would accept (and would be happy to read back), drops the rest,
 * and keeps the last `MAX_INTERACTIONS` in order.
 */
import type { BloomLevel, LearningInteraction } from './types.ts';

/** Same bound as the `interactions` field of `knowledgeStateInput`. */
export const MAX_INTERACTIONS = 1000;

/** Longest note kept; longer notes are cut instead of dropping the entry. */
export const MAX_INTERACTION_NOTES = 500;

const INTERACTION_TYPES: ReadonlySet<string> = new Set(['lesson', 'quiz', 'practice', 'review']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));

const isBloomLevel = (value: unknown): value is BloomLevel =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;

/** One valid entry, with unknown fields stripped, or `null` when unusable. */
function sanitizeInteraction(value: unknown): LearningInteraction | null {
  if (!isRecord(value)) return null;
  const { timestamp, type, duration, score, bloomLevel, notes } = value;
  if (!isIsoTimestamp(timestamp)) return null;
  if (typeof type !== 'string' || !INTERACTION_TYPES.has(type)) return null;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return null;
  if (score !== undefined && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100))
    return null;
  if (bloomLevel !== undefined && !isBloomLevel(bloomLevel)) return null;
  if (notes !== undefined && typeof notes !== 'string') return null;

  const entry: LearningInteraction = {
    timestamp,
    type: type as LearningInteraction['type'],
    duration,
  };
  if (score !== undefined) entry.score = score;
  if (bloomLevel !== undefined) entry.bloomLevel = bloomLevel;
  if (notes !== undefined) entry.notes = notes.slice(0, MAX_INTERACTION_NOTES);
  return entry;
}

/**
 * The usable entries of a stored `interactions` value, in their original
 * order. Absent, non-array and broken entries are ignored, and only the last
 * `MAX_INTERACTIONS` are kept (the same cap the server schema enforces).
 */
export function sanitizeInteractions(value: unknown): LearningInteraction[] {
  if (!Array.isArray(value)) return [];
  const valid: LearningInteraction[] = [];
  for (const item of value) {
    const entry = sanitizeInteraction(item);
    if (entry) valid.push(entry);
  }
  return valid.slice(-MAX_INTERACTIONS);
}
