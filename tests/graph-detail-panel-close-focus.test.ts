/**
 * The close button of the graph detail panel shows keyboard focus.
 *
 * `src/components/GraphDetailPanel.tsx` renders the side panel / bottom sheet
 * that opens when a learner picks a concept or domain on `/graph` and
 * `/domains`. Two keyboard interactions inside the panel already had a focus
 * ring — the lesson link guarded by `tests/graph-detail-lesson-link.test.ts`
 * carries `focus-visible:ring-2` — but the single close button had none and
 * `src/styles.css` has no global `:focus-visible` rule, so a keyboard user
 * tabbing to the close button (or Shift+Tab from the panel content) saw no
 * focus indicator at all. This file locks the two focus classes on the close
 * button and keeps the panel behaviour (Escape, wide/sheet layout, heading
 * labelling) unchanged. No server function, RPC schema or migration is added.
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

/** The close button, located through its accessible label. */
const closeIdx = panel.indexOf('aria-label="Close details"');
assert.ok(closeIdx > 0, 'the close button is rendered');
const closeOpen = panel.lastIndexOf('<button', closeIdx);
const closeEnd = panel.indexOf('</button>', closeOpen);
assert.ok(closeOpen > 0 && closeEnd > closeOpen, 'the close button is closed');
const CLOSE = panel.slice(closeOpen, closeEnd + '</button>'.length);

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';
const BASE_CLASS =
  'rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground';

describe('GraphDetailPanel: the close button shows keyboard focus', () => {
  it('keeps the exact class string with the focus pair at the end', () => {
    assert.ok(
      CLOSE.includes(`className="${BASE_CLASS} ${FOCUS_PAIR}"`),
      'the close button classes stay with the focus pair appended',
    );
    assert.equal(
      CLOSE.indexOf(`${BASE_CLASS} ${FOCUS_PAIR}"`),
      CLOSE.indexOf('className="') + 'className="'.length,
      'the class string starts at the button own className attribute',
    );
  });

  it('carries the focus pair exactly once', () => {
    assert.equal(count(CLOSE, /focus-visible/g), 2, 'the button has both focus classes');
  });
});

describe('GraphDetailPanel: the close button keeps its behaviour', () => {
  it('stays a plain button that closes the panel', () => {
    assert.ok(CLOSE.includes('type="button"'), 'the button stays a plain button');
    assert.ok(CLOSE.includes('onClick={onClose}'), 'the button still closes the panel');
    assert.ok(CLOSE.includes('aria-label="Close details"'), 'the accessible name stays');
  });

  it('keeps the decorative close icon', () => {
    assert.ok(CLOSE.includes('<X size={18} aria-hidden="true" />'), 'the icon stays hidden');
  });
});

describe('GraphDetailPanel: the panel behaviour stays', () => {
  it('keeps the Escape handler and the wide/sheet layout', () => {
    assert.ok(panel.includes('if (e.key === \'Escape\') onClose();'), 'Escape still closes');
    assert.ok(panel.includes("const WIDE = '(min-width: 768px)';"), 'the breakpoint stays');
    assert.ok(panel.includes('function useWide(): boolean'), 'the layout hook stays');
    assert.ok(panel.includes('const motionProps = wide'), 'the two layouts stay');
    assert.ok(panel.includes("data-layout={wide ? 'side' : 'sheet'}"), 'the layout marker stays');
  });

  it('keeps the accessible section and the grab handle', () => {
    assert.ok(panel.includes('aria-labelledby={headingId}'), 'the section stays labelled');
    assert.ok(panel.includes('<h3 id={headingId}'), 'the heading stays the label');
    assert.ok(panel.includes('data-testid="graph-detail-panel"'), 'the test id stays');
    assert.ok(
      panel.includes(
        'className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true"',
      ),
      'the sheet grab handle stays hidden',
    );
  });

  it('renders the panel content untouched', () => {
    assert.ok(panel.includes('{children}'), 'the children slot stays');
  });
});

describe('GraphDetailPanel: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(panel, /focus-visible/g), 2, 'one focus pair on the close button');
    assert.equal(count(panel, /<button/g), 1, 'the single close button stays');
    assert.equal(count(panel, /type="button"/g), 1, 'the button stays a plain button');
    assert.equal(count(panel, /aria-label=/g), 1, 'only the close label');
    assert.equal(count(panel, /aria-hidden/g), 2, 'the grab handle and the close icon');
    assert.equal(count(panel, /className="sr-only"/g), 0, 'no hidden text is added');
    assert.equal(count(panel, /aria-busy/g), 0, 'the synchronous close gains no busy marker');
    assert.equal(count(panel, /aria-live/g), 0, 'the synchronous close gains no live region');
    assert.equal(count(panel, /role=/g), 0, 'no extra role is added');
    assert.equal(count(panel, /className=\{cn\(/g), 0, 'no cn block is introduced');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(panel),
      false,
      'the component adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes(FOCUS_PAIR), false, `${file} gained panel focus styles`);
    }
  });
});
