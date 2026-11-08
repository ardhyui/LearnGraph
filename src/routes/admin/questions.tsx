/**
 * Admin → Quiz Questions (Roadmap M1): the question bank per concept. A
 * concept with questions is quiz-checked: learners pass a short quiz, graded
 * on the server, instead of marking it as known themselves (decision D5).
 */
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ListChecks, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { pageHead } from '@/lib/page-titles';
import { Sidebar } from '@/components/Sidebar';
import { useConcepts, useDB } from '@/lib/DBContext';
import { cn } from '@/lib/utils';
import { MAX_OPTIONS, MIN_OPTIONS, QUIZ_LENGTH, type QuizQuestion } from '@/lib/evidence/quiz';
import { deleteQuizQuestion, listQuizQuestions, saveQuizQuestion } from '@/server/evidence.functions';
import { getAiDraftSettings, reviewQuestionDraft, setAiDraftSettings } from '@/server/ai.functions';
import { AiQuestionDrafts } from '@/components/AiQuestionDrafts';
import type { QuestionInput } from '@/lib/evidence/quiz';
import { rememberRowFocus, restoreRowFocus } from '@/lib/focus-after-delete';

export const Route = createFileRoute('/admin/questions')({
  head: () => pageHead('/admin/questions'),
  component: QuestionsPage,
});

interface Draft {
  id?: string;
  prompt: string;
  options: string[];
  /** Index of the correct option. */
  correct: number;
  explanation: string;
}

const EMPTY_DRAFT: Draft = { prompt: '', options: ['', '', ''], correct: 0, explanation: '' };

const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function QuestionsPage() {
  const { isLoading: dbLoading, error: dbError } = useDB();
  const { concepts, loading: conceptsLoading } = useConcepts();
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [conceptId, setConceptId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The AI draft the form was opened from (Roadmap M5): saved as an "edited" review. */
  const [aiOriginal, setAiOriginal] = useState<QuestionInput | null>(null);
  const [ai, setAi] = useState<Awaited<ReturnType<typeof getAiDraftSettings>> | null>(null);

  const loadAi = useCallback(async () => {
    try {
      setAi(await getAiDraftSettings());
    } catch {
      setAi(null);
    }
  }, []);

  useEffect(() => {
    void loadAi();
  }, [loadAi]);

  // The box changes at once; if saving fails it goes back and says why.
  const toggleAi = async (enabled: boolean) => {
    setAi((s) => (s ? { ...s, enabled } : s));
    try {
      await setAiDraftSettings({ data: { enabled } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the setting.');
    }
    await loadAi();
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const ids = { concept: useId(), prompt: useId(), explanation: useId(), form: useId() };

  const load = useCallback(async () => {
    try {
      setQuestions(await listQuizQuestions({ data: {} }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the questions.');
      setQuestions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions ?? []) map.set(q.conceptId, (map.get(q.conceptId) ?? 0) + 1);
    return map;
  }, [questions]);

  // Start on the first concept, once both lists are in.
  useEffect(() => {
    if (conceptId || concepts.length === 0 || questions === null) return;
    setConceptId(concepts[0].conceptId);
  }, [conceptId, concepts, questions]);

  const concept = concepts.find((c) => c.conceptId === conceptId);
  const bank = (questions ?? []).filter((q) => q.conceptId === conceptId);

  const openForm = (next: Draft) => {
    setDraft(next);
    setError(null);
    setNotice(null);
    requestAnimationFrame(() => formHeadingRef.current?.focus());
  };

  const edit = (q: QuizQuestion) =>
    openForm({
      id: q.id,
      prompt: q.prompt,
      options: [...q.options],
      correct: Math.max(0, q.options.indexOf(q.answer)),
      explanation: q.explanation,
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !conceptId || saving) return;
    const options = draft.options.map((o) => o.trim());
    if (!draft.prompt.trim()) return setError('Write the question first.');
    if (options.filter(Boolean).length < MIN_OPTIONS) return setError(`Give at least ${MIN_OPTIONS} options.`);
    if (options.some((o) => !o)) return setError('Fill in or remove the empty options.');
    if (new Set(options).size !== options.length) return setError('Each option must be different.');
    setSaving(true);
    setError(null);
    try {
      const final = {
        conceptId,
        prompt: draft.prompt.trim(),
        options,
        answer: options[draft.correct] ?? options[0],
        explanation: draft.explanation.trim(),
      };
      if (aiOriginal) {
        // An edited AI draft: saved and recorded as "edited" (Roadmap M5).
        await reviewQuestionDraft({ data: { draft: aiOriginal, decision: 'edited', final } });
        setAiOriginal(null);
        void loadAi();
      } else {
        await saveQuizQuestion({ data: { id: draft.id, ...final } });
      }
      setNotice(draft.id ? 'Question updated.' : 'Question added.');
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the question.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (q: QuizQuestion, button?: HTMLElement) => {
    if (!confirm(`Delete this question?\n\n${q.prompt}`)) return;
    setError(null);
    const focus = rememberRowFocus(button);
    try {
      await deleteQuizQuestion({ data: { id: q.id } });
      setNotice('Question deleted.');
      if (draft?.id === q.id) setDraft(null);
      await load();
      restoreRowFocus(focus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the question.');
    }
  };

  if (dbLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Initializing database...</p>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center text-destructive">
          <AlertCircle className="mx-auto mb-3 h-8 w-8" />
          <p>Database error: {dbError.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-500/10 p-2.5">
                <ListChecks className="h-6 w-6 text-indigo-500" aria-hidden="true" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Quiz Questions</h1>
            </div>
            <p className="text-muted-foreground">
              A concept with questions is quiz-checked: learners pass a {QUIZ_LENGTH}-question quiz (80% correct) to master
              and review it, instead of marking it as known. Add at least {QUIZ_LENGTH + 1} so a retake can ask something
              new.
            </p>
          </div>

          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor={ids.concept} className="text-sm font-medium text-foreground">
              Concept
            </label>
            <select
              id={ids.concept}
              value={conceptId}
              onChange={(e) => {
                setConceptId(e.target.value);
                setDraft(null);
                setNotice(null);
                setError(null);
              }}
              disabled={conceptsLoading || concepts.length === 0}
              className={cn(field, 'sm:max-w-sm')}
            >
              {concepts.length === 0 && <option value="">No concepts yet</option>}
              {concepts.map((c) => (
                <option key={c.conceptId} value={c.conceptId}>
                  {c.name} ({counts.get(c.conceptId) ?? 0})
                </option>
              ))}
            </select>
            {concept && (
              <span className="text-xs text-muted-foreground" data-testid="quiz-checked-status">
                {bank.length > 0
                  ? 'Quiz-checked'
                  : concept.evidenceRequired
                    ? 'Checked on its own practice page'
                    : 'Self-reported (no questions yet)'}
              </span>
            )}
          </div>

          <p role="status" aria-live="polite" className={cn('text-sm text-emerald-700 dark:text-emerald-400', notice && 'mb-4')}>
            {notice}
          </p>
          {error && (
            <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {questions === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading questions…
            </p>
          ) : (
            concept && (
              <>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {concept.name}: {bank.length} {bank.length === 1 ? 'question' : 'questions'}
                  </h2>
                  {!draft && (
                    <button type="button" onClick={() => openForm({ ...EMPTY_DRAFT, options: [...EMPTY_DRAFT.options] })} className="btn btn-primary flex items-center gap-2">
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add question
                    </button>
                  )}
                </div>

                {/* Roadmap M5: AI question drafts (off until turned on; a person approves each one). */}
                {ai && (
                  <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="ai-drafts-setting">
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" checked={ai.enabled} onChange={(e) => void toggleAi(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                      Let Claude draft questions (with your own API key)
                    </label>
                    {ai.questions.proposed > 0 && ai.questions.rate !== null && (
                      <span>
                        AI drafts kept so far: {ai.questions.accepted} of {ai.questions.proposed} ({Math.round(ai.questions.rate * 100)}%)
                      </span>
                    )}
                  </div>
                )}
                {ai?.enabled && (
                  <AiQuestionDrafts
                    conceptId={conceptId}
                    onSaved={() => {
                      void load();
                      void loadAi();
                    }}
                    onEdit={(d) => {
                      setAiOriginal(d);
                      openForm({
                        prompt: d.prompt,
                        options: [...d.options],
                        correct: Math.max(0, d.options.indexOf(d.answer)),
                        explanation: d.explanation ?? '',
                      });
                    }}
                  />
                )}

                {draft && (
                  <form onSubmit={submit} aria-labelledby={ids.form} className="glass-card mb-6 space-y-4 p-4 sm:p-6" noValidate>
                    <h3 id={ids.form} ref={formHeadingRef} tabIndex={-1} className="font-semibold text-foreground focus:outline-none">
                      {draft.id ? 'Edit question' : 'New question'}
                    </h3>
                    <div>
                      <label htmlFor={ids.prompt} className="mb-1 block text-sm font-medium text-foreground">
                        Question
                      </label>
                      <textarea
                        id={ids.prompt}
                        value={draft.prompt}
                        onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                        maxLength={500}
                        rows={2}
                        className={field}
                      />
                    </div>
                    <fieldset>
                      <legend className="mb-1 text-sm font-medium text-foreground">Options — pick the correct one</legend>
                      <div className="space-y-2">
                        {draft.options.map((option, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="correct-option"
                              checked={draft.correct === i}
                              onChange={() => setDraft({ ...draft, correct: i })}
                              aria-label={`Option ${i + 1} is correct`}
                              className="h-4 w-4 accent-primary"
                            />
                            <input
                              type="text"
                              value={option}
                              onChange={(e) =>
                                setDraft({ ...draft, options: draft.options.map((o, j) => (j === i ? e.target.value : o)) })
                              }
                              maxLength={200}
                              aria-label={`Option ${i + 1}`}
                              className={field}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  options: draft.options.filter((_, j) => j !== i),
                                  correct: draft.correct === i ? 0 : draft.correct > i ? draft.correct - 1 : draft.correct,
                                })
                              }
                              disabled={draft.options.length <= MIN_OPTIONS}
                              aria-label={`Remove option ${i + 1}`}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                      {draft.options.length < MAX_OPTIONS && (
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
                          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add an option
                        </button>
                      )}
                    </fieldset>
                    <div>
                      <label htmlFor={ids.explanation} className="mb-1 block text-sm font-medium text-foreground">
                        Explanation <span className="font-normal text-muted-foreground">(shown after answering)</span>
                      </label>
                      <textarea
                        id={ids.explanation}
                        value={draft.explanation}
                        onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                        maxLength={1000}
                        rows={2}
                        className={field}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={saving} className="btn btn-primary flex items-center gap-2 disabled:opacity-60">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                        Save question
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Closing an opened AI draft without saving counts as discarding it.
                          if (aiOriginal) void reviewQuestionDraft({ data: { draft: aiOriginal, decision: 'discarded' } }).then(loadAi, () => {});
                          setAiOriginal(null);
                          setDraft(null);
                        }}
                        disabled={saving}
                        className="btn btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {bank.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No questions yet. Learners mark this concept as known themselves until it has some.
                  </p>
                ) : (
                  <ol className="space-y-3" aria-label={`Questions for ${concept.name}`}>
                    {bank.map((q, n) => (
                      <li key={q.id} className="glass-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-foreground">
                            {n + 1}. {q.prompt}
                          </p>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => edit(q)}
                              aria-label={`Edit question ${n + 1}`}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => remove(q, e.currentTarget)}
                              aria-label={`Delete question ${n + 1}`}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                          {q.options.map((o) => (
                            <li
                              key={o}
                              data-correct={o === q.answer || undefined}
                              className={cn(
                                'rounded-lg border px-2.5 py-1',
                                o === q.answer
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                  : 'border-border text-muted-foreground',
                              )}
                            >
                              {o === q.answer && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                              {o}
                              {o === q.answer && <span className="sr-only"> (correct answer)</span>}
                            </li>
                          ))}
                        </ul>
                        {q.explanation && <p className="mt-2 text-sm text-muted-foreground">{q.explanation}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )
          )}
        </div>
      </main>
    </div>
  );
}
