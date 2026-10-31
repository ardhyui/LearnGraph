import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client (browser). Talks to this app's own `/api/auth/*`, so the
 * session cookie stays same-origin.
 */
export const authClient = createAuthClient();

export const { useSession, signIn, signUp, signOut } = authClient;
