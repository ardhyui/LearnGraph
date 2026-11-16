/**
 * Direct unit tests for the CSP guard `src/lib/zod-config.ts`.
 *
 * The module only has an effect while `window` exists: it tells Zod to skip
 * compiling parsers with `Function('')`, which the production
 * Content-Security-Policy forbids (`'unsafe-eval'` is absent). Until now the
 * guard was only observed indirectly through the smoke test, so the browser
 * branch, the exact condition and the "imported first" wiring were unlocked.
 * The module is not changed by this file.
 *
 * Zod caches its global config for the whole process, so every `window` state
 * is probed in a fresh child process. `spawnSync` keeps the exit code and
 * stderr visible; `--experimental-strip-types` imports the `.ts` module
 * directly, exactly like `npm test`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
const MODULE_FILE = join(ROOT, 'src', 'lib', 'zod-config.ts');
const ROUTER_FILE = join(ROOT, 'src', 'router.tsx');
const SRC_DIR = join(ROOT, 'src');
const TESTS_DIR = join(ROOT, 'tests');

type Probe = { before?: true; after?: true };

/**
 * Import the module in a fresh Node process and report Zod's `jitless` flag
 * before and after. `undefined` is dropped by `JSON.stringify`, so a missing
 * key means "Zod never configured it".
 */
function probe(setup: string): Probe {
  const script = `
    import { pathToFileURL } from 'node:url';
    ${setup}
    const { z } = await import('zod');
    const before = z.core.globalConfig.jitless;
    await import(${JSON.stringify(pathToFileURL(MODULE_FILE).href)});
    const after = z.core.globalConfig.jitless;
    process.stdout.write(JSON.stringify({ before, after }));
  `;
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '', 'the guard must stay quiet');
  return JSON.parse(result.stdout) as Probe;
}

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

describe('zod-config browser guard', () => {
  it('does not call z.config without a window', () => {
    for (const setup of ['', 'delete globalThis.window;']) {
      const result = probe(setup);
      assert.equal(result.before, undefined, 'each child starts with a fresh Zod');
      assert.equal(result.after, undefined);
    }
  });

  it('sets jitless with any window value, including the falsy rough edges', () => {
    // The guard is a `typeof` check, so `null`, `0` and `''` count as a window
    // even though a stricter truthiness check would skip them.
    for (const setup of [
      'globalThis.window = {};',
      'globalThis.window = null;',
      'globalThis.window = 0;',
      "globalThis.window = '';",
    ]) {
      const result = probe(setup);
      assert.equal(result.before, undefined, 'each child starts with a fresh Zod');
      assert.equal(result.after, true);
    }
  });

  it('is a single side-effecting import with the exact guard, and exports nothing', () => {
    const text = source(MODULE_FILE);
    const imports = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));
    assert.deepEqual(imports, ["import { z } from 'zod';"]);
    assert.doesNotMatch(text, /\brequire\s*\(/);
    assert.doesNotMatch(text, /^\s*export\b/m);

    const guard = "if (typeof window !== 'undefined') z.config({ jitless: true });";
    assert.ok(
      text
        .split('\n')
        .map((line) => line.trim())
        .includes(guard),
      'the guard keeps its exact form',
    );
    assert.equal((text.match(/z\.config\s*\(/g) ?? []).length, 1, 'Zod is configured once');
  });

  it('imports the guard first in the router', () => {
    const text = source(ROUTER_FILE);
    const lines = text.split('\n');
    assert.equal(lines[0], '// First: configures Zod before any route module builds a schema.');
    assert.equal(lines[1], "import './lib/zod-config';");

    const importLines = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));
    assert.equal(importLines[0], "import './lib/zod-config';");
    const guardAt = text.indexOf("import './lib/zod-config';");
    assert.ok(guardAt < text.indexOf('@tanstack/react-router'), 'before the router package');
    assert.ok(guardAt < text.indexOf("'./routeTree.gen'"), 'before the generated routes');
  });

  it('is imported only by the router across src/', () => {
    const quoted = /['"][^'"]*zod-config['"]/;
    const importers = filesUnder(SRC_DIR)
      .filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file))
      .filter((file) => quoted.test(source(file)))
      .sort();

    assert.deepEqual(importers, [ROUTER_FILE]);
  });

  it('leaves the CSP test anchors intact', () => {
    const lineCount = (file: string) => source(join(TESTS_DIR, file)).split('\n').length;
    assert.equal(lineCount('security-headers.test.ts'), 136);
    assert.equal(lineCount('check-csp.test.ts'), 263);
  });
});
