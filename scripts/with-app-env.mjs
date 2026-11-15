#!/usr/bin/env node
// @ts-check
/**
 * Run a command with `.env` (if present) merged into its environment.
 *
 * `dev`, `build` and `preview` all route through this wrapper so the dev
 * server, the build and the migrator see the same `DATABASE_URL`,
 * `BETTER_AUTH_SECRET`, … A real `process.env` entry always wins, so an
 * explicit override (e.g. Vercel project env) still works.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Parse a dotenv document (KEY=value, `#` comments, optional quotes). */
/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDotEnv(text) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/** @returns {string} */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * @param {string} root
 * @returns {Record<string, string>}
 */
export function readDotEnv(root) {
  const file = join(root, ".env");
  if (!existsSync(file)) return {};
  return parseDotEnv(readFileSync(file, "utf8"));
}

/**
 * @param {number | null | undefined} code
 * @param {string | null | undefined} signal
 * @returns {number}
 */
export function exitStatusFromChild(code, signal) {
  if (signal) {
    /** @type {Record<string, number>} */
    const signals = osConstants.signals;
    const signo = signals[signal];
    return 128 + (typeof signo === "number" ? signo : 1);
  }
  return code ?? 1;
}

/** @param {string} moduleUrl */
function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

/** @param {string[]} argv */
function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("usage: node scripts/with-app-env.mjs <command> [args…]");
    process.exit(2);
  }
  const env = { ...readDotEnv(projectRoot()), ...process.env };
  const child = spawn(command, args, { stdio: "inherit", env });
  for (const signal of /** @type {NodeJS.Signals[]} */ (["SIGINT", "SIGTERM", "SIGHUP"])) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (err) => {
    console.error(`[with-app-env] failed to run ${command}:`, err?.message || err);
    process.exit(127);
  });
  child.on("exit", (code, signal) => process.exit(exitStatusFromChild(code, signal)));
}

if (isMainModule(import.meta.url)) main(process.argv.slice(2));
