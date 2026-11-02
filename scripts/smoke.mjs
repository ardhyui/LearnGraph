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

  const h1Counts = [];
  for (const [path] of PAGES) {
    const before = errors.length;
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
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
    // Retry until hydrated (a click before hydration is a no-op).
    for (let i = 0; i < 20 && (await manage.getAttribute('aria-expanded')) !== 'true'; i++) {
      await manage.click();
      await page.waitForTimeout(300);
    }
    const expanded = (await link('Concepts').isVisible()) && (await manage.getAttribute('aria-expanded')) === 'true';
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const remembered = await link('Concepts').isVisible();
    check(expanded && remembered, 'navigation: "Manage data" expands and stays open after reload');
    await page.goto(`${BASE}/tests`, { waitUntil: 'networkidle' });
    check(
      (await link('Functional Tests').isVisible()) && (await dev.getAttribute('aria-expanded')) === 'true',
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
    for (let i = 0; i < 20 && (await manage.getAttribute('aria-expanded')) !== 'false'; i++) {
      await manage.click();
      await page.waitForTimeout(300);
    }
    check(!(await link('Concepts').isVisible()), 'navigation: a group can be collapsed again');
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
    const prefilled = shown ? await onboarding.getByLabel('What should we call you?').inputValue() : '';
    check(shown && todayHidden && prefilled === 'Smoke Tester', 'onboarding: a new account is welcomed with a setup step', `name "${prefilled}"`);
    await onboarding.getByRole('button', { name: 'Explore the example learners first' }).click();
    const skipped = await page.getByTestId('study-today').waitFor({ timeout: 15000 }).then(() => true, () => false);
    await page.reload({ waitUntil: 'networkidle' });
    const staysSkipped = await page.getByTestId('study-today').waitFor({ timeout: 30000 }).then(() => true, () => false);
    check(skipped && staysSkipped && (await onboarding.count()) === 0, 'onboarding: can be skipped to explore the example learners');
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'onboarding has no page errors', newErrors.join(' | '));
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
      const firstReview = await reviews.first().innerText().catch(() => '');
      check(
        /(Overdue by \d+ days?|Due today) · about \d+% remembered/.test(firstReview),
        'dashboard: a due review says how late it is in plain words',
        firstReview.replace(/\s+/g, ' ').slice(0, 80),
      );
      await reviews.first().getByRole('button', { name: 'I remembered it' }).click();
      const saved = await today
        .getByText('will come back after a longer break', { exact: false })
        .waitFor({ timeout: 15000 })
        .then(() => true, () => false);
      check(saved, 'dashboard: a due review can be marked as remembered');
    } else {
      check(false, 'dashboard: a due review can be marked as remembered', 'no reviews due for the demo learner');
    }

    // Reviewed concepts unlock new ones: keep reviewing until something is
    // offered under "Learn next" (demo progress is dated relative to the seed, so
    // only some of the demo learner's reviews are due).
    const next = today.getByRole('list', { name: 'Recommended next concepts' }).getByRole('listitem');
    for (let i = 0; i < 8 && !(await next.count()) && (await reviews.count()) > 0; i++) {
      await reviews.first().getByRole('button', { name: 'I remembered it' }).click();
      await page.waitForTimeout(1500);
    }
    await next.first().waitFor({ timeout: 15000 }).catch(() => {});
    if ((await next.count()) > 0) {
      const beforeGotIt = Number(await mastered.innerText());
      await next.first().getByRole('button', { name: "I've got it" }).click();
      await today.getByText('is marked as mastered', { exact: false }).waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForFunction(
        (n) => Number(document.querySelector('[data-testid="mastered-count"]')?.textContent) > n,
        beforeGotIt,
        { timeout: 15000 },
      ).catch(() => {});
      const masteredAfter = Number(await mastered.innerText());
      check(masteredAfter > beforeGotIt, 'dashboard: "I\'ve got it" raises the mastered count', `${beforeGotIt} → ${masteredAfter}`);
    } else {
      check(false, 'dashboard: "I\'ve got it" raises the mastered count', 'no recommended concept');
    }
    const newErrors = errors.slice(before);
    check(newErrors.length === 0, 'dashboard study loop has no page errors', newErrors.join(' | '));
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
  // starts with the basics already known, and is remembered after a reload.
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
    check(
      /Mathematics/.test(focusText) && mastered > 0 && (await nextItems.count()) > 0,
      'onboarding: plan follows the chosen subject and skips the basics',
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
    for (let i = 0; i < 20 && !(await editor.isVisible().catch(() => false)); i++) {
      await changeBtn.click();
      await page.waitForTimeout(300);
    }
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
    const hiddenTrait = await page.getByText('Difficult traits').isVisible().catch(() => true);
    const mainText = await page.locator('main').innerText().catch(() => '');
    check(firstCat === 'How you think and learn' && moreOpen === false && !hiddenTrait, 'profile: learning-relevant topics first, the rest folded under "More about you"', `"${firstCat}", open=${moreOpen}`);
    check(!/Dark Personality|NEO-PI-R|MACH-IV|domains configured|^[A-H]\. /m.test(mainText), 'profile: no instrument names or lettered jargon categories', '');
    await more.locator('summary').click();
    check(await page.getByText('Difficult traits').isVisible().catch(() => false), 'profile: "More about you" opens on request');

    const setMyself = page.getByRole('button', { name: 'Set it myself' });
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
      const r = await fits();
      if (r.main < 350 || r.overflow > 1) narrow.push(`${path}: main ${r.main}px, overflow ${r.overflow}px`);
    }
    check(narrow.length === 0, 'mobile: pages use the full width without sideways scrolling', narrow.join('; '));

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
    // Retry until hydrated (a tap before hydration is a no-op).
    for (let i = 0; i < 20 && !(await drawer.isVisible()); i++) {
      await menu.click();
      await m.waitForTimeout(400);
    }
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
