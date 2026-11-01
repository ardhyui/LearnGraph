#!/usr/bin/env node
/**
 * Local CI gate — required before every merge (no GitHub Actions).
 *
 *   npm run ci                # clean `npm ci`, typecheck, lint, tests, build, smoke
 *   npm run ci -- --no-install  # skip the clean reinstall (faster local iteration)
 *
 * The smoke test runs against a dev server on CI_PORT (default 8081) backed by
 * a fresh in-memory PGlite database: DATABASE_URL / PGLITE_DATA_DIR are forced
 * empty so a local `.env` can never point CI at a real database.
 */
import { spawn } from 'node:child_process';

const PORT = process.env.CI_PORT ?? '8081';
const BASE = `http://127.0.0.1:${PORT}`;
const skipInstall = process.argv.includes('--no-install');
const ciEnv = {
  ...process.env,
  DATABASE_URL: '',
  PGLITE_DATA_DIR: '',
  BETTER_AUTH_URL: '',
  BETTER_AUTH_SECRET: 'local-ci-only-not-a-secret-0123456789abcdef',
};

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: ciEnv, ...opts });
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.on('error', () => resolve(127));
  });

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function smoke() {
  if ((await run('npx', ['playwright', 'install', 'chromium'])) !== 0) return 1;
  const server = spawn(
    'node',
    ['scripts/with-app-env.mjs', 'vite', 'dev', '--host', '127.0.0.1', '--port', PORT, '--strictPort'],
    { env: ciEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  );
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  try {
    if (!(await waitFor(`${BASE}/sign-in`, 180_000))) {
      console.error(`dev server did not start on ${BASE}\n${log}`);
      return 1;
    }
    const code = await run('node', ['scripts/smoke.mjs'], { env: { ...ciEnv, BASE_URL: BASE } });
    if (code !== 0) console.error(`--- dev server log ---\n${log.slice(-8000)}`);
    return code;
  } finally {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // already exited
    }
  }
}

const steps = [
  ...(skipInstall ? [] : [['install (npm ci)', () => run('npm', ['ci'])]]),
  ['typecheck', () => run('npm', ['run', 'typecheck'])],
  ['lint (0 errors, 0 warnings)', () => run('npm', ['run', 'lint'])],
  ['tests', () => run('npm', ['test'])],
  ['build', () => run('npm', ['run', 'build'])],
  ['smoke (Playwright + PGlite)', smoke],
];

const results = [];
for (const [name, fn] of steps) {
  console.log(`\n=== CI: ${name} ===`);
  const t = Date.now();
  const code = await fn();
  results.push({ name, ok: code === 0, secs: ((Date.now() - t) / 1000).toFixed(1) });
  if (code !== 0) break;
}

console.log('\n=== CI summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.secs}s)`);
for (const [name] of steps.slice(results.length)) console.log(`SKIP  ${name}`);
const ok = results.length === steps.length && results.every((r) => r.ok);
console.log(ok ? '\nCI PASSED' : '\nCI FAILED');
process.exit(ok ? 0 : 1);
