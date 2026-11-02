/**
 * "My Profile" for learners: what they study (subjects), how far they are,
 * and — optional, further down — a learning-style profile. Copy lives here as
 * plain data so it can be tested without rendering the page.
 */
import type { ProgressSummary } from './study.ts';

export type ProfileMode = 'view' | 'auto' | 'manual' | 'adaptive' | 'assessment';

export interface ProfileModeCopy {
  /** Short label on the mode button. */
  label: string;
  /** Heading of the explanation under the buttons. */
  title: string;
  description: string;
}

/** How the optional learning-style profile is filled in, in everyday words. */
export const PROFILE_MODE_COPY: Record<ProfileMode, ProfileModeCopy> = {
  view: {
    label: 'Just look',
    title: 'Look at your profile',
    description: 'See what is filled in so far. Pick another option to change it.',
  },
  auto: {
    label: 'Automatic',
    title: 'Let LearnGraph fill it in',
    description: 'LearnGraph may adjust these values over time from how you study. You can switch to another option later.',
  },
  manual: {
    label: 'Set it myself',
    title: 'Set the values yourself',
    description: 'You choose every value and LearnGraph never changes them.',
  },
  adaptive: {
    label: 'Set, then adjust',
    title: 'Start with your values, adjust over time',
    description: 'You set starting values; LearnGraph may fine-tune them as you study.',
  },
  assessment: {
    label: 'Take quizzes',
    title: 'Answer short questionnaires',
    description: 'Answer a few questions per topic and your values are worked out for you. Takes a few minutes each.',
  },
};

export const PROFILE_MODES: readonly ProfileMode[] = ['view', 'auto', 'manual', 'adaptive', 'assessment'];

/** Mode stored on a profile (anything unknown means "not chosen yet"). */
export function profileModeLabel(mode: string | null | undefined): string | null {
  if (!mode || mode === 'view' || !Object.hasOwn(PROFILE_MODE_COPY, mode)) return null;
  return PROFILE_MODE_COPY[mode as ProfileMode].label;
}

/** "3 of 12 concepts mastered" — with the right plural and a friendly empty case. */
export function masteredLine(progress: Pick<ProgressSummary, 'mastered' | 'total'>): string {
  if (progress.total === 0) return 'No concepts in your subjects yet';
  const noun = progress.total === 1 ? 'concept' : 'concepts';
  return `${progress.mastered} of ${progress.total} ${noun} mastered`;
}

export interface NextStep {
  label: string;
  hint: string;
}

/**
 * The one thing to do next, pointing back to the Today panel on the dashboard:
 * reviews first (they fade), then something new, then a well-done message.
 */
export function profileNextStep(
  progress: Pick<ProgressSummary, 'total' | 'mastered' | 'learning' | 'notStarted'>,
  reviewsDue: number,
): NextStep {
  const due = Math.max(0, Math.floor(reviewsDue));
  if (due > 0) {
    return {
      label: due === 1 ? 'Do your 1 review' : `Do your ${due} reviews`,
      hint: 'Reviewing what is fading keeps it in your memory.',
    };
  }
  if (progress.total === 0) {
    return { label: 'Go to today’s plan', hint: 'Choose subjects with concepts to get a plan.' };
  }
  if (progress.mastered >= progress.total) {
    return { label: 'Go to today’s plan', hint: 'You have mastered everything in your subjects — try adding a subject.' };
  }
  if (progress.learning > 0) {
    return { label: 'Keep learning', hint: 'Pick up where you left off on today’s plan.' };
  }
  return { label: 'Start learning', hint: 'Your plan suggests where to begin.' };
}

export interface ProfileCategoryCopy {
  /** Everyday name shown on the category card. */
  name: string;
  /** One line under the name. */
  hint: string;
  /**
   * Whether the study plan reads these values (learning style, pace, how
   * much support and challenge to suggest). Categories that are not used are
   * folded away under "More about you" so the page leads with what matters.
   */
  usedByPlan: boolean;
}

/**
 * Learner-facing names for the learning-style categories, in display order:
 * the ones the study plan uses first. Unknown categories fall to the end.
 */
export const PROFILE_CATEGORY_COPY: Readonly<Record<string, ProfileCategoryCopy>> = {
  cognitive_learning: {
    name: 'How you think and learn',
    hint: 'Learning style, focus and memory — shapes how new topics are presented.',
    usedByPlan: true,
  },
  decision_motivation: {
    name: 'Motivation and mindset',
    hint: 'Confidence and drive — shapes how much support you get.',
    usedByPlan: true,
  },
  core_personality: {
    name: 'Personality',
    hint: 'Curiosity, organisation, calm — shapes pace and challenge level.',
    usedByPlan: true,
  },
  emotional_social: {
    name: 'Feelings and relationships',
    hint: 'Empathy and how you relate to others.',
    usedByPlan: false,
  },
  values_wellbeing: {
    name: 'Values and wellbeing',
    hint: 'What matters to you and how you are doing.',
    usedByPlan: false,
  },
  social_cultural: {
    name: 'Society and culture',
    hint: 'How you see others, culture and work.',
    usedByPlan: false,
  },
  sensory_aesthetic: {
    name: 'Senses and taste',
    hint: 'Sensitivity to surroundings and sense of beauty.',
    usedByPlan: false,
  },
  dark_personality: {
    name: 'Difficult traits',
    hint: 'Research traits such as self-centredness. Entirely optional.',
    usedByPlan: false,
  },
};

const CATEGORY_ORDER = Object.keys(PROFILE_CATEGORY_COPY);

/** Copy for a category; unknown ids get a readable fallback and count as "more". */
export function profileCategoryCopy(id: string, fallbackName = id): ProfileCategoryCopy {
  if (Object.hasOwn(PROFILE_CATEGORY_COPY, id)) return PROFILE_CATEGORY_COPY[id];
  // Strip "A. "-style prefixes from legacy names.
  return { name: fallbackName.replace(/^[A-Z]\.\s+/, ''), hint: '', usedByPlan: false };
}

/**
 * Split categories into the ones shown up front (used by the study plan) and
 * the rest ("More about you"), each in display order. Input order is kept for
 * unknown ids, after the known ones.
 */
export function splitProfileCategories<T extends { id: string }>(categories: readonly T[]): { main: T[]; more: T[] } {
  const rank = (id: string) => {
    const i = CATEGORY_ORDER.indexOf(id);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  const sorted = categories
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c.id) - rank(b.c.id) || a.i - b.i)
    .map(({ c }) => c);
  return {
    main: sorted.filter((c) => profileCategoryCopy(c.id).usedByPlan),
    more: sorted.filter((c) => !profileCategoryCopy(c.id).usedByPlan),
  };
}

/** "2 of 6 filled in" for a category card. */
export function filledInLine(filled: number, total: number): string {
  const f = Math.max(0, Math.floor(filled));
  return total <= 0 ? 'Nothing to fill in' : `${Math.min(f, total)} of ${total} filled in`;
}
