/**
 * First-visit "Welcome" step on the dashboard: create the learner's own
 * profile (name, subjects, starting point) so the Today plan is about them
 * rather than a demo learner. Everything is saved through the regular,
 * server-validated graph calls, scoped to the signed-in account.
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useRouteContext } from '@tanstack/react-router';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useDB } from '@/lib/DBContext';
import type { ConceptNode, PrerequisiteEdge } from '@/lib/graph/types';
import {
  basicConcepts,
  cleanName,
  domainLabel,
  focusTags,
  listDomains,
  makeLearnerId,
} from '@/lib/onboarding';
import { applyStudyOutcome } from '@/lib/study';

interface OnboardingProps {
  /** Ids already used in this workspace (the new id must not collide). */
  existingIds: string[];
  /** Called with the new learner once it is saved. */
  onCreated: (learnerId: string, name: string) => void | Promise<void>;
  /** Hide the form and use the demo learners instead (absent = not offered). */
  onSkip?: () => void;
}

export function Onboarding({ existingIds, onCreated, onSkip }: OnboardingProps) {
  const { db, isReady } = useDB();
  const { user } = useRouteContext({ from: '__root__' });
  const [name, setName] = useState(() => user?.name?.trim() ?? '');
  const [graph, setGraph] = useState<{ concepts: ConceptNode[]; edges: PrerequisiteEdge[] } | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [start, setStart] = useState<'new' | 'basics'>('new');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { heading: useId(), name: useId(), nameHint: useId(), subjectsHint: useId() };

  useEffect(() => {
    if (!db || !isReady) return;
    let live = true;
    Promise.all([db.listConcepts(), db.listEdges()]).then(
      ([concepts, edges]) => live && setGraph({ concepts, edges }),
      (err) => {
        console.error('Failed to load subjects:', err);
        if (live) setGraph({ concepts: [], edges: [] });
      },
    );
    return () => {
      live = false;
    };
  }, [db, isReady]);

  const domains = graph ? listDomains(graph.concepts) : [];

  const toggle = (domain: string, on: boolean) =>
    setChosen((prev) => (on ? [...new Set([...prev, domain])] : prev.filter((d) => d !== domain)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || saving) return;
    const clean = cleanName(name);
    if (!clean) {
      setError('Please enter your name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // The list can be stale (another tab): never overwrite an existing learner.
      const taken = new Set(existingIds);
      let learnerId = makeLearnerId(clean, taken);
      while (await db.getLearnerProfile(learnerId)) {
        taken.add(learnerId);
        learnerId = makeLearnerId(clean, taken);
      }
      await db.setLearnerProfile(learnerId, { name: clean, tags: focusTags(chosen) });
      if (start === 'basics' && graph) {
        for (const conceptId of basicConcepts(graph.concepts, graph.edges, chosen)) {
          await db.setKnowledgeState(learnerId, conceptId, applyStudyOutcome(undefined, 'got-it'));
        }
      }
      await onCreated(learnerId, clean);
    } catch (err) {
      setError(`Could not create your profile: ${err instanceof Error ? err.message : 'please try again.'}`);
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={ids.heading} className="glass-card mb-10 p-4 sm:p-6" data-testid="onboarding">
      <div className="flex items-start gap-3">
        <div className="hidden rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 sm:block">
          <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h2 id={ids.heading} className="text-lg font-semibold text-foreground">
            Let’s set up your learning plan
          </h2>
          <p className="text-sm text-muted-foreground">
            Three quick questions, then you’ll see what to learn first. The example learners stay available to explore.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
        <div>
          <label htmlFor={ids.name} className="block text-sm font-medium text-foreground">
            1. What should we call you?
          </label>
          <input
            id={ids.name}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            maxLength={200}
            required
            aria-invalid={error === 'Please enter your name.' || undefined}
            aria-describedby={ids.nameHint}
            className="mt-2 w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <p id={ids.nameHint} className="mt-1 text-xs text-muted-foreground">
            Shown on your plan. Only you can see it.
          </p>
        </div>

        <fieldset aria-describedby={ids.subjectsHint}>
          <legend className="text-sm font-medium text-foreground">2. What do you want to learn?</legend>
          <p id={ids.subjectsHint} className="mt-1 text-xs text-muted-foreground">
            Pick one or more subjects. Leave all unticked to see everything.
          </p>
          {graph === null ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading subjects…
            </p>
          ) : domains.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No subjects yet — your plan will fill in once concepts are added.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {domains.map(({ domain, count }) => {
                const on = chosen.includes(domain);
                return (
                  <label
                    key={domain}
                    className={
                      'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary ' +
                      (on ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-foreground hover:bg-primary/5')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggle(domain, e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    {domainLabel(domain)}
                    <span className="text-xs text-muted-foreground">
                      {count} {count === 1 ? 'concept' : 'concepts'}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">3. Where are you starting?</legend>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            {(
              [
                ['new', 'I’m new to this', 'Start from the very first concepts.'],
                ['basics', 'I know the basics', 'Skip the entry-level concepts — they come back once for a quick review.'],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className={
                  'flex flex-1 cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm focus-within:ring-2 focus-within:ring-primary ' +
                  (start === value ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-primary/5')
                }
              >
                <input
                  type="radio"
                  name="start"
                  value={value}
                  checked={start === value}
                  onChange={() => setStart(value)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium text-foreground">{title}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={saving || !isReady}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? 'Creating your plan…' : 'Start learning'}
            {!saving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={saving}
              className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              Explore the example learners first
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
