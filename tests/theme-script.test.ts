/**
 * Direct unit tests for the no-flash theme script `src/lib/theme-script.ts`.
 *
 * The inline `<head>` script applies the saved theme before first paint and the
 * production CSP allowlists exactly its SHA-256. Until now it was only covered
 * indirectly (`tests/security-headers.test.ts` hashes it;
 * `tests/provider-split.test.ts` checks that `theme.tsx` keeps the export).
 * This file imports the
 * module directly (node:test, no PGlite or DOM) and runs `NO_FLASH_SCRIPT` in
 * `node:vm` with a minimal `localStorage`/`window.matchMedia`/`document`
 * stand-in, so the stored-theme/media-query branches and the swallowed errors
 * are pinned. The module is not changed by this file: the rough edge without
 * `document.documentElement.style` is locked as the actual behaviour (the class
 * is applied, then the `colorScheme` write throws and is caught).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { NO_FLASH_SCRIPT, THEME_STORAGE_KEY } from '../src/lib/theme-script.ts';
import { NO_FLASH_SCRIPT_SHA256 } from '../src/lib/security-headers.ts';

const ROOT = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

interface ScriptRun {
  /** Raw `localStorage.getItem` result; `null` = no saved theme. */
  stored?: string | null;
  /** `window.matchMedia(...).matches`. */
  matches?: boolean;
  /** Classes already on `<html>` before the script runs. */
  existingClasses?: string[];
  /** Make `localStorage.getItem` throw, like blocked storage. */
  readThrows?: boolean;
  /** Leave `document.documentElement.style` out of the fake document. */
  withStyle?: boolean;
  /** A `colorScheme` value already applied before the script runs. */
  initialColorScheme?: string;
}

interface ScriptResult {
  classes: string[];
  style: Record<string, unknown> | undefined;
  colorScheme: string | undefined;
  getItemCalls: string[];
  matchMediaQueries: string[];
  classListCalls: string[];
  error: unknown;
}

function runScript({
  stored = null,
  matches = false,
  existingClasses = [],
  readThrows = false,
  withStyle = true,
  initialColorScheme,
}: ScriptRun = {}): ScriptResult {
  const classes = new Set(existingClasses);
  const classListCalls: string[] = [];
  const getItemCalls: string[] = [];
  const matchMediaQueries: string[] = [];
  const style: Record<string, unknown> | undefined = withStyle
    ? initialColorScheme === undefined
      ? {}
      : { colorScheme: initialColorScheme }
    : undefined;

  const localStorage = {
    getItem(key: string) {
      getItemCalls.push(key);
      if (readThrows) throw new Error('storage is unavailable');
      return stored;
    },
  };
  const window = {
    matchMedia(query: string) {
      matchMediaQueries.push(query);
      return { matches };
    },
  };
  const document = {
    documentElement: {
      classList: {
        add(name: string) {
          classes.add(name);
          classListCalls.push(`add:${name}`);
        },
        remove(name: string) {
          classes.delete(name);
          classListCalls.push(`remove:${name}`);
        },
      },
      style,
    },
  };

  const context = vm.createContext({ localStorage, window, document });
  let error: unknown = null;
  try {
    vm.runInContext(NO_FLASH_SCRIPT, context);
  } catch (caught) {
    error = caught;
  }

  return {
    classes: [...classes],
    style,
    colorScheme: style?.colorScheme as string | undefined,
    getItemCalls,
    matchMediaQueries,
    classListCalls,
    error,
  };
}

describe('script text and storage key', () => {
  it("stores the theme under the provider's key", () => {
    assert.equal(THEME_STORAGE_KEY, 'theme');
  });

  it('is a single-line IIFE that reads the key with a system fallback', () => {
    assert.equal(NO_FLASH_SCRIPT.includes('\n'), false);
    assert.equal(NO_FLASH_SCRIPT.includes('\r'), false);
    assert.ok(NO_FLASH_SCRIPT.startsWith('(function(){try{'));
    assert.ok(NO_FLASH_SCRIPT.endsWith('}catch(e){}})();'));
    assert.ok(
      NO_FLASH_SCRIPT.includes(`localStorage.getItem('${THEME_STORAGE_KEY}')||'system'`),
      'the stored value must fall back to system',
    );
  });

  it('stays CSP-safe and only touches the browser globals it needs', () => {
    assert.doesNotMatch(NO_FLASH_SCRIPT, /\beval\s*\(/);
    assert.doesNotMatch(NO_FLASH_SCRIPT, /\bnew\s+Function\b/);
    assert.doesNotMatch(NO_FLASH_SCRIPT, /\bimport\s*\(/);
    assert.doesNotMatch(NO_FLASH_SCRIPT, /\bfetch\s*\(/);
    assert.ok(NO_FLASH_SCRIPT.includes("window.matchMedia('(prefers-color-scheme: dark)')"));
    assert.ok(NO_FLASH_SCRIPT.includes('document.documentElement.classList'));
    assert.ok(NO_FLASH_SCRIPT.includes('document.documentElement.style.colorScheme'));
    const globals = new Set(NO_FLASH_SCRIPT.match(/\b(?:localStorage|window|document)\b/g) ?? []);
    assert.deepEqual([...globals].sort(), ['document', 'localStorage', 'window']);
  });
});

describe('running the script before first paint', () => {
  it('applies a saved dark theme and never asks the system', () => {
    for (const matches of [true, false]) {
      const result = runScript({ stored: 'dark', matches });
      assert.deepEqual(result.classes, ['dark'], `matches=${matches}`);
      assert.equal(result.colorScheme, 'dark', `matches=${matches}`);
      assert.deepEqual(result.matchMediaQueries, [], `matches=${matches}`);
      assert.deepEqual(result.getItemCalls, ['theme'], `matches=${matches}`);
    }
  });

  it('applies a saved light theme and never asks the system', () => {
    for (const matches of [true, false]) {
      const result = runScript({ stored: 'light', matches });
      assert.deepEqual(result.classes, [], `matches=${matches}`);
      assert.equal(result.colorScheme, 'light', `matches=${matches}`);
      assert.deepEqual(result.matchMediaQueries, [], `matches=${matches}`);
    }
  });

  it('follows the media query for "system" and for a missing key', () => {
    for (const stored of ['system', null]) {
      for (const matches of [true, false]) {
        const result = runScript({ stored, matches });
        assert.deepEqual(result.matchMediaQueries, ['(prefers-color-scheme: dark)']);
        assert.deepEqual(
          result.classes,
          matches ? ['dark'] : [],
          `stored=${stored} matches=${matches}`,
        );
        assert.equal(result.colorScheme, matches ? 'dark' : 'light');
      }
    }
  });

  it('treats an unknown saved value as light without asking the system', () => {
    for (const matches of [true, false]) {
      const result = runScript({ stored: 'blue', matches });
      assert.deepEqual(result.classes, [], `matches=${matches}`);
      assert.equal(result.colorScheme, 'light', `matches=${matches}`);
      assert.deepEqual(result.matchMediaQueries, [], `matches=${matches}`);
    }
  });

  it('removes an existing dark class when the saved theme is light', () => {
    const result = runScript({ stored: 'light', existingClasses: ['dark', 'custom'] });
    assert.deepEqual(result.classes, ['custom']);
    assert.equal(result.colorScheme, 'light');
  });

  it('swallows a storage failure and leaves the page untouched', () => {
    const result = runScript({ readThrows: true, initialColorScheme: 'dark' });
    assert.equal(result.error, null);
    assert.deepEqual(result.getItemCalls, ['theme']);
    assert.deepEqual(result.classListCalls, []);
    assert.deepEqual(result.classes, []);
    assert.equal(result.colorScheme, 'dark');
    assert.deepEqual(result.matchMediaQueries, []);
  });

  it('keeps the class change when documentElement.style is unavailable (rough edge)', () => {
    const dark = runScript({ stored: 'dark', withStyle: false });
    assert.equal(dark.error, null);
    assert.equal(dark.style, undefined);
    assert.equal(dark.colorScheme, undefined);
    assert.deepEqual(dark.classes, ['dark']);

    const light = runScript({ stored: 'light', withStyle: false });
    assert.equal(light.error, null);
    assert.equal(light.colorScheme, undefined);
    assert.deepEqual(light.classes, []);
  });
});

describe('wiring and the pinned CSP hash', () => {
  it('keeps the app on this script and the shared storage key', () => {
    const theme = read('src/lib/theme.tsx');
    assert.ok(
      theme.includes("import { NO_FLASH_SCRIPT as NO_FLASH_SCRIPT_SOURCE } from './theme-script';"),
    );
    assert.ok(theme.includes('export const NO_FLASH_SCRIPT = `${NO_FLASH_SCRIPT_SOURCE}`;'));

    const provider = read('src/lib/ThemeProvider.tsx');
    assert.ok(
      provider.includes("import { THEME_STORAGE_KEY as STORAGE_KEY } from '@/lib/theme-script';"),
    );
    assert.ok(provider.includes('localStorage.getItem(STORAGE_KEY)'));
    assert.ok(provider.includes('localStorage.setItem(STORAGE_KEY, next)'));

    const root = read('src/routes/__root.tsx');
    assert.ok(root.includes("import { NO_FLASH_SCRIPT } from '@/lib/theme';"));
    assert.ok(root.includes('<script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />'));

    // The older provider-split assertions must keep guarding the same export.
    const old = read('tests/provider-split.test.ts');
    assert.ok(old.includes("from './theme-script'"));
    assert.match(old, /export const NO_FLASH_SCRIPT =/);
    assert.ok(old.includes('/export function useTheme\\(\\)/'));
  });

  it('pins the production CSP hash to this exact script', () => {
    const hash = createHash('sha256').update(NO_FLASH_SCRIPT, 'utf8').digest('base64');
    assert.equal(hash, NO_FLASH_SCRIPT_SHA256);
    // The CSP test keeps the same lock; refer to the constant, never copy it.
    const cspTest = read('tests/security-headers.test.ts');
    assert.ok(cspTest.includes('NO_FLASH_SCRIPT_SHA256'));
    assert.ok(cspTest.includes("from '../src/lib/theme-script.ts'"));
  });
});
