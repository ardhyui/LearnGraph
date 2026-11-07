import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceMastery, nextQuizReview } from '../src/lib/japanese/evidence.ts';
import { MODULES } from '../src/lib/japanese/curriculum.ts';
import { QUESTIONS } from '../src/lib/japanese/questions.ts';
import { permitsLocalUser } from '../src/lib/auth/local-access.ts';
test('local access is opt-in and rejects foreign origin and proxy hosts', () => {
  const origin = 'http://127.0.0.1:17832';
  assert.equal(permitsLocalUser(new Request(origin), undefined), false);
  assert.equal(permitsLocalUser(new Request(origin), origin), true);
  const blocked: Record<string, string>[] = [
    { origin: 'https://evil.test' },
    { 'sec-fetch-site': 'cross-site' },
    { 'x-forwarded-host': 'evil.test' },
    { 'x-forwarded-proto': 'https' },
  ];
  for (const headers of blocked)
    assert.equal(permitsLocalUser(new Request(origin, { headers }), origin), false);
  assert.equal(permitsLocalUser(new Request('http://localhost:17832'), origin), false);
});
test('same-day repetition cannot establish retention; delayed distinct questions can', () => {
  const first = { at: '2026-11-03T00:00:00Z', correct: 3, total: 3, ids: ['a', 'b', 'c'] };
  assert.equal(evidenceMastery([first]), 70);
  assert.equal(evidenceMastery([first, { ...first, ids: ['d', 'e', 'f'] }]), 70);
  assert.equal(
    evidenceMastery([first, { ...first, at: '2026-11-04T00:00:00Z', ids: ['d', 'e', 'f'] }]),
    85,
  );
  assert.equal(evidenceMastery([first, { ...first, at: '2026-11-04T00:00:00Z', correct: 1 }]), 23);
  assert.equal(evidenceMastery([]), 0);
});
test('all modules and prerequisites resolve; every quiz has six valid questions', () => {
  assert.equal(new Set(MODULES.map((m) => m.id)).size, MODULES.length);
  for (const m of MODULES) {
    for (const id of m.prereqs) assert.ok(MODULES.some((n) => n.id === id));
    if (m.mode === 'quiz') assert.equal(QUESTIONS.filter((q) => q.topic === m.id).length, 6);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    assert.ok(!visiting.has(id), 'cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const p of MODULES.find((m) => m.id === id)!.prereqs) visit(p);
    visiting.delete(id);
    visited.add(id);
  }
  for (const m of MODULES) visit(m.id);
  for (const q of QUESTIONS) {
    assert.ok(q.options.includes(q.answer));
    assert.equal(new Set(q.options).size, 3);
  }
});

test('same-day repetition cannot inflate the review interval', () => {
  const a = { at: '2026-11-03T00:00:00Z', correct: 3, total: 3, ids: ['a', 'b', 'c'] };
  assert.equal(
    nextQuizReview([a, { ...a, at: '2026-11-03T01:00:00Z' }]),
    '2026-11-04T01:00:00.000Z',
  );
  assert.equal(
    nextQuizReview([a, { ...a, at: '2026-11-04T01:00:00Z' }]),
    '2026-11-06T01:00:00.000Z',
  );
  assert.equal(nextQuizReview([{ ...a, correct: 1 }]), '2026-11-03T00:10:00.000Z');
});
