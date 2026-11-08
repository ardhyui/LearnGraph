/**
 * Read-only API keys (Roadmap M4: "antarmuka baca untuk LLM eksternal").
 * A key lets an external AI assistant read one account's learner context —
 * nothing else, and never write. Only a SHA-256 hash is stored; the key is
 * shown once when created and can be revoked at any time.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql, type ColumnType, type Generated, type Kysely } from 'kysely';

interface ApiKeyTable {
  id: string;
  owner_id: string;
  name: string;
  key_hash: string;
  prefix: string;
  scope: 'read';
  created_at: Generated<Date | string>;
  last_used_at: ColumnType<Date | string | null, never, unknown>;
  revoked_at: ColumnType<Date | string | null, never, unknown>;
}

interface ApiKeyDatabase {
  api_keys: ApiKeyTable;
}

type AnyDb = Kysely<any>;
const typed = (db: AnyDb) => db as Kysely<ApiKeyDatabase>;

export const API_KEY_PREFIX = 'lg_';
export const MAX_ACTIVE_KEYS = 10;
const KEY_PATTERN = /^lg_[A-Za-z0-9_-]{43}$/;

export interface ApiKeyInfo {
  id: string;
  name: string;
  /** First characters, to recognise a key in the list (never the whole key). */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** A key the editor can fix (shown as is, not logged as a server error). */
export class ApiKeyError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

/** Create a key: returns the secret once, plus what the list shows. */
export async function createApiKey(
  db: AnyDb,
  owner: string,
  name: string,
): Promise<ApiKeyInfo & { secret: string }> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!clean) throw new ApiKeyError('Give the key a name, e.g. the assistant that will use it.');
  const active = await typed(db)
    .selectFrom('api_keys')
    .select((eb) => eb.fn.countAll<number | string>().as('n'))
    .where('owner_id', '=', owner)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (Number(active?.n ?? 0) >= MAX_ACTIVE_KEYS) {
    throw new ApiKeyError(`You can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
  }
  const secret = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  const id = randomUUID();
  const prefix = secret.slice(0, 10);
  const row = await typed(db)
    .insertInto('api_keys')
    .values({ id, owner_id: owner, name: clean, key_hash: hashApiKey(secret), prefix, scope: 'read' })
    .returning(['created_at'])
    .executeTakeFirstOrThrow();
  return { id, name: clean, prefix, createdAt: iso(row.created_at)!, lastUsedAt: null, secret };
}

/** Active keys of the account (no hashes, no secrets). */
export async function listApiKeys(db: AnyDb, owner: string): Promise<ApiKeyInfo[]> {
  const rows = await typed(db)
    .selectFrom('api_keys')
    .select(['id', 'name', 'prefix', 'created_at', 'last_used_at'])
    .where('owner_id', '=', owner)
    .where('revoked_at', 'is', null)
    .orderBy('created_at')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: iso(r.created_at)!,
    lastUsedAt: iso(r.last_used_at),
  }));
}

/** Revoke one of the account's keys (a key of another account is never touched). */
export async function revokeApiKey(db: AnyDb, owner: string, id: string): Promise<boolean> {
  const done = await typed(db)
    .updateTable('api_keys')
    .set({ revoked_at: sql`now()` })
    .where('owner_id', '=', owner)
    .where('id', '=', id)
    .where('revoked_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return !!done;
}

/** The account a key belongs to, or `null` (malformed, unknown or revoked). */
export async function verifyApiKey(db: AnyDb, secret: string | null | undefined): Promise<string | null> {
  if (!secret || !KEY_PATTERN.test(secret)) return null;
  const row = await typed(db)
    .selectFrom('api_keys')
    .select(['id', 'owner_id', 'last_used_at'])
    .where('key_hash', '=', hashApiKey(secret))
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (!row) return null;
  // Record use at most once a minute (no write per request).
  const last = row.last_used_at ? Date.parse(String(row.last_used_at)) : 0;
  if (Date.now() - last > 60_000) {
    await typed(db).updateTable('api_keys').set({ last_used_at: sql`now()` }).where('id', '=', row.id).execute();
  }
  return row.owner_id;
}

/** `Authorization: Bearer lg_…` → the key, or `null`. */
export function bearerKey(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

/** Fixed-window limit per key and instance (60 requests a minute). */
const WINDOW_MS = 60_000;
const LIMIT = 60;
const windows = new Map<string, { start: number; count: number }>();

export function allowApiRequest(keyHash: string, now = Date.now()): boolean {
  const w = windows.get(keyHash);
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(keyHash, { start: now, count: 1 });
    if (windows.size > 10_000) windows.clear();
    return true;
  }
  w.count++;
  return w.count <= LIMIT;
}
