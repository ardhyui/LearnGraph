/**
 * Direct unit tests for the client bundle budget gate `scripts/check-bundle.mjs`
 * (pure `checkBudgets(assets, budgets)`).
 *
 * `npm run ci` adds the budget step right after the build and before the CSP
 * check, so a heavy page sneaking back into the shared entry — or the total
 * growing silently — now fails the gate instead of being noticed by hand. The
 * module's behaviour is not changed by this file: the tests import the `.mjs`
 * directly, pass their own budgets for each rule, and need no build output.
 * `main` is guarded by `import.meta.url`, so importing the module reads no
 * directory; the guard, the CI wiring and the measured budgets are locked as
 * static checks on the source.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUDGETS,
  CHUNK_MAX_BYTES,
  ENTRY_MAX_BYTES,
  TOTAL_MAX_BYTES,
  checkBudgets,
} from '../scripts/check-bundle.mjs';

const SCRIPT_FILE = join(import.meta.dirname, '..', 'scripts', 'check-bundle.mjs');
const CI_FILE = join(import.meta.dirname, '..', 'scripts', 'ci.mjs');

type Asset = { file: string; bytes: number };
type Budgets = { entryMaxBytes: number; chunkMaxBytes: number; totalMaxBytes: number };

const budgets = (
  entryMaxBytes: number,
  chunkMaxBytes: number,
  totalMaxBytes: number,
): Budgets => ({ entryMaxBytes, chunkMaxBytes, totalMaxBytes });

describe('budget limits', () => {
  it('passes assets exactly at every budget', () => {
    assert.deepEqual(
      checkBudgets(
        [
          { file: 'index-BV12qDgu.js', bytes: 100 },
          { file: 'middleware-BRwNA12E.js', bytes: 100 },
          { file: 'graph-C3wqZg2K.js', bytes: 200 },
        ],
        budgets(100, 200, 400),
      ),
      [],
    );
  });

  it('rejects an entry 1 byte above the entry budget', () => {
    assert.deepEqual(
      checkBudgets([{ file: 'index-abc123.js', bytes: 101 }], budgets(100, 1_000, 1_000)),
      ['index-abc123.js: 101 bytes exceeds the entry budget of 100 bytes'],
    );
    assert.deepEqual(
      checkBudgets([{ file: 'middleware-abc123.js', bytes: 101 }], budgets(100, 1_000, 1_000)),
      ['middleware-abc123.js: 101 bytes exceeds the entry budget of 100 bytes'],
    );
  });

  it('rejects any script 1 byte above the per-file chunk budget', () => {
    assert.deepEqual(
      checkBudgets([{ file: 'graph-abc123.js', bytes: 201 }], budgets(1_000, 200, 1_000)),
      ['graph-abc123.js: 201 bytes exceeds the chunk budget of 200 bytes'],
    );
  });

  it('rejects the total 1 byte above the total budget', () => {
    assert.deepEqual(
      checkBudgets(
        [
          { file: 'a-1.js', bytes: 100 },
          { file: 'b-2.js', bytes: 100 },
          { file: 'c-3.js', bytes: 101 },
        ],
        budgets(1_000, 1_000, 300),
      ),
      ['all JS files: 301 bytes exceeds the total budget of 300 bytes'],
    );
  });
});

describe('entry classification', () => {
  it('recognises index- and middleware- files as shared entries', () => {
    assert.deepEqual(
      checkBudgets(
        [
          { file: 'index-abc123.js', bytes: 11 },
          { file: 'middleware-abc123.js', bytes: 11 },
        ],
        budgets(10, 1_000, 1_000),
      ),
      [
        'index-abc123.js: 11 bytes exceeds the entry budget of 10 bytes',
        'middleware-abc123.js: 11 bytes exceeds the entry budget of 10 bytes',
      ],
    );
  });

  it('does not treat route chunks or lookalike names as entries', () => {
    // Only `^(index|middleware)-<hash>.js$` is an entry; the entry budget here
    // is smaller than the files, so any false positive would show up.
    assert.deepEqual(
      checkBudgets(
        [
          { file: 'graph-abc123.js', bytes: 11 },
          { file: 'index.js', bytes: 11 },
          { file: 'index-.js', bytes: 11 },
          { file: 'Index-abc123.js', bytes: 11 },
          { file: 'myindex-abc123.js', bytes: 11 },
          { file: 'index-abc123.js.map', bytes: 11 },
        ],
        budgets(10, 1_000, 1_000),
      ),
      [],
    );
  });

  it('reports an entry over both budgets as both problems, entry first', () => {
    assert.deepEqual(
      checkBudgets([{ file: 'index-abc123.js', bytes: 300 }], budgets(100, 250, 1_000)),
      [
        'index-abc123.js: 300 bytes exceeds the entry budget of 100 bytes',
        'index-abc123.js: 300 bytes exceeds the chunk budget of 250 bytes',
      ],
    );
  });
});

describe('asset selection and ordering', () => {
  it('ignores non-.js assets, including for the total', () => {
    assert.deepEqual(
      checkBudgets(
        [
          { file: 'app.css', bytes: 999_999 },
          { file: 'photo.png', bytes: 999_999 },
          { file: 'index.html', bytes: 999_999 },
          { file: 'index-abc123.js.map', bytes: 999_999 },
          { file: 'graph-abc123.js', bytes: 1 },
        ],
        budgets(100, 100, 100),
      ),
      [],
    );
  });

  it('returns an empty list for no assets', () => {
    assert.deepEqual(checkBudgets([], budgets(0, 0, 0)), []);
  });

  it('collects several problems in file-name order with the total last', () => {
    const assets: Asset[] = [
      { file: 'profile-zzz.js', bytes: 300 },
      { file: 'index-bbb.js', bytes: 200 },
      { file: 'about-aaa.js', bytes: 300 },
    ];
    const expected = [
      'about-aaa.js: 300 bytes exceeds the chunk budget of 250 bytes',
      'index-bbb.js: 200 bytes exceeds the entry budget of 100 bytes',
      'profile-zzz.js: 300 bytes exceeds the chunk budget of 250 bytes',
      'all JS files: 800 bytes exceeds the total budget of 500 bytes',
    ];
    assert.deepEqual(checkBudgets(assets, budgets(100, 250, 500)), expected);
    // Directory-listing order must not change the report.
    assert.deepEqual(checkBudgets(assets.slice().reverse(), budgets(100, 250, 500)), expected);
  });
});

describe('measured budgets', () => {
  it('exports named constants that match the shared BUDGETS object', () => {
    assert.equal(BUDGETS.entryMaxBytes, ENTRY_MAX_BYTES);
    assert.equal(BUDGETS.chunkMaxBytes, CHUNK_MAX_BYTES);
    assert.equal(BUDGETS.totalMaxBytes, TOTAL_MAX_BYTES);
    for (const value of [ENTRY_MAX_BYTES, CHUNK_MAX_BYTES, TOTAL_MAX_BYTES]) {
      assert.equal(Number.isInteger(value), true);
      assert.equal(value > 0, true);
    }
  });

  it('keeps the per-file ceiling at least as large as the entry budget', () => {
    // The shared entry is a `.js` file too, so it must clear both rules; the
    // entry rule additionally pins `index-*`/`middleware-*` by name.
    assert.equal(CHUNK_MAX_BYTES >= ENTRY_MAX_BYTES, true);
  });
});

describe('static guards on the module and CI wiring', () => {
  const source = readFileSync(SCRIPT_FILE, 'utf8');
  const ci = readFileSync(CI_FILE, 'utf8');

  it('exports checkBudgets as the unit under test', () => {
    assert.equal(source.includes('export function checkBudgets(assets, budgets)'), true);
  });

  it('runs main only when executed as a script, never on import', () => {
    assert.equal(source.includes('if (import.meta.url === `file://${process.argv[1]}`) {'), true);
  });

  it('declares the budgets as named constants', () => {
    assert.match(source, /export const ENTRY_MAX_BYTES = [\d_]+;/);
    assert.match(source, /export const CHUNK_MAX_BYTES = [\d_]+;/);
    assert.match(source, /export const TOTAL_MAX_BYTES = [\d_]+;/);
  });

  it('reads the existing production build instead of building again', () => {
    assert.equal(source.includes("'.vercel/output/static/assets'"), true);
    assert.equal(source.includes('vite build'), false);
  });

  it('imports only Node built-ins, without new dependencies', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    assert.equal(imports.length > 0, true);
    for (const specifier of imports) assert.equal(specifier.startsWith('node:'), true);
  });

  it('runs the budget check after the build and before the CSP step', () => {
    const build = ci.indexOf("['build', () => run('npm', ['run', 'build'])]");
    const budget = ci.indexOf("['bundle budget on the production build'");
    const csp = ci.indexOf("['CSP on the production build', productionCsp]");
    assert.equal(build >= 0, true);
    assert.equal(budget > build, true);
    assert.equal(csp > budget, true);
  });
});
