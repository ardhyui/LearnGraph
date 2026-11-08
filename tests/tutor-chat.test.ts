/**
 * Roadmap M4: built-in tutor chat with the learner's own API key. The SDK
 * call is checked with a stand-in client (no network, no cost): the brief
 * goes into the system prompt, refusals are reported, errors become readable
 * key-free messages, and the comparison is measured from events.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { askTutorOnce, TUTOR_MODEL, toTutorError, type TutorClient } from '../src/lib/tutor/chat.ts';
import { tutorPreference } from '../src/lib/evidence/events.ts';

function fakeClient(reply: unknown, seen: unknown[] = []): TutorClient {
  return { beta: { messages: { create: (async (params: unknown) => {
    seen.push(params);
    if (reply instanceof Error) throw reply;
    return reply;
  }) as never } } };
}

describe('tutor chat', () => {
  it('sends the brief as the system prompt, with refusal fallback, and returns the text', async () => {
    const seen: any[] = [];
    const answer = await askTutorOnce(
      fakeClient({ model: TUTOR_MODEL, stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Add the tops.' }] }, seen),
      'How do I add fractions?',
      'Topic: Fractions',
    );
    assert.deepEqual(answer, { text: 'Add the tops.', model: TUTOR_MODEL, refused: false });
    assert.equal(seen[0].model, 'claude-opus-5-5');
    assert.match(seen[0].system, /Topic: Fractions/);
    assert.deepEqual(seen[0].betas, ['server-side-fallback-2026-07-01']);
    assert.equal(seen[0].fallbacks, 'default');
    assert.deepEqual(seen[0].messages, [{ role: 'user', content: 'How do I add fractions?' }]);
    // Without context (the comparison) the brief is left out.
    await askTutorOnce(fakeClient({ model: TUTOR_MODEL, stop_reason: 'end_turn', content: [] }, seen), 'q', null);
    assert.doesNotMatch(seen[1].system, /Topic:/);
  });

  it('reports a refusal instead of an empty answer', async () => {
    const answer = await askTutorOnce(fakeClient({ model: TUTOR_MODEL, stop_reason: 'refusal', content: [] }), 'q', null);
    assert.equal(answer.refused, true);
    assert.match(answer.text, /declined/);
  });

  it('turns API errors into readable messages without the key', async () => {
    const auth = new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key sk-ant-secret', new Headers());
    await assert.rejects(askTutorOnce(fakeClient(auth), 'q', null), (err: Error) => {
      assert.match(err.message, /not accepted/);
      assert.doesNotMatch(err.message, /sk-ant/);
      assert.equal((err as { status?: number }).status, 400);
      return true;
    });
    assert.match(toTutorError(new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers())).message, /limit/);
  });

  it('measures how often the answer that knew the learner was preferred', () => {
    assert.deepEqual(
      tutorPreference([
        { kind: 'tutor', outcome: 'prefer-context' },
        { kind: 'tutor', outcome: 'prefer-context' },
        { kind: 'tutor', outcome: 'prefer-plain' },
        { kind: 'tutor', outcome: 'asked' },
        { kind: 'quiz', outcome: 'passed' },
      ]),
      { compared: 3, preferContext: 2, preferPlain: 1, same: 0 },
    );
  });
});
