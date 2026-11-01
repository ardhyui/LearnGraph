/**
 * Main navigation, grouped so learners see their own pages first.
 *
 * "Learn" and "Explore" are always open. Data management (the admin editors)
 * and developer tools (/status, /tests) sit in collapsible groups that start
 * closed — unless the current page lives in them — so a learner's menu is not
 * a wall of 16 equal links. Pure data + helpers (no React) so it is unit-tested.
 */

export type NavIcon =
  | 'home'
  | 'sparkles'
  | 'alert'
  | 'network'
  | 'user'
  | 'hexagon'
  | 'layers'
  | 'graduation'
  | 'info'
  | 'users'
  | 'brain'
  | 'book'
  | 'branch'
  | 'chart'
  | 'database'
  | 'activity'
  | 'test';

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: NavIcon;
}

export interface NavSection {
  id: 'learn' | 'explore' | 'manage' | 'developer';
  title: string;
  /** Collapsible groups start closed unless they contain the current page. */
  collapsible: boolean;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'learn',
    title: 'Learn',
    collapsible: false,
    items: [
      { href: '/', label: 'Dashboard', description: 'Your plan for today', icon: 'home' },
      { href: '/recommendations', label: 'Recommendations', description: 'What to learn next', icon: 'sparkles' },
      { href: '/gaps', label: 'Gap Analysis', description: 'Find what is missing', icon: 'alert' },
      { href: '/graph', label: 'Knowledge Graph', description: 'See how concepts connect', icon: 'network' },
      { href: '/profile', label: 'My Profile', description: 'How you learn best', icon: 'user' },
    ],
  },
  {
    id: 'explore',
    title: 'Explore',
    collapsible: false,
    items: [
      { href: '/domains', label: 'Domain Graph', description: 'Psychometric domains', icon: 'hexagon' },
      { href: '/combined-graph', label: 'Combined View', description: 'Both graphs together', icon: 'layers' },
      { href: '/edu-psychology', label: 'Edu Psychology', description: 'The theory behind it', icon: 'graduation' },
      { href: '/about', label: 'About LearnGraph', description: 'How it works', icon: 'info' },
    ],
  },
  {
    id: 'manage',
    title: 'Manage data',
    collapsible: true,
    items: [
      { href: '/admin/learners', label: 'Learners', description: 'Learner profiles', icon: 'users' },
      { href: '/admin/psychometrics', label: 'Psychometrics', description: 'Cognitive traits', icon: 'brain' },
      { href: '/admin/concepts', label: 'Concepts', description: 'Knowledge nodes', icon: 'book' },
      { href: '/admin/prerequisites', label: 'Prerequisites', description: 'Dependencies', icon: 'branch' },
      { href: '/admin/states', label: 'Knowledge States', description: 'Progress records', icon: 'chart' },
      { href: '/data-entry', label: 'Data Entry', description: 'Quick add forms', icon: 'database' },
    ],
  },
  {
    id: 'developer',
    title: 'Developer tools',
    collapsible: true,
    items: [
      { href: '/status', label: 'System Status', description: 'Health monitoring', icon: 'activity' },
      { href: '/tests', label: 'Functional Tests', description: 'Run engine checks', icon: 'test' },
    ],
  },
];

/** Same rule the router uses for aria-current: "/" exact, others by path segment. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function sectionHasActive(section: NavSection, pathname: string): boolean {
  return section.items.some((item) => isNavItemActive(item.href, pathname));
}

export type NavOpenState = Partial<Record<NavSection['id'], boolean>>;

/**
 * Whether a section's links are shown. Fixed sections always are; a collapsible
 * one follows the user's choice, else opens only for the page you are on. The
 * current page's group is never hidden (you must see where you are).
 */
export function isSectionOpen(section: NavSection, pathname: string, saved: NavOpenState): boolean {
  if (!section.collapsible) return true;
  if (sectionHasActive(section, pathname)) return true;
  return saved[section.id] ?? false;
}

export const NAV_STORAGE_KEY = 'learngraph:nav-open';

/** Parse the saved open/closed choices; anything malformed is ignored. */
export function parseNavOpenState(raw: string | null | undefined): NavOpenState {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: NavOpenState = {};
    for (const section of NAV_SECTIONS) {
      const v = (value as Record<string, unknown>)[section.id];
      if (section.collapsible && typeof v === 'boolean') out[section.id] = v;
    }
    return out;
  } catch {
    return {};
  }
}
