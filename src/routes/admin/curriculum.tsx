/**
 * Admin → Curriculum Import (Roadmap M5): describe a course, Claude drafts the
 * concepts and prerequisites (with your own Anthropic API key), you review
 * every concept and prerequisite, and the kept ones are saved in one go.
 * Existing concepts are never overwritten by a draft.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, Save, Sparkles, Wand2 } from 'lucide-react';
import { pageHead } from '@/lib/page-titles';
import { Sidebar } from '@/components/Sidebar';
import { applyCurriculumDraft, draftCurriculumWithAI, getAiDraftSettings, setAiDraftSettings } from '@/server/ai.functions';
import type { CurriculumPlan } from '@/lib/ai/drafts';
import { DocxError, docxText } from '@/lib/ai/docx-text';

export const Route = createFileRoute('/admin/curriculum')({
  head: () => pageHead('/admin/curriculum'),
  component: CurriculumPage,
});

const KEY_STORAGE = 'learngraph.anthropicKey';
const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function CurriculumPage() {
  const [ai, setAi] = useState<Awaited<ReturnType<typeof getAiDraftSettings>> | null>(null);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pdf, setPdf] = useState<{ name: string; base64: string } | null>(null);
  const [plan, setPlan] = useState<CurriculumPlan | null>(null);
  const [keepConcepts, setKeepConcepts] = useState<Set<string>>(new Set());
  const [keepEdges, setKeepEdges] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = { subject: useId(), text: useId(), key: useId(), pdf: useId() };

  // A PDF is sent as is; a Word file is read here into the description box,
  // so the person sees (and can edit) exactly what will be sent.
  const pickFile = async (file: File | undefined) => {
    setError(null);
    setNotice(null);
    setPdf(null);
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setError('The file is too large (max 8 MB).');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(file.name);
    if (!isPdf && !isDocx) return setError('Choose a PDF or Word (.docx) file.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isDocx) {
      try {
        const read = await docxText(bytes);
        if (!read) return setError('That Word file has no text to read.');
        const cut = read.length > 20000;
        setText(cut ? read.slice(0, 20000) : read);
        setNotice(
          `Read the text of ${file.name} into the description${cut ? ' (only the first 20,000 characters fit)' : ''}. Check it, then draft.`,
        );
      } catch (err) {
        setError(err instanceof DocxError ? err.message : 'Could not read that Word file.');
      }
      return;
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    setPdf({ name: file.name, base64: btoa(binary) });
  };

  const loadAi = useCallback(async () => {
    try {
      setAi(await getAiDraftSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the settings.');
    }
  }, []);

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

  useEffect(() => {
    void loadAi();
    try {
      setApiKey(window.localStorage.getItem(KEY_STORAGE) ?? '');
    } catch {
      // Storage blocked.
    }
  }, [loadAi]);

  const edgeKey = (e: { from: string; to: string }) => `${e.from}→${e.to}`;

  const draft = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(apiKey.trim())) return setError('Enter an Anthropic API key (it starts with sk-ant-).');
    if (!subject.trim()) return setError('Name the subject.');
    if (text.trim().length < 20 && !pdf) return setError('Paste a longer course description or attach a PDF.');
    setBusy(true);
    setError(null);
    setNotice(null);
    setPlan(null);
    try {
      const result = await draftCurriculumWithAI({ data: { subject, text, apiKey: apiKey.trim(), pdfBase64: pdf?.base64 } });
      setPlan(result);
      setKeepConcepts(new Set(result.concepts.filter((c) => !c.exists).map((c) => c.conceptId)));
      setKeepEdges(new Set(result.edges.map(edgeKey)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft the curriculum.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!plan || busy) return;
    setBusy(true);
    setError(null);
    try {
      const keptIds = new Set([...keepConcepts, ...plan.concepts.filter((c) => c.exists).map((c) => c.conceptId)]);
      const kept = {
        concepts: plan.concepts.filter((c) => keepConcepts.has(c.conceptId)),
        // A prerequisite only stays if both ends stay.
        edges: plan.edges.filter((e) => keepEdges.has(edgeKey(e)) && keptIds.has(e.from) && keptIds.has(e.to)),
      };
      const strip = (p: { concepts: CurriculumPlan['concepts']; edges: CurriculumPlan['edges'] }) => ({
        concepts: p.concepts.map(({ conceptId, name, description, difficulty, bloomLevel }) => ({ conceptId, name, description, difficulty, bloomLevel })),
        edges: p.edges,
      });
      const result = await applyCurriculumDraft({ data: { subject, proposed: strip(plan), kept: strip(kept) } });
      setNotice(`Saved ${result.concepts} concepts and ${result.edges} prerequisites to “${subject}”.`);
      setPlan(null);
      await loadAi();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (set: Set<string>, value: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/10 p-2.5">
                <Wand2 className="h-6 w-6 text-purple-500" aria-hidden="true" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Curriculum Import</h1>
            </div>
            <p className="text-muted-foreground">
              Describe a course; Claude drafts its concepts and prerequisites. You review every one, and only what you keep is
              saved. Existing concepts are never changed.
            </p>
          </div>

          {ai && (
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" data-testid="ai-drafts-setting">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={ai.enabled}
                  onChange={(e) => void toggleAi(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Let Claude draft curricula and questions (with your own API key)
              </label>
              {ai.curriculum.proposed > 0 && ai.curriculum.rate !== null && (
                <span>
                  Prerequisites kept so far: {ai.curriculum.accepted} of {ai.curriculum.proposed} ({Math.round(ai.curriculum.rate * 100)}%)
                </span>
              )}
            </div>
          )}

          <p role="status" aria-live="polite" className={notice ? 'mb-4 text-sm text-emerald-700 dark:text-emerald-400' : 'sr-only'}>
            {notice}
          </p>
          {error && (
            <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {ai?.enabled ? (
            <form onSubmit={draft} className="glass-card space-y-4 p-4 sm:p-6" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={ids.subject} className="mb-1 block text-sm font-medium text-foreground">
                    Subject
                  </label>
                  <input id={ids.subject} value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Statistics" className={field} />
                </div>
                <div>
                  <label htmlFor={ids.key} className="mb-1 block text-sm font-medium text-foreground">
                    Anthropic API key
                  </label>
                  <input id={ids.key} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" className={`${field} font-mono`} />
                </div>
              </div>
              <div>
                <label htmlFor={ids.text} className="mb-1 block text-sm font-medium text-foreground">
                  Course description or syllabus
                </label>
                <textarea id={ids.text} value={text} rows={8} maxLength={20000} onChange={(e) => setText(e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor={ids.pdf} className="mb-1 block text-sm font-medium text-foreground">
                  Or attach the course as a PDF or Word file <span className="font-normal text-muted-foreground">(optional, max 8 MB)</span>
                </label>
                <input
                  id={ids.pdf}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => void pickFile(e.target.files?.[0])}
                  className="text-sm text-foreground"
                />
                {pdf && <p className="mt-1 text-xs text-muted-foreground">Attached: {pdf.name}</p>}
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                Draft with Claude
              </button>
            </form>
          ) : (
            ai && <p className="text-sm text-muted-foreground">Turn on “Let Claude draft …” above to describe a course.</p>
          )}

          {plan && (
            <section className="mt-6 space-y-4" aria-label="Review the draft" data-testid="curriculum-draft">
              <h2 className="text-lg font-semibold text-foreground">Review the draft</h2>
              {plan.problems.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-400">
                  {plan.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <fieldset className="glass-card p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">Concepts ({plan.concepts.length})</legend>
                <ul className="space-y-2 text-sm">
                  {plan.concepts.map((c) => (
                    <li key={c.conceptId}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          disabled={c.exists}
                          checked={c.exists || keepConcepts.has(c.conceptId)}
                          onChange={(e) => setKeepConcepts((s) => toggle(s, c.conceptId, e.target.checked))}
                          className="mt-1 h-4 w-4 accent-primary"
                        />
                        <span>
                          <span className="font-medium text-foreground">{c.name}</span>{' '}
                          <span className="text-xs text-muted-foreground">
                            difficulty {c.difficulty}/10 · {c.bloomLevel}
                            {c.exists ? ' · already in your workspace (kept as it is)' : ''}
                          </span>
                          {c.description && <span className="block text-xs text-muted-foreground">{c.description}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              <fieldset className="glass-card p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">Prerequisites ({plan.edges.length})</legend>
                <ul className="space-y-2 text-sm">
                  {plan.edges.map((e) => {
                    const name = (id: string) => plan.concepts.find((c) => c.conceptId === id)?.name ?? id;
                    return (
                      <li key={edgeKey(e)}>
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={keepEdges.has(edgeKey(e))}
                            onChange={(ev) => setKeepEdges((s) => toggle(s, edgeKey(e), ev.target.checked))}
                            className="mt-1 h-4 w-4 accent-primary"
                          />
                          <span>
                            <span className="font-medium text-foreground">
                              {name(e.from)} → {name(e.to)}
                            </span>
                            {e.reason && <span className="block text-xs text-muted-foreground">{e.reason}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
              <button type="button" onClick={() => void save()} disabled={busy} className="btn btn-primary flex items-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Save what I kept
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
