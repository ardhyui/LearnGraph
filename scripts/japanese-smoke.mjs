import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { QUESTIONS } from '../src/lib/japanese/questions.ts';
if (process.env.JAPANESE_QA !== '1')
  throw new Error('Run only with isolated QA databases and JAPANESE_QA=1.');
const graphBase = process.env.JAPANESE_TEST_URL ?? 'http://127.0.0.1:17842';
const michiBase = process.env.MICHI_TEST_URL ?? 'http://127.0.0.1:17841';
const qaDir = resolve(process.env.JAPANESE_QA_DIR ?? '/tmp/learngraph-japanese-qa');
for (const base of [graphBase, michiBase]) {
  const url = new URL(base);
  if (url.hostname !== '127.0.0.1' || !['17841', '17842'].includes(url.port))
    throw new Error('Use isolated QA ports 17841/17842, never the personal services.');
}
if (graphBase === michiBase || !qaDir.startsWith('/tmp/'))
  throw new Error('Use distinct QA services and a temporary fixture directory.');
await mkdir('test-results/japanese', { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  console.log('QA browser started');
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${graphBase}/japanese`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page
    .getByRole('heading', { name: 'Bahasa Jepang sampai N1', exact: true })
    .waitFor({ timeout: 60000 });
  console.log('Japanese heading loaded');
  await page.getByRole('button', { name: 'Mulai kuis yang disarankan' }).click({ timeout: 60000 });
  console.log('Quiz started');
  async function answerQuiz() {
    await page.locator('fieldset').first().waitFor();
    for (const f of await page.locator('fieldset').all()) {
      const prompt = await f.locator('legend span').innerText();
      const q = QUESTIONS.find((q) => q.prompt === prompt);
      assert.ok(q, 'question exists in bank');
      await f.getByRole('radio', { name: q.answer, exact: true }).check();
    }
    await page.getByRole('button', { name: 'Nilai jawaban' }).click();
    await page
      .getByText('Hasil: 3/3 · sinyal penguasaan 70%', { exact: true })
      .waitFor({ timeout: 30000 });
  }
  await answerQuiz();
  console.log('Quiz graded');
  await page.getByRole('button', { name: 'Selesai membahas' }).click();
  await page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Hiragana dan bunyi mora', exact: true }) })
    .getByRole('button', { name: 'Latihan kuis' })
    .click();
  await answerQuiz();
  console.log('Quiz graded');
  await page.getByRole('button', { name: 'Selesai membahas' }).click();
  await page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Membaca teks pendek', exact: true }) })
    .getByRole('button', { name: 'Catat praktik' })
    .click();
  await page
    .getByRole('textbox', { name: 'Bukti dan catatan' })
    .fill('QA terisolasi: membaca satu cerita dan mencatat kosakata.');
  await page.getByRole('button', { name: 'Simpan praktik' }).click();
  await page.getByText('Praktik tersimpan.', { exact: true }).waitFor();
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${graphBase}/japanese`, { waitUntil: 'domcontentloaded' });
  await mobile.getByRole('heading', { name: 'Peta kemampuan', exact: true }).waitFor();
  await mobile.screenshot({ path: 'test-results/japanese/mobile.png' });
  assert.ok(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'mobile horizontal overflow',
  );
  await context.close();
  console.log('Practice and mobile done');
  const michi = await browser.newContext();
  const now = Date.now();
  const snapshot = {
    v: 2,
    cards: Object.fromEntries(
      [...'一二三日月木人口'].map((c) => [
        c,
        { ease: 2.5, interval: 3, reps: 2, lapses: 0, due: now - 1000, last: now - 86400000 * 3 },
      ]),
    ),
    pakets: { 'dasar:0': true, 'dasar:1': true },
    exams: { dasar: true },
    streak: 1,
    lastDay: '2026-11-03',
    stats: { day: '2026-11-03', reviews: 8, learned: 8, correct: 8, answered: 8 },
    history: {},
  };
  await michi.addInitScript(
    (s) => localStorage.setItem('michi-progress-v2', JSON.stringify(s)),
    snapshot,
  );
  const mp = await michi.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  await mp.goto(`${michiBase}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await mp
    .getByText('Progres tersimpan · LearnGraph akan membaca hasil terbaru.', { exact: true })
    .waitFor({ timeout: 45000 });
  const file = JSON.parse(await readFile(join(qaDir, 'michi-progress.json'), 'utf8'));
  assert.equal(Object.keys(file.progress.cards).length, 8);
  await michi.close();
  const restored = await browser.newContext();
  const rp = await restored.newPage();
  await rp.goto(`${michiBase}/`, { waitUntil: 'domcontentloaded' });
  await rp
    .getByText('Progres tersimpan · LearnGraph akan membaca hasil terbaru.', { exact: true })
    .waitFor();
  assert.equal(
    await rp.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem('michi-progress-v2')).cards).length,
    ),
    8,
    'restore to empty browser',
  );
  const gp = await restored.newPage();
  await gp.goto(`${graphBase}/japanese`, { waitUntil: 'domcontentloaded' });
  await gp
    .getByRole('article')
    .filter({ has: gp.getByRole('heading', { name: 'Kanji Michi: Dasar', exact: true }) })
    .getByText('Sinyal latihan: 85%', { exact: true })
    .waitFor({ timeout: 30000 });
  const backup = await gp.request.post(`${graphBase}/api/japanese-backup`);
  assert.equal(backup.status(), 200);
  assert.ok((await backup.body()).length > 1000);
  const forbidden = await gp.request.post(`${graphBase}/api/japanese-backup`, {
    headers: { Origin: 'https://evil.test' },
  });
  assert.equal(forbidden.status(), 403);
  await gp.screenshot({ path: 'test-results/japanese/desktop.png', fullPage: true });
  await restored.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: quiz grading, same-day cap, practice, mobile layout, Michi snapshot + restore + graph import, consistent backup, foreign-origin rejection.',
  );
} finally {
  await browser.close();
}
