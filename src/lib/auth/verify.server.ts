import { getRequest } from '@tanstack/react-start/server';
import { auth } from './server';
import { permitsLocalUser } from './local-access';

/**
 * Server-side session resolution (server-only). Never trust a client-supplied
 * user id — only the result of this verification.
 */

/** Thrown when the caller has no valid session (`message === "Unauthorized"`). */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export type VerifiedUser = { id: string; email: string | null; name: string | null };

/** The signed-in user for the current request, or null. */
export async function getSessionUser(): Promise<VerifiedUser | null> {
  const request = getRequest();
  if (!request) return null;
  if (permitsLocalUser(request, process.env.JAPANESE_LOCAL_ORIGIN)) {
    const { getDb, ensureDbReady } = await import('../db');
    const { sql } = await import('kysely');
    await ensureDbReady();
    await sql`insert into "user" (id,name,email,"emailVerified") values ('local-japanese-owner','Ardhyui','local-japanese@localhost.invalid',false) on conflict (id) do nothing`.execute(
      getDb(),
    );
    return { id: 'local-japanese-owner', name: 'Ardhyui', email: null };
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

/** The verified user id, or throw `UnauthorizedError`. */
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
