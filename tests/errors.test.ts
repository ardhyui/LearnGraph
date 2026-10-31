/**
 * Error classification, single-line JSON logging and user-facing messages.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeError,
  formatErrorLog,
  isExpectedError,
  logError,
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
