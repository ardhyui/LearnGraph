/**
 * Later page loads skip waiting for the workspace set-up check once it has
 * succeeded for the account in this browser (Roadmap P0 #3).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_READY_KEY,
  forgetWorkspaceReady,
  isWorkspaceKnownReady,
  rememberWorkspaceReady,
} from '../src/lib/workspace-ready.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const broken = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('workspace ready hint', () => {
  it('is unknown until the set-up check succeeded once', () => {
    const s = memoryStorage();
    assert.equal(isWorkspaceKnownReady('user-a', s), false);
    rememberWorkspaceReady('user-a', s);
    assert.equal(isWorkspaceKnownReady('user-a', s), true);
    assert.equal(s.map.get(WORKSPACE_READY_KEY), 'user-a');
  });

  it('belongs to one account: another account on the same browser still waits', () => {
    const s = memoryStorage();
    rememberWorkspaceReady('user-a', s);
    assert.equal(isWorkspaceKnownReady('user-b', s), false);
    rememberWorkspaceReady('user-b', s);
    assert.equal(isWorkspaceKnownReady('user-a', s), false, 'only the last account is kept');
    assert.equal(s.map.size, 1);
  });

  it('is forgotten after a failed check, so the next load waits again', () => {
    const s = memoryStorage();
    rememberWorkspaceReady('user-a', s);
    forgetWorkspaceReady(s);
    assert.equal(isWorkspaceKnownReady('user-a', s), false);
  });

  it('never counts as ready without an account id', () => {
    const s = memoryStorage();
    rememberWorkspaceReady(undefined, s);
    rememberWorkspaceReady('', s);
    assert.equal(s.map.size, 0);
    s.map.set(WORKSPACE_READY_KEY, '');
    assert.equal(isWorkspaceKnownReady('', s), false);
    assert.equal(isWorkspaceKnownReady(undefined, s), false);
  });

  it('ignores ids that are too long to be an account id', () => {
    const s = memoryStorage();
    rememberWorkspaceReady('x'.repeat(257), s);
    assert.equal(s.map.size, 0);
  });

  it('works without storage (server render, private mode, storage errors)', () => {
    assert.equal(isWorkspaceKnownReady('user-a', null), false);
    assert.doesNotThrow(() => rememberWorkspaceReady('user-a', null));
    assert.equal(isWorkspaceKnownReady('user-a', broken), false);
    assert.doesNotThrow(() => rememberWorkspaceReady('user-a', broken));
    assert.doesNotThrow(() => forgetWorkspaceReady(broken));
  });
});
