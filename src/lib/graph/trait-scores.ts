/**
 * Reading personality traits out of a learner's psychometric scores.
 *
 * My Profile (and the questionnaires) store Big Five traits under the
 * canonical ids from `PSYCHOMETRIC_DOMAINS` (`big_five_openness`, …), but the
 * recommendation engine used to look them up under older names
 * (`openness_to_experience`, `conscientiousness`, …) — so a profile filled in
 * on My Profile never changed a single recommendation. Every engine lookup
 * goes through `traitScore`, which reads the canonical id first and falls
 * back to the old names so profiles saved by earlier versions keep working.
 */

export type Trait = 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism';

/** Storage keys per trait: canonical id first, then legacy aliases. */
export const TRAIT_KEYS: Readonly<Record<Trait, readonly string[]>> = {
  openness: ['big_five_openness', 'openness_to_experience', 'openness'],
  conscientiousness: ['big_five_conscientiousness', 'conscientiousness'],
  extraversion: ['big_five_extraversion', 'extraversion'],
  agreeableness: ['big_five_agreeableness', 'agreeableness'],
  neuroticism: ['big_five_neuroticism', 'neuroticism'],
};

/**
 * The trait's 0–100 score, or `undefined` when it is not filled in.
 * Only `{ score: number }` entries in range count: old demo data stores bare
 * 0–1 numbers, and those must not be mistaken for a (very low) score.
 */
export function traitScore(scores: unknown, trait: Trait): number | undefined {
  if (!scores || typeof scores !== 'object') return undefined;
  const record = scores as Record<string, unknown>;
  for (const key of TRAIT_KEYS[trait]) {
    if (!Object.hasOwn(record, key)) continue;
    const entry = record[key];
    if (!entry || typeof entry !== 'object') continue;
    const score = (entry as { score?: unknown }).score;
    if (typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100) return score;
  }
  return undefined;
}
