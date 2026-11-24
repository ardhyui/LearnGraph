import { Link, createFileRoute } from '@tanstack/react-router';
import { pageHead } from '@/lib/page-titles';
import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, BarChart3, BookOpen, CalendarDays, Flame } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceLoading } from '@/components/WorkspaceLoading';
import { useDB, useLearners } from '@/lib/DBContext';
import { useActiveLearner } from '@/lib/active-learner';
import { conceptLabel } from '@/lib/gaps';
import { getLearnerProgress } from '@/server/evidence.functions';
import {
  activityLabel,
  activityTimeLabel,
  retentionPercent,
  weekDetailLine,
  weekRangeLabel,
  type RecentActivity,
  type WeeklyBucket,
  type WeeklyRetention,
} from '@/lib/evidence/progress';
import type { LearningStreak } from '@/lib/evidence/streak';

export const Route = createFileRoute('/progress')({
  head: () => pageHead('/progress'),
  component: ProgressPage,
});

interface LearnerProgress {
  weeks: WeeklyBucket[];
  retention: WeeklyRetention[];
  streak: LearningStreak;
  bestStreak: number;
  recent: RecentActivity[];
  totalEvents: number;
}

/** "1 day" / "3 days", for the streak cards. */
const streakText = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;

function ProgressPage() {
  const { db, isLoading: dbLoading, error: dbError } = useDB();
  const { learners, loading: learnersLoading } = useLearners();
  // Same learner as the dashboard and the other learner pages.
  const [activeLearner, setSelectedLearnerId] = useActiveLearner(
    learners.map((l) => l.userId),
    learnersLoading,
  );
  const selectedLearnerId = activeLearner ?? '';
  const learnerSelectId = useId();
  const [data, setData] = useState<LearnerProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Concept names for the recent activity list, loaded once per database. If
  // the list cannot load, the activity still shows with readable fallbacks.
  const [conceptNames, setConceptNames] = useState<ReadonlyMap<string, string | null>>(new Map());
  // Only the latest request may update the page: switching learners while a
  // load is in flight must not show the previous learner's progress.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    db.listConcepts()
      .then((concepts) => {
        if (cancelled) return;
        setConceptNames(new Map(concepts.map((c) => [c.conceptId, c.name ?? null])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    if (!selectedLearnerId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const seq = ++requestSeq.current;
    setData(null);
    setLoading(true);
    setError(null);
    getLearnerProgress({ data: { learnerId: selectedLearnerId } })
      .then((result) => {
        if (seq === requestSeq.current) setData(result);
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        setError(
          err instanceof Error ? err.message : 'Could not load your progress. Please try again.',
        );
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [selectedLearnerId]);

  if (dbLoading) {
    return <WorkspaceLoading />;
  }

  if (dbError) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="text-center text-destructive">
          <AlertCircle className="w-8 h-8 mx-auto mb-3" aria-hidden="true" />
          <p>Database error: {dbError.message}</p>
        </div>
      </div>
    );
  }

  const currentWeek = data?.weeks.at(-1);
  const noLearner = !learnersLoading && learners.length === 0;
  const busy = learnersLoading || loading;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 min-w-0 w-full px-4 py-6 sm:px-8 sm:py-10 max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="p-2 rounded-xl bg-gradient-to-br from-primary to-purple-500 shadow-lg shadow-primary/25"
              aria-hidden="true"
            >
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Your progress</h1>
          </div>
          <p className="text-muted-foreground sm:ml-14">
            Your last eight weeks of learning, at a glance.
          </p>
        </header>

        {!noLearner && learners.length > 0 && (
          <div className="glass-card p-5 mb-6">
            <label
              htmlFor={learnerSelectId}
              className="block text-sm font-medium text-foreground mb-2"
            >
              Learner
            </label>
            <select
              id={learnerSelectId}
              value={selectedLearnerId}
              onChange={(e) => {
                if (e.target.value) setSelectedLearnerId(e.target.value);
              }}
              className="form-input w-full"
            >
              {learners.map((learner) => (
                <option key={learner.userId} value={learner.userId}>
                  {learner.name || learner.userId}
                </option>
              ))}
            </select>
          </div>
        )}

        {busy && (
          <section className="glass-card py-16 text-center">
            <p role="status" className="text-muted-foreground">
              Loading your progress…
            </p>
          </section>
        )}

        {!busy && error && (
          <p role="alert" className="glass-card p-4 text-destructive">
            {error}
          </p>
        )}

        {!busy && !error && noLearner && (
          <section className="glass-card p-8 text-center">
            <h2 className="text-xl font-semibold text-foreground">No learner yet</h2>
            <p className="mt-2 text-muted-foreground">
              Create your learning plan on the dashboard, then come back to see your progress.
            </p>
            <Link to="/" className="btn btn-primary mt-4 inline-flex">
              Go to the dashboard
            </Link>
          </section>
        )}

        {!busy && !error && data && data.totalEvents === 0 && (
          <section
            className="glass-card p-8 text-center"
            data-testid="progress-empty"
            data-learner-id={selectedLearnerId}
          >
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-foreground">No activity yet</h2>
            <p className="mt-2 text-muted-foreground">
              No activity recorded yet — finish a review or a quiz and it will show up here.
            </p>
          </section>
        )}

        {!busy && !error && data && data.totalEvents > 0 && currentWeek && (
          <div data-testid="progress-content" data-learner-id={selectedLearnerId}>
            <section aria-labelledby="progress-week-title" className="glass-card p-6 mb-6">
              <h2
                id="progress-week-title"
                className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground"
              >
                <CalendarDays className="text-primary" aria-hidden="true" />
                This week
              </h2>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl bg-secondary/50 p-4">
                  <dt className="text-sm text-muted-foreground">Active days</dt>
                  <dd className="text-2xl font-bold text-foreground">{currentWeek.activeDays}</dd>
                </div>
                <div className="rounded-xl bg-secondary/50 p-4">
                  <dt className="text-sm text-muted-foreground">Reviews answered correctly</dt>
                  <dd className="text-2xl font-bold text-foreground">
                    {currentWeek.reviewsCorrect}
                  </dd>
                  <p className="text-xs text-muted-foreground mt-1">
                    {currentWeek.reviewsDue === 0
                      ? 'No due reviews answered'
                      : `of ${currentWeek.reviewsDue} due`}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-4">
                  <dt className="text-sm text-muted-foreground">Quizzes passed</dt>
                  <dd className="text-2xl font-bold text-foreground">
                    {currentWeek.quizzesPassed}
                  </dd>
                </div>
                <div className="rounded-xl bg-secondary/50 p-4">
                  <dt className="text-sm text-muted-foreground">Concepts finished</dt>
                  <dd className="text-2xl font-bold text-foreground">
                    {currentWeek.conceptsFinished}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="progress-streak-title" className="glass-card p-6 mb-6">
              <h2
                id="progress-streak-title"
                className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground"
              >
                <Flame className="text-primary" aria-hidden="true" />
                Streaks
              </h2>
              <dl className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-secondary/50 p-4">
                  <dt className="text-sm text-muted-foreground">Current streak</dt>
                  <dd className="text-2xl font-bold text-foreground">
                    {streakText(data.streak.days)}
                  </dd>
                </div>
                <div className="rounded-xl bg-secondary/50 p-4">
                  <dt className="text-sm text-muted-foreground">Best streak</dt>
                  <dd className="text-2xl font-bold text-foreground">
                    {streakText(data.bestStreak)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-muted-foreground">
                {data.streak.activeToday
                  ? 'You studied today — keep it going.'
                  : data.streak.days > 0
                    ? 'Study today to keep your streak going.'
                    : 'Finish a review, quiz or lesson to start a streak.'}
              </p>
            </section>

            <section aria-labelledby="progress-weeks-title" className="glass-card p-6">
              <h2
                id="progress-weeks-title"
                className="text-xl font-semibold mb-1 text-foreground"
              >
                Week by week
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Retention is the share of due reviews you remembered.
              </p>
              <ul aria-label="Weekly progress" className="space-y-3">
                {[...data.weeks].reverse().map((week) => {
                  const retention = data.retention.find(
                    (row) => row.startsAt === week.startsAt,
                  );
                  return (
                    <li
                      key={week.startsAt}
                      className="rounded-xl border border-border/50 bg-secondary/30 p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-foreground">
                          {weekRangeLabel(week.startsAt, week.endsAt)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Reviews remembered:{' '}
                          <span className="font-medium text-foreground">
                            {retentionPercent(retention?.rate ?? null)}
                          </span>
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{weekDetailLine(week)}</p>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="progress-recent-title" className="glass-card p-6 mt-6">
              <h2
                id="progress-recent-title"
                className="text-xl font-semibold mb-1 text-foreground"
              >
                Recent activity
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                The last 20 things you did, newest first.
              </p>
              {data.recent.length === 0 ? (
                <p className="text-muted-foreground">
                  Your reviews, quizzes and lessons will show up here.
                </p>
              ) : (
                <ul aria-label="Recent activity" className="space-y-3">
                  {data.recent.map((activity, i) => {
                    const name = conceptLabel(
                      activity.conceptId,
                      conceptNames.get(activity.conceptId),
                    );
                    return (
                      <li
                        key={i}
                        className="rounded-xl border border-border/50 bg-secondary/30 p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-medium text-foreground">{name}</p>
                          <time
                            dateTime={activity.createdAt}
                            className="text-sm text-muted-foreground"
                          >
                            {activityTimeLabel(activity.createdAt)}
                          </time>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="text-sm text-muted-foreground">
                            {activityLabel(activity.kind, activity.outcome)}
                          </p>
                          <Link
                            to="/learn/$conceptId"
                            params={{ conceptId: activity.conceptId }}
                            className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                          >
                            <BookOpen className="h-3 w-3" aria-hidden="true" />
                            Open the lesson
                            <span className="sr-only">: {name}</span>
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

      </main>
    </div>
  );
}
