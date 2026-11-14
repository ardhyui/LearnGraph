/**
 * Direct unit tests for the email module (src/lib/email.ts) — the last module
 * in `src/lib` without its own test. Password reset and email verification
 * (Roadmap M3) depend on it, but until now its behaviour was only locked
 * indirectly by the smoke happy path.
 *
 * The module is not changed by this file. `fetch` is stubbed per test, and the
 * environment keys it reads (RESEND_API_KEY, EMAIL_FROM, NODE_ENV,
 * DEV_EMAIL_OUTBOX) are snapshotted and restored. The dev outbox lives in a
 * temporary directory; no real provider, network call, or `.env` is touched.
 * `console.info` is stubbed where the dev path prints, so the dev log line is
 * asserted quietly and stays a deliberate (non-lint) behaviour.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  emailConfigured,
  passwordResetAvailable,
  passwordResetEmail,
  sendEmail,
  verificationEmail,
} from '../src/lib/email.ts';

const ENV_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM', 'NODE_ENV', 'DEV_EMAIL_OUTBOX'] as const;
type EnvKey = (typeof ENV_KEYS)[number];

const originalEnv = new Map<EnvKey, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;
const originalInfo = console.info;

let tmpDir = '';
let outboxPath = '';
let fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
let logLines: string[] = [];

/** Replace only the keys this module reads, starting from a clean slate. */
function setEnv(values: Partial<Record<EnvKey, string | undefined>> = {}): void {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

type FetchReply = { ok: boolean; status: number };

/** Record every fetch call; `reply` decides the (minimal) provider response. */
function stubFetch(reply: () => FetchReply = () => ({ ok: true, status: 200 })): void {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return reply() as Response;
  }) as typeof fetch;
}

/** A fetch that fails the test if anything calls it (the dev path must not send). */
function forbidFetch(): void {
  fetchCalls = [];
  globalThis.fetch = (async (input: unknown) => {
    fetchCalls.push({ url: String(input), init: undefined });
    throw new Error(`fetch must not be called (attempted ${String(input)})`);
  }) as typeof fetch;
}

before(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'learngraph-email-test-'));
  outboxPath = path.join(tmpDir, 'outbox.jsonl');
});

after(async () => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
  console.info = originalInfo;
  if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  setEnv();
  fetchCalls = [];
  stubFetch();
  console.info = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };
  logLines = [];
  await fsp.rm(outboxPath, { force: true });
});

describe('emailConfigured', () => {
  it('is true only when both RESEND_API_KEY and EMAIL_FROM are filled in', () => {
    assert.equal(emailConfigured(), false);
    process.env.RESEND_API_KEY = 're_test_key';
    assert.equal(emailConfigured(), false, 'key alone is not enough');
    process.env.EMAIL_FROM = 'LearnGraph <no-reply@example.test>';
    assert.equal(emailConfigured(), true);
    delete process.env.RESEND_API_KEY;
    assert.equal(emailConfigured(), false, 'sender alone is not enough');
  });

  it('treats whitespace-only values as empty and trims padded ones', () => {
    process.env.RESEND_API_KEY = '   ';
    process.env.EMAIL_FROM = 'no-reply@example.test';
    assert.equal(emailConfigured(), false, 'whitespace-only key counts as empty');
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = '\t\n ';
    assert.equal(emailConfigured(), false, 'whitespace-only sender counts as empty');
    process.env.RESEND_API_KEY = '  re_test_key  ';
    process.env.EMAIL_FROM = '  no-reply@example.test  ';
    assert.equal(emailConfigured(), true, 'padded values are trimmed, not rejected');
  });
});

describe('passwordResetAvailable', () => {
  it('is true when email is configured, whatever the environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'no-reply@example.test';
    assert.equal(passwordResetAvailable(), true);
    process.env.NODE_ENV = 'development';
    assert.equal(passwordResetAvailable(), true);
  });

  it('stays true on a dev server without a provider (the link is printed instead)', () => {
    for (const mode of [undefined, 'development', 'test']) {
      setEnv({ NODE_ENV: mode });
      assert.equal(passwordResetAvailable(), true, `NODE_ENV=${String(mode)}`);
    }
  });

  it('is false in production without a provider', () => {
    setEnv({ NODE_ENV: 'production' });
    assert.equal(passwordResetAvailable(), false);
  });

  it('only treats the exact value "production" as production', () => {
    setEnv({ NODE_ENV: 'Production' });
    assert.equal(passwordResetAvailable(), true);
  });
});

describe('sendEmail with a provider configured', () => {
  const configure = () =>
    setEnv({
      NODE_ENV: 'production',
      RESEND_API_KEY: '  re_secret_key  ',
      EMAIL_FROM: '  LearnGraph <no-reply@example.test>  ',
      DEV_EMAIL_OUTBOX: outboxPath,
    });

  it('makes exactly one POST to the Resend endpoint with the trimmed key and sender', async () => {
    configure();
    await sendEmail({ to: 'learner@example.test', subject: 'Hello', text: 'Body line' });

    assert.equal(fetchCalls.length, 1);
    const [{ url, init }] = fetchCalls;
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init?.headers, {
      authorization: 'Bearer re_secret_key',
      'content-type': 'application/json',
    });
    assert.deepEqual(JSON.parse(String(init?.body)), {
      from: 'LearnGraph <no-reply@example.test>',
      to: ['learner@example.test'],
      subject: 'Hello',
      text: 'Body line',
    });
    // A real send never falls back to the dev log or the outbox.
    assert.deepEqual(logLines, []);
    assert.equal(fs.existsSync(outboxPath), false);
  });

  it('resolves on an OK response', async () => {
    configure();
    await assert.doesNotReject(sendEmail({ to: 'a@example.test', subject: 'S', text: 'T' }));
    assert.equal(fetchCalls.length, 1);
  });

  it('rejects with the provider status for every non-OK response', async () => {
    configure();
    for (const status of [400, 401, 422, 429, 500, 503]) {
      stubFetch(() => ({ ok: false, status }));
      await assert.rejects(
        sendEmail({ to: 'a@example.test', subject: 'S', text: 'T' }),
        (error: Error) => {
          assert.equal(error.message, `Email provider refused the message (HTTP ${status}).`);
          return true;
        },
        `HTTP ${status}`,
      );
    }
    assert.equal(fetchCalls.length, 6, 'each attempt is a single request, no retries');
  });
});

describe('sendEmail without a provider (development)', () => {
  const devMessage = { to: 'dev@example.test', subject: 'Dev subject', text: 'Dev body' };

  it('resolves without calling fetch and prints the message to the dev log', async () => {
    setEnv({ NODE_ENV: 'development', DEV_EMAIL_OUTBOX: outboxPath });
    forbidFetch();
    await assert.doesNotReject(sendEmail(devMessage));
    assert.equal(fetchCalls.length, 0);
    assert.equal(logLines.length, 1);
    assert.ok(logLines[0].includes('dev@example.test'), 'dev log names the recipient');
    assert.ok(logLines[0].includes('Dev subject'), 'dev log has the subject');
    assert.ok(logLines[0].includes('Dev body'), 'dev log has the body (the reset link)');
  });

  it('appends exactly one JSON line {to, subject, text, at} to DEV_EMAIL_OUTBOX', async () => {
    setEnv({ NODE_ENV: 'development', DEV_EMAIL_OUTBOX: outboxPath });
    forbidFetch();
    await sendEmail(devMessage);

    const lines = (await fsp.readFile(outboxPath, 'utf8')).split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(entry), ['to', 'subject', 'text', 'at']);
    assert.equal(entry.to, devMessage.to);
    assert.equal(entry.subject, devMessage.subject);
    assert.equal(entry.text, devMessage.text);
    assert.match(entry.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'ISO timestamp');
    assert.ok(Number.isFinite(Date.parse(entry.at)), 'timestamp parses');
  });

  it('appends rather than overwrites, so the smoke test can read every link', async () => {
    setEnv({ NODE_ENV: 'development', DEV_EMAIL_OUTBOX: outboxPath });
    forbidFetch();
    await fsp.writeFile(outboxPath, '{"to":"older@example.test"}\n');
    await sendEmail(devMessage);
    await sendEmail({ ...devMessage, to: 'second@example.test' });

    const lines = (await fsp.readFile(outboxPath, 'utf8')).split('\n').filter(Boolean);
    assert.equal(lines.length, 3);
    assert.equal(JSON.parse(lines[0]).to, 'older@example.test');
    assert.equal(JSON.parse(lines[1]).to, 'dev@example.test');
    assert.equal(JSON.parse(lines[2]).to, 'second@example.test');
  });

  it('writes no outbox file when DEV_EMAIL_OUTBOX is unset or blank', async () => {
    setEnv({ NODE_ENV: 'development' });
    forbidFetch();
    await sendEmail(devMessage);
    setEnv({ NODE_ENV: 'development', DEV_EMAIL_OUTBOX: '   ' });
    await sendEmail(devMessage);
    assert.equal(fs.existsSync(outboxPath), false);
    assert.equal(logLines.length, 2, 'both attempts still reach the dev log');
  });
});

describe('sendEmail without a provider (production)', () => {
  it('rejects with a clear message and never calls fetch', async () => {
    setEnv({ NODE_ENV: 'production', DEV_EMAIL_OUTBOX: outboxPath });
    forbidFetch();
    await assert.rejects(
      sendEmail({ to: 'a@example.test', subject: 'S', text: 'T' }),
      (error: Error) => {
        assert.equal(error.message, 'Email is not configured on this server.');
        return true;
      },
    );
    assert.equal(fetchCalls.length, 0);
    assert.equal(fs.existsSync(outboxPath), false, 'production never writes the dev outbox');
  });
});

describe('passwordResetEmail and verificationEmail', () => {
  const url = 'https://learngraph.example.test/reset-password/abc123?token=secret-token';

  it('builds an English password-reset message that carries the given URL', () => {
    const message = passwordResetEmail('learner@example.test', url);
    assert.deepEqual(Object.keys(message), ['to', 'subject', 'text']);
    assert.equal(message.to, 'learner@example.test');
    assert.equal(message.subject, 'Reset your LearnGraph password');
    assert.ok(message.text.includes(url), 'text contains the reset link');
    assert.match(message.subject, /password/i);
  });

  it('builds an English verification message that carries the given URL', () => {
    const message = verificationEmail('new@example.test', url);
    assert.deepEqual(Object.keys(message), ['to', 'subject', 'text']);
    assert.equal(message.to, 'new@example.test');
    assert.equal(message.subject, 'Confirm your LearnGraph email address');
    assert.ok(message.text.includes(url), 'text contains the confirmation link');
    assert.match(message.subject, /confirm/i);
  });

  it('leaves the message otherwise free of server secrets', () => {
    setEnv({ RESEND_API_KEY: 're_secret_key', EMAIL_FROM: 'no-reply@example.test' });
    for (const message of [
      passwordResetEmail('a@example.test', url),
      verificationEmail('a@example.test', url),
    ]) {
      assert.equal(message.text.includes('re_secret_key'), false);
      assert.equal(message.text.includes('no-reply@example.test'), false);
      assert.equal(JSON.stringify(message).includes('RESEND'), false);
    }
  });
});
