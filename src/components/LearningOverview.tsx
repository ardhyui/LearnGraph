/**
 * "My learning" card at the top of My Profile: the subjects the plan follows
 * (with the same "Change subjects" editor as the Today panel), progress in
 * those subjects, and one clear next step back to the dashboard.
 *
 * All reads go through the account-scoped graph server functions; subjects are
 * saved by `FocusEditor` (only `focus:*` tags change).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Loader2, Pencil } from 'lucide-react';
import { FocusEditor } from '@/components/FocusEditor';
import { useDB } from '@/lib/DBContext';
import type { LearnerProfile } from '@/lib/graph/types';
import { domainLabel, focusDomains, inFocus } from '@/lib/onboarding';
import { masteredLine, profileNextStep } from '@/lib/profile';
import { summarizeProgress, type ProgressSummary } from '@/lib/study';

interface LearningOverviewProps {
  learner: Pick<LearnerProfile, 'userId' | 'name' | 'tags'>;
  /** Reload the learner list after subjects change (updates the focus tags). */
  onSubjectsSaved: () => Promise<void> | void;
}

interface Overview {
  learnerId: string;
  progress: ProgressSummary;
  reviewsDue: number;
}

export function LearningOverview({ learner, onSubjectsSaved }: LearningOverviewProps) {
  const { db, isReady } = useDB();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const requestSeq = useRef(0);
  const currentIdRef = useRef(learner.userId);
  currentIdRef.current = learner.userId;

  const learnerId = learner.userId;
  const focus = focusDomains(learner);
  const focusKey = focus.join('\n');
  const name = learner.name || learner.userId;

  const load = useCallback(async () => {
    if (!db || !isReady) return;
    const seq = ++requestSeq.current;
    setError(null);
    try {
      const [concepts, states, queue] = await Promise.all([
        db.listConcepts(),
        db.getLearnerKnowledgeStates(learnerId),
        db.getReviewQueue(learnerId, { limit: 1 }),
      ]);
      if (seq !== requestSeq.current) return;
      // Same rule as the Today panel: progress follows the chosen subjects,
      // reviews cover everything learned.
      const inSubjects = inFocus(concepts, focusKey ? focusKey.split('\n') : [], (c) => c.domain);
      setData({ learnerId, progress: summarizeProgress(inSubjects, states), reviewsDue: queue.stats.totalItems });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error('Failed to load learning overview:', err);
      setError('Could not load your progress.');
    }
  }, [db, isReady, learnerId, focusKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Messages and an open editor belong to one learner only.
  useEffect(() => {
    setNotice(null);
    setEditing(false);
  }, [learnerId]);

  const closeEditor = () => {
    setEditing(false);
    requestAnimationFrame(() => changeRef.current?.focus());
  };

  const saved = async (savedFor: string, domains: string[]) => {
    await onSubjectsSaved();
    if (currentIdRef.current !== savedFor) return;
    setNotice(
      domains.length > 0
        ? `Saved. Your plan now focuses on ${domains.map(domainLabel).join(', ')}.`
        : 'Saved. Your plan now covers all subjects.',
    );
    closeEditor();
  };

  const current = data?.learnerId === learnerId ? data : null;
  const next = current ? profileNextStep(current.progress, current.reviewsDue) : null;

  return (
    <section aria-labelledby="my-learning-heading" className="glass-card mb-8 p-4 sm:p-6" data-testid="my-learning">
      <h2 id="my-learning-heading" className="text-lg font-semibold text-foreground">
        My learning
      </h2>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <span data-testid="profile-focus">
          {focus.length > 0 ? `Focus: ${focus.map(domainLabel).join(', ')}` : 'All subjects'}
        </span>
        <button
          ref={changeRef}
          type="button"
          onClick={() => (editing ? closeEditor() : setEditing(true))}
          aria-expanded={editing}
          className="inline-flex min-h-10 items-center gap-1 font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {focus.length > 0 ? 'Change subjects' : 'Choose subjects'}
        </button>
      </p>

      {editing && (
        <FocusEditor
          key={learnerId}
          learnerId={learnerId}
          learnerName={name}
          focus={focus}
          onSaved={saved}
          onCancel={closeEditor}
        />
      )}

      <p aria-live="polite" role="status" className={notice ? 'mt-3 text-sm text-emerald-700 dark:text-emerald-400' : 'sr-only'}>
        {notice}
      </p>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}{' '}
          <button type="button" onClick={() => load()} className="font-medium underline">
            Try again
          </button>
        </p>
      ) : !current ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your progress…
        </p>
      ) : (
        <>
          <div className="mt-4">
            <p className="text-sm font-medium text-foreground" data-testid="profile-mastered">
              {masteredLine(current.progress)}
            </p>
            <div
              role="progressbar"
              aria-label="Concepts mastered"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={current.progress.percentMastered}
              className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                style={{ width: `${current.progress.percentMastered}%` }}
              />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ['Learning', current.progress.learning],
                ['Not started', current.progress.notStarted],
                ['To review', current.reviewsDue],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-secondary/50 p-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {next && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{next.hint}</p>
              <Link
                to="/"
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {next.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
