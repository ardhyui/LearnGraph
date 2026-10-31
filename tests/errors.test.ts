/**
 * Error classification, single-line JSON logging and user-facing messages.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeError,
  formatErrorLog,
  isExpectedError,
  GENERIC_SERVER_ERROR,
  InternalServerError,
  logError,
  refOf,
  toClientError,
  userFacingMessage,
} from '../src/lib/errors.ts';

class StatusError extends Error {
  readonly status: number;
  constructor(message: string, status: number, name = 'StatusError') {
    super(message);
    this.status = status;
    this.name = name;
  }
}

describe('describeError', () => {
  it('normalizes Error, string, object and primitives', () => {
    const e = describeError(new StatusError('boom', 503));
    assert.equal(e.name, 'StatusError');
    assert.equal(e.message, 'boom');
    assert.equal(e.status, 503);
    assert.ok(e.stack);
    assert.deepEqual(describeError('oops'), { name: 'Error', message: 'oops' });
    assert.deepEqual(describeError({ name: 'X', message: 'm', status: 429 }), {
      name: 'X',
      message: 'm',
      status: 429,
    });
    assert.deepEqual(describeError(42), { name: 'Error', message: '42' });
    assert.deepEqual(describeError(null), { name: 'Error', message: 'null' });
  });
});

describe('isExpectedError', () => {
  it('treats auth, cross-site, validation and 4xx as expected', () => {
    assert.equal(isExpectedError(new StatusError('Unauthorized', 401, 'UnauthorizedError')), true);
    assert.equal(isExpectedError(new StatusError('Forbidden', 403, 'CrossSiteRequestError')), true);
    assert.equal(isExpectedError(new StatusError('slow down', 429)), true);
    const zod = new Error('[]');
    zod.name = 'ZodError';
    assert.equal(isExpectedError(zod), true);
  });
  it('treats 5xx and plain errors as unexpected', () => {
    assert.equal(isExpectedError(new Error('db down')), false);
    assert.equal(isExpectedError(new StatusError('bad gateway', 502)), false);
    assert.equal(isExpectedError('string'), false);
  });
});

describe('formatErrorLog', () => {
  it('emits one parseable JSON line with a stable shape', () => {
    const line = formatErrorLog(
      'serverFn',
      new StatusError('x'.repeat(2000), 500),
      { userId: 'u1', ref: 'abc' },
      new Date('2026-11-01T00:00:00Z'),
    );
    assert.equal(line.includes('\n'), false, 'single line (stack newlines are escaped)');
    const rec = JSON.parse(line);
    assert.equal(rec.level, 'error');
    assert.equal(rec.time, '2026-11-01T00:00:00.000Z');
    assert.equal(rec.scope, 'serverFn');
    assert.equal(rec.userId, 'u1');
    assert.equal(rec.ref, 'abc');
    assert.equal(rec.name, 'StatusError');
    assert.equal(rec.status, 500);
    assert.ok(rec.message.length <= 501, 'message truncated');
    assert.ok(rec.stack.split('\n').length <= 8, 'stack trimmed');
  });
  it('extra fields cannot override name/message', () => {
    const rec = JSON.parse(formatErrorLog('ui', new Error('real'), { message: 'fake', name: 'n' }));
    assert.equal(rec.message, 'real');
    assert.equal(rec.name, 'Error');
  });
});

describe('logError', () => {
  it('logs unexpected errors once and skips expected ones', () => {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (s: string) => lines.push(s);
    try {
      assert.equal(logError('serverFn', new StatusError('nope', 401, 'UnauthorizedError')), null);
      const ref = logError('serverFn', new Error('db down'), { userId: 'u1' });
      assert.equal(typeof ref, 'string');
      assert.equal(lines.length, 1);
      assert.equal(JSON.parse(lines[0]).ref, ref);
      assert.equal(logError('ui', new Error('x'), { ref: 'given' }), 'given');
    } finally {
      console.error = orig;
    }
  });
});

describe('userFacingMessage', () => {
  it('hides internals in production but shows them in development', () => {
    const err = new Error('relation "secret_table" does not exist');
    assert.equal(userFacingMessage(err, false).includes('secret_table'), false);
    assert.equal(userFacingMessage(err, true), err.message);
  });
  it('gives specific guidance for rate limit and expired session', () => {
    assert.match(userFacingMessage(new StatusError('x', 429), false), /Too many requests/);
    assert.match(
      userFacingMessage(new StatusError('Unauthorized', 401, 'UnauthorizedError'), false),
      /sign in again/,
    );
  });
});

describe('toClientError (what server functions send to the browser)', () => {
  const dbError = () => {
    const e = new Error('relation "secret_table" does not exist') as Error & Record<string, unknown>;
    e.code = '42P01';
    e.query = 'SELECT * FROM secret_table WHERE owner_id = $1';
    return e;
  };

  it('replaces unexpected errors in production with a generic 500 + ref, no internals', () => {
    const out = toClientError(dbError(), { isDev: false, ref: 'abc123' });
    assert.ok(out instanceof InternalServerError);
    const e = out as InternalServerError;
    assert.equal(e.status, 500);
    assert.equal(e.ref, 'abc123');
    assert.equal(e.message, `${GENERIC_SERVER_ERROR} (ref abc123)`);
    assert.equal(e.stack, `InternalServerError: ${e.message}`);
    const wire = JSON.stringify({ ...e, message: e.message, stack: e.stack });
    for (const leak of ['secret_table', '42P01', 'SELECT', 'owner_id', '.ts:', 'at ']) {
      assert.equal(wire.includes(leak), false, `leaked ${leak}`);
    }
    assert.equal(isExpectedError(e), false);
  });

  it('serializes without internals through seroval (the TanStack Start wire format)', async () => {
    const { toCrossJSONAsync } = await import('seroval');
    const out = toClientError(dbError(), { isDev: false, ref: 'r1' });
    const wire = JSON.stringify(await toCrossJSONAsync(out, { refs: new Map() }));
    assert.equal(wire.includes('secret_table'), false);
    assert.equal(wire.includes('42P01'), false);
    assert.equal(wire.includes('errors.ts'), false);
    assert.ok(wire.includes('r1'));
  });

  it('generates a ref when none is given', () => {
    const e = toClientError(new Error('x'), { isDev: false }) as InternalServerError;
    assert.match(e.ref, /^[a-z0-9]+$/);
    assert.equal(refOf(e), e.ref);
  });

  it('keeps expected errors (validation, 401, 429) but strips the server stack', () => {
    const v = new StatusError('Invalid input for addConcept: argument 1.conceptId: must not contain ":"', 400, 'InvalidGraphInputError');
    const out = toClientError(v, { isDev: false, ref: null });
    assert.equal(out, v);
    assert.equal(v.message.startsWith('Invalid input for addConcept'), true);
    assert.equal(v.stack, `InvalidGraphInputError: ${v.message}`);
    const u = new StatusError('Unauthorized', 401, 'UnauthorizedError');
    assert.equal(toClientError(u, { isDev: false }), u);
    assert.match(userFacingMessage(u, false), /sign in again/);
  });

  it('passes everything through unchanged in development', () => {
    const e = dbError();
    const stack = e.stack;
    assert.equal(toClientError(e, { isDev: true, ref: 'x' }), e);
    assert.equal(e.stack, stack);
  });

  it('client-side logError reuses the server ref of a sanitized error', () => {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (s: string) => lines.push(s);
    try {
      const sanitized = { name: 'InternalServerError', message: 'x', status: 500, ref: 'srv42' };
      assert.equal(logError('ui', sanitized), 'srv42');
      assert.equal(JSON.parse(lines[0]).ref, 'srv42');
      assert.equal(refOf({ ref: '<script>' }), null);
      // Production wire format keeps only `message`: ref is read from its suffix.
      assert.equal(refOf(new Error(`${GENERIC_SERVER_ERROR} (ref k9x2)`)), 'k9x2');
      assert.equal(refOf(new Error('Learner not found (ref k9x2)')), null);
    } finally {
      console.error = orig;
    }
  });
});
