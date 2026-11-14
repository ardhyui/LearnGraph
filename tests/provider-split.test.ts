/**
 * Provider components live in component-only modules so
 * `react-refresh/only-export-components` can stay enabled everywhere.
 *
 * `DBContext.tsx`/`theme.tsx` remain the import paths for hooks and the
 * no-flash script, but must not export a provider (which would trigger a full
 * reload on edit instead of fast refresh).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';

const read = (path: string) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const dbContext = read('src/lib/DBContext.tsx');
const dbProvider = read('src/lib/DBProvider.tsx');
const theme = read('src/lib/theme.tsx');
const themeProvider = read('src/lib/ThemeProvider.tsx');
const root = read('src/routes/__root.tsx');
const eslintConfig = read('eslint.config.mjs');

const PROVIDER_EXPORT = /export\s+(?:function|const)\s+\w*Provider\b/;

describe('provider modules split for fast refresh', () => {
  it('keeps the data hooks in DBContext.tsx without a provider component', () => {
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
      assert.match(dbContext, new RegExp(`export function ${hook}\\(`), hook);
    }
    assert.equal(PROVIDER_EXPORT.test(dbContext), false);
    assert.equal(/from '@\/lib\/DBProvider'/.test(dbContext), false);
  });

  it('keeps useTheme and the no-flash script in theme.tsx without a provider', () => {
    assert.match(theme, /export function useTheme\(\)/);
    assert.ok(theme.includes("from './theme-script'"));
    assert.match(theme, /export const NO_FLASH_SCRIPT =/);
    assert.equal(PROVIDER_EXPORT.test(theme), false);
    assert.equal(/from '@\/lib\/ThemeProvider'/.test(theme), false);
  });

  it('exports only the providers from the component modules', () => {
    assert.match(dbProvider, /export function DBProvider\(/);
    assert.match(themeProvider, /export function ThemeProvider\(/);
    for (const src of [dbProvider, themeProvider]) {
      assert.equal(/export function use[A-Z]/.test(src), false);
      assert.equal(/export const use[A-Z]/.test(src), false);
    }
  });

  it('wires __root.tsx to the new provider modules', () => {
    assert.ok(root.includes("import { DBProvider } from '@/lib/DBProvider'"));
    assert.ok(root.includes("import { ThemeProvider } from '@/lib/ThemeProvider'"));
    assert.ok(root.includes("import { NO_FLASH_SCRIPT } from '@/lib/theme'"));
  });

  it('drops the react-refresh exception for the context modules', () => {
    assert.equal(eslintConfig.includes('src/lib/DBContext.tsx'), false);
    assert.equal(eslintConfig.includes('src/lib/theme.tsx'), false);
    assert.ok(eslintConfig.includes('react-refresh/only-export-components'));
  });
});
