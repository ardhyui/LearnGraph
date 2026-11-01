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
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth/client';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home, description: 'Overview' },
  { href: '/profile', label: 'My Profile', icon: UserCircle, description: '39 psychometric domains' },
  { href: '/admin/learners', label: 'Learners', icon: Users, description: 'Manage profiles' },
  { href: '/admin/psychometrics', label: 'Psychometrics', icon: Brain, description: 'Cognitive traits' },
  { href: '/admin/concepts', label: 'Concepts', icon: BookOpen, description: 'Knowledge nodes' },
  { href: '/admin/prerequisites', label: 'Prerequisites', icon: GitBranch, description: 'Dependencies' },
  { href: '/admin/states', label: 'Knowledge States', icon: BarChart3, description: 'Progress tracking' },
  { href: '/recommendations', label: 'Recommendations', icon: Sparkles, description: 'ZPD & learning paths' },
  { href: '/gaps', label: 'Gap Analysis', icon: AlertTriangle, description: 'Find knowledge gaps' },
  { href: '/graph', label: 'Knowledge Graph', icon: Network, description: 'Concepts (Graph B)' },
  { href: '/domains', label: 'Domain Graph', icon: Hexagon, description: 'Psychometrics (Graph A)' },
  { href: '/combined-graph', label: 'Combined View', icon: Layers, description: 'Both graphs + bridge' },
  { href: '/edu-psychology', label: 'Edu Psychology', icon: GraduationCap, description: 'Learn theory' },
  { href: '/about', label: 'About LearnGraph', icon: Info, description: 'System overview' },
  { href: '/status', label: 'System Status', icon: Activity, description: 'Health monitoring' },
  { href: '/tests', label: 'Functional Tests', icon: TestTube2, description: 'Run tests' },
];

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
        <Link to="/" className="flex min-w-0 items-center gap-2">
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

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <motion.div
                key={item.href}
                variants={navItemVariants}
                initial="initial"
                animate="animate"
                whileHover="hover"
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <Link
                  to={item.href as any}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
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
                    <Icon size={18} />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {item.label}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate opacity-0 group-hover:opacity-100 transition-opacity">
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
              </motion.div>
            );
          })}
        </nav>

        {/* Footer with Theme Toggle */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                P5
              </div>
              <div>
                <p className="text-xs font-medium text-sidebar-foreground">Phase 5</p>
                <p className="text-[10px] text-muted-foreground">Gap Analysis</p>
              </div>
            </div>
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
