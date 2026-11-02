import { createFileRoute, Link } from '@tanstack/react-router';
import { pageHead } from '@/lib/page-titles';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Info,
  Lightbulb,
  Network,
  Sparkles,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { StudyToday } from '@/components/StudyToday';
import { EtherealShadow } from '@/components/ui/ethereal-shadow';
import { LEARNER_SHORTCUTS, MANAGE_LINKS, dashboardHeading } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/')({
  head: () => pageHead('/'),
  component: HomePage,
});

const SHORTCUT_ICONS: Record<string, { icon: LucideIcon; tint: string }> = {
  '/recommendations': { icon: Lightbulb, tint: 'bg-pink-500/10 text-pink-600 dark:text-pink-400' },
  '/gaps': { icon: AlertTriangle, tint: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  '/graph': { icon: Network, tint: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  '/profile': { icon: UserCircle, tint: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
};

function HomePage() {
  const { user } = Route.useRouteContext();

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 min-w-0 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <EtherealShadow
            color="rgba(139, 92, 246, 0.15)"
            animation={{ scale: 30, speed: 40 }}
            noise={{ opacity: 0.3, scale: 0.8 }}
          />
        </div>

        <div className="relative z-10 px-4 py-6 sm:px-8 sm:py-8 max-w-7xl mx-auto">
          {/* Short greeting: the study loop below is the main content. */}
          <header className="mb-5 sm:mb-6" data-testid="dashboard-header">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {dashboardHeading(user)}
            </h1>
            <p className="mt-1 text-sm sm:text-base text-muted-foreground">
              Review what’s due, then learn something new.
            </p>
          </header>

          {/* Core study loop: progress, reviews due, what to learn next */}
          <StudyToday />

          {/* Learner shortcuts */}
          <section aria-labelledby="explore-heading" className="mb-8">
            <h2 id="explore-heading" className="text-base font-semibold text-foreground mb-3">
              Keep exploring
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" aria-labelledby="explore-heading">
              {LEARNER_SHORTCUTS.map((card) => {
                const { icon: Icon, tint } = SHORTCUT_ICONS[card.href] ?? {
                  icon: Sparkles,
                  tint: 'bg-primary/10 text-primary',
                };
                return (
                  <li key={card.href}>
                    <Link
                      to={card.href as any}
                      className={cn(
                        'group flex items-start gap-3 h-full p-4 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm',
                        'transition-colors hover:border-border hover:bg-card/80',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      )}
                    >
                      <span className={cn('p-2 rounded-xl shrink-0', tint)}>
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                          {card.label}
                          <ArrowRight
                            className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="block text-xs text-muted-foreground leading-relaxed mt-0.5">
                          {card.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Background + data management: collapsed so it never pushes the study loop down. */}
          <details
            className="group/about rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm"
            data-testid="dashboard-about"
          >
            <summary
              className={cn(
                'flex items-center gap-3 cursor-pointer list-none p-4 min-h-11 rounded-2xl',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                '[&::-webkit-details-marker]:hidden',
              )}
            >
              <Info className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-sm text-foreground">About LearnGraph &amp; your data</span>
                <span className="block text-xs text-muted-foreground">
                  How it works, and where to edit learners and concepts
                </span>
              </span>
              <ChevronDown
                className="w-4 h-4 text-muted-foreground transition-transform group-open/about:rotate-180"
                aria-hidden="true"
              />
            </summary>

            <div className="px-4 pb-5 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-1">Works with any subject</h2>
                <p className="text-sm text-muted-foreground max-w-3xl">
                  LearnGraph keeps track of concepts, how they depend on each other, and how well each
                  learner knows them — then suggests what to review and what to learn next. Model any
                  subject: math, programming, music theory, languages, or workplace training.
                </p>
                <Link
                  to="/about"
                  className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-primary hover:underline"
                >
                  Learn what makes LearnGraph different
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>

              <div>
                <h2 id="manage-heading" className="text-sm font-semibold text-foreground mb-2">
                  Manage data
                </h2>
                <ul className="flex flex-wrap gap-2" aria-labelledby="manage-heading">
                  {MANAGE_LINKS.map((l) => (
                    <li key={l.href}>
                      <Link
                        to={l.href as any}
                        title={l.description}
                        className="inline-flex items-center min-h-10 px-3 py-2 text-sm rounded-xl border border-border/60 bg-background/60 text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>

          <footer className="mt-10 text-center">
            <p className="text-xs text-muted-foreground/70">
              Created by <span className="font-medium text-foreground/60">Dr. Lee</span>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
