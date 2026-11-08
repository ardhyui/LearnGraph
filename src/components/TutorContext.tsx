/**
 * "Copy context for AI tutor" (Roadmap M4): prepares the brief LearnGraph
 * would give an AI tutor about this learner and concept, shows exactly what it
 * says, and copies it. Nothing is sent to any AI service from here.
 */
import { useId, useRef, useState, type FormEvent } from 'react';
import { Bot, Check, Copy, Loader2 } from 'lucide-react';
import { getTutorContext } from '@/server/tutor.functions';

type Context = Awaited<ReturnType<typeof getTutorContext>>;

export function TutorContext({ learnerId, conceptId }: { learnerId: string; conceptId?: string }) {
  const [query, setQuery] = useState('');
  const [context, setContext] = useState<Context | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ids = { heading: useId(), query: useId(), text: useId(), hint: useId() };

  const prepare = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setContext(await getTutorContext({ data: { learnerId, conceptId, query: query.trim() || undefined } }));
      requestAnimationFrame(() => textRef.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the context.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!context) return;
    const text = query.trim() ? `${context.text}\n\nQuestion: ${query.trim()}` : context.text;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard blocked: select the text so the learner can copy it by hand.
      textRef.current?.select();
      setError('Copying was blocked by the browser — the text is selected, press Ctrl+C (or ⌘C).');
    }
  };

  return (
    <section aria-labelledby={ids.heading} className="glass-card mt-6 p-4 sm:p-5" data-testid="tutor-context">
      <h2 id={ids.heading} className="flex items-center gap-2 font-semibold text-foreground">
        <Bot className="h-4 w-4 text-primary" aria-hidden="true" /> Ask an AI tutor
      </h2>
      <p id={ids.hint} className="mt-1 text-sm text-muted-foreground">
        LearnGraph prepares a short brief about what you know and where you struggle, for the AI tutor you already use.
        You see every word before copying it; nothing is sent from here.
      </p>
      <form onSubmit={prepare} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={ids.query} className="block text-sm font-medium text-foreground">
            Your question <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id={ids.query}
            value={query}
            maxLength={1000}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. I'm stuck moving terms to the other side"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/10 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Prepare the context
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {context && (
        <div className="mt-3">
          <label htmlFor={ids.text} className="block text-sm font-medium text-foreground">
            What the tutor will read <span className="font-normal text-muted-foreground">(about {context.tokens} tokens)</span>
          </label>
          <textarea
            id={ids.text}
            ref={textRef}
            readOnly
            value={context.text}
            rows={10}
            className="mt-1 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              Copy context for AI tutor
            </button>
            <span role="status" aria-live="polite" className="text-xs text-emerald-700 dark:text-emerald-400">
              {copied ? 'Copied. Paste it into your AI tutor, with your question.' : ''}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
