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
// Answer key for the example quizzes (TypeScript, so run with --experimental-strip-types).
import { DEMO_QUESTIONS } from '../src/lib/evidence/demo-questions.ts';
import { makeDocx } from '../tests/support/docx.ts';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const PAGES = [
  ['/', 'Dashboard'],
  ['/profile', null],
  ['/admin/learners', null],
  ['/admin/psychometrics', null],
  ['/admin/concepts', null],
  ['/admin/prerequisites', null],
  ['/admin/curriculum', null],
  ['/admin/content', null],
  ['/admin/questions', null],
  ['/learn/arithmetic', null],
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

const ANSWER_KEY = new Map(DEMO_QUESTIONS.map((q) => [q.prompt, q]));

// What a page logs when the Vite dev server swaps a dependency bundle under it.
const VITE_DEP_RELOAD = /Failed to fetch dynamically imported module|Outdated Optimize Dep/;

/**
 * Wait until React owns `locator`'s element. On a busy machine `networkidle`
 * comes before hydration. Text typed into a form before that shows on screen
 * but never reaches React's state (so the form later submits empty fields),
 * and a click submits it the plain-HTML way. Call it before filling a form.
 */
async function untilHydrated(locator, timeout = 30000) {
  const el = await locator.elementHandle({ timeout }).catch(() => null);
  await locator
    .page()
    .waitForFunction((e) => !!e && Object.keys(e).some((k) => k.startsWith('__reactProps')), el, { timeout })
    .catch(() => {});
}

/**
 * Click `button` once React owns it, then wait for `shows` to become visible.
 * (A click-and-retry loop clicks a toggle twice on a slow machine, which undoes
 * the first click or hits the panel the first click opened.)
 */
async function clickWhenHydrated(button, shows, timeout = 30000) {
  await untilHydrated(button, 60000);
  await button.click();
  await shows.waitFor({ state: 'visible', timeout }).catch(() => {});
}

/**
 * Answer the open concept quiz inside `scope` (all right, or all wrong), check
 * the answers and wait for the graded result. Returns the result text.
 */
async function answerQuiz(scope, { right }) {
  const quiz = scope.getByTestId('concept-quiz');
  const groups = quiz.getByRole('group');
  await groups.first().waitFor({ timeout: 15000 });
  const n = await groups.count();
  for (let i = 0; i < n; i++) {
    const group = groups.nth(i);
    const prompt = (await group.locator('legend').innerText()).replace(/^\d+\.\s*/, '').trim();
    const q = ANSWER_KEY.get(prompt);
    if (!q) throw new Error(`no answer key for quiz question "${prompt}"`);
    const pick = right ? q.answer : q.options.find((o) => o !== q.answer);
    await group.getByRole('radio', { name: pick, exact: true }).check();
  }
  await quiz.getByRole('button', { name: 'Check my answers' }).click();
  const result = quiz.getByTestId('quiz-result');
  await result.waitFor({ timeout: 15000 });
  return result.innerText();
}

/** "Done" on a graded quiz: the Today panel announces the result and reloads. */
async function closeQuiz(scope) {
  await scope.getByTestId('quiz-result').getByRole('button', { name: 'Done' }).click();
  await scope.getByTestId('concept-quiz').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
}

const browser = await chromium.launch();
const page = await browser.newPage();
// The dev server compiles each page on its first visit, slowly on a busy machine.
page.setDefaultNavigationTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

/**
 * Before any check: in a fresh install the first visit makes the dev server
 * bundle the dependencies (over half a minute on a busy machine), and it
 * reloads the page when it finds more. Wait until /sign-in has loaded, React
 * owns it, and it then stays put for 15 seconds.
 */
async function warmUpDevServer() {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(180000);
  let lastLoad = Date.now();
  p.on('framenavigated', (f) => {
    if (f === p.mainFrame()) lastLoad = Date.now();
  });
  const deadline = Date.now() + 240000;
  await p.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' }).catch(() => {});
  while (Date.now() < deadline) {
    await untilHydrated(p.getByRole('button', { name: 'Create one' }), 60000);
    const hydratedAt = Date.now();
    await p.waitForTimeout(15000);
    if (lastLoad < hydratedAt) break;
  }
  await ctx.close();
}

try {
  await warmUpDevServer();
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

  // Roadmap M3: "How your data is handled" is public and linked from sign-in.
  {
    const ctxP = await browser.newContext();
    const pp = await ctxP.newPage();
    await pp.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
    const linked = await pp.getByRole('link', { name: 'How your data is handled' }).count();
    const res = await pp.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
    const h1 = (await pp.locator('h1').innerText().catch(() => '')).trim();
    check(
      linked > 0 && res?.status() === 200 && new URL(pp.url()).pathname === '/privacy' && h1 === 'How your data is handled',
      'privacy: the data-handling page is public and linked from sign-in',
      `${new URL(pp.url()).pathname}, "${h1}"`,
    );
    await ctxP.close();
  }

  // Sign up
  await clickWhenHydrated(page.getByRole('button', { name: 'Create one' }), page.locator('#name'));
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

  // Warm-up: in a fresh install the dev server finds some dependencies only when
  // a page first imports them, re-bundles them and reloads the open page. On a
  // busy machine that reload lands in the middle of a check. Open every page
  // once first, so it happens here; errors from this pass are not counted.
  // The account pages used later (password reset) are warmed up as well.
  {
    const before = errors.length;
    for (const path of [...PAGES.map(([p]) => p), '/forgot-password', '/reset-password?token=warm-up', '/privacy']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
    }
    errors.length = before;
  }

  const h1Counts = [];
  const titles = [];
  for (const [path] of PAGES) {
    let before = errors.length;
    let res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    // A late dependency reload after the warm-up is retried once: it is the dev
    // server's doing, not the page's.
    if (errors.slice(before).some((e) => VITE_DEP_RELOAD.test(e))) {
      before = errors.length;
      res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    }
    // Pages that draw on the client (the graphs) may still be rendering at
    // `networkidle`: wait for the page title before looking.
    await page.locator('h1').first().waitFor({ timeout: 30000 }).catch(() => {});
    const status = res?.status() ?? 0;
    // Desktop: the sidebar (or /status's own header) shows the brand; the phone
    // top bar's copy is hidden at this width, so match visible text only.
    const hasSidebar = await page.locator('text=LearnGraph >> visible=true').first().isVisible().catch(() => false);
    const newErrors = errors.slice(before);
    check(
      status === 200 && hasSidebar && newErrors.length === 0 && new URL(page.url()).pathname === path,
      `page ${path} renders`,
      `HTTP ${status}${newErrors.length ? `, ${newErrors.join(' | ')}` : ''}`,
    );
    const h1 = await page.locator('h1').count();
    if (h1 !== 1) h1Counts.push(`${path}: ${h1}`);
    titles.push([path, await page.title()]);
  }
  // Each page names itself in the browser tab (WCAG 2.4.2), not one shared title.
  {
    const bad = titles.filter(([, t]) => !/^\S.* · LearnGraph$/.test(t));
    const distinct = new Set(titles.map(([, t]) => t)).size === titles.length;
    const dash = titles.find(([p]) => p === '/')?.[1];
    check(
      bad.length === 0 && distinct && dash === 'Dashboard · LearnGraph',
      'every page has its own "<page> · LearnGraph" title',
      [...bad.map(([p, t]) => `${p}: "${t}"`), distinct ? '' : 'duplicate titles'].filter(Boolean).join('; '),
    );
  }
  // Screen readers: one page title per page (the sidebar brand is not a heading).
  check(h1Counts.length === 0, 'every page has exactly one <h1>', h1Counts.join('; '));

  // Navigation: learner pages are listed first; admin editors and developer
  // tools sit in collapsible groups that start closed, open on their own
  // pages, and remember the user's choice.
  {
    const before = errors.length;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const nav = page.locator('#app-sidebar');
    const manage = nav.getByRole('button', { name: 'Manage data' });
    const dev = nav.getByRole('button', { name: 'Developer tools' });
    const link = (name) => nav.getByRole('link', { name: new RegExp(`^${name}`) });
    const learnerVisible = (await link('Recommendations').isVisible()) && (await link('My Profile').isVisible());
    const adminHidden = !(await link('Concepts').isVisible()) && !(await link('Functional Tests').isVisible());
    check(
      learnerVisible && adminHidden &&
        (await manage.getAttribute('aria-expanded')) === 'false' &&
        (await dev.getAttribute('aria-expanded')) === 'false',
      'navigation: learner pages shown, admin & developer tools tucked away',
    );
    await clickWhenHydrated(manage, link('Concepts'));
    const expanded = (await link('Concepts').isVisible()) && (await manage.getAttribute('aria-expanded')) === 'true';
    await page.reload({ waitUntil: 'networkidle' });
    // The saved state is applied after hydration: wait for it, don't sample.
    const remembered = await link('Concepts').waitFor({ timeout: 30000 }).then(() => true, () => false);
    check(expanded && remembered, 'navigation: "Manage data" expands and stays open after reload');
    await page.goto(`${BASE}/tests`, { waitUntil: 'networkidle' });
    // The group opens once the page has hydrated: wait for it, don't sample.
    const autoOpened = await link('Functional Tests').waitFor({ timeout: 30000 }).then(() => true, () => false);
    check(
      autoOpened && (await dev.getAttribute('aria-expanded')) === 'true',
      'navigation: the current page’s group opens automatically',
    );
    // …and cannot be collapsed while you are on one of its pages
    // (force: Playwright refuses to click an aria-disabled button).
    await dev.click({ force: true });
    await page.waitForTimeout(300);
    check(
      (await link('Functional Tests').isVisible()) && (await dev.getAttribute('aria-disabled')) === 'true',
      'navigation: the current page’s group stays open',
    );
    // Collapse "Manage data" again so later checks start from the default.
    await untilHydrated(manage, 60000);
    await manage.click();
    await link('Concepts').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    check(!(await link('Concepts').isVisible()), 'navigation: a group can be collapsed again');
    // In-app navigation updates the tab title and is announced to screen readers.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const announcer = page.locator('#route-announcer');
    const quietOnLoad = (await announcer.innerText().catch(() => 'missing')).trim() === '';
    // Click only once React owns the link: before hydration a click is a full
    // page load, which the browser announces itself (so the announcer stays quiet).
    await untilHydrated(link('Gap Analysis'));
    await link('Gap Analysis').click();
    await page.waitForURL((u) => u.pathname === '/gaps', { timeout: 15000 });
    const said = await page
      .waitForFunction(() => document.getElementById('route-announcer')?.textContent === 'Gap Analysis · LearnGraph', null, { timeout: 10000 })
      .then(() => true, () => false);
    const title = await page.title();
    check(
      quietOnLoad && said && title === 'Gap Analysis · LearnGraph' && (await announcer.getAttribute('aria-live')) === 'polite',
      'navigation: moving to another page updates the title and announces it',
      `title "${title}", announced ${said}, quiet on load ${quietOnLoad}`,
    );
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'navigation has no page errors', newErrors.join(' | '));
  }

  // New-user onboarding: a fresh account (only the example learners) gets the
  // welcome step instead of the plan; it can be skipped to explore the demo.
  {
    const before = errors.length;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const onboarding = page.getByTestId('onboarding');
    const shown = await onboarding.waitFor({ timeout: 30000 }).then(() => true, () => false);
    const todayHidden = (await page.getByTestId('study-today').count()) === 0;
    // The name arrives with the account after the step appears: wait for it.
    let prefilled = '';
    for (let i = 0; shown && !prefilled && i < 60; i++) {
      prefilled = await onboarding.getByLabel('What should we call you?').inputValue().catch(() => '');
      if (!prefilled) await page.waitForTimeout(250);
    }
    check(shown && todayHidden && prefilled === 'Smoke Tester', 'onboarding: a new account is welcomed with a setup step', `name "${prefilled}"`);
    await onboarding.getByRole('button', { name: 'Explore the example learners first' }).click();
    const skipped = await page.getByTestId('study-today').waitFor({ timeout: 15000 }).then(() => true, () => false);
    await page.reload({ waitUntil: 'networkidle' });
    const staysSkipped = await page.getByTestId('study-today').waitFor({ timeout: 30000 }).then(() => true, () => false);
    check(skipped && staysSkipped && (await onboarding.count()) === 0, 'onboarding: can be skipped to explore the example learners');
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'onboarding has no page errors', newErrors.join(' | '));
  }

  // Dashboard "Today": the core study loop with quiz evidence (Roadmap M1).
  // The demo learner's progress is shown (seeded states belong to the demo
  // learners). Example concepts have quiz questions, so they offer a quiz
  // instead of self-report buttons: a due review is answered by quiz, a failed
  // quiz leaves the mastered count alone and a passed one raises it — all
  // graded and saved server-side, then reloaded.
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
      const firstReview = await reviews.first().innerText().catch(() => '');
      check(
        /(Overdue by \d+ days?|Due today) · about \d+% remembered/.test(firstReview),
        'dashboard: a due review says how late it is in plain words',
        firstReview.replace(/\s+/g, ' ').slice(0, 80),
      );
      const selfReport = await today.getByRole('button', { name: /I remembered it|I've got it|I forgot|Still learning/ }).count();
      check(selfReport === 0, 'dashboard: quiz-checked concepts offer a quiz, not self-report buttons', `${selfReport} self-report buttons`);
      await reviews.first().getByRole('button', { name: 'Review with a quiz' }).click();
      const result = await answerQuiz(today, { right: true });
      await closeQuiz(today);
      const saved = await today
        .getByText('will come back after a longer break', { exact: false })
        .waitFor({ timeout: 15000 })
        .then(() => true, () => false);
      check(/passed/.test(result) && saved, 'dashboard: a due review is answered with a quiz graded on the server', result.split('\n')[0]);
    } else {
      check(false, 'dashboard: a due review is answered with a quiz graded on the server', 'no reviews due for the demo learner');
    }

    // Reviewed concepts unlock new ones: keep reviewing until something is
    // offered under "Learn next" (demo progress is dated relative to the seed, so
    // only some of the demo learner's reviews are due).
    const next = today.getByRole('list', { name: 'Recommended next concepts' }).getByRole('listitem');
    for (let i = 0; i < 8 && !(await next.count()) && (await reviews.count()) > 0; i++) {
      await reviews.first().getByRole('button', { name: 'Review with a quiz' }).click();
      await answerQuiz(today, { right: true });
      await closeQuiz(today);
      await page.waitForTimeout(1500);
    }
    await next.first().waitFor({ timeout: 15000 }).catch(() => {});
    if ((await next.count()) > 0) {
      const name = (await next.first().locator('p').first().innerText()).trim();
      const item = next.filter({ hasText: name });
      const beforeQuiz = Number(await mastered.innerText());
      await item.getByRole('button', { name: 'Take the quick quiz' }).click();
      const failedResult = await answerQuiz(today, { right: false });
      await closeQuiz(today);
      await today.getByText('not passed yet', { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {});
      await item.getByRole('button', { name: 'Take the quick quiz' }).waitFor({ timeout: 15000 }).catch(() => {});
      const afterFail = Number(await mastered.innerText());
      check(
        /not passed yet/.test(failedResult) && afterFail === beforeQuiz && (await item.count()) > 0,
        'dashboard: a failed quiz does not mark the concept mastered',
        `"${name}", ${beforeQuiz} → ${afterFail} mastered`,
      );
      await item.getByRole('button', { name: 'Take the quick quiz' }).click();
      const passedResult = await answerQuiz(today, { right: true });
      await closeQuiz(today);
      await page.waitForFunction(
        (n) => Number(document.querySelector('[data-testid="mastered-count"]')?.textContent) > n,
        beforeQuiz,
        { timeout: 15000 },
      ).catch(() => {});
      const afterPass = Number(await mastered.innerText());
      check(
        /passed/.test(passedResult) && afterPass > beforeQuiz,
        'dashboard: passing the quick quiz raises the mastered count',
        `"${name}", ${beforeQuiz} → ${afterPass} mastered`,
      );
    } else {
      check(false, 'dashboard: passing the quick quiz raises the mastered count', 'no recommended concept');
    }
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'dashboard study loop has no page errors', newErrors.join(' | '));
  }

  // Mastery says where it came from (Roadmap M1, decision D5): Gap Analysis
  // labels quiz results and the rest, and counts due reviews answered by quiz.
  {
    const before = errors.length;
    await page.goto(`${BASE}/gaps`, { waitUntil: 'networkidle' });
    const sources = page.getByTestId('mastery-source');
    await sources.first().waitFor({ timeout: 30000 }).catch(() => {});
    const labels = await sources.allInnerTexts();
    const retention = await page.getByTestId('review-retention').innerText().catch(() => '');
    check(
      labels.length > 0 && labels.every((l) => /From quizzes|Self-reported|Set by hand|Not quiz-checked|From practice notes|Synced from Michi/.test(l)),
      'gaps: each mastery says where it came from',
      labels.slice(0, 3).join('; '),
    );
    check(/By quiz: \d+ of \d+ due reviews? answered correctly/.test(retention), 'gaps: due reviews answered by quiz are counted from the event log', retention.replace(/\s+/g, ' '));
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'mastery sources have no page errors', newErrors.join(' | '));
  }

  // Admin → Quiz Questions: the example concepts have a bank, and a question
  // can be added, which makes a concept quiz-checked.
  {
    const before = errors.length;
    await page.goto(`${BASE}/admin/questions`, { waitUntil: 'networkidle' });
    const conceptPicker = page.getByLabel('Concept', { exact: true });
    await conceptPicker.waitFor({ timeout: 30000 });
    await page.getByRole('list', { name: /^Questions for / }).waitFor({ timeout: 15000 }).catch(() => {});
    const exampleCount = await page.getByRole('list', { name: /^Questions for / }).locator(':scope > li').count();
    check(exampleCount >= 3, 'questions: the example concepts come with quiz questions', `${exampleCount} questions`);
    // Accessibility: deleting a row by keyboard keeps focus in the list
    // (on the same button of the row that takes its place), not on <body>.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete question 1', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page
      .waitForFunction((n) => document.querySelectorAll('[aria-label^="Questions for "] > li').length < n, exampleCount, { timeout: 15000 })
      .catch(() => {});
    await page
      .waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 5000 })
      .catch(() => {});
    const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? '');
    check(/^Delete question \d+$/.test(focusedLabel), 'a11y: after deleting a row, keyboard focus moves to the next row, not the page body', focusedLabel);
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'question editor has no page errors', newErrors.join(' | '));
  }

  // "Remind me tomorrow": a due review can be postponed without answering it.
  // It leaves the list (also after a reload) and progress is unchanged.
  // Bob: an example learner with a due review the checks above don't touch.
  {
    const before = errors.length;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const today = page.getByTestId('study-today');
    await today.waitFor({ timeout: 30000 });
    const picker = today.getByLabel('Learner', { exact: true });
    const previous = await picker.evaluate((el) => el.selectedOptions[0]?.textContent ?? '');
    await picker.selectOption({ label: 'Bob Martinez' });
    const reviews = today.getByRole('list', { name: 'Reviews due' }).getByRole('listitem');
    await reviews.first().waitFor({ timeout: 15000 }).catch(() => {});
    const countBefore = await reviews.count();
    const masteredBefore = await today.getByTestId('mastered-count').innerText().catch(() => '');
    if (countBefore > 0) {
      const name = (await reviews.first().locator('p').first().innerText()).replace(/Review first/, '').trim();
      await reviews.first().getByRole('button', { name: 'Remind me tomorrow' }).click();
      const moved = await today
        .getByText('is moved to tomorrow', { exact: false })
        .waitFor({ timeout: 15000 })
        .then(() => true, () => false);
      // The notice shows as soon as it is saved; the list refreshes right after.
      const listed = today.getByRole('list', { name: 'Reviews due' }).getByText(name, { exact: true });
      await listed.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
      const stillListed = await listed.count();
      // Keyboard focus stays in the review list (next item, or the heading when
      // it is now empty) instead of falling to <body> when the item disappears.
      await page
        .waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 5000 })
        .catch(() => {});
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        if (el.closest('[aria-label="Reviews due"]')) return `review item button "${el.textContent?.trim()}"`;
        if (el.tagName === 'H3' && /Review now/.test(el.textContent ?? '')) return 'Review now heading';
        return `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
      });
      check(
        focused.startsWith('review item button') || focused === 'Review now heading',
        'dashboard: keyboard focus stays in the review list after answering',
        focused,
      );
      const inLearnNext = await today.getByRole('list', { name: 'Recommended next concepts' }).getByText(name, { exact: true }).count();
      const masteredAfter = await today.getByTestId('mastered-count').innerText().catch(() => '');
      check(
        moved && stillListed === 0 && inLearnNext === 0 && masteredAfter === masteredBefore,
        'dashboard: "Remind me tomorrow" moves a due review off today’s list',
        `"${name}", listed ${stillListed}, in learn next ${inLearnNext}, mastered ${masteredBefore} → ${masteredAfter}`,
      );
      await page.reload({ waitUntil: 'networkidle' });
      await today.getByTestId('mastered-count').waitFor({ timeout: 30000 });
      await page.waitForTimeout(500);
      const afterReload = await today.getByRole('list', { name: 'Reviews due' }).getByText(name, { exact: true }).count();
      check(afterReload === 0, 'dashboard: a postponed review stays postponed after a reload', `listed ${afterReload}`);
      // It doesn't silently disappear: Today says it's snoozed, and Gap
      // Analysis lists it as "Snoozed until tomorrow" (not as due).
      const summary = await today.getByTestId('snoozed-summary').innerText().catch(() => '');
      check(/\d+ reviews? snoozed/.test(summary) && /tomorrow/.test(summary), 'dashboard: Today mentions the snoozed review', summary);
      await page.goto(`${BASE}/gaps`, { waitUntil: 'networkidle' });
      const snoozedList = page.getByRole('list', { name: 'Snoozed reviews' });
      await snoozedList.waitFor({ timeout: 30000 }).catch(() => {});
      const snoozedItem = snoozedList.getByRole('listitem').filter({ hasText: name });
      const snoozedText = await snoozedItem.first().innerText().catch(() => '');
      const gapsMain = await page.locator('main').innerText().catch(() => '');
      const fading = Number((gapsMain.match(/Fading\s+(\d+)/) ?? [])[1]);
      const due = Number((gapsMain.match(/Reviews\s*\((\d+) concepts?\)/) ?? [])[1]);
      check(
        /Snoozed until tomorrow/.test(snoozedText) && fading === due,
        'gaps: a snoozed review shows as "Snoozed until tomorrow", not as due',
        `"${snoozedText.replace(/\s+/g, ' ')}", fading ${fading}, due ${due}`,
      );
      // Changed their mind: "Review it now" ends the snooze — the review is due
      // again (counted in Fading/Reviews), and keyboard focus stays in the card.
      await snoozedItem.first().getByRole('button', { name: `Review it now: ${name}` }).click();
      const notice = await page
        .getByTestId('snooze-notice')
        .getByText('is due again', { exact: false })
        .waitFor({ timeout: 15000 })
        .then(() => true, () => false);
      await snoozedItem.first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
      const stillSnoozed = await page.getByRole('list', { name: 'Snoozed reviews' }).getByRole('listitem').filter({ hasText: name }).count();
      await page
        .waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 5000 })
        .catch(() => {});
      const gapsFocus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        if (el.closest('[aria-label="Snoozed reviews"]')) return `snoozed item button "${el.textContent?.trim()}"`;
        if (el.tagName === 'H2' && /Reviews/.test(el.textContent ?? '')) return 'Reviews heading';
        return `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
      });
      const gapsAfter = await page.locator('main').innerText().catch(() => '');
      const fadingAfter = Number((gapsAfter.match(/Fading\s+(\d+)/) ?? [])[1]);
      const dueAfter = Number((gapsAfter.match(/Reviews\s*\((\d+) concepts?\)/) ?? [])[1]);
      check(
        notice && stillSnoozed === 0 && dueAfter === due + 1 && fadingAfter === dueAfter,
        'gaps: "Review it now" makes a snoozed review due again',
        `notice ${notice}, still snoozed ${stillSnoozed}, due ${due} → ${dueAfter}, fading ${fadingAfter}`,
      );
      check(
        gapsFocus.startsWith('snoozed item button') || gapsFocus === 'Reviews heading',
        'gaps: keyboard focus stays in the Reviews card after "Review it now"',
        gapsFocus,
      );
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await today.waitFor({ timeout: 30000 });
      const backListed = today.getByRole('list', { name: 'Reviews due' }).getByText(name, { exact: true });
      const back = await backListed.waitFor({ timeout: 15000 }).then(() => true, () => false);
      check(back, 'dashboard: a review brought back from Snoozed is due again on Today', `"${name}"`);
      // The same from the Today summary: snooze it again, then "Review it now" there.
      if (back) {
        const item = today.getByRole('list', { name: 'Reviews due' }).getByRole('listitem').filter({ hasText: name });
        await item.getByRole('button', { name: 'Remind me tomorrow' }).click();
        await backListed.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
        const summaryButton = today.getByTestId('snoozed-summary').getByRole('button', { name: /Review (it|them) now/ });
        await summaryButton.click({ timeout: 15000 }).catch(() => {});
        const restored = await backListed.waitFor({ timeout: 15000 }).then(() => true, () => false);
        const summaryGone = await today
          .getByTestId('snoozed-summary')
          .waitFor({ state: 'detached', timeout: 15000 })
          .then(() => true, () => false);
        await page
          .waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 5000 })
          .catch(() => {});
        const todayFocus = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return 'body';
          if (el.closest('[aria-label="Reviews due"]')) return `review item button "${el.textContent?.trim()}"`;
          if (el.tagName === 'H3' && /Review now/.test(el.textContent ?? '')) return 'Review now heading';
          return `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
        });
        check(
          restored && summaryGone && (todayFocus.startsWith('review item button') || todayFocus === 'Review now heading'),
          'dashboard: "Review it now" in the snoozed summary brings the review back',
          `restored ${restored}, summary gone ${summaryGone}, focus ${todayFocus}`,
        );
      }
    } else {
      check(false, 'dashboard: "Remind me tomorrow" moves a due review off today’s list', 'no reviews due for Bob');
    }
    if (previous) await picker.selectOption({ label: previous });
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'postponing a review has no page errors', newErrors.join(' | '));
  }

  // Returning learner: a short greeting, then Today; background and admin
  // links are tucked into a collapsed "About" section.
  {
    const before = errors.length;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const heading = (await page.locator('main h1').innerText()).trim();
    check(heading === 'Hi, Smoke', 'dashboard: greets the learner by first name', `"${heading}"`);
    const about = page.getByTestId('dashboard-about');
    const editLink = about.getByRole('link', { name: 'Concepts', exact: true });
    const hiddenAtStart = !(await editLink.isVisible());
    await about.locator('summary').click();
    const shown = await editLink.waitFor({ timeout: 5000 }).then(() => true, () => false);
    check(hiddenAtStart && shown, 'dashboard: admin links are tucked in a collapsed "About" section');
    const shortcuts = await page.getByRole('list', { name: 'Keep exploring' }).getByRole('link').count();
    check(shortcuts === 4, 'dashboard: learner shortcuts are listed', `${shortcuts} links`);
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'returning-learner dashboard has no page errors', newErrors.join(' | '));
  }

  // Onboarding, for real: create my own plan (name, one subject, "I know the
  // basics"). The plan switches to the new learner, follows the chosen subject,
  // offers the basics as quick quizzes, and is remembered after a reload.
  {
    const before = errors.length;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.getByTestId('study-today').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Create my own learning plan' }).click();
    const onboarding = page.getByTestId('onboarding');
    await onboarding.waitFor({ timeout: 15000 });
    await onboarding.getByLabel('What should we call you?').fill('  ');
    await onboarding.getByRole('button', { name: 'Start learning' }).click();
    const nameRequired = await onboarding
      .getByRole('alert')
      .filter({ hasText: 'Please enter your name' })
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false);
    check(nameRequired, 'onboarding: a name is required');
    await onboarding.getByLabel('What should we call you?').fill('Sari Smoke');
    await onboarding.getByRole('checkbox', { name: /Mathematics/ }).check();
    await onboarding.getByRole('radio', { name: /I know the basics/ }).check();
    await onboarding.getByRole('button', { name: 'Start learning' }).click();
    const today = page.getByTestId('study-today');
    const welcomed = await today.getByText('Welcome, Sari Smoke!', { exact: false }).waitFor({ timeout: 30000 }).then(() => true, () => false);
    const selected = welcomed ? await today.getByLabel('Learner', { exact: true }).evaluate((el) => el.selectedOptions[0]?.textContent) : '';
    check(welcomed && selected === 'Sari Smoke', 'onboarding: creates my own learner and shows my plan', `selected "${selected}"`);
    const focusText = await today.getByTestId('focus-subjects').innerText().catch(() => '');
    const mastered = Number(await today.getByTestId('mastered-count').innerText().catch(() => '0'));
    const nextItems = today.getByRole('list', { name: 'Recommended next concepts' }).getByRole('listitem');
    await nextItems.first().waitFor({ timeout: 15000 }).catch(() => {});
    // The math basics are quiz-checked: "I know the basics" doesn't claim them,
    // the plan offers their quick quiz instead (decision D5).
    const welcomeText = await today.getByText('Welcome, Sari Smoke!', { exact: false }).innerText().catch(() => '');
    const quizOffered = await nextItems.first().getByRole('button', { name: 'Take the quick quiz' }).count();
    check(
      /Mathematics/.test(focusText) && mastered === 0 && quizOffered > 0 && /quick quiz/.test(welcomeText),
      'onboarding: plan follows the chosen subject and offers the quiz-checked basics as quick quizzes',
      `focus "${focusText}", ${mastered} mastered, ${await nextItems.count()} to learn next`,
    );
    await page.reload({ waitUntil: 'networkidle' });
    await today.waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="study-today"] select')?.selectedOptions[0]?.textContent === 'Sari Smoke', null, { timeout: 15000 }).catch(() => {});
    const after = await today.getByLabel('Learner', { exact: true }).evaluate((el) => el.selectedOptions[0]?.textContent);
    const noPrompt = (await page.getByRole('button', { name: 'Create my own learning plan' }).count()) === 0;
    check(after === 'Sari Smoke' && noPrompt && (await onboarding.count()) === 0, 'onboarding: my plan is remembered after a reload', `selected "${after}"`);
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'onboarding flow has no page errors', newErrors.join(' | '));
  }

  // Learning in the app (Roadmap M2): Today plans a session, and "Learn next"
  // opens the lesson — explanation, worked example and practice — where a
  // solution stays hidden until asked for, the format choice reorders the
  // lesson and is remembered, and passing the quiz masters the concept and
  // offers a next step. A new learner gets there in well under 5 minutes.
  {
    const before = errors.length;
    const started = Date.now();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const today = page.getByTestId('study-today');
    const steps = today.getByTestId('session-plan').getByRole('list', { name: 'Session steps' }).getByRole('listitem');
    await steps.first().waitFor({ timeout: 30000 }).catch(() => {});
    await today.getByTestId('session-plan').getByText('15 min', { exact: true }).click().catch(() => {});
    const summary = await today.getByTestId('session-summary').innerText().catch(() => '');
    const planned = Number((summary.match(/^(\d+) min planned/) ?? [])[1]);
    check((await steps.count()) > 0 && planned > 0, "dashboard: today's session plans steps for the time chosen", `${await steps.count()} steps, "${summary}"`);

    const nextItem = today.getByRole('list', { name: 'Recommended next concepts' }).getByRole('listitem').first();
    await nextItem.getByRole('link', { name: /Open the lesson/ }).click();
    await page.waitForURL(/\/learn\//, { timeout: 15000 }).catch(() => {});
    const lesson = page.getByTestId('lesson');
    await lesson.waitFor({ timeout: 30000 }).catch(() => {});
    const kinds = await lesson.getByTestId('lesson-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
    check(
      ['text', 'example', 'exercise'].every((k) => kinds.includes(k)),
      'lesson: "Learn next" opens a lesson with an explanation, a worked example and practice',
      `${new URL(page.url()).pathname}: ${kinds.join(', ')}`,
    );
    const solution = lesson.getByTestId('solution').first();
    const hiddenAtFirst = await solution.isHidden().catch(() => false);
    await lesson.getByRole('button', { name: 'Show the solution' }).first().click().catch(() => {});
    const shown = await solution.isVisible().catch(() => false);
    check(hiddenAtFirst && shown, 'lesson: a practice solution stays hidden until asked for');

    await lesson.getByRole('radio', { name: 'Practice first' }).check().catch(() => {});
    await page
      .waitForFunction(() => document.querySelector('[data-testid="lesson-item"]')?.getAttribute('data-kind') === 'exercise', null, { timeout: 10000 })
      .catch(() => {});
    const firstKind = await lesson.getByTestId('lesson-item').first().getAttribute('data-kind').catch(() => '');
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'networkidle' });
    await lesson.getByTestId('lesson-item').first().waitFor({ timeout: 30000 }).catch(() => {});
    const afterReload = await lesson.getByTestId('lesson-item').first().getAttribute('data-kind').catch(() => '');
    check(firstKind === 'exercise' && afterReload === 'exercise', 'lesson: "Practice first" leads with practice and is remembered', `${firstKind} → ${afterReload}`);

    await lesson.getByRole('button', { name: 'Take the quick quiz' }).click();
    const result = await answerQuiz(lesson, { right: true });
    await closeQuiz(lesson);
    await lesson.getByTestId('lesson-progress').filter({ hasText: 'From quizzes' }).waitFor({ timeout: 15000 }).catch(() => {});
    const progress = await lesson.getByTestId('lesson-progress').innerText().catch(() => '');
    const nextStep = await lesson.getByRole('navigation', { name: 'Next step' }).getByRole('link', { name: /^Next: / }).count();
    const minutes = (Date.now() - started) / 60000;
    check(
      /passed/.test(result) && /From quizzes/.test(progress) && nextStep > 0 && minutes < 5,
      'lesson: passing its quiz masters the concept and offers the next step',
      `${progress}; ${minutes.toFixed(1)} min`,
    );
    // Roadmap M4 (no LLM): the brief for an AI tutor is shown before copying,
    // knows the topic and where mastery came from, and has no sensitive domains.
    const tutor = lesson.getByTestId('tutor-context');
    await tutor.getByLabel(/Your question/).fill("I'm stuck on the order of operations");
    await tutor.getByRole('button', { name: 'Prepare the context' }).click();
    const brief = tutor.getByLabel(/What the tutor will read/);
    await brief.waitFor({ timeout: 15000 }).catch(() => {});
    const briefText = await brief.inputValue().catch(() => '');
    check(
      /^You are tutoring one learner/.test(briefText) &&
        /Topic: /.test(briefText) &&
        /from quizzes/.test(briefText) &&
        /hint before the full solution/.test(briefText) &&
        !/dark|politic|neurotic|narciss|ideolog/i.test(briefText),
      'lesson: the AI tutor brief is shown first, knows the topic and progress, and leaves out sensitive traits',
      briefText.split('\n').slice(0, 3).join(' / ').slice(0, 120),
    );
    // Roadmap M4: the built-in chat uses the learner's own key (no network call
    // here: a malformed key is refused before anything is sent).
    const chat = tutor.getByTestId('tutor-chat');
    await chat.getByLabel('Anthropic API key').fill('not-a-key');
    await chat.getByRole('button', { name: 'Ask Claude' }).click();
    const refused = await chat.getByRole('alert').filter({ hasText: 'starts with sk-ant-' }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    check(refused, 'tutor chat: asks for the learner’s own Anthropic key and refuses a malformed one before sending');
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'lessons have no page errors', newErrors.join(' | '));
    // The next checks start from the dashboard.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.getByTestId('study-today').waitFor({ timeout: 30000 }).catch(() => {});
  }

  // Changing subjects after onboarding: "Change subjects" on the Today panel
  // opens an editor (keyboard focus moves into it, current subject ticked);
  // saving switches the plan to the new subject, survives a reload, and
  // Escape cancels without saving.
  {
    const before = errors.length;
    const today = page.getByTestId('study-today');
    const changeBtn = today.getByRole('button', { name: 'Change subjects' });
    await changeBtn.click();
    const editor = today.getByTestId('focus-editor');
    const opened = await editor.waitFor({ timeout: 10000 }).then(() => true, () => false);
    const math = editor.getByRole('checkbox', { name: /Mathematics/ });
    await math.waitFor({ timeout: 15000 }).catch(() => {});
    const focusInside = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="focus-editor"]'));
    const mathTicked = await math.isChecked().catch(() => false);
    check(
      opened && focusInside && mathTicked && (await changeBtn.getAttribute('aria-expanded')) === 'true',
      'subjects: "Change subjects" opens an editor with the current subject ticked and focus inside',
      `opened ${opened}, focus inside ${focusInside}, math ticked ${mathTicked}`,
    );
    await math.uncheck();
    await editor.getByRole('checkbox', { name: /Computer science/ }).check();
    await editor.getByRole('button', { name: 'Save subjects' }).click();
    const saved = await today
      .getByText('Your plan now focuses on Computer science', { exact: false })
      .waitFor({ timeout: 15000 })
      .then(() => true, () => false);
    await page.waitForFunction(() => /Computer science/.test(document.querySelector('[data-testid="focus-subjects"]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    const focusText = await today.getByTestId('focus-subjects').innerText().catch(() => '');
    const focusBack = await page.evaluate(() => document.activeElement?.textContent?.trim());
    check(
      saved && focusText === 'Focus: Computer science' && (await editor.count()) === 0 && focusBack === 'Change subjects',
      'subjects: saving switches the plan to the new subject and returns focus',
      `saved ${saved}, "${focusText}", focus on "${focusBack}"`,
    );
    await page.reload({ waitUntil: 'networkidle' });
    await today.waitFor({ timeout: 30000 });
    await page.waitForFunction(() => /Computer science/.test(document.querySelector('[data-testid="focus-subjects"]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    const afterReload = await today.getByTestId('focus-subjects').innerText().catch(() => '');
    check(afterReload === 'Focus: Computer science', 'subjects: the new subject is saved on the server', `"${afterReload}"`);
    await changeBtn.click();
    await editor.getByRole('checkbox', { name: /Mathematics/ }).waitFor({ timeout: 15000 });
    await editor.getByRole('checkbox', { name: /Mathematics/ }).check();
    await page.keyboard.press('Escape');
    const cancelled = await editor.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
    const unchanged = await today.getByTestId('focus-subjects').innerText().catch(() => '');
    check(cancelled && unchanged === 'Focus: Computer science', 'subjects: Escape cancels without saving', `"${unchanged}"`);
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'changing subjects has no page errors', newErrors.join(' | '));
  }

  // The learner picked on the dashboard follows the user to the other learner
  // pages (Recommendations, Gaps, Graph, Profile), and picking another one
  // there carries back to the dashboard.
  {
    const before = errors.length;
    const selectedIn = async (path, label) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      const select = page.getByLabel(label, { exact: true });
      await select.waitFor({ timeout: 30000 }).catch(() => {});
      await page
        .waitForFunction((id) => document.getElementById(id)?.selectedOptions[0]?.textContent === 'Sari Smoke', await select.getAttribute('id').catch(() => ''), { timeout: 15000 })
        .catch(() => {});
      return select.evaluate((el) => el.selectedOptions[0]?.textContent ?? '').catch(() => '');
    };
    const seen = [];
    for (const [path, label] of [
      ['/recommendations', 'Learner'],
      ['/gaps', 'Learner'],
      ['/graph', 'Show progress of'],
      ['/profile', 'Learner'],
    ]) {
      seen.push(`${path}: "${await selectedIn(path, label)}"`);
    }
    check(seen.every((s) => s.endsWith('"Sari Smoke"')), 'learner pages open on the learner picked on the dashboard', seen.join('; '));
    // Gaps loads the analysis straight away (no "choose a learner" step).
    await page.goto(`${BASE}/gaps`, { waitUntil: 'networkidle' });
    const gapsLoaded = await page.getByRole('heading', { name: /^Reviews/ }).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    check(gapsLoaded, 'gaps: the analysis loads without choosing a learner first');

    await page.goto(`${BASE}/recommendations`, { waitUntil: 'networkidle' });
    const recSelect = page.getByLabel('Learner', { exact: true });
    await recSelect.waitFor({ timeout: 30000 });
    const other = await recSelect.evaluate((el) => [...el.options].find((o) => o.textContent !== 'Sari Smoke')?.value ?? '');
    const otherName = await recSelect.evaluate((el, v) => [...el.options].find((o) => o.value === v)?.textContent ?? '', other);
    await recSelect.selectOption(other);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const today = page.getByTestId('study-today');
    await today.waitFor({ timeout: 30000 });
    await page
      .waitForFunction((n) => document.querySelector('[data-testid="study-today"] select')?.selectedOptions[0]?.textContent === n, otherName, { timeout: 15000 })
      .catch(() => {});
    const onToday = await today.getByLabel('Learner', { exact: true }).evaluate((el) => el.selectedOptions[0]?.textContent).catch(() => '');
    check(!!other && onToday === otherName, 'a learner picked on Recommendations carries back to the dashboard', `"${otherName}" → "${onToday}"`);
    // Back to my own plan for the rest of the run.
    await today.getByLabel('Learner', { exact: true }).selectOption({ label: 'Sari Smoke' });
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'shared learner choice has no page errors', newErrors.join(' | '));
  }

  // Gap Analysis and Recommendations speak the learner's language: concept
  // names (never internal ids like "concept:fractions"), plain "due" phrases,
  // and a way back to the dashboard to actually do overdue reviews.
  {
    const before = errors.length;
    await page.goto(`${BASE}/gaps`, { waitUntil: 'networkidle' });
    const gapsSelect = page.getByLabel('Learner', { exact: true });
    await gapsSelect.waitFor({ timeout: 30000 });
    // Carol: an example learner the dashboard checks above haven't reviewed
    // (they clear Alice's few due reviews), so she still has some due.
    await gapsSelect.selectOption({ label: 'Carol Kim' });
    const reviews = page.getByRole('heading', { name: /^Reviews/ }).first();
    await reviews.waitFor({ timeout: 30000 }).catch(() => {});
    await page.getByText(/Overdue by \d+ days?|Due (today|tomorrow|in \d+ days)/).first().waitFor({ timeout: 15000 }).catch(() => {});
    const gapsText = await page.locator('main').innerText().catch(() => '');
    check(await page.getByRole('heading', { name: 'Shaky spots' }).isVisible().catch(() => false), 'gaps: example learner analysis renders');
    check(!/concept:/.test(gapsText), 'gaps: shows concept names, not internal ids', (gapsText.match(/concept:[\w-]+/) ?? [''])[0]);
    check(/(Overdue by \d+ days?|Due (today|tomorrow|in \d+ days))/.test(gapsText), 'gaps: reviews say when they are due in plain words');
    const overdueDays = [...gapsText.matchAll(/Overdue by (\d+) days?/g)].map((m) => Number(m[1]));
    check(overdueDays.every((d) => d < 60), 'gaps: example progress is recent (no review overdue by months)', `max ${Math.max(0, ...overdueDays)} days`);
    check(/Review first|Review soon|Can wait/.test(gapsText) && !/\b(urgent|normal)\b/.test(gapsText), 'gaps: review priority uses everyday labels');
    // Every listed review is due, so none of them may say "Can wait" (it used to, for well-known concepts).
    check(!/Can wait/.test(gapsText), 'gaps: due reviews are never labelled "Can wait"');
    const fadingCount = Number((gapsText.match(/Fading\s+(\d+)/) ?? [])[1]);
    const dueCount = Number((gapsText.match(/Reviews\s*\((\d+) concepts?\)/) ?? [])[1]);
    check(
      Number.isInteger(fadingCount) && fadingCount > 0 && fadingCount === dueCount,
      'gaps: "Fading" counts exactly the reviews that are due',
      `fading ${fadingCount}, due ${dueCount}`,
    );
    const toDashboard = page.getByRole('link', { name: 'Do your reviews on the dashboard' });
    check(await toDashboard.isVisible().catch(() => false), 'gaps: overdue reviews link to the dashboard');

    await page.goto(`${BASE}/recommendations`, { waitUntil: 'networkidle' });
    const zonesTab = page.getByRole('button', { name: 'Ready / not yet' });
    await zonesTab.waitFor({ timeout: 30000 }).catch(() => {});
    await zonesTab.click().catch(() => {});
    await page.getByRole('heading', { name: /^Not yet/ }).waitFor({ timeout: 15000 }).catch(() => {});
    const recText = await page.locator('main').innerText().catch(() => '');
    check(/Not yet \(\d+\)/.test(recText) && !/concept:/.test(recText), 'recommendations: not-ready concepts list names, not ids', (recText.match(/concept:[\w-]+/) ?? [''])[0]);
    check(!/Computed in \d+ms/.test(recText), 'recommendations: no debug timing shown');

    // Back to my own plan for the rest of the run.
    const recSelect = page.getByLabel('Learner', { exact: true });
    await recSelect.selectOption({ label: 'Sari Smoke' });
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'readable gaps/recommendations have no page errors', newErrors.join(' | '));
  }

  // My Profile leads with the learner's subjects and progress (not the
  // psychometric jargon), and subjects can be changed there too — the change
  // shows up on the dashboard's Today panel.
  {
    const before = errors.length;
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    const card = page.getByTestId('my-learning');
    await card.waitFor({ timeout: 30000 }).catch(() => {});
    await page.getByTestId('profile-mastered').waitFor({ timeout: 30000 }).catch(() => {});
    const h1 = await page.getByRole('heading', { level: 1 }).innerText().catch(() => '');
    const focusText = await card.getByTestId('profile-focus').innerText().catch(() => '');
    const mastered = await card.getByTestId('profile-mastered').innerText().catch(() => '');
    check(h1 === 'My Profile' && focusText === 'Focus: Computer science', 'profile: opens with My Profile and the learner’s subjects', `"${h1}", "${focusText}"`);
    check(/^\d+ of \d+ concepts? mastered$/.test(mastered), 'profile: shows progress in the chosen subjects', `"${mastered}"`);
    const nextLink = card.getByRole('link', { name: /Do your \d+ reviews?|Keep learning|Start learning|Go to today’s plan/ });
    check(await nextLink.isVisible().catch(() => false), 'profile: offers one clear next step to the dashboard');
    const mainText = await page.locator('main').innerText().catch(() => '');
    check(!/Psychometric Profile|Profile Configuration Mode|Select ONE/.test(mainText) && /How you like to learn/.test(mainText), 'profile: learning style is an optional section in plain words');

    const changeBtn = card.getByRole('button', { name: 'Change subjects' });
    const editor = card.getByTestId('focus-editor');
    await clickWhenHydrated(changeBtn, editor);
    await editor.getByRole('checkbox', { name: /Mathematics/ }).check();
    await editor.getByRole('button', { name: 'Save subjects' }).click();
    const saved = await card.getByText('Saved. Your plan now focuses on').waitFor({ timeout: 15000 }).then(() => true, () => false);
    await page.waitForFunction(() => /Mathematics/.test(document.querySelector('[data-testid="profile-focus"]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    const newFocus = await card.getByTestId('profile-focus').innerText().catch(() => '');
    check(saved && /Mathematics/.test(newFocus) && /Computer science/.test(newFocus), 'profile: subjects can be changed from My Profile', `"${newFocus}"`);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const today = page.getByTestId('study-today');
    await today.waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => /Mathematics/.test(document.querySelector('[data-testid="focus-subjects"]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    const onToday = await today.getByTestId('focus-subjects').innerText().catch(() => '');
    check(onToday === newFocus, 'profile: the subject change shows on the dashboard', `"${onToday}"`);
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'my profile has no page errors', newErrors.join(' | '));
  }

  // "Your data" on My Profile: the learner can download their own progress
  // (CSV for a spreadsheet) and everything (JSON backup), made on the device.
  {
    const before = errors.length;
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    const box = page.getByTestId('download-my-data');
    await box.waitFor({ timeout: 30000 }).catch(() => {});
    const readText = async (download) => {
      const stream = await download.createReadStream();
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      return Buffer.concat(chunks).toString('utf8');
    };
    const csvBtn = box.getByRole('button', { name: 'Download progress (CSV)' });
    let csvDl = null;
    for (let i = 0; i < 10 && !csvDl; i++) {
      [csvDl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), csvBtn.click()]);
    }
    const csvName = csvDl?.suggestedFilename() ?? '';
    const csv = csvDl ? await readText(csvDl) : '';
    const csvLines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    check(/^learngraph-sari-smoke-\d{4}-\d{2}-\d{2}\.csv$/.test(csvName), 'my data: progress downloads as a named CSV', `"${csvName}"`);
    check(csvLines[0]?.startsWith('Concept,Subject,Status,Mastery (%)') && csvLines.length > 1 && !/concept:/.test(csv), 'my data: CSV lists concepts by name with status and mastery', `${csvLines.length} lines`);
    const csvNotice = await box.getByText(/^Downloaded learngraph-sari-smoke-.*\.csv — \d+ concepts? with your progress\.$/).isVisible().catch(() => false);
    check(csvNotice, 'my data: download is confirmed in a status message');

    const [jsonDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      box.getByRole('button', { name: 'Download everything (JSON)' }).click(),
    ]);
    let data = null;
    try {
      data = JSON.parse(jsonDl ? await readText(jsonDl) : '');
    } catch {
      data = null;
    }
    const onlyMine = Array.isArray(data?.knowledgeStates) && data.knowledgeStates.length > 0 && data.knowledgeStates.every((st) => st.userId === data.learner.id);
    check(
      data?.format === 'learngraph.learner-export' && data?.learner?.name === 'Sari Smoke' && Array.isArray(data?.progress) && data.progress.length === csvLines.length - 1 && onlyMine,
      'my data: JSON holds this learner’s profile and progress only',
      data ? `${data.progress?.length} rows, ${data.knowledgeStates?.length} states` : 'no file',
    );
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'my data downloads have no page errors (CSP allows them)', newErrors.join(' | '));
  }

  // The optional learning-style profile leads with what the study plan reads
  // (no instrument names or "Dark Personality" up front), and saving it works
  // out a learning style that the recommendations use.
  {
    const before = errors.length;
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    const cats = page.getByTestId('profile-categories');
    await cats.waitFor({ timeout: 30000 }).catch(() => {});
    const firstCat = await cats.locator('[data-testid^="profile-category-"] h3').first().innerText().catch(() => '');
    const more = page.getByTestId('profile-more');
    const moreOpen = await more.evaluate((el) => el.open).catch(() => null);
    const hiddenTrait = await page.getByText('Difficult traits', { exact: true }).isVisible().catch(() => true);
    const mainText = await page.locator('main').innerText().catch(() => '');
    check(firstCat === 'How you think and learn' && moreOpen === false && !hiddenTrait, 'profile: learning-relevant topics first, the rest folded under "More about you"', `"${firstCat}", open=${moreOpen}`);
    check(!/Dark Personality|NEO-PI-R|MACH-IV|domains configured|^[A-H]\. /m.test(mainText), 'profile: no instrument names or lettered jargon categories', '');
    await more.locator('summary').click();
    // Decision D4: the optional (personal) topics are only shown after the learner agrees.
    const consentShown = await more.getByTestId('more-topics-consent').isVisible().catch(() => false);
    const hiddenBeforeConsent = !(await page.getByText('Difficult traits', { exact: true }).isVisible().catch(() => false));
    await more.getByRole('button', { name: 'I agree — show these optional topics' }).click().catch(() => {});
    const shownAfterConsent = await page.getByText('Difficult traits', { exact: true }).waitFor({ timeout: 15000 }).then(() => true, () => false);
    check(
      consentShown && hiddenBeforeConsent && shownAfterConsent,
      'profile: "More about you" asks before showing personal topics the plan does not use',
      `asked ${consentShown}, hidden before ${hiddenBeforeConsent}, shown after ${shownAfterConsent}`,
    );
    await more.getByRole('button', { name: 'Hide these topics again' }).click().catch(() => {});

    const setMyself = page.getByRole('button', { name: 'Set it myself' });
    await setMyself.waitFor({ timeout: 30000 }).catch(() => {});
    // Roadmap M3: modes whose inference is not built are not offered.
    const unbuilt = await page.getByRole('button', { name: /^(Automatic|Set, then adjust)$/ }).count();
    check(unbuilt === 0, 'profile: modes that are not built yet are not offered', `${unbuilt} shown`);
    for (let i = 0; i < 20 && (await setMyself.getAttribute('aria-pressed').catch(() => null)) !== 'true'; i++) {
      await setMyself.click();
      await page.waitForTimeout(300);
    }
    await page.getByRole('button', { name: 'Use this option' }).click();
    await page.getByRole('button', { name: 'Save Profile' }).click();
    const savedMsg = await page.getByText('Saved. Your suggestions on Recommendations now use this profile.').waitFor({ timeout: 15000 }).then(() => true, () => false);
    const styleShown = await page.getByText('Your learning style (worked out from your answers)').waitFor({ timeout: 15000 }).then(() => true, () => false);
    check(savedMsg && styleShown, 'profile: saving works out a learning style', `saved=${savedMsg}, style=${styleShown}`);
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'learning-style profile has no page errors', newErrors.join(' | '));
  }

  // "Take quizzes": plain wording (no "(R)" markers or instrument
  // citations), the quiz is a labelled dialog with named answers, and the
  // result is saved — it is still there after a reload.
  {
    const before = errors.length;
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    const quizzes = page.getByRole('button', { name: 'Take quizzes' });
    await quizzes.waitFor({ timeout: 30000 }).catch(() => {});
    for (let i = 0; i < 20 && (await quizzes.getAttribute('aria-pressed').catch(() => null)) !== 'true'; i++) {
      await quizzes.click();
      await page.waitForTimeout(300);
    }
    const card = page.getByTestId('quiz-card-growth_mindset');
    await card.waitFor({ timeout: 15000 }).catch(() => {});
    const cardText = await card.innerText().catch(() => '');
    const listText = await page.locator('main').innerText().catch(() => '');
    check(/question · /.test(cardText) && !/Dweck|TIPI|NEO-PI-R|\/ 39 completed/.test(listText), 'quizzes: cards show length and time, no instrument names', `"${cardText.replace(/\s+/g, ' ')}"`);
    await card.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 10000 }).catch(() => {});
    const dialogText = await dialog.innerText().catch(() => '');
    const focusedInDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')).catch(() => false);
    check(!/\(R\)|Source:|Response Scale/.test(dialogText) && focusedInDialog, 'quizzes: dialog in plain words, keyboard focus moves into it', `focus=${focusedInDialog}`);
    // Tab never leaves the modal quiz (it wraps around inside it).
    let escaped = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
      if (!(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))) escaped++;
    }
    check(escaped === 0, 'a11y: Tab stays inside the quiz dialog', `${escaped} of 40 steps left it`);
    const groups = dialog.getByRole('group');
    const n = await groups.count();
    for (let i = 0; i < n; i++) await groups.nth(i).getByRole('button').last().click();
    const lastName = n > 0 ? await groups.first().getByRole('button').last().getAttribute('aria-label').catch(() => '') : '';
    const pressed = n > 0 ? await groups.first().getByRole('button').last().getAttribute('aria-pressed').catch(() => '') : '';
    check(n > 0 && / — /.test(lastName ?? '') && pressed === 'true', 'quizzes: answers are named buttons that show which is picked', `n=${n}, "${lastName}", pressed=${pressed}`);
    await dialog.getByRole('button', { name: 'Save my answers' }).click();
    const saved = await page.getByTestId('profile-success').filter({ hasText: /^Saved — / }).waitFor({ timeout: 15000 }).then(() => true, () => false);
    const backOnCard = await page.evaluate(() => document.activeElement?.getAttribute('data-testid')).catch(() => null);
    check(saved && backOnCard === 'quiz-card-growth_mindset', 'quizzes: saving confirms and returns focus to the quiz card', `saved=${saved}, focus=${backOnCard}`);

    await page.reload({ waitUntil: 'networkidle' });
    await quizzes.waitFor({ timeout: 30000 }).catch(() => {});
    for (let i = 0; i < 20 && (await quizzes.getAttribute('aria-pressed').catch(() => null)) !== 'true'; i++) {
      await quizzes.click();
      await page.waitForTimeout(300);
    }
    await card.waitFor({ timeout: 15000 }).catch(() => {});
    const done = await card.getAttribute('data-done').catch(() => null);
    check(done === 'true', 'quizzes: a saved quiz result is still there after reloading', `data-done=${done}`);
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'quizzes have no page errors', newErrors.join(' | '));
  }

  // Phone layout (390×844): the sidebar becomes a drawer behind a menu
  // button, so content gets the full width and nothing scrolls sideways.
  {
    const before = errors.length;
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      storageState: await page.context().storageState(),
    });
    const m = await mctx.newPage();
    m.on('pageerror', (e) => errors.push(`pageerror (mobile): ${e.message}`));
    const fits = async () =>
      m.evaluate(() => {
        const main = document.querySelector('main')?.getBoundingClientRect();
        return {
          main: Math.round(main?.width ?? 0),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
    const narrow = [];
    for (const path of ['/', '/profile', '/recommendations', '/gaps', '/admin/learners', '/about']) {
      await m.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      // Pages show a loading state without <main> until the client has hydrated
      // and DBProvider is ready, which can happen after `networkidle`.
      await m.locator('main').first().waitFor({ timeout: 30000 }).catch(() => {});
      const r = await fits();
      if (r.main < 350 || r.overflow > 1) narrow.push(`${path}: main ${r.main}px, overflow ${r.overflow}px`);
    }
    check(narrow.length === 0, 'mobile: pages use the full width without sideways scrolling', narrow.join('; '));

    // Admin tables become one card per row: nothing scrolls sideways inside
    // the card, the row's buttons are on screen, and the column names are
    // still there for screen readers.
    const cards = [];
    for (const [path, header] of [
      ['/admin/learners', 'Email'],
      ['/admin/states', 'Mastery'],
      ['/admin/prerequisites', 'Reason'],
    ]) {
      await m.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      const table = m.locator('table.stack-table');
      await table.locator('tbody tr').first().waitFor({ timeout: 30000 }).catch(() => {});
      const r = await table
        .evaluate((t) => {
          const row = t.querySelector('tbody tr');
          const scroller = t.parentElement;
          const button = row?.querySelector('button')?.getBoundingClientRect();
          return {
            display: row ? getComputedStyle(row).display : 'none',
            sideways: scroller ? scroller.scrollWidth - scroller.clientWidth : -1,
            buttonOnScreen: !!button && button.right <= window.innerWidth && button.left >= 0,
          };
        })
        .catch(() => ({ display: 'missing', sideways: -1, buttonOnScreen: false }));
      const headerKept = (await m.getByRole('columnheader', { name: header }).count()) === 1;
      if (r.display !== 'block' || r.sideways > 1 || r.sideways < 0 || !r.buttonOnScreen || !headerKept) {
        cards.push(`${path}: row ${r.display}, sideways ${r.sideways}px, button on screen ${r.buttonOnScreen}, header ${headerKept}`);
      }
    }
    check(cards.length === 0, 'mobile: admin tables show one card per row, without sideways scrolling', cards.join('; '));

    // The graph's details open as a bottom sheet (full width, at the bottom);
    // the close button and Escape close it.
    {
      await m.goto(`${BASE}/graph`, { waitUntil: 'networkidle' });
      const node = m.locator('.react-flow__node').first();
      await node.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
      const panel = m.getByTestId('graph-detail-panel');
      for (let i = 0; i < 10 && !(await panel.isVisible()); i++) {
        await node.click().catch(() => {});
        await m.waitForTimeout(400);
      }
      await m.waitForTimeout(400); // slide-in
      const sheet = await panel
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { layout: el.dataset.layout, width: Math.round(r.width), gap: Math.round(window.innerHeight - r.bottom), vw: window.innerWidth };
        })
        .catch(() => null);
      await m.getByRole('button', { name: 'Close details' }).click().catch(() => {});
      const closed = await panel.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
      await node.click().catch(() => {});
      await panel.waitFor({ timeout: 5000 }).catch(() => {});
      await m.keyboard.press('Escape');
      const escClosed = await panel.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
      check(
        sheet?.layout === 'sheet' && sheet.width >= sheet.vw - 1 && Math.abs(sheet.gap) <= 2 && closed && escClosed,
        'mobile: graph details open as a bottom sheet that closes with its button or Escape',
        JSON.stringify({ ...sheet, closed, escClosed }),
      );
    }

    // The study loop starts on the first screen (no big hero pushing it down).
    await m.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const today = m.getByTestId('study-today');
    await today.waitFor({ timeout: 30000 }).catch(() => {});
    const todayTop = await today.evaluate((el) => el.getBoundingClientRect().top + window.scrollY).catch(() => Infinity);
    check(todayTop < 300, 'mobile: the Today panel starts near the top of the first screen', `top ${Math.round(todayTop)}px`);

    await m.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const drawer = m.locator('#app-sidebar');
    const menu = m.getByRole('button', { name: 'Open menu' });
    const hiddenAtStart = !(await drawer.isVisible());
    await clickWhenHydrated(menu, drawer);
    const opened = (await drawer.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'true';
    check(hiddenAtStart && opened, 'mobile: menu button opens the navigation drawer');
    // Focus moves into the drawer and Tab cannot wander into the page behind it.
    await m.keyboard.press('Shift+Tab');
    const trapped = await m.evaluate(() => document.getElementById('app-sidebar')?.contains(document.activeElement));
    check(trapped === true, 'mobile: keyboard focus stays inside the open drawer');
    await m.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    const escClosed = !(await drawer.isVisible());
    const focusBack = await m.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check(escClosed && focusBack === 'Open menu', 'mobile: Escape closes the drawer and returns focus', `focus on ${focusBack}`);
    await menu.click();
    await drawer.getByRole('link', { name: /Recommendations/ }).click();
    await m.waitForURL((u) => u.pathname === '/recommendations', { timeout: 15000 }).catch(() => {});
    await drawer.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    check(
      new URL(m.url()).pathname === '/recommendations' && !(await drawer.isVisible()),
      'mobile: picking a page navigates and closes the drawer',
      m.url(),
    );
    // Only the current page is marked as such for screen readers.
    // (textContent: the closed drawer is visibility:hidden, so innerText is empty.)
    const current = await drawer.locator('[aria-current="page"]').allTextContents();
    check(
      current.length === 1 && current[0].includes('Recommendations'),
      'navigation marks only the current page (aria-current)',
      JSON.stringify(current),
    );
    await mctx.close();
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'mobile layout has no page errors', newErrors.join(' | '));
  }

  // Unknown URLs get the friendly 404 page (HTTP 404), with a way back home.
  {
    const before = errors.length;
    const res = await page.goto(`${BASE}/this-page-does-not-exist`, { waitUntil: 'networkidle' });
    const heading = await page
      .getByRole('heading', { name: 'Page not found' })
      .waitFor({ timeout: 30000 })
      .then(() => true, () => false);
    const newErrors = errors.slice(before).filter((e) => !/404/.test(e));
    check(
      res?.status() === 404 && heading && newErrors.length === 0,
      'unknown URL shows the friendly 404 page',
      `HTTP ${res?.status()}${newErrors.length ? `, ${newErrors.join(' | ')}` : ''}`,
    );
    const notFoundTitle = await page
      .waitForFunction(() => document.title === 'Page not found · LearnGraph', null, { timeout: 10000 })
      .then(() => true, () => false);
    check(notFoundTitle, '404 page is titled "Page not found"', await page.title());
    await page.getByRole('link', { name: 'Back to dashboard' }).click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 }).then(
      () => check(true, '404 page links back to the dashboard'),
      () => check(false, '404 page links back to the dashboard', page.url()),
    );
    await page.waitForFunction(() => document.title === 'Dashboard · LearnGraph', null, { timeout: 10000 }).catch(() => {});
    check(
      (await page.title()) === 'Dashboard · LearnGraph',
      'leaving the 404 page restores the page title',
      await page.title(),
    );
    const robots = await fetch(`${BASE}/robots.txt`);
    const robotsText = robots.ok ? await robots.text() : '';
    check(robots.ok && /Disallow: \//.test(robotsText) && /Allow: \/sign-in/.test(robotsText), 'robots.txt is served', `HTTP ${robots.status}`);
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

  // Accessibility (Roadmap, cross-milestone): the first Tab reaches "Skip to
  // content", and it moves keyboard focus to the page's main content.
  {
    await page.goto(`${BASE}/gaps`, { waitUntil: 'networkidle' });
    await page.locator('main').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => (document.activeElement?.textContent ?? '').trim());
    await page.keyboard.press('Enter');
    const inMain = await page.evaluate(() => document.activeElement?.tagName === 'MAIN');
    check(first === 'Skip to content' && inMain, 'a11y: "Skip to content" is the first Tab stop and moves focus to the main content', `first "${first}", in main ${inMain}`);
  }

  // Roadmap M3: import a learner from a JSON export (PR #29's format) — a new
  // learner, with progress only on concepts this workspace has.
  {
    const before = errors.length;
    const { writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const file = `${tmpdir()}/learngraph-smoke-import-${Date.now()}.json`;
    await writeFile(
      file,
      JSON.stringify({
        format: 'learngraph.learner-export',
        version: 1,
        learner: { id: 'me-imported', name: 'Imported Ines', profile: { userId: 'me-imported', name: 'Imported Ines' } },
        knowledgeStates: [
          { userId: 'me-imported', conceptId: 'decimals', mastery: 60 },
          { userId: 'me-imported', conceptId: 'not-here', mastery: 90 },
        ],
      }),
    );
    await page.goto(`${BASE}/admin/learners`, { waitUntil: 'networkidle' });
    await page.getByLabel('Import from a file').setInputFiles(file);
    const notice = page.getByTestId('import-notice');
    await notice.getByText('as a new learner', { exact: false }).waitFor({ timeout: 15000 }).catch(() => {});
    const text = await notice.innerText().catch(() => '');
    const listed = await page.getByText('Imported Ines', { exact: true }).first().isVisible().catch(() => false);
    check(
      /Imported “Imported Ines” as a new learner with 1 progress record\. 1 skipped/.test(text) && listed,
      'import: a learner export becomes a new learner (unknown concepts skipped)',
      text,
    );
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'learner import has no page errors', newErrors.join(' | '));
  }

  // Roadmap M5: AI drafts are off until the account turns them on; then the
  // curriculum and question drafting forms appear, use the person's own key
  // (a malformed key is refused before anything is sent), and nothing is
  // saved without review. No model is called here.
  {
    const before = errors.length;
    await page.goto(`${BASE}/admin/curriculum`, { waitUntil: 'networkidle' });
    const toggle = page.getByLabel(/Let Claude draft curricula and questions/);
    await toggle.waitFor({ timeout: 30000 }).catch(() => {});
    const offAtFirst = !(await toggle.isChecked().catch(() => true)) && (await page.getByLabel('Course description or syllabus').count()) === 0;
    await toggle.check();
    const syllabus = page.getByLabel('Course description or syllabus');
    const formShown = await syllabus.waitFor({ timeout: 15000 }).then(() => true, () => false);
    // A Word file is read in the browser into the description box (nothing is sent yet).
    await page.getByLabel(/Or attach the course as a PDF or Word file/).setInputFiles({
      name: 'course.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from(makeDocx(['Statistics 101', 'Week 1: averages & spread', 'Week 2: probability'])),
    });
    const fromWord = await page
      .waitForFunction(
        (el) => el.value.includes('Week 1: averages & spread\nWeek 2: probability'),
        await syllabus.elementHandle({ timeout: 5000 }).catch(() => null),
        { timeout: 10000 },
      )
      .then(() => true, () => false);
    check(fromWord, 'curriculum: the text of a Word file fills the description to check before drafting', (await syllabus.inputValue()).slice(0, 80));
    await page.getByLabel('Subject').fill('Statistics');
    await syllabus.fill('An introduction to statistics: averages, spread, probability and simple tests.');
    await page.getByLabel('Anthropic API key').fill('not-a-key');
    await page.getByRole('button', { name: 'Draft with Claude' }).click();
    const refused = await page.getByRole('alert').filter({ hasText: 'starts with sk-ant-' }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    await page.goto(`${BASE}/admin/questions`, { waitUntil: 'networkidle' });
    const panel = await page.getByTestId('ai-question-drafts').waitFor({ timeout: 30000 }).then(() => true, () => false);
    await page.getByLabel(/Let Claude draft questions/).uncheck().catch(() => {});
    const hiddenAgain = await page.getByTestId('ai-question-drafts').waitFor({ state: 'detached', timeout: 15000 }).then(() => true, () => false);
    check(
      offAtFirst && formShown && refused && panel && hiddenAgain,
      'AI drafts: off by default, then drafting forms use the person’s own key and can be turned off again',
      `off ${offAtFirst}, form ${formShown}, bad key refused ${refused}, question panel ${panel}, off again ${hiddenAgain}`,
    );
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'AI draft pages have no page errors', newErrors.join(' | '));
  }

  // Roadmap M4: a read-only API key lets an outside assistant fetch the tutor
  // brief (no cookies), only with the key, and not after it is revoked.
  {
    const before = errors.length;
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    const access = page.getByTestId('api-access');
    await untilHydrated(access.getByRole('button', { name: 'Create a read-only key' }));
    await access.getByLabel('Key name').fill('Smoke assistant');
    await access.getByRole('button', { name: 'Create a read-only key' }).click();
    const secretBox = access.getByTestId('new-api-key').getByRole('textbox');
    await secretBox.waitFor({ timeout: 15000 }).catch(() => {});
    const key = await secretBox.inputValue().catch(() => '');
    const call = (url, k) => fetch(url, { headers: k ? { authorization: `Bearer ${k}` } : {} });
    const ctxRes = await call(`${BASE}/api/v1/context?concept=Fractions&q=${encodeURIComponent('explain adding fractions')}`, key);
    const ctxBody = await ctxRes.json().catch(() => ({}));
    const anon = await call(`${BASE}/api/v1/context`, null);
    const learnersRes = await call(`${BASE}/api/v1/learners`, key);
    const learnersBody = await learnersRes.json().catch(() => ({}));
    check(
      /^lg_/.test(key) &&
        ctxRes.status === 200 &&
        /^You are tutoring one learner/.test(ctxBody.context ?? '') &&
        ctxBody.queryType === 'explain' &&
        anon.status === 401 &&
        learnersRes.status === 200 &&
        (learnersBody.learners ?? []).length > 0,
      'api: a read-only key fetches the tutor brief; without a key the API refuses',
      `context ${ctxRes.status} (${ctxBody.queryType}), no key ${anon.status}, learners ${learnersRes.status}`,
    );
    page.once('dialog', (d) => d.accept());
    await access.getByRole('button', { name: /^Revoke/ }).first().click();
    await access.getByRole('list', { name: 'Your API keys' }).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const afterRevoke = await call(`${BASE}/api/v1/context`, key);
    check(afterRevoke.status === 401, 'api: a revoked key stops working at once', `HTTP ${afterRevoke.status}`);
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'API access settings have no page errors', newErrors.join(' | '));
  }

  // Roadmap M3, data control: a second account starts with an empty workspace
  // (the examples are removed and do not come back after a reload), then
  // deletes itself from My Profile, which signs it out for good.
  {
    const ctx3 = await browser.newContext();
    const p3 = await ctx3.newPage();
    const errors3 = [];
    p3.on('pageerror', (e) => errors3.push(`pageerror: ${e.message}`));
    p3.on('dialog', (d) => d.accept());
    const email3 = `smoke-empty-${Date.now()}@example.test`;
    const password3 = `smoke-${Math.random().toString(36).slice(2)}-pw`;
    await p3.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
    await clickWhenHydrated(p3.getByRole('button', { name: 'Create one' }), p3.locator('#name'));
    await p3.fill('#name', 'Empty Tester');
    await p3.fill('#email', email3);
    await p3.fill('#password', password3);
    await p3.getByRole('button', { name: 'Create account' }).click();
    await p3.waitForURL((u) => u.pathname === '/', { timeout: 30000 }).catch(() => {});
    const onboarding3 = p3.getByTestId('onboarding');
    await onboarding3.getByRole('button', { name: 'Start with an empty workspace' }).click({ timeout: 30000 });
    const noSubjects = await onboarding3
      .getByText('No subjects yet', { exact: false })
      .waitFor({ timeout: 15000 })
      .then(() => true, () => false);
    await p3.reload({ waitUntil: 'networkidle' });
    await p3.getByTestId('onboarding').waitFor({ timeout: 30000 }).catch(() => {});
    // The subjects load after the step appears: wait for the text, don't sample it.
    const stillEmpty = await p3
      .getByTestId('onboarding')
      .getByText('No subjects yet', { exact: false })
      .waitFor({ timeout: 30000 })
      .then(() => true, () => false);
    const skipOffered = await p3.getByRole('button', { name: 'Explore the example learners first' }).count();
    check(
      noSubjects && stillEmpty && skipOffered === 0,
      'onboarding: "Start with an empty workspace" removes the examples for good',
      `empty at once ${noSubjects}, after reload ${stillEmpty}, skip offered ${skipOffered}`,
    );

    // Roadmap M3: "Forgot your password?" emails a one-hour link (read from
    // the dev outbox in CI); the new password works and old sessions end.
    let currentPassword = password3;
    await p3.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle' });
    await untilHydrated(p3.getByRole('button', { name: 'Send the reset link' }), 60000);
    await p3.getByLabel('Email').fill(email3);
    await p3.getByRole('button', { name: 'Send the reset link' }).click();
    const requested = await p3.getByText('a reset link is on its way', { exact: false }).waitFor({ timeout: 30000 }).then(() => true, () => false);
    const outboxFile = process.env.DEV_EMAIL_OUTBOX;
    if (outboxFile) {
      const { readFile } = await import('node:fs/promises');
      let link = null;
      // Up to a minute: on a busy machine the email can take longer than the page.
      for (let i = 0; i < 120 && !link; i++) {
        const lines = (await readFile(outboxFile, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
        const mail = lines.filter((m) => m.to === email3).at(-1);
        link = mail?.text.match(/https?:\/\/\S+\/reset-password\/\S+/)?.[0] ?? null;
        if (!link) await p3.waitForTimeout(500);
      }
      const newPassword = `${password3}-new`;
      if (link) {
        await p3.goto(link, { waitUntil: 'networkidle' });
        await untilHydrated(p3.getByRole('button', { name: 'Save the new password' }), 60000);
        await p3.getByLabel('New password', { exact: true }).fill(newPassword);
        await p3.getByLabel('New password again').fill(newPassword);
        await p3.getByRole('button', { name: 'Save the new password' }).click();
        // Hashing a password is slow on purpose, and slower on a busy machine:
        // wait for the answer rather than navigate away and abort it.
        const changed = await p3.getByText('Your password is changed', { exact: false }).waitFor({ timeout: 60000 }).then(() => true, () => false);
        // A fresh browser: the old password is refused, the new one works.
        // (Other signed-in browsers end within the 5-minute session cookie cache.)
        await ctx3.clearCookies();
        await p3.goto(`${BASE}/sign-in?redirect=%2Fprofile`, { waitUntil: 'networkidle' });
        await untilHydrated(p3.getByRole('button', { name: 'Sign in' }), 60000);
        await p3.fill('#email', email3);
        await p3.fill('#password', password3);
        await p3.getByRole('button', { name: 'Sign in' }).click();
        const oldRefused = await p3.getByRole('alert').waitFor({ timeout: 60000 }).then(() => true, () => false);
        await p3.fill('#password', newPassword);
        await p3.getByRole('button', { name: 'Sign in' }).click();
        await p3.waitForURL((u) => u.pathname === '/profile', { timeout: 60000 }).catch(() => {});
        const signedIn = new URL(p3.url()).pathname === '/profile';
        if (signedIn) currentPassword = newPassword;
        check(
          requested && changed && oldRefused && signedIn,
          'password reset: the emailed link sets a new password (the old one stops working)',
          `changed ${changed}, old refused ${oldRefused}, signed in with new ${signedIn}`,
        );
      } else {
        check(
          false,
          'password reset: the emailed link sets a new password (the old one stops working)',
          `no reset email in the dev outbox (form confirmed the request: ${requested})`,
        );
      }
    } else {
      check(requested, 'password reset: a reset link can be requested');
    }

    await p3.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    const del = p3.getByTestId('delete-account');
    await del.getByRole('button', { name: 'Delete my account…' }).click({ timeout: 30000 });
    await del.getByLabel('Your password').fill(currentPassword);
    await del.getByLabel('Type DELETE to confirm').fill('DELETE');
    await del.getByRole('button', { name: 'Delete my account and all data' }).click();
    await p3.waitForURL(/\/sign-in/, { timeout: 30000 }).catch(() => {});
    await p3.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    await p3.waitForURL(/\/sign-in/, { timeout: 15000 }).catch(() => {});
    check(
      p3.url().includes('/sign-in') && errors3.length === 0,
      'profile: "Delete my account" removes the account and signs it out',
      `${new URL(p3.url()).pathname}${errors3.length ? `, ${errors3.join(' | ')}` : ''}`,
    );
    await ctx3.close();
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
  // The limit is 10 attempts a minute, so the 11th in a row is refused even if
  // the counter started over here. Each attempt waits for the server's answer
  // (the form clears its message while a request is pending).
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  await untilHydrated(p2.getByRole('button', { name: 'Sign in' }), 60000);
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) {
    await p2.fill('#email', email);
    await p2.fill('#password', `wrong-password-${i}`);
    const answer = p2
      .waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/sign-in/email'), { timeout: 30000 })
      .catch(() => null);
    await p2.getByRole('button', { name: 'Sign in' }).click();
    limited = (await answer)?.status() === 429;
  }
  const friendly = limited && (await p2.getByRole('alert').filter({ hasText: 'Too many attempts' }).waitFor({ timeout: 15000 }).then(() => true, () => false));
  check(limited && friendly, 'repeated wrong passwords are rate-limited with a friendly message', `429 ${limited}, message ${friendly}`);
  await ctx2.close();
  await page.screenshot({ path: process.env.SMOKE_SCREENSHOT ?? '/tmp/learngraph-smoke.png' });
} catch (err) {
  check(false, 'smoke flow', err?.message ?? String(err));
} finally {
  await browser.close();
}

console.log(results.join('\n'));
process.exit(failed ? 1 : 0);
