#!/usr/bin/env node
/**
 * Local CI gate — required before every merge (no GitHub Actions).
 *
 *   npm run ci                # clean `npm ci`, typecheck, lint, tests, build, CSP, smoke
 *   npm run ci -- --no-install  # skip the clean reinstall (faster local iteration)
 *
 * The smoke test runs against a dev server on CI_PORT (default 8081, or a free
 * port when 8081 is taken) backed by
 * a fresh in-memory PGlite database: DATABASE_URL / PGLITE_DATA_DIR are forced
 * empty so a local `.env` can never point CI at a real database. The CSP check
 * runs against the production build (`vite preview`) on CI_PREVIEW_PORT
 * (default 8083), because the dev server still allows inline scripts.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Resolve with `port` if nothing listens on it, else with a free port chosen by the OS. */
const freePort = (port) =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      const any = createServer();
      any.listen(0, '127.0.0.1', () => {
        const picked = String(any.address().port);
        any.close(() => resolve(picked));
      });
    });
    probe.listen(Number(port), '127.0.0.1', () => probe.close(() => resolve(String(port))));
  });

/**
 * Default ports move aside when another app on this machine already uses them
 * (a busy default port used to fail the whole gate with "Port 8081 is in use").
 * Explicit CI_PORT / CI_PREVIEW_PORT are used as given.
 */
async function ciPort(envName, fallback) {
  if (process.env[envName]) return process.env[envName];
  const port = await freePort(fallback);
  if (port !== fallback) console.log(`[ci] port ${fallback} is in use; using ${port} (set ${envName} to choose)`);
  return port;
}

const PORT = await ciPort('CI_PORT', '8081');
const BASE = `http://127.0.0.1:${PORT}`;
const PREVIEW_PORT = await ciPort('CI_PREVIEW_PORT', '8083');
const skipInstall = process.argv.includes('--no-install');
const ciEnv = {
  ...process.env,
  DATABASE_URL: '',
  PGLITE_DATA_DIR: '',
  BETTER_AUTH_URL: '',
  BETTER_AUTH_SECRET: 'local-ci-only-not-a-secret-0123456789abcdef',
  // Dev-only email outbox (src/lib/email.ts): the smoke test reads reset links from it.
  DEV_EMAIL_OUTBOX: join(tmpdir(), `learngraph-ci-outbox-${process.pid}.jsonl`),
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
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

/** Start the app (`vite dev` or `vite preview`) on a port, run `fn`, then stop it. */
async function withServer(mode, port, fn) {
  const server = spawn(
    'node',
    ['scripts/with-app-env.mjs', 'vite', mode, '--host', '127.0.0.1', '--port', port, '--strictPort'],
    { env: ciEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  );
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  try {
    if (!(await waitFor(`${base}/sign-in`, 180_000))) {
      console.error(`${mode} server did not start on ${base}\n${log}`);
      return 1;
    }
    const code = await fn(base);
    if (code !== 0) console.error(`--- ${mode} server log ---\n${log.slice(-8000)}`);
    return code;
  } finally {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // already exited
    }
  }
}

const productionCsp = () =>
  withServer('preview', PREVIEW_PORT, (base) => run('node', ['scripts/check-csp.mjs'], { env: { ...ciEnv, BASE_URL: base } }));

async function smoke() {
  if ((await run('npx', ['playwright', 'install', 'chromium'])) !== 0) return 1;
  return withServer('dev', PORT, () =>
    run('node', ['--experimental-strip-types', 'scripts/smoke.mjs'], { env: { ...ciEnv, BASE_URL: BASE } }),
  );
}

const steps = [
  ...(skipInstall ? [] : [['install (npm ci)', () => run('npm', ['ci'])]]),
  ['typecheck', () => run('npm', ['run', 'typecheck'])],
  ['lint (0 errors, 0 warnings)', () => run('npm', ['run', 'lint'])],
  ['tests', () => run('npm', ['test'])],
  ['build', () => run('npm', ['run', 'build'])],
  ['CSP on the production build', productionCsp],
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
