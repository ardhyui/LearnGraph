/**
 * Lesson page (Roadmap M2): learn one concept inside the app. Goals, the
 * lesson content in the learner's preferred order, a short quiz (or a
 * self-check for concepts without questions), and the next step.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Circle, ExternalLink, Loader2, PlayCircle } from 'lucide-react';
import { pageHead } from '@/lib/page-titles';
import { Sidebar } from '@/components/Sidebar';
import { RichText } from '@/components/RichText';
import { ConceptQuiz, type ConceptQuizResult } from '@/components/ConceptQuiz';
import { useDB, useLearners } from '@/lib/DBContext';
import { useActiveLearner } from '@/lib/active-learner';
import { domainLabel } from '@/lib/onboarding';
import {
  CONTENT_KIND_LABELS,
  FORMAT_LABELS,
  FORMAT_PREFERENCES,
  lessonMinutes,
  orderContent,
  withFormatPreference,
  type FormatPreference,
} from '@/lib/content/content';
import { masterySourceLabel, quizResultNotice } from '@/lib/evidence/labels';
import { getLesson, logLessonOpened } from '@/server/content.functions';
import { recordStudyOutcome } from '@/server/evidence.functions';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/learn/$conceptId')({
  head: () => pageHead('/learn/$conceptId'),
  component: LessonPage,
});

type LessonResult = Awaited<ReturnType<typeof getLesson>>;
type Lesson = Extract<LessonResult, { found: true }>;

const OBJECTIVE_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const;

function LessonPage() {
  const { conceptId } = Route.useParams();
  const { db, isReady } = useDB();
  const { learners, loading: learnersLoading, refresh: refreshLearners } = useLearners();
  const [learnerId, setLearnerId] = useActiveLearner(
    learners.map((l) => l.userId),
    learnersLoading,
  );
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shownSolutions, setShownSolutions] = useState<Set<string>>(() => new Set());
  const seq = useRef(0);
  const logged = useRef<string | null>(null);
  const quizButtonRef = useRef<HTMLButtonElement>(null);
  const ids = { learner: useId(), format: useId(), check: useId() };

  const load = useCallback(async () => {
    if (!learnerId) return;
    const mine = ++seq.current;
    setError(null);
    try {
      const result = await getLesson({ data: { learnerId, conceptId } });
      if (mine !== seq.current) return;
      if (!result.found) {
        setMissing(true);
        setLesson(null);
        return;
      }
      setMissing(false);
      setLesson(result);
    } catch (err) {
      if (mine === seq.current) setError(err instanceof Error ? err.message : 'Could not load this lesson.');
    }
  }, [learnerId, conceptId]);

  useEffect(() => {
    setLesson(null);
    setNotice(null);
    setQuizOpen(false);
    setShownSolutions(new Set());
    void load();
  }, [load]);

  // Log the lesson once per learner and concept, with the order it was shown in.
  useEffect(() => {
    if (!lesson || !learnerId) return;
    const key = `${learnerId}\n${conceptId}`;
    if (logged.current === key) return;
    logged.current = key;
    logLessonOpened({
      data: { learnerId, conceptId, strategy: lesson.strategy, order: lesson.items.map((i) => i.kind) },
    }).catch((err) => console.warn('Could not log the lesson:', err));
  }, [lesson, learnerId, conceptId]);

  const chooseFormat = async (preference: FormatPreference) => {
    if (!db || !learnerId || !lesson || busy) return;
    const learner = learners.find((l) => l.userId === learnerId);
    setLesson({ ...lesson, strategy: { preference, source: 'chosen' }, items: orderContent(lesson.items, preference) });
    try {
      await db.setLearnerProfile(learnerId, { tags: withFormatPreference(learner?.tags, preference) });
      await refreshLearners();
    } catch (err) {
      setNotice(`Could not save your choice: ${err instanceof Error ? err.message : 'please try again.'}`);
    }
  };

  const selfReport = async (outcome: 'got-it' | 'started') => {
    if (!learnerId || !lesson || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await recordStudyOutcome({ data: { learnerId, conceptId, outcome } });
      setNotice(
        outcome === 'got-it'
          ? `Nice! “${lesson.concept.name}” is marked as mastered (self-reported). It comes back for a review tomorrow.`
          : `Saved your progress on “${lesson.concept.name}”. Keep going!`,
      );
      await load();
    } catch (err) {
      setNotice(`Could not save: ${err instanceof Error ? err.message : 'please try again.'}`);
    } finally {
      setBusy(false);
    }
  };

  const finishQuiz = async (result: ConceptQuizResult) => {
    setQuizOpen(false);
    setNotice(quizResultNotice(result));
    await load();
  };

  const cancelQuiz = () => {
    setQuizOpen(false);
    requestAnimationFrame(() => quizButtonRef.current?.focus());
  };

  const toggleSolution = (id: string) =>
    setShownSolutions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const noLearner = isReady && !learnersLoading && learners.length === 0;
  const objectives = lesson
    ? OBJECTIVE_LEVELS.flatMap((level) => lesson.concept.bloomObjectives?.[level] ?? [])
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Today
          </Link>

          {missing ? (
            <>
              <h1 className="mt-4 text-3xl font-bold text-foreground">Lesson not found</h1>
              <p className="mt-2 text-muted-foreground">This concept or learner no longer exists.</p>
            </>
          ) : noLearner ? (
            <>
              <h1 className="mt-4 text-3xl font-bold text-foreground">Lesson</h1>
              <p className="mt-2 text-muted-foreground">
                Create your learning plan on the{' '}
                <Link to="/" className="font-medium text-primary underline">
                  dashboard
                </Link>{' '}
                first.
              </p>
            </>
          ) : !lesson ? (
            <>
              <h1 className="mt-4 text-3xl font-bold text-foreground">Lesson</h1>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {error}{' '}
                  <button type="button" onClick={() => void load()} className="font-medium underline">
                    Try again
                  </button>
                </p>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the lesson…
                </p>
              )}
            </>
          ) : (
            <article aria-labelledby="lesson-title" data-testid="lesson">
              <header className="mt-4">
                <p className="text-sm font-medium text-primary">{domainLabel(lesson.concept.domain)}</p>
                <h1 id="lesson-title" className="mt-1 text-3xl font-bold text-foreground">
                  {lesson.concept.name}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {lesson.items.length > 0 ? `About ${Math.max(1, lessonMinutes(lesson.items))} min of reading and practice` : 'No lesson material yet'}
                  {lesson.questionCount > 0 && ' · then a short quiz'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <label htmlFor={ids.learner} className="text-muted-foreground">
                    Learner
                  </label>
                  <select
                    id={ids.learner}
                    value={learnerId ?? ''}
                    onChange={(e) => setLearnerId(e.target.value)}
                    className="min-w-0 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {learners.map((l) => (
                      <option key={l.userId} value={l.userId}>
                        {l.name || l.userId}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground" data-testid="lesson-progress">
                    {lesson.mastery > 0
                      ? `Your progress: ${Math.round(lesson.mastery)}% · ${masterySourceLabel(lesson.masterySource)}`
                      : 'Not started yet'}
                  </span>
                </div>
              </header>

              <p role="status" aria-live="polite" className={cn('text-sm text-emerald-700 dark:text-emerald-400', notice && 'mt-4')}>
                {notice}
              </p>

              {(lesson.prerequisites.length > 0 || objectives.length > 0 || lesson.concept.description) && (
                <section aria-labelledby="goals-heading" className="glass-card mt-6 p-4 sm:p-5">
                  <h2 id="goals-heading" className="font-semibold text-foreground">
                    What this is about
                  </h2>
                  {lesson.concept.description && <p className="mt-1 text-sm text-muted-foreground">{lesson.concept.description}</p>}
                  {objectives.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                      {objectives.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  )}
                  {lesson.prerequisites.length > 0 && (
                    <div className="mt-3">
                      <h3 className="text-sm font-medium text-foreground">Builds on</h3>
                      <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                        {lesson.prerequisites.map((p) => (
                          <li key={p.conceptId}>
                            <Link
                              to="/learn/$conceptId"
                              params={{ conceptId: p.conceptId }}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 hover:bg-primary/5"
                            >
                              {p.mastery >= 80 ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                              )}
                              {p.name}
                              <span className="sr-only">{p.mastery >= 80 ? ' (mastered)' : ' (not mastered yet)'}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {lesson.items.length > 1 && (
                <fieldset className="mt-6" data-testid="format-choice">
                  <legend className="text-sm font-medium text-foreground">Show first</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {FORMAT_PREFERENCES.map((p) => (
                      <label
                        key={p}
                        className={cn(
                          'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm focus-within:ring-2 focus-within:ring-primary',
                          lesson.strategy.preference === p ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-primary/5',
                        )}
                      >
                        <input
                          type="radio"
                          name={ids.format}
                          checked={lesson.strategy.preference === p}
                          onChange={() => void chooseFormat(p)}
                          className="h-4 w-4 accent-primary"
                        />
                        {FORMAT_LABELS[p]}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lesson.strategy.source === 'chosen'
                      ? 'Your choice, saved for every lesson.'
                      : lesson.strategy.source === 'suggested'
                        ? 'Suggested from your profile. It’s only a starting point — pick what works for you.'
                        : 'Pick the order that works for you; it’s saved for every lesson.'}
                  </p>
                </fieldset>
              )}

              {lesson.items.length > 0 && (
                <section aria-label="Lesson material" className="mt-4 space-y-4">
                  {lesson.items.map((item) => (
                    <div key={item.id} className="glass-card p-4 sm:p-5" data-testid="lesson-item" data-kind={item.kind}>
                      <p className="text-xs font-medium uppercase tracking-wide text-primary">
                        {CONTENT_KIND_LABELS[item.kind]}
                        {item.minutes ? ` · ${item.minutes} min` : ''}
                      </p>
                      <h2 className="mt-1 font-semibold text-foreground">{item.title}</h2>
                      {item.body && <RichText text={item.body} className="mt-2 text-sm leading-relaxed text-foreground" />}
                      {item.kind === 'exercise' && item.solution && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => toggleSolution(item.id)}
                            aria-expanded={shownSolutions.has(item.id)}
                            aria-controls={`solution-${item.id}`}
                            className="text-sm font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {shownSolutions.has(item.id) ? 'Hide the solution' : 'Show the solution'}
                          </button>
                          <div id={`solution-${item.id}`} hidden={!shownSolutions.has(item.id)} data-testid="solution">
                            <RichText
                              text={item.solution}
                              className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-foreground"
                            />
                          </div>
                        </div>
                      )}
                      {item.url && (item.kind === 'link' || item.kind === 'video') && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline"
                        >
                          {item.kind === 'video' ? <PlayCircle className="h-4 w-4" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
                          {item.kind === 'video' ? 'Watch the video' : 'Open the link'}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      )}
                      {item.source && <p className="mt-2 text-xs text-muted-foreground">Source: {item.source}</p>}
                    </div>
                  ))}
                </section>
              )}

              <section aria-labelledby={ids.check} className="glass-card mt-6 p-4 sm:p-5">
                <h2 id={ids.check} className="flex items-center gap-2 font-semibold text-foreground">
                  <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" /> Check yourself
                </h2>
                {lesson.questionCount > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pass a short quiz to mark “{lesson.concept.name}” as mastered. Your answers are checked on the server.
                    </p>
                    {quizOpen && learnerId ? (
                      <ConceptQuiz
                        learnerId={learnerId}
                        conceptId={conceptId}
                        conceptName={lesson.concept.name}
                        onFinished={(r) => void finishQuiz(r)}
                        onCancel={cancelQuiz}
                      />
                    ) : (
                      <button
                        ref={quizButtonRef}
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setQuizOpen(true);
                        }}
                        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Take the quick quiz
                      </button>
                    )}
                  </>
                ) : lesson.evidenceRequired ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Progress here comes from its own practice page
                    {lesson.concept.domain === 'japanese' && (
                      <>
                        {' '}—{' '}
                        <Link to="/japanese" className="font-medium text-primary underline">
                          open the Japanese page
                        </Link>
                      </>
                    )}
                    .
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This concept has no quiz yet, so you decide when you know it (shown as self-reported).
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void selfReport('got-it')}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        I&apos;ve got it
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void selfReport('started')}
                        className="inline-flex min-h-9 items-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-primary/10 disabled:opacity-60"
                      >
                        Still learning
                      </button>
                    </div>
                  </>
                )}
              </section>

              <nav aria-label="Next step" className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <Link to="/" className="text-sm font-medium text-primary hover:underline">
                  Back to Today
                </Link>
                {lesson.next && (
                  <Link
                    to="/learn/$conceptId"
                    params={{ conceptId: lesson.next.conceptId }}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-primary/10"
                  >
                    Next: {lesson.next.name} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </nav>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
