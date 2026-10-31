/**
 * Error classification + consistent server error logging (isomorphic, no deps).
 *
 * - "Expected" errors (auth 401/403, rate limit 429, input validation) are part
 *   of normal operation and are not logged as server errors.
 * - Unexpected errors are logged as ONE JSON line with a stable shape so they
 *   are easy to grep in Vercel/`vite dev` logs:
 *   `{"level":"error","scope":"serverFn","ref":"…","name":"…","message":"…",…}`
 * - User-facing text never includes raw error messages in production (they can
 *   contain SQL or internals); a short `ref` lets support match UI ↔ log line.
 */

export const GENERIC_SERVER_ERROR = 'Something went wrong on our side. Please try again.';

export type ErrorInfo = { name: string; message: string; status?: number; stack?: string };

/** Normalize anything thrown into `{ name, message, status?, stack? }`. */
export function describeError(err: unknown): ErrorInfo {
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status;
    return {
      name: err.name || 'Error',
      message: err.message,
      ...(typeof status === 'number' ? { status } : {}),
      ...(err.stack ? { stack: err.stack } : {}),
    };
  }
  if (typeof err === 'string') return { name: 'Error', message: err };
  if (err && typeof err === 'object') {
    const o = err as { name?: unknown; message?: unknown; status?: unknown };
    return {
      name: typeof o.name === 'string' ? o.name : 'Error',
      message: typeof o.message === 'string' ? o.message : safeStringify(err),
      ...(typeof o.status === 'number' ? { status: o.status } : {}),
    };
  }
  return { name: 'Error', message: String(err) };
}

const EXPECTED_NAMES = new Set(['UnauthorizedError', 'CrossSiteRequestError', 'ZodError']);

/** True for errors that are normal control flow, not bugs (4xx, validation). */
export function isExpectedError(err: unknown): boolean {
  const { name, status } = describeError(err);
  if (EXPECTED_NAMES.has(name)) return true;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** Short random reference shown to the user and written to the log. */
export function errorRef(): string {
  return Math.random().toString(36).slice(2, 10);
}

const MAX_MESSAGE = 500;
const MAX_STACK_LINES = 8;

/** Build the single-line JSON log record for an unexpected error. */
export function formatErrorLog(
  scope: string,
  err: unknown,
  extra: Record<string, string | number | boolean | null | undefined> = {},
  now: Date = new Date(),
): string {
  const info = describeError(err);
  const record: Record<string, unknown> = {
    level: 'error',
    time: now.toISOString(),
    scope,
    ...extra,
    name: info.name,
    message: truncate(info.message, MAX_MESSAGE),
  };
  if (info.status !== undefined) record.status = info.status;
  if (info.stack) record.stack = info.stack.split('\n').slice(0, MAX_STACK_LINES).join('\n');
  return safeStringify(record);
}

const REF_RE = /^[a-z0-9]{1,32}$/i;
const MESSAGE_REF_RE = /\(ref ([a-z0-9]{1,32})\)$/i;

/**
 * The server-assigned ref carried by a sanitized error (see `toClientError`).
 * Production TanStack Start only serializes an error's `message` to the
 * browser, so the ref is also read back from the message suffix.
 */
export function refOf(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const { ref, message } = err as { ref?: unknown; message?: unknown };
  if (typeof ref === 'string' && REF_RE.test(ref)) return ref;
  if (typeof message === 'string' && message.startsWith(GENERIC_SERVER_ERROR)) {
    return MESSAGE_REF_RE.exec(message)?.[1] ?? null;
  }
  return null;
}

/** Log an unexpected error (no-op for expected ones). Returns the ref used, if logged. */
export function logError(
  scope: string,
  err: unknown,
  extra: Record<string, string | number | boolean | null | undefined> = {},
): string | null {
  if (isExpectedError(err)) return null;
  // Reuse the server ref when the client logs an already-sanitized error, so
  // the ref on the error page matches the server log line.
  const ref = typeof extra.ref === 'string' ? extra.ref : (refOf(err) ?? errorRef());
  console.error(formatErrorLog(scope, err, { ...extra, ref }));
  return ref;
}

/**
 * What the browser receives instead of an unexpected server error in
 * production: a generic message + the log ref, status 500, and no stack.
 * (TanStack Start serializes thrown errors with seroval, which ships `message`,
 * `stack` and every own property — e.g. Postgres `code`/`detail`/`query`.)
 */
export class InternalServerError extends Error {
  readonly status = 500;
  readonly ref: string;
  constructor(ref: string) {
    super(`${GENERIC_SERVER_ERROR} (ref ${ref})`);
    this.name = 'InternalServerError';
    this.ref = ref;
    this.stack = `${this.name}: ${this.message}`;
  }
}

/**
 * Turn an error thrown by a server function into what may be sent to the client.
 * - Development: unchanged (full details help debugging).
 * - Expected errors (401/403/429/validation): same object and message (users
 *   need e.g. the validation text), but the server stack trace is removed.
 * - Anything else: replaced by `InternalServerError(ref)`; the original is
 *   only in the server log (logged by the caller under the same `ref`).
 */
export function toClientError(err: unknown, opts: { isDev: boolean; ref?: string | null }): unknown {
  if (opts.isDev) return err;
  if (isExpectedError(err)) {
    if (err instanceof Error) {
      const { name, message } = describeError(err);
      try {
        err.stack = `${name}: ${message}`;
      } catch {
        // non-writable stack: fall through with the original
      }
    }
    return err;
  }
  return new InternalServerError(opts.ref ?? refOf(err) ?? errorRef());
}

/** Text safe to show users: details only in development. */
export function userFacingMessage(err: unknown, isDev: boolean): string {
  const info = describeError(err);
  if (info.status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (info.name === 'UnauthorizedError' || info.status === 401)
    return 'Your session has ended. Please sign in again.';
  if (isDev && info.message) return info.message;
  return GENERIC_SERVER_ERROR;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
