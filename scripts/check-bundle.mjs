#!/usr/bin/env node
// @ts-check
/**
 * CI budget check on the client JavaScript of the production build. The build
 * already splits routes (React Flow only loads on `/graph`, `/combined-graph`
 * and `/domains`), but nothing failed when a heavy page crept back into the
 * shared entry or when the total kept growing. This gate reads the emitted
 * assets (no second build) and fails on three budgets:
 *
 * (a) the shared entry files (`index-*.js`, `middleware-*.js`) stay small;
 * (b) every `.js` file stays under the per-file ceiling;
 * (c) all `.js` files together stay under the total budget.
 *
 * The numbers were measured on 2026-11-15 from a `vercel`-preset build and
 * allow ~10% headroom: the entry was 308_127 B, the largest single `.js` was
 * the same entry (the largest route chunk was `profile-*.js` at 177_808 B),
 * and all 85 `.js` files added up to 1_648_225 B. Non-`.js` assets are ignored.
 *
 *   node scripts/check-bundle.mjs
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ASSETS_DIR = '.vercel/output/static/assets';

/** @typedef {{ file: string, bytes: number }} Asset */
/** @typedef {{ entryMaxBytes: number, chunkMaxBytes: number, totalMaxBytes: number }} Budgets */

// Measured 308_127 B (shared entry `index-*.js`) + 10%.
export const ENTRY_MAX_BYTES = 339_000;
// Measured 308_127 B (the largest single `.js` is that same entry) + 10%.
export const CHUNK_MAX_BYTES = 339_000;
// Measured 1_648_225 B across all `.js` files + 10%.
export const TOTAL_MAX_BYTES = 1_814_000;

/** @type {Budgets} */
export const BUDGETS = {
  entryMaxBytes: ENTRY_MAX_BYTES,
  chunkMaxBytes: CHUNK_MAX_BYTES,
  totalMaxBytes: TOTAL_MAX_BYTES,
};

/** Shared entry files emitted by the TanStack Start/Vite build. */
const ENTRY_FILE = /^(?:index|middleware)-[A-Za-z0-9_-]+\.js$/;

/**
 * Problems with these assets under these budgets (empty when they all pass).
 * Pure: no I/O. Only `.js` files count, problems follow file-name order
 * (codepoint compare, so directory-listing order never matters) and the
 * total problem, when any, comes last.
 * @param {Asset[]} assets
 * @param {Budgets} budgets
 * @returns {string[]}
 */
export function checkBudgets(assets, budgets) {
  const problems = [];
  const scripts = assets
    .filter((asset) => asset.file.endsWith('.js'))
    .slice()
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  let total = 0;
  for (const asset of scripts) {
    total += asset.bytes;
    if (ENTRY_FILE.test(asset.file) && asset.bytes > budgets.entryMaxBytes) {
      problems.push(
        `${asset.file}: ${asset.bytes} bytes exceeds the entry budget of ${budgets.entryMaxBytes} bytes`,
      );
    }
    if (asset.bytes > budgets.chunkMaxBytes) {
      problems.push(
        `${asset.file}: ${asset.bytes} bytes exceeds the chunk budget of ${budgets.chunkMaxBytes} bytes`,
      );
    }
  }
  if (total > budgets.totalMaxBytes) {
    problems.push(
      `all JS files: ${total} bytes exceeds the total budget of ${budgets.totalMaxBytes} bytes`,
    );
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let names;
  try {
    names = (await readdir(ASSETS_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => entry.name);
  } catch (err) {
    console.error(
      `[bundle] cannot read ${ASSETS_DIR}: ${err instanceof Error ? err.message : err}`,
    );
    console.error('[bundle] run the production build first (npm run build)');
    process.exit(1);
  }
  /** @type {Asset[]} */
  const assets = [];
  for (const file of names) {
    const info = await stat(join(ASSETS_DIR, file));
    assets.push({ file, bytes: info.size });
  }
  const problems = checkBudgets(assets, BUDGETS);
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  console.log(
    `Checked ${assets.length} JS files, ${total} bytes (entry ≤ ${ENTRY_MAX_BYTES}, chunk ≤ ${CHUNK_MAX_BYTES}, total ≤ ${TOTAL_MAX_BYTES})`,
  );
  for (const problem of problems) console.error(`  ${problem}`);
  if (!problems.length) {
    console.log('Bundle budget check passed');
    process.exit(0);
  }
  const violated = [
    ...new Set(
      problems
        .map((problem) => /exceeds the (\w+) budget/.exec(problem)?.[1])
        .filter((kind) => kind !== undefined),
    ),
  ];
  console.log(
    `Bundle budget check failed: ${violated.join(', ')} ${violated.length === 1 ? 'budget' : 'budgets'} (${problems.length} problem${problems.length === 1 ? '' : 's'})`,
  );
  process.exit(1);
}
