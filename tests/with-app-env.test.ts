/**
 * Direct unit tests for the `.env` wrapper `scripts/with-app-env.mjs`
 * (`parseDotEnv`, `projectRoot`, `readDotEnv` and `exitStatusFromChild`).
 *
 * `dev`, `build`, `preview` and `db:migrate` all route through this wrapper, so
 * a change here silently changes which `DATABASE_URL`/`BETTER_AUTH_SECRET` the
 * server, the build or the migrator sees. Until now it was only exercised
 * indirectly through those scripts. The module's behaviour is not changed by
 * this file: the tests import the `.mjs` directly and lock the current contract
 * (including its rough edges). Only JSDoc type annotations (plus `@ts-check`)
 * are added to the module so `tsc` can check it once a test imports it under
 * `checkJs`; `main` and `isMainModule` stay private, so the CLI is tested
 * through `spawnSync`; the repository `.env` is never read or written — the
 * precedence test copies the wrapper into a temporary root.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  exitStatusFromChild,
  parseDotEnv,
  projectRoot,
  readDotEnv,
} from '../scripts/with-app-env.mjs';

const ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'with-app-env.mjs');
const NODE = process.execPath;

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { force: true, recursive: true });
  }
});

function runWrapper(
  args: string[],
  script: string = SCRIPT,
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  return spawnSync(NODE, [script, ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
  });
}

describe('parseDotEnv', () => {
  it('reads LF and CRLF documents', () => {
    assert.deepEqual(parseDotEnv('A=1\nB=2'), { A: '1', B: '2' });
    assert.deepEqual(parseDotEnv('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
  });

  it('drops blank lines and full-line comments', () => {
    assert.deepEqual(parseDotEnv('\n  \n# comment\n  # indented comment\nA=1'), { A: '1' });
    assert.deepEqual(parseDotEnv('\r\n# only comments\r\n'), {});
  });

  it('trims spaces around keys and values', () => {
    assert.deepEqual(parseDotEnv('  A  =  1  '), { A: '1' });
    assert.deepEqual(parseDotEnv('\tKEY\t=\tvalue with spaces\t'), { KEY: 'value with spaces' });
  });

  it('splits on the first `=` so values may contain more', () => {
    assert.deepEqual(parseDotEnv('E=a=b'), { E: 'a=b' });
    assert.deepEqual(parseDotEnv('URL=postgres://u:p@host:5432/db?sslmode=require'), {
      URL: 'postgres://u:p@host:5432/db?sslmode=require',
    });
  });

  it('skips lines without `=` and lines with an empty key', () => {
    assert.deepEqual(parseDotEnv('NOEQUALS\n=bad\n  =also-bad\nA=1'), { A: '1' });
  });

  it('strips an `export ` prefix only when followed by whitespace', () => {
    assert.deepEqual(parseDotEnv('export I=9'), { I: '9' });
    assert.deepEqual(parseDotEnv('export\tT=3'), { T: '3' });
    assert.deepEqual(parseDotEnv('exportJ=10'), { exportJ: '10' });
    assert.deepEqual(parseDotEnv('export  X=1'), { X: '1' });
  });

  it('strips matching single or double quotes at both ends', () => {
    assert.deepEqual(parseDotEnv('Q="quoted value"'), { Q: 'quoted value' });
    assert.deepEqual(parseDotEnv("S='single'"), { S: 'single' });
    assert.deepEqual(parseDotEnv('P=" spaced "'), { P: ' spaced ' });
  });

  it('keeps mismatched quotes as-is', () => {
    assert.deepEqual(parseDotEnv('M="mixed\''), { M: '"mixed\'' });
    assert.deepEqual(parseDotEnv('M=\'mixed"'), { M: '\'mixed"' });
  });

  it('turns a lone quote into an empty value (both ends match)', () => {
    assert.deepEqual(parseDotEnv('Q="'), { Q: '' });
    assert.deepEqual(parseDotEnv("Q='"), { Q: '' });
  });

  it('treats `#` after `=` as part of the value, never as a comment', () => {
    assert.deepEqual(parseDotEnv('H=a#b'), { H: 'a#b' });
    assert.deepEqual(parseDotEnv('C=value # not a comment'), { C: 'value # not a comment' });
    assert.deepEqual(parseDotEnv('Q="a # b"'), { Q: 'a # b' });
  });

  it('keeps empty values as empty strings', () => {
    assert.deepEqual(parseDotEnv('EMPTY='), { EMPTY: '' });
    assert.deepEqual(parseDotEnv('BLANK=   '), { BLANK: '' });
  });

  it('lets a duplicate key keep the last value', () => {
    assert.deepEqual(parseDotEnv('D=1\nD=2'), { D: '2' });
    assert.deepEqual(parseDotEnv('D=1\nX=9\nD=2'), { D: '2', X: '9' });
  });

  it('does no interpolation or escape processing', () => {
    assert.deepEqual(parseDotEnv('A=${B}'), { A: '${B}' });
    assert.deepEqual(parseDotEnv(String.raw`L=a\nb`), { L: 'a\\nb' });
    assert.deepEqual(parseDotEnv('Q="say \\"hi\\""'), { Q: 'say \\"hi\\"' });
  });
});

describe('projectRoot', () => {
  it('returns the repository root, the parent of scripts/', () => {
    assert.equal(projectRoot(), ROOT);
    assert.equal(existsSync(join(projectRoot(), 'package.json')), true);
    assert.equal(existsSync(join(projectRoot(), 'scripts', 'with-app-env.mjs')), true);
  });
});

describe('readDotEnv', () => {
  it('returns an empty object when `.env` is missing', () => {
    const root = makeTempDir('with-app-env-empty-');
    assert.deepEqual(readDotEnv(root), {});
  });

  it('parses `<root>/.env` with the same rules as parseDotEnv', () => {
    const root = makeTempDir('with-app-env-file-');
    const text = '# local overrides\nDATABASE_URL=postgres://local/db\nexport FLAG="on"\n';
    writeFileSync(join(root, '.env'), text);

    assert.deepEqual(readDotEnv(root), {
      DATABASE_URL: 'postgres://local/db',
      FLAG: 'on',
    });
  });

  it('does not merge process.env into the result', () => {
    const root = makeTempDir('with-app-env-merge-');
    writeFileSync(join(root, '.env'), 'ONLY=file\n');
    process.env.WITH_APP_ENV_SENTINEL = 'from-process';
    try {
      const env = readDotEnv(root);
      assert.deepEqual(env, { ONLY: 'file' });
      assert.equal('WITH_APP_ENV_SENTINEL' in env, false);
    } finally {
      delete process.env.WITH_APP_ENV_SENTINEL;
    }
  });
});

describe('exitStatusFromChild', () => {
  it('forwards a normal exit code, defaulting nullish to 1', () => {
    assert.equal(exitStatusFromChild(0, null), 0);
    assert.equal(exitStatusFromChild(3, null), 3);
    assert.equal(exitStatusFromChild(42, undefined), 42);
    assert.equal(exitStatusFromChild(null, null), 1);
    assert.equal(exitStatusFromChild(undefined, undefined), 1);
  });

  it('maps a terminating signal to 128 + its number, winning over the code', () => {
    assert.equal(exitStatusFromChild(null, 'SIGINT'), 130);
    assert.equal(exitStatusFromChild(null, 'SIGTERM'), 143);
    assert.equal(exitStatusFromChild(null, 'SIGHUP'), 129);
    assert.equal(exitStatusFromChild(null, 'SIGKILL'), 137);
    assert.equal(exitStatusFromChild(0, 'SIGTERM'), 143);
    assert.equal(exitStatusFromChild(3, 'SIGINT'), 130);
  });

  it('falls back to 129 for an unknown signal', () => {
    assert.equal(exitStatusFromChild(0, 'SIGFOO'), 129);
    assert.equal(exitStatusFromChild(null, 'NOT_A_SIGNAL'), 129);
  });
});

describe('CLI', () => {
  it('prints usage and exits 2 without a command', () => {
    const result = runWrapper([]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /usage: node scripts\/with-app-env\.mjs <command> \[args…\]/);
  });

  it('runs the command and forwards its stdout on success', () => {
    const result = runWrapper([NODE, '-e', "console.log('child-ok')"]);

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'child-ok');
  });

  it('forwards a non-zero child exit code', () => {
    assert.equal(runWrapper([NODE, '-e', 'process.exit(3)']).status, 3);
    assert.equal(runWrapper([NODE, '-e', 'process.exit(1)']).status, 1);
  });

  it('passes arguments through verbatim, without shell interpretation', () => {
    const code = 'console.log(JSON.stringify(process.argv.slice(1)))';
    const args = ['alpha', '--flag=beta', 'two words', "with'quote", '$HOME'];
    const result = runWrapper([NODE, '-e', code, ...args]);

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), args);
  });

  it('reports a missing command with exit 127', () => {
    const result = runWrapper(['learngraph-command-that-does-not-exist-xyz']);

    assert.equal(result.status, 127);
    assert.match(result.stderr, /\[with-app-env\] failed to run/);
  });

  it('merges `<root>/.env` and lets process.env win over it', () => {
    // Copy the wrapper into a temporary root so `projectRoot()` (derived from
    // the module location) points there. The real repository `.env` is never
    // touched, and the process cwd stays outside the temporary root.
    const root = makeTempDir('with-app-env-cli-');
    const scripts = join(root, 'scripts');
    mkdirSync(scripts);
    const copy = join(scripts, 'with-app-env.mjs');
    copyFileSync(SCRIPT, copy);
    writeFileSync(
      join(root, '.env'),
      'WITH_APP_ENV_FROM_DOTENV=dotenv\nWITH_APP_ENV_PRECEDENCE=dotenv\n',
    );

    const result = runWrapper(
      [
        NODE,
        '-e',
        "console.log([process.env.WITH_APP_ENV_FROM_DOTENV, process.env.WITH_APP_ENV_PRECEDENCE].join('|'))",
      ],
      copy,
      {
        cwd: ROOT,
        env: { ...process.env, WITH_APP_ENV_PRECEDENCE: 'process' },
      },
    );

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'dotenv|process');
  });

  it('reads `.env` from the wrapper root, not from the working directory', () => {
    const root = makeTempDir('with-app-env-root-');
    const scripts = join(root, 'scripts');
    mkdirSync(scripts);
    const copy = join(scripts, 'with-app-env.mjs');
    copyFileSync(SCRIPT, copy);
    writeFileSync(join(root, '.env'), 'WITH_APP_ENV_SOURCE=wrapper-root\n');

    const cwd = makeTempDir('with-app-env-cwd-');
    writeFileSync(join(cwd, '.env'), 'WITH_APP_ENV_SOURCE=working-directory\n');

    const result = runWrapper([NODE, '-e', 'console.log(process.env.WITH_APP_ENV_SOURCE)'], copy, {
      cwd,
      env: { ...process.env },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'wrapper-root');
  });
});
