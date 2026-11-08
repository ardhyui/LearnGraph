/**
 * "Delete my account" (Roadmap M3): removes the account and all of its data
 * after the password is confirmed. Better Auth verifies the password and
 * deletes the user; every table of the account cascades from that row.
 */
import { useId, useState, type FormEvent } from 'react';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Loader2, Trash2 } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { LOCAL_OWNER_ID } from '@/lib/auth/local-access';

const CONFIRM_WORD = 'DELETE';

export function DeleteAccount() {
  const { user } = useRouteContext({ from: '__root__' });
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { heading: useId(), password: useId(), confirm: useId(), hint: useId() };

  // The local workstation owner has no password and is not deleted from here.
  if (!user || user.id === LOCAL_OWNER_ID) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (confirmText.trim() !== CONFIRM_WORD) return setError(`Type ${CONFIRM_WORD} to confirm.`);
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError(null);
    try {
      const { error: failed } = await authClient.deleteUser({ password });
      if (failed) {
        setError(failed.message || 'Could not delete your account. Please try again.');
        setBusy(false);
        return;
      }
      // Full reload: the session is gone, so the route guard shows sign-in.
      window.location.assign('/sign-in?deleted=1');
    } catch {
      setError('Could not delete your account. Please try again.');
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={ids.heading} className="mt-10 rounded-xl border border-red-500/30 p-4 sm:p-6" data-testid="delete-account">
      <h2 id={ids.heading} className="text-lg font-semibold text-foreground">
        Your account
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Deleting your account removes your sign-in and everything in this workspace: learners, concepts, progress,
        quiz results, lessons and the activity log. This cannot be undone.
      {' '}
        <Link to="/privacy" className="font-medium text-primary hover:underline">
          How your data is handled
        </Link>
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete my account…
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 max-w-sm space-y-3" noValidate>
          <div>
            <label htmlFor={ids.password} className="block text-sm font-medium text-foreground">
              Your password
            </label>
            <input
              id={ids.password}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div>
            <label htmlFor={ids.confirm} className="block text-sm font-medium text-foreground">
              Type {CONFIRM_WORD} to confirm
            </label>
            <input
              id={ids.confirm}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete my account and all data
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPassword('');
                setConfirmText('');
                setError(null);
              }}
              disabled={busy}
              className="inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-primary/10 hover:text-foreground disabled:opacity-60"
            >
              Keep my account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
