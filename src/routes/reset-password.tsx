/** Choose a new password from the emailed link (Roadmap M3). Public. */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { rateLimitMessage } from '@/lib/auth/rate-limit';
import { pageHead } from '@/lib/page-titles';

const searchSchema = z.object({ token: z.string().max(500).optional(), error: z.string().max(100).optional() });

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => pageHead('/reset-password'),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('The two passwords do not match');
    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: token ?? '' });
      if (result.error) {
        setError(result.error.status === 429 ? rateLimitMessage() : (result.error.message ?? 'Something went wrong'));
        return;
      }
      setDone(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <main className="glass-card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-foreground">Choose a new password</h1>
        {linkError || !token ? (
          <p role="alert" className="mt-3 text-sm text-foreground">
            This reset link is not valid any more. Links work once, for one hour.{' '}
            <Link to="/forgot-password" className="font-medium text-primary underline">
              Ask for a new one
            </Link>
            .
          </p>
        ) : done ? (
          <p role="status" className="mt-3 text-sm text-foreground">
            Your password is changed.{' '}
            <Link to="/sign-in" className="font-medium text-primary underline">
              Sign in
            </Link>{' '}
            with the new one. Other devices are signed out within a few minutes.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
            <div>
              <label className="form-label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="confirm-password">
                New password again
              </label>
              <input
                id="confirm-password"
                type="password"
                className="form-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn btn-primary flex w-full items-center justify-center gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Save the new password
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
