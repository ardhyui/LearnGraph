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

/** Log an unexpected error (no-op for expected ones). Returns the ref used, if logged. */
export function logError(
  scope: string,
  err: unknown,
  extra: Record<string, string | number | boolean | null | undefined> = {},
): string | null {
  if (isExpectedError(err)) return null;
  const ref = typeof extra.ref === 'string' ? extra.ref : errorRef();
  console.error(formatErrorLog(scope, err, { ...extra, ref }));
  return ref;
}

/** Text safe to show users: details only in development. */
export function userFacingMessage(err: unknown, isDev: boolean): string {
  const info = describeError(err);
  if (info.status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (info.name === 'UnauthorizedError' || info.status === 401)
    return 'Your session has ended. Please sign in again.';
  if (isDev && info.message) return info.message;
  return 'Something went wrong on our side. Please try again.';
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
