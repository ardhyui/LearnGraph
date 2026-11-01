/**
 * Dashboard "Today" panel — the core study loop for one learner:
 * progress at a glance, reviews due now (spaced repetition), and what to
 * learn next (ZPD). Self-reports are saved through `setKnowledgeState`
 * (server-validated, scoped to the signed-in account) and the panel reloads.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, Clock, Loader2, RefreshCw, RotateCcw, Sparkles, Target, UserPlus } from 'lucide-react';
import { Onboarding } from '@/components/Onboarding';
import { useDB, useLearners } from '@/lib/DBContext';
import type { ConceptNode, KnowledgeState, ZPDRecommendation } from '@/lib/graph/types';
import {
  applyReviewOutcome,
  applyStudyOutcome,
  pickActiveLearner,
  summarizeProgress,
  type ProgressSummary,
  type ReviewOutcome,
  type StudyOutcome,
} from '@/lib/study';
import { domainLabel, focusDomains, inFocus, needsOnboarding } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

const ACTIVE_LEARNER_KEY = 'learngraph.activeLearner';
/** Set when the user chose to explore the example learners instead of onboarding. */
const ONBOARDING_SKIPPED_KEY = 'learngraph.onboardingSkipped';

interface ReviewItem {
  conceptId: string;
  concept: ConceptNode;
  predictedRetention: number;
  daysSinceReview: number;
}

interface TodayData {
  learnerId: string;
  progress: ProgressSummary;
  states: KnowledgeState[];
  reviews: ReviewItem[];
  reviewsDue: number;
  next: ZPDRecommendation[];
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / storage disabled: the choice just isn't remembered.
  }
}

const readRemembered = () => readStored(ACTIVE_LEARNER_KEY);
const remember = (id: string) => store(ACTIVE_LEARNER_KEY, id);

export function StudyToday() {
  const { db, isReady } = useDB();
  const { learners, loading: learnersLoading, refresh: refreshLearners } = useLearners();
  // `null` until read from the browser (avoids an SSR/hydration mismatch).
  const [onboardingSkipped, setOnboardingSkipped] = useState<boolean | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectId = useId();
  // Only the latest request may update the panel (switching learners while a
  // load is in flight must not show — or save against — the previous learner).
  const requestSeq = useRef(0);

  useEffect(() => {
    setOnboardingSkipped(readStored(ONBOARDING_SKIPPED_KEY) === '1');
  }, []);

  // Subjects the active learner chose during onboarding (empty = everything).
  const activeLearner = learners.find((l) => l.userId === learnerId);
  const focus = focusDomains(activeLearner);
  const focusKey = focus.join('\n');

  // Choose the learner once the list is known (remembered choice, else first).
  useEffect(() => {
    if (learnersLoading) return;
    const ids = learners.map((l) => l.userId);
    setLearnerId((current) => pickActiveLearner(ids, current ?? readRemembered()));
  }, [learners, learnersLoading]);

  const load = useCallback(async () => {
    if (!db || !isReady || !learnerId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const [allConcepts, states, queue, zpd] = await Promise.all([
        db.listConcepts(),
        db.getLearnerKnowledgeStates(learnerId),
        db.getReviewQueue(learnerId, { limit: 5 }),
        db.computeZPD(learnerId, { limit: focusKey ? 30 : 8 }),
      ]);
      if (seq !== requestSeq.current) return;
      // Progress and "learn next" follow the learner's chosen subjects;
      // reviews stay across everything they have learned.
      const focusList = focusKey ? focusKey.split('\n') : [];
      const concepts = inFocus(allConcepts, focusList, (c) => c.domain);
      const recommended = inFocus(zpd.recommendations, focusList, (r) => r.concept.domain);
      setData({
        learnerId,
        progress: summarizeProgress(concepts, states),
        states,
        reviews: queue.queue,
        reviewsDue: queue.stats.totalItems,
        // A concept already listed for review isn't offered again as "learn next".
        next: recommended
          .filter((r) => !queue.queue.some((q) => q.conceptId === r.concept.conceptId))
          .slice(0, 3),
      });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error('Failed to load today’s study plan:', err);
      setError(err instanceof Error ? err.message : 'Could not load your study plan.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [db, isReady, learnerId, focusKey]);

  useEffect(() => {
    setData(null);
    setNotice(null);
    load();
  }, [load]);

  const chooseLearner = (id: string) => {
    remember(id);
    setWelcome(null);
    setLearnerId(id);
  };

  const onboarded = async (id: string, name: string) => {
    remember(id);
    // Reload the list first, so the welcome step doesn't flash back while the
    // new learner is not in it yet.
    await refreshLearners();
    setLearnerId(id);
    setOnboardingOpen(false);
    setWelcome(`Welcome, ${name}! Here is your plan — start with the first concept under “Learn next”.`);
  };

  const skipOnboarding = () => {
    store(ONBOARDING_SKIPPED_KEY, '1');
    setOnboardingSkipped(true);
    setOnboardingOpen(false);
  };

  const save = async (concept: ConceptNode, outcome: StudyOutcome | ReviewOutcome) => {
    if (!db || !learnerId || busy || data?.learnerId !== learnerId) return;
    setBusy(concept.conceptId);
    setNotice(null);
    setWelcome(null);
    try {
      const prior = data.states.find((s) => s.conceptId === concept.conceptId);
      const patch =
        outcome === 'remembered' || outcome === 'forgot'
          ? applyReviewOutcome(prior, outcome)
          : applyStudyOutcome(prior, outcome);
      await db.setKnowledgeState(learnerId, concept.conceptId, patch);
      setNotice(NOTICES[outcome](concept.name));
      await load();
    } catch (err) {
      setNotice(`Could not save: ${err instanceof Error ? err.message : 'please try again.'}`);
    } finally {
      setBusy(null);
    }
  };

  if (!isReady || learnersLoading || onboardingSkipped === null) {
    return (
      <section aria-labelledby="today-heading" className="glass-card mb-10 p-6">
        <h2 id="today-heading" className="text-lg font-semibold text-foreground">
          Today
        </h2>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your study plan…
        </p>
      </section>
    );
  }

  // New users (no learner of their own yet) get the welcome step first. With
  // no learners at all it is the only way forward, so it can't be skipped.
  const noOwnLearner = needsOnboarding(learners);
  if (learners.length === 0 || onboardingOpen || (noOwnLearner && !onboardingSkipped)) {
    return (
      <Onboarding
        existingIds={learners.map((l) => l.userId)}
        onCreated={onboarded}
        onSkip={
          learners.length === 0
            ? undefined
            : onboardingOpen && onboardingSkipped
              ? () => setOnboardingOpen(false)
              : skipOnboarding
        }
      />
    );
  }

  // Never render (or act on) another learner's plan while the new one loads.
  const current = data?.learnerId === learnerId ? data : null;
  const progress = current?.progress;

  return (
    <section aria-labelledby="today-heading" className="glass-card mb-10 p-4 sm:p-6" data-testid="study-today">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="today-heading" className="text-lg font-semibold text-foreground">
            Today
          </h2>
          <p className="text-sm text-muted-foreground">
            Review what is fading, then learn something new.
            {focus.length > 0 && (
              <span className="block text-xs" data-testid="focus-subjects">
                Focus: {focus.map(domainLabel).join(', ')}
              </span>
            )}
          </p>
          {noOwnLearner && (
            <button
              type="button"
              onClick={() => setOnboardingOpen(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <UserPlus className="h-3 w-3" aria-hidden="true" /> Create my own learning plan
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-sm text-muted-foreground">
            Learner
          </label>
          <select
            id={selectId}
            value={learnerId ?? ''}
            onChange={(e) => chooseLearner(e.target.value)}
            className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {learners.map((l) => (
              <option key={l.userId} value={l.userId}>
                {l.name || l.userId}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="Refresh study plan"
            className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}{' '}
          <button type="button" onClick={() => load()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      <p aria-live="polite" role="status" className={cn('text-sm text-emerald-700 dark:text-emerald-400', (notice || welcome) && 'mt-4')}>
        {notice ?? welcome}
      </p>

      {/* Progress */}
      <div className="mt-4 rounded-xl border border-border/50 bg-background/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {progress ? (
              <>
                <span data-testid="mastered-count">{progress.mastered}</span> of {progress.total} concepts mastered
              </>
            ) : (
              'Progress'
            )}
          </p>
          {progress && (
            <p className="text-xs text-muted-foreground">
              {progress.learning} in progress · {progress.notStarted} not started · {current?.reviewsDue ?? 0} to review
            </p>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Concepts mastered"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress?.percentMastered ?? 0}
          className="mt-3 h-2 overflow-hidden rounded-full bg-primary/10"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${progress?.percentMastered ?? 0}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Reviews due */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <RotateCcw className="h-4 w-4 text-amber-500" aria-hidden="true" /> Review now
            {current && current.reviewsDue > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                {current.reviewsDue}
              </span>
            )}
          </h3>
          {!current ? (
            <Placeholder loading={loading} />
          ) : current.reviews.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nothing to review right now. Concepts come back here when they start to fade.
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Reviews due">
              {current.reviews.map((item) => (
                <li key={item.conceptId} className="rounded-xl border border-border/50 bg-background/40 p-3">
                  <p className="font-medium text-foreground">{item.concept.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Estimated memory {item.predictedRetention}% · last reviewed {formatDays(item.daysSinceReview)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`How did reviewing ${item.concept.name} go?`}>
                    <ActionButton
                      busy={busy === item.conceptId}
                      disabled={!!busy}
                      onClick={() => save(item.concept, 'remembered')}
                      tone="good"
                    >
                      I remembered it
                    </ActionButton>
                    <ActionButton
                      busy={false}
                      disabled={!!busy}
                      onClick={() => save(item.concept, 'forgot')}
                      tone="neutral"
                    >
                      I forgot
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Learn next */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Target className="h-4 w-4 text-indigo-500" aria-hidden="true" /> Learn next
          </h3>
          {!current ? (
            <Placeholder loading={loading} />
          ) : current.next.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {current.progress.total === 0 ? (
                <>
                  No concepts yet.{' '}
                  <Link to="/admin/concepts" className="font-medium text-primary underline">
                    Add your first concept
                  </Link>
                  .
                </>
              ) : (
                current.reviewsDue > 0 ? (
                  <>Start with your reviews — new concepts show up here once their prerequisites are fresh again.</>
                ) : (
                <>
                  Nothing is ready to learn right now — see the{' '}
                  <Link to="/recommendations" className="font-medium text-primary underline">
                    full learning path
                  </Link>{' '}
                  for what comes later.
                </>
                )
              )}
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Recommended next concepts">
              {current.next.map((rec) => (
                <li key={rec.concept.conceptId} className="rounded-xl border border-border/50 bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground">{rec.concept.name}</p>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden="true" />~{Math.max(1, Math.round(rec.estimatedMasteryTime))} min
                    </span>
                  </div>
                  {rec.reasons[0] && <p className="text-xs text-muted-foreground">{rec.reasons[0]}</p>}
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`After studying ${rec.concept.name}`}>
                    <ActionButton
                      busy={busy === rec.concept.conceptId}
                      disabled={!!busy}
                      onClick={() => save(rec.concept, 'got-it')}
                      tone="good"
                    >
                      I've got it
                    </ActionButton>
                    <ActionButton
                      busy={false}
                      disabled={!!busy}
                      onClick={() => save(rec.concept, 'started')}
                      tone="neutral"
                    >
                      Still learning
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/recommendations"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" /> Why these? See the full learning path
          </Link>
        </div>
      </div>
    </section>
  );
}

const NOTICES: Record<StudyOutcome | ReviewOutcome, (name: string) => string> = {
  'got-it': (n) => `Nice! “${n}” is marked as mastered. It will come back for a quick review tomorrow.`,
  started: (n) => `Saved your progress on “${n}”. Keep going!`,
  remembered: (n) => `Great — “${n}” will come back after a longer break.`,
  forgot: (n) => `No problem — “${n}” will come back tomorrow so it sticks.`,
};

function formatDays(days: number): string {
  if (days < 1) return 'today';
  const d = Math.round(days);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function Placeholder({ loading }: { loading: boolean }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      {loading ? 'Loading…' : '—'}
    </p>
  );
}

function ActionButton({
  children,
  onClick,
  busy,
  disabled,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  tone: 'good' | 'neutral';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60',
        tone === 'good'
          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
          : 'border border-border bg-background text-foreground hover:bg-primary/10',
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : tone === 'good' ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}
