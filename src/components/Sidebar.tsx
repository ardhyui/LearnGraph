import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useRouteContext, useRouter } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  Users,
  BookOpen,
  GitBranch,
  BarChart3,
  Network,
  TestTube2,
  Home,
  Brain,
  GraduationCap,
  AlertTriangle,
  Sparkles,
  Activity,
  UserCircle,
  Hexagon,
  Layers,
  Info,
  LogOut,
  Menu,
  X,
  Database,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth/client';
import {
  NAV_SECTIONS,
  NAV_STORAGE_KEY,
  isNavItemActive,
  isSectionOpen,
  parseNavOpenState,
  type NavIcon,
  type NavOpenState,
  type NavSection,
} from '@/lib/navigation';

const icons: Record<NavIcon, LucideIcon> = {
  home: Home,
  sparkles: Sparkles,
  alert: AlertTriangle,
  network: Network,
  user: UserCircle,
  hexagon: Hexagon,
  layers: Layers,
  graduation: GraduationCap,
  info: Info,
  users: Users,
  brain: Brain,
  book: BookOpen,
  branch: GitBranch,
  chart: BarChart3,
  database: Database,
  activity: Activity,
  test: TestTube2,
};

const navItemVariants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  hover: { x: 4 },
};

const iconVariants = {
  initial: { scale: 1 },
  hover: { scale: 1.1, rotate: [0, -10, 10, 0] },
};

export function Sidebar() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const user = useRouteContext({ from: '__root__', select: (c) => c.user });
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await router.navigate({ to: '/sign-in', search: {} });
  }

  // Open/closed choice for the collapsible groups (Manage data, Developer
  // tools), remembered in this browser. Read after mount so SSR and the first
  // client render agree.
  const [savedOpen, setSavedOpen] = useState<NavOpenState>({});
  useEffect(() => {
    try {
      setSavedOpen(parseNavOpenState(window.localStorage.getItem(NAV_STORAGE_KEY)));
    } catch {
      // storage unavailable (private mode) — groups simply start closed
    }
  }, []);
  function toggleSection(section: NavSection) {
    const next = { ...savedOpen, [section.id]: !isSectionOpen(section, pathname, savedOpen) };
    setSavedOpen(next);
    try {
      window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  // Below the `lg` breakpoint the sidebar is an off-canvas drawer opened from
  // a compact top bar; from `lg` up it is the usual sticky column.
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      // Give focus back to the menu button only when the drawer was open.
      if (wasOpen.current) menuButtonRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      // Keep Tab focus inside the open drawer (it is a modal on small screens).
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !drawerRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !drawerRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    // Close if the window grows to desktop width while the drawer is open.
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => {
      if (desktop.matches) setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onResize);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onResize);
    };
  }, [open]);

  return (
    <>
      {/* Mobile / tablet top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar-background/95 px-2 backdrop-blur">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" activeOptions={{ exact: true }} className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
            <Brain className="h-4 w-4 text-white" />
          </span>
          <span className="truncate font-bold text-sidebar-foreground">LearnGraph</span>
        </Link>
        <div className="ml-auto pr-1">
          <ThemeToggle />
        </div>
      </header>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
          aria-hidden="true"
          data-testid="sidebar-backdrop"
        />
      )}

      <aside
        ref={drawerRef}
        id="app-sidebar"
        aria-label="Main navigation"
        className={cn(
          'w-72 max-w-[85vw] bg-sidebar-background border-r border-sidebar-border flex flex-col',
          'fixed inset-y-0 left-0 z-50 transition-[transform,visibility] duration-200 ease-out',
          'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:visible lg:transition-none',
          open ? 'translate-x-0 visible shadow-2xl' : '-translate-x-full invisible'
        )}
      >
        {/* Logo Section */}
        <div className="p-6 border-b border-sidebar-border flex items-start justify-between gap-2">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' as const }}
            className="flex items-center gap-3"
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <motion.div
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
                LearnGraph
              </h1>
              <p className="text-xs text-muted-foreground">Adaptive Education</p>
            </div>
          </motion.div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="lg:hidden -mr-2 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation: learner pages first; admin & debug tools in collapsible groups */}
        <nav aria-label="Pages" className="flex-1 p-4 overflow-y-auto scrollbar-hide">
          {NAV_SECTIONS.map((section, sectionIndex) => {
            const headingId = `nav-heading-${section.id}`;
            const listId = `nav-list-${section.id}`;
            const isOpen = isSectionOpen(section, pathname, savedOpen);
            return (
              <div key={section.id} className={cn(sectionIndex > 0 && 'mt-4')} data-testid={`nav-section-${section.id}`}>
                {section.collapsible ? (
                  <h2 id={headingId} className="m-0">
                    <button
                      type="button"
                      onClick={() => toggleSection(section)}
                      aria-expanded={isOpen}
                      aria-controls={listId}
                      className="flex w-full min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-90')}
                      />
                      {section.title}
                    </button>
                  </h2>
                ) : (
                  <h2
                    id={headingId}
                    className="m-0 px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {section.title}
                  </h2>
                )}
                <ul id={listId} aria-labelledby={headingId} hidden={!isOpen} className="mt-1 space-y-1">
                  {section.items.map((item, index) => {
                    const Icon = icons[item.icon];
                    const isActive = isNavItemActive(item.href, pathname);
                    return (
                      <motion.li
                        key={item.href}
                        variants={navItemVariants}
                        initial="initial"
                        animate="animate"
                        whileHover="hover"
                        transition={{ delay: Math.min(index, 6) * 0.04, duration: 0.3 }}
                      >
                        <Link
                          to={item.href as any}
                          onClick={() => setOpen(false)}
                          // Same rule as isActive, so the router's aria-current="page" matches the highlight.
                          activeOptions={{ exact: item.href === '/' }}
                          className={cn(
                            'group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200',
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                          )}
                        >
                          <motion.div
                            variants={iconVariants}
                            transition={{ duration: 0.3 }}
                            className={cn(
                              'flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
                              isActive
                                ? 'bg-primary text-primary-foreground shadow-md'
                                : 'bg-muted/50 group-hover:bg-muted'
                            )}
                          >
                            <Icon size={18} aria-hidden="true" />
                          </motion.div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-sm font-medium truncate">{item.label}</span>
                            <span className="block text-xs text-muted-foreground truncate">
                              {item.description}
                            </span>
                          </div>
                          {isActive && (
                            <motion.div
                              layoutId="activeIndicator"
                              className="w-1.5 h-8 rounded-full bg-primary"
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                          )}
                        </Link>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Footer with Theme Toggle */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          {user && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground truncate" title={user.email ?? undefined}>
                {user.name || user.email}
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
