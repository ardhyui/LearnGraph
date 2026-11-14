/**
 * "Refresh example data" on Admin → Learners (Roadmap P0 #2): workspaces seeded
 * before round #17 still have example progress dated 2024, so every example
 * concept looks months overdue. The button is only shown while an example
 * state is actually stale; it asks once, writes through one trusted,
 * account-scoped server function (only the demo learners' dates), and reports
 * how many progress records moved. Mastery, review counts and history stay.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { useDB } from '@/lib/DBContext';
import { demoLearners } from '@/lib/demo-data';
import { demoRefreshPlan, type DemoStateDatesPatch } from '@/lib/demo-refresh';
import { refreshExampleData } from '@/server/graph.functions';

const DEMO_LEARNER_IDS = demoLearners.map((l) => l.userId);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function RefreshExampleData() {
  const { db, isReady } = useDB();
  const [plan, setPlan] = useState<DemoStateDatesPatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  const loadPlan = useCallback(async () => {
    if (!db || !isReady) return;
    try {
      const states = (
        await Promise.all(DEMO_LEARNER_IDS.map((id) => db.getLearnerKnowledgeStates(id)))
      ).flat();
      setPlan(demoRefreshPlan(states, new Date()));
    } catch (err) {
      console.error('Failed to check the example data dates:', err);
      setPlan([]);
    } finally {
      setLoaded(true);
    }
  }, [db, isReady]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function cancel() {
    setConfirming(false);
    triggerRef.current?.focus();
  }

  async function refresh() {
    if (busy || plan.length === 0) return;
    setBusy(true);
    setError('');
    let failed = false;
    try {
      const { moved } = await refreshExampleData();
      if (moved > 0) {
        setNotice(
          `Moved ${plural(moved, 'example progress record')} to today. Mastery, review counts and history were not changed.`,
        );
      } else {
        setNotice('The example dates are already up to date.');
      }
      setConfirming(false);
    } catch (err) {
      console.error('Failed to refresh the example data:', err);
      failed = true;
      setError('Could not refresh the example data. Please try again.');
      setConfirming(false);
    } finally {
      setBusy(false);
      await loadPlan();
      // The trigger disappears when nothing is stale any more: keep keyboard
      // focus on the outcome message instead of dropping it to <body>.
      setTimeout(() => {
        if (failed) alertRef.current?.focus();
        else statusRef.current?.focus();
      }, 0);
    }
  }

  if (!isReady || !loaded) return null;

  const stale = plan.length > 0;

  return (
    <>
      {stale && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setNotice('');
            setError('');
            setConfirming(true);
          }}
          disabled={busy || confirming}
          aria-busy={busy}
          data-testid="refresh-example-dates"
          className="btn btn-secondary inline-flex min-h-10 items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
          )}
          {busy ? 'Refreshing example data…' : 'Refresh example data'}
        </button>
      )}
      {stale && confirming && (
        <div
          role="group"
          aria-label="Refresh example data"
          className="w-full rounded-xl border border-border bg-muted/40 p-4"
        >
          <p className="text-sm text-foreground">
            Move the example learners’ review dates relative to today? Mastery, review counts and
            history stay the same, and learners you made yourself are not touched.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="btn btn-primary inline-flex min-h-10 items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy ? 'Refreshing…' : 'Refresh dates'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="btn btn-secondary inline-flex min-h-10 items-center justify-center disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        data-testid="refresh-example-dates-status"
        className={
          notice
            ? 'w-full mt-2 text-sm text-emerald-700 dark:text-emerald-400'
            : 'sr-only'
        }
      >
        {notice}
      </p>
      {error && (
        <p
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="w-full mt-2 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </>
  );
}
