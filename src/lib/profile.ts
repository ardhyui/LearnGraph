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
