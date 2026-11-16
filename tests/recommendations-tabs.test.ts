/**
 * Keyboard-accessible tabs on Recommendations (`/recommendations`).
 *
 * The movement helper is pure (node:test, no PGlite or DOM) so the WAI-ARIA
 * pattern is locked separately from framer-motion: arrow keys wrap at both
 * ends, Home/End jump to the edges, and broken indices or counts never throw.
 * Static guards then keep the tablist/tab/tabpanel roles and the helper call
 * wired to the page without adding a read, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextTabIndex } from '../src/lib/tabs.ts';

const ROOT = join(import.meta.dirname, '..');
const HELPER_FILE = join(ROOT, 'src', 'lib', 'tabs.ts');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'recommendations.tsx');

const source = (file: string) => readFileSync(file, 'utf8');

describe('nextTabIndex: arrow keys', () => {
  it('moves right and wraps at the end', () => {
    assert.equal(nextTabIndex(0, 'ArrowRight', 3), 1);
    assert.equal(nextTabIndex(1, 'ArrowRight', 3), 2);
    assert.equal(nextTabIndex(2, 'ArrowRight', 3), 0);
  });

  it('moves left and wraps at the start', () => {
    assert.equal(nextTabIndex(0, 'ArrowLeft', 3), 2);
    assert.equal(nextTabIndex(1, 'ArrowLeft', 3), 0);
    assert.equal(nextTabIndex(2, 'ArrowLeft', 3), 1);
  });
});

describe('nextTabIndex: Home and End', () => {
  it('jumps to the first and last tab from anywhere', () => {
    assert.equal(nextTabIndex(0, 'Home', 3), 0);
    assert.equal(nextTabIndex(1, 'Home', 3), 0);
    assert.equal(nextTabIndex(2, 'Home', 3), 0);
    assert.equal(nextTabIndex(0, 'End', 3), 2);
    assert.equal(nextTabIndex(1, 'End', 3), 2);
    assert.equal(nextTabIndex(2, 'End', 3), 2);
  });
});

describe('nextTabIndex: every other key is left alone', () => {
  it('returns null for vertical arrows, activation keys and empty keys', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', '', 'Tab', 'PageUp', 'arrowright']) {
      assert.equal(nextTabIndex(1, key, 3), null, `key ${JSON.stringify(key)} should not move`);
    }
  });

  it('returns null for runtime casts that are not strings', () => {
    assert.equal(nextTabIndex(1, null as never, 3), null);
    assert.equal(nextTabIndex(1, undefined as never, 3), null);
  });
});

describe('nextTabIndex: tab counts', () => {
  it('keeps a single tab focused on itself', () => {
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      assert.equal(nextTabIndex(0, key, 1), 0);
    }
  });

  it('rounds the count down and never below one', () => {
    assert.equal(nextTabIndex(1, 'ArrowRight', 2.9), 0);
    assert.equal(nextTabIndex(1, 'End', 2.9), 1);
    assert.equal(nextTabIndex(0, 'ArrowRight', 0.5), 0);
    assert.equal(nextTabIndex(0, 'End', 0.5), 0);
    assert.equal(nextTabIndex(0, 'End', 3.999), 2);
  });

  it('returns null when the count cannot describe a tab list', () => {
    for (const count of [
      0,
      -1,
      -2.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      assert.equal(nextTabIndex(0, 'ArrowRight', count), null, `count ${count} should be rejected`);
    }
    assert.equal(nextTabIndex(0, 'Home', null as never), null);
    assert.equal(nextTabIndex(0, 'Home', '3' as never), null);
  });
});

describe('nextTabIndex: the current index is normalised', () => {
  it('wraps negative and too-large indices with a positive modulo', () => {
    assert.equal(nextTabIndex(-1, 'ArrowRight', 3), 0);
    assert.equal(nextTabIndex(-1, 'ArrowLeft', 3), 1);
    assert.equal(nextTabIndex(-1, 'End', 3), 2);
    assert.equal(nextTabIndex(-4, 'ArrowRight', 3), 0);
    assert.equal(nextTabIndex(5, 'ArrowRight', 3), 0);
    assert.equal(nextTabIndex(5, 'End', 3), 2);
    assert.equal(nextTabIndex(3, 'Home', 3), 0);
  });

  it('falls back to the first tab for NaN and infinite indices', () => {
    assert.equal(nextTabIndex(Number.NaN, 'ArrowRight', 3), 1);
    assert.equal(nextTabIndex(Number.NaN, 'ArrowLeft', 3), 2);
    assert.equal(nextTabIndex(Number.POSITIVE_INFINITY, 'ArrowRight', 3), 1);
    assert.equal(nextTabIndex(Number.NEGATIVE_INFINITY, 'Home', 3), 0);
    assert.equal(nextTabIndex(null as never, 'Home', 3), 0);
  });

  it('rounds a fractional index down', () => {
    assert.equal(nextTabIndex(1.9, 'ArrowRight', 3), 2);
    assert.equal(nextTabIndex(1.9, 'End', 3), 2);
  });
});

describe('wiring guards (static)', () => {
  it('keeps tabs.ts pure', () => {
    const helper = source(HELPER_FILE);
    assert.equal((helper.match(/^import\b/gm) ?? []).length, 0);
    assert.equal(/require\(/.test(helper), false);
    assert.match(
      helper,
      /export function nextTabIndex\(current: number, key: string, count: number\): number \| null \{/,
    );
    assert.equal(/from 'react'|document\.|window\.|setTimeout|new Date/.test(helper), false);
  });

  it('marks up one tablist, three tabs and three named tabpanels', () => {
    const page = source(PAGE_FILE);
    assert.match(page, /role="tablist"/);
    assert.ok(page.includes('aria-label="Recommendation views"'));
    // One shared role on the mapped button, used by exactly the three tab ids.
    assert.equal((page.match(/role="tab"/g) ?? []).length, 1);
    assert.ok(page.includes("const TAB_IDS = ['recommendations', 'zones', 'path'] as const;"));
    assert.equal((page.match(/id: '(recommendations|zones|path)',/g) ?? []).length, 3);
    assert.equal((page.match(/role="tabpanel"/g) ?? []).length, 3);
    assert.ok(page.includes('aria-selected={selected}'));
    assert.ok(page.includes('tabIndex={selected ? 0 : -1}'));
    assert.ok(page.includes('id={`rec-tab-${tab.id}`}'));
    assert.ok(page.includes('aria-controls={selected ? `rec-panel-${tab.id}` : undefined}'));
    for (const id of ['recommendations', 'zones', 'path']) {
      assert.ok(page.includes(`id="rec-panel-${id}"`), `missing panel id for ${id}`);
      assert.ok(
        page.includes(`aria-labelledby="rec-tab-${id}"`),
        `missing aria-labelledby for ${id}`,
      );
    }
  });

  it('moves selection and focus through the helper from onKeyDown', () => {
    const page = source(PAGE_FILE);
    assert.ok(page.includes("import { nextTabIndex } from '@/lib/tabs';"));
    assert.equal((page.match(/nextTabIndex\(/g) ?? []).length, 1);
    assert.match(page, /const next = nextTabIndex\(index, event\.key, TAB_IDS\.length\);/);
    assert.match(page, /onKeyDown=\{\(event\) => handleTabKeyDown\(event, index\)\}/);
    assert.ok(page.includes('setActiveTab(TAB_IDS[next]);'));
    assert.ok(page.includes('tabRefs.current[next]?.focus();'));
    assert.ok(page.includes('onClick={() => setActiveTab(tab.id)}'));
  });

  it('keeps the three labels, counts and order untouched', () => {
    const page = source(PAGE_FILE);
    const recommendations = page.indexOf('`Recommendations (${zpd.recommendations.length})`');
    const zones = page.indexOf("'Ready / not yet'");
    const path = page.indexOf("'Learning Path'");
    assert.ok(recommendations > 0 && zones > recommendations, 'tab order changed');
    assert.ok(path > zones, 'tab order changed');
  });

  it('adds no server function, RPC or migration for the tabs', () => {
    const page = source(PAGE_FILE);
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    const migrations = source(join(ROOT, 'src', 'lib', 'migrations.ts'));
    const schemas = source(join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts'));
    for (const pattern of [/nextTabIndex/, /rec-tab/, /rec-panel/, /Recommendation views/]) {
      assert.equal(pattern.test(migrations), false, `migrations should not mention ${pattern}`);
      assert.equal(pattern.test(schemas), false, `rpc schemas should not mention ${pattern}`);
    }
  });
});
