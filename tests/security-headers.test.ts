/**
 * Security response headers (src/lib/security-headers.ts).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContentSecurityPolicy,
  isHttpsRequest,
  securityHeaders,
  withSecurityHeaders,
} from '../src/lib/security-headers.ts';

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
