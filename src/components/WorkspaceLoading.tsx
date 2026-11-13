import { Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';

/**
 * Shown while the account's learning space is being prepared (first load in
 * this browser). It already renders the app frame — sidebar on desktop, top
 * bar + drawer on phones — so the first paint matches the page that replaces
 * it and the layout does not jump. Only the content area waits.
 */
export function WorkspaceLoading() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 min-w-0 w-full px-4 py-6 sm:px-8 sm:py-10 max-w-7xl mx-auto">
        <div className="mb-8" aria-hidden="true">
          <div className="mb-3 h-9 w-56 max-w-full rounded-lg bg-muted/60" />
          <div className="h-4 w-full max-w-md rounded bg-muted/40" />
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/40 p-6">
          <div
            className="flex min-h-[40vh] flex-col items-center justify-center text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="mb-3 h-8 w-8 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-muted-foreground">Getting your learning space ready…</p>
          </div>
        </div>
      </main>
    </div>
  );
}
