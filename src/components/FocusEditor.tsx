/**
 * "Change subjects" on the Today panel: pick which subjects the plan follows
 * after onboarding. Saves only the learner's `focus:*` tags (other tags are
 * kept) through the server-validated `setLearnerProfile`, scoped to the
 * signed-in account like every other graph call.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { SubjectChoices } from '@/components/SubjectChoices';
import { useDB } from '@/lib/DBContext';
import { listDomains, sameSubjects, withFocus } from '@/lib/onboarding';

interface FocusEditorProps {
  learnerId: string;
  learnerName: string;
  /** Subjects the plan follows now (empty = everything). */
  focus: string[];
  /** Called after a successful save with the new subjects. */
  onSaved: (domains: string[]) => void | Promise<void>;
  onCancel: () => void;
}

export function FocusEditor({ learnerId, learnerName, focus, onSaved, onCancel }: FocusEditorProps) {
  const { db, isReady } = useDB();
  const [domains, setDomains] = useState<{ domain: string; count: number }[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { heading: useId(), hint: useId() };
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Pre-tick the subjects as they were when the editor opened.
  const [initialFocus] = useState(focus);

  // Move keyboard/screen-reader focus into the editor when it opens.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!db || !isReady) return;
    let live = true;
    db.listConcepts().then(
      (concepts) => {
        if (!live) return;
        const list = listDomains(concepts);
        setDomains(list);
        // Subjects that no longer exist can't be shown, so they are dropped on save.
        setChosen(initialFocus.filter((d) => list.some((x) => x.domain === d)));
      },
      (err) => {
        console.error('Failed to load subjects:', err);
        if (live) {
          setDomains([]);
          setError('Could not load subjects. Please try again.');
        }
      },
    );
    return () => {
      live = false;
    };
  }, [db, isReady, initialFocus]);

  const toggle = (domain: string, on: boolean) =>
    setChosen((prev) => (on ? [...new Set([...prev, domain])] : prev.filter((d) => d !== domain)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || saving || domains === null) return;
    if (sameSubjects(chosen, focus)) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Read the profile fresh so tags edited elsewhere (another tab, the
      // admin editor) are not overwritten with a stale copy.
      const profile = await db.getLearnerProfile(learnerId);
      if (!profile) throw new Error('this learner no longer exists.');
      await db.setLearnerProfile(learnerId, { tags: withFocus(profile.tags, chosen) });
      await onSaved(chosen);
    } catch (err) {
      setError(`Could not save your subjects: ${err instanceof Error ? err.message : 'please try again.'}`);
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-labelledby={ids.heading}
      className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4"
      data-testid="focus-editor"
    >
      <h3 ref={headingRef} id={ids.heading} tabIndex={-1} className="text-sm font-semibold text-foreground focus:outline-none">
        What should {learnerName}’s plan focus on?
      </h3>
      <fieldset aria-describedby={ids.hint} className="mt-1">
        <legend className="sr-only">Subjects</legend>
        <p id={ids.hint} className="text-xs text-muted-foreground">
          Progress and “Learn next” follow these subjects. Reviews always include everything you have learned. Leave all
          unticked to see every subject.
        </p>
        {domains === null ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading subjects…
          </p>
        ) : domains.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No subjects yet — add concepts first.</p>
        ) : (
          <SubjectChoices domains={domains} chosen={chosen} onToggle={toggle} disabled={saving} />
        )}
      </fieldset>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving || domains === null}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save subjects
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
