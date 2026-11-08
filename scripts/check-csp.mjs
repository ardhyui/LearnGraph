#!/usr/bin/env node
/**
 * CI check on the production build (`vite preview`): the Content-Security-Policy
 * must not allow inline scripts, every inline <script> on a page must carry that
 * response's nonce or match a hash the policy allows, and the nonce must change
 * on every response. The smoke test runs against `vite dev`, which still allows
 * inline scripts, so this is where a script without a nonce would be caught.
 *
 *   BASE_URL=http://127.0.0.1:8083 node scripts/check-csp.mjs
 */
import { createHash } from 'node:crypto';

const BASE = process.env.BASE_URL;
// Public pages (others redirect a visitor without a session to /sign-in).
const PAGES = ['/sign-in', '/privacy', '/forgot-password'];

/**
 * Problems with one page's scripts under its policy (empty when fine).
 * @param {string} html
 * @param {string} csp
 * @returns {string[]}
 */
export function checkPage(html, csp) {
  const problems = [];
  const scriptSrc = /(?:^|;)\s*script-src ([^;]*)/.exec(csp)?.[1]?.trim().split(/\s+/) ?? [];
  if (!scriptSrc.length) return ['no script-src directive'];
  if (scriptSrc.includes("'unsafe-inline'")) problems.push("script-src allows 'unsafe-inline'");
  if (scriptSrc.includes("'unsafe-eval'")) problems.push("script-src allows 'unsafe-eval'");
  const nonce = scriptSrc.map((s) => /^'nonce-(.+)'$/.exec(s)?.[1]).find(Boolean);
  const hashes = new Set(scriptSrc.map((s) => /^'sha256-(.+)'$/.exec(s)?.[1]).filter(Boolean));
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const nonceAttr = /\bnonce="([^"]*)"/.exec(attrs)?.[1];
    const src = /\bsrc="([^"]*)"/.exec(attrs)?.[1];
    if (src !== undefined) {
      if (/^(?:https?:)?\/\//.test(src) && nonceAttr !== nonce) problems.push(`external script without the nonce: ${src}`);
      continue;
    }
    if (nonce && nonceAttr === nonce) continue;
    const hash = createHash('sha256').update(body, 'utf8').digest('base64');
    if (!hashes.has(hash)) problems.push(`inline script without the nonce or an allowed hash: ${body.slice(0, 80)}`);
  }
  return problems;
}

/**
 * GET a page, trying again (up to 3 times) when the connection drops: the
 * server may close an idle keep-alive socket just as the next request reuses
 * it, which a busy machine makes more likely. A server that is down still fails.
 * @param {string} url
 */
async function getPage(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, { headers: { accept: 'text/html' } });
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = [];
  const nonces = [];
  for (const path of PAGES) {
    const res = await getPage(`${BASE}${path}`);
    const csp = res.headers.get('content-security-policy') ?? '';
    const html = await res.text();
    const scripts = (html.match(/<script\b/gi) ?? []).length;
    nonces.push(/'nonce-([^']+)'/.exec(csp)?.[1]);
    const found = checkPage(html, csp);
    if (!scripts) found.push('no scripts found (is this the app?)');
    console.log(`${found.length ? 'FAIL' : 'PASS'} ${path} — HTTP ${res.status}, ${scripts} scripts`);
    problems.push(...found.map((p) => `${path}: ${p}`));
  }
  if (nonces.some((n) => !n)) problems.push('a page was served without a nonce');
  if (new Set(nonces).size !== nonces.length) problems.push('the nonce did not change between responses');
  for (const p of problems) console.error(`  ${p}`);
  console.log(problems.length ? `CSP check failed (${problems.length})` : 'CSP check passed');
  process.exit(problems.length ? 1 : 0);
}
