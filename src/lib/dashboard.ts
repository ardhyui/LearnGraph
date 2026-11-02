/**
 * Dashboard content for returning learners: a short greeting, then the
 * "Today" study panel, then a few learner shortcuts. Product background and
 * data-management links live in a collapsed "About" section so they no longer
 * push the study loop below the first screen (especially on phones).
 */

export interface DashboardLink {
  href: string;
  label: string;
  description: string;
}

/** Learner-facing shortcuts shown under the Today panel. */
export const LEARNER_SHORTCUTS: readonly DashboardLink[] = [
  { href: '/recommendations', label: 'Recommendations', description: 'More concepts you are ready to learn next' },
  { href: '/gaps', label: 'Gap Analysis', description: 'Find shaky foundations and what to review' },
  { href: '/graph', label: 'Knowledge Graph', description: 'See how concepts connect and where you are' },
  { href: '/profile', label: 'My Profile', description: 'See how you learn best and update your profile' },
];

/** Admin/editor pages, tucked inside the collapsed "About" section. */
export const MANAGE_LINKS: readonly DashboardLink[] = [
  { href: '/admin/learners', label: 'Learners', description: 'Learner profiles' },
  { href: '/admin/concepts', label: 'Concepts', description: 'Concept nodes' },
  { href: '/admin/prerequisites', label: 'Prerequisites', description: 'Concept dependencies' },
  { href: '/admin/states', label: 'Knowledge States', description: 'Progress and mastery' },
  { href: '/data-entry', label: 'Data Entry Guide', description: 'How to structure your content' },
];

const MAX_NAME = 40;

/**
 * First name for the greeting ("Hi, Sari"). Falls back to the part of the
 * email before "@", and to null when nothing usable is known (the heading
 * then reads "Your learning today"). Deterministic — no clock — so the server
 * render and hydration always agree.
 */
export function greetingName(user: { name?: string | null; email?: string | null } | null | undefined): string | null {
  const clean = (s: string) =>
    s
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .trim()
      .split(/\s+/)[0] ?? '';
  const fromName = clean(user?.name ?? '');
  const fromEmail = clean((user?.email ?? '').split('@')[0] ?? '');
  const name = fromName || fromEmail;
  if (!name) return null;
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME)}…` : name;
}

export function dashboardHeading(user: Parameters<typeof greetingName>[0]): string {
  const name = greetingName(user);
  return name ? `Hi, ${name}` : 'Your learning today';
}
