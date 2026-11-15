/**
 * Direct unit tests for `uuidv4` in `src/lib/uuid.ts`, a thin wrapper around
 * `globalThis.crypto.randomUUID()` used for new learner ids, graph nodes and
 * test fixtures. The wrapper must not grow a silent fallback (e.g. Math.random
 * ids) or swallow provider errors: both would weaken id uniqueness/security.
 *
 * The module is not changed by this file. `crypto` is stubbed through
 * `Object.defineProperty` and the original descriptor is restored per test, so
 * the real generator is used again for the uniqueness check.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv4 } from '../src/lib/uuid.ts';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

function restoreCrypto(): void {
  if (originalCryptoDescriptor) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
  } else {
    delete (globalThis as any).crypto;
  }
}

/** Replaces `crypto.randomUUID` for the duration of `fn`, restoring afterwards. */
function withRandomUUID<T>(randomUUID: () => string, fn: () => T): T {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID },
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    restoreCrypto();
  }
}

after(() => {
  restoreCrypto();
});

describe('uuidv4', () => {
  it('calls crypto.randomUUID exactly once and returns its value as-is', () => {
    const calls: unknown[][] = [];
    const fixed = '00000000-0000-4000-8000-000000000000';
    const stub = (...args: unknown[]): string => {
      calls.push(args);
      return fixed;
    };
    const result = withRandomUUID(stub, () => uuidv4());

    assert.equal(result, fixed);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], []);
  });

  it('produces real UUID v4 strings', () => {
    for (let i = 0; i < 10; i += 1) {
      const id = uuidv4();
      assert.equal(id.length, 36);
      assert.match(id, UUID_V4);
    }
  });

  it('does not repeat across 1000 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      ids.add(uuidv4());
    }
    assert.equal(ids.size, 1000);
  });

  it('propagates errors from crypto.randomUUID', () => {
    withRandomUUID(
      () => {
        throw new Error('random source unavailable');
      },
      () => {
        assert.throws(() => uuidv4(), /random source unavailable/);
      },
    );
  });
});
