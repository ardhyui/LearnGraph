/**
 * Security response headers (src/lib/security-headers.ts).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  NO_FLASH_SCRIPT_SHA256,
  buildContentSecurityPolicy,
  createNonce,
  isHttpsRequest,
  securityHeaders,
  withSecurityHeaders,
} from '../src/lib/security-headers.ts';
import { NO_FLASH_SCRIPT } from '../src/lib/theme-script.ts';

const directive = (csp: string, name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));

describe('Content-Security-Policy', () => {
  it('locks the app to its own origin and forbids framing/plugins', () => {
    const csp = buildContentSecurityPolicy();
    assert.equal(directive(csp, 'default-src'), "default-src 'self'");
    assert.equal(directive(csp, 'frame-ancestors'), "frame-ancestors 'none'");
    assert.equal(directive(csp, 'object-src'), "object-src 'none'");
    assert.equal(directive(csp, 'base-uri'), "base-uri 'self'");
    assert.equal(directive(csp, 'form-action'), "form-action 'self'");
  });

  it('never allows eval or arbitrary script hosts', () => {
    const csp = buildContentSecurityPolicy({ dev: true });
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.equal(directive(csp, 'script-src'), "script-src 'self' 'unsafe-inline'");
    assert.doesNotMatch(csp, /(^|\s)\*(\s|;|$)/);
  });

  it('in production allows only this origin, this response’s nonce and the theme script — no inline scripts', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123+/=' });
    assert.equal(directive(csp, 'script-src'), `script-src 'self' 'nonce-abc123+/=' 'sha256-${NO_FLASH_SCRIPT_SHA256}'`);
    assert.doesNotMatch(directive(csp, 'script-src') ?? '', /unsafe-inline/);
    // Without a nonce (nothing to render scripts for), still no inline scripts.
    assert.doesNotMatch(directive(buildContentSecurityPolicy(), 'script-src') ?? '', /unsafe-inline|nonce-/);
    // Styles keep inline: components use style attributes, which a nonce can't cover.
    assert.equal(directive(csp, 'style-src'), "style-src 'self' 'unsafe-inline'");
  });

  it('the theme script hash matches the script the page renders', () => {
    assert.equal(createHash('sha256').update(NO_FLASH_SCRIPT, 'utf8').digest('base64'), NO_FLASH_SCRIPT_SHA256);
  });

  it('makes a new 128-bit nonce for every response', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    assert.equal(nonces.size, 50);
    for (const n of nonces) assert.equal(Buffer.from(n, 'base64').length, 16);
    const h = securityHeaders({ nonce: 'n0nce' });
    assert.match(h['Content-Security-Policy'], /script-src 'self' 'nonce-n0nce' /);
  });

  it('only opens websockets for the dev server', () => {
    assert.doesNotMatch(directive(buildContentSecurityPolicy(), 'connect-src') ?? '', /ws:/);
    assert.match(directive(buildContentSecurityPolicy({ dev: true }), 'connect-src') ?? '', /ws:/);
  });
});

describe('securityHeaders', () => {
  it('sends the standard hardening headers', () => {
    const h = securityHeaders();
    assert.equal(h['X-Frame-Options'], 'DENY');
    assert.equal(h['X-Content-Type-Options'], 'nosniff');
    assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.match(h['Permissions-Policy'], /camera=\(\)/);
    assert.ok(h['Content-Security-Policy']);
  });

  it('adds HSTS only for HTTPS outside dev', () => {
    assert.equal(securityHeaders({ https: false })['Strict-Transport-Security'], undefined);
    assert.equal(securityHeaders({ https: true, dev: true })['Strict-Transport-Security'], undefined);
    assert.match(securityHeaders({ https: true })['Strict-Transport-Security'], /max-age=\d+/);
  });
});

describe('withSecurityHeaders', () => {
  it('adds headers in place and keeps headers set by the handler', async () => {
    const res = new Response('ok', {
      status: 201,
      headers: { 'content-type': 'text/plain', 'x-frame-options': 'SAMEORIGIN' },
    });
    const out = withSecurityHeaders(res);
    assert.equal(out, res);
    assert.equal(out.status, 201);
    assert.equal(out.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(out.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await out.text(), 'ok');
  });

  it('copies responses whose headers are immutable (redirects)', () => {
    const redirect = Response.redirect('http://localhost/sign-in', 307);
    const out = withSecurityHeaders(redirect);
    assert.equal(out.status, 307);
    assert.equal(out.headers.get('location'), 'http://localhost/sign-in');
    assert.ok(out.headers.get('content-security-policy'));
  });
});

describe('isHttpsRequest', () => {
  it('trusts x-forwarded-proto from the proxy, else the URL', () => {
    assert.equal(isHttpsRequest(new Request('http://x/', { headers: { 'x-forwarded-proto': 'https' } })), true);
    assert.equal(isHttpsRequest(new Request('https://x/', { headers: { 'x-forwarded-proto': 'http' } })), false);
    assert.equal(isHttpsRequest(new Request('https://x/')), true);
    assert.equal(isHttpsRequest(new Request('http://x/')), false);
  });
});

describe('CI check of the production CSP (scripts/check-csp.mjs)', () => {
  const csp = buildContentSecurityPolicy({ nonce: 'N1' });
  const theme = `<script>${NO_FLASH_SCRIPT}</script>`;

  it('passes a page whose inline scripts carry the nonce or the theme hash', async () => {
    const { checkPage } = await import('../scripts/check-csp.mjs');
    const html = `<head>${theme}<script nonce="N1">window.$_TSR={}</script></head><script type="module" src="/assets/main.js"></script>`;
    assert.deepEqual(checkPage(html, csp), []);
  });

  it('catches an inline script without the nonce, a wrong nonce, and a relaxed policy', async () => {
    const { checkPage } = await import('../scripts/check-csp.mjs');
    assert.equal(checkPage('<script>alert(1)</script>', csp).length, 1);
    assert.equal(checkPage('<script nonce="other">alert(1)</script>', csp).length, 1);
    assert.equal(checkPage('<script src="https://cdn.example/x.js"></script>', csp).length, 1);
    const relaxed = buildContentSecurityPolicy({ dev: true });
    assert.match(checkPage(theme, relaxed).join(), /unsafe-inline/);
  });
});
