/**
 * A short concept quiz shown inline (Roadmap M1): questions come from the
 * concept's bank on the server, answers are graded there, and the result says
 * what was right, with the explanation. The parent reloads its lists only
 * after "Done", so the feedback stays readable.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { startConceptQuiz, submitConceptQuiz } from '@/server/evidence.functions';
import { cn } from '@/lib/utils';

type Started = Awaited<ReturnType<typeof startConceptQuiz>>;
export type ConceptQuizResult = Awaited<ReturnType<typeof submitConceptQuiz>>;

interface ConceptQuizProps {
  learnerId: string;
  conceptId: string;
  conceptName: string;
  /** "Done" after reading the result. */
  onFinished: (result: ConceptQuizResult) => void;
  /** Closed before answering (nothing is graded or saved). */
  onCancel: () => void;
}

export function ConceptQuiz({ learnerId, conceptId, conceptName, onFinished, onCancel }: ConceptQuizProps) {
  const [quiz, setQuiz] = useState<Started | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ConceptQuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const ids = { heading: useId(), result: useId() };

  useEffect(() => {
    let live = true;
    startConceptQuiz({ data: { learnerId, conceptId } }).then(
      (started) => {
        if (!live) return;
        setQuiz(started);
        requestAnimationFrame(() => headingRef.current?.focus());
      },
      (err) => live && setError(err instanceof Error ? err.message : 'Could not start the quiz.'),
    );
    return () => {
      live = false;
    };
  }, [learnerId, conceptId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!quiz || busy) return;
    if (quiz.questions.some((q) => !answers[q.id])) {
      setError('Answer every question first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await submitConceptQuiz({ data: { sessionId: quiz.sessionId, answers } }));
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check your answers.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby={result ? ids.result : ids.heading}
      className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4"
      data-testid="concept-quiz"
    >
      {result ? (
        <div data-testid="quiz-result">
          <h4
            id={ids.result}
            ref={resultRef}
            tabIndex={-1}
            className="flex items-center gap-2 font-semibold text-foreground focus:outline-none"
          >
            {result.passed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            )}
            {result.correct} of {result.total} correct — {result.passed ? 'passed' : 'not passed yet'}
          </h4>
          <ol className="mt-3 space-y-2 text-sm">
            {result.feedback.map((f) => (
              <li key={f.questionId} className="rounded-lg border border-border/60 bg-background/60 p-2.5">
                <p className="font-medium text-foreground">{f.prompt}</p>
                <p className={cn('mt-1', f.correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
                  Your answer: {f.picked} {f.correct ? '✓' : '✗'}
                </p>
                {!f.correct && <p className="text-foreground">Correct answer: {f.answer}</p>}
                {f.explanation && <p className="mt-1 text-muted-foreground">{f.explanation}</p>}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => onFinished(result)}
            className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h4 id={ids.heading} ref={headingRef} tabIndex={-1} className="font-semibold text-foreground focus:outline-none">
            Quick quiz: {conceptName}
          </h4>
          <p className="text-xs text-muted-foreground">
            Get {quiz ? Math.ceil(quiz.questions.length * 0.8) : 'most'} of {quiz?.questions.length ?? 3} right to pass. Your answers are checked on the server.
          </p>
          {!quiz && !error && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Preparing questions…
            </p>
          )}
          {quiz?.questions.map((q, i) => (
            <fieldset key={q.id} className="mt-3">
              <legend className="text-sm font-medium text-foreground">
                {i + 1}. {q.prompt}
              </legend>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {q.options.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm focus-within:ring-2 focus-within:ring-primary',
                      answers[q.id] === option ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-primary/5',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${quiz.sessionId}-${q.id}`}
                      value={option}
                      checked={answers[q.id] === option}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: option }))}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-foreground">{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {quiz && (
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Check my answers
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-primary/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              Not now
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
