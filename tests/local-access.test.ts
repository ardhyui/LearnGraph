/**
 * Direct unit tests for the workstation-only local access gate
 * `src/lib/auth/local-access.ts` — `LOCAL_OWNER_ID` and `permitsLocalUser`.
 *
 * The module was only covered by one broad assertion in `tests/japanese.test.ts`
 * (kept intact): undefined origin is opt-out, a matching loopback origin is
 * allowed, and four hostile headers are blocked. This file imports the module
 * directly (node:test, no PGlite or DOM; Node 26's global `Request`/`URL`/
 * `Headers` are enough) and locks every branch of the gate in order: the
 * configured origin must be plain `http://127.0.0.1` (any port), the request
 * must share its origin (path and query are ignored), no proxy header may be
 * present (even empty), and `origin`/`sec-fetch-site` must not contradict the
 * configured origin. The module is not changed here: the tests pin its current
 * behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_OWNER_ID, permitsLocalUser } from '../src/lib/auth/local-access.ts';

const ORIGIN = 'http://127.0.0.1:17832';
const SRC_DIR = join(import.meta.dirname, '..', 'src');
const LOCAL_ACCESS_FILE = join(SRC_DIR, 'lib', 'auth', 'local-access.ts');
const ACCOUNT_FILE = join(SRC_DIR, 'lib', 'account.ts');
const VERIFY_FILE = join(SRC_DIR, 'lib', 'auth', 'verify.server.ts');
const BACKUP_FILE = join(SRC_DIR, 'routes', 'api', 'japanese-backup.ts');
const DELETE_ACCOUNT_FILE = join(SRC_DIR, 'components', 'DeleteAccount.tsx');
const OLD_JAPANESE_TEST = join(import.meta.dirname, 'japanese.test.ts');

/** A request against the given URL with optional plain-string headers. */
function request(url: string, headers?: Record<string, string>): Request {
  return new Request(url, { headers });
}

/** Duck-typed stand-ins for the two defensive `try`/`catch` branches. */
function brokenUrlRequest(url: string): Request {
  return { url, headers: new Headers() } as unknown as Request;
}

function throwingHeadersRequest(url: string): Request {
  return {
    url,
    headers: {
      has() {
        throw new Error('broken headers');
      },
    },
  } as unknown as Request;
}

describe('LOCAL_OWNER_ID', () => {
  it('is the workstation-only owner of the local Japanese setup', () => {
    assert.equal(LOCAL_OWNER_ID, 'local-japanese-owner');
  });
});

describe('permitsLocalUser configured origin', () => {
  it('is opt-in: no configured origin (undefined or empty) rejects every request', () => {
    assert.equal(permitsLocalUser(request(ORIGIN), undefined), false);
    assert.equal(permitsLocalUser(request(ORIGIN), ''), false);
  });

  it('rejects a configured origin that is malformed, not plain http, or not 127.0.0.1', () => {
    // Malformed values go through the URL constructor and land in the catch.
    assert.equal(permitsLocalUser(request(ORIGIN), 'not a url'), false);
    assert.equal(permitsLocalUser(request(ORIGIN), 'http://'), false);
    // Plain http loopback only: https, localhost, IPv6 loopback and other
    // loopback addresses are all refused, even when the request matches them.
    assert.equal(
      permitsLocalUser(request('https://127.0.0.1:17832'), 'https://127.0.0.1:17832'),
      false,
    );
    assert.equal(
      permitsLocalUser(request('http://localhost:17832'), 'http://localhost:17832'),
      false,
    );
    assert.equal(permitsLocalUser(request('http://[::1]:17832'), 'http://[::1]:17832'), false);
    assert.equal(
      permitsLocalUser(request('http://127.0.0.2:17832'), 'http://127.0.0.2:17832'),
      false,
    );
    assert.equal(permitsLocalUser(request('http://0.0.0.0:17832'), 'http://0.0.0.0:17832'), false);
  });

  it('accepts any port on plain http 127.0.0.1 and ignores the configured path/query', () => {
    assert.equal(permitsLocalUser(request(ORIGIN), ORIGIN), true);
    // Every port is fine as long as request and configured origin agree.
    assert.equal(permitsLocalUser(request('http://127.0.0.1:4321'), 'http://127.0.0.1:4321'), true);
    // Only `origin` is compared, so a configured path, query, trailing slash or
    // userinfo does not narrow the gate. Rough edge kept as-is.
    assert.equal(permitsLocalUser(request(ORIGIN), `${ORIGIN}/`), true);
    assert.equal(permitsLocalUser(request(ORIGIN), `${ORIGIN}/japanese?x=1`), true);
    assert.equal(
      permitsLocalUser(request('http://127.0.0.1:17832'), 'http://u:p@127.0.0.1:17832'),
      true,
    );
  });

  it('normalises default ports and the scheme case through the URL API', () => {
    assert.equal(permitsLocalUser(request('http://127.0.0.1'), 'http://127.0.0.1:80'), true);
    assert.equal(permitsLocalUser(request('http://127.0.0.1:80'), 'http://127.0.0.1'), true);
    assert.equal(permitsLocalUser(request(ORIGIN), 'HTTP://127.0.0.1:17832'), true);
  });
});

describe('permitsLocalUser request origin', () => {
  it('requires the request origin to equal the configured origin exactly', () => {
    assert.equal(permitsLocalUser(request('https://127.0.0.1:17832'), ORIGIN), false);
    assert.equal(permitsLocalUser(request('http://localhost:17832'), ORIGIN), false);
    assert.equal(permitsLocalUser(request('http://[::1]:17832'), ORIGIN), false);
    assert.equal(permitsLocalUser(request('http://127.0.0.1:17833'), ORIGIN), false);
    assert.equal(permitsLocalUser(request('http://127.0.0.2:17832'), ORIGIN), false);
  });

  it('compares only the origin: path, query and trailing slash on the request do not matter', () => {
    assert.equal(permitsLocalUser(request(ORIGIN), ORIGIN), true);
    assert.equal(permitsLocalUser(request(`${ORIGIN}/`), ORIGIN), true);
    assert.equal(permitsLocalUser(request(`${ORIGIN}/japanese`), ORIGIN), true);
    assert.equal(permitsLocalUser(request(`${ORIGIN}/japanese?review=1#top`), ORIGIN), true);
  });

  it('returns false when the request URL or its headers cannot be read (try/catch)', () => {
    assert.equal(permitsLocalUser(brokenUrlRequest('not a url'), ORIGIN), false);
    assert.equal(permitsLocalUser(throwingHeadersRequest(ORIGIN), ORIGIN), false);
    // The malformed configured origin is checked inside the same try block.
    assert.equal(permitsLocalUser(request(ORIGIN), '::::'), false);
  });
});

describe('permitsLocalUser proxy headers', () => {
  it('rejects any of the four proxy headers, even with an empty value', () => {
    for (const name of ['forwarded', 'x-forwarded-host', 'x-forwarded-for', 'x-forwarded-proto']) {
      assert.equal(permitsLocalUser(request(ORIGIN, { [name]: '' }), ORIGIN), false, name);
      assert.equal(permitsLocalUser(request(ORIGIN, { [name]: 'value' }), ORIGIN), false, name);
    }
    // Header lookup is case-insensitive.
    assert.equal(permitsLocalUser(request(ORIGIN, { Forwarded: 'for=1.2.3.4' }), ORIGIN), false);
  });
});

describe('permitsLocalUser origin header', () => {
  it('rejects a contradicting origin header and allows a matching or absent one', () => {
    assert.equal(permitsLocalUser(request(ORIGIN, { origin: ORIGIN }), ORIGIN), true);
    assert.equal(permitsLocalUser(request(ORIGIN, { origin: 'https://evil.test' }), ORIGIN), false);
    assert.equal(permitsLocalUser(request(ORIGIN, { origin: `${ORIGIN}/` }), ORIGIN), false);
    assert.equal(
      permitsLocalUser(request(ORIGIN, { origin: 'HTTP://127.0.0.1:17832' }), ORIGIN),
      false,
    );
    assert.equal(permitsLocalUser(request(ORIGIN), ORIGIN), true);
    // Rough edge: the check is `if (origin && …)`, so an empty origin header
    // reads as absent and passes.
    assert.equal(permitsLocalUser(request(ORIGIN, { origin: '' }), ORIGIN), true);
  });
});

describe('permitsLocalUser sec-fetch-site header', () => {
  it('allows only same-origin/none (or absent), and treats an empty value as absent', () => {
    assert.equal(
      permitsLocalUser(request(ORIGIN, { 'sec-fetch-site': 'same-origin' }), ORIGIN),
      true,
    );
    assert.equal(permitsLocalUser(request(ORIGIN, { 'sec-fetch-site': 'none' }), ORIGIN), true);
    assert.equal(permitsLocalUser(request(ORIGIN), ORIGIN), true);
    assert.equal(
      permitsLocalUser(request(ORIGIN, { 'sec-fetch-site': 'same-site' }), ORIGIN),
      false,
    );
    assert.equal(
      permitsLocalUser(request(ORIGIN, { 'sec-fetch-site': 'cross-site' }), ORIGIN),
      false,
    );
    // Comparison is case-sensitive; only the two exact lowercase words pass.
    assert.equal(
      permitsLocalUser(request(ORIGIN, { 'sec-fetch-site': 'SAME-ORIGIN' }), ORIGIN),
      false,
    );
    assert.equal(permitsLocalUser(request(ORIGIN, { 'sec-fetch-site': '' }), ORIGIN), true);
  });
});

describe('permitsLocalUser overall', () => {
  it('allows a plain request on the configured loopback origin', () => {
    assert.equal(permitsLocalUser(request(ORIGIN), ORIGIN), true);
    assert.equal(permitsLocalUser(request(`${ORIGIN}/japanese`), ORIGIN), true);
  });

  it('rejects as soon as any single check fails, even when the rest is clean', () => {
    const clean = { origin: ORIGIN, 'sec-fetch-site': 'same-origin' };
    assert.equal(permitsLocalUser(request(ORIGIN, clean), ORIGIN), true);
    assert.equal(
      permitsLocalUser(request(ORIGIN, { ...clean, 'sec-fetch-site': 'cross-site' }), ORIGIN),
      false,
    );
    assert.equal(
      permitsLocalUser(request(ORIGIN, { ...clean, origin: 'https://evil.test' }), ORIGIN),
      false,
    );
    assert.equal(
      permitsLocalUser(request(ORIGIN, { ...clean, forwarded: 'for=1.2.3.4' }), ORIGIN),
      false,
    );
    // A hostile proxy header on the wrong port fails the origin check first.
    assert.equal(
      permitsLocalUser(
        request('http://127.0.0.1:17833', { ...clean, forwarded: 'for=1.2.3.4' }),
        ORIGIN,
      ),
      false,
    );
  });
});

describe('source guards', () => {
  it('keeps local-access.ts import-free and exporting exactly the two members in order', () => {
    const source = readFileSync(LOCAL_ACCESS_FILE, 'utf8');
    assert.deepEqual(source.match(/^\s*import\b.*$/gm) ?? [], []);
    assert.doesNotMatch(source, /\brequire\s*\(/);
    const exports = [...source.matchAll(/^export (?:type|interface|const|function) (\w+)/gm)].map(
      (match) => match[1],
    );
    assert.deepEqual(exports, ['LOCAL_OWNER_ID', 'permitsLocalUser']);
  });

  it('keeps account.ts re-exporting LOCAL_OWNER_ID and the real call-sites wired', () => {
    const account = readFileSync(ACCOUNT_FILE, 'utf8');
    assert.ok(
      account.includes("export { LOCAL_OWNER_ID } from './auth/local-access.ts';"),
      'account.ts no longer re-exports LOCAL_OWNER_ID',
    );

    const verify = readFileSync(VERIFY_FILE, 'utf8');
    assert.ok(verify.includes("import { permitsLocalUser } from './local-access';"));
    assert.ok(
      verify.includes('permitsLocalUser(request, process.env.JAPANESE_LOCAL_ORIGIN)'),
      'session resolution no longer consults the local gate',
    );

    const backup = readFileSync(BACKUP_FILE, 'utf8');
    assert.ok(backup.includes("await import('@/lib/auth/local-access')"));
    assert.ok(backup.includes('!permitsLocalUser(request, process.env.JAPANESE_LOCAL_ORIGIN)'));

    const deleteAccount = readFileSync(DELETE_ACCOUNT_FILE, 'utf8');
    assert.ok(deleteAccount.includes("import { LOCAL_OWNER_ID } from '@/lib/auth/local-access';"));
    assert.ok(deleteAccount.includes('user.id === LOCAL_OWNER_ID'));
  });

  it('leaves the old Japanese test assertions intact', () => {
    // `tests/japanese.test.ts` only asserts `permitsLocalUser` (it never names
    // LOCAL_OWNER_ID); its local-access test is referenced, not moved.
    const source = readFileSync(OLD_JAPANESE_TEST, 'utf8');
    assert.ok(
      source.includes("import { permitsLocalUser } from '../src/lib/auth/local-access.ts';"),
    );
    assert.ok(
      source.includes("test('local access is opt-in and rejects foreign origin and proxy hosts'"),
    );
    assert.ok(source.includes('permitsLocalUser(new Request(origin), undefined), false'));
    assert.ok(source.includes('permitsLocalUser(new Request(origin), origin), true'));
    for (const header of [
      "origin: 'https://evil.test'",
      "'sec-fetch-site': 'cross-site'",
      "'x-forwarded-host': 'evil.test'",
      "'x-forwarded-proto': 'https'",
    ]) {
      assert.ok(source.includes(header), `old test lost: ${header}`);
    }
    assert.ok(source.includes("new Request('http://localhost:17832')"));
    assert.equal(source.trimEnd().split('\n').length, 66);
  });
});
