/**
 * Dashboard "Today" panel — the core study loop for one learner:
 * progress at a glance, reviews due now (spaced repetition), and what to
 * learn next (ZPD). Self-reports are saved through `setKnowledgeState`
 * (server-validated, scoped to the signed-in account) and the panel reloads.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useRouteContext } from '@tanstack/react-router';
import { CheckCircle2, Clock, Loader2, Pencil, RefreshCw, RotateCcw, Sparkles, Target, UserPlus } from 'lucide-react';
import { FocusEditor } from '@/components/FocusEditor';
import { Onboarding } from '@/components/Onboarding';
import { useDB, useLearners } from '@/lib/DBContext';
import type { ConceptNode, KnowledgeState, ZPDRecommendation } from '@/lib/graph/types';
import {
  applyReviewOutcome,
  applySnooze,
  applyStudyOutcome,
  applyUnsnooze,
  focusAfterAnswer,
  summarizeProgress,
  type ProgressSummary,
  type ReviewOutcome,
  type SnoozeOutcome,
  type StudyOutcome,
} from '@/lib/study';
import { useActiveLearner } from '@/lib/active-learner';
import { domainLabel, focusDomains, inFocus, needsOnboarding } from '@/lib/onboarding';
import { priorityLabel, reviewSummary, snoozedSummary } from '@/lib/gaps';
import { snoozedReviews, snoozedUntil, type SnoozedReview } from '@/lib/graph/spacing';
import { cn } from '@/lib/utils';

/** `busy` while ending snoozes from the Today summary (can't clash with a concept id). */
const UNSNOOZE_BUSY = '\u0000snoozed';

/** Set (per account) when the user chose to explore the example learners instead of onboarding. */
const ONBOARDING_SKIPPED_KEY = 'learngraph.onboardingSkipped';

interface ReviewItem {
  conceptId: string;
  concept: ConceptNode;
  predictedRetention: number;
  nextReviewDate: string;
  priority: 'urgent' | 'normal' | 'low';
}

type TodayList = 'reviews' | 'next';

/** An answer whose list is reloading: where keyboard focus should land afterwards. */
interface PendingFocus {
  learnerId: string;
  list: TodayList;
  conceptId: string;
  before: string[];
}

interface TodayData {
  learnerId: string;
  progress: ProgressSummary;
  states: KnowledgeState[];
  reviews: ReviewItem[];
  reviewsDue: number;
  /** Snoozed reviews and when each comes back (soonest first) — not counted as due. */
  snoozed: SnoozedReview[];
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

export function StudyToday() {
  const { db, isReady } = useDB();
  const { learners, loading: learnersLoading, refresh: refreshLearners } = useLearners();
  const { user } = useRouteContext({ from: '__root__' });
  // Per account: skipping on a shared browser must not hide onboarding from the next account.
  const skippedKey = `${ONBOARDING_SKIPPED_KEY}.${user?.id ?? 'anonymous'}`;
  // `null` until read from the browser (avoids an SSR/hydration mismatch).
  const [onboardingSkipped, setOnboardingSkipped] = useState<boolean | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  // Shared with the other learner pages (Recommendations, Gaps, Graph, Profile).
  const [learnerId, setLearnerId] = useActiveLearner(
    learners.map((l) => l.userId),
    learnersLoading,
  );
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingFocus, setEditingFocus] = useState(false);
  const selectId = useId();
  const changeSubjectsRef = useRef<HTMLButtonElement>(null);
  const activeLearnerIdRef = useRef<string | null>(null);
  activeLearnerIdRef.current = learnerId;
  // Only the latest request may update the panel (switching learners while a
  // load is in flight must not show — or save against — the previous learner).
  const requestSeq = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const listRefs = useRef<Record<TodayList, HTMLUListElement | null>>({ reviews: null, next: null });
  const headingRefs = useRef<Record<TodayList, HTMLHeadingElement | null>>({ reviews: null, next: null });
  const pendingFocus = useRef<PendingFocus | null>(null);

  useEffect(() => {
    setOnboardingSkipped(readStored(skippedKey) === '1');
  }, [skippedKey]);

  // Subjects the active learner chose during onboarding (empty = everything).
  const activeLearner = learners.find((l) => l.userId === learnerId);
  const focus = focusDomains(activeLearner);
  const focusKey = focus.join('\n');

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
        db.computeZPD(learnerId, { limit: focusKey ? 200 : 8 }),
      ]);
      if (seq !== requestSeq.current) return;
      // Progress and "learn next" follow the learner's chosen subjects;
      // reviews stay across everything they have learned.
      const focusList = focusKey ? focusKey.split('\n') : [];
      const concepts = inFocus(allConcepts, focusList, (c) => c.domain);
      // While the focus subjects exist, only recommend inside them (even if
      // nothing is ready there yet); a stale focus falls back to everything.
      const focusApplies = concepts !== allConcepts;
      const recommended = focusApplies
        ? zpd.recommendations.filter((r) => focusList.includes(r.concept.domain))
        : zpd.recommendations;
      const nowMs = Date.now();
      const postponed = new Set(
        states.filter((st) => (snoozedUntil(st) ?? 0) > nowMs).map((st) => st.conceptId),
      );
      const difficulty = new Map(allConcepts.map((c) => [c.conceptId, c.difficulty?.absolute]));
      const snoozed = snoozedReviews(
        states.filter((st) => difficulty.has(st.conceptId)),
        (id) => difficulty.get(id),
        new Date(nowMs),
      );
      setData({
        learnerId,
        snoozed,
        progress: summarizeProgress(concepts, states),
        states,
        reviews: queue.queue,
        reviewsDue: queue.stats.totalItems,
        // A concept already listed for review isn't offered again as "learn next",
        // nor one whose review the learner just postponed ("Remind me tomorrow").
        next: recommended
          .filter((r) => !queue.queue.some((q) => q.conceptId === r.concept.conceptId))
          .filter((r) => !postponed.has(r.concept.conceptId))
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
    load();
  }, [load]);

  // A message about one learner must not linger on another learner's plan.
  // (Not cleared on subject changes: that reload is announced by its own notice.)
  useEffect(() => {
    setNotice(null);
    pendingFocus.current = null;
  }, [learnerId]);

  const chooseLearner = (id: string) => {
    setWelcome(null);
    setEditingFocus(false);
    setLearnerId(id);
  };

  const closeFocusEditor = () => {
    setEditingFocus(false);
    // Give keyboard focus back to the button that opened the editor.
    requestAnimationFrame(() => changeSubjectsRef.current?.focus());
  };

  const focusSaved = async (savedFor: string, domains: string[]) => {
    // Reloading the learner list updates the focus tags, which reloads the plan.
    await refreshLearners();
    // Switched to another learner while saving: don't announce it on their plan.
    if (activeLearnerIdRef.current !== savedFor) return;
    setWelcome(null);
    setNotice(
      domains.length > 0
        ? `Saved. Your plan now focuses on ${domains.map(domainLabel).join(', ')}.`
        : 'Saved. Your plan now covers all subjects.',
    );
    closeFocusEditor();
  };

  const onboarded = async (id: string, name: string) => {
    // Reload the list first, so the welcome step doesn't flash back while the
    // new learner is not in it yet.
    await refreshLearners();
    setLearnerId(id);
    setOnboardingOpen(false);
    setWelcome(`Welcome, ${name}! Here is your plan — start with the first concept under “Learn next”.`);
  };

  const skipOnboarding = () => {
    store(skippedKey, '1');
    setOnboardingSkipped(true);
    setOnboardingOpen(false);
  };

  // After an answer reloads the lists, put keyboard focus back where the
  // learner was (the answered item usually disappears, and its buttons were
  // disabled while saving, so focus would otherwise fall to <body>).
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || busy || !data || data.learnerId !== pending.learnerId) return;
    pendingFocus.current = null;
    const after = pending.list === 'reviews' ? data.reviews.map((r) => r.conceptId) : data.next.map((r) => r.concept.conceptId);
    const target = focusAfterAnswer(pending.before, pending.conceptId, after);
    requestAnimationFrame(() => {
      // Don't steal focus if the learner already moved on (clicked or tabbed elsewhere).
      const active = document.activeElement;
      const section = sectionRef.current;
      if (!section || (active && active !== document.body && !section.contains(active))) return;
      if (target.kind === 'heading') {
        headingRefs.current[pending.list]?.focus();
        return;
      }
      const item = Array.from(listRefs.current[pending.list]?.children ?? []).find(
        (li) => li instanceof HTMLElement && li.dataset.conceptId === target.conceptId,
      );
      const button = item?.querySelector<HTMLButtonElement>('button:not([disabled])');
      if (button) button.focus();
      else headingRefs.current[pending.list]?.focus();
    });
  }, [data, busy]);

  const save = async (concept: ConceptNode, outcome: StudyOutcome | ReviewOutcome | SnoozeOutcome) => {
    if (!db || !learnerId || busy || data?.learnerId !== learnerId) return;
    const list: TodayList = outcome === 'got-it' || outcome === 'started' ? 'next' : 'reviews';
    pendingFocus.current = {
      learnerId,
      list,
      conceptId: concept.conceptId,
      before: list === 'reviews' ? data.reviews.map((r) => r.conceptId) : data.next.map((r) => r.concept.conceptId),
    };
    setBusy(concept.conceptId);
    setNotice(null);
    setWelcome(null);
    try {
      const prior = data.states.find((s) => s.conceptId === concept.conceptId);
      const patch =
        outcome === 'snooze'
          ? applySnooze()
          : outcome === 'remembered' || outcome === 'forgot'
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

  /** "Review now anyway": end every snooze, so those reviews are due again right away. */
  const unsnoozeAll = async () => {
    if (!db || !learnerId || busy || data?.learnerId !== learnerId || data.snoozed.length === 0) return;
    const ids = data.snoozed.map((s) => s.conceptId);
    pendingFocus.current = {
      learnerId,
      list: 'reviews',
      conceptId: ids[0],
      before: data.reviews.map((r) => r.conceptId),
    };
    setBusy(UNSNOOZE_BUSY);
    setNotice(null);
    setWelcome(null);
    try {
      for (const id of ids) {
        const prior = data.states.find((s) => s.conceptId === id);
        await db.setKnowledgeState(learnerId, id, applyUnsnooze(prior));
      }
      setNotice(
        ids.length === 1
          ? 'Okay — that review is back in your list. Your progress on it is unchanged.'
          : `Okay — those ${ids.length} reviews are back in your list. Your progress on them is unchanged.`,
      );
      await load();
    } catch (err) {
      setNotice(`Could not save: ${err instanceof Error ? err.message : 'please try again.'}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  // Only the first load shows the placeholder; a later refresh (after saving
  // subjects or creating a learner) keeps the panel on screen instead of flashing.
  if (!isReady || (learnersLoading && learners.length === 0) || onboardingSkipped === null) {
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
    <section ref={sectionRef} aria-labelledby="today-heading" className="glass-card mb-10 p-4 sm:p-6" data-testid="study-today">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="today-heading" className="text-lg font-semibold text-foreground">
            Today
          </h2>
          <p className="text-sm text-muted-foreground">
            Review what is fading, then learn something new.
          </p>
          {activeLearner && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span data-testid="focus-subjects">
                {focus.length > 0 ? `Focus: ${focus.map(domainLabel).join(', ')}` : 'All subjects'}
              </span>
              <button
                ref={changeSubjectsRef}
                type="button"
                onClick={() => (editingFocus ? closeFocusEditor() : setEditingFocus(true))}
                aria-expanded={editingFocus}
                className="inline-flex min-h-6 items-center gap-1 font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                {focus.length > 0 ? 'Change subjects' : 'Choose subjects'}
              </button>
            </p>
          )}
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

      {editingFocus && activeLearner && (
        <FocusEditor
          key={activeLearner.userId}
          learnerId={activeLearner.userId}
          learnerName={activeLearner.name || activeLearner.userId}
          focus={focus}
          onSaved={focusSaved}
          onCancel={closeFocusEditor}
        />
      )}

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
          <h3
            ref={(el) => {
              headingRefs.current.reviews = el;
            }}
            tabIndex={-1}
            className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
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
            <ul
              ref={(el) => {
                listRefs.current.reviews = el;
              }}
              className="space-y-2"
              aria-label="Reviews due"
            >
              {current.reviews.map((item) => (
                <li key={item.conceptId} data-concept-id={item.conceptId} className="rounded-xl border border-border/50 bg-background/40 p-3">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    {item.concept.name}
                    {item.priority === 'urgent' && (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                        {priorityLabel(item.priority)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reviewSummary(item.nextReviewDate, item.predictedRetention, new Date())}
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
                    <ActionButton
                      busy={false}
                      disabled={!!busy}
                      onClick={() => save(item.concept, 'snooze')}
                      tone="quiet"
                    >
                      Remind me tomorrow
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {current && current.snoozed.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="snoozed-summary">
              {snoozedSummary(
                current.snoozed.map((s) => s.until),
                new Date(),
              )}{' '}
              ·{' '}
              <button
                type="button"
                onClick={unsnoozeAll}
                disabled={!!busy}
                className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                {busy === UNSNOOZE_BUSY && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                {current.snoozed.length === 1 ? 'Review it now' : 'Review them now'}
              </button>{' '}
              ·{' '}
              <Link to="/gaps" className="font-medium text-primary underline underline-offset-2">
                See snoozed reviews
              </Link>
            </p>
          )}
        </div>

        {/* Learn next */}
        <div>
          <h3
            ref={(el) => {
              headingRefs.current.next = el;
            }}
            tabIndex={-1}
            className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
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
            <ul
              ref={(el) => {
                listRefs.current.next = el;
              }}
              className="space-y-2"
              aria-label="Recommended next concepts"
            >
              {current.next.map((rec) => (
                <li key={rec.concept.conceptId} data-concept-id={rec.concept.conceptId} className="rounded-xl border border-border/50 bg-background/40 p-3">
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

const NOTICES: Record<StudyOutcome | ReviewOutcome | SnoozeOutcome, (name: string) => string> = {
  'got-it': (n) => `Nice! “${n}” is marked as mastered. It will come back for a quick review tomorrow.`,
  started: (n) => `Saved your progress on “${n}”. Keep going!`,
  remembered: (n) => `Great — “${n}” will come back after a longer break.`,
  forgot: (n) => `No problem — “${n}” will come back tomorrow so it sticks.`,
  snooze: (n) => `Okay — “${n}” is moved to tomorrow. Your progress on it is unchanged.`,
};

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
  tone: 'good' | 'neutral' | 'quiet';
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
          : tone === 'neutral'
            ? 'border border-border bg-background text-foreground hover:bg-primary/10'
            : 'text-muted-foreground underline-offset-2 hover:bg-primary/10 hover:text-foreground hover:underline',
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
