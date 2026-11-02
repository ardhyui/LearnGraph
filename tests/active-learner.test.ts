/**
 * Active learner shared across the learner pages (Today, Recommendations,
 * Gaps, Graph, Profile): which learner is shown, and how the choice is
 * remembered in the browser.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_LEARNER_KEY,
  readActiveLearner,
  rememberActiveLearner,
  resolveActiveLearner,
} from '../src/lib/active-learner.ts';

describe('resolveActiveLearner', () => {
  const ids = ['demo-a', 'me-sari', 'demo-b'];

  it('keeps the current learner while it still exists', () => {
    assert.equal(resolveActiveLearner(ids, 'demo-b', 'me-sari'), 'demo-b');
  });

  it('uses the remembered learner (e.g. picked on another page) when nothing is shown yet', () => {
    assert.equal(resolveActiveLearner(ids, null, 'me-sari'), 'me-sari');
  });

  it('falls back to the remembered learner when the current one was deleted', () => {
    assert.equal(resolveActiveLearner(ids, 'gone', 'me-sari'), 'me-sari');
  });

  it('ignores a remembered id that is not in this account (another account / deleted)', () => {
    assert.equal(resolveActiveLearner(ids, null, 'someone-else'), 'demo-a');
    assert.equal(resolveActiveLearner(ids, undefined, ''), 'demo-a');
  });

  it('returns null without learners', () => {
    assert.equal(resolveActiveLearner([], 'me-sari', 'me-sari'), null);
  });
});

describe('remembering the active learner', () => {
  let store: Map<string, string>;
  const g = globalThis as { window?: unknown };

  beforeEach(() => {
    store = new Map();
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
  });

  afterEach(() => {
    delete g.window;
  });

  it('round-trips the chosen learner under the existing key (earlier choices are kept)', () => {
    store.set(ACTIVE_LEARNER_KEY, 'me-old');
    assert.equal(readActiveLearner(), 'me-old');
    rememberActiveLearner('me-sari');
    assert.equal(store.get('learngraph.activeLearner'), 'me-sari');
    assert.equal(readActiveLearner(), 'me-sari');
  });

  it('rejects empty and oversized values', () => {
    rememberActiveLearner('');
    rememberActiveLearner('x'.repeat(129));
    assert.equal(store.size, 0);
    store.set(ACTIVE_LEARNER_KEY, 'x'.repeat(129));
    assert.equal(readActiveLearner(), null);
  });

  it('degrades quietly when storage is unavailable or throws', () => {
    g.window = {
      get localStorage() {
        throw new Error('SecurityError');
      },
    };
    assert.equal(readActiveLearner(), null);
    assert.doesNotThrow(() => rememberActiveLearner('me-sari'));
    delete g.window;
    assert.equal(readActiveLearner(), null);
    assert.doesNotThrow(() => rememberActiveLearner('me-sari'));
  });
});
