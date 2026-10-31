import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Loader2, Network } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { cn } from '@/lib/utils';

const searchSchema = z.object({ redirect: z.string().optional() });

/** Only same-app relative paths are allowed as post-login targets. */
function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/';
  return target;
}

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: ({ context, search }) => {
    if (context.user) throw redirect({ href: safeRedirect(search.redirect) });
  },
  head: () => ({ meta: [{ title: 'Sign in - LearnGraph' }] }),
  component: SignInPage,
});

const credentialsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').optional(),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function SignInPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = credentialsSchema.safeParse({
      name: mode === 'sign-up' ? name : undefined,
      email,
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setPending(true);
    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({
              name: parsed.data.name ?? parsed.data.email,
              email: parsed.data.email,
              password: parsed.data.password,
            })
          : await authClient.signIn.email({
              email: parsed.data.email,
              password: parsed.data.password,
            });
      if (result.error) {
        setError(result.error.message ?? 'Something went wrong');
        return;
      }
      await router.invalidate();
      await router.navigate({ href: safeRedirect(search.redirect) });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">LearnGraph</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'sign-in' ? 'Sign in to your workspace' : 'Create your account'}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {mode === 'sign-up' && (
            <div>
              <label className="form-label" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className={cn('btn btn-primary w-full flex items-center justify-center gap-2')}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            className="text-foreground font-medium hover:underline"
            onClick={() => {
              setError(null);
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            }}
          >
            {mode === 'sign-in' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
