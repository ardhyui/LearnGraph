import { Loader2 } from 'lucide-react';

/** Shown while the account's learning space is being prepared (first load in this browser). */
export function WorkspaceLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center" role="status" aria-live="polite">
        <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">Getting your learning space ready…</p>
      </div>
    </div>
  );
}
