/**
 * "Draft questions with Claude" on Admin → Quiz Questions (Roadmap M5).
 * Drafts are never saved by themselves: each one is approved (saved to the
 * bank), opened for editing, or discarded, and the decision is recorded.
 */
import { useEffect, useId, useState } from 'react';
import { Check, Loader2, Pencil, Sparkles, X } from 'lucide-react';
import { draftQuizQuestions, reviewQuestionDraft } from '@/server/ai.functions';
import { QUESTION_DRAFT_KINDS, type QuestionDraftKind } from '@/lib/ai/drafts';
import type { QuestionInput } from '@/lib/evidence/quiz';

const KEY_STORAGE = 'learngraph.anthropicKey';

export function AiQuestionDrafts({
  conceptId,
  onSaved,
  onEdit,
}: {
  conceptId: string;
  /** A draft was approved and saved: reload the bank. */
  onSaved: () => void;
  /** Open a draft in the question form; the page records it as "edited" when saved. */
  onEdit: (draft: QuestionInput) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [kind, setKind] = useState<QuestionDraftKind>('quick-check');
  const [drafts, setDrafts] = useState<QuestionInput[] | null>(null);
  const [rejected, setRejected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { key: useId(), kind: useId() };

  useEffect(() => {
    try {
      setApiKey(window.localStorage.getItem(KEY_STORAGE) ?? '');
    } catch {
      // Storage blocked.
    }
  }, []);

  useEffect(() => {
    setDrafts(null);
    setError(null);
  }, [conceptId]);

  const draft = async () => {
    if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(apiKey.trim())) {
      setError('Enter an Anthropic API key (it starts with sk-ant-).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await draftQuizQuestions({ data: { conceptId, kind, count: 4, apiKey: apiKey.trim() } });
      setDrafts(result.valid);
      setRejected(result.rejected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft questions.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (d: QuestionInput, decision: 'approved' | 'discarded') => {
    try {
      await reviewQuestionDraft({ data: { draft: d, decision } });
      setDrafts((prev) => prev?.filter((x) => x !== d) ?? null);
      if (decision === 'approved') onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision.');
    }
  };

  const edit = (d: QuestionInput) => {
    setDrafts((prev) => prev?.filter((x) => x !== d) ?? null);
    onEdit(d);
  };

  return (
    <section className="glass-card mb-6 p-4 sm:p-5" aria-label="Draft questions with Claude" data-testid="ai-question-drafts">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Draft questions with Claude
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Uses your own Anthropic API key. Nothing is added to the bank until you approve it.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
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
        <div>
          <label htmlFor={ids.kind} className="block text-xs font-medium text-foreground">
            Kind
          </label>
          <select
            id={ids.kind}
            value={kind}
            onChange={(e) => setKind(e.target.value as QuestionDraftKind)}
            className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {Object.entries(QUESTION_DRAFT_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void draft()}
          disabled={busy}
          className="btn btn-primary flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Draft 4 questions
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {drafts && (
        <div className="mt-3 space-y-2" aria-live="polite">
          {drafts.length === 0 && <p className="text-sm text-muted-foreground">No drafts left to review.</p>}
          {rejected > 0 && <p className="text-xs text-muted-foreground">{rejected} draft(s) were left out because they were not valid.</p>}
          {drafts.map((d, i) => (
            <div key={`${d.prompt}-${i}`} className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
              <p className="font-medium text-foreground">{d.prompt}</p>
              <p className="mt-1 text-muted-foreground">
                {d.options.map((o) => (o === d.answer ? `✓ ${o}` : o)).join(' · ')}
              </p>
              {d.explanation && <p className="mt-1 text-xs text-muted-foreground">{d.explanation}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void decide(d, 'approved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve
                </button>
                <button type="button" onClick={() => edit(d)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-primary/10">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit first
                </button>
                <button type="button" onClick={() => void decide(d, 'discarded')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-700">
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
