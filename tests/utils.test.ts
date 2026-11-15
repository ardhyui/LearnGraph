/**
 * Direct unit tests for the tiny `cn` helper in `src/lib/utils.ts`
 * (`clsx` + `tailwind-merge`). It is imported by many components but had no
 * direct test: a broken merge would silently ship conflicting classes like
 * `p-2 p-4` or drop conditional classes.
 *
 * The module is not changed by this file — tests only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cn } from '../src/lib/utils.ts';

describe('cn', () => {
  it('returns an empty string without arguments', () => {
    assert.equal(cn(), '');
  });

  it('joins several plain strings in order', () => {
    assert.equal(cn('flex', 'items-center', 'gap-2'), 'flex items-center gap-2');
  });

  it('resolves conflicting Tailwind classes (last one wins)', () => {
    assert.equal(cn('p-2', 'p-4'), 'p-4');
    // `text-sm` and `text-lg` share the font-size group; `text-red-500` is a
    // different group and keeps its original position.
    assert.equal(cn('text-sm text-red-500', 'text-lg'), 'text-red-500 text-lg');
  });

  it('keeps classes that do not conflict', () => {
    assert.equal(cn('px-2', 'py-3'), 'px-2 py-3');
  });

  it('drops false, undefined and null conditional values', () => {
    assert.equal(cn('mt-4', false, undefined, null, 'mb-2'), 'mt-4 mb-2');
  });

  it('supports the clsx object form', () => {
    assert.equal(cn({ 'font-bold': true, hidden: false }), 'font-bold');
  });

  it('supports the clsx array form', () => {
    const hidden = false;
    assert.equal(cn(['flex', hidden && 'hidden', 'gap-2']), 'flex gap-2');
  });

  it('always returns a string', () => {
    assert.equal(typeof cn(), 'string');
    assert.equal(typeof cn('p-2', false, { block: true }), 'string');
  });
});
