#!/usr/bin/env node
/**
 * Headless smoke test against a running server (default http://127.0.0.1:8080):
 * redirect to sign-in, sign up, every main page renders without console
 * errors, sign out, sign in again.
 *
 *   npm run dev            # in another terminal
 *   npm run smoke          # or: BASE_URL=http://127.0.0.1:8081 npm run smoke
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const PAGES = [
  ['/', 'Dashboard'],
  ['/profile', null],
  ['/admin/learners', null],
  ['/admin/psychometrics', null],
  ['/admin/concepts', null],
  ['/admin/prerequisites', null],
  ['/admin/states', null],
  ['/recommendations', null],
  ['/gaps', null],
  ['/graph', null],
  ['/domains', null],
  ['/combined-graph', null],
  ['/edu-psychology', null],
  ['/about', null],
  ['/status', null],
  ['/tests', null],
  ['/data-entry', null],
];

const email = `smoke-${Date.now()}@example.test`;
const password = `smoke-${Math.random().toString(36).slice(2)}-pw`;
const results = [];
let failed = false;
const check = (ok, label, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

try {
  await page.goto(`${BASE}/admin/concepts`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/sign-in/);
  await page.waitForFunction(() => document.readyState === 'complete');
  check(page.url().includes('/sign-in'), 'signed-out visitor is redirected to /sign-in');

  // Security headers on every response (CSP, anti-framing, nosniff …).
  {
    const res = await fetch(`${BASE}/sign-in`);
    const csp = res.headers.get('content-security-policy') ?? '';
    check(
      /frame-ancestors 'none'/.test(csp) &&
        /object-src 'none'/.test(csp) &&
        res.headers.get('x-frame-options') === 'DENY' &&
        res.headers.get('x-content-type-options') === 'nosniff' &&
        !!res.headers.get('referrer-policy'),
      'security headers are sent',
      csp ? '' : 'no Content-Security-Policy header',
    );
    // Server functions refuse cross-site calls (CSRF).
    const xs = await fetch(`${BASE}/_serverFn/smoke-csrf-probe`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    });
    check(xs.status === 403, 'cross-site server function call is rejected', `HTTP ${xs.status}`);
  }

  // Sign up
  // Retry the toggle until hydrated (a click before hydration is a no-op).
  for (let i = 0; i < 20 && !(await page.locator('#name').isVisible()); i++) {
    await page.getByRole('button', { name: 'Create one' }).click();
    await page.waitForTimeout(500);
  }
  await page.fill('#name', 'Smoke Tester');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL((u) => u.pathname === '/admin/concepts', { timeout: 30000 });
  check(true, 'sign-up works and returns to the requested page');

  // Demo data is seeded for a new account
  await page.getByText('Fractions', { exact: false }).first().waitFor({ timeout: 30000 }).then(
    () => check(true, 'demo data seeded into the new workspace'),
    () => check(false, 'demo data seeded into the new workspace'),
  );

  for (const [path] of PAGES) {
    const before = errors.length;
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const status = res?.status() ?? 0;
    const hasSidebar = await page.getByText('LearnGraph').first().isVisible().catch(() => false);
    const newErrors = errors.slice(before);
    check(
      status === 200 && hasSidebar && newErrors.length === 0 && new URL(page.url()).pathname === path,
      `page ${path} renders`,
      `HTTP ${status}${newErrors.length ? `, ${newErrors.join(' | ')}` : ''}`,
    );
  }

  // Dashboard "Today": the core study loop. The demo learner's progress is
  // shown (seeded states belong to the demo learners), a due review can be
  // marked as remembered, and "I've got it" on a recommended concept raises
  // the mastered count — all saved server-side and reloaded.
  {
    const before = errors.length;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const today = page.getByTestId('study-today');
    const mastered = today.getByTestId('mastered-count');
    await mastered.waitFor({ timeout: 30000 });
    const masteredBefore = Number(await mastered.innerText());
    check(masteredBefore > 0, 'dashboard shows the demo learner progress', `${masteredBefore} mastered`);

    const reviews = today.getByRole('list', { name: 'Reviews due' }).getByRole('listitem');
    const reviewsBefore = await reviews.count();
    if (reviewsBefore > 0) {
      await reviews.first().getByRole('button', { name: 'I remembered it' }).click();
      const saved = await today
        .getByText('will come back after a longer break', { exact: false })
        .waitFor({ timeout: 15000 })
        .then(() => true, () => false);
      check(saved, 'dashboard: a due review can be marked as remembered');
    } else {
      check(false, 'dashboard: a due review can be marked as remembered', 'no reviews due for the demo learner');
    }

    const next = today.getByRole('list', { name: 'Recommended next concepts' }).getByRole('listitem');
    await next.first().waitFor({ timeout: 15000 }).catch(() => {});
    if ((await next.count()) > 0) {
      await next.first().getByRole('button', { name: "I've got it" }).click();
      await today.getByText('is marked as mastered', { exact: false }).waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForFunction(
        (n) => Number(document.querySelector('[data-testid="mastered-count"]')?.textContent) > n,
        masteredBefore,
        { timeout: 15000 },
      ).catch(() => {});
      const masteredAfter = Number(await mastered.innerText());
      check(masteredAfter > masteredBefore, 'dashboard: "I\'ve got it" raises the mastered count', `${masteredBefore} → ${masteredAfter}`);
    } else {
      check(false, 'dashboard: "I\'ve got it" raises the mastered count', 'no recommended concept');
    }
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'dashboard study loop has no page errors', newErrors.join(' | '));
  }

  // Unknown URLs get the friendly 404 page (HTTP 404), with a way back home.
  {
    const before = errors.length;
    const res = await page.goto(`${BASE}/this-page-does-not-exist`, { waitUntil: 'networkidle' });
    const heading = await page
      .getByRole('heading', { name: 'Page not found' })
      .isVisible()
      .catch(() => false);
    const newErrors = errors.slice(before).filter((e) => !/404/.test(e));
    check(
      res?.status() === 404 && heading && newErrors.length === 0,
      'unknown URL shows the friendly 404 page',
      `HTTP ${res?.status()}${newErrors.length ? `, ${newErrors.join(' | ')}` : ''}`,
    );
    await page.getByRole('link', { name: 'Back to dashboard' }).click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 }).then(
      () => check(true, '404 page links back to the dashboard'),
      () => check(false, '404 page links back to the dashboard', page.url()),
    );
  }

  // Graph pages rebuild their React Flow graph from a useEffect keyed on the
  // buildGraph callback: the graph must actually render nodes, and picking a
  // learner must rebuild it (learner overlay) without page errors.
  for (const [path, label] of [
    ['/domains', 'domain graph'],
    ['/combined-graph', 'combined graph'],
  ]) {
    const before = errors.length;
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const nodes = page.locator('.react-flow__node');
    const select = page.locator('select').first();
    const firstLearner = await select
      .locator('option')
      .nth(1)
      .getAttribute('value', { timeout: 15000 })
      .catch(() => null);
    if (firstLearner) await select.selectOption(firstLearner);
    const rendered = await nodes
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true, () => false);
    const count = await nodes.count();
    const newErrors = errors.slice(before);
    check(
      Boolean(firstLearner) && rendered && count > 1 && newErrors.length === 0,
      `${label} renders nodes for a selected learner`,
      `${count} nodes${firstLearner ? '' : ', no learner to select'}${newErrors.length ? `, ${newErrors.join(' | ')}` : ''}`,
    );
  }

  // The in-app "Functional Tests" page drives the whole engine (ZPD, gaps,
  // SM-2 …) through the server — a good end-to-end check of the RPC layer.
  await page.goto(`${BASE}/tests`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Run All Tests' }).click();
  await page.getByRole('button', { name: 'Run All Tests' }).waitFor({ timeout: 180000 });
  const passedText = await page.locator('text=Passed').locator('xpath=preceding-sibling::div').first().innerText();
  const failedText = await page.locator('text=Failed').first().locator('xpath=preceding-sibling::div').first().innerText();
  // Every in-app check must pass (the review-queue bug was fixed in 2026-10).
  const KNOWN_FAILURES = 0;
  check(
    Number(failedText) <= KNOWN_FAILURES && Number(passedText) > 0,
    'in-app functional tests (/tests)',
    `${passedText} passed, ${failedText} failed`,
  );

  // Server-side input validation: a concept id with ":" (the storage key
  // separator) is refused with a readable message, and nothing is saved.
  {
    await page.goto(`${BASE}/admin/concepts`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add Concept' }).first().click();
    await page.getByPlaceholder('e.g., linear-equations').fill('smoke:bad-id');
    await page.getByPlaceholder('e.g., Linear Equations').fill('Smoke Bad Id');
    await page.locator('form button[type="submit"]').click();
    const refused = await page
      .getByText('must not contain ":"', { exact: false })
      .first()
      .waitFor({ timeout: 15000 })
      .then(() => true, () => false);
    check(refused, 'invalid input is rejected server-side with a readable message');
  }

  // Sign out, then sign in again
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 10 && !page.url().includes('/sign-in'); i++) {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/sign-in/, { timeout: 3000 }).catch(() => {});
  }
  await page.waitForURL(/\/sign-in/);
  check(true, 'sign-out returns to /sign-in');

  await page.fill('#email', email);
  await page.fill('#password', 'wrong-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').waitFor({ timeout: 15000 });
  check(true, 'wrong password is rejected');

  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname === '/', { timeout: 30000 });
  check(true, 'sign-in works');

  // Brute-force protection: repeated wrong passwords get a friendly 429 message.
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  let limited = false;
  for (let i = 0; i < 10 && !limited; i++) {
    await p2.fill('#email', email);
    await p2.fill('#password', `wrong-password-${i}`);
    await p2.getByRole('button', { name: 'Sign in' }).click();
    await p2.waitForTimeout(800);
    limited = /Too many attempts/.test((await p2.getByRole('alert').allInnerTexts()).join(' '));
  }
  check(limited, 'repeated wrong passwords are rate-limited with a friendly message');
  await ctx2.close();
  await page.screenshot({ path: process.env.SMOKE_SCREENSHOT ?? '/tmp/learngraph-smoke.png' });
} catch (err) {
  check(false, 'smoke flow', err?.message ?? String(err));
} finally {
  await browser.close();
}

console.log(results.join('\n'));
process.exit(failed ? 1 : 0);
