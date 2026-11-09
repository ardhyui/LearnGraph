/**
 * Admin → Lesson Content (Roadmap M2): explanations, worked examples,
 * practice exercises, links and videos per concept, shown on its lesson page.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, FileText, Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { pageHead } from '@/lib/page-titles';
import { Sidebar } from '@/components/Sidebar';
import { RichText } from '@/components/RichText';
import { useConcepts, useDB } from '@/lib/DBContext';
import { cn } from '@/lib/utils';
import { CONTENT_KIND_LABELS, CONTENT_KINDS, type ContentItem, type ContentKind } from '@/lib/content/content';
import { deleteLessonContent, listLessonContent, saveLessonContent } from '@/server/content.functions';
import { rememberRowFocus, restoreRowFocus } from '@/lib/focus-after-delete';
import { WorkspaceLoading } from '@/components/WorkspaceLoading';

export const Route = createFileRoute('/admin/content')({
  head: () => pageHead('/admin/content'),
  component: ContentPage,
});

interface Draft {
  id?: string;
  kind: ContentKind;
  title: string;
  body: string;
  solution: string;
  url: string;
  minutes: string;
  source: string;
  position: string;
}

const EMPTY: Draft = { kind: 'text', title: '', body: '', solution: '', url: '', minutes: '', source: '', position: '' };

const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function ContentPage() {
  const { isLoading: dbLoading, error: dbError } = useDB();
  const { concepts, loading: conceptsLoading } = useConcepts();
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [conceptId, setConceptId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const ids = {
    concept: useId(),
    kind: useId(),
    title: useId(),
    body: useId(),
    solution: useId(),
    url: useId(),
    minutes: useId(),
    source: useId(),
    position: useId(),
    form: useId(),
  };

  const load = useCallback(async () => {
    try {
      setItems(await listLessonContent({ data: {} }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the lesson content.');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of items ?? []) map.set(c.conceptId, (map.get(c.conceptId) ?? 0) + 1);
    return map;
  }, [items]);

  useEffect(() => {
    if (conceptId || concepts.length === 0 || items === null) return;
    // Start on the first concept that has a lesson, else the first concept.
    setConceptId(concepts.find((c) => counts.has(c.conceptId))?.conceptId ?? concepts[0].conceptId);
  }, [conceptId, concepts, items, counts]);

  const concept = concepts.find((c) => c.conceptId === conceptId);
  const list = (items ?? []).filter((c) => c.conceptId === conceptId);

  const openForm = (next: Draft) => {
    setDraft(next);
    setError(null);
    setNotice(null);
    requestAnimationFrame(() => formHeadingRef.current?.focus());
  };

  const edit = (c: ContentItem) =>
    openForm({
      id: c.id,
      kind: c.kind,
      title: c.title,
      body: c.body,
      solution: c.solution,
      url: c.url ?? '',
      minutes: c.minutes ? String(c.minutes) : '',
      source: c.source,
      position: String(c.position),
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !conceptId || saving) return;
    const isLink = draft.kind === 'link' || draft.kind === 'video';
    if (!draft.title.trim()) return setError('Give the item a title.');
    if (isLink && !/^https:\/\//.test(draft.url.trim())) return setError('Links and videos need an https:// address.');
    if (!isLink && !draft.body.trim()) return setError('Write the text of this item.');
    const minutes = draft.minutes.trim() ? Number(draft.minutes) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) {
      return setError('Minutes must be a whole number from 1 to 600.');
    }
    setSaving(true);
    setError(null);
    try {
      await saveLessonContent({
        data: {
          id: draft.id,
          conceptId,
          kind: draft.kind,
          title: draft.title.trim(),
          body: draft.body,
          solution: draft.kind === 'exercise' ? draft.solution : '',
          url: isLink ? draft.url.trim() : null,
          minutes,
          language: 'en',
          source: draft.source.trim(),
          position: draft.position.trim() ? Math.max(0, Math.floor(Number(draft.position)) || 0) : list.length,
        },
      });
      setNotice(draft.id ? 'Item updated.' : 'Item added.');
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the item.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: ContentItem, button?: HTMLElement) => {
    if (!confirm(`Delete “${c.title}”?`)) return;
    setError(null);
    const focus = rememberRowFocus(button);
    try {
      await deleteLessonContent({ data: { id: c.id } });
      setNotice('Item deleted.');
      if (draft?.id === c.id) setDraft(null);
      await load();
      restoreRowFocus(focus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the item.');
    }
  };

  if (dbLoading) {
    return <WorkspaceLoading />;
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
              <div className="rounded-xl bg-emerald-500/10 p-2.5">
                <FileText className="h-6 w-6 text-emerald-500" aria-hidden="true" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Lesson Content</h1>
            </div>
            <p className="text-muted-foreground">
              What learners read and practise on a concept’s lesson page. Text supports blank lines between paragraphs,
              “- ” for bullet points, **bold** and `code`. Links must start with https://.
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
              <Link
                to="/learn/$conceptId"
                params={{ conceptId: concept.conceptId }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open the lesson page
              </Link>
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

          {items === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading lesson content…
            </p>
          ) : (
            concept && (
              <>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {concept.name}: {list.length} {list.length === 1 ? 'item' : 'items'}
                  </h2>
                  {!draft && (
                    <button type="button" onClick={() => openForm({ ...EMPTY })} className="btn btn-primary flex items-center gap-2">
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add item
                    </button>
                  )}
                </div>

                {draft && (
                  <form onSubmit={submit} aria-labelledby={ids.form} className="glass-card mb-6 space-y-4 p-4 sm:p-6" noValidate>
                    <h3 id={ids.form} ref={formHeadingRef} tabIndex={-1} className="font-semibold text-foreground focus:outline-none">
                      {draft.id ? 'Edit item' : 'New item'}
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor={ids.kind} className="mb-1 block text-sm font-medium text-foreground">
                          Type
                        </label>
                        <select
                          id={ids.kind}
                          value={draft.kind}
                          onChange={(e) => setDraft({ ...draft, kind: e.target.value as ContentKind })}
                          className={field}
                        >
                          {CONTENT_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {CONTENT_KIND_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={ids.title} className="mb-1 block text-sm font-medium text-foreground">
                          Title
                        </label>
                        <input id={ids.title} value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={field} />
                      </div>
                    </div>
                    {(draft.kind === 'link' || draft.kind === 'video') && (
                      <div>
                        <label htmlFor={ids.url} className="mb-1 block text-sm font-medium text-foreground">
                          Address (https://…)
                        </label>
                        <input id={ids.url} type="url" value={draft.url} maxLength={2000} onChange={(e) => setDraft({ ...draft, url: e.target.value })} className={field} />
                      </div>
                    )}
                    <div>
                      <label htmlFor={ids.body} className="mb-1 block text-sm font-medium text-foreground">
                        {draft.kind === 'link' || draft.kind === 'video' ? 'Note (optional)' : draft.kind === 'exercise' ? 'Task' : 'Text'}
                      </label>
                      <textarea id={ids.body} value={draft.body} rows={6} maxLength={20000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className={field} />
                    </div>
                    {draft.kind === 'exercise' && (
                      <div>
                        <label htmlFor={ids.solution} className="mb-1 block text-sm font-medium text-foreground">
                          Solution <span className="font-normal text-muted-foreground">(shown when the learner asks)</span>
                        </label>
                        <textarea id={ids.solution} value={draft.solution} rows={4} maxLength={20000} onChange={(e) => setDraft({ ...draft, solution: e.target.value })} className={field} />
                      </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label htmlFor={ids.minutes} className="mb-1 block text-sm font-medium text-foreground">
                          Minutes
                        </label>
                        <input id={ids.minutes} inputMode="numeric" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: e.target.value })} className={field} />
                      </div>
                      <div>
                        <label htmlFor={ids.position} className="mb-1 block text-sm font-medium text-foreground">
                          Order
                        </label>
                        <input id={ids.position} inputMode="numeric" value={draft.position} placeholder={String(list.length)} onChange={(e) => setDraft({ ...draft, position: e.target.value })} className={field} />
                      </div>
                      <div>
                        <label htmlFor={ids.source} className="mb-1 block text-sm font-medium text-foreground">
                          Source
                        </label>
                        <input id={ids.source} value={draft.source} maxLength={500} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={field} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={saving} className="btn btn-primary flex items-center gap-2 disabled:opacity-60">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                        Save item
                      </button>
                      <button type="button" onClick={() => setDraft(null)} disabled={saving} className="btn btn-secondary">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No lesson material yet. The lesson page shows the concept’s description and its quiz until you add some.
                  </p>
                ) : (
                  <ol className="space-y-3" aria-label={`Lesson content for ${concept.name}`}>
                    {list.map((c) => (
                      <li key={c.id} className="glass-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-primary">
                              {CONTENT_KIND_LABELS[c.kind]}
                              {c.minutes ? ` · ${c.minutes} min` : ''} · order {c.position}
                            </p>
                            <p className="font-medium text-foreground">{c.title}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => edit(c)}
                              aria-label={`Edit ${c.title}`}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => remove(c, e.currentTarget)}
                              aria-label={`Delete ${c.title}`}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        {c.body && <RichText text={c.body} className="mt-2 line-clamp-4 text-sm text-muted-foreground" />}
                        {c.url && <p className="mt-1 break-all text-xs text-muted-foreground">{c.url}</p>}
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
