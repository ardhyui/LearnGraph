import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Compass, Home, RotateCcw } from 'lucide-react';
import { logError, userFacingMessage } from '@/lib/errors';

/**
 * Friendly full-page 404 / error screens. Deliberately self-contained (no
 * Sidebar, no DB context) so they still render when those are what failed or
 * when the visitor is signed out.
 */
function Shell({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="mb-6 text-sm font-semibold tracking-wide text-violet-500">LearnGraph</p>
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
          {icon}
        </div>
        {children}
      </div>
    </main>
  );
}

const btn =
  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2';

export function NotFoundPage() {
  return (
    <Shell icon={<Compass className="h-7 w-7" aria-hidden="true" />}>
      <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
      <p className="mt-2 text-muted-foreground">
        The page you are looking for doesn&apos;t exist or has moved.
      </p>
      <div className="mt-8 flex justify-center">
        <Link to="/" className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>
          <Home className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    </Shell>
  );
}

const loggedRefs = new WeakMap<object, string | null>();

export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  // Generated after mount so SSR and hydration markup match.
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => {
    // One log line + stable ref per error, even if the effect runs twice (dev).
    const key = typeof error === 'object' && error !== null ? error : null;
    let r = key ? loggedRefs.get(key) : undefined;
    if (r === undefined) {
      // null for expected errors (e.g. session expired): nothing logged, no ref shown.
      r = logError('ui', error, { path: router.state.location.pathname });
      if (key) loggedRefs.set(key, r);
    }
    setRef(r);
  }, [error, router]);

  const message = userFacingMessage(error, import.meta.env.DEV);
  const retry = () => {
    reset();
    void router.invalidate();
  };

  return (
    <Shell icon={<AlertTriangle className="h-7 w-7" aria-hidden="true" />}>
      <div role="alert">
        <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
      </div>
      {ref && (
        <p className="mt-3 text-xs text-muted-foreground">
          Error reference: <code className="font-mono">{ref}</code>
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={retry}
          className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          to="/"
          reloadDocument
          className={`${btn} border border-border text-foreground hover:bg-muted`}
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    </Shell>
  );
}
