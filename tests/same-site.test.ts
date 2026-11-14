/**
 * Direct unit tests for the Fetch-Metadata isolation decision.
 *
 * `sameSiteAllowed` (src/lib/auth/same-site.ts) is the pure extraction of the
 * decision table that used to live inline in `assertSameSiteRequest`
 * (src/lib/auth/isolation.server.ts). That wrapper stays server-only because
 * it reads the live request via TanStack `getRequest()` (AsyncLocalStorage),
 * which cannot be set up from a plain Node test — so the decision itself is
 * locked here, plus static guards that the server-only wiring is preserved.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sameSiteAllowed } from '../src/lib/auth/same-site.ts';

/**
 * Frozen snapshot of the pre-extraction decision (verbatim from
 * `assertSameSiteRequest` before the `sameSiteAllowed` refactor). The
 * equivalence test below proves the extraction changed no outcome; keep this
 * oracle untouched unless the decision table is deliberately changed.
 */
function legacyDecision(
  site: string | null,
  dest: string | null,
  mode: string | null,
  method: string,
): boolean {
  if (!site || site === 'same-origin' || site === 'none') return true;
  const isTopLevelGet =
    mode === 'navigate' &&
    method === 'GET' &&
    dest !== 'object' &&
    dest !== 'embed';
  return isTopLevelGet;
}

describe('sameSiteAllowed decision table', () => {
  it('allows requests without sec-fetch-site (non-browser: SSR, server-to-server)', () => {
    for (const mode of [null, 'navigate', 'cors', 'no-cors']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
        assert.equal(
          sameSiteAllowed(null, 'document', mode, method),
          true,
          `site absent, mode=${mode}, method=${method}`,
        );
      }
    }
  });

  it('allows the app’s own origin (same-origin) for any method/mode', () => {
    for (const mode of [null, 'navigate', 'cors', 'no-cors']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
        assert.equal(
          sameSiteAllowed('same-origin', 'empty', mode, method),
          true,
          `same-origin, mode=${mode}, method=${method}`,
        );
      }
    }
  });

  it('allows direct loads (same-none: address bar / bookmark)', () => {
    assert.equal(sameSiteAllowed('none', 'document', 'navigate', 'GET'), true);
    assert.equal(sameSiteAllowed('none', null, null, 'GET'), true);
  });

  it('rejects scripted same-site requests (sibling app on a shared parent domain)', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      for (const mode of [null, 'cors', 'no-cors', 'same-origin']) {
        assert.equal(
          sameSiteAllowed('same-site', 'empty', mode, method),
          false,
          `sibling fetch/XHR: mode=${mode}, method=${method}`,
        );
      }
    }
    // A same-site form POST arrives as a navigation, but not GET.
    assert.equal(
      sameSiteAllowed('same-site', 'document', 'navigate', 'POST'),
      false,
      'sibling form POST',
    );
  });

  it('rejects scripted cross-site requests (fetch/XHR/form POST)', () => {
    assert.equal(sameSiteAllowed('cross-site', 'empty', 'cors', 'GET'), false);
    assert.equal(sameSiteAllowed('cross-site', 'empty', 'no-cors', 'GET'), false);
    assert.equal(sameSiteAllowed('cross-site', 'empty', null, 'GET'), false);
    assert.equal(sameSiteAllowed('cross-site', 'document', 'navigate', 'POST'), false);
    assert.equal(sameSiteAllowed('cross-site', 'empty', 'cors', 'PUT'), false);
    // Unknown header values are treated like any other cross-site caller.
    assert.equal(sameSiteAllowed('other-site', 'empty', 'cors', 'GET'), false);
  });

  it('allows top-level GET navigations even cross-site/same-site (OAuth callback, page loads)', () => {
    assert.equal(sameSiteAllowed('cross-site', 'document', 'navigate', 'GET'), true);
    assert.equal(sameSiteAllowed('same-site', 'document', 'navigate', 'GET'), true);
    assert.equal(sameSiteAllowed('cross-site', null, 'navigate', 'GET'), true);
  });

  it('rejects navigations framed as object/embed (page in a frame)', () => {
    assert.equal(sameSiteAllowed('cross-site', 'object', 'navigate', 'GET'), false);
    assert.equal(sameSiteAllowed('same-site', 'embed', 'navigate', 'GET'), false);
  });

  it('rejects non-GET navigations (cross-site form POST)', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
      assert.equal(
        sameSiteAllowed('cross-site', 'document', 'navigate', method),
        false,
        `navigate ${method}`,
      );
    }
  });

  it('rejects GET without navigate mode (cross-site fetch/XHR)', () => {
    assert.equal(sameSiteAllowed('cross-site', 'empty', 'cors', 'GET'), false);
    assert.equal(sameSiteAllowed('cross-site', 'document', null, 'GET'), false);
    assert.equal(sameSiteAllowed('same-site', 'document', 'same-origin', 'GET'), false);
  });

  it('matches the frozen pre-extraction decision for every header combination', () => {
    const sites = [null, 'same-origin', 'same-site', 'same-none', 'none', 'cross-site', 'other'];
    const dests = [null, 'document', 'object', 'embed', 'empty', 'audio'];
    const modes = [null, 'navigate', 'cors', 'no-cors', 'same-origin', 'websocket'];
    const methods = ['GET', 'POST', 'HEAD', 'PUT', 'DELETE', 'PATCH'];
    let checked = 0;
    for (const site of sites) {
      for (const dest of dests) {
        for (const mode of modes) {
          for (const method of methods) {
            assert.equal(
              sameSiteAllowed(site, dest, mode, method),
              legacyDecision(site, dest, mode, method),
              `site=${site}, dest=${dest}, mode=${mode}, method=${method}`,
            );
            checked += 1;
          }
        }
      }
    }
    assert.ok(checked > 1000, `exhaustive cross-product ran (${checked} combos)`);
  });
});

describe('same-site isolation wiring stays server-only', () => {
  const read = (p: string) =>
    fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  it('keeps the decision helper free of any import (pure module)', () => {
    const src = read('src/lib/auth/same-site.ts');
    assert.match(src, /export function sameSiteAllowed\(/);
    assert.equal(/^import\s/m.test(src), false);
    assert.equal(/require\(/.test(src), false);
  });

  it('keeps isolation as the server-only wrapper: .server.ts suffix, getRequest, CrossSiteRequestError', () => {
    assert.ok(fs.existsSync(new URL('../src/lib/auth/isolation.server.ts', import.meta.url)));
    const src = read('src/lib/auth/isolation.server.ts');
    assert.ok(src.includes('@tanstack/react-start/server'));
    assert.match(src, /export class CrossSiteRequestError extends Error/);
    assert.ok(src.includes('assertSameSiteRequest'));
    // The wrapper delegates the decision to the pure helper.
    assert.ok(src.includes('sameSiteAllowed('));
  });

  it('only .server.ts files in src/lib/auth may import @tanstack/react-start/server', () => {
    const dir = fs.readdirSync(
      new URL('../src/lib/auth/', import.meta.url),
    ) as string[];
    const offenders = dir.filter((name) => {
      if (!name.endsWith('.ts')) return false;
      const body = fs.readFileSync(
        path.join(new URL('../src/lib/auth/', import.meta.url).pathname, name),
        'utf8',
      );
      return body.includes('@tanstack/react-start/server') && !name.endsWith('.server.ts');
    });
    assert.deepEqual(offenders, []);
  });

  it('authMiddleware still asserts same-site before resolving the session user', () => {
    const src = read('src/lib/auth/middleware.ts');
    const assertIdx = src.indexOf('assertSameSiteRequest()');
    const requireIdx = src.indexOf('requireUserId()');
    assert.ok(assertIdx >= 0, 'calls assertSameSiteRequest()');
    assert.ok(requireIdx >= 0, 'calls requireUserId()');
    assert.ok(assertIdx < requireIdx, 'same-site assert runs before requireUserId');
    assert.ok(src.includes("./isolation.server") || src.includes("'./isolation.server'"));
  });

  it('keeps CrossSiteRequestError an expected error name in src/lib/errors.ts', () => {
    const src = read('src/lib/errors.ts');
    assert.ok(src.includes("'CrossSiteRequestError'"), 'listed in EXPECTED_NAMES');
  });
});
