/**
 * Active learner shared across the learner pages (Today, Recommendations,
 * Gaps, Graph, Profile): which learner is shown, and how the choice is
 * remembered in the browser — per signed-in account, migrating once from the
 * old shared key without breaking it.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_LEARNER_KEY,
  activeLearnerKey,
  nextActiveLearner,
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

describe('activeLearnerKey (pure)', () => {
  it('builds a per-account key', () => {
    assert.equal(activeLearnerKey('user-1'), 'learngraph.activeLearner:user-1');
  });

  it('rejects missing or oversized user ids (treated as "no account")', () => {
    assert.equal(activeLearnerKey(''), null);
    assert.equal(activeLearnerKey(null), null);
    assert.equal(activeLearnerKey(undefined), null);
    assert.equal(activeLearnerKey('x'.repeat(129)), null);
  });
});

describe('nextActiveLearner (what the hook shows once learners are loaded)', () => {
  const ids = ['demo-a', 'me-sari', 'demo-b'];

  it('shows the first learner as a placeholder before the session loads (nothing remembered yet)', () => {
    assert.equal(nextActiveLearner(ids, null, null), 'demo-a');
  });

  it('honors the remembered per-account choice over that placeholder once the account is known', () => {
    // The placeholder ("current" state) must not override the remembered
    // choice when the session finishes loading — hence `picked`, not current.
    assert.equal(nextActiveLearner(ids, null, 'me-sari'), 'me-sari');
  });

  it('keeps a choice made on this page over the remembered one', () => {
    assert.equal(nextActiveLearner(ids, 'demo-b', 'me-sari'), 'demo-b');
  });

  it('falls back when the picked or remembered learner no longer exists', () => {
    assert.equal(nextActiveLearner(ids, 'gone', 'me-sari'), 'me-sari');
    assert.equal(nextActiveLearner(ids, 'gone', 'also-gone'), 'demo-a');
    assert.equal(nextActiveLearner([], 'me-sari', 'me-sari'), null);
  });
});

describe('remembering the active learner', () => {
  let store: Map<string, string>;
  const reads: string[] = [];
  const g = globalThis as { window?: unknown };

  beforeEach(() => {
    store = new Map();
    reads.length = 0;
    g.window = {
      localStorage: {
        getItem: (k: string) => {
          reads.push(k);
          return store.get(k) ?? null;
        },
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
  });

  afterEach(() => {
    delete g.window;
  });

  it('round-trips the chosen learner under the per-account key', () => {
    rememberActiveLearner('user-1', 'me-sari');
    assert.equal(store.get('learngraph.activeLearner:user-1'), 'me-sari');
    assert.equal(readActiveLearner('user-1'), 'me-sari');
  });

  it('keeps a separate choice per account (two accounts share one browser)', () => {
    rememberActiveLearner('user-1', 'me-sari');
    rememberActiveLearner('user-2', 'demo-a');
    assert.equal(readActiveLearner('user-1'), 'me-sari');
    assert.equal(readActiveLearner('user-2'), 'demo-a');
    // One account's choice never overwrites the other's.
    rememberActiveLearner('user-2', 'demo-b');
    assert.equal(readActiveLearner('user-1'), 'me-sari');
    assert.equal(readActiveLearner('user-2'), 'demo-b');
  });

  it('migrates once from the old shared key, without removing it', () => {
    store.set(ACTIVE_LEARNER_KEY, 'me-old');
    // Read as a migration candidate only (still validated by
    // resolveActiveLearner against this account's learners).
    assert.equal(readActiveLearner('user-1'), 'me-old');
    // A per-account choice, once written, wins over the old key.
    rememberActiveLearner('user-1', 'me-sari');
    assert.equal(readActiveLearner('user-1'), 'me-sari');
    // Another account still falls back to the old shared key.
    assert.equal(readActiveLearner('user-2'), 'me-old');
    // The old key is never deleted — other accounts may still rely on it.
    assert.equal(store.get(ACTIVE_LEARNER_KEY), 'me-old');
  });

  it('never writes the old shared key again', () => {
    store.set(ACTIVE_LEARNER_KEY, 'me-old');
    rememberActiveLearner('user-1', 'me-sari');
    assert.equal(store.get(ACTIVE_LEARNER_KEY), 'me-old');
    assert.equal(store.get('learngraph.activeLearner:user-1'), 'me-sari');
  });

  it('without a signed-in account, storage is neither read nor written', () => {
    store.set('learngraph.activeLearner:user-1', 'me-sari');
    store.set(ACTIVE_LEARNER_KEY, 'me-old');
    reads.length = 0;
    assert.equal(readActiveLearner(null), null);
    assert.equal(readActiveLearner(undefined), null);
    rememberActiveLearner(null, 'me-sari');
    rememberActiveLearner(undefined, 'me-sari');
    assert.deepEqual(reads, []);
    assert.equal(store.size, 2);
  });

  it('rejects empty and oversized values', () => {
    rememberActiveLearner('user-1', '');
    rememberActiveLearner('user-1', 'x'.repeat(129));
    assert.equal(store.size, 0);
    store.set('learngraph.activeLearner:user-1', 'x'.repeat(129));
    assert.equal(readActiveLearner('user-1'), null);
  });

  it('degrades quietly when storage is unavailable or throws', () => {
    g.window = {
      get localStorage() {
        throw new Error('SecurityError');
      },
    };
    assert.equal(readActiveLearner('user-1'), null);
    assert.doesNotThrow(() => rememberActiveLearner('user-1', 'me-sari'));
    delete g.window;
    assert.equal(readActiveLearner('user-1'), null);
    assert.doesNotThrow(() => rememberActiveLearner('user-1', 'me-sari'));
  });
});
