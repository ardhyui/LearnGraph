/**
 * Direct unit tests for the shared React contexts `src/lib/db-context.ts` and
 * `src/lib/theme-context.ts`.
 *
 * `tests/provider-split.test.ts` only checks which names the provider modules
 * export, and the pages exercise the values through a provider. Nothing pinned
 * the fallback value React hands to hooks used outside a provider. This file
 * imports both modules directly and renders a probe with `react-dom/server`
 * (React renders on Node without a DOM), so the modules stay unchanged.
 *
 * It also pins the provider wiring: `DBProvider.tsx`/`ThemeProvider.tsx` must
 * feed the very same context objects these modules export, otherwise a hook
 * would silently read the defaults instead of the provider's state.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, useContext, type Context, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DBContext, type DBContextValue } from '../src/lib/db-context.ts';
import { ThemeContext, type ThemeContextValue } from '../src/lib/theme-context.ts';

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const DB_CONTEXT_FILE = join(SRC_DIR, 'lib', 'db-context.ts');
const THEME_CONTEXT_FILE = join(SRC_DIR, 'lib', 'theme-context.ts');
const DB_PROVIDER_FILE = join(SRC_DIR, 'lib', 'DBProvider.tsx');
const THEME_PROVIDER_FILE = join(SRC_DIR, 'lib', 'ThemeProvider.tsx');
const DB_HOOKS_FILE = join(SRC_DIR, 'lib', 'DBContext.tsx');
const THEME_HOOKS_FILE = join(SRC_DIR, 'lib', 'theme.tsx');
const PROVIDER_SPLIT_TEST = join(import.meta.dirname, 'provider-split.test.ts');
const THEME_SCRIPT_TEST = join(import.meta.dirname, 'theme-script.test.ts');

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

/**
 * Render a throwaway consumer and return exactly what `useContext` saw. The
 * optional wrapper lets a test mount the probe under a provider.
 */
function readContext<T>(
  context: Context<T>,
  wrap: (probe: ReactElement) => ReactElement = (probe) => probe,
): T {
  let seen: T | undefined;
  function Probe() {
    seen = useContext(context);
    return null;
  }
  renderToStaticMarkup(wrap(createElement(Probe)));
  assert.notEqual(seen, undefined);
  return seen as T;
}

describe('context defaults', () => {
  it('starts the database context loading and error-free', () => {
    const value = readContext(DBContext);
    assert.deepEqual(Object.keys(value), ['db', 'isLoading', 'error', 'isReady']);
    assert.equal(value.db, null);
    assert.equal(value.isLoading, true);
    assert.equal(value.error, null);
    assert.equal(value.isReady, false);
    assert.equal(Object.keys(value).length, 4);
  });

  it('defaults the theme to system/light with a no-op setter', () => {
    const value = readContext(ThemeContext);
    assert.deepEqual(Object.keys(value), ['theme', 'resolvedTheme', 'setTheme']);
    assert.equal(value.theme, 'system');
    assert.equal(value.resolvedTheme, 'light');
    assert.equal(typeof value.setTheme, 'function');
    // A function would be dropped by JSON, so call it instead of serializing.
    assert.equal(value.setTheme('dark'), undefined);
    assert.equal(value.setTheme('light'), undefined);
    assert.equal(value.setTheme('system'), undefined);
  });

  it('lets a provider replace the defaults without copying them', () => {
    const db = { kind: 'fake-db' } as unknown as DBContextValue['db'];
    const error = new Error('boom');
    const customDb: DBContextValue = { db, isLoading: false, error, isReady: true };
    const dbSeen = readContext(DBContext, (probe) =>
      createElement(DBContext.Provider, { value: customDb }, probe),
    );
    assert.equal(dbSeen, customDb);
    assert.equal(dbSeen.db, db);
    assert.equal(dbSeen.isLoading, false);
    assert.equal(dbSeen.error, error);
    assert.equal(dbSeen.isReady, true);

    let lastTheme: string | undefined;
    const setTheme = (theme: string) => {
      lastTheme = theme;
    };
    const customTheme: ThemeContextValue = {
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: setTheme as ThemeContextValue['setTheme'],
    };
    const themeSeen = readContext(ThemeContext, (probe) =>
      createElement(ThemeContext.Provider, { value: customTheme }, probe),
    );
    assert.equal(themeSeen, customTheme);
    assert.equal(themeSeen.theme, 'dark');
    assert.equal(themeSeen.resolvedTheme, 'dark');
    themeSeen.setTheme('light');
    assert.equal(lastTheme, 'light');
  });
});

describe('context module wiring', () => {
  it('keeps both context modules import-light and in export order', () => {
    const dbSrc = source(DB_CONTEXT_FILE);
    assert.deepEqual(dbSrc.match(/^import .*$/gm) ?? [], [
      "import { createContext } from 'react';",
      "import type { RemoteGraphDB } from '@/lib/graph/methods';",
    ]);
    assert.equal(dbSrc.includes('require('), false);
    assert.deepEqual(
      [...dbSrc.matchAll(/^export (?:const|function|interface|type) (\w+)/gm)].map((m) => m[1]),
      ['DBContextValue', 'DBContext'],
    );

    const themeSrc = source(THEME_CONTEXT_FILE);
    assert.deepEqual(themeSrc.match(/^import .*$/gm) ?? [], [
      "import { createContext } from 'react';",
    ]);
    assert.equal(themeSrc.includes('require('), false);
    assert.deepEqual(
      [...themeSrc.matchAll(/^export (?:const|function|interface|type) (\w+)/gm)].map((m) => m[1]),
      ['Theme', 'ThemeContextValue', 'ThemeContext'],
    );
  });

  it('feeds the exported contexts from the provider components', () => {
    const dbProvider = source(DB_PROVIDER_FILE);
    assert.ok(
      dbProvider.includes("import { DBContext, type DBContextValue } from '@/lib/db-context';"),
    );
    assert.match(
      dbProvider,
      /const value: DBContextValue = \{\s*db,\s*isLoading,\s*error,\s*isReady: !!db && !isLoading,\s*\};/,
    );
    assert.ok(dbProvider.includes('<DBContext.Provider value={value}>'));

    const themeProvider = source(THEME_PROVIDER_FILE);
    assert.ok(
      themeProvider.includes("import { ThemeContext, type Theme } from '@/lib/theme-context';"),
    );
    assert.ok(
      themeProvider.includes('<ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>'),
    );

    assert.ok(source(THEME_HOOKS_FILE).includes('return useContext(ThemeContext);'));
  });

  it('keeps the eight data hooks reading the shared context', () => {
    const dbHooks = source(DB_HOOKS_FILE);
    assert.ok(dbHooks.includes("import { DBContext } from '@/lib/db-context';"));
    for (const hook of [
      'useDB',
      'useLearners',
      'useConcepts',
      'useEdges',
      'useKnowledgeStates',
      'useZPD',
      'useGapAnalysis',
      'useDBStats',
    ]) {
      assert.match(dbHooks, new RegExp(`export function ${hook}\\(`), hook);
    }
  });

  it('leaves the earlier provider tests intact', () => {
    const providerSplit = source(PROVIDER_SPLIT_TEST);
    assert.ok(providerSplit.includes("describe('provider modules split for fast refresh'"));
    assert.ok(
      providerSplit.includes('keeps the data hooks in DBContext.tsx without a provider component'),
    );
    assert.equal(providerSplit.trimEnd().split('\n').length, 71);

    const themeScript = source(THEME_SCRIPT_TEST);
    assert.ok(themeScript.includes('pins the production CSP hash to this exact script'));
    assert.equal((themeScript.match(/^\s+it\(/gm) ?? []).length, 12);
  });
});
