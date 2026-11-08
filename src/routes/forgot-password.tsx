/** "Forgot your password?" (Roadmap M3): request a reset link by email. Public. */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { rateLimitMessage } from '@/lib/auth/rate-limit';
import { pageHead } from '@/lib/page-titles';
import { getAuthFeatures } from '@/server/session.functions';

export const Route = createFileRoute('/forgot-password')({
  head: () => pageHead('/forgot-password'),
  loader: () => getAuthFeatures(),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const features = Route.useLoaderData();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = z.email().safeParse(email.trim());
    if (!parsed.success) return setError('Enter a valid email');
    setPending(true);
    try {
      const result = await authClient.requestPasswordReset({ email: parsed.data, redirectTo: '/reset-password' });
      if (result.error) {
        setError(result.error.status === 429 ? rateLimitMessage() : (result.error.message ?? 'Something went wrong'));
        return;
      }
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <main className="glass-card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
        {!features.passwordReset ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Password reset needs email, which is not set up on this server yet. Ask whoever runs this LearnGraph to
            help.
          </p>
        ) : sent ? (
          <p role="status" className="mt-3 text-sm text-foreground">
            If an account uses that email, a reset link is on its way. It works for one hour.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">We will email you a link to choose a new password.</p>
            <div>
              <label className="form-label" htmlFor="reset-email">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn btn-primary flex w-full items-center justify-center gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Send the reset link
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link to="/sign-in" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
