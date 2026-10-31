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
