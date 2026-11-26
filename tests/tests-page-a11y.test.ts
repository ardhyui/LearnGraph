/**
 * Tests page: group open state and test results are readable without sight.
 *
 * Every test group is a toggle whose state only showed as a rotating chevron,
 * and every test row announced just its name — "Create learner profile" never
 * said whether it passed or had not run. The whole page's icons were announced
 * too. This file locks the two real fixes — aria-expanded/aria-controls on the
 * group headers with a matching content id, and an exact `sr-only` word for
 * each status — plus the hidden decorations, the group order, and the fact that
 * the run status line is the one live region and no focus handling, server
 * function, RPC or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'tests.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');
const SMOKE_FILE = join(ROOT, 'scripts', 'smoke.mjs');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const onceIn = (text: string, literal: string, where: string) =>
  assert.equal(text.split(literal).length - 1, 1, `${literal} appears once in ${where}`);

const block = (start: string, end: string) => {
  const from = page.indexOf(start);
  const to = page.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} block is found`);
  return page.slice(from, to);
};

const statusHelper = block('function statusLabel', 'function getStatusIcon');
const statusIcon = block('function getStatusIcon', 'const getGroupStats');

describe('tests page: group headers announce their open state', () => {
  it('pairs aria-expanded and aria-controls with the content id it names', () => {
    onceIn(page, 'aria-expanded={isExpanded}', 'the page');
    onceIn(page, 'aria-controls={`tests-group-${groupIndex}`}', 'the page');
    onceIn(page, 'id={`tests-group-${groupIndex}`}', 'the page');
    onceIn(page, 'const isExpanded = expandedGroups.has(groupIndex);', 'the page');

    // The id sits on the motion.div that AnimatePresence mounts for the group.
    const content = block('id={`tests-group-${groupIndex}`}', 'className="border-t border-border"');
    assert.match(content, /initial=\{\{ height: 0, opacity: 0 \}\}/);
    assert.match(content, /animate=\{\{ height: 'auto', opacity: 1 \}\}/);

    // aria-controls is on the button and points at that same content, which is
    // only rendered while the group is expanded (AnimatePresence contract).
    assert.ok(
      page.indexOf('aria-controls={`tests-group-${groupIndex}`}') <
        page.indexOf('id={`tests-group-${groupIndex}`}'),
      'the button names the content before the content is rendered',
    );
    assert.ok(
      page.includes('{isExpanded && (') &&
        page.indexOf('{isExpanded && (') <
          page.indexOf('id={`tests-group-${groupIndex}`}'),
      'the content id is inside the isExpanded branch',
    );
  });

  it('keeps the existing toggle contract and group order', () => {
    onceIn(page, 'onClick={() => toggleGroup(groupIndex)}', 'the group header');
    onceIn(
      page,
      'const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));',
      'the page',
    );

    const groups = [
      "name: 'Phase 1: Database Foundation',",
      "name: 'Phase 1.5: Admin UI',",
      "name: 'Phase 2: Learner Model (Psychometrics)',",
      "name: 'Phase 3: Knowledge Model (Graph B)',",
      "name: 'Phase 3.5: Data Entry Documentation',",
      "name: 'Phase 4: ZPD Engine',",
      "name: 'Phase 5: Knowledge Gap Analysis',",
    ];
    let previous = -1;
    for (const line of groups) {
      const at = page.indexOf(line);
      assert.ok(at > previous, `${line} is present and keeps its order`);
      onceIn(page, line, 'the page');
      previous = at;
    }

    const firstGroup = block(
      "name: 'Phase 1: Database Foundation',",
      "name: 'Phase 1.5: Admin UI',",
    );
    assert.ok(
      firstGroup.includes("{ name: 'Create learner profile', status: 'pending' },"),
      'the first test keeps its name and pending state',
    );
    assert.equal(
      count(firstGroup, /\{ name: /g),
      15,
      'the first group still has fifteen tests, as the smoke check expects',
    );

    // The Playwright smoke check toggles the same first group and counts the
    // "Not run" words inside it.
    const smoke = source(SMOKE_FILE);
    assert.ok(smoke.includes('tests: group headers announce open state and results are named in text'));
    assert.ok(smoke.includes("if (path === '/tests')"));
    assert.ok(smoke.includes("=== 'Not run'"));
  });
});

describe('tests page: every result has a text equivalent', () => {
  it('maps the four statuses to the four exact sr-only words', () => {
    assert.ok(statusHelper.includes("case 'passed':\n        return 'Passed';"), 'passed label');
    assert.ok(statusHelper.includes("case 'failed':\n        return 'Failed';"), 'failed label');
    assert.ok(statusHelper.includes("case 'running':\n        return 'Running';"), 'running label');
    assert.ok(statusHelper.includes("default:\n        return 'Not run';"), 'default label');

    // Both the icon and the word read the same `test.status` value.
    assert.equal(count(statusHelper, /switch \(status\)/g), 1);
    onceIn(page, '{statusLabel(test.status)}', 'the page');

    // The word follows its icon in source order, where the row is drawn.
    assert.match(
      page,
      /\{getStatusIcon\(test\.status\)\}\r?\n\s+<span className="sr-only">\{statusLabel\(test\.status\)\}<\/span>/,
    );
    assert.equal(count(page, /className="sr-only"/g), 2);
  });

  it('keeps the four status icons with their size and classes', () => {
    assert.ok(
      statusIcon.includes(
        '<CheckCircle size={16} className="text-emerald-500" aria-hidden="true" />',
      ),
      'passed icon',
    );
    assert.ok(
      statusIcon.includes('<XCircle size={16} className="text-red-500" aria-hidden="true" />'),
      'failed icon',
    );
    assert.ok(
      statusIcon.includes(
        '<RefreshCw size={16} className="text-blue-500 animate-spin" aria-hidden="true" />',
      ),
      'running icon',
    );
    assert.ok(
      statusIcon.includes(
        '<Clock size={16} className="text-muted-foreground" aria-hidden="true" />',
      ),
      'not-run icon',
    );
    assert.equal(count(statusIcon, /return <(?:CheckCircle|XCircle|RefreshCw|Clock)\b/g), 4);
    assert.equal(count(statusIcon, /aria-hidden="true"/g), 4);
  });
});

describe('tests page: decorative icons are hidden', () => {
  it('hides all nine icons without changing size or classes', () => {
    const icons =
      page.match(
        /<(?:FlaskConical|Play|ChevronRight|CheckCircle|XCircle|RefreshCw|Clock|Layers|AlertCircle)\b[^>]*>/g,
      ) ?? [];
    assert.equal(icons.length, 9, 'the page still renders nine icons');
    for (const icon of icons) {
      assert.ok(icon.includes('aria-hidden="true"'), `hidden: ${icon}`);
    }

    for (const tag of [
      '<FlaskConical className="w-6 h-6 text-white" aria-hidden="true" />',
      '<Play size={20} className={isRunning ? \'animate-pulse\' : \'\'} aria-hidden="true" />',
      '<ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />',
      '<Layers className="w-5 h-5 text-muted-foreground mt-0.5" aria-hidden="true" />',
      '<AlertCircle className="w-8 h-8 mx-auto mb-3" aria-hidden="true" />',
    ]) {
      onceIn(page, tag, 'the page');
    }

    assert.equal(count(page, /aria-hidden="true"/g), 9);
  });
});

describe('tests page: no new semantics or data path', () => {
  it('adds exactly one live region and no focus handling or extra control', () => {
    assert.equal(count(page, /aria-live/g), 1, 'only the run-tests status line is a live region');
    assert.equal(count(page, /\brole=/g), 1, 'only the run-tests status line carries a role');
    assert.ok(
      page.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the single live region is the polite run-tests status line',
    );
    assert.doesNotMatch(page, /tabIndex|tabindex/);
    assert.doesNotMatch(page, /\.focus\(/);
  });

  it('keeps the run button, summary and reading path intact', () => {
    onceIn(page, 'onClick={runAllTests}', 'the page');
    onceIn(page, 'disabled={isRunning}', 'the page');
    assert.ok(page.includes("{isRunning ? 'Running Tests...' : 'Run All Tests'}"));
    for (const label of ['Total Tests', 'Passed', 'Failed']) {
      assert.ok(
        page.includes(`>${label}</div>`),
        `the summary still shows ${label}`,
      );
    }
    onceIn(page, '<h3 className="font-semibold text-foreground mb-2">Test Coverage</h3>', 'the page');
  });

  it('adds no server function, RPC call or migration', () => {
    assert.doesNotMatch(page, /createServerFn|graphCall|rpc-schemas/);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Not run'), false, `${file} gained status copy`);
      assert.equal(other.includes('Functional Tests'), false, `${file} gained page markup`);
    }
  });
});
