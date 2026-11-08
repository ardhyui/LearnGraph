/**
 * "Copy context for AI tutor" (Roadmap M4): prepares the brief LearnGraph
 * would give an AI tutor about this learner and concept, shows exactly what it
 * says, and copies it. Nothing is sent to any AI service from here.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Bot, Check, Copy, Loader2, MessageSquare } from 'lucide-react';
import { getTutorContext } from '@/server/tutor.functions';
import { askTutorChat, rateTutorComparison } from '@/server/tutor-chat.functions';

type ChatResult = Awaited<ReturnType<typeof askTutorChat>>;

/** Remembered only if the learner ticks the box (per browser; never sent to our server except per request). */
const KEY_STORAGE = 'learngraph.anthropicKey';
function readKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}
function writeKey(value: string | null) {
  try {
    if (value) window.localStorage.setItem(KEY_STORAGE, value);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Storage blocked: the key is simply not remembered.
  }
}

type Context = Awaited<ReturnType<typeof getTutorContext>>;

export function TutorContext({ learnerId, conceptId }: { learnerId: string; conceptId?: string }) {
  const [query, setQuery] = useState('');
  const [context, setContext] = useState<Context | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ids = { heading: useId(), query: useId(), text: useId(), hint: useId(), key: useId(), chat: useId() };
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [compare, setCompare] = useState(false);
  const [chat, setChat] = useState<ChatResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [rated, setRated] = useState<string | null>(null);

  useEffect(() => {
    const saved = readKey();
    if (saved) {
      setApiKey(saved);
      setRememberKey(true);
    }
  }, []);

  const ask = async () => {
    if (asking) return;
    if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(apiKey.trim())) {
      setChatError('Enter an Anthropic API key (it starts with sk-ant-).');
      return;
    }
    if (!query.trim()) {
      setChatError('Write your question in the box above first.');
      return;
    }
    setAsking(true);
    setChatError(null);
    setChat(null);
    setRated(null);
    writeKey(rememberKey ? apiKey.trim() : null);
    try {
      setChat(await askTutorChat({ data: { learnerId, conceptId, question: query, apiKey: apiKey.trim(), compare } }));
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Could not get an answer.');
    } finally {
      setAsking(false);
    }
  };

  const rate = async (preferred: 'context' | 'plain' | 'same') => {
    try {
      await rateTutorComparison({ data: { learnerId, conceptId, preferred } });
      setRated(
        preferred === 'same'
          ? 'Thanks — noted that both helped about the same.'
          : `Thanks — you preferred the answer that ${preferred === 'context' ? 'knew' : 'did not know'} your progress.`,
      );
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Could not save your rating.');
    }
  };

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

      <div className="mt-5 border-t border-border/60 pt-4" data-testid="tutor-chat">
        <h3 id={ids.chat} className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" /> Or ask Claude here, with your own API key
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The question above and the brief go to Anthropic, billed to your key. LearnGraph uses the key for this request
          only and does not store it; tick the box to keep it in this browser.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor={ids.key} className="block text-xs font-medium text-foreground">
              Anthropic API key
            </label>
            <input
              id={ids.key}
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => void ask()}
            disabled={asking}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {asking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Ask Claude
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            Remember the key in this browser
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            Compare with an answer that doesn’t know me
          </label>
        </div>
        {chatError && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {chatError}
          </p>
        )}
        {chat && (
          <div className="mt-3 space-y-3" aria-live="polite">
            {chat.answers.map((a, i) => (
              <div key={i} className="rounded-lg border border-border/60 bg-background/60 p-3" data-testid="tutor-answer">
                {chat.answers.length > 1 && <p className="text-xs font-semibold text-foreground">Answer {i + 1}</p>}
                <p className="whitespace-pre-wrap text-sm text-foreground">{a.text}</p>
              </div>
            ))}
            {chat.answers.length > 1 &&
              (rated ? (
                <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
                  {rated}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Which answer helped more?">
                  <span className="text-muted-foreground">Which helped more?</span>
                  {chat.answers.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => void rate(a.kind)}
                      className="rounded-lg border border-border px-2 py-1 font-medium hover:bg-primary/10"
                    >
                      Answer {i + 1}
                    </button>
                  ))}
                  <button type="button" onClick={() => void rate('same')} className="rounded-lg border border-border px-2 py-1 font-medium hover:bg-primary/10">
                    About the same
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
