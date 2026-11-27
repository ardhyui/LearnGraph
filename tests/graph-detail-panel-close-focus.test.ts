/**
 * Keyboard focus is visible on the graph details panel close button
 * (`GraphDetailPanel`).
 *
 * `src/components/GraphDetailPanel.tsx` renders exactly one button — the
 * "Close details" button in the panel header. The panel is used by `/graph`
 * and `/domains`; the lesson links inside its content (route `/graph`,
 * guarded by `tests/graph-detail-lesson-link.test.ts`) already carry
 * `focus-visible:ring-2`, but the close button had no `:focus-visible`
 * style at all and `src/styles.css` has no global rule, so a keyboard user
 * tabbing to the close button (or Shift+Tab from the panel content) saw no
 * focus indicator anywhere. This file locks the exact class string with the
 * two focus classes appended at the end, the button attributes and its
 * decorative X icon, the Escape handler, the wide/sheet layout logic and the
 * file-wide counts. No server function, RPC schema or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PANEL_FILE = join(ROOT, 'src', 'components', 'GraphDetailPanel.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const panel = source(PANEL_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The close button, from its opening tag to its `</button>`. */
const buttonStart = panel.indexOf('<button');
assert.ok(buttonStart > 0, 'the close button is rendered');
const buttonEnd = panel.indexOf('</button>', buttonStart) + '</button>'.length;
const BUTTON = panel.slice(buttonStart, buttonEnd);

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';
const CLOSE_CLASS =
  'rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary';

describe('GraphDetailPanel: the close button shows keyboard focus', () => {
  it('keeps the exact class string with the focus classes at the end', () => {
    assert.ok(
      BUTTON.includes(`className="${CLOSE_CLASS}"`),
      'the close classes stay with the focus pair appended',
    );
    assert.ok(CLOSE_CLASS.endsWith(FOCUS_PAIR), 'the focus classes end the class string');
    assert.equal(
      BUTTON.indexOf(CLOSE_CLASS),
      BUTTON.indexOf(`"${CLOSE_CLASS}"`) + 1,
      'the class string is a single string attribute',
    );
  });

  it('carries the focus pair exactly once', () => {
    assert.equal(count(BUTTON, /focus-visible/g), 2, 'both focus classes are on the button');
  });
});

describe('GraphDetailPanel: the close button keeps its behaviour', () => {
  it('keeps type, handler and label in order', () => {
    assert.ok(BUTTON.startsWith('<button'), 'the button is still a plain button');
    assert.ok(BUTTON.includes('type="button"'), 'type="button" stays');
    assert.ok(BUTTON.includes('onClick={onClose}'), 'the close handler stays');
    assert.ok(BUTTON.includes('aria-label="Close details"'), 'the accessible name stays');
    assert.ok(
      BUTTON.indexOf('type="button"') < BUTTON.indexOf('onClick=') &&
        BUTTON.indexOf('onClick=') < BUTTON.indexOf('aria-label=') &&
        BUTTON.indexOf('aria-label=') < BUTTON.indexOf('className='),
      'type, handler, label and class order stays',
    );
  });

  it('keeps the decorative X icon untouched', () => {
    assert.ok(
      BUTTON.includes('<X size={18} aria-hidden="true" />'),
      'the icon stays decorative and unchanged',
    );
  });
});

describe('GraphDetailPanel: the panel logic stays', () => {
  it('keeps the Escape handler', () => {
    assert.ok(panel.includes('const onKey = (e: KeyboardEvent) => {'), 'the key handler stays');
    assert.ok(panel.includes("if (e.key === 'Escape') onClose();"), 'Escape still closes');
    assert.ok(
      panel.includes('window.addEventListener(\'keydown\', onKey);') &&
        panel.includes("window.removeEventListener('keydown', onKey);"),
      'the listener is still added and removed',
    );
  });

  it('keeps the wide/sheet layout logic', () => {
    assert.ok(panel.includes("const WIDE = '(min-width: 768px)';"), 'the media query stays');
    assert.ok(panel.includes('const wide = useWide();'), 'useWide is still used');
    assert.ok(panel.includes('const motionProps = wide'), 'the two motion variants stay');
    assert.ok(
      panel.includes("'glass-card shrink-0 overflow-y-auto p-5'") &&
        panel.includes("style: { height: '600px' }"),
      'the side panel variant stays',
    );
    assert.ok(
      panel.includes(
        "'glass-card fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-b-none border-t border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl'",
      ),
      'the bottom sheet variant stays',
    );
    assert.ok(
      panel.includes('aria-hidden="true"') &&
        panel.indexOf('aria-hidden="true"') < buttonStart,
      'the sheet grab handle stays hidden',
    );
  });

  it('keeps the panel identity, heading and children', () => {
    assert.ok(
      panel.includes('aria-labelledby={headingId}') &&
        panel.includes('data-testid="graph-detail-panel"') &&
        panel.includes("data-layout={wide ? 'side' : 'sheet'}"),
      'the panel identity stays',
    );
    assert.ok(
      panel.includes('<h3 id={headingId} className="text-lg font-bold text-foreground">'),
      'the heading keeps its id and classes',
    );
    assert.ok(panel.includes('{children}'), 'the panel still renders its children');
  });
});

describe('GraphDetailPanel: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(panel, /focus-visible/g), 2, 'one focus pair on the single button');
    assert.equal(count(panel, /<button/g), 1, 'the single button stays');
    assert.equal(count(panel, /type="button"/g), 1, 'the button stays a plain button');
    assert.equal(count(panel, /aria-label=/g), 1, 'the button keeps its label');
    assert.equal(count(panel, /aria-hidden/g), 2, 'the grab handle and the X icon stay hidden');
    assert.equal(count(panel, /className="sr-only"/g), 0, 'no sr-only helper is added');
    assert.equal(count(panel, /aria-busy/g), 0, 'no busy state is added');
    assert.equal(count(panel, /aria-live/g), 0, 'no live region is added');
    assert.equal(count(panel, /role=/g), 0, 'no role is added');
    assert.equal(count(panel, /className=\{cn\(/g), 0, 'no cn block is added');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(panel),
      false,
      'the component adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('focus-visible:outline-primary'), false, `${file} gained panel focus styles`);
    }
  });
});
