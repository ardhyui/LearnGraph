/**
 * Tiny `expect` shim over node:assert so the original vitest assertions port
 * to `node --test` unchanged.
 */
import assert from 'node:assert/strict';

export function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => assert.strictEqual(actual, expected),
    toBeNull: () => assert.strictEqual(actual, null),
    toBeDefined: () => assert.notStrictEqual(actual, undefined),
    toBeLessThan: (n: number) =>
      assert.ok((actual as number) < n, `expected ${String(actual)} < ${n}`),
    not: {
      toBeNull: () => assert.notStrictEqual(actual, null),
    },
  };
}
