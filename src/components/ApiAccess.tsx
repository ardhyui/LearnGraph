/**
 * "Connect an AI assistant" on My Profile (Roadmap M4): read-only API keys
 * that let an external assistant fetch the tutor brief. A key is shown once,
 * can only read, and can be revoked at any time.
 */
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { createMyApiKey, listMyApiKeys, revokeMyApiKey } from '@/server/api-keys.functions';

type KeyInfo = Awaited<ReturnType<typeof listMyApiKeys>>[number];

export function ApiAccess() {
  const [keys, setKeys] = useState<KeyInfo[] | null>(null);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { heading: useId(), name: useId(), secret: useId() };
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const load = useCallback(async () => {
    try {
      setKeys(await listMyApiKeys());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your keys.');
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const created = await createMyApiKey({ data: { name } });
      setSecret(created.secret);
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the key.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: KeyInfo) => {
    if (!window.confirm(`Revoke “${key.name}”? Anything using it stops working.`)) return;
    setError(null);
    try {
      await revokeMyApiKey({ data: { id: key.id } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the key.');
    }
  };

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setError('Copying was blocked by the browser — select the key and copy it by hand.');
    }
  };

  return (
    <section aria-labelledby={ids.heading} className="mt-10 rounded-xl border border-border p-4 sm:p-6" data-testid="api-access">
      <h2 id={ids.heading} className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" /> Connect an AI assistant
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A key lets an assistant or tool you trust <strong>read</strong> the same brief as “Ask an AI tutor”: what you
        know, where you struggle and what is next. It can never change anything, and you can revoke it at any time.
      {' '}
        <Link to="/privacy" className="font-medium text-primary hover:underline">
          How your data is handled
        </Link>
      </p>

      <form onSubmit={create} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={ids.name} className="block text-sm font-medium text-foreground">
            Key name
          </label>
          <input
            id={ids.name}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My study assistant"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Create a read-only key
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {secret && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3" data-testid="new-api-key">
          <label htmlFor={ids.secret} className="block text-sm font-medium text-foreground">
            Your new key — copy it now, it is not shown again
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={ids.secret}
              readOnly
              value={secret}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
            />
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium hover:bg-primary/10"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Use it like this (the assistant sends it with every request):</p>
          <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-xs text-foreground">
            {`curl -H "Authorization: Bearer ${secret.slice(0, 10)}…" \\\n  "${origin}/api/v1/context?concept=Fractions&q=explain+adding+fractions"`}
          </pre>
        </div>
      )}

      {keys && keys.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm" aria-label="Your API keys">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <span>
                <span className="font-medium text-foreground">{k.name}</span>{' '}
                <code className="text-xs text-muted-foreground">{k.prefix}…</code>
                <span className="block text-xs text-muted-foreground">
                  Created {new Date(k.createdAt).toLocaleDateString()} ·{' '}
                  {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'not used yet'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void revoke(k)}
                className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-500/10 dark:text-red-400"
              >
                Revoke<span className="sr-only"> {k.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
