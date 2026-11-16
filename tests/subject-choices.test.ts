/**
 * Direct unit tests for `src/components/SubjectChoices.tsx` — the checkbox row
 * ("Mathematics · 6 concepts") shared by onboarding and the "Change subjects"
 * editor on the Today panel. Until now only the Playwright smoke test saw it,
 * so the markup, the singular/plural count, the SSR escaping and the
 * presentational wiring (no hooks, no data access) were unlocked.
 *
 * Node's type stripping does not transform JSX, so the component is transpiled
 * in memory with the repo's own TypeScript and loaded from a `data:` URL; the
 * `@/` alias and the React runtime specifiers are rewritten to absolute file
 * URLs. The component file itself is not changed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'SubjectChoices.tsx');
const ONBOARDING_FILE = join(SRC_DIR, 'components', 'Onboarding.tsx');
const FOCUS_EDITOR_FILE = join(SRC_DIR, 'components', 'FocusEditor.tsx');
const ONBOARDING_TEST = join(import.meta.dirname, 'onboarding.test.ts');

interface DomainCount {
  domain: string;
  count: number;
}

interface SubjectChoicesProps {
  domains: DomainCount[];
  chosen: string[];
  onToggle: (domain: string, on: boolean) => void;
  disabled?: boolean;
}

/**
 * Transpile the real component (JSX included) and import it without a DOM,
 * bundler or alias resolver. `import.meta.resolve` keeps the React runtime
 * pointing at the same copy the test already loaded.
 */
async function loadSubjectChoices(): Promise<ComponentType<SubjectChoicesProps>> {
  const source = readFileSync(COMPONENT_FILE, 'utf8');
  const js = ts.transpileModule(source, {
    fileName: COMPONENT_FILE,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const linked = js
    .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
    .replaceAll(
      "'@/lib/onboarding'",
      JSON.stringify(pathToFileURL(join(SRC_DIR, 'lib', 'onboarding.ts')).href),
    );
  const url = `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
  const module = (await import(url)) as { SubjectChoices: ComponentType<SubjectChoicesProps> };
  return module.SubjectChoices;
}

const SubjectChoices = await loadSubjectChoices();

function render(props: Partial<SubjectChoicesProps> = {}): string {
  return renderToStaticMarkup(
    createElement(SubjectChoices, {
      domains: [],
      chosen: [],
      onToggle: () => {},
      ...props,
    }),
  );
}

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

function labels(html: string): string[] {
  return [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map((m) => m[1]);
}

function inputs(html: string): string[] {
  return [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
}

function counts(html: string): string[] {
  return [...html.matchAll(/<span class="text-xs text-muted-foreground">([^<]*)<\/span>/g)].map(
    (m) => m[1],
  );
}

/** Read the visible text of a rendered fragment (SSR escapes entities). */
function visibleText(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

describe('SubjectChoices rendering', () => {
  it('renders one label per domain in order with the exact counts and checked box', () => {
    const html = render({
      domains: [
        { domain: 'mathematics', count: 6 },
        { domain: 'computer-science', count: 1 },
        { domain: 'art_history', count: 0 },
      ],
      chosen: ['computer-science'],
    });

    assert.equal((html.match(/<label\b/g) ?? []).length, 3);
    assert.deepEqual(counts(html), ['6 concepts', '1 concept', '0 concepts']);
    assert.deepEqual(labels(html).map(visibleText), [
      'Mathematics6 concepts',
      'Computer science1 concept',
      'Art history0 concepts',
    ]);

    const order = ['Mathematics', 'Computer science', 'Art history'].map((label) =>
      html.indexOf(label),
    );
    assert.ok(order[0] < order[1] && order[1] < order[2], 'domains keep the caller order');

    const boxes = inputs(html);
    assert.equal(boxes.length, 3);
    assert.ok(boxes.every((box) => box.includes('type="checkbox"')));
    assert.equal(boxes[0].includes('checked'), false);
    // React SSR renders the boolean attribute as `checked=""`.
    assert.ok(boxes[1].includes('checked=""'));
    assert.equal(boxes[2].includes('checked'), false);
  });

  it('leaves unlisted and duplicate choices unchecked and renders an empty list as no labels', () => {
    const html = render({
      domains: [
        { domain: 'alpha', count: 2 },
        { domain: 'beta', count: 0 },
      ],
      chosen: ['alpha', 'alpha', 'not-a-domain'],
    });
    const boxes = inputs(html);
    assert.equal((html.match(/<label\b/g) ?? []).length, 2, 'duplicates never add labels');
    assert.ok(boxes[0].includes('checked=""'));
    assert.equal(boxes[1].includes('checked'), false);
    assert.deepEqual(counts(html), ['2 concepts', '0 concepts']);

    assert.equal(
      render({ domains: [] }),
      '<div class="mt-2 flex flex-wrap gap-2"></div>',
      'an empty domain list renders the wrapper only',
    );
    assert.equal(labels(render({ domains: [], chosen: ['alpha'] })).length, 0);
  });

  it('mirrors the disabled flag onto every checkbox only when true', () => {
    const domains = [
      { domain: 'alpha', count: 2 },
      { domain: 'beta', count: 1 },
    ];
    for (const props of [{}, { disabled: false }]) {
      const boxes = inputs(render({ domains, ...props }));
      assert.equal(boxes.length, 2);
      assert.ok(boxes.every((box) => box.includes('disabled') === false));
    }

    const disabledBoxes = inputs(render({ domains, chosen: ['alpha'], disabled: true }));
    assert.equal(disabledBoxes.length, 2);
    assert.ok(disabledBoxes.every((box) => box.includes('disabled=""')));
  });

  it('does not call onToggle while rendering on the server', () => {
    let calls = 0;
    const html = render({
      domains: [
        { domain: 'alpha', count: 1 },
        { domain: 'beta', count: 0 },
      ],
      chosen: ['alpha'],
      onToggle: () => {
        calls += 1;
      },
    });
    assert.equal(inputs(html).length, 2);
    assert.equal(calls, 0);
  });
});

describe('SubjectChoices escaping', () => {
  it('escapes HTML in domain names and still reads -/_ labels on screen', () => {
    const html = render({
      domains: [
        { domain: '<b>x</b>', count: 1 },
        { domain: 'a&b', count: 0 },
        { domain: 'computer-science', count: 2 },
        { domain: 'art_history', count: 1 },
        { domain: '_music_', count: 3 },
        { domain: '', count: 0 },
      ],
      chosen: ['<b>x</b>'],
    });

    assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
    assert.equal(html.includes('<b>x</b>'), false, 'no raw HTML from a domain name');
    assert.ok(html.includes('A&amp;b'));
    assert.equal(html.includes('a&b'), false);

    assert.deepEqual(labels(html).map(visibleText), [
      '<b>x</b>1 concept',
      'A&b0 concepts',
      'Computer science2 concepts',
      'Art history1 concept',
      'Music3 concepts',
      '0 concepts',
    ]);
    // The raw HTML element belongs to the label, never to the domain text.
    assert.equal((html.match(/<b>/g) ?? []).length, 0);
  });
});

describe('SubjectChoices wiring', () => {
  it('stays presentational: one helper import, no hooks/router/database access', () => {
    const component = source(COMPONENT_FILE);
    const imports = component
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));
    assert.deepEqual(imports, ["import { domainLabel } from '@/lib/onboarding';"]);
    assert.doesNotMatch(component, /\brequire\s*\(/);
    assert.doesNotMatch(
      component,
      /\b(?:useState|useEffect|useMemo|useContext|useDB|useRouteContext)\b/,
    );
    assert.doesNotMatch(component, /@tanstack|DBContext|fetch\s*\(/);
    assert.ok(component.includes('onChange={(e) => onToggle(domain, e.target.checked)}'));
    assert.equal((component.match(/<input\b/g) ?? []).length, 1);
    assert.equal((component.match(/<label\b/g) ?? []).length, 1);
    assert.equal((component.match(/^export function SubjectChoices\b/gm) ?? []).length, 1);
  });

  it('keeps both parents on the shared component and the earlier onboarding tests intact', () => {
    for (const file of [ONBOARDING_FILE, FOCUS_EDITOR_FILE]) {
      const parent = source(file);
      assert.ok(
        parent.includes("import { SubjectChoices } from '@/components/SubjectChoices';"),
        file,
      );
      assert.ok(
        parent.includes('<SubjectChoices domains={domains} chosen={chosen} onToggle={toggle}'),
        file,
      );
    }
    assert.ok(
      source(ONBOARDING_FILE).includes(
        '<SubjectChoices domains={domains} chosen={chosen} onToggle={toggle} />',
      ),
      'onboarding does not disable the boxes',
    );
    assert.match(
      source(FOCUS_EDITOR_FILE),
      /<SubjectChoices domains=\{domains\} chosen=\{chosen\} onToggle=\{toggle\} disabled=\{saving\} \/>/,
      'the Today editor disables the boxes while saving',
    );

    const anchor = source(ONBOARDING_TEST);
    for (const title of [
      'lists distinct domains with counts, sorted',
      'stores the chosen subjects as tags and reads them back',
      'basics = concepts of the chosen subjects without a prerequisite',
      'changing subjects keeps other tags and the plan follows the new subject',
      'needs no RPC method, table, column or migration',
    ]) {
      assert.ok(anchor.includes(title), title);
    }
    // The file ends with a newline; the task spec's "281" counts that empty tail.
    assert.equal(anchor.trimEnd().split('\n').length, 280);
  });
});
