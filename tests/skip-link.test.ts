/**
 * Direct unit tests for `src/components/SkipLink.tsx` — the "Skip to content"
 * link (WCAG 2.4.1) rendered as the first child of `<body>` in
 * `src/routes/__root.tsx`. Until now only the Playwright smoke test saw it, so
 * the markup, the hidden-until-focused classes and the focus-moving click
 * handler were unlocked.
 *
 * Node's type stripping does not transform JSX, so the component is transpiled
 * in memory with the repo's own TypeScript and loaded from a `data:` URL; the
 * React runtime specifier is rewritten to an absolute file URL. The component
 * file itself is not changed. The handler is exercised against a mock
 * `document`, installed per test and removed in `finally`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'SkipLink.tsx');
const ROOT_ROUTE_FILE = join(SRC_DIR, 'routes', '__root.tsx');
const SMOKE_FILE = join(ROOT, 'scripts', 'smoke.mjs');

interface SkipLinkElementProps {
  href: string;
  onClick: (event: { preventDefault(): void }) => void;
  className: string;
  children: string;
}

type SkipLinkComponent = () => ReactElement<SkipLinkElementProps>;

/**
 * Transpile the real component (JSX included) and import it without a DOM,
 * bundler or alias resolver. `import.meta.resolve` keeps the React runtime
 * pointing at the same copy the test already loaded.
 */
async function loadSkipLink(): Promise<{
  component: SkipLinkComponent;
  exported: string[];
}> {
  const source = readFileSync(COMPONENT_FILE, 'utf8');
  const js = ts.transpileModule(source, {
    fileName: COMPONENT_FILE,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const linked = js.replaceAll(
    '"react/jsx-runtime"',
    JSON.stringify(import.meta.resolve('react/jsx-runtime')),
  );
  const url = `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
  const module = (await import(url)) as { SkipLink: SkipLinkComponent };
  return { component: module.SkipLink, exported: Object.keys(module) };
}

const { component: SkipLink, exported: skipLinkExports } = await loadSkipLink();

function render(): string {
  return renderToStaticMarkup(createElement(SkipLink));
}

function markupProps(): Record<string, unknown> {
  return SkipLink().props as unknown as Record<string, unknown>;
}

function clickHandler(): SkipLinkElementProps['onClick'] {
  return SkipLink().props.onClick;
}

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

type Call = unknown[];

interface MainMock {
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  focus(): void;
  scrollIntoView(options: { block: string }): void;
}

interface DocumentMock {
  querySelector(selector: string): MainMock | null;
}

interface Globals {
  document?: DocumentMock;
}

/**
 * Install a mock `document` for one handler run. `tabindex: null` models a
 * `<main>` without the attribute; a string models one that already has it.
 * The previous global (Node has none) is restored by `restore()`.
 */
function installDocument(
  found: boolean,
  tabindex: string | null,
): {
  calls: Call[];
  restore(): void;
} {
  const calls: Call[] = [];
  const main: MainMock = {
    hasAttribute(name) {
      calls.push(['hasAttribute', name]);
      return tabindex !== null && name === 'tabindex';
    },
    setAttribute(name, value) {
      calls.push(['setAttribute', name, value]);
    },
    focus() {
      calls.push(['focus']);
    },
    scrollIntoView(options) {
      calls.push(['scrollIntoView', options]);
    },
  };
  const globals = globalThis as unknown as Globals;
  const hadDocument = Object.hasOwn(globals, 'document');
  const previous = globals.document;
  globals.document = {
    querySelector(selector) {
      calls.push(['querySelector', selector]);
      return found ? main : null;
    },
  };
  return {
    calls,
    restore() {
      if (hadDocument) globals.document = previous;
      else delete globals.document;
    },
  };
}

describe('SkipLink markup', () => {
  it('renders one anchor with the exact label, href and the hidden-until-focused classes', () => {
    const html = render();

    assert.equal((html.match(/<a\b/g) ?? []).length, 1, 'a single anchor');
    assert.equal((html.match(/<\/a>/g) ?? []).length, 1, 'a single closing tag');
    assert.match(html, /^<a href="#main" /);
    assert.match(html, />Skip to content<\/a>$/);
    assert.equal(html.replace(/<[^>]+>/g, ''), 'Skip to content', 'the visible text is exact');

    const classes = (html.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/);
    assert.equal(classes[0], 'sr-only', 'hidden by default');
    assert.equal(classes[1], 'focus:not-sr-only', 'revealed on focus');
    assert.ok(classes.includes('focus:fixed'), 'shown in place when focused');

    assert.equal(html.includes('target='), false, 'no target attribute');
    assert.equal(html.toLowerCase().includes('role='), false, 'no role attribute');
    assert.equal(html.toLowerCase().includes('tabindex='), false, 'no tabIndex attribute');
    assert.equal(html.toLowerCase().includes('onkeydown'), false, 'no key handler');

    const props = markupProps();
    assert.equal(props.href, '#main');
    assert.equal(props.children, 'Skip to content');
    assert.equal(typeof props.onClick, 'function');
    for (const name of ['target', 'role', 'tabIndex', 'onKeyDown']) {
      assert.equal(name in props, false, name);
    }
  });
});

describe('SkipLink click handler', () => {
  it('does nothing when the page has no main element', () => {
    const { calls, restore } = installDocument(false, null);
    let prevented = 0;
    try {
      clickHandler()({
        preventDefault() {
          prevented += 1;
        },
      });
    } finally {
      restore();
    }

    assert.equal(prevented, 0, 'no navigation is cancelled without a target');
    assert.deepEqual(calls, [['querySelector', 'main']], 'no attribute write, focus or scroll');
  });

  it('makes main focusable, focuses it and scrolls to the top when it has no tabindex', () => {
    const { calls, restore } = installDocument(true, null);
    let prevented = 0;
    try {
      clickHandler()({
        preventDefault() {
          prevented += 1;
          calls.push(['preventDefault']);
        },
      });
    } finally {
      restore();
    }

    assert.equal(prevented, 1);
    assert.deepEqual(calls, [
      ['querySelector', 'main'],
      ['preventDefault'],
      ['hasAttribute', 'tabindex'],
      ['setAttribute', 'tabindex', '-1'],
      ['focus'],
      ['scrollIntoView', { block: 'start' }],
    ]);
  });

  it('keeps an existing tabindex and still focuses and scrolls to main', () => {
    for (const tabindex of ['0', '-1']) {
      const { calls, restore } = installDocument(true, tabindex);
      let prevented = 0;
      try {
        clickHandler()({
          preventDefault() {
            prevented += 1;
            calls.push(['preventDefault']);
          },
        });
      } finally {
        restore();
      }

      assert.equal(prevented, 1, tabindex);
      assert.deepEqual(
        calls,
        [
          ['querySelector', 'main'],
          ['preventDefault'],
          ['hasAttribute', 'tabindex'],
          ['focus'],
          ['scrollIntoView', { block: 'start' }],
        ],
        `tabindex ${tabindex} is not overwritten`,
      );
    }
  });
});

describe('SkipLink wiring', () => {
  it('stays a type-only import with no hooks, router or data access', () => {
    const component = source(COMPONENT_FILE);
    const imports = component
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));
    assert.deepEqual(imports, ["import type { MouseEvent } from 'react';"]);
    assert.doesNotMatch(component, /\brequire\s*\(/);
    assert.doesNotMatch(
      component,
      /\b(?:useState|useEffect|useMemo|useContext|useDB|useRouteContext)\b/,
    );
    assert.doesNotMatch(component, /@tanstack|DBContext|fetch\s*\(|localStorage/);
    assert.ok(component.includes("const main = document.querySelector('main');"));
    assert.equal((component.match(/<a\b/g) ?? []).length, 1);
    assert.equal((component.match(/^export function SkipLink\b/gm) ?? []).length, 1);
    assert.deepEqual(skipLinkExports, ['SkipLink']);
  });

  it('is the first child of body in the root route before the providers and announcer', () => {
    const root = source(ROOT_ROUTE_FILE);
    const lines = root.trimEnd().split('\n');
    const bodyIndex = lines.findIndex((line) => line.trim().startsWith('<body '));
    assert.ok(bodyIndex >= 0, 'the root document has a body');
    assert.equal(lines[bodyIndex + 1].trim(), '<SkipLink />', 'skip link comes first');

    const themeIndex = lines.findIndex((line) =>
      line.includes('<ThemeProvider>{children}</ThemeProvider>'),
    );
    const announcerIndex = lines.findIndex((line) => line.includes('<RouteAnnouncer />'));
    assert.ok(themeIndex > bodyIndex + 1, 'it precedes the theme provider');
    assert.ok(announcerIndex > themeIndex, 'it precedes the route announcer');
    assert.equal((root.match(/<SkipLink \/>/g) ?? []).length, 1, 'rendered exactly once');
    assert.ok(root.includes("import { SkipLink } from '@/components/SkipLink';"));

    // Probe note: the files end with a newline, so `trimEnd()` is required.
    assert.equal(lines.length, 90);
  });

  it('keeps the Playwright smoke check for the first Tab stop intact', () => {
    const smoke = source(SMOKE_FILE);
    assert.ok(smoke.includes('a11y: "Skip to content" is the first Tab stop'));
    assert.ok(smoke.includes("await page.keyboard.press('Tab');"));
    assert.ok(smoke.includes("await page.keyboard.press('Enter');"));
    assert.equal(smoke.trimEnd().split('\n').length, 2159);
  });
});
