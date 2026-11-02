import { Link, createFileRoute } from '@tanstack/react-router';
import { pageHead } from '@/lib/page-titles';
import { useState, useCallback, useEffect, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, BellOff, BookOpen, Clock, Brain, Target, RefreshCw, TrendingDown, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { cn } from '@/lib/utils';
import { GAP_KINDS, conceptLabel, countLabel, priorityLabel, reviewSummary, snoozeLabel, stepTypeLabel } from '@/lib/gaps';
import { snoozedReviews } from '@/lib/graph/spacing';
import { applyUnsnooze, focusAfterAnswer } from '@/lib/study';
import { useLearners, useDB } from '@/lib/DBContext';
import { useActiveLearner } from '@/lib/active-learner';

export const Route = createFileRoute('/gaps')({
  head: () => pageHead('/gaps'),
  component: GapsDashboard,
});

interface GapItem {
  conceptId: string;
  conceptName?: string;
  type: 'missing' | 'partial' | 'forgotten' | 'misconception';
  severity: 'high' | 'medium' | 'low';
  mastery?: number;
  predictedRetention?: number;
  daysSinceReview?: number;
  blockedConcepts?: string[];
  incorrectUnderstanding?: string;
}

interface ReviewQueueItem {
  conceptId: string;
  conceptName?: string;
  priority: 'urgent' | 'normal' | 'low';
  predictedRetention: number;
  daysSinceReview: number;
  nextReviewDate: string;
  intervalDays: number;
}

/** A review the learner postponed ("Remind me tomorrow"): not due, but not forgotten either. */
interface SnoozedItem {
  conceptId: string;
  conceptName?: string;
  until: number;
  /** Kept to end the snooze early ("Review it now") without touching anything else. */
  lastReviewed?: string;
  firstSeen?: string;
}

interface RemediationStep {
  order: number;
  conceptId: string;
  conceptName?: string;
  gapType: string;
  action: string;
  estimatedTime: number;
  priority: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

function GapsDashboard() {
  const { db, isLoading: dbLoading, error: dbError, isReady } = useDB();
  const { learners, loading: learnersLoading } = useLearners();
  // Same learner as on the dashboard (and the other learner pages).
  const [activeLearner, setSelectedLearnerId] = useActiveLearner(
    learners.map((l) => l.userId),
    learnersLoading,
  );
  const selectedLearnerId = activeLearner ?? '';
  const learnerSelectId = useId();
  const selectedLearnerRef = useRef(selectedLearnerId);
  selectedLearnerRef.current = selectedLearnerId;
  const [loading, setLoading] = useState(false);
  const [gaps, setGaps] = useState<{
    missing: GapItem[];
    partial: GapItem[];
    forgotten: GapItem[];
    misconceptions: GapItem[];
    summary: { total: number; critical: number; byType: Record<string, number> };
  } | null>(null);
  const [reviewQueue, setReviewQueue] = useState<{
    queue: ReviewQueueItem[];
    stats: { totalItems: number; urgent: number; normal: number; low: number; overdue: number };
  } | null>(null);
  const [snoozed, setSnoozed] = useState<SnoozedItem[]>([]);
  const [remediation, setRemediation] = useState<{
    plan: { steps: RemediationStep[]; estimatedTotalTime: number; priorityFocus: string };
    gaps: { total: number };
  } | null>(null);

  // Only the latest request may update the page (switching learners while a
  // load is in flight must not show the previous learner's gaps).
  const requestSeq = useRef(0);
  // "Review it now" on a snoozed review: which one is saving, the message
  // afterwards, and where keyboard focus goes once the list has reloaded.
  const [unsnoozing, setUnsnoozing] = useState<string | null>(null);
  const [snoozeNotice, setSnoozeNotice] = useState<string | null>(null);
  const pendingSnoozeFocus = useRef<{ learnerId: string; conceptId: string; before: string[] } | null>(null);
  const snoozedListRef = useRef<HTMLUListElement>(null);
  const reviewsHeadingRef = useRef<HTMLHeadingElement>(null);
  const reviewsCardRef = useRef<HTMLDivElement>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // `quiet` reloads in place (no spinner), so the page — and keyboard focus —
  // stays put after a small change such as ending a snooze.
  const fetchGapData = useCallback(async (userId: string, { quiet = false }: { quiet?: boolean } = {}) => {
    if (!db || !isReady) return;
    const seq = ++requestSeq.current;
    const stale = () => seq !== requestSeq.current;

    if (!quiet) {
      setLoading(true);
      setSnoozed([]);
      setLoadedFor(null);
    }
    try {
      // Detect gaps using the database
      const [detectedGaps, states, concepts] = await Promise.all([
        db.detectGaps(userId),
        // Only for the "Snoozed" list: if it can't load, the analysis still shows.
        db.getLearnerKnowledgeStates(userId).catch(() => []),
        db.listConcepts().catch(() => []),
      ]);
      if (stale()) return;
      // Reviews postponed with "Remind me tomorrow" aren't due (so they're not
      // in "Fading" or the review list) — show them separately instead of
      // letting them silently disappear.
      const byId = new Map(concepts.map((c) => [c.conceptId, c]));
      setSnoozed(
        snoozedReviews(states, (id) => byId.get(id)?.difficulty?.absolute, new Date())
          .filter((s) => byId.has(s.conceptId))
          .map((s) => {
            const st = states.find((x) => x.conceptId === s.conceptId);
            return { ...s, conceptName: byId.get(s.conceptId)?.name, lastReviewed: st?.lastReviewed, firstSeen: st?.firstSeen };
          }),
      );
      // Map the database format to our local GapItem format
      const missing: GapItem[] = detectedGaps.missing.map(g => ({
        conceptId: g.conceptId,
        conceptName: g.concept?.name,
        type: 'missing' as const,
        // Not started yet but ready — an opportunity, not an alarm.
        severity: 'low' as const,
      }));
      const partial: GapItem[] = detectedGaps.partial.map(g => ({
        conceptId: g.conceptId,
        conceptName: g.concept?.name,
        type: 'partial' as const,
        severity: g.mastery < 50 ? 'high' as const : 'medium' as const,
        mastery: g.mastery,
      }));
      const forgotten: GapItem[] = detectedGaps.forgotten.map(g => ({
        conceptId: g.conceptId,
        conceptName: g.concept?.name,
        type: 'forgotten' as const,
        severity: g.predictedRetention < 50 ? 'high' as const : 'medium' as const,
        predictedRetention: g.predictedRetention,
        daysSinceReview: g.daysSinceReview,
      }));
      const misconceptions: GapItem[] = detectedGaps.misconceptions.map(g => ({
        conceptId: g.conceptId,
        conceptName: g.concept?.name,
        type: 'misconception' as const,
        severity: 'high' as const,
        incorrectUnderstanding: g.misconceptions?.[0]?.description,
      }));
      setGaps({
        missing,
        partial,
        forgotten,
        misconceptions,
        summary: detectedGaps.summary,
      });

      // Get review queue - already returns {queue, stats}
      const reviewResult = await db.getReviewQueue(userId);
      if (stale()) return;
      setReviewQueue({
        queue: reviewResult.queue.map(item => ({
          conceptId: item.conceptId,
          conceptName: item.concept?.name,
          priority: item.priority,
          predictedRetention: item.predictedRetention,
          daysSinceReview: item.daysSinceReview,
          nextReviewDate: item.nextReviewDate,
          intervalDays: 1, // Default interval, not returned by getReviewQueue
        })),
        stats: reviewResult.stats,
      });

      // Generate remediation plan
      const remediationResult = await db.generateRemediationPlan(userId);
      if (stale()) return;
      setRemediation({
        plan: {
          steps: remediationResult.plan.steps.map(step => ({
            order: step.order,
            conceptId: step.conceptId,
            conceptName: step.concept?.name,
            gapType: step.type, // Map 'type' to 'gapType'
            action: step.action,
            estimatedTime: step.estimatedTime,
            priority: step.type === 'correct_misconception' ? 'critical' : step.type === 'relearn' ? 'high' : 'medium', // Derive priority from type
          })),
          estimatedTotalTime: remediationResult.plan.estimatedTotalTime,
          priorityFocus: remediationResult.plan.priorityFocus,
        },
        gaps: { total: remediationResult.gaps.summary.total },
      });
    } catch (error) {
      if (stale()) return;
      console.error('Error fetching gap data:', error);
    }
    if (!stale()) {
      setLoadedFor(userId);
      setLoading(false);
    }
  }, [db, isReady]);

  // Load the analysis for the active learner (on arrival and when switching).
  useEffect(() => {
    if (selectedLearnerId) fetchGapData(selectedLearnerId);
  }, [selectedLearnerId, fetchGapData]);

  // A message (or pending focus move) about one learner must not carry over to another.
  useEffect(() => {
    setSnoozeNotice(null);
    pendingSnoozeFocus.current = null;
  }, [selectedLearnerId]);

  /** "Review it now": end the snooze so the review is due again right away. */
  const reviewNow = async (item: SnoozedItem) => {
    const learnerId = selectedLearnerId;
    if (!db || !learnerId || unsnoozing) return;
    pendingSnoozeFocus.current = { learnerId, conceptId: item.conceptId, before: snoozed.map((s) => s.conceptId) };
    setUnsnoozing(item.conceptId);
    setSnoozeNotice(null);
    const name = conceptLabel(item.conceptId, item.conceptName);
    try {
      await db.setKnowledgeState(learnerId, item.conceptId, applyUnsnooze(item));
      if (selectedLearnerRef.current !== learnerId) return;
      setSnoozeNotice(`“${name}” is due again — you can review it now on the dashboard.`);
      await fetchGapData(learnerId, { quiet: true });
    } catch (err) {
      // (Focus goes back to the same button, which is still listed.)
      if (selectedLearnerRef.current === learnerId) {
        setSnoozeNotice(`Could not save: ${err instanceof Error ? err.message : 'please try again.'}`);
      }
    } finally {
      setUnsnoozing(null);
    }
  };

  // After "Review it now" the item leaves the Snoozed list (its button was
  // disabled while saving): keep keyboard focus nearby — on the next snoozed
  // item's button, or on the Reviews heading when none are left.
  useEffect(() => {
    const pending = pendingSnoozeFocus.current;
    if (!pending || unsnoozing || loadedFor !== pending.learnerId) return;
    pendingSnoozeFocus.current = null;
    const target = focusAfterAnswer(pending.before, pending.conceptId, snoozed.map((s) => s.conceptId));
    requestAnimationFrame(() => {
      // Don't steal focus if the learner already moved on.
      const active = document.activeElement;
      const card = reviewsCardRef.current;
      if (!card || (active && active !== document.body && !card.contains(active))) return;
      const button =
        target.kind === 'item'
          ? Array.from(snoozedListRef.current?.children ?? [])
              .find((li) => li instanceof HTMLElement && li.dataset.conceptId === target.conceptId)
              ?.querySelector<HTMLButtonElement>('button:not([disabled])')
          : null;
      if (button) button.focus();
      else reviewsHeadingRef.current?.focus();
    });
  }, [snoozed, unsnoozing, loadedFor]);

  // Reference time for "Due today / Overdue by 3 days" (the analysis is only
  // rendered client-side after loading, so this never differs from SSR).
  const now = new Date();

  const handleLearnerChange = (userId: string) => {
    if (userId) setSelectedLearnerId(userId);
  };

  const getGapIcon = (type: string) => {
    switch (type) {
      case 'missing': return <BookOpen className="text-sky-500 shrink-0" size={20} aria-hidden="true" />;
      case 'partial': return <Target className="text-amber-500 shrink-0" size={20} aria-hidden="true" />;
      case 'forgotten': return <TrendingDown className="text-orange-500 shrink-0" size={20} aria-hidden="true" />;
      case 'misconception': return <AlertTriangle className="text-purple-500 shrink-0" size={20} aria-hidden="true" />;
      default: return <Brain size={20} aria-hidden="true" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'medium': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'low': return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'normal': return 'bg-amber-500';
      case 'low': return 'bg-emerald-500';
      default: return 'bg-muted-foreground';
    }
  };

  if (dbLoading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Initializing database...</p>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="text-center text-destructive">
          <AlertCircle className="w-8 h-8 mx-auto mb-3" />
          <p>Database error: {dbError.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 min-w-0 w-full px-4 py-6 sm:px-8 sm:py-10 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/25" aria-hidden="true">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Gap Analysis</h1>
          </div>
          <p className="text-muted-foreground sm:ml-14">
            What’s slipping, what’s due for review, and a short plan to catch up.
          </p>
        </motion.div>

        {/* Learner Selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="glass-card p-5 mb-6"
        >
          <label htmlFor={learnerSelectId} className="block text-sm font-medium text-foreground mb-2">Learner</label>
          <div className="flex gap-4">
            <select
              id={learnerSelectId}
              value={selectedLearnerId}
              onChange={(e) => handleLearnerChange(e.target.value)}
              className="form-input flex-1"
            >
              {learners.map((learner) => (
                <option key={learner.userId} value={learner.userId}>
                  {learner.name || learner.userId}
                </option>
              ))}
            </select>
            {selectedLearnerId && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => fetchGapData(selectedLearnerId)}
                disabled={loading}
                className="btn btn-primary flex items-center gap-2"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh
              </motion.button>
            )}
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card text-center py-16"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <RefreshCw size={48} className="mx-auto text-primary" />
              </motion.div>
              <p className="mt-4 text-muted-foreground" role="status">Checking what needs attention…</p>
            </motion.div>
          )}

          {!loading && selectedLearnerId && gaps && (
            <motion.div
              key="content"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {GAP_KINDS.map((kind) => ({
                  ...kind,
                  value: gaps[kind.key].length,
                  icon: { missing: BookOpen, partial: Target, forgotten: TrendingDown, misconceptions: AlertTriangle }[kind.key],
                  color: { missing: 'sky', partial: 'amber', forgotten: 'orange', misconceptions: 'purple' }[kind.key],
                })).map((card) => (
                  <motion.div
                    key={card.label}
                    variants={itemVariants}
                    whileHover={{ y: -4 }}
                    className={cn(
                      'glass-card p-5 border-l-4',
                      card.color === 'sky' && 'border-l-sky-500',
                      card.color === 'amber' && 'border-l-amber-500',
                      card.color === 'orange' && 'border-l-orange-500',
                      card.color === 'purple' && 'border-l-purple-500'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{card.label}</p>
                        <p className={cn(
                          'text-3xl font-bold',
                          card.color === 'sky' && 'text-sky-500',
                          card.color === 'amber' && 'text-amber-500',
                          card.color === 'orange' && 'text-orange-500',
                          card.color === 'purple' && 'text-purple-500'
                        )}>
                          {card.value}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{card.hint}</p>
                      </div>
                      <card.icon aria-hidden="true" className={cn(
                        'w-8 h-8',
                        card.color === 'sky' && 'text-sky-500',
                        card.color === 'amber' && 'text-amber-500',
                        card.color === 'orange' && 'text-orange-500',
                        card.color === 'purple' && 'text-purple-500'
                      )} />
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gap Details */}
                <motion.div variants={itemVariants} className="glass-card p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
                    <Brain className="text-primary" aria-hidden="true" />
                    Shaky spots
                  </h2>

                  {gaps.summary.total === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle size={48} className="mx-auto text-emerald-500 mb-2" />
                      <p className="text-foreground font-medium">No shaky spots right now — nice work!</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide">
                      {/* Missing */}
                      {gaps.missing.map((gap, i) => (
                        <motion.div
                          key={`missing-${i}`}
                          whileHover={{ scale: 1.01 }}
                          className={cn('p-4 rounded-xl border', getSeverityColor(gap.severity))}
                        >
                          <div className="flex items-start gap-3">
                            {getGapIcon('missing')}
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{conceptLabel(gap.conceptId, gap.conceptName)}</p>
                              <p className="text-sm opacity-75">Ready to learn — not started yet</p>
                              {gap.blockedConcepts && gap.blockedConcepts.length > 0 && (
                                <p className="text-xs mt-1 opacity-60">Unlocks: {gap.blockedConcepts.map((id) => conceptLabel(id)).join(', ')}</p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      {/* Partial */}
                      {gaps.partial.map((gap, i) => (
                        <motion.div
                          key={`partial-${i}`}
                          whileHover={{ scale: 1.01 }}
                          className={cn('p-4 rounded-xl border', getSeverityColor(gap.severity))}
                        >
                          <div className="flex items-start gap-3">
                            {getGapIcon('partial')}
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{conceptLabel(gap.conceptId, gap.conceptName)}</p>
                              <p className="text-sm opacity-75">{gap.mastery}% mastered</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      {/* Forgotten */}
                      {gaps.forgotten.map((gap, i) => (
                        <motion.div
                          key={`forgotten-${i}`}
                          whileHover={{ scale: 1.01 }}
                          className={cn('p-4 rounded-xl border', getSeverityColor(gap.severity))}
                        >
                          <div className="flex items-start gap-3">
                            {getGapIcon('forgotten')}
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{conceptLabel(gap.conceptId, gap.conceptName)}</p>
                              <p className="text-sm opacity-75">
                                Due for a review · about {gap.predictedRetention?.toFixed(0)}% remembered · last reviewed {countLabel(Math.round(gap.daysSinceReview ?? 0), 'day')} ago
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      {/* Misconceptions */}
                      {gaps.misconceptions.map((gap, i) => (
                        <motion.div
                          key={`misconception-${i}`}
                          whileHover={{ scale: 1.01 }}
                          className={cn('p-4 rounded-xl border', getSeverityColor(gap.severity))}
                        >
                          <div className="flex items-start gap-3">
                            {getGapIcon('misconception')}
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{conceptLabel(gap.conceptId, gap.conceptName)}</p>
                              <p className="text-sm opacity-75">{gap.incorrectUnderstanding || 'Something here was understood the wrong way'}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>

                {/* Review Queue */}
                <motion.div ref={reviewsCardRef} variants={itemVariants} className="glass-card p-6">
                  <h2
                    ref={reviewsHeadingRef}
                    tabIndex={-1}
                    className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Clock className="text-primary" aria-hidden="true" />
                    Reviews
                    {reviewQueue && (
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        ({countLabel(reviewQueue.stats.totalItems, 'concept')})
                      </span>
                    )}
                  </h2>

                  <p
                    role="status"
                    aria-live="polite"
                    data-testid="snooze-notice"
                    className={cn('text-sm text-emerald-700 dark:text-emerald-400', snoozeNotice && 'mb-4')}
                  >
                    {snoozeNotice}
                  </p>

                  {reviewQueue && reviewQueue.stats.overdue > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                    >
                      <p className="text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
                        <AlertTriangle size={16} aria-hidden="true" />
                        {countLabel(reviewQueue.stats.overdue, 'review')} overdue
                      </p>
                      <Link to="/" className="mt-2 inline-flex text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                        Do your reviews on the dashboard
                      </Link>
                    </motion.div>
                  )}

                  {!reviewQueue || reviewQueue.queue.length === 0 ? (
                    <div className={cn('text-center', snoozed.length > 0 ? 'py-6' : 'py-12')}>
                      <CheckCircle size={48} className="mx-auto text-emerald-500 mb-2" aria-hidden="true" />
                      <p className="text-foreground font-medium">
                        {snoozed.length > 0 ? 'Nothing due right now' : 'Nothing to review yet'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide">
                      {reviewQueue.queue.map((item, i) => (
                        <motion.div
                          key={i}
                          whileHover={{ scale: 1.01 }}
                          className="p-4 bg-secondary/50 rounded-xl border border-border/50 flex items-center gap-3"
                        >
                          <div aria-hidden="true" className={cn('w-3 h-3 rounded-full shrink-0', getPriorityColor(item.priority))} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground">{conceptLabel(item.conceptId, item.conceptName)}</p>
                            <p className="text-sm text-muted-foreground">
                              {reviewSummary(item.nextReviewDate, item.predictedRetention, now)}
                            </p>
                          </div>
                          <span className={cn(
                            'px-2.5 py-1 text-xs rounded-full font-medium whitespace-nowrap',
                            item.priority === 'urgent' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                            item.priority === 'normal' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                            item.priority === 'low' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          )}>
                            {priorityLabel(item.priority)}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {snoozed.length > 0 && (
                    <div className="mt-5 border-t border-border/50 pt-4" data-testid="snoozed-reviews">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <BellOff size={16} className="text-muted-foreground" aria-hidden="true" />
                        Snoozed
                        <span className="text-xs font-normal text-muted-foreground">({countLabel(snoozed.length, 'review')})</span>
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        You chose “Remind me tomorrow” for these. They’re not counted as due, and your progress on them is kept. Changed your mind? Choose “Review it now”.
                      </p>
                      <ul ref={snoozedListRef} className="mt-3 space-y-2" aria-label="Snoozed reviews">
                        {snoozed.map((item) => (
                          <li
                            key={item.conceptId}
                            data-concept-id={item.conceptId}
                            className="p-3 rounded-xl border border-dashed border-border bg-background/40 flex flex-wrap items-center justify-between gap-2"
                          >
                            <span className="font-medium text-foreground">{conceptLabel(item.conceptId, item.conceptName)}</span>
                            <span className="text-sm text-muted-foreground">
                              <time dateTime={new Date(item.until).toISOString()}>{snoozeLabel(item.until, now)}</time>
                            </span>
                            <button
                              type="button"
                              onClick={() => reviewNow(item)}
                              disabled={!!unsnoozing}
                              aria-label={`Review it now: ${conceptLabel(item.conceptId, item.conceptName)}`}
                              className="basis-full sm:basis-auto inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                            >
                              {unsnoozing === item.conceptId && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                              Review it now
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Remediation Plan */}
              {remediation && remediation.plan.steps.length > 0 && (
                <motion.div
                  variants={itemVariants}
                  className="mt-6 glass-card p-6"
                >
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
                    <Target className="text-primary" aria-hidden="true" />
                    Your catch-up plan
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      (about {remediation.plan.estimatedTotalTime} min)
                    </span>
                  </h2>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-4 bg-primary/5 border border-primary/10 rounded-xl"
                  >
                    <p className="text-foreground">
                      <strong>Focus:</strong> {remediation.plan.priorityFocus}
                    </p>
                  </motion.div>

                  <div className="space-y-4">
                    {remediation.plan.steps.map((step, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-start gap-4 p-4 bg-secondary/50 rounded-xl border border-border/50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-primary/25">
                          {step.order}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{conceptLabel(step.conceptId, step.conceptName)}</p>
                          <p className="text-sm text-muted-foreground">{step.action}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                            <span>{stepTypeLabel(step.gapType)}</span>
                            <span>About {step.estimatedTime} min</span>
                            <span className={cn(
                              'px-2 py-0.5 rounded',
                              step.priority === 'critical' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                              step.priority === 'high' && 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
                              step.priority === 'medium' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                              !['critical', 'high', 'medium'].includes(step.priority) && 'bg-muted text-muted-foreground'
                            )}>
                              {step.priority === 'critical' ? 'Do first' : step.priority === 'high' ? 'Important' : 'When you can'}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {!learnersLoading && learners.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card text-center py-16"
            >
              <Brain size={64} className="mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-medium text-foreground">No learner yet</h3>
              <p className="text-muted-foreground mt-2">
                Create your learning plan on the dashboard, then come back to see what needs attention.
              </p>
              <Link to="/" className="btn btn-primary mt-4 inline-flex">
                Go to the dashboard
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Forgetting Curve Visualization */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 glass-card p-6"
        >
          <h2 className="text-xl font-semibold mb-4 text-foreground">Why reviews help</h2>
          <div className="flex justify-center">
            <svg viewBox="0 0 500 280" className="w-full max-w-2xl" role="img" aria-label="Without reviews, memory fades over a few weeks; with a review at the right time, it stays high.">
              {/* Background grid */}
              <defs>
                <pattern id="grid" width="50" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 25" fill="none" className="stroke-border" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect x="50" y="20" width="400" height="200" fill="url(#grid)" />

              {/* Axes */}
              <line x1="50" y1="220" x2="450" y2="220" className="stroke-foreground" strokeWidth="2" />
              <line x1="50" y1="20" x2="50" y2="220" className="stroke-foreground" strokeWidth="2" />

              {/* Y-axis labels */}
              <text x="45" y="25" textAnchor="end" fontSize="12" className="fill-muted-foreground">100%</text>
              <text x="45" y="120" textAnchor="end" fontSize="12" className="fill-muted-foreground">50%</text>
              <text x="45" y="220" textAnchor="end" fontSize="12" className="fill-muted-foreground">0%</text>
              <text x="20" y="120" textAnchor="middle" fontSize="12" className="fill-muted-foreground" transform="rotate(-90, 20, 120)">Retention</text>

              {/* X-axis labels */}
              <text x="50" y="240" textAnchor="middle" fontSize="12" className="fill-muted-foreground">0</text>
              <text x="150" y="240" textAnchor="middle" fontSize="12" className="fill-muted-foreground">7 days</text>
              <text x="250" y="240" textAnchor="middle" fontSize="12" className="fill-muted-foreground">14 days</text>
              <text x="350" y="240" textAnchor="middle" fontSize="12" className="fill-muted-foreground">21 days</text>
              <text x="450" y="240" textAnchor="middle" fontSize="12" className="fill-muted-foreground">28 days</text>
              <text x="250" y="260" textAnchor="middle" fontSize="12" className="fill-muted-foreground">Time</text>

              {/* Without spaced repetition curve */}
              <path
                d="M 50 20 Q 100 80 150 140 T 250 180 T 350 195 T 450 200"
                fill="none"
                stroke="#ef4444"
                strokeWidth="3"
                strokeDasharray="8,4"
              />

              {/* With spaced repetition curves */}
              <path
                d="M 50 20 Q 80 60 100 100 L 100 40 Q 130 80 160 110 L 160 50 Q 200 90 250 120 L 250 60 Q 320 100 400 130 L 400 70"
                fill="none"
                stroke="#22c55e"
                strokeWidth="3"
              />

              {/* Review points */}
              <circle cx="100" cy="40" r="5" fill="#22c55e" />
              <circle cx="160" cy="50" r="5" fill="#22c55e" />
              <circle cx="250" cy="60" r="5" fill="#22c55e" />
              <circle cx="400" cy="70" r="5" fill="#22c55e" />

              {/* Legend */}
              <line x1="280" y1="15" x2="310" y2="15" stroke="#ef4444" strokeWidth="3" strokeDasharray="8,4" />
              <text x="315" y="19" fontSize="11" className="fill-muted-foreground">Without review</text>
              <line x1="280" y1="35" x2="310" y2="35" stroke="#22c55e" strokeWidth="3" />
              <text x="315" y="39" fontSize="11" className="fill-muted-foreground">With spaced repetition</text>
              <circle cx="295" cy="55" r="4" fill="#22c55e" />
              <text x="315" y="59" fontSize="11" className="fill-muted-foreground">Review session</text>
            </svg>
          </div>
          <p className="text-center text-muted-foreground mt-4 text-sm">
            A quick review just before you’d forget keeps a topic fresh for much longer.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
