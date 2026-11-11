import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMichiReport, michiCards, michiOrigin } from '../src/lib/michi/evidence.ts';
import { readMichiFeed } from '../src/lib/michi/feed.server.ts';
const now = Date.now();
const item = {
  id: 'event-1',
  sessionId: '091b1378-c323-4d62-9b18-c344376e2588',
  stepId: 'recall',
  unitId: 'unit',
  revision: 1,
  contentToken: 'a'.repeat(64),
  preview: true,
  unitTitle: 'Kana',
  at: new Date(now - 1000).toISOString(),
  skill: 'kana',
  source: 'practice',
  signal: 'correct',
  kind: 'recall',
  correct: true,
  aids: [],
  inputAids: [],
  audio: 'none',
  compatible: true,
  warnings: [],
  contentStepId: 'unit/1/recall',
};
const report = (rows: unknown[] = []) => ({
  format: 'michi-skill-evidence',
  version: 1,
  scope: 'retained-unit-history',
  generatedAt: new Date(now).toISOString(),
  sessionCount: 1,
  pendingChecks: 1,
  ignoredSessions: 0,
  ignoredEvents: 0,
  unmapped: 0,
  rows,
});
const parse = (rows: unknown[]) => parseMichiReport(JSON.stringify(report(rows)), now);
test('same event IDs deduplicate; conflicting IDs, versions, stale/future and private fields fail', () => {
  assert.equal(parse([item, item]).rows.length, 1);
  assert.throws(() => parse([item, { ...item, signal: 'incorrect' }]));
  for (const patch of [
    { version: 2 },
    { generatedAt: new Date(now - 61000).toISOString() },
    { generatedAt: new Date(now + 61000).toISOString() },
    { response: 'private' },
  ])
    assert.throws(() => parseMichiReport(JSON.stringify({ ...report(), ...patch }), now));
  assert.throws(() => parse([{ ...item, response: 'private' }]));
  assert.throws(() => parse([{ ...item, at: new Date(now + 1).toISOString() }]));
  assert.throws(() => parseMichiReport('x'.repeat(4 * 1024 * 1024 + 1), now));
});
test('separates repeated steps, hints, self-review/revisions, delayed checks and text alternatives', () => {
  const rows = [
    item,
    { ...item, id: 'repeat', sessionId: '091b1378-c323-4d62-9b18-c344376e2589' },
    { ...item, id: 'hint', signal: 'assisted', inputAids: ['translation'] },
    {
      ...item,
      id: 'self',
      source: 'practice',
      signal: 'self-reviewed',
      correct: undefined,
      kind: 'write',
      skill: 'writing',
    },
    {
      ...item,
      id: 'revision',
      source: 'revision',
      signal: 'self-reviewed',
      correct: undefined,
      kind: 'write',
      skill: 'writing',
    },
    { ...item, id: 'check', source: 'delayed', warnings: ['previous-exposure'] },
    { ...item, id: 'text', skill: 'listening', signal: 'text-alternative', audio: 'text-only' },
    { ...item, id: 'old', compatible: false, skill: 'unmapped', warnings: ['old-content'] },
  ];
  const cards = michiCards(parse(rows));
  const kana = cards.find((c) => c.skill === 'kana')!;
  assert.equal(kana.responses, 3);
  assert.equal(kana.uniqueSteps, 1);
  assert.equal(kana.correct, 2);
  assert.equal(kana.assisted, 1);
  assert.equal(kana.delayed, 1);
  assert.equal(kana.flaggedDelayed, 1);
  assert.equal(kana.draft, 4);
  assert.equal(cards.find((c) => c.skill === 'listening')!.responses, 0);
  assert.equal(cards.find((c) => c.skill === 'writing')!.selfReviewed, 1);
  assert.equal(cards.find((c) => c.skill === 'writing')!.revisions, 1);
  assert.equal(
    michiCards(parse([])).every((c) => c.records === 0),
    true,
    'deletion replaces projection, never appends',
  );
});
test('feed is local-owner only, bounded, read-only, optional and does not follow redirects', async () => {
  let calls = 0;
  const fetcher = (async (_url: unknown, options: RequestInit) => {
    calls++;
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return Response.json(report([item, item]));
  }) as typeof fetch;
  assert.equal((await readMichiFeed('foreign', true, fetcher)).status, 'disabled');
  assert.equal((await readMichiFeed('local-japanese-owner', false, fetcher)).status, 'disabled');
  assert.equal(calls, 0);
  const result = await readMichiFeed('local-japanese-owner', true, fetcher);
  assert.equal(result.status, 'ready');
  if (result.status === 'ready')
    assert.equal(result.cards.find((c) => c.skill === 'kana')!.responses, 1);
  for (const response of [
    new Response('failure', { status: 503 }),
    new Response('html'),
    Response.json({ ...report(), version: 2 }),
    new Response('x'.repeat(4 * 1024 * 1024 + 1), {
      headers: { 'content-type': 'application/json' },
    }),
  ])
    assert.equal(
      (await readMichiFeed('local-japanese-owner', true, (async () => response) as typeof fetch))
        .status,
      'unavailable',
    );
  assert.equal(
    (
      await readMichiFeed('local-japanese-owner', true, (async () => {
        throw new Error('offline');
      }) as typeof fetch)
    ).status,
    'unavailable',
  );
});
test('operator fetch targets must be direct numeric loopback origins', () => {
  assert.equal(michiOrigin(), 'http://127.0.0.1:17831');
  assert.equal(michiOrigin('http://[::1]:17841'), 'http://[::1]:17841');
  for (const value of [
    'https://example.com',
    'http://localhost:17831',
    'http://127.0.0.1.evil.test',
    'http://127.0.0.1/path',
    'http://user:pw@127.0.0.1',
    'http://127.0.0.1?x=1',
    'http://127.0.0.1#x',
  ])
    assert.throws(() => michiOrigin(value));
});
