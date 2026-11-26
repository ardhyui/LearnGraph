/**
 * WAI-ARIA tabs on Data Entry (`/data-entry`).
 *
 * The five sections used to be plain buttons whose selected state only showed
 * as a colour, with no roles, no keyboard movement and unnamed panels. This
 * file locks the standard tab pattern: one named tablist, five tabs with a
 * roving tab stop, exactly one panel rendered with a name tied to its tab, and
 * the arrow/Home/End movement delegated to the shared pure helper. Static
 * guards also keep the page free of live regions, focus forcing, server
 * functions, RPC and migrations.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'data-entry.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');
const SMOKE_FILE = join(ROOT, 'scripts', 'smoke.mjs');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const IDS = ['overview', 'learners', 'concepts', 'prerequisites', 'knowledge-states'] as const;

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

describe('data-entry tabs: one named tablist with five tabs', () => {
  it('marks up the tab container with the section label', () => {
    assert.equal(count(page, /role="tablist"/g), 1);
    assert.ok(
      page.includes(
        '<div role="tablist" aria-label="Data entry sections" className="flex flex-wrap gap-2 p-1 glass-card">',
      ),
    );
    assert.ok(page.includes('{TAB_CONFIG.map((tab, index) => {'));
  });

  it('puts the tab role and the roving tab stop on the mapped button', () => {
    // One shared role on the mapped button, used by all five tab ids.
    assert.equal(count(page, /role="tab"/g), 1);
    assert.ok(page.includes('id={`data-entry-tab-${tab.id}`}'));
    assert.ok(page.includes('aria-selected={isActive}'));
    assert.ok(page.includes('tabIndex={isActive ? 0 : -1}'));
    assert.ok(page.includes('aria-controls={isActive ? `data-entry-panel-${tab.id}` : undefined}'));
    assert.ok(page.includes('const isActive = activeTab === tab.id;'));
  });

  it('keeps the five tab ids, labels and their order untouched', () => {
    for (const id of IDS) {
      assert.ok(page.includes(`{ id: '${id}' as const, label:`), `missing tab config for ${id}`);
    }
    const labels = ['Overview', 'Learners', 'Concepts', 'Prerequisites', 'Knowledge States'];
    const positions = labels.map((label) => page.indexOf(`label: '${label}'`));
    for (const [index, position] of positions.entries()) {
      assert.ok(position > 0, `missing label ${labels[index]}`);
      if (index > 0) assert.ok(position > positions[index - 1], 'tab order changed');
    }
    assert.ok(page.includes("const [activeTab, setActiveTab] = useState<TabType>('overview');"));
  });
});

describe('data-entry tabs: keyboard movement uses the shared helper', () => {
  it('imports nextTabIndex and calls it exactly once', () => {
    assert.ok(page.includes("import { nextTabIndex } from '@/lib/tabs';"));
    assert.equal(count(page, /nextTabIndex\(/g), 1);
  });

  it('moves selection and focus from the helper, ignoring other keys', () => {
    assert.ok(page.includes('const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);'));
    assert.ok(page.includes('const next = nextTabIndex(index, event.key, TAB_CONFIG.length);'));
    assert.ok(page.includes('if (next === null) return;'));
    assert.ok(page.includes('setActiveTab(TAB_CONFIG[next].id);'));
    assert.ok(page.includes('tabRefs.current[next]?.focus();'));
    assert.ok(page.includes('onKeyDown={(event) => handleTabKeyDown(event, index)}'));
    assert.ok(page.includes('ref={(node) => {'));
    assert.ok(page.includes('tabRefs.current[index] = node;'));
  });

  it('keeps the click handler selecting the same tab', () => {
    assert.equal(count(page, /onClick=\{\(\) => setActiveTab\(tab\.id\)\}/g), 1);
  });

  it('hides the tab icons from assistive technology without changing their size', () => {
    assert.equal(count(page, /<Icon className="w-4 h-4" aria-hidden="true" \/>/g), 1);
    assert.equal(count(page, /<Icon className="w-4 h-4" \/>/g), 0);
  });
});

describe('data-entry tabs: each rendered panel is named by its tab', () => {
  it('renders exactly five tabpanels, one per tab', () => {
    assert.equal(count(page, /role="tabpanel"/g), IDS.length);
    assert.equal(count(page, /aria-labelledby="data-entry-tab-/g), IDS.length);
    assert.equal(count(page, /tabIndex=\{0\}/g), IDS.length);
  });

  it('pairs every panel id with the tab id that names it', () => {
    for (const id of IDS) {
      assert.equal(
        count(page, new RegExp(`id="data-entry-panel-${id}"`, 'g')),
        1,
        `missing panel id for ${id}`,
      );
      assert.equal(
        count(page, new RegExp(`aria-labelledby="data-entry-tab-${id}"`, 'g')),
        1,
        `missing aria-labelledby for ${id}`,
      );
    }
  });

  it('keeps each panel inside the activeTab branch that renders it', () => {
    for (const id of IDS) {
      const branch = page.indexOf(`{activeTab === '${id}' && (`);
      const panel = page.indexOf(`id="data-entry-panel-${id}"`);
      assert.ok(branch > 0 && panel > branch, `panel ${id} must stay in its branch`);
      assert.ok(/key="[a-z-]+"/.test(page.slice(branch, panel)), `panel ${id} keeps its key`);
    }
  });
});

describe('data-entry tabs: no extra behaviour, data or schema', () => {
  it('adds no live region of its own, other role, forced focus or new button', () => {
    // The message banner and the learner save status are the page's live regions; the tabs add none.
    assert.equal(count(page, /aria-live=/g), 2);
    assert.ok(page.includes("aria-live={message.type === 'success' ? 'polite' : 'assertive'}"));
    assert.equal(count(page, /role="/g), 8); // tablist + tab + five tabpanels + learner save status
    assert.equal(count(page, /role=\{/g), 1); // the banner's status/alert role
    assert.equal(/\.focus\(\)/.test(page), true); // only the helper-driven tab focus
    assert.equal(count(page, /\.focus\(\)/g), 1);
    assert.equal(/document\.|window\./.test(page), false);
  });

  it('adds no server function, RPC or migration for the tabs', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    const migrations = source(MIGRATIONS_FILE);
    const schemas = source(SCHEMAS_FILE);
    for (const pattern of [/nextTabIndex/, /data-entry-tab/, /data-entry-panel/, /Data entry sections/]) {
      assert.equal(pattern.test(migrations), false, `migrations should not mention ${pattern}`);
      assert.equal(pattern.test(schemas), false, `rpc schemas should not mention ${pattern}`);
    }
  });

  it('keeps a Playwright smoke check for the tabs', () => {
    const smoke = source(SMOKE_FILE);
    assert.ok(smoke.includes("if (path === '/data-entry')"));
    assert.ok(smoke.includes('data-entry: tabs announce selection and switch the named panel'));
  });
});
