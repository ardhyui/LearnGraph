/**
 * Direct unit tests for the production CSP gate `scripts/check-csp.mjs`
 * (pure `checkPage(html, csp)`).
 *
 * The smoke test runs against `vite dev`, which still allows inline scripts,
 * so `checkPage` inside `npm run ci` is where a script without its response's
 * nonce or an allowed hash would be caught — until now it was only exercised
 * indirectly against a live `vite preview`. The module's behaviour is not
 * changed by this file: the tests import the `.mjs` directly and lock the
 * current contract, rough edges included (the directive is read with one
 * regex, not by a real CSP parser). `main` is guarded by `import.meta.url`, so
 * importing the module performs no fetch and needs no `BASE_URL`; the guard
 * itself and the public page list are locked as static checks on the source.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkPage } from '../scripts/check-csp.mjs';

const SCRIPT_FILE = join(import.meta.dirname, '..', 'scripts', 'check-csp.mjs');

const sha256 = (body: string) => createHash('sha256').update(body, 'utf8').digest('base64');

describe('script-src directive parsing', () => {
  it('returns no problems for a page without scripts', () => {
    assert.deepEqual(checkPage('<!doctype html><html><body></body></html>', "script-src 'self'"), []);
  });

  it('rejects a policy without script-src', () => {
    assert.deepEqual(checkPage('<html></html>', ''), ['no script-src directive']);
    assert.deepEqual(checkPage('<html></html>', "default-src 'self'"), ['no script-src directive']);
    assert.deepEqual(checkPage('<html></html>', 'script-src'), ['no script-src directive']);
  });

  it('treats an empty script-src value as an allowlist that permits nothing', () => {
    // `''.split(/\s+/)` is `['']`, so `script-src ;` (or `script-src ` with
    // nothing after it) passes the "no directive" guard: it is not reported
    // as a missing directive, it just allows no nonce and no hash.
    assert.deepEqual(checkPage('<html></html>', 'script-src ;'), []);
    assert.deepEqual(checkPage('<html></html>', 'script-src '), []);
    assert.deepEqual(checkPage('<script>a()</script>', 'script-src ;'), [
      'inline script without the nonce or an allowed hash: a()',
    ]);
  });

  it('finds the directive at the start and after a semicolon', () => {
    assert.deepEqual(checkPage('<html></html>', "script-src 'unsafe-inline'"), [
      "script-src allows 'unsafe-inline'",
    ]);
    assert.deepEqual(checkPage('<html></html>', "default-src 'self'; script-src 'unsafe-inline'"), [
      "script-src allows 'unsafe-inline'",
    ]);
  });

  it('splits values on spaces and tolerates extra spaces around the list', () => {
    // The captured value is trimmed before splitting, so a double space after
    // `script-src` (or between values) still parses.
    assert.deepEqual(
      checkPage('<html></html>', "script-src   'unsafe-inline'  'unsafe-eval' "),
      ["script-src allows 'unsafe-inline'", "script-src allows 'unsafe-eval'"],
    );
  });

  it('only looks for the directive at the start or after a semicolon', () => {
    assert.deepEqual(
      checkPage('<html></html>', "default-src 'self' script-src 'unsafe-inline'"),
      ['no script-src directive'],
    );
    assert.deepEqual(checkPage('<html></html>', "SCRIPT-SRC 'unsafe-inline'"), [
      'no script-src directive',
    ]);
  });
});

describe("'unsafe-inline' and 'unsafe-eval'", () => {
  it('reports each unsafe value once, inline before eval regardless of policy order', () => {
    assert.deepEqual(checkPage('<html></html>', "script-src 'self' 'unsafe-inline'"), [
      "script-src allows 'unsafe-inline'",
    ]);
    assert.deepEqual(checkPage('<html></html>', "script-src 'self' 'unsafe-eval'"), [
      "script-src allows 'unsafe-eval'",
    ]);
    assert.deepEqual(checkPage('<html></html>', "script-src 'unsafe-eval' 'unsafe-inline'"), [
      "script-src allows 'unsafe-inline'",
      "script-src allows 'unsafe-eval'",
    ]);
  });

  it('reports unsafe values before any per-script problems', () => {
    assert.deepEqual(
      checkPage('<script>a()</script>', "script-src 'unsafe-eval' 'unsafe-inline'"),
      [
        "script-src allows 'unsafe-inline'",
        "script-src allows 'unsafe-eval'",
        'inline script without the nonce or an allowed hash: a()',
      ],
    );
  });

  it('passes a policy without the unsafe values', () => {
    assert.deepEqual(checkPage('<script nonce="N">a()</script>', "script-src 'self' 'nonce-N'"), []);
  });
});

describe('nonce', () => {
  it('lets an inline script through when its nonce matches the policy', () => {
    assert.deepEqual(checkPage('<script nonce="X">a()</script>', "script-src 'nonce-X'"), []);
  });

  it('rejects a mismatched nonce unless the body hash is allowed', () => {
    assert.deepEqual(checkPage('<script nonce="Y">a()</script>', "script-src 'nonce-X'"), [
      'inline script without the nonce or an allowed hash: a()',
    ]);
    assert.deepEqual(
      checkPage('<script nonce="Y">a()</script>', `script-src 'nonce-X' 'sha256-${sha256('a()')}'`),
      [],
    );
  });

  it('extracts a nonce with base64 characters intact', () => {
    const nonce = 'AbC+/12=';
    assert.deepEqual(
      checkPage(`<script nonce="${nonce}">a()</script>`, `script-src 'nonce-${nonce}'`),
      [],
    );
    assert.deepEqual(checkPage('<script nonce="other">a()</script>', `script-src 'nonce-${nonce}'`), [
      'inline script without the nonce or an allowed hash: a()',
    ]);
  });

  it('uses the first nonce in the policy', () => {
    assert.deepEqual(checkPage('<script nonce="A">a()</script>', "script-src 'nonce-A' 'nonce-B'"), []);
    assert.deepEqual(checkPage('<script nonce="B">a()</script>', "script-src 'nonce-A' 'nonce-B'"), [
      'inline script without the nonce or an allowed hash: a()',
    ]);
  });
});

describe('allowed hashes', () => {
  it('hashes the exact body, indentation and newlines included', () => {
    const body = '\n  const a = 1;\n  console.log(a);\n';
    assert.deepEqual(
      checkPage(`<script>${body}</script>`, `script-src 'sha256-${sha256(body)}'`),
      [],
    );
    assert.deepEqual(
      checkPage(`<script>${body}</script>`, `script-src 'sha256-${sha256(body.trim())}'`),
      [`inline script without the nonce or an allowed hash: ${body.slice(0, 80)}`],
    );
  });

  it('lets one hash cover several identical bodies', () => {
    assert.deepEqual(
      checkPage('<div><script>x</script></div><script>x</script>', `script-src 'sha256-${sha256('x')}'`),
      [],
    );
  });

  it('rejects a body whose hash is not in the policy', () => {
    assert.deepEqual(checkPage('<script>x</script>', `script-src 'sha256-${sha256('y')}'`), [
      'inline script without the nonce or an allowed hash: x',
    ]);
  });

  it('truncates the reported body to 80 characters', () => {
    const [problem] = checkPage(`<script>${'x'.repeat(120)}</script>`, "script-src 'self'");
    assert.match(problem, /^inline script without the nonce or an allowed hash: x{80}$/);
  });
});

describe('external scripts', () => {
  it('requires the policy nonce on https and protocol-relative sources', () => {
    assert.deepEqual(
      checkPage('<script src="https://cdn.example.com/a.js"></script>', "script-src 'nonce-N'"),
      ['external script without the nonce: https://cdn.example.com/a.js'],
    );
    assert.deepEqual(
      checkPage('<script src="//cdn.example.com/a.js"></script>', "script-src 'nonce-N'"),
      ['external script without the nonce: //cdn.example.com/a.js'],
    );
    assert.deepEqual(
      checkPage('<script src="https://cdn.example.com/a.js" nonce="M"></script>', "script-src 'nonce-N'"),
      ['external script without the nonce: https://cdn.example.com/a.js'],
    );
    assert.deepEqual(
      checkPage('<script src="https://cdn.example.com/a.js" nonce="N"></script>', "script-src 'nonce-N'"),
      [],
    );
  });

  it('ignores local, data: and ftp: sources entirely', () => {
    // Only `(?:https?:)?//` counts as external; anything else — even with a
    // mismatched nonce — is skipped without a check.
    const csp = "script-src 'nonce-N'";
    assert.deepEqual(checkPage('<script src="/assets/app.js"></script>', csp), []);
    assert.deepEqual(checkPage('<script src="/assets/app.js" nonce="WRONG"></script>', csp), []);
    assert.deepEqual(checkPage('<script src="data:text/javascript,alert(1)"></script>', csp), []);
    assert.deepEqual(checkPage('<script src="ftp://cdn.example.com/a.js"></script>', csp), []);
  });

  it('never flags external scripts when the policy has no nonce', () => {
    // Rough edge: the mismatch check is `nonceAttr !== nonce`, and without a
    // nonce in the policy both sides are undefined.
    assert.deepEqual(
      checkPage('<script src="https://cdn.example.com/a.js"></script>', "script-src 'self'"),
      [],
    );
  });
});

describe('multiple tags and tag shapes', () => {
  it('collects problems in document order', () => {
    assert.deepEqual(
      checkPage(
        '<script>a()</script><script src="https://cdn.example.com/b.js"></script>',
        "script-src 'nonce-N'",
      ),
      [
        'inline script without the nonce or an allowed hash: a()',
        'external script without the nonce: https://cdn.example.com/b.js',
      ],
    );
  });

  it('recognises uppercase tags and extra attributes', () => {
    assert.deepEqual(
      checkPage('<SCRIPT TYPE="module">q()</SCRIPT>', `script-src 'sha256-${sha256('q()')}'`),
      [],
    );
    assert.deepEqual(
      checkPage(
        '<script nonce="N" type="module" defer src="https://cdn.example.com/c.js"></script>',
        "script-src 'nonce-N'",
      ),
      [],
    );
  });
});

describe('static guards on the module', () => {
  const source = readFileSync(SCRIPT_FILE, 'utf8');

  it('exports checkPage as the unit under test', () => {
    assert.equal(source.includes('export function checkPage(html, csp)'), true);
  });

  it('runs main only when executed as a script, never on import', () => {
    assert.equal(
      source.includes('if (import.meta.url === `file://${process.argv[1]}`) {'),
      true,
    );
  });

  it('checks exactly the three public pages', () => {
    assert.equal(
      source.includes("const PAGES = ['/sign-in', '/privacy', '/forgot-password'];"),
      true,
    );
  });
});
