/**
 * The theme toggle is a plain button with a visible keyboard focus ring
 * (`ThemeToggle`).
 *
 * Both rendered states of `src/components/ui/theme-toggle.tsx` — the
 * pre-mount placeholder and the real toggle — were bare `<button>` elements
 * without `type="button"`, without a `:focus-visible` style and with their
 * decorative icons announced by screen readers even though the real button
 * already carried `aria-label="Toggle theme"`. This file locks `type="button"`
 * as the first attribute, the focus-visible class line as the last class line
 * before `className` in both `cn(...)` blocks, `aria-hidden="true"` on the
 * three icons, and the unchanged mount guard, handler, theme classes and
 * animation. No server function, RPC schema or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TOGGLE_FILE = join(ROOT, 'src', 'components', 'ui', 'theme-toggle.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const toggle = source(TOGGLE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The placeholder button, from `<button` after `if (!mounted)` to `</button>`. */
const placeholderStart = toggle.indexOf('<button', toggle.indexOf('if (!mounted)'));
assert.ok(placeholderStart > 0, 'the placeholder button is rendered');
const placeholderEnd = toggle.indexOf('</button>', placeholderStart) + '</button>'.length;
const PLACEHOLDER = toggle.slice(placeholderStart, placeholderEnd);

/** The real button, from the second `<button` to its `</button>`. */
const realStart = toggle.indexOf('<button', placeholderEnd);
assert.ok(realStart > 0, 'the real button is rendered');
const realEnd = toggle.indexOf('</button>', realStart) + '</button>'.length;
const REAL = toggle.slice(realStart, realEnd);

const FOCUS_LINE = "'focus-visible:outline-2 focus-visible:outline-primary',";

describe('ThemeToggle: both buttons are plain, focusable buttons', () => {
  it('starts the placeholder with type="button"', () => {
    assert.ok(PLACEHOLDER.startsWith('<button\n        type="button"'), 'type="button" is the first attribute');
  });

  it('starts the real button with type="button" before its handler', () => {
    assert.ok(REAL.startsWith('<button\n      type="button"'), 'type="button" is the first attribute');
    assert.ok(
      REAL.indexOf('type="button"') < REAL.indexOf('onClick='),
      'type sits before onClick',
    );
  });

  it('adds the focus-visible class line before className in both cn blocks', () => {
    for (const [name, button] of [
      ['placeholder', PLACEHOLDER],
      ['real', REAL],
    ] as const) {
      const focusAt = button.indexOf(FOCUS_LINE);
      const classNameAt = button.indexOf('className', focusAt);
      assert.ok(focusAt > 0, `${name}: the focus line is rendered`);
      assert.ok(focusAt < classNameAt, `${name}: the focus line sits before className`);
      const between = button.slice(focusAt + FOCUS_LINE.length, classNameAt);
      assert.equal(
        between.replace(/[\s,]/g, ''),
        '',
        `${name}: only the className prop follows`,
      );
    }
  });
});

describe('ThemeToggle: the toggle keeps its behaviour', () => {
  it('keeps the handler and its label on the real button', () => {
    assert.ok(
      REAL.includes("onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}"),
      'the toggle handler stays',
    );
    assert.ok(
      REAL.indexOf('className=') < REAL.indexOf('aria-label="Toggle theme"'),
      'aria-label stays after className',
    );
    assert.equal(count(toggle, /aria-label="Toggle theme"/g), 1, 'the label stays once');
  });

  it('keeps the mount guard and the exact theme classes', () => {
    assert.ok(toggle.includes('const [mounted, setMounted] = React.useState(false);'), 'mounted stays');
    assert.ok(toggle.includes('if (!mounted) {'), 'the placeholder guard stays');
    assert.ok(
      toggle.includes('React.useEffect(() => {\n    setMounted(true);\n  }, []);'),
      'the mount effect stays',
    );
    assert.ok(
      PLACEHOLDER.includes(
        "'relative h-9 w-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/20'",
      ),
      'the placeholder classes stay',
    );
    assert.ok(
      REAL.includes("'relative h-9 w-9 rounded-full backdrop-blur-sm border'"),
      'the real base classes stay',
    );
    assert.ok(REAL.includes("'hover:scale-110 active:scale-95'"), 'the scale classes stay');
    assert.ok(
      REAL.includes("? 'bg-white/10 border-white/20 hover:bg-white/20'"),
      'the dark theme classes stay',
    );
    assert.ok(
      REAL.includes(": 'bg-black/5 border-black/10 hover:bg-black/10'"),
      'the light theme classes stay',
    );
  });

  it('hides all three decorative icons without touching their styling', () => {
    assert.ok(
      PLACEHOLDER.includes('<Sun className="h-4 w-4 text-foreground/50" aria-hidden="true" />'),
      'the placeholder sun is hidden',
    );
    assert.equal(count(REAL, /aria-hidden="true"/g), 2, 'both real icons are hidden');
    assert.equal(count(toggle, /style=\{\{ position: 'absolute' \}\}/g), 2, 'the absolute icons stay');
    assert.ok(REAL.includes("'h-4 w-4 transition-all duration-500',"), 'the icon animation stays');
  });
});

describe('ThemeToggle: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(toggle, /type="button"/g), 2, 'both buttons are plain buttons');
    assert.equal(count(toggle, /<button/g), 2, 'there are two buttons');
    assert.equal(count(toggle, /aria-label=/g), 1, 'the real button keeps one label');
    assert.equal(count(toggle, /aria-hidden/g), 3, 'the three decorative icons are hidden');
    assert.equal(count(toggle, /focus-visible/g), 4, 'two focus classes per button');
    assert.equal(count(toggle, /className=\{cn\(/g), 4, 'two button and two icon class blocks stay');
    assert.equal(count(toggle, /className="sr-only"/g), 0, 'no sr-only helper is added');
    assert.equal(count(toggle, /aria-busy/g), 0, 'no busy state is added');
    assert.equal(count(toggle, /aria-live/g), 0, 'no live region is added');
    assert.equal(count(toggle, /role=/g), 0, 'no role is added');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(toggle),
      false,
      'the component adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('focus-visible:outline-primary'), false, `${file} gained theme focus styles`);
    }
  });
});
